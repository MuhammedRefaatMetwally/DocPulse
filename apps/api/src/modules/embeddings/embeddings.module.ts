import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { GeminiClientProvider } from './embeddings.provider';
import { GEMINI_CLIENT } from './embeddings.constants';

@Module({
  providers: [GeminiClientProvider, EmbeddingsService],
  exports: [
    EmbeddingsService,
    GeminiClientProvider, 
  ],
})
export class EmbeddingsModule {}