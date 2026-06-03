import { ApiProperty } from '@nestjs/swagger';

export class UploadDocumentDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file!: Express.Multer.File;
}