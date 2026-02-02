import * as openpgp from 'openpgp';
import { CryptoService } from '../crypto';
import { FileBlock } from '../types/upload';

export class BlockEncryptor {
  constructor(private crypto: CryptoService) {}

  /**
   * Encrypt and sign a file block
   * Following SDK approach:
   * 1. Sign PLAINTEXT block data with address key → raw signature
   * 2. Encrypt block data with session key → encrypted data
   * 3. Encrypt the signature with node key → armored encrypted signature
   */
  async encryptBlock(
    block: FileBlock,
    contentSessionKey: openpgp.SessionKey,
    nodeKey: openpgp.PrivateKey,
    addressKey: openpgp.PrivateKey
  ): Promise<FileBlock> {
    const buffer = Buffer.from(block.data);

    // Step 1: Sign the PLAINTEXT data with address key (detached, raw bytes)
    const rawSignature = await this.crypto.signBinaryDetachedRaw(
      buffer,
      addressKey
    );

    // Step 2: Encrypt block data with session key
    const message = await openpgp.createMessage({ binary: buffer });
    const encryptedData = await openpgp.encrypt({
      message,
      sessionKey: contentSessionKey,
      format: 'binary',
    }) as Uint8Array;

    // Step 3: Compute SHA256 hash of ENCRYPTED data
    const hashBuffer = await crypto.subtle.digest('SHA-256', encryptedData as BufferSource);
    const hash = new Uint8Array(hashBuffer);

    // Step 4: Encrypt the signature itself with node key and session key
    const encryptedSignature = await this.crypto.encryptBinaryToArmored(
      rawSignature,
      contentSessionKey,
      [nodeKey]
    );

    return {
      ...block,
      encryptedData,
      encryptedSignature,
      hash: Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join(''), // hex string for compatibility
    };
  }

  /**
   * Encrypt multiple blocks in parallel
   */
  async encryptBlocks(
    blocks: FileBlock[],
    contentSessionKey: openpgp.SessionKey,
    nodeKey: openpgp.PrivateKey,
    addressKey: openpgp.PrivateKey,
    maxParallel: number = 4
  ): Promise<FileBlock[]> {
    const results: FileBlock[] = [];

    // Process blocks in batches
    for (let i = 0; i < blocks.length; i += maxParallel) {
      const batch = blocks.slice(i, i + maxParallel);
      const encrypted = await Promise.all(
        batch.map((block) => this.encryptBlock(block, contentSessionKey, nodeKey, addressKey))
      );
      results.push(...encrypted);
    }

    return results;
  }
}
