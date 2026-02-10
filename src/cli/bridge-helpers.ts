/**
 * Helper functions for Git LFS bridge operations
 * Handles OID-based path mapping and folder structure for Git LFS objects
 */

import { DriveClient } from '../drive/client';
import { logger } from '../utils/logger';

/**
 * Listing result item (simplified from DriveClient internals)
 */
export interface ListItem {
  name: string;
  type: 'file' | 'folder';
  size: number;
  modifiedTime: number;
}

/**
 * Convert Git LFS OID to Proton Drive path
 * Uses 2-character prefix directories for distribution (same as Git LFS)
 *
 * @param storageBase - Base directory in Drive (e.g., "LFS")
 * @param oid - Git LFS object ID (64-character hex string)
 * @returns Full path in Drive (e.g., "/LFS/ab/c123...")
 *
 * @example
 * oidToPath("LFS", "abc123...64chars") => "/LFS/ab/c123...62chars"
 */
export function oidToPath(storageBase: string, oid: string): string {
  if (!oid || oid.length < 2) {
    throw new Error(`Invalid OID: must be at least 2 characters, got: ${oid}`);
  }

  // Validate OID format (64-character hex string)
  if (!/^[a-f0-9]{64}$/i.test(oid)) {
    throw new Error(`Invalid OID format: expected 64-character hex string, got: ${oid}`);
  }

  // Normalize storage base (remove leading/trailing slashes)
  const normalizedBase = storageBase.replace(/^\/+|\/+$/g, '');

  // Extract prefix (first 2 characters) and remaining portion
  const prefix = oid.substring(0, 2).toLowerCase();
  const remaining = oid.substring(2).toLowerCase();

  // Build path: /base/prefix/remaining
  return `/${normalizedBase}/${prefix}/${remaining}`;
}

/**
 * Extract OID from Proton Drive path
 * Reverses oidToPath operation
 *
 * @param filePath - Full path in Drive (e.g., "/LFS/ab/c123...")
 * @returns OID (64-character hex string)
 *
 * @example
 * pathToOid("/LFS/ab/c123...") => "abc123..."
 */
export function pathToOid(filePath: string): string {
  // Remove leading slash and split
  const parts = filePath.replace(/^\/+/, '').split('/');

  if (parts.length < 3) {
    throw new Error(`Invalid OID path format: ${filePath}`);
  }

  // parts[0] = base (e.g., "LFS")
  // parts[1] = prefix (e.g., "ab")
  // parts[2] = remaining (e.g., "c123...")
  const prefix = parts[1];
  const remaining = parts[2];

  if (prefix.length !== 2) {
    throw new Error(`Invalid prefix in path: ${filePath}`);
  }

  const oid = prefix + remaining;

  // Validate reconstructed OID
  if (!/^[a-f0-9]{64}$/i.test(oid)) {
    throw new Error(`Invalid OID reconstructed from path: ${oid}`);
  }

  return oid.toLowerCase();
}

/**
 * Ensure OID prefix folder exists in Proton Drive
 * Creates the 2-character prefix directory if it doesn't exist
 *
 * @param client - Initialized DriveClient
 * @param parentPath - Parent directory path (e.g., "/LFS")
 * @param prefix - 2-character prefix (e.g., "ab")
 * @returns Path to prefix folder
 */
export async function ensureOidFolder(
  client: DriveClient,
  parentPath: string,
  prefix: string
): Promise<string> {
  if (prefix.length !== 2) {
    throw new Error(`Invalid prefix: must be 2 characters, got: ${prefix}`);
  }

  const prefixPath = `${parentPath}/${prefix}`;

  try {
    // Check if prefix folder exists by trying to resolve it
    await client.paths().resolvePath(prefixPath);
    logger.debug(`Prefix folder already exists: ${prefixPath}`);
    return prefixPath;
  } catch (error: any) {
    // Folder doesn't exist, need to create it
    if (error?.message?.includes('not found') || error?.message?.includes('Not found')) {
      logger.debug(`Creating prefix folder: ${prefixPath}`);
      await client.createFolder(parentPath, prefix);
      return prefixPath;
    }
    throw error;
  }
}

/**
 * Find file by OID in Proton Drive
 * Resolves OID to full Drive path and checks if file exists
 *
 * @param client - Initialized DriveClient
 * @param storageBase - Base directory (e.g., "LFS")
 * @param oid - Git LFS object ID
 * @returns Full path if file exists, null if not found
 */
