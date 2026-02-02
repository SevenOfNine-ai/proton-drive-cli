import { NodeManager } from './nodes';
import { VolumeManager } from './volumes';
import { NodeType, NodeIdentity } from '../types/drive';
import { driveCrypto } from '../crypto/drive-crypto';
import { DecryptedShareContext, DecryptedNodeContext } from '../types/crypto';
import { Link } from '../types/drive';

/**
 * Result of path resolution including crypto context
 */
export interface ResolvedPath {
  identity: NodeIdentity;
  folderContext: DecryptedNodeContext;
  folderLink: Link;
  shareContext: DecryptedShareContext;
}

/**
 * PathResolver handles path-based navigation in the Drive hierarchy
 * Allows resolving paths like "/Documents/Projects" to node identities
 */
export class PathResolver {
  constructor(
    private volumeManager: VolumeManager,
    private nodeManager: NodeManager
  ) {}

  /**
   * Resolve a path string to a node identity with crypto context
   * @param path - Path like "/Documents/Projects" or "Documents/Projects"
   * @param volumeId - Optional volume ID (uses main volume if not specified)
   * @returns ResolvedPath with identity, contexts, and link
   */
  async resolvePath(path: string, volumeId?: string): Promise<ResolvedPath> {
    // Get volume
    const volume = volumeId
      ? await this.volumeManager.getVolume(volumeId)
      : await this.volumeManager.getMainVolume();

    // Get share
    const share = await this.volumeManager.getShare(volume.Share.ShareID);

    // Initialize crypto for share
    const shareContext = await driveCrypto.decryptShare(share);

    // Start at root
    let currentLinkId = share.LinkID;
    let currentLink = await this.nodeManager.getLink(share.ShareID, currentLinkId);
    let currentNodeContext = await driveCrypto.decryptNode(currentLink, shareContext);

    // Parse path
    const parts = path
      .split('/')
      .filter((p) => p.length > 0 && p !== '.'); // Remove empty parts and "."

    // If path is empty or "/", return root
    if (parts.length === 0) {
      return {
        identity: {
          volumeId: volume.VolumeID,
          shareId: share.ShareID,
          linkId: currentLinkId,
        },
        folderContext: currentNodeContext,
        folderLink: currentLink,
        shareContext,
      };
    }

    // Traverse path
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // Handle ".." - go to parent
      if (part === '..') {
        if (currentLink.ParentLinkID) {
          currentLinkId = currentLink.ParentLinkID;
          currentLink = await this.nodeManager.getLink(share.ShareID, currentLinkId);

          // Decrypt parent: check if it's root or has a parent
          if (currentLink.ParentLinkID === null) {
            // It's the root folder
            currentNodeContext = await driveCrypto.decryptNode(currentLink, shareContext);
          } else {
            // It has a parent, need to get grandparent's context
            const grandparentContext = await this.getNodeContextRecursive(share.ShareID, currentLink.ParentLinkID, shareContext);
            currentNodeContext = await driveCrypto.decryptNodeWithParent(currentLink, grandparentContext);
          }
        } else {
          throw new Error('Already at root folder, cannot go up');
        }
        continue;
      }

      // Find child by name
      const childResult = await this.nodeManager.findChildByName(
        share.ShareID,
        currentLinkId,
        part,
        currentNodeContext
      );

      if (!childResult) {
        const pathSoFar = '/' + parts.slice(0, i + 1).join('/');
        throw new Error(`Path not found: ${pathSoFar} (folder "${part}" does not exist)`);
      }

      if (childResult.node.type !== NodeType.FOLDER) {
        const pathSoFar = '/' + parts.slice(0, i + 1).join('/');
        throw new Error(`Path component is not a folder: ${pathSoFar} (${part} is a file)`);
      }

      // Move to child folder and decrypt it with current folder's context
      currentLinkId = childResult.node.linkId;
      currentLink = childResult.link;
      currentNodeContext = await driveCrypto.decryptNodeWithParent(currentLink, currentNodeContext);
    }

    return {
      identity: {
        volumeId: volume.VolumeID,
        shareId: share.ShareID,
        linkId: currentLinkId,
      },
      folderContext: currentNodeContext,
      folderLink: currentLink,
      shareContext,
    };
  }

  /**
   * Helper to get node context recursively (for ".." navigation)
   */
  private async getNodeContextRecursive(
    shareId: string,
    linkId: string,
    shareContext: DecryptedShareContext
  ): Promise<DecryptedNodeContext> {
    const link = await this.nodeManager.getLink(shareId, linkId);

    if (link.ParentLinkID === null) {
      // Root folder
      return await driveCrypto.decryptNode(link, shareContext);
    } else {
      // Get parent context first
      const parentContext = await this.getNodeContextRecursive(shareId, link.ParentLinkID, shareContext);
      return await driveCrypto.decryptNodeWithParent(link, parentContext);
    }
  }

  /**
   * Resolve path to the parent folder and return the target name
   * Useful for operations like "create file at path"
   * @param path - Full path like "/Documents/Projects/file.txt"
   * @returns Parent folder resolved path and the target name
   */
  async resolveParentPath(
    path: string
  ): Promise<{ parent: ResolvedPath; targetName: string }> {
    const parts = path.split('/').filter((p) => p.length > 0);

    if (parts.length === 0) {
      throw new Error('Cannot resolve parent of root path');
    }

    const targetName = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';

    const parent = await this.resolvePath(parentPath);

    return { parent, targetName };
  }

  /**
   * Resolve path and get just the identity (without contexts)
   * Useful when you don't need the crypto contexts
   */
  async resolvePathIdentity(path: string, volumeId?: string): Promise<NodeIdentity> {
    const resolved = await this.resolvePath(path, volumeId);
    return resolved.identity;
  }

  /**
   * Check if a path exists
   * @param path - Path to check
   * @returns true if path exists, false otherwise
   */
  async pathExists(path: string): Promise<boolean> {
    try {
      await this.resolvePath(path);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Normalize path (remove trailing slash, resolve ..)
   * @param path - Path to normalize
   * @returns Normalized path
   */
  normalizePath(path: string): string {
    const parts = path
      .split('/')
      .filter((p) => p !== '' && p !== '.')
      .reduce((acc: string[], part) => {
        if (part === '..') {
          acc.pop();
        } else {
          acc.push(part);
        }
        return acc;
      }, []);

    return '/' + parts.join('/');
  }
}
