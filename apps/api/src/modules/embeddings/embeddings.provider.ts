import { GoogleGenAI } from '@google/genai';
import { ConfigService } from '@nestjs/config';
import { GEMINI_CLIENT } from './embeddings.constants';

export const GeminiClientProvider = {
  provide: GEMINI_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new GoogleGenAI({
      apiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
    });
  },
};