import { DriveApiClient } from '../api/drive';
import { driveCrypto } from '../crypto/drive-crypto';
import { cryptoService } from '../crypto';
import { VolumeManager } from './volumes';
import { NodeManager } from './nodes';
import { PathResolver } from './pathResolver';
import { FileUploader, UploadContext } from './uploader';
import { FileDownloader, DownloadContext } from './downloader';
import { SessionManager } from '../auth/session';
import { UploadResult } from '../types/upload';
import { DownloadOptions, DownloadResult } from '../types/download';
import { Link } from '../types/drive';
import { DecryptedNodeContext } from '../types/crypto';

/**
 * DriveClient - Main entry point for Drive operations
 * Orchestrates all Drive managers and provides high-level operations
 */
export class DriveClient {
  private driveApi: DriveApiClient;
  private volumeManager: VolumeManager;
  private nodeManager: NodeManager;
  private pathResolver: PathResolver;
  private fileUploader: FileUploader;
  private fileDownloader: FileDownloader;
  private initialized: boolean = false;

  constructor(apiBaseUrl: string = 'https://drive-api.proton.me') {
    // Initialize API client
    this.driveApi = new DriveApiClient(apiBaseUrl);

    // Initialize managers
    this.volumeManager = new VolumeManager(this.driveApi);
    this.nodeManager = new NodeManager(this.driveApi);
    this.pathResolver = new PathResolver(this.volumeManager, this.nodeManager);
    this.fileUploader = new FileUploader(this.driveApi, cryptoService, driveCrypto);
    this.fileDownloader = new FileDownloader(this.driveApi, cryptoService);
  }

  /**
   * Initialize the Drive client with crypto
   * Must be called before performing any operations that require decryption
   * @param mailboxPassword - User's mailbox password for key decryption
   */
  async initialize(mailboxPassword: string): Promise<void> {
    await driveCrypto.initialize(mailboxPassword);
    this.initialized = true;
  }

  /**
   * Initialize from session with an externally-provided password.
   * The password is required because it is never persisted to disk —
   * it flows via stdin from pass-cli on every invocation.
   * @param mailboxPassword - User's mailbox password for key decryption
   */
  async initializeFromSession(mailboxPassword: string): Promise<void> {
    const session = await SessionManager.loadSession();
    if (!session) {
      throw new Error('No session found. Please login first.');
    }

    await this.initialize(mailboxPassword);
  }

  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the volume manager
   */
  volumes(): VolumeManager {
    return this.volumeManager;
  }

  /**
   * Get the node manager
   */
  nodes(): NodeManager {
    return this.nodeManager;
  }

  /**
   * Get the path resolver
   */
  paths(): PathResolver {
    return this.pathResolver;
  }

  /**
   * Get the raw Drive API client
   */
  api(): DriveApiClient {
    return this.driveApi;
  }

  /**
   * Get crypto service
   */
  crypto() {
    return driveCrypto;
  }

  /**
   * Upload a file to a specific path
   * @param filePath - Local file path
   * @param destinationPath - Destination path in Drive (e.g., '/Documents')
   * @param onProgress - Progress callback (uploaded bytes, total bytes)
   * @param fileName - Optional filename override (useful for stdin uploads with temp files)
   * @returns Upload result
   */
  async uploadFile(
    filePath: string,
    destinationPath: string,
    onProgress?: (uploaded: number, total: number) => void,
    fileName?: string
  ): Promise<UploadResult> {
    if (!this.initialized) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    // Resolve the destination path to get parent folder context
    const resolvedPath = await this.pathResolver.resolvePath(destinationPath);

    // Create upload context
    const uploadContext: UploadContext = {
      parentNodeContext: resolvedPath.folderContext,
      volumeId: resolvedPath.identity.volumeId,
      shareId: resolvedPath.identity.shareId,
      parentLinkId: resolvedPath.identity.linkId,
    };

    // Upload the file
    return await this.fileUploader.uploadFile(filePath, uploadContext, onProgress, fileName);
  }

