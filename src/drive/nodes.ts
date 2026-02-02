import { DriveApiClient } from '../api/drive';
import { Link, Node, NodeType } from '../types/drive';
import { driveCrypto } from '../crypto/drive-crypto';
import { DecryptedNodeContext } from '../types/crypto';

/**
 * NodeManager handles file and folder operations
 */
export class NodeManager {
  constructor(private driveApi: DriveApiClient) {}

  /**
   * Convert API Link to domain Node
   * Note: This returns the node with encrypted name - use decryptNodeName to decrypt it
   */
  private linkToNode(link: Link): Node {
    return {
      linkId: link.LinkID,
      parentLinkId: link.ParentLinkID,
      type: link.Type as NodeType,
      name: link.Name, // Still encrypted
      nameSignatureEmail: link.NameSignatureEmail,
      hash: link.Hash,
      state: link.State,
      mimeType: link.MIMEType,
      size: link.Size,
      createTime: link.CreateTime,
      modifyTime: link.ModifyTime,
      activeRevisionId: link.FileProperties?.ActiveRevision?.ID,
      nodeHashKey: link.FolderProperties?.NodeHashKey,
    };
  }

  /**
   * Get node (file or folder) by ID
   */
  async getNode(shareId: string, linkId: string): Promise<Node> {
    const link = await this.driveApi.getLink(shareId, linkId);
    return this.linkToNode(link);
  }

  /**
   * Get the raw Link by ID (for crypto operations)
   */
  async getLink(shareId: string, linkId: string): Promise<Link> {
    return await this.driveApi.getLink(shareId, linkId);
  }

  /**
   * List folder children with automatic pagination
   * Fetches all children across multiple pages if needed
   */
  async listFolderChildren(shareId: string, folderId: string): Promise<Node[]> {
    const allChildren: Node[] = [];
    let page = 0;
    const pageSize = 150;
    let hasMore = true;

    while (hasMore) {
      const links = await this.driveApi.listChildren(shareId, folderId, page, pageSize);

      // Convert to domain nodes
      const nodes = links.map((link) => this.linkToNode(link));
      allChildren.push(...nodes);

      // Check if there are more pages
      hasMore = links.length === pageSize;
      page++;
    }

    return allChildren;
  }

  /**
   * List folder children (raw Links) with automatic pagination
   * This is useful when you need the full Link objects for crypto operations
   */
  async listFolderChildrenLinks(shareId: string, folderId: string): Promise<Link[]> {
    const allLinks: Link[] = [];
    let page = 0;
    const pageSize = 150;
    let hasMore = true;

    while (hasMore) {
      const links = await this.driveApi.listChildren(shareId, folderId, page, pageSize);
      allLinks.push(...links);

      // Check if there are more pages
      hasMore = links.length === pageSize;
      page++;
    }

    return allLinks;
  }

  /**
   * Decrypt a node's name using the parent folder's crypto context
   * @param link - The link to decrypt
   * @param parentContext - The parent folder's crypto context (contains private key)
   */
  async decryptNodeName(link: Link, parentContext: DecryptedNodeContext): Promise<string> {
    return await driveCrypto.decryptName(link, parentContext);
  }

  /**
   * Find child by name in folder
   * Note: This requires decrypting all names in the folder to match
   * @param shareId - Share ID
   * @param folderId - Folder link ID
   * @param name - The decrypted name to search for
   * @param parentContext - Parent folder's crypto context for decryption
   */
  async findChildByName(
    shareId: string,
    folderId: string,
    name: string,
    parentContext: DecryptedNodeContext
  ): Promise<{ node: Node; link: Link } | null> {
    const links = await this.listFolderChildrenLinks(shareId, folderId);

    for (const link of links) {
      try {
        const decryptedName = await this.decryptNodeName(link, parentContext);
        if (decryptedName === name) {
          return {
            node: this.linkToNode(link),
            link: link,
          };
        }
      } catch (error) {
        // Skip links that fail to decrypt
        console.warn(`Failed to decrypt link ${link.LinkID}: ${error}`);
      }
    }

    return null;
  }

  /**
   * Check if node is a folder
   */
  isFolder(node: Node): boolean {
    return node.type === NodeType.FOLDER;
  }

  /**
   * Check if node is a file
   */
  isFile(node: Node): boolean {
    return node.type === NodeType.FILE;
  }
}
