import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('DocPulse API')
    .setDescription('Multi-tenant RAG document intelligence platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  // Bull Board — queue monitoring (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/api/queues');

    createBullBoard({
      queues: [
        new BullMQAdapter(
          new Queue('ingestion', {
            connection: { url: process.env.REDIS_URL },
          }),
        ),
      ],
      serverAdapter,
    });

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use('/api/queues', serverAdapter.getRouter());
    console.log('🎯 Bull Board at http://localhost:3000/api/queues');
  }

  await app.listen(process.env.PORT || 3000);
  console.log(`🚀 API running on http://localhost:3000`);
  console.log(`📖 Swagger at http://localhost:3000/api/docs`);
}

bootstrap();