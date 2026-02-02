import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { FileBlock, BLOCK_SIZE } from '../types/upload';

export class FileChunker {
  /**
   * Split file into blocks
   */
  async *chunkFile(filePath: string): AsyncGenerator<FileBlock> {
    const fileStats = await fs.stat(filePath);
    const fileSize = fileStats.size;
    const fd = await fs.open(filePath, 'r');

    let index = 1;  // Start at 1, not 0 (API expects 1-based indexing)
    let offset = 0;

    try {
      while (offset < fileSize) {
        const chunkSize = Math.min(BLOCK_SIZE, fileSize - offset);
        const buffer = Buffer.alloc(chunkSize);

        await fd.read(buffer, 0, chunkSize, offset);

        // Calculate SHA256 hash
        const hash = createHash('sha256').update(buffer).digest('hex');

        yield {
          index,
          data: new Uint8Array(buffer),
          hash,
          size: chunkSize,
        };

        index++;
        offset += chunkSize;
      }
    } finally {
      await fd.close();
    }
  }

  /**
   * Get file size
   */
  async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * Calculate number of blocks
   */
  calculateBlockCount(fileSize: number): number {
    return Math.ceil(fileSize / BLOCK_SIZE);
  }
}
