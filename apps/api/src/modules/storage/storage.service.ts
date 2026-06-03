import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir: string;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = config.get<string>('LOCAL_STORAGE_PATH', './uploads');
    this.ensureUploadDir();
  }

  async save(buffer: Buffer, filename: string): Promise<string> {
    const storageKey = `${Date.now()}-${filename}`;
    const filePath = path.join(this.uploadDir, storageKey);
    await fs.promises.writeFile(filePath, buffer);
    this.logger.log(`Saved file: ${storageKey}`);
    return storageKey;
  }

  async get(storageKey: string): Promise<Buffer> {
    const filePath = path.join(this.uploadDir, storageKey);
    return fs.promises.readFile(filePath);
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = path.join(this.uploadDir, storageKey);
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