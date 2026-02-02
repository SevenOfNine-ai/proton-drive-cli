import * as path from 'path';
import * as fs from 'fs/promises';
import * as openpgp from 'openpgp';
import * as mime from 'mime-types';
import { DriveApiClient } from '../api/drive';
import { CryptoService } from '../crypto';
import { DriveCryptoService } from '../crypto/drive-crypto';
import { FileChunker } from './chunker';
import { BlockEncryptor } from './blockEncryptor';
import { FileMetadataCreator } from './fileMetadata';
import {
  UploadOptions,
  UploadResult,
  FileBlock,
  MAX_PARALLEL_BLOCKS,
} from '../types/upload';
import { DecryptedNodeContext } from '../types/crypto';
import { verboseLog } from '../utils/output';

export interface UploadContext {
  parentNodeContext: DecryptedNodeContext;
  volumeId: string;
  shareId: string;
  parentLinkId: string;
}

export class FileUploader {
  private chunker: FileChunker;
  private encryptor: BlockEncryptor;
  private metadataCreator: FileMetadataCreator;

  constructor(
    private driveApi: DriveApiClient,
    private crypto: CryptoService,
    private driveCrypto: DriveCryptoService
  ) {
    this.chunker = new FileChunker();
    this.encryptor = new BlockEncryptor(crypto);
    this.metadataCreator = new FileMetadataCreator(crypto);
  }

