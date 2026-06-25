import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/database/prisma.service';
import { StorageService } from '@/modules/storage/storage.service';
import { INGESTION_QUEUE } from '@/modules/ingestion/ingestion.constants';
import { IngestionJobData } from '../ingestion/ingestion.processor';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
  ) {}

  async upload(
    workspaceId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    const storageKey = await this.storage.save(file.buffer, file.originalname);

    const document = await this.prisma.document.create({
      data: {
        workspaceId,
        name: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        status: 'PENDING',
      },
    });

    const ingestionJob = await this.prisma.ingestionJob.create({
      data: { documentId: document.id, status: 'QUEUED' },
    });

    const bullJob = await this.ingestionQueue.add(
      'ingest-document',
      {
        documentId: document.id,
        workspaceId,
      } satisfies IngestionJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    await this.prisma.ingestionJob.update({
      where: { id: ingestionJob.id },
      data: { bullJobId: bullJob.id as string },
    });

    this.logger.log(
      `Document ${document.id} uploaded, queued as Bull job ${bullJob.id}`,
    );

    return document;
  }

  async findAll(workspaceId: string) {
    return this.prisma.document.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        chunkCount: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(workspaceId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, workspaceId },
      include: {
        ingestionJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { chunks: true } },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async remove(workspaceId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, workspaceId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    await this.storage.delete(doc.storageKey);

    
    await this.prisma.document.delete({ where: { id: documentId } });

    return { message: 'Document deleted successfully' };
  }

  async getIngestionStatus(workspaceId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, workspaceId },
      select: {
        id: true,
        status: true,
        chunkCount: true,
        errorMessage: true,
        ingestionJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            attempts: true,
            bullJobId: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}