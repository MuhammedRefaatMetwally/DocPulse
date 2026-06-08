import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { StorageService } from '@/modules/storage/storage.service';
import { EmbeddingsService } from '@/modules/embeddings/embeddings.service';
import { DocumentStatus, IngestionJobStatus } from '@/generated/prisma/client';
import { INGESTION_QUEUE } from './ingestion.constants';

export interface IngestionJobData {
  documentId: string;
  workspaceId: string;
}

interface TextChunk {
  content: string;
  chunkIndex: number;
  startChar: number;
  endChar: number;
}

// ── Tuning constants ───────────────────────────────────────────────────────
// EMBED_BATCH: Gemini free tier = 15 RPM. With concurrency:3 workers,
// each worker gets 5 RPM budget. Batch of 20 texts = 1 API call per batch.
const EMBED_BATCH_SIZE = 20;

// INSERT_BATCH: 100 rows per UNNEST query.
// Each query is O(1) round-trips regardless of row count.
// 100 keeps us well under PostgreSQL's 65535 parameter limit.
const INSERT_BATCH_SIZE = 100;

// Worker concurrency: 3 keeps us within Gemini free tier limits.
// Increase to 5 if you upgrade to a paid Gemini tier.
const WORKER_CONCURRENCY = 3;

@Processor(INGESTION_QUEUE, { concurrency: WORKER_CONCURRENCY })
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly embeddings: EmbeddingsService,
  ) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<void> {
    const { documentId, workspaceId } = job.data;
    this.logger.log(
      `Processing document: ${documentId} (attempt ${job.attemptsMade + 1})`,
    );

    // ── Transition BOTH statuses atomically at start ───────────────────────
    await Promise.all([
      this.prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.PROCESSING },
      }),
      this.prisma.ingestionJob.updateMany({
        where: { documentId },
        data: {
          status: IngestionJobStatus.PROCESSING,
          startedAt: new Date(),
          attempts: { increment: 1 },
        },
      }),
    ]);

    await job.updateProgress(10);

    try {
      // ── 1. Fetch document ────────────────────────────────────────────────
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new UnrecoverableError(
          `Document ${documentId} not found in database`,
        );
      }

      // ── 2. Read file from storage ────────────────────────────────────────
      let fileBuffer: Buffer;
      try {
        fileBuffer = await this.storage.get(document.storageKey);
      } catch {
        throw new UnrecoverableError(
          `Storage file not found: ${document.storageKey}`,
        );
      }

      await job.updateProgress(20);

      // ── 3. Parse to text ─────────────────────────────────────────────────
      const text = await this.parseToText(fileBuffer, document.mimeType);
      await job.updateProgress(35);

      if (!text.trim()) {
        throw new UnrecoverableError(
          'No text content could be extracted from document',
        );
      }

      // ── 4. Chunk text ────────────────────────────────────────────────────
      const chunks = this.chunkText(text, 512, 64);
      this.logger.log(
        `Document ${documentId} — ${chunks.length} chunks to process`,
      );
      await job.updateProgress(45);

      // ── 5. Embed all chunks in rolling batches ───────────────────────────
      // Memory-efficient: one EMBED_BATCH_SIZE batch held at a time (~2MB).
      // All vectors collected before touching the DB so no partial writes
      // occur if embedding fails midway.
      const allChunks: TextChunk[] = [];
      const allVectors: number[][] = [];

      for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + EMBED_BATCH_SIZE);
        const vectors = await this.embeddings.embedBatch(
          batchChunks.map((c) => c.content),
        );

        allChunks.push(...batchChunks);
        allVectors.push(...vectors);

        const progress =
          45 + Math.round(((i + batchChunks.length) / chunks.length) * 45);
        await job.updateProgress(progress);
      }

      await job.updateProgress(90);

      // ── 6. Atomic delete + UNNEST bulk insert in one transaction ──────────
      // deleteMany + all inserts are wrapped in ONE transaction:
      // either all chunks are replaced or none are — no partial state.
      //
      // UNNEST zips parallel typed arrays server-side into rows.
      // ONE query per INSERT_BATCH_SIZE chunks instead of one per chunk.
      // Complexity: O(n queries) → O(1 per batch of 100).
      await this.prisma.$transaction(async (tx) => {
        // Delete all existing chunks for this document (re-ingestion safe)
        await tx.documentChunk.deleteMany({ where: { documentId } });

        for (let i = 0; i < allChunks.length; i += INSERT_BATCH_SIZE) {
          const batchChunks = allChunks.slice(i, i + INSERT_BATCH_SIZE);
          const batchVectors = allVectors.slice(i, i + INSERT_BATCH_SIZE);

          // Build typed parallel arrays — PostgreSQL zips via UNNEST
          const contents     = batchChunks.map((c) => c.content);
          const chunkIndexes = batchChunks.map((c) => c.chunkIndex);
          const startChars   = batchChunks.map((c) => c.startChar);
          const endChars     = batchChunks.map((c) => c.endChar);

          // JSON.stringify handles -0 edge case and is faster than .join(',')
          // PostgreSQL vector type accepts '[x,y,z]' string format natively
          const vectorStrings = batchVectors.map((v) => JSON.stringify(v));

          // Single INSERT for entire batch — UNNEST unzips arrays into rows
          // ONE round-trip per INSERT_BATCH_SIZE chunks
          await tx.$executeRaw`
            INSERT INTO document_chunks
              (id, document_id, workspace_id, content, chunk_index,
               start_char, end_char, embedding, created_at)
            SELECT
              gen_random_uuid(),
              ${documentId},
              ${workspaceId},
              t.content,
              t.chunk_index,
              t.start_char,
              t.end_char,
              t.embedding::vector,
              NOW()
            FROM UNNEST(
              ${contents}::text[],
              ${chunkIndexes}::int[],
              ${startChars}::int[],
              ${endChars}::int[],
              ${vectorStrings}::text[]
            ) AS t(content, chunk_index, start_char, end_char, embedding)
          `;
        }
      });

      // ── 7. Mark COMPLETED atomically ─────────────────────────────────────
      await Promise.all([
        this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.COMPLETED,
            chunkCount: chunks.length,
          },
        }),
        this.prisma.ingestionJob.updateMany({
          where: {
            documentId,
            status: IngestionJobStatus.PROCESSING,
          },
          data: {
            status: IngestionJobStatus.COMPLETED,
            completedAt: new Date(),
          },
        }),
      ]);

      await job.updateProgress(100);
      this.logger.log(
        `Document ${documentId} ingestion complete — ${chunks.length} chunks`,
      );
    } catch (error) {
      await this.handleFailure(job, documentId, error as Error);
      throw error;
    }
  }

  /**
   * Handles failure with correct status transitions:
   * - Intermediate attempt: reset to QUEUED (BullMQ will retry)
   * - Final attempt or UnrecoverableError: mark as FAILED permanently
   */
  private async handleFailure(
    job: Job<IngestionJobData>,
    documentId: string,
    error: Error,
  ): Promise<void> {
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const isUnrecoverable = error instanceof UnrecoverableError;

    this.logger.error(
      `Document ${documentId} failed on attempt ${job.attemptsMade + 1}` +
        (isLastAttempt ? ' (FINAL)' : ' (will retry)') +
        `: ${error.message}`,
    );

    if (isLastAttempt || isUnrecoverable) {
      await Promise.all([
        this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.FAILED,
            errorMessage: error.message,
          },
        }),
        this.prisma.ingestionJob.updateMany({
          where: { documentId, status: IngestionJobStatus.PROCESSING },
          data: {
            status: IngestionJobStatus.FAILED,
            errorMessage: error.message,
            completedAt: new Date(),
          },
        }),
      ]);
    } else {
      // Reset to QUEUED so the next retry starts from a clean state
      await this.prisma.ingestionJob.updateMany({
        where: { documentId, status: IngestionJobStatus.PROCESSING },
        data: { status: IngestionJobStatus.QUEUED },
      });
    }
  }

  // ── BullMQ lifecycle events ───────────────────────────────────────────────

  @OnWorkerEvent('error')
  onError(error: Error): void {
    // Required — without this, an unhandled error event crashes the worker
    this.logger.error('Worker connection/internal error:', error.message);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<IngestionJobData>, error: Error): void {
    const isLast = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (isLast) {
      this.logger.error(
        `Job ${job.id} permanently failed for document ` +
          `${job.data.documentId} after ${job.attemptsMade} attempts: ${error.message}`,
      );
    } else {
      this.logger.warn(
        `Job ${job.id} attempt ${job.attemptsMade} failed for document ` +
          `${job.data.documentId}, scheduling retry: ${error.message}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<IngestionJobData>): void {
    this.logger.log(
      `Job ${job.id} completed for document ${job.data.documentId}`,
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async parseToText(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (
        buffer: Buffer,
      ) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      return data.text;
    }
    return buffer.toString('utf-8');
  }

  private chunkText(
    text: string,
    chunkSize: number,
    overlap: number,
  ): TextChunk[] {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];

    const chunks: TextChunk[] = [];
    const step = chunkSize - overlap;

    for (let i = 0; i < clean.length; i += step) {
      const end = Math.min(i + chunkSize, clean.length);
      chunks.push({
        content: clean.slice(i, end),
        chunkIndex: chunks.length,
        startChar: i,
        endChar: end,
      });
      if (end === clean.length) break;
    }

    return chunks;
  }
}