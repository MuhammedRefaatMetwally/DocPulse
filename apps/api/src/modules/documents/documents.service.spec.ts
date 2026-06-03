import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/database/prisma.service', () => ({
  PrismaService: vi.fn().mockImplementation(() => mockPrisma),
}));

vi.mock('@/modules/storage/storage.service', () => ({
  StorageService: vi.fn().mockImplementation(() => mockStorage),
}));

const mockPrisma = {
  document: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  ingestionJob: {
    create: vi.fn(),
    update: vi.fn(),
  },
};

const mockStorage = {
  save: vi.fn(),
  delete: vi.fn(),
};

const mockQueue = {
  add: vi.fn(),
};

import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { DocumentsService } from './documents.service';
import { PrismaService } from '@/database/prisma.service';
import { StorageService } from '@/modules/storage/storage.service';
import { INGESTION_QUEUE } from '@/modules/ingestion/ingestion.constants';

const mockFile = {
  originalname: 'test.pdf',
  mimetype: 'application/pdf',
  buffer: Buffer.from('fake pdf content'),
  size: 1024,
} as Express.Multer.File;

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: getQueueToken(INGESTION_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    vi.clearAllMocks();
  });

  describe('upload', () => {
    it('should save file, create document, and enqueue job', async () => {
      mockStorage.save.mockResolvedValue('storagekey-123');
      mockPrisma.document.create.mockResolvedValue({
        id: 'doc-1',
        workspaceId: 'ws-1',
        status: 'PENDING',
      });
      mockPrisma.ingestionJob.create.mockResolvedValue({ id: 'job-1' });
      mockQueue.add.mockResolvedValue({ id: 'bull-job-1' });
      mockPrisma.ingestionJob.update.mockResolvedValue({});

      const result = await service.upload('ws-1', 'user-1', mockFile);

      expect(mockStorage.save).toHaveBeenCalledOnce();
      expect(mockPrisma.document.create).toHaveBeenCalledOnce();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'ingest-document',
        { documentId: 'doc-1', workspaceId: 'ws-1' },
        expect.objectContaining({ attempts: 3 }),
      );
      expect(result).toHaveProperty('id', 'doc-1');
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if document not found', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(
        service.remove('ws-1', 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);

      expect(mockStorage.delete).not.toHaveBeenCalled();
    });

    it('should delete file and document record', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        storageKey: 'storagekey-123',
      });
      mockStorage.delete.mockResolvedValue(undefined);
      mockPrisma.document.delete.mockResolvedValue({});

      const result = await service.remove('ws-1', 'doc-1');

      expect(mockStorage.delete).toHaveBeenCalledWith('storagekey-123');
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
      expect(result).toHaveProperty('message');
    });
  });

  describe('findAll', () => {
    it('should return documents for workspace', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        { id: 'doc-1', status: 'COMPLETED' },
        { id: 'doc-2', status: 'PENDING' },
      ]);

      const result = await service.findAll('ws-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
        }),
      );
    });
  });
});