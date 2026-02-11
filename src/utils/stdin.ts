import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { AppError, ErrorCode } from '../errors/types';

/**
 * Check if stdin is being piped (not a TTY)
 */
export function isStdinPiped(): boolean {
  return !process.stdin.isTTY;
}

/**
 * Read stdin to a temporary file and return the path
 * This is necessary because we need to know the file size upfront
 * and be able to read the file multiple times for chunking
 */
export async function readStdinToTempFile(): Promise<string> {
  if (!isStdinPiped()) {
    throw new AppError(
      'No input provided via stdin',
      ErrorCode.INVALID_FILE,
      {},
      false
    );
  }

  // Create temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `proton-drive-upload-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`);

  try {
    // Write stdin to temp file
    const writeStream = createWriteStream(tmpFile);
    await pipeline(process.stdin, writeStream);

    // Verify file was written
    const stats = await fs.stat(tmpFile);
    if (stats.size === 0) {
      await fs.unlink(tmpFile);
      throw new AppError(
        'No data received from stdin',
        ErrorCode.INVALID_FILE,
        {},
        false
      );
    }

    return tmpFile;
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Clean up temporary file
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Extract filename from destination path
 * /Documents/myfile.txt -> myfile.txt
 * /Documents/ -> null
 */
export function extractFilenameFromPath(destinationPath: string): string | null {
  const parts = destinationPath.split('/').filter(p => p.length > 0);

  if (parts.length === 0) {
    return null;
  }

  const lastPart = parts[parts.length - 1];

  // Check if last part looks like a filename (has extension or no trailing slash)
  if (!destinationPath.endsWith('/') && lastPart.includes('.')) {
    return lastPart;
  }

  return null;
}

/**
 * Get parent path from destination
 * /Documents/myfile.txt -> /Documents
 * /Documents/ -> /Documents
 * /myfile.txt -> /
 */
export function getParentPath(destinationPath: string): string {
  const parts = destinationPath.split('/').filter(p => p.length > 0);

  // If destination looks like a filename (doesn't end with / and has extension)
  if (!destinationPath.endsWith('/') && parts.length > 0 && parts[parts.length - 1].includes('.')) {
    parts.pop(); // Remove filename
  }

  return '/' + parts.join('/');
}
