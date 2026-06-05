import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_CLIENT } from './embeddings.constants';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly model: string;
  private readonly DIMENSIONS = 1536;

  constructor(
    @Inject(GEMINI_CLIENT) private readonly ai: GoogleGenAI,
    private readonly config: ConfigService,
  ) {
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

    const cleaned = texts.map((t) => t.replace(/\n/g, ' ').trim());
    const BATCH_SIZE = 20;
    const results: number[][] = [];

    for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
      const batch = cleaned.slice(i, i + BATCH_SIZE);

      this.logger.debug(
        `Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cleaned.length / BATCH_SIZE)} — ${batch.length} texts`,
      );

      const response = await this.ai.models.embedContent({
        model: this.model,
        contents: batch,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: this.DIMENSIONS,
        },
      });

      const vectors = response.embeddings!.map((e) => e.values as number[]);
      results.push(...vectors);
    }

    return results;
  }

  async embedQuery(query: string): Promise<number[]> {
    const cleaned = query.replace(/\n/g, ' ').trim();

    const response = await this.ai.models.embedContent({
      model: this.model,
      contents: [cleaned],
      config: {
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: this.DIMENSIONS,
      },
    });

    return response.embeddings![0].values as number[];
  }
}