import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { RetrievalService } from './retrieval.service';
import { QueryDto } from './dto/query.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '@/common/guards/workspace-role.guard';
import { WorkspaceRoles } from '@/common/decorators/workspace-roles.decorator';
import { WorkspaceRole } from '@/common/enums/workspace-role.enum';

@ApiTags('Retrieval')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:workspaceId/query')
export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalService) {}

  @Sse()
  @WorkspaceRoles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'Query documents with streaming SSE response' })
  @ApiProduces('text/event-stream')
  query(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: QueryDto,
  ): Observable<MessageEvent> {
    return this.retrievalService.queryStream(workspaceId, dto.query);
  }

  @Get('history')
  @WorkspaceRoles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'Get query history for workspace' })
  getHistory(
    @Param('workspaceId') workspaceId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.retrievalService.getQueryHistory(
      workspaceId,
      Number(page),
      Number(limit),
    );
  }
}