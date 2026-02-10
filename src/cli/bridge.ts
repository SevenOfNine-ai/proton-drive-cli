/**
 * Bridge command for Git LFS integration
 * Reads JSON from stdin, performs operations, writes JSON to stdout
 * Compatible with .NET bridge protocol envelope format:
 *   { ok: true/false, payload: {...}, error: "...", code: 400-500 }
 */

import { Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createDriveClient, DriveClient } from '../drive/client';
import { AuthService } from '../auth';
import { ErrorCode } from '../errors/types';
import { logger, LogLevel } from '../utils/logger';
import {
  ensureOidFolder,
  findFileByOid,
  listFolder,
} from './bridge-helpers';
import {
  BridgeRequest,
  BridgeResponse,
  validateOid,
  validateLocalPath,
  errorToStatusCode,
  oidToPath,
} from '../bridge/validators';

/**
 * Write JSON response to stdout (single line, no extra output)
 */
function writeResponse(response: BridgeResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

function writeSuccess(payload: any = {}): void {
  writeResponse({ ok: true, payload });
}

function writeError(message: string, code: number = 500, details: string = ''): void {
  writeResponse({ ok: false, error: message, code, details });
}

/**
 * Read JSON payload from stdin
 */
async function readStdinJson(): Promise<BridgeRequest> {
  return new Promise((resolve, reject) => {
    let input = '';

    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });

    rl.on('line', (line) => {
      input += line;
    });

    rl.on('close', () => {
      try {
        if (!input.trim()) {
          reject(new Error('Empty input received'));
          return;
        }
        resolve(JSON.parse(input));
      } catch (error: any) {
        reject(new Error(`Failed to parse JSON: ${error.message}`));
      }
    });

    rl.on('error', (error) => {
      reject(error);
    });
  });
}

// Re-export validators for existing consumers (e.g., bridge.test.ts)
export { BridgeRequest, BridgeResponse, validateOid, validateLocalPath, errorToStatusCode } from '../bridge/validators';

/**
 * Initialize DriveClient, authenticating if necessary.
 * Password is always required — it flows via stdin from pass-cli
 * and is never read from the session file.
 */
async function getInitializedClient(request: BridgeRequest): Promise<DriveClient> {
  const client = createDriveClient();
  const password = request.password;

  // Try existing session tokens + stdin password for crypto
  try {
    if (password) {
      await client.initializeFromSession(password);
      return client;
    }
  } catch (_) {
    // No valid session — need full login
  }

  // Need full login
  if (!request.username || !password) {
    throw Object.assign(
      new Error('No session found and credentials not provided'),
      { code: ErrorCode.AUTH_FAILED }
    );
  }

  const authService = new AuthService();
  await authService.login(request.username, password, undefined);
  await client.initialize(password);
  return client;
}

/**
 * Ensure the LFS base directory exists
 */
async function ensureBaseDir(client: DriveClient, storageBase: string): Promise<string> {
  const normalizedBase = storageBase.replace(/^\/+|\/+$/g, '');
  const basePath = `/${normalizedBase}`;

  try {
    await client.paths().resolvePath(basePath);
  } catch (error: any) {
    if (error?.message?.includes('not found') || error?.message?.includes('Not found')) {
      logger.debug(`Creating base directory: ${basePath}`);
      await client.createFolder('/', normalizedBase);
    } else {
      throw error;
    }
  }

  return basePath;
}

// ─── Command handlers ──────────────────────────────────────────────

async function handleAuthCommand(request: BridgeRequest): Promise<void> {
  if (!request.username || !request.password) {
    writeError('username and password are required', 400);
    return;
  }

  try {
    const authService = new AuthService();
    await authService.login(request.username, request.password, undefined);
    writeSuccess({ authenticated: true });
  } catch (error: any) {
    writeError(
      error.message || 'Authentication failed',
      errorToStatusCode(error)
    );
  }
}

async function handleUploadCommand(request: BridgeRequest): Promise<void> {
  const { oid, path: filePath, storageBase = 'LFS' } = request;

  if (!oid || !filePath) {
    writeError('oid and path are required for upload', 400);
    return;
  }

  try {
    validateOid(oid);
    validateLocalPath(filePath);
    await fs.access(filePath);

    const client = await getInitializedClient(request);
    const basePath = await ensureBaseDir(client, storageBase);

    // Ensure prefix folder exists (first 2 chars of OID)
    const prefix = oid.substring(0, 2).toLowerCase();
    const prefixPath = await ensureOidFolder(client, basePath, prefix);

    // Ensure second-level folder exists (chars 2-4 of OID)
    const second = oid.substring(2, 4).toLowerCase();
    await ensureOidFolder(client, prefixPath, second);

    // Upload file using OID-based path
    const targetPath = oidToPath(storageBase, oid);
    const fileName = path.basename(targetPath);
    const parentPath = path.dirname(targetPath);

    const result = await client.uploadFile(filePath, parentPath, undefined, fileName);

    writeSuccess({
      oid,
      fileId: result.fileId,
      revisionId: result.revisionId,
      uploaded: true,
    });
  } catch (error: any) {
    writeError(
      error.message || 'Upload failed',
      errorToStatusCode(error)
    );
  }
}

async function handleDownloadCommand(request: BridgeRequest): Promise<void> {
  const { oid, outputPath, storageBase = 'LFS' } = request;

  if (!oid || !outputPath) {
    writeError('oid and outputPath are required for download', 400);
    return;
  }

  try {
    validateOid(oid);
    validateLocalPath(outputPath);

    const client = await getInitializedClient(request);

    const sourcePath = await findFileByOid(client, storageBase, oid);
    if (!sourcePath) {
      writeError(`File not found for OID: ${oid}`, 404);
      return;
    }

    const result = await client.downloadFile(sourcePath, outputPath);

    writeSuccess({
      oid,
      outputPath: result.filePath,
      size: result.size,
      downloaded: true,
    });
  } catch (error: any) {
    writeError(
      error.message || 'Download failed',
      errorToStatusCode(error)
    );
  }
}

async function handleListCommand(request: BridgeRequest): Promise<void> {
  const { folder, storageBase = 'LFS' } = request;

  try {
    const client = await getInitializedClient(request);
    const targetFolder = folder || `/${storageBase}`;

    const items = await listFolder(client, targetFolder);

    const files = items.map((item) => ({
      name: item.name,
      type: item.type,
      size: item.size,
      modifiedTime: item.modifiedTime,
    }));

    writeSuccess({ files });
  } catch (error: any) {
    writeError(
      error.message || 'List failed',
      errorToStatusCode(error)
    );
  }
}

// ─── Command registration ──────────────────────────────────────────

export function createBridgeCommand(): Command {
  const cmd = new Command('bridge');

  cmd
    .description(
      'Bridge mode for Git LFS integration — reads JSON from stdin, writes JSON to stdout'
    )
    .argument('<command>', 'Bridge command: auth, upload, download, list')
    .action(async (command: string) => {
      // Suppress all non-JSON output
      logger.setLevel(LogLevel.ERROR);

      try {
        const request = await readStdinJson();

        switch (command.toLowerCase()) {
          case 'auth':
            await handleAuthCommand(request);
            break;
          case 'upload':
            await handleUploadCommand(request);
            break;
          case 'download':
            await handleDownloadCommand(request);
            break;
          case 'list':
            await handleListCommand(request);
            break;
          default:
            writeError(`Unknown bridge command: ${command}`, 400);
        }
      } catch (error: any) {
        writeError(
          error.message || 'Bridge command failed',
          errorToStatusCode(error)
        );
        process.exit(1);
      }
    });

  return cmd;
}
