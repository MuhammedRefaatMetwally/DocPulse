import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { RetrievalController } from './retrieval.controller';
import { EmbeddingsModule } from '@/modules/embeddings/embeddings.module';
import { WorkspaceRoleGuard } from '@/common/guards/workspace-role.guard';

@Module({
  imports: [EmbeddingsModule],
  controllers: [RetrievalController],
  providers: [RetrievalService, WorkspaceRoleGuard],
  exports: [RetrievalService],
})
export class RetrievalModule {}