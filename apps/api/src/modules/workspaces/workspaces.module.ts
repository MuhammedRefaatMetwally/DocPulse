import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspaceRoleGuard } from '@/common/guards/workspace-role.guard';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceRoleGuard],
  exports: [WorkspacesService, WorkspaceRoleGuard],
})
export class WorkspacesModule {}