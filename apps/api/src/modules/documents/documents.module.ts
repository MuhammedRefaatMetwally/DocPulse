import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { IngestionProcessor } from '@/modules/ingestion/ingestion.processor';
import { StorageModule } from '@/modules/storage/storage.module';
import { EmbeddingsModule } from '@/modules/embeddings/embeddings.module';
import { WorkspaceRoleGuard } from '@/common/guards/workspace-role.guard';
import { INGESTION_QUEUE } from '@/modules/ingestion/ingestion.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
    StorageModule,
    EmbeddingsModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    IngestionProcessor,
    WorkspaceRoleGuard,
  ],
})
export class DocumentsModule {}