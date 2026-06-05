import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
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
    this.logger.log(`Processing document: ${documentId}`);

    await this.updateDocumentStatus(documentId, DocumentStatus.PROCESSING);
    await job.updateProgress(10);

    try {
      // 1. Fetch document record
      const document = await this.prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });

      // 2. Read file from storage
      const fileBuffer = await this.storage.get(document.storageKey);
      await job.updateProgress(20);

      // 3. Parse to text
      const text = await this.parseToText(fileBuffer, document.mimeType);
      await job.updateProgress(35);

      // 4. Chunk text
      const chunks = this.chunkText(text, 512, 64);
      await job.updateProgress(45);

      if (chunks.length === 0) {
        throw new Error('No text content extracted from document');
      }

      // 5. Delete old chunks (supports re-ingestion)
      await this.prisma.documentChunk.deleteMany({ where: { documentId } });

      // 6. Embed + store in batches
      const BATCH_SIZE = 50;

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        // Get embeddings for this batch
        const vectors = await this.embeddings.embedBatch(
          batch.map((c) => c.content),
        );

        // Insert each chunk with its embedding using raw SQL
        // Prisma doesn't support vector type natively
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          // Format vector as PostgreSQL array string
          const vectorString = `[${vectors[j].join(',')}]`;

          await this.prisma.$executeRaw`
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

        const progress =
          45 + Math.round(((i + batch.length) / chunks.length) * 45);
        await job.updateProgress(progress);
      }

      // 7. Mark completed
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.COMPLETED,
          chunkCount: chunks.length,
        },
      });

      await this.prisma.ingestionJob.updateMany({
        where: { documentId, status: IngestionJobStatus.QUEUED },
        data: { status: IngestionJobStatus.PROCESSING, startedAt: new Date() },
      });

      await job.updateProgress(100);
      this.logger.log(
        `Document ${documentId} completed — ${chunks.length} chunks embedded`,
      );
    } catch (error) {
      this.logger.error(`Failed processing document ${documentId}`, error);
      await this.updateDocumentStatus(
        documentId,
        DocumentStatus.FAILED,
        (error as Error).message,
      );
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<IngestionJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} permanently failed for document ${job.data.documentId}: ${error.message}`,
    );
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

  private async updateDocumentStatus(
    documentId: string,
    status: DocumentStatus,
    errorMessage?: string,
  ) {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status, ...(errorMessage && { errorMessage }) },
    });
  }
}
