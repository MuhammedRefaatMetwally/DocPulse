import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { RetrievalController } from './retrieval.controller';
import { EmbeddingsModule } from '@/modules/embeddings/embeddings.module';
import { WorkspaceRoleGuard } from '@/common/guards/workspace-role.guard';
import { GroqClientProvider } from './groq.provider';

@Module({
  imports: [EmbeddingsModule],
  controllers: [RetrievalController],
  providers: [RetrievalService, WorkspaceRoleGuard, GroqClientProvider],
  exports: [RetrievalService],
})
export class RetrievalModule {}