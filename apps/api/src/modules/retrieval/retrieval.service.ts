import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '@/database/prisma.service';
import { EmbeddingsService } from '@/modules/embeddings/embeddings.service';
import { GROQ_CLIENT } from './groq.constants';

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

const SIMILARITY_THRESHOLD = 0.5;
const MAX_CONTEXT_CHARS = 8000;
const DEFAULT_TOP_K = 8;
const MAX_CHUNKS_PER_DOCUMENT = 2;

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly chatModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    @Inject(GROQ_CLIENT) private readonly groq: OpenAI,
    private readonly config: ConfigService,
  ) {
    this.chatModel = this.config.get<string>(
      'GROQ_CHAT_MODEL',
      'llama-3.3-70b-versatile',
    );
  }

  queryStream(
    workspaceId: string,
    query: string,
    topK = DEFAULT_TOP_K,
  ): Observable<MessageEvent> {
    let cancelled = false;

    return new Observable<MessageEvent>((observer) => {
      const startTime = Date.now();

      (async () => {
        try {
          const diverseChunks = await this.retrieveChunks(workspaceId, query, topK);

          if (cancelled) return;

          if (diverseChunks.length === 0) {
            observer.next(this.sseEvent({
              type: 'error',
              message: 'No relevant documents found. Try rephrasing your question.',
            }));
            observer.complete();
            return;
          }

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

          const context = this.buildContext(diverseChunks);

          if (cancelled) return;

          const stream = await this.groq.chat.completions.create({
            model: this.chatModel,
            messages: [
              {
                role: 'system',
                content:
                  'You are a helpful assistant that answers questions strictly based on the provided document context. ' +
                  'If the answer cannot be found in the context, say exactly: "I could not find an answer in the provided documents." ' +
                  'Do not make up information. Cite source numbers like [Source 1] when referencing specific content.',
              },
              {
                role: 'user',
                content: `Context:\n\n${context}\n\nQuestion: ${query}`,
              },
            ],
            stream: true,
          });

          let fullAnswer = '';
          let totalTokens = 0;

          for await (const chunk of stream) {
            if (cancelled) {
              this.logger.debug(`Client disconnected mid-stream for workspace ${workspaceId}`);
              return;
            }

            const delta = chunk.choices[0]?.delta?.content ?? '';
            if (delta) {
              fullAnswer += delta;
              observer.next(this.sseEvent({ type: 'delta', content: delta }));
            }
          }

          totalTokens = Math.round(fullAnswer.length / 4);

          const latencyMs = Date.now() - startTime;

          observer.next(this.sseEvent({
            type: 'done',
            tokensUsed: totalTokens,
            latencyMs,
          }));

          this.saveQueryHistory(workspaceId, query, fullAnswer, diverseChunks, totalTokens, latencyMs);

          observer.complete();
        } catch (error) {
          if (cancelled) return;

          this.logger.error(`Query stream error for workspace ${workspaceId}`, error);
          observer.next(this.sseEvent({
            type: 'error',
            message: 'An error occurred while processing your query.',
          }));
          observer.complete();
        }
      })();

      return () => {
        cancelled = true;
        this.logger.debug(`SSE stream cancelled for workspace ${workspaceId}`);
      };
    });
  }

  async queryOnce(workspaceId: string, query: string, topK = DEFAULT_TOP_K): Promise<string> {
    const chunks = await this.retrieveChunks(workspaceId, query, topK);
    if (chunks.length === 0) return 'No relevant documents found.';

    const context = this.buildContext(chunks);

    const response = await this.groq.chat.completions.create({
      model: this.chatModel,
      messages: [
        {
          role: 'system',
          content: 'Answer based ONLY on the provided context. If the answer is not in the context say "Not found in documents."',
        },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` },
      ],
    });

    return response.choices[0]?.message?.content ?? '';
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
          id: true, query: true, answer: true, sources: true,
          tokensUsed: true, latencyMs: true, createdAt: true,
        },
      }),
      this.prisma.queryHistory.count({ where: { workspaceId } }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

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
        dc."documentId"    AS "documentId",
        d."originalName"   AS "documentName",
        dc.content         AS "content",
        dc."chunkIndex"    AS "chunkIndex",
        1 - (dc.embedding <=> ${vectorString}::vector) AS "score"
      FROM document_chunks dc
      JOIN documents d
        ON d.id = dc."documentId"
       AND d."workspaceId" = ${workspaceId}
      WHERE dc."workspaceId" = ${workspaceId}
        AND d.status = 'COMPLETED'
        AND dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> ${vectorString}::vector) >= ${SIMILARITY_THRESHOLD}
      ORDER BY dc.embedding <=> ${vectorString}::vector
      LIMIT ${topK}
    `;

    return this.applyDiversityFilter(rawChunks, MAX_CHUNKS_PER_DOCUMENT);
  }

  private applyDiversityFilter(chunks: RetrievedChunk[], maxPerDocument: number): RetrievedChunk[] {
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

  private buildContext(chunks: RetrievedChunk[]): string {
    const parts: string[] = [];
    let totalChars = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const entry = `[Source ${i + 1}: ${chunk.documentName}]\n${chunk.content}`;

      if (totalChars + entry.length > MAX_CONTEXT_CHARS) break;

      parts.push(entry);
      totalChars += entry.length;
    }

    return parts.join('\n\n---\n\n');
  }

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
        this.logger.error(`Failed to save query history for workspace ${workspaceId}: ${err.message}`);
      });
  }

  private sseEvent(payload: SseEvent): MessageEvent {
    return { data: JSON.stringify(payload) };
  }
}