import * as openpgp from 'openpgp';
import { CryptoService } from '../crypto';
import { BlockMetadata } from '../types/download';

/**
 * Decrypts downloaded file blocks
 */
export class BlockDecryptor {
  constructor(private crypto: CryptoService) {}

  /**
   * Decrypt a downloaded block
   * @param encryptedData - Encrypted block data
   * @param contentSessionKey - Session key for decryption
   * @returns Decrypted block data
   */
  async decryptBlock(
    encryptedData: Uint8Array,
    contentSessionKey: openpgp.SessionKey
  ): Promise<Uint8Array> {
    try {
      // Convert to Buffer to ensure proper typing
      const encryptedBuffer = Buffer.from(encryptedData);

      // Decrypt the block using the content session key
      const message = await openpgp.readMessage({
        binaryMessage: encryptedBuffer,
      });

      const { data: decryptedData } = await openpgp.decrypt({
        message,
        sessionKeys: contentSessionKey,
        format: 'binary',
      });

      // Convert to Uint8Array
      if (decryptedData instanceof Uint8Array) {
        return decryptedData;
      }
      return Buffer.from(decryptedData as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to decrypt block: ${message}`);
    }
  }

  /**
   * Verify block integrity using SHA-256 hash
   * @param encryptedData - Encrypted block data
   * @param expectedHashBase64 - Expected SHA-256 hash (base64)
   */
  async verifyBlockIntegrity(
    encryptedData: Uint8Array,
    expectedHashBase64: string
  ): Promise<void> {
    // Convert to Buffer to ensure proper typing
    const encryptedBuffer = Buffer.from(encryptedData);

    // Compute SHA-256 hash of encrypted data
    const hashBuffer = await crypto.subtle.digest('SHA-256', encryptedBuffer);
    const hash = new Uint8Array(hashBuffer);

    // Convert to base64
    const actualHashBase64 = Buffer.from(hash).toString('base64');

    if (actualHashBase64 !== expectedHashBase64) {
      throw new Error(
        `Block integrity check failed. Expected: ${expectedHashBase64}, Got: ${actualHashBase64}`
      );
    }
  }

  /**
   * Verify manifest signature
   * @param allBlockHashes - Array of all block hashes (base64)
   * @param manifestSignature - Armored manifest signature
   * @param verificationKey - Public key for verification
   */
  async verifyManifest(
    allBlockHashes: string[],
    manifestSignature: string,
    verificationKey: openpgp.PublicKey
  ): Promise<void> {
    try {
      // Convert all hashes from base64 to binary and concatenate
      const binaryHashes = allBlockHashes.map((hash) =>
        Buffer.from(hash, 'base64')
      );
      const manifestData = Buffer.concat(binaryHashes);

      // Read the detached signature
      const signature = await openpgp.readSignature({
        armoredSignature: manifestSignature,
      });

      // Create message from manifest data
      const message = await openpgp.createMessage({
        binary: manifestData,
      });

      // Verify the detached signature
      const verificationResult = await openpgp.verify({
        message,
        signature,
        verificationKeys: [verificationKey],
      });

      // Check if signature is valid
      const { verified } = verificationResult.signatures[0];
      await verified; // This will throw if signature is invalid

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Manifest verification failed: ${message}`);
    }
  }
}
