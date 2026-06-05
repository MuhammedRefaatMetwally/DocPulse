import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/database/prisma.service', () => ({
  PrismaService: vi.fn().mockImplementation(() => mockPrisma),
}));

vi.mock('@/modules/embeddings/embeddings.service', () => ({
  EmbeddingsService: vi.fn().mockImplementation(() => mockEmbeddings),
}));

const mockPrisma = {
  $queryRaw: vi.fn(),
  queryHistory: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
};

const mockEmbeddings = {
  embedQuery: vi.fn(),
};

const mockGeminiClient = {
  models: {
    generateContentStream: vi.fn(),
    generateContent: vi.fn(),
  },
};

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom, toArray } from 'rxjs';
import { RetrievalService } from './retrieval.service';
import { PrismaService } from '@/database/prisma.service';
import { EmbeddingsService } from '@/modules/embeddings/embeddings.service';
import { GEMINI_CLIENT } from '@/modules/embeddings/embeddings.constants';

const mockConfig = {
  get: vi.fn().mockReturnValue('gemini-2.0-flash'),
};

const mockChunks = [
  {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    documentName: 'policy.pdf',
    content: 'The refund policy allows returns within 30 days.',
    score: 0.92,
  },
];

describe('RetrievalService', () => {
  let service: RetrievalService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RetrievalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmbeddingsService, useValue: mockEmbeddings },
        { provide: GEMINI_CLIENT, useValue: mockGeminiClient },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<RetrievalService>(RetrievalService);
    vi.clearAllMocks();
  });

  describe('queryStream', () => {
    it('should emit sources then delta then done events', async () => {
      mockEmbeddings.embedQuery.mockResolvedValue(Array(1536).fill(0.1));
      mockPrisma.$queryRaw.mockResolvedValue(mockChunks);
      mockPrisma.queryHistory.create.mockResolvedValue({});

      // Mock async generator for streaming
      async function* fakeStream() {
        yield { text: 'Returns are ', usageMetadata: null };
        yield { text: 'allowed within 30 days.', usageMetadata: { totalTokenCount: 42 } };
      }
      mockGeminiClient.models.generateContentStream.mockResolvedValue(
        fakeStream(),
      );

      const events = await lastValueFrom(
        service.queryStream('ws-1', 'What is the refund policy?').pipe(
          toArray(),
        ),
      );

      const parsed = events.map((e) => JSON.parse(e.data as string));

      expect(parsed[0].type).toBe('sources');
      expect(parsed[0].sources).toHaveLength(1);
      expect(parsed[0].sources[0].documentName).toBe('policy.pdf');

      expect(parsed[1].type).toBe('delta');
      expect(parsed[1].content).toBe('Returns are ');

      expect(parsed[2].type).toBe('delta');

      expect(parsed[3].type).toBe('done');
      expect(parsed[3].latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should emit error event when no chunks found', async () => {
      mockEmbeddings.embedQuery.mockResolvedValue(Array(1536).fill(0.1));
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const events = await lastValueFrom(
        service.queryStream('ws-1', 'unknown query').pipe(toArray()),
      );

      const parsed = events.map((e) => JSON.parse(e.data as string));
      expect(parsed[0].type).toBe('error');
      expect(parsed[0].message).toContain('No relevant documents');
    });

    it('should handle database error gracefully', async () => {
      mockEmbeddings.embedQuery.mockResolvedValue(Array(1536).fill(0.1));
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));

      const events = await lastValueFrom(
        service.queryStream('ws-1', 'test query').pipe(toArray()),
      );

      const parsed = events.map((e) => JSON.parse(e.data as string));
      expect(parsed[0].type).toBe('error');
      expect(parsed[0].message).toBe('An error occurred while processing your query.');
    });

    it('should handle embedding error gracefully', async () => {
      mockEmbeddings.embedQuery.mockRejectedValue(new Error('Embedding service failed'));

      const events = await lastValueFrom(
        service.queryStream('ws-1', 'test query').pipe(toArray()),
      );

      const parsed = events.map((e) => JSON.parse(e.data as string));
      expect(parsed[0].type).toBe('error');
      expect(parsed[0].message).toBe('An error occurred while processing your query.');
    });
  });

  describe('queryOnce', () => {
    it('should return text answer', async () => {
      mockEmbeddings.embedQuery.mockResolvedValue(Array(1536).fill(0.1));
      mockPrisma.$queryRaw.mockResolvedValue(mockChunks);
      mockGeminiClient.models.generateContent.mockResolvedValue({
        text: 'You can return items within 30 days.',
      });

      const result = await service.queryOnce('ws-1', 'refund policy?');

      expect(result).toBe('You can return items within 30 days.');
    });

    it('should return fallback when no chunks found', async () => {
      mockEmbeddings.embedQuery.mockResolvedValue(Array(1536).fill(0.1));
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.queryOnce('ws-1', 'unknown?');
      expect(result).toBe('No relevant documents found.');
    });

    it('should handle empty response from Gemini', async () => {
      mockEmbeddings.embedQuery.mockResolvedValue(Array(1536).fill(0.1));
      mockPrisma.$queryRaw.mockResolvedValue(mockChunks);
      mockGeminiClient.models.generateContent.mockResolvedValue({
        text: null,
      });

      const result = await service.queryOnce('ws-1', 'test query');
      expect(result).toBe('');
    });

    it('should handle Gemini error gracefully', async () => {
      mockEmbeddings.embedQuery.mockResolvedValue(Array(1536).fill(0.1));
      mockPrisma.$queryRaw.mockResolvedValue(mockChunks);
      mockGeminiClient.models.generateContent.mockRejectedValue(
        new Error('Gemini API error')
      );

      await expect(service.queryOnce('ws-1', 'test query')).rejects.toThrow();
    });
  });

  describe('getQueryHistory', () => {
    beforeEach(() => {
      // Reset and setup queryHistory mocks for these tests
      mockPrisma.queryHistory.findMany = vi.fn();
      mockPrisma.queryHistory.count = vi.fn();
    });

    it('should return paginated history', async () => {
      const mockItems = [
        { 
          id: 'qh-1', 
          query: 'test',
          answer: 'test answer',
          sources: [],
          tokensUsed: 100,
          latencyMs: 50,
          createdAt: new Date()
        }
      ];
      
      mockPrisma.queryHistory.findMany.mockResolvedValue(mockItems);
      mockPrisma.queryHistory.count.mockResolvedValue(1);

      const result = await service.getQueryHistory('ws-1', 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.totalPages).toBe(1);
      expect(mockPrisma.queryHistory.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        select: {
          id: true,
          query: true,
          answer: true,
          sources: true,
          tokensUsed: true,
          latencyMs: true,
          createdAt: true,
        },
      });
    });

    it('should handle pagination correctly', async () => {
      mockPrisma.queryHistory.findMany.mockResolvedValue([]);
      mockPrisma.queryHistory.count.mockResolvedValue(25);

      const result = await service.getQueryHistory('ws-1', 2, 10);

      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(3);
      expect(mockPrisma.queryHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
    });

    it('should return empty array when no history exists', async () => {
      mockPrisma.queryHistory.findMany.mockResolvedValue([]);
      mockPrisma.queryHistory.count.mockResolvedValue(0);

      const result = await service.getQueryHistory('ws-1', 1, 20);

      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });
});