  /**
   * Download a file from a specific path
   * @param sourcePath - Source path in Drive (e.g., '/Documents/file.pdf')
   * @param outputPath - Local output path
   * @param onProgress - Progress callback (downloaded bytes, total bytes)
   * @param skipVerification - Skip manifest signature verification (not recommended)
   * @returns Download result
   */
  async downloadFile(
    sourcePath: string,
    outputPath: string,
    onProgress?: (downloaded: number, total: number) => void,
    skipVerification?: boolean
  ): Promise<DownloadResult> {
    if (!this.initialized) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    // Parse path to get parent folder and file name
    const pathParts = sourcePath.split('/').filter(p => p.length > 0);
    if (pathParts.length === 0) {
      throw new Error('Invalid path: must specify a file');
    }

    const fileName = pathParts[pathParts.length - 1];
    const folderPath = pathParts.length > 1 ? '/' + pathParts.slice(0, -1).join('/') : '/';

    // Resolve parent folder
    const resolvedPath = await this.pathResolver.resolvePath(folderPath);

    // Find file in parent folder by decrypted name
    const fileResult = await this.nodeManager.findChildByName(
      resolvedPath.identity.shareId,
      resolvedPath.identity.linkId,
      fileName,
      resolvedPath.folderContext
    );

    if (!fileResult) {
      throw new Error(`File not found: ${sourcePath}`);
    }

    const { node: fileNode, link: fileLink } = fileResult;

    // Verify it's a file (NodeType.FILE = 2, NodeType.FOLDER = 1)
    if (fileNode.type !== 2) {
      throw new Error(`Path is not a file: ${sourcePath}`);
    }

    const decryptedName = fileName; // Already verified by findChildByName

    // Get file revision
    if (!fileLink.FileProperties?.ActiveRevision) {
      throw new Error(`File has no active revision: ${sourcePath}`);
    }

    const revisionId = fileLink.FileProperties.ActiveRevision.ID;

    // Decrypt file's node key
    const fileContext = await driveCrypto.decryptNodeWithParent(
      fileLink,
      resolvedPath.folderContext
    );

    // Decrypt content session key from ContentKeyPacket
    if (!fileLink.FileProperties?.ContentKeyPacket) {
      throw new Error(`File has no content key packet: ${sourcePath}`);
    }

    const contentSessionKey = await cryptoService.decryptSessionKey(
      fileLink.FileProperties.ContentKeyPacket,
      fileContext.nodeKey
    );

    // Get address for signature verification
    const addressId = driveCrypto.getPrimaryAddressId();
    if (!addressId) {
      throw new Error('No address ID available');
    }

    const addressEmail = driveCrypto.getPrimaryAddressEmail();
    if (!addressEmail) {
      throw new Error('No address email available');
    }

    const addressKey = driveCrypto.getSigningKey(addressId);

    // Create download context
    const downloadContext: DownloadContext = {
      volumeId: resolvedPath.identity.volumeId,
      linkId: fileLink.LinkID,
      revisionId: revisionId,
      fileName: decryptedName,
      fileSize: fileLink.Size || 0,
      contentSessionKey: contentSessionKey,
      nodeKey: fileContext.nodeKey,
      signatureAddress: addressEmail,
      addressKey: addressKey,
    };

    // Download the file
    const options: DownloadOptions = {
      outputPath,
      onProgress,
      skipVerification,
    };

    return await this.fileDownloader.downloadFile(downloadContext, options);
  }

  /**
   * Create a new folder at the specified path
   * @param destinationPath - Destination path (e.g., '/Documents' creates 'Documents' in root)
   * @param folderName - Name of the folder to create
   * @param modificationTime - Optional modification time (defaults to current time)
   * @returns Created folder ID
   */
  async createFolder(
    destinationPath: string,
    folderName: string,
    modificationTime?: Date
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    // Validate folder name
    this.validateFolderName(folderName);

    // Resolve the destination path (parent folder)
    const resolvedPath = await this.pathResolver.resolvePath(destinationPath);

    // Get parent's hash key (needed for name lookup hash)
    const parentHashKey = await this.getParentHashKey(
      resolvedPath.folderLink,
      resolvedPath.folderContext
    );

    // Get signing key
    const addressId = driveCrypto.getPrimaryAddressId();
    if (!addressId) {
      throw new Error('No address ID available');
    }

    const addressEmail = driveCrypto.getPrimaryAddressEmail();
    if (!addressEmail) {
      throw new Error('No address email available');
    }

    const signingKey = driveCrypto.getSigningKey(addressId);

    // Create folder encryption metadata
    const { createFolderEncryption } = await import('../crypto/folder-crypto');
    const { metadata } = await createFolderEncryption(
      folderName,
      resolvedPath.folderContext.nodeKey,
      parentHashKey,
      signingKey,
      addressEmail,
      modificationTime
    );

    // Create folder via API
    const folderId = await this.driveApi.createFolder(
      resolvedPath.identity.volumeId,
      {
        ShareID: resolvedPath.identity.shareId,
        ParentLinkID: resolvedPath.identity.linkId,
        Name: metadata.encryptedName,
        Hash: metadata.lookupHash,
        NodeKey: metadata.nodeKey,
        NodePassphrase: metadata.nodePassphrase,
        NodePassphraseSignature: metadata.nodePassphraseSignature,
        SignatureEmail: metadata.signatureEmail,
        NodeHashKey: metadata.nodeHashKey,
      }
    );

    return folderId;
  }

  /**
   * Validate folder name
   * @param name - Folder name to validate
   */
  private validateFolderName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new Error('Folder name cannot be empty');
    }

    if (name.length > 255) {
      throw new Error('Folder name must be 255 characters or less');
    }

    if (name.includes('/')) {
      throw new Error("Folder name cannot contain '/'");
    }

    if (name === '.' || name === '..') {
      throw new Error("Folder name cannot be '.' or '..'");
    }
  }

  /**
   * Get parent folder's hash key
   * @param parentLink - Parent folder link
   * @param parentContext - Parent folder context
   * @returns Hash key as Uint8Array
   */
  private async getParentHashKey(
    parentLink: Link,
    parentContext: DecryptedNodeContext
  ): Promise<Uint8Array> {
    // For root folders, hash key is in FolderProperties
    if (parentLink.FolderProperties?.NodeHashKey) {
      // Decrypt the hash key
      const decryptedHashKey = await cryptoService.decryptMessage(
        parentLink.FolderProperties.NodeHashKey,
        parentContext.nodeKey
      );

      // Convert from hex string to Uint8Array
      const bytes = new Uint8Array(decryptedHashKey.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(decryptedHashKey.substr(i * 2, 2), 16);
      }
      return bytes;
    }

    throw new Error('Parent folder has no hash key');
  }
}

/**
 * Create a new Drive client instance
 */
export function createDriveClient(apiBaseUrl?: string): DriveClient {
  return new DriveClient(apiBaseUrl);
}
