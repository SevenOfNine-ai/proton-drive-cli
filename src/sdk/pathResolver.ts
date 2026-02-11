/**
 * Path resolver utility for the Proton Drive SDK.
 *
 * The SDK uses node UIDs (not paths). This utility resolves human-readable
 * paths like "/LFS/ab/c1/abc123..." to SDK node UIDs by traversing the
 * folder tree via iterateFolderChildren.
 */

import type { ProtonDriveClient, NodeType } from '@protontech/drive-sdk';
import { logger } from '../utils/logger';

/**
 * Resolve a path string to a node UID by traversing the folder tree.
 *
 * @param client - Initialized ProtonDriveClient
 * @param path - Path like "/LFS/ab/c1" (leading/trailing slashes ignored)
 * @returns Node UID of the resolved path
 * @throws Error if any path component is not found
 */
export async function resolvePathToNodeUid(
  client: ProtonDriveClient,
  path: string,
): Promise<string> {
  if (path.includes('\0')) throw new Error('Null byte in path');
  if (path.split(/[/\\]/).includes('..')) throw new Error('Path traversal not allowed');
  const parts = path.split('/').filter((p) => p.length > 0);

  const root = await client.getMyFilesRootFolder();
  if (!root.ok) {
    throw new Error('Could not get root folder');
  }
  let currentUid = root.value.uid;

  for (const part of parts) {
    let found = false;
    for await (const child of client.iterateFolderChildren(currentUid)) {
      if (child.ok && child.value.name === part) {
        currentUid = child.value.uid;
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(`Not found: "${part}" in path "${path}"`);
    }
  }

  return currentUid;
}

/**
 * Resolve a path string, creating missing folders along the way.
 *
 * @param client - Initialized ProtonDriveClient
 * @param path - Path like "/LFS/ab/c1"
 * @returns Node UID of the final folder
 */
export async function ensureFolderPath(
  client: ProtonDriveClient,
  path: string,
): Promise<string> {
  if (path.includes('\0')) throw new Error('Null byte in path');
  if (path.split(/[/\\]/).includes('..')) throw new Error('Path traversal not allowed');
  const parts = path.split('/').filter((p) => p.length > 0);

  const root = await client.getMyFilesRootFolder();
  if (!root.ok) {
    throw new Error('Could not get root folder');
  }
  let currentUid = root.value.uid;

  for (const part of parts) {
    let found = false;
    for await (const child of client.iterateFolderChildren(currentUid)) {
      if (child.ok && child.value.name === part) {
        currentUid = child.value.uid;
        found = true;
        break;
      }
    }
    if (!found) {
      logger.debug(`Creating folder: ${part}`);
      const created = await client.createFolder(currentUid, part);
      if (!created.ok) {
        throw new Error(`Failed to create folder "${part}": ${JSON.stringify(created.error)}`);
      }
      currentUid = created.value.uid;
    }
  }

  return currentUid;
}

/**
 * Find a file by name in a folder identified by UID.
 *
 * @param client - Initialized ProtonDriveClient
 * @param folderUid - UID of the parent folder
 * @param fileName - Name to search for
 * @returns Node UID of the file, or null if not found
 */
export async function findFileInFolder(
  client: ProtonDriveClient,
  folderUid: string,
  fileName: string,
): Promise<string | null> {
  for await (const child of client.iterateFolderChildren(folderUid)) {
    if (child.ok && child.value.name === fileName && child.value.type === ('file' as NodeType)) {
      return child.value.uid;
    }
  }
  return null;
}
