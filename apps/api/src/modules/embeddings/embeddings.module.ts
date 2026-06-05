import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { GeminiClientProvider } from './embeddings.provider';

@Module({
  providers: [GeminiClientProvider, EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}