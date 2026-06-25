import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import { GEMINI_CLIENT } from './embeddings.constants';

const mockEmbedContent = vi.fn();

const mockGeminiClient = {
  models: {
    embedContent: mockEmbedContent,
  },
};

const mockConfig = {
  getOrThrow: vi.fn().mockReturnValue('fake-gemini-key'),
  get: vi.fn().mockReturnValue('gemini-embedding-001'),
};

const makeEmbeddingResponse = (count: number) => ({
  embeddings: Array.from({ length: count }, () => ({
    values: Array(1536).fill(0.1),
  })),
});

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        { provide: GEMINI_CLIENT, useValue: mockGeminiClient },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<EmbeddingsService>(EmbeddingsService);
    vi.clearAllMocks();
  });

  describe('embedBatch', () => {
    it('should return empty array for empty input', async () => {
      const result = await service.embedBatch([]);
      expect(result).toEqual([]);
      expect(mockEmbedContent).not.toHaveBeenCalled();
    });

    it('should call Gemini and return vectors', async () => {
      mockEmbedContent.mockResolvedValue(makeEmbeddingResponse(2));

      const result = await service.embedBatch(['hello', 'world']);

      expect(mockEmbedContent).toHaveBeenCalledOnce();
      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: 'gemini-embedding-001',
        contents: ['hello', 'world'],
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 1536,
        },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(1536);
    });

    it('should clean newlines from text before embedding', async () => {
      mockEmbedContent.mockResolvedValue(makeEmbeddingResponse(1));

      await service.embedBatch(['hello\nworld']);

      const callArgs = mockEmbedContent.mock.calls[0][0];
      expect(callArgs.contents[0]).toBe('hello world');
    });

    it('should process large batches in chunks of 20', async () => {
      const texts = Array(45).fill('test text');

      mockEmbedContent
        .mockResolvedValueOnce(makeEmbeddingResponse(20))
        .mockResolvedValueOnce(makeEmbeddingResponse(20))
        .mockResolvedValueOnce(makeEmbeddingResponse(5));

      const result = await service.embedBatch(texts);

      expect(mockEmbedContent).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(45);
    });
  });

  describe('embedOne', () => {
    it('should return a single vector', async () => {
      mockEmbedContent.mockResolvedValue(makeEmbeddingResponse(1));

      const result = await service.embedOne('test');

      expect(result).toHaveLength(1536);
      expect(mockEmbedContent).toHaveBeenCalledOnce();
    });
  });

  describe('embedQuery', () => {
    it('should use RETRIEVAL_QUERY task type', async () => {
      mockEmbedContent.mockResolvedValue(makeEmbeddingResponse(1));

      await service.embedQuery('what is machine learning?');

      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: 'gemini-embedding-001',
        contents: ['what is machine learning?'],
        config: {
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: 1536,
        },
      });
    });
  });
});