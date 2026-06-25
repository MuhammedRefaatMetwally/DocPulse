import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
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

  @Post()
  @WorkspaceRoles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'Query documents with streaming SSE response' })
  @ApiProduces('text/event-stream')
  async query(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: QueryDto,
    @Res() res: Response,
  ): Promise<void> {

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    const observable = this.retrievalService.queryStream(workspaceId, dto.query);

    const subscription = observable.subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
      },
      error: () => {
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: 'Stream error occurred' })}\n\n`,
        );
        res.end();
      },
      complete: () => {
        res.end();
      },
    });

    res.on('close', () => {
      subscription.unsubscribe();
    });
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