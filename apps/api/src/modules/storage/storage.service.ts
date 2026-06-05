import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir: string;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = path.resolve(
      config.get<string>('LOCAL_STORAGE_PATH', './uploads'),
    );
    this.ensureUploadDir();
  }

  async save(buffer: Buffer, filename: string): Promise<string> {
    // Sanitize — strip path separators and dangerous chars
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${Date.now()}-${safeName}`;
    const filePath = path.join(this.uploadDir, storageKey);

    // Verify resolved path stays within uploadDir (path traversal guard)
    if (!filePath.startsWith(this.uploadDir)) {
      throw new BadRequestException('Invalid file path');
    }

    await fs.promises.writeFile(filePath, buffer);
    this.logger.log(`Saved file: ${storageKey}`);
    return storageKey;
  }

  async get(storageKey: string): Promise<Buffer> {
    const filePath = path.join(this.uploadDir, storageKey);
    if (!filePath.startsWith(this.uploadDir)) {
      throw new BadRequestException('Invalid storage key');
    }
    return fs.promises.readFile(filePath);
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = path.join(this.uploadDir, storageKey);
    if (!filePath.startsWith(this.uploadDir)) return;
    await fs.promises.unlink(filePath).catch(() => {
      this.logger.warn(`File not found for deletion: ${storageKey}`);
    });
  }

  private ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }
  }
}