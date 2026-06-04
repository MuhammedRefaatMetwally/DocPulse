import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      embeddings: {
        create: mockCreate,
      },
    })),
  };
});

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';

const mockConfig = {
  getOrThrow: vi.fn().mockReturnValue('sk-test'),
  get: vi.fn().mockReturnValue('text-embedding-3-small'),
};

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
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
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should call OpenAI and return vectors in order', async () => {
      const fakeVectors = [
        Array(1536).fill(0.1),
        Array(1536).fill(0.2),
      ];

      mockCreate.mockResolvedValue({
        data: [
          { index: 0, embedding: fakeVectors[0] },
          { index: 1, embedding: fakeVectors[1] },
        ],
      });

      const result = await service.embedBatch(['hello', 'world']);

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['hello', 'world'],
        encoding_format: 'float',
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(1536);
    });

    it('should clean newlines from text before embedding', async () => {
      mockCreate.mockResolvedValue({
        data: [{ index: 0, embedding: Array(1536).fill(0.1) }],
      });

      await service.embedBatch(['hello\nworld']);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.input[0]).toBe('hello world');
    });

    it('should process large batches in chunks of 100', async () => {
      const texts = Array(150).fill('test text');
      mockCreate.mockResolvedValue({
        data: Array(100)
          .fill(null)
          .map((_, i) => ({ index: i, embedding: Array(1536).fill(0.1) })),
      });

      // Second batch returns 50
      mockCreate.mockResolvedValueOnce({
        data: Array(100)
          .fill(null)
          .map((_, i) => ({ index: i, embedding: Array(1536).fill(0.1) })),
      });
      mockCreate.mockResolvedValueOnce({
        data: Array(50)
          .fill(null)
          .map((_, i) => ({ index: i, embedding: Array(1536).fill(0.1) })),
      });

      const result = await service.embedBatch(texts);

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(150);
    });
  });

  describe('embedOne', () => {
    it('should return a single vector', async () => {
      mockCreate.mockResolvedValue({
        data: [{ index: 0, embedding: Array(1536).fill(0.5) }],
      });

      const result = await service.embedOne('test');

      expect(result).toHaveLength(1536);
      expect(mockCreate).toHaveBeenCalledOnce();
    });
  });
});