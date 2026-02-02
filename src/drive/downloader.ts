import * as fs from 'fs/promises';
import * as openpgp from 'openpgp';
import { DriveApiClient } from '../api/drive';
import { CryptoService } from '../crypto';
import { BlockDecryptor } from './blockDecryptor';
import {
  DownloadOptions,
  DownloadResult,
  BlockMetadata,
  MAX_CONCURRENT_DOWNLOADS,
} from '../types/download';
import { verboseLog } from '../utils/output';

export interface DownloadContext {
  volumeId: string;
  linkId: string;
  revisionId: string;
  fileName: string;
  fileSize: number;
  contentSessionKey: openpgp.SessionKey;
  nodeKey: openpgp.PrivateKey;
  signatureAddress: string;
  addressKey: openpgp.PrivateKey; // Address key for signature verification
}

/**
 * Downloads and decrypts files from Proton Drive
 */
export class FileDownloader {
  private decryptor: BlockDecryptor;

  constructor(
    private driveApi: DriveApiClient,
    private crypto: CryptoService
  ) {
    this.decryptor = new BlockDecryptor(crypto);
  }

  /**
   * Download a file
   */
  async downloadFile(
    downloadContext: DownloadContext,
    options: DownloadOptions
  ): Promise<DownloadResult> {
    const { volumeId, linkId, revisionId, fileName, fileSize, contentSessionKey } = downloadContext;

    verboseLog(`\nDownloading: ${fileName} (${this.formatSize(fileSize)})`);

    // Step 1: Get revision blocks from API
    verboseLog('Getting block metadata...');
    const revisionResponse = await this.driveApi.getRevisionBlocks(
      volumeId,
      linkId,
      revisionId
    );

    const blocks = revisionResponse.Revision.Blocks;
    const manifestSignature = revisionResponse.Revision.ManifestSignature;
    const signatureAddress = revisionResponse.Revision.SignatureAddress;

    verboseLog(`✓ Found ${blocks.length} block${blocks.length > 1 ? 's' : ''} to download`);

    // Step 2: Download and decrypt blocks with concurrency control
    verboseLog('Downloading blocks...');
    const blockMetadata: BlockMetadata[] = blocks.map((block) => ({
      index: block.Index,
      bareUrl: block.BareURL,
      token: block.Token,
      hash: block.Hash,
      encryptedSignature: block.EncSignature,
    }));

    const decryptedBlocks = await this.downloadBlocksConcurrent(
      blockMetadata,
      contentSessionKey,
      options.skipVerification || false,
      options.onProgress,
      fileSize
    );

    verboseLog('✓ All blocks downloaded and decrypted');

    // Step 3: Verify manifest signature (unless skipped)
    if (!options.skipVerification) {
      verboseLog('Verifying manifest signature...');
      const allBlockHashes = blocks.map((b) => b.Hash);

      // Check if the signature address matches the current user
      if (signatureAddress.toLowerCase() === downloadContext.signatureAddress.toLowerCase()) {
        await this.decryptor.verifyManifest(
          allBlockHashes,
          manifestSignature,
          downloadContext.addressKey.toPublic()
        );
        verboseLog('✓ Manifest signature verified');
      } else {
        verboseLog(`⚠ Skipping verification: file signed by different user (${signatureAddress})`);
      }
    }

    // Step 4: Write decrypted blocks to file
    verboseLog('Writing file...');
    await this.writeBlocksToFile(decryptedBlocks, options.outputPath);
    verboseLog('✓ File written');

    verboseLog('✓ Download complete!\n');

    return {
      filePath: options.outputPath,
      size: fileSize,
      downloadedBlocks: blocks.length,
    };
  }

  /**
   * Download blocks with concurrent execution (max MAX_CONCURRENT_DOWNLOADS at a time)
   */
  private async downloadBlocksConcurrent(
    blockMetadata: BlockMetadata[],
    contentSessionKey: openpgp.SessionKey,
    skipVerification: boolean,
    onProgress?: (downloaded: number, total: number) => void,
    totalSize?: number
  ): Promise<Map<number, Uint8Array>> {
    const decryptedBlocks = new Map<number, Uint8Array>();
    let downloadedBytes = 0;

    // Download blocks in batches of MAX_CONCURRENT_DOWNLOADS
    for (let i = 0; i < blockMetadata.length; i += MAX_CONCURRENT_DOWNLOADS) {
      const batch = blockMetadata.slice(i, i + MAX_CONCURRENT_DOWNLOADS);

      // Download batch in parallel
      const batchPromises = batch.map(async (block) => {
        const decryptedBlock = await this.downloadAndDecryptBlock(
          block,
          contentSessionKey,
          skipVerification
        );

        downloadedBytes += decryptedBlock.length;

        if (onProgress && totalSize) {
          onProgress(downloadedBytes, totalSize);
        }

        verboseLog(
          `  Block ${block.index}/${blockMetadata.length} (${this.formatSize(downloadedBytes)}/${this.formatSize(totalSize || 0)})`
        );

        return { index: block.index, data: decryptedBlock };
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Store results
      for (const result of batchResults) {
        decryptedBlocks.set(result.index, result.data);
      }
    }

    return decryptedBlocks;
  }

  /**
   * Download and decrypt a single block
   */
  private async downloadAndDecryptBlock(
    block: BlockMetadata,
    contentSessionKey: openpgp.SessionKey,
    skipVerification: boolean
  ): Promise<Uint8Array> {
    // Download encrypted block
    const encryptedData = await this.driveApi.downloadBlock(
      block.bareUrl,
      block.token
    );

    // Verify integrity (unless skipped)
    if (!skipVerification) {
      await this.decryptor.verifyBlockIntegrity(encryptedData, block.hash);
    }

    // Decrypt block
    const decryptedData = await this.decryptor.decryptBlock(
      encryptedData,
      contentSessionKey
    );

    return decryptedData;
  }

  /**
   * Write decrypted blocks to file in order
   */
  private async writeBlocksToFile(
    blocks: Map<number, Uint8Array>,
    outputPath: string
  ): Promise<void> {
    // Sort blocks by index
    const sortedIndices = Array.from(blocks.keys()).sort((a, b) => a - b);

    // Open file for writing
    const fileHandle = await fs.open(outputPath, 'w');

    try {
      // Write blocks in order
      for (const index of sortedIndices) {
        const blockData = blocks.get(index);
        if (!blockData) {
          throw new Error(`Missing block ${index}`);
        }
        await fileHandle.write(blockData);
      }
    } finally {
      await fileHandle.close();
    }
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
