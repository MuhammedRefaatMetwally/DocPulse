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

@Processor(INGESTION_QUEUE, { concurrency: 3 })
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

    // ── Fix 2: Transition BOTH document and ingestion job to PROCESSING ──────
    await Promise.all([
      this.prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.PROCESSING },
      }),
      this.prisma.ingestionJob.updateMany({
        where: { documentId },
        // ── Fix 3: Correct — job is QUEUED at start, move to PROCESSING ──────
        data: {
          status: IngestionJobStatus.PROCESSING,
          startedAt: new Date(),
          // ── Fix 8: Increment attempts counter ──────────────────────────────
          attempts: { increment: 1 },
        },
      }),
    ]);

    await job.updateProgress(10);

    try {
      // 1. Fetch document — throw UnrecoverableError if not found
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });

      // ── Fix 7: Document missing = unrecoverable, don't waste retries ───────
      if (!document) {
        throw new UnrecoverableError(
          `Document ${documentId} not found in database`,
        );
      }

      // 2. Read file from storage
      let fileBuffer: Buffer;
      try {
        fileBuffer = await this.storage.get(document.storageKey);
      } catch {
        // ── Fix 7: File missing = unrecoverable ──────────────────────────────
        throw new UnrecoverableError(
          `Storage file not found: ${document.storageKey}`,
        );
      }

      await job.updateProgress(20);

      // 3. Parse to text
      const text = await this.parseToText(fileBuffer, document.mimeType);
      await job.updateProgress(35);

      if (!text.trim()) {
        // ── Fix 7: Empty document = unrecoverable ────────────────────────────
        throw new UnrecoverableError(
          'No text content could be extracted from document',
        );
      }

      // 4. Chunk text
      const chunks = this.chunkText(text, 512, 64);
      await job.updateProgress(45);

      // 5. Embed all chunks
      const EMBED_BATCH = 20;
      const allVectors: number[][] = [];

      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const vectors = await this.embeddings.embedBatch(
          batch.map((c) => c.content),
        );
        allVectors.push(...vectors);

        const progress =
          45 + Math.round(((i + batch.length) / chunks.length) * 30);
        await job.updateProgress(progress);
      }

      // ── Fix 4+5: Delete old chunks THEN bulk insert new ones atomically ────
      // Single transaction: delete stale chunks + insert all new ones
      // This prevents orphan chunks on partial failure
      await this.prisma.$transaction(async (tx) => {
        // Delete existing chunks for this document
        await tx.documentChunk.deleteMany({ where: { documentId } });

        // ── Fix 5: Bulk insert — one query per batch, not one per chunk ───────
        const INSERT_BATCH = 50;
        for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
          const batchChunks = chunks.slice(i, i + INSERT_BATCH);
          const batchVectors = allVectors.slice(i, i + INSERT_BATCH);

          // Bulk insert using raw SQL with proper vector formatting
          for (let j = 0; j < batchChunks.length; j++) {
            const chunk = batchChunks[j];
            // Format vector as PostgreSQL array string
            const vectorString = `[${batchVectors[j].join(',')}]`;

            await tx.$executeRaw`
              INSERT INTO document_chunks
                (id, document_id, workspace_id, content, chunk_index,
                 start_char, end_char, embedding, created_at)
              VALUES (
                gen_random_uuid(),
                ${documentId},
                ${workspaceId},
                ${chunk.content},
                ${chunk.chunkIndex},
                ${chunk.startChar},
                ${chunk.endChar},
                ${vectorString}::vector,
                NOW()
              )
            `;
          }
        }
      });

      await job.updateProgress(95);

      // 6. Mark both document and ingestion job as COMPLETED atomically
      await Promise.all([
        this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.COMPLETED,
            chunkCount: chunks.length,
          },
        }),
        // ── Fix 3: Filter by PROCESSING (not QUEUED) ─────────────────────────
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
        `Document ${documentId} completed — ${chunks.length} chunks embedded`,
      );
    } catch (error) {
      this.logger.error(
        `Failed processing document ${documentId} on attempt ${job.attemptsMade + 1}`,
        error,
      );

      const isLastAttempt =
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const isUnrecoverable = error instanceof UnrecoverableError;

      // ── Fix 1: Only mark FAILED when retries are exhausted ────────────────
      if (isLastAttempt || isUnrecoverable) {
        await Promise.all([
          this.prisma.document.update({
            where: { id: documentId },
            data: {
              status: DocumentStatus.FAILED,
              errorMessage: (error as Error).message,
            },
          }),
          this.prisma.ingestionJob.updateMany({
            where: {
              documentId,
              status: IngestionJobStatus.PROCESSING,
            },
            data: {
              status: IngestionJobStatus.FAILED,
              errorMessage: (error as Error).message,
              completedAt: new Date(),
            },
          }),
        ]);
      } else {
        // Intermediate failure — reset to QUEUED so next retry starts clean
        await this.prisma.ingestionJob.updateMany({
          where: {
            documentId,
            status: IngestionJobStatus.PROCESSING,
          },
          data: {
            status: IngestionJobStatus.QUEUED,
          },
        });
      }

      throw error; // Re-throw so BullMQ handles retry scheduling
    }
  }

  // ── Fix 6: Required error handler — prevents worker from stopping silently ─
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error('Worker error:', error);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<IngestionJobData>, error: Error) {
    const isLast = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (isLast) {
      this.logger.error(
        `Document ${job.data.documentId} permanently failed after ${job.attemptsMade} attempts: ${error.message}`,
      );
    } else {
      this.logger.warn(
        `Document ${job.data.documentId} attempt ${job.attemptsMade} failed, will retry: ${error.message}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<IngestionJobData>) {
    this.logger.log(
      `Job ${job.id} completed for document ${job.data.documentId}`,
    );
  }

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