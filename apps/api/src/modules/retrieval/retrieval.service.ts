import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '@/database/prisma.service';
import { EmbeddingsService } from '@/modules/embeddings/embeddings.service';
import { GEMINI_CLIENT } from '@/modules/embeddings/embeddings.constants';

interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
}

// SSE event types for structured streaming
type SseEventType =
  | { type: 'sources'; sources: Omit<RetrievedChunk, 'content'>[] }
  | { type: 'delta'; content: string }
  | { type: 'done'; tokensUsed: number; latencyMs: number }
  | { type: 'error'; message: string };

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly chatModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    @Inject(GEMINI_CLIENT) private readonly ai: GoogleGenAI,
    private readonly config: ConfigService,
  ) {
    this.chatModel = this.config.get<string>(
      'OPENAI_CHAT_MODEL',
      'gemini-2.0-flash',
    );
  }

  /**
   * Main RAG query — returns Observable<MessageEvent> for NestJS @Sse()
   * Flow: embed query → pgvector search → build context → stream Gemini response
   */
  queryStream(
    workspaceId: string,
    query: string,
    topK = 5,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const startTime = Date.now();

      (async () => {
        try {
          // 1. Embed query using RETRIEVAL_QUERY task type
          const queryVector = await this.embeddings.embedQuery(query);
          // Format vector as PostgreSQL array string
          const vectorString = `[${queryVector.join(',')}]`;

          // 2. pgvector cosine similarity search
          const chunks = await this.prisma.$queryRaw<RetrievedChunk[]>`
            SELECT
              dc.id              AS "chunkId",
              dc.document_id     AS "documentId",
              d.original_name    AS "documentName",
              dc.content         AS "content",
              1 - (dc.embedding <=> ${vectorString}::vector) AS "score"
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE dc.workspace_id = ${workspaceId}
              AND d.status = 'COMPLETED'
              AND dc.embedding IS NOT NULL
            ORDER BY dc.embedding <=> ${vectorString}::vector
            LIMIT ${topK}
          `;

          if (chunks.length === 0) {
            observer.next({
              data: JSON.stringify({
                type: 'error',
                message: 'No relevant documents found in this workspace.',
              } satisfies SseEventType),
            });
            observer.complete();
            return;
          }

          // 3. Send sources to client first
          observer.next({
            data: JSON.stringify({
              type: 'sources',
              sources: chunks.map((c) => ({
                chunkId: c.chunkId,
                documentId: c.documentId,
                documentName: c.documentName,
                score: Number(c.score),
              })),
            } satisfies SseEventType),
          });

          // 4. Build context string
          const context = chunks
            .map(
              (c, i) =>
                `[Source ${i + 1}: ${c.documentName}]\n${c.content}`,
            )
            .join('\n\n---\n\n');

          // 5. Stream from Gemini
          const stream = await this.ai.models.generateContentStream({
            model: this.chatModel,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `You are a helpful assistant. Answer based ONLY on the provided context.
If the answer is not in the context, say "I don't have information about that in the provided documents."
Be concise and accurate.

Context:
${context}

Question: ${query}`,
                  },
                ],
              },
            ],
          });

          // 6. Stream chunks to client
          let fullAnswer = '';
          let totalTokens = 0;

          for await (const chunk of stream) {
            const delta = chunk.text ?? '';
            if (delta) {
              fullAnswer += delta;
              observer.next({
                data: JSON.stringify({
                  type: 'delta',
                  content: delta,
                } satisfies SseEventType),
              });
            }

            // Accumulate token usage if available
            if (chunk.usageMetadata?.totalTokenCount) {
              totalTokens = chunk.usageMetadata.totalTokenCount;
            }
          }

          const latencyMs = Date.now() - startTime;

          // 7. Send done event
          observer.next({
            data: JSON.stringify({
              type: 'done',
              tokensUsed: totalTokens,
              latencyMs,
            } satisfies SseEventType),
          });

          // 8. Save to query history (fire and forget)
          this.prisma.queryHistory
            .create({
              data: {
                workspaceId,
                query,
                answer: fullAnswer,
                sources: chunks.map((c) => ({
                  chunkId: c.chunkId,
                  documentId: c.documentId,
                  score: Number(c.score),
                })),
                tokensUsed: totalTokens,
                latencyMs,
              },
            })
            .catch((err) =>
              this.logger.error('Failed to save query history', err),
            );

          observer.complete();
        } catch (error) {
          this.logger.error('Query stream error', error);
          observer.next({
            data: JSON.stringify({
              type: 'error',
              message: 'An error occurred while processing your query.',
            } satisfies SseEventType),
          });
          observer.complete();
        }
      })();
    });
  }

  /**
   * Non-streaming query — used by eval pipeline
   */
  async queryOnce(workspaceId: string, query: string, topK = 5): Promise<string> {
    const queryVector = await this.embeddings.embedQuery(query);
    // Format vector as PostgreSQL array string
    const vectorString = `[${queryVector.join(',')}]`;

    const chunks = await this.prisma.$queryRaw<RetrievedChunk[]>`
      SELECT
        dc.id           AS "chunkId",
        dc.document_id  AS "documentId",
        d.original_name AS "documentName",
        dc.content      AS "content",
        1 - (dc.embedding <=> ${vectorString}::vector) AS "score"
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.workspace_id = ${workspaceId}
        AND d.status = 'COMPLETED'
        AND dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> ${vectorString}::vector
      LIMIT ${topK}
    `;

    if (chunks.length === 0) return 'No relevant documents found.';

    const context = chunks
      .map((c, i) => `[Source ${i + 1}: ${c.documentName}]\n${c.content}`)
      .join('\n\n---\n\n');

    const response = await this.ai.models.generateContent({
      model: this.chatModel,
      contents: `Answer based ONLY on this context:\n${context}\n\nQuestion: ${query}`,
    });

    return response.text ?? '';
  }

  async getQueryHistory(workspaceId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.queryHistory.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          query: true,
          answer: true,
          sources: true,
          tokensUsed: true,
          latencyMs: true,
          createdAt: true,
        },
      }),
      this.prisma.queryHistory.count({ where: { workspaceId } }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}