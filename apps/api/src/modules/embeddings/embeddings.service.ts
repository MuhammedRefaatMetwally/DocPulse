import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  private readonly EMBEDDING_DIMENSIONS = 1536;

  constructor(private readonly config: ConfigService) {
    //Gemini
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('GEMINI_API_KEY'),
      // Official Gemini OpenAI-compatible endpoint from docs
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
    this.model = this.config.get<string>(
      'OPENAI_EMBEDDING_MODEL',
      'gemini-embedding-001',
    );
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text]);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Clean texts — newlines degrade embedding quality
    const cleaned = texts.map((t) => t.replace(/\n/g, ' ').trim());

    const BATCH_SIZE = 100;
    const results: number[][] = [];

    for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
      const batch = cleaned.slice(i, i + BATCH_SIZE);

      this.logger.debug(
        `Embedding batch ${i / BATCH_SIZE + 1} — ${batch.length} texts`,
      );

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: batch,
        // CRITICAL: gemini-embedding-001 defaults to 3072 dims
        // We pin to 1536 to match our pgvector column vector(1536)
        // MRL guarantees same quality at 1536 as 3072
        dimensions: this.EMBEDDING_DIMENSIONS,
      });

      const vectors = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      results.push(...vectors);
    }

    return results;
  }
}