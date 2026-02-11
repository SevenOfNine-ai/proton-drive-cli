import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  validateFileSize,
  validateFilePath,
} from './validation';
import { AppError } from '../errors/types';

describe('validateFileSize', () => {
  it('accepts normal file size', () => {
    expect(() => validateFileSize(1024)).not.toThrow();
  });

  it('throws on zero size', () => {
    expect(() => validateFileSize(0)).toThrow(AppError);
    expect(() => validateFileSize(0)).toThrow(/empty/i);
  });

  it('throws on size exceeding max', () => {
    const maxSize = 1024;
    expect(() => validateFileSize(2048, maxSize)).toThrow(AppError);
    expect(() => validateFileSize(2048, maxSize)).toThrow(/too large/i);
  });

  it('accepts size equal to custom max', () => {
    expect(() => validateFileSize(1024, 1024)).not.toThrow();
  });
});

describe('validateFilePath', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validation-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts an existing file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await fs.writeFile(filePath, 'hello');
    await expect(validateFilePath(filePath)).resolves.not.toThrow();
  });

  it('throws for missing file', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.txt');
    await expect(validateFilePath(filePath)).rejects.toThrow(AppError);
  });

  it('throws for directory', async () => {
    await expect(validateFilePath(tmpDir)).rejects.toThrow(AppError);
  });
});
