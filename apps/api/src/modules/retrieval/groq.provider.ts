import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { GROQ_CLIENT } from './groq.constants';

export const GroqClientProvider = {
  provide: GROQ_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new OpenAI({
      apiKey: config.getOrThrow<string>('GROQ_API_KEY'),
      baseURL: 'https://api.groq.com/openai/v1',
    });
  },
};