export async function findFileByOid(
  client: DriveClient,
  storageBase: string,
  oid: string
): Promise<string | null> {
  const fullPath = oidToPath(storageBase, oid);

  // Resolve the parent folder (prefix directory) and look for the file
  const pathParts = fullPath.split('/').filter((p) => p.length > 0);
  const fileName = pathParts[pathParts.length - 1]; // remaining OID chars
  const folderPath = '/' + pathParts.slice(0, -1).join('/'); // /base/prefix

  try {
    const resolved = await client.paths().resolvePath(folderPath);

    // List children and find the file by decrypted name
    const links = await client.nodes().listFolderChildrenLinks(
      resolved.identity.shareId,
      resolved.identity.linkId
    );

    for (const link of links) {
      try {
        const decryptedName = await client.nodes().decryptNodeName(link, resolved.folderContext);
        if (decryptedName === fileName && link.Type === 2) {
          logger.debug(`Found file by OID: ${fullPath}`);
          return fullPath;
        }
      } catch (error) {
        // Skip items that can't be decrypted
        continue;
      }
    }

    logger.debug(`File not found by OID: ${fullPath}`);
    return null;
  } catch (error: any) {
    if (error?.message?.includes('not found') || error?.message?.includes('Not found')) {
      logger.debug(`Prefix folder not found for OID: ${fullPath}`);
      return null;
    }
    throw error;
  }
}

/**
 * List folder contents using DriveClient internals
 *
 * @param client - Initialized DriveClient
 * @param folderPath - Path to list (e.g., "/LFS")
 * @returns Array of ListItem
 */
export async function listFolder(
  client: DriveClient,
  folderPath: string
): Promise<ListItem[]> {
  const resolved = await client.paths().resolvePath(folderPath);
  const links = await client.nodes().listFolderChildrenLinks(
    resolved.identity.shareId,
    resolved.identity.linkId
  );

  const items: ListItem[] = [];
  for (const link of links) {
    try {
      const decryptedName = await client.nodes().decryptNodeName(link, resolved.folderContext);
      items.push({
        name: decryptedName,
        type: link.Type === 1 ? 'folder' : 'file',
        size: link.Size || 0,
        modifiedTime: link.ModifyTime || 0,
      });
    } catch (error) {
      // Skip items that can't be decrypted
      continue;
    }
  }

  return items;
}

/**
 * List all OIDs in a specific prefix folder or all prefix folders
 *
 * @param client - Initialized DriveClient
 * @param storageBase - Base directory (e.g., "LFS")
 * @param prefix - 2-character prefix (e.g., "ab") or null for all
 * @returns Array of OIDs
 */
export async function listOids(
  client: DriveClient,
  storageBase: string,
  prefix: string | null = null
): Promise<string[]> {
  const normalizedBase = storageBase.replace(/^\/+|\/+$/g, '');
  const basePath = `/${normalizedBase}`;

  // If prefix specified, list just that folder
  if (prefix) {
    if (prefix.length !== 2) {
      throw new Error(`Invalid prefix: must be 2 characters, got: ${prefix}`);
    }

    const prefixPath = `${basePath}/${prefix}`;
    try {
      const items = await listFolder(client, prefixPath);
      return items
        .filter((item) => item.type === 'file')
        .map((item) => prefix + item.name.toLowerCase());
    } catch (error: any) {
      if (error?.message?.includes('not found') || error?.message?.includes('Not found')) {
        return [];
      }
      throw error;
    }
  }

  // List all prefix folders and aggregate OIDs
  const allOids: string[] = [];
  try {
    const prefixFolders = await listFolder(client, basePath);

    for (const folder of prefixFolders) {
      if (folder.type !== 'folder' || folder.name.length !== 2) {
        continue;
      }

      const prefixPath = `${basePath}/${folder.name}`;
      const items = await listFolder(client, prefixPath);

      for (const item of items) {
        if (item.type === 'file') {
          allOids.push(folder.name.toLowerCase() + item.name.toLowerCase());
        }
      }
    }
  } catch (error: any) {
    if (error?.message?.includes('not found') || error?.message?.includes('Not found')) {
      return [];
    }
    throw error;
  }

  return allOids;
}
