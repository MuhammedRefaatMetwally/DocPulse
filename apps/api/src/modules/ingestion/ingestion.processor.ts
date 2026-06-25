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

const EMBED_BATCH_SIZE = 20;

const INSERT_BATCH_SIZE = 100;


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
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new UnrecoverableError(
          `Document ${documentId} not found in database`,
        );
      }

      let fileBuffer: Buffer;
      try {
        fileBuffer = await this.storage.get(document.storageKey);
      } catch {
        throw new UnrecoverableError(
          `Storage file not found: ${document.storageKey}`,
        );
      }

      await job.updateProgress(20);

      const text = await this.parseToText(fileBuffer, document.mimeType);
      await job.updateProgress(35);

      if (!text.trim()) {
        throw new UnrecoverableError(
          'No text content could be extracted from document',
        );
      }

      const chunks = this.chunkText(text, 512, 64);
      this.logger.log(
        `Document ${documentId} — ${chunks.length} chunks to process`,
      );
      await job.updateProgress(45);

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

   
      await this.prisma.$transaction(async (tx) => {

        await tx.documentChunk.deleteMany({ where: { documentId } });

        for (let i = 0; i < allChunks.length; i += INSERT_BATCH_SIZE) {
          const batchChunks = allChunks.slice(i, i + INSERT_BATCH_SIZE);
          const batchVectors = allVectors.slice(i, i + INSERT_BATCH_SIZE);

          const contents = batchChunks.map((c) => c.content);
          const chunkIndexes = batchChunks.map((c) => c.chunkIndex);
          const startChars = batchChunks.map((c) => c.startChar);
          const endChars = batchChunks.map((c) => c.endChar);

          const vectorStrings = batchVectors.map((v) => JSON.stringify(v));

          await tx.$executeRaw`
  INSERT INTO document_chunks
    (id, "documentId", "workspaceId", content, "chunkIndex",
     "startChar", "endChar", embedding, "createdAt")
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
      await this.prisma.ingestionJob.updateMany({
        where: { documentId, status: IngestionJobStatus.PROCESSING },
        data: { status: IngestionJobStatus.QUEUED },
      });
    }
  }


  @OnWorkerEvent('error')
  onError(error: Error): void {
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


  private async parseToText(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      try {
        const pdfParseModule = require('pdf-parse');

        const pdfParse = (
          typeof pdfParseModule === 'function'
            ? pdfParseModule
            : pdfParseModule.default
        ) as (buffer: Buffer) => Promise<{ text: string }>;

        const data = await pdfParse(buffer);
        return data.text;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`PDF parsing failed: ${errorMessage}`);
        throw new UnrecoverableError(`Failed to parse PDF: ${errorMessage}`);
      }
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
