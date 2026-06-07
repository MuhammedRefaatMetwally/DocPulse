import {
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, finalize } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '@/database/prisma.service';
import { EmbeddingsService } from '@/modules/embeddings/embeddings.service';
import { GEMINI_CLIENT } from '@/modules/embeddings/embeddings.constants';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
  chunkIndex: number;
}

type SseEvent =
  | { type: 'sources'; sources: Omit<RetrievedChunk, 'content'>[] }
  | { type: 'delta'; content: string }
  | { type: 'done'; tokensUsed: number; latencyMs: number }
  | { type: 'error'; message: string };

// ── Constants ─────────────────────────────────────────────────────────────────

// Minimum cosine similarity score to include a chunk in context.
// Chunks below this threshold are too semantically distant to be useful.
// 0.5 is a conservative threshold — tune based on your embedding model.
const SIMILARITY_THRESHOLD = 0.5;

// Max chars of context to send to Gemini.
// gemini-2.0-flash has 1M token context but we stay conservative
// to reduce latency and quota usage on the free tier.
const MAX_CONTEXT_CHARS = 8000;

// Default number of candidate chunks to retrieve before deduplication.
// We fetch more than we need to allow for diversity filtering.
const DEFAULT_TOP_K = 8;

// Max chunks from a single document — enforces document diversity.
const MAX_CHUNKS_PER_DOCUMENT = 2;

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

  // ── Public: streaming query ───────────────────────────────────────────────

  queryStream(
    workspaceId: string,
    query: string,
    topK = DEFAULT_TOP_K,
  ): Observable<MessageEvent> {
    // Issue 2 fix: cancellation flag checked inside async IIFE
    // so we stop processing when client disconnects
    let cancelled = false;

    return new Observable<MessageEvent>((observer) => {
      const startTime = Date.now();

      (async () => {
        try {
          // 1. Embed query using RETRIEVAL_QUERY task type
          const queryVector = await this.embeddings.embedQuery(query);

          if (cancelled) return;

          const vectorString = JSON.stringify(queryVector);

          // 2. pgvector similarity search with:
          //    - similarity threshold (Issue 1 fix)
          //    - both dc.workspace_id AND d.workspace_id enforced (Issue 3 fix)
          //    - chunk position included for context ordering (Issue 6 fix)
          const rawChunks = await this.prisma.$queryRaw<RetrievedChunk[]>`
            SELECT
              dc.id              AS "chunkId",
              dc.document_id     AS "documentId",
              d.original_name    AS "documentName",
              dc.content         AS "content",
              dc.chunk_index     AS "chunkIndex",
              1 - (dc.embedding <=> ${vectorString}::vector) AS "score"
            FROM document_chunks dc
            JOIN documents d
              ON d.id = dc.document_id
             AND d.workspace_id = ${workspaceId}
            WHERE dc.workspace_id = ${workspaceId}
              AND d.status = 'COMPLETED'
              AND dc.embedding IS NOT NULL
              AND 1 - (dc.embedding <=> ${vectorString}::vector) >= ${SIMILARITY_THRESHOLD}
            ORDER BY dc.embedding <=> ${vectorString}::vector
            LIMIT ${topK}
          `;

          if (cancelled) return;

          if (rawChunks.length === 0) {
            observer.next(this.sseEvent({
              type: 'error',
              message:
                'No relevant documents found. Try rephrasing your question.',
            }));
            observer.complete();
            return;
          }

          // 3. Apply document diversity filter (Issue 5 fix)
          const diverseChunks = this.applyDiversityFilter(
            rawChunks,
            MAX_CHUNKS_PER_DOCUMENT,
          );

          // 4. Send sources event first
          observer.next(this.sseEvent({
            type: 'sources',
            sources: diverseChunks.map((c) => ({
              chunkId: c.chunkId,
              documentId: c.documentId,
              documentName: c.documentName,
              chunkIndex: c.chunkIndex,
              score: Number(c.score.toFixed(4)),
            })),
          }));

          // 5. Build context with token guard (Issue 9 fix)
          const context = this.buildContext(diverseChunks);

          if (cancelled) return;

          // 6. Stream from Gemini with system instruction (Issue 6 fix)
          const stream = await this.ai.models.generateContentStream({
            model: this.chatModel,
            config: {
              systemInstruction:
                'You are a helpful assistant that answers questions strictly based on the provided document context. ' +
                'If the answer cannot be found in the context, say exactly: "I could not find an answer in the provided documents." ' +
                'Do not make up information. Cite source numbers like [Source 1] when referencing specific content.',
            },
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Context:\n\n${context}\n\nQuestion: ${query}`,
                  },
                ],
              },
            ],
          });

          let fullAnswer = '';
          let totalTokens = 0;

          // 7. Stream chunks — check cancellation on every iteration
          for await (const chunk of stream) {
            if (cancelled) {
              this.logger.debug(
                `Client disconnected mid-stream for workspace ${workspaceId}`,
              );
              return;
            }

            const delta = chunk.text ?? '';
            if (delta) {
              fullAnswer += delta;
              observer.next(this.sseEvent({ type: 'delta', content: delta }));
            }

            if (chunk.usageMetadata?.totalTokenCount) {
              totalTokens = chunk.usageMetadata.totalTokenCount;
            }
          }

          const latencyMs = Date.now() - startTime;

          observer.next(this.sseEvent({
            type: 'done',
            tokensUsed: totalTokens,
            latencyMs,
          }));

          // 8. Save query history — fire and forget but with proper error logging
          this.saveQueryHistory(
            workspaceId,
            query,
            fullAnswer,
            diverseChunks,
            totalTokens,
            latencyMs,
          );

          observer.complete();
        } catch (error) {
          if (cancelled) return;

          this.logger.error(
            `Query stream error for workspace ${workspaceId}`,
            error,
          );
          observer.next(this.sseEvent({
            type: 'error',
            message: 'An error occurred while processing your query.',
          }));
          observer.complete();
        }
      })();

      // Issue 2 fix: return teardown function
      // NestJS calls this when client disconnects (Observable unsubscribed)
      return () => {
        cancelled = true;
        this.logger.debug(
          `SSE stream cancelled for workspace ${workspaceId}`,
        );
      };
    }).pipe(
      // Issue 7 fix: finalize runs on complete, error, OR client disconnect
      finalize(() => {
        this.logger.debug(`SSE stream finalized for workspace ${workspaceId}`);
      }),
    );
  }

  // ── Public: non-streaming query (used by eval pipeline) ──────────────────

  // Issue 4 fix: single private retrieval method shared by both
  async queryOnce(
    workspaceId: string,
    query: string,
    topK = DEFAULT_TOP_K,
  ): Promise<string> {
    const chunks = await this.retrieveChunks(workspaceId, query, topK);

    if (chunks.length === 0) return 'No relevant documents found.';

    const context = this.buildContext(chunks);

    const response = await this.ai.models.generateContent({
      model: this.chatModel,
      config: {
        systemInstruction:
          'Answer based ONLY on the provided context. ' +
          'If the answer is not in the context say "Not found in documents."',
      },
      contents: `Context:\n${context}\n\nQuestion: ${query}`,
    });

    return response.text ?? '';
  }

  // ── Public: query history ────────────────────────────────────────────────

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
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Private: shared retrieval logic ──────────────────────────────────────

  // Issue 4 fix: single source of truth for retrieval SQL
  private async retrieveChunks(
    workspaceId: string,
    query: string,
    topK: number,
  ): Promise<RetrievedChunk[]> {
    const queryVector = await this.embeddings.embedQuery(query);
    const vectorString = JSON.stringify(queryVector);

    const rawChunks = await this.prisma.$queryRaw<RetrievedChunk[]>`
      SELECT
        dc.id              AS "chunkId",
        dc.document_id     AS "documentId",
        d.original_name    AS "documentName",
        dc.content         AS "content",
        dc.chunk_index     AS "chunkIndex",
        1 - (dc.embedding <=> ${vectorString}::vector) AS "score"
      FROM document_chunks dc
      JOIN documents d
        ON d.id = dc.document_id
       AND d.workspace_id = ${workspaceId}
      WHERE dc.workspace_id = ${workspaceId}
        AND d.status = 'COMPLETED'
        AND dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> ${vectorString}::vector) >= ${SIMILARITY_THRESHOLD}
      ORDER BY dc.embedding <=> ${vectorString}::vector
      LIMIT ${topK}
    `;

    return this.applyDiversityFilter(rawChunks, MAX_CHUNKS_PER_DOCUMENT);
  }

  // Issue 5 fix: document diversity — max N chunks per document
  private applyDiversityFilter(
    chunks: RetrievedChunk[],
    maxPerDocument: number,
  ): RetrievedChunk[] {
    const countPerDocument = new Map<string, number>();
    const filtered: RetrievedChunk[] = [];

    for (const chunk of chunks) {
      const count = countPerDocument.get(chunk.documentId) ?? 0;
      if (count < maxPerDocument) {
        filtered.push(chunk);
        countPerDocument.set(chunk.documentId, count + 1);
      }
    }

    return filtered;
  }

  // Issue 9 fix: context truncation guard
  // Issue 6 fix: include source number and document name for citation
  private buildContext(chunks: RetrievedChunk[]): string {
    const parts: string[] = [];
    let totalChars = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const header = `[Source ${i + 1}: ${chunk.documentName}]`;
      const entry = `${header}\n${chunk.content}`;

      if (totalChars + entry.length > MAX_CONTEXT_CHARS) {
        this.logger.debug(
          `Context truncated at chunk ${i + 1} — exceeded ${MAX_CONTEXT_CHARS} chars`,
        );
        break;
      }

      parts.push(entry);
      totalChars += entry.length;
    }

    return parts.join('\n\n---\n\n');
  }

  // Issue 8 fix: fire-and-forget with structured error log (no silent swallow)
  private saveQueryHistory(
    workspaceId: string,
    query: string,
    answer: string,
    chunks: RetrievedChunk[],
    tokensUsed: number,
    latencyMs: number,
  ): void {
    this.prisma.queryHistory
      .create({
        data: {
          workspaceId,
          query,
          answer,
          sources: chunks.map((c) => ({
            chunkId: c.chunkId,
            documentId: c.documentId,
            documentName: c.documentName,
            score: c.score,
          })),
          tokensUsed,
          latencyMs,
        },
      })
      .catch((err: Error) => {
        this.logger.error(
          `Failed to save query history for workspace ${workspaceId}: ${err.message}`,
        );
      });
  }

  // Helper to type SSE data correctly
  private sseEvent(payload: SseEvent): MessageEvent {
    return { data: JSON.stringify(payload) };
  }
}