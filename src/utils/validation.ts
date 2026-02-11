import * as fs from 'fs/promises';
import { AppError, ErrorCode } from '../errors/types';

/**
 * Validate file path exists and is a file
 */
export async function validateFilePath(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(
      `File not found: ${filePath}`,
      ErrorCode.FILE_NOT_FOUND,
      { path: filePath },
      false
    );
  }

  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new AppError(
      `Not a file: ${filePath}`,
      ErrorCode.INVALID_FILE,
      { path: filePath },
      false
    );
  }
}

/**
 * Validate file size
 */
export function validateFileSize(
  size: number,
  maxSize: number = 100 * 1024 * 1024 * 1024 // 100GB default
): void {
  if (size === 0) {
    throw new AppError(
      'File is empty',
      ErrorCode.INVALID_FILE,
      { size: 0 },
      false
    );
  }

  if (size > maxSize) {
    const maxSizeGB = (maxSize / (1024 * 1024 * 1024)).toFixed(0);
    throw new AppError(
      `File too large (max: ${maxSizeGB} GB)`,
      ErrorCode.FILE_TOO_LARGE,
      { size, maxSize },
      false
    );
  }
}

