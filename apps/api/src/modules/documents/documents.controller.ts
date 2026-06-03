import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '@/common/guards/workspace-role.guard';
import { WorkspaceRoles } from '@/common/decorators/workspace-roles.decorator';
import { WorkspaceRole } from '@/common/enums/workspace-role.enum';
import {
  CurrentUser,
  CurrentUserPayload,
} from '@/common/decorators/current-user.decorator';
import { UploadDocumentDto } from './dto/upload-document.dto';

const MB25 = 25 * 1024 * 1024;

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:workspaceId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @WorkspaceRoles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Upload a document (PDF or TXT)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadDocumentDto })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MB25 }),
          new FileTypeValidator({
            fileType: /^(application\/pdf|text\/plain)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.documentsService.upload(workspaceId, user.sub, file);
  }

  @Get()
  @WorkspaceRoles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'List all documents in workspace' })
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.documentsService.findAll(workspaceId);
  }

  @Get(':documentId')
  @WorkspaceRoles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'Get a single document' })
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.findOne(workspaceId, documentId);
  }

  @Get(':documentId/status')
  @WorkspaceRoles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'Get ingestion status for a document' })
  getStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.getIngestionStatus(workspaceId, documentId);
  }

  @Delete(':documentId')
  @WorkspaceRoles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a document (ADMIN+)' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.remove(workspaceId, documentId);
  }
}