  /**
   * Upload a file
   */
  async uploadFile(
    filePath: string,
    uploadContext: UploadContext,
    onProgress?: (uploaded: number, total: number) => void,
    fileName?: string
  ): Promise<UploadResult> {
    // Validate file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    // Use provided fileName or extract from filePath
    const actualFileName = fileName || path.basename(filePath);
    const fileSize = await this.chunker.getFileSize(filePath);
    const blockCount = this.chunker.calculateBlockCount(fileSize);

    verboseLog(
      `\nUploading: ${actualFileName} (${this.formatSize(fileSize)}, ${blockCount} block${blockCount > 1 ? 's' : ''})`
    );

    // Get signing key and address email
    const addressId = this.driveCrypto.getPrimaryAddressId();
    if (!addressId) {
      throw new Error('No address ID available');
    }

    const addressEmail = this.driveCrypto.getPrimaryAddressEmail();
    if (!addressEmail) {
      throw new Error('No address email available');
    }

    const signingKey = this.driveCrypto.getSigningKey(addressId);

    // Step 1: Generate node passphrase
    const nodePassphrase = this.metadataCreator.generateNodePassphrase();

    // Step 2: Generate node key pair (private key encrypted with passphrase)
    const nodeKeyPair = await this.crypto.generateKeyPair(
      `file-${actualFileName}`,
      nodePassphrase
    );

    // The NodeKey is the encrypted private key (for storage in the API)
    const nodeKey = nodeKeyPair.encryptedPrivateKeyArmored;

    // Use the DECRYPTED private key for all cryptographic operations
    const nodePrivateKey = nodeKeyPair.decryptedPrivateKey;

    // Step 3: Generate content session key (using the decrypted private key)
    const contentSessionKey = await this.crypto.generateSessionKeyForKey(
      nodePrivateKey
    );

    // Step 4: Encrypt file name with parent's key
    const encryptedName = await this.metadataCreator.encryptFileName(
      actualFileName,
      uploadContext.parentNodeContext.nodeKey
    );

    const nameHash = this.metadataCreator.generateNameHash(
      uploadContext.parentLinkId,
      actualFileName
    );

    // Step 5: Encrypt node passphrase with parent's key
    const encryptedNodePassphrase = await this.metadataCreator.encryptNodePassphrase(
      nodePassphrase,
      uploadContext.parentNodeContext.nodeKey
    );

    // Sign the node passphrase
    const nodePassphraseSignature = await this.metadataCreator.signText(
      nodePassphrase,
      signingKey
    );

    // Step 6: Encrypt content session key with the SAME decrypted private key
    // OpenPGP will internally extract the public key from it
    const { keyPacket: contentKeyPacket } = await this.crypto.encryptSessionKey(
      contentSessionKey,
      [nodePrivateKey]
    );

    // Sign the session key DATA, not the key packet
    const contentKeyPacketSignature = await this.metadataCreator.signData(
      contentSessionKey.data,
      nodePrivateKey  // Sign with node key
    );

    // Step 7: Detect MIME type from file extension (use actualFileName for better detection)
    const mimeType = mime.lookup(actualFileName) || 'application/octet-stream';

    // Step 8: Create file metadata on server
    verboseLog('Creating file metadata...');
    const createFileResponse = await this.driveApi.createFile(uploadContext.shareId, {
      ParentLinkID: uploadContext.parentLinkId,
      Name: encryptedName,
      Hash: nameHash,
      MIMEType: mimeType,
      NodeKey: nodeKey,
      NodePassphrase: encryptedNodePassphrase,
      NodePassphraseSignature: nodePassphraseSignature,
      SignatureAddress: addressEmail,
      ContentKeyPacket: Buffer.from(contentKeyPacket).toString('base64'),
      ContentKeyPacketSignature: contentKeyPacketSignature,
    });

    const fileId = createFileResponse.File.ID;
    const revisionId = createFileResponse.File.RevisionID;

    verboseLog(`✓ File created (ID: ${fileId})`);

    // Step 9: Read and encrypt blocks
    verboseLog('Reading and encrypting blocks...');
    const blocks: FileBlock[] = [];

    for await (const block of this.chunker.chunkFile(filePath)) {
      blocks.push(block);
    }

    const encryptedBlocks = await this.encryptor.encryptBlocks(
      blocks,
      contentSessionKey,
      nodePrivateKey,  // Node key for encrypting the signature
      signingKey,      // Address key for signing the block data
      MAX_PARALLEL_BLOCKS
    );

    verboseLog(`✓ ${blocks.length} block${blocks.length > 1 ? 's' : ''} encrypted`);

    // Step 10: Get verification data
    verboseLog('Getting verification data...');
    const verificationData = await this.driveApi.getVerificationData(
      uploadContext.volumeId,
      fileId,
      revisionId
    );

    const verificationCode = Buffer.from(verificationData.VerificationCode, 'base64');

    // Step 11: Compute verification tokens for each block
    const blocksWithTokens = encryptedBlocks.map((block) => {
      const verificationToken = this.crypto.computeVerificationToken(
        verificationCode,
        block.encryptedData!
      );
      return {
        ...block,
        verificationToken,
      };
    });

    // Step 12: Create block upload links
    verboseLog('Getting upload URLs...');
    const blockList = blocksWithTokens.map((block) => ({
      Index: block.index,
      Hash: Buffer.from(block.hash, 'hex').toString('base64'),  // Convert hex to base64
      EncSignature: block.encryptedSignature!,
      Size: block.encryptedData!.length,
      Verifier: {
        Token: Buffer.from(block.verificationToken).toString('base64'),
      },
    }));

    const blockLinks = await this.driveApi.createBlockLinks(
      uploadContext.volumeId,
      uploadContext.shareId,
      fileId,
      revisionId,
      addressId,
      blockList
    );

    // Step 13: Upload blocks
    verboseLog('Uploading blocks...');
    let uploadedBytes = 0;

    if (!blockLinks || !blockLinks.UploadLinks) {
      throw new Error(`Invalid block links response: ${JSON.stringify(blockLinks)}`);
    }

    for (let i = 0; i < blocksWithTokens.length; i++) {
      const block = blocksWithTokens[i];
      const blockLink = blockLinks.UploadLinks.find((b) => b.Index === block.index);

      if (!blockLink) {
        throw new Error(`No upload URL for block ${block.index}. Available blocks: ${blockLinks.UploadLinks.map(b => b.Index).join(', ')}`);
      }

      await this.driveApi.uploadBlock(
        blockLink.URL,
        blockLink.Token,
        block.encryptedData!
      );

      uploadedBytes += block.size;
      if (onProgress) {
        onProgress(uploadedBytes, fileSize);
      }

      verboseLog(
        `  Block ${i + 1}/${blocksWithTokens.length} (${this.formatSize(uploadedBytes)}/${this.formatSize(fileSize)})`
      );
    }

    verboseLog('✓ All blocks uploaded');

    // Step 14: Generate and sign the manifest
    verboseLog('Finalizing upload...');
    const manifestData = this.createManifest(blocksWithTokens);
    const manifestSignature = await this.metadataCreator.signData(
      manifestData,
      signingKey  // Sign with address key (SDK: nodeRevisionDraftKeys.signatureAddress.addressKey)
    );

    // Step 15: Finalize the revision
    await this.driveApi.finalizeRevision(
      uploadContext.volumeId,
      fileId,
      revisionId,
      manifestSignature,
      addressEmail
    );

    verboseLog('✓ Upload complete!\n');

    return {
      fileId,
      revisionId,
      size: fileSize,
      uploadedBlocks: blocks.length,
    };
  }

  /**
   * Create manifest data for signing
   * Format: concatenation of all block hashes (as raw bytes)
   * SDK: mergeUint8Arrays(hashes) where hashes are Uint8Array
   */
  private createManifest(blocks: FileBlock[]): Uint8Array {
    // Sort blocks by index
    const sortedBlocks = blocks.sort((a, b) => a.index - b.index);

    // Convert hex hashes to binary and concatenate
    const binaryHashes = sortedBlocks.map((block) => {
      // Convert hex string to Uint8Array
      return Buffer.from(block.hash, 'hex');
    });

    // Concatenate all hashes
    return Buffer.concat(binaryHashes);
  }

  /**
   * Format bytes to human-readable size
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}
