import * as openpgp from 'openpgp';
import { createHash } from 'crypto';
import { CryptoService } from '../crypto';

export class FileMetadataCreator {
  constructor(private crypto: CryptoService) {}

  /**
   * Encrypt file name with parent's node key
   * @param name - File name
   * @param parentNodeKey - Parent folder's private key
   * @returns Armored encrypted name
   */
  async encryptFileName(name: string, parentNodeKey: openpgp.PrivateKey): Promise<string> {
    const nameBytes = new TextEncoder().encode(name);
    // Encrypt with parent's public key (derived from private key)
    return await this.crypto.encryptBinaryData(nameBytes, [parentNodeKey.toPublic()]);
  }

  /**
   * Generate name hash (for uniqueness check)
   * @param parentLinkId - Parent folder's link ID
   * @param name - File name
   * @returns SHA256 hash
   */
  generateNameHash(parentLinkId: string, name: string): string {
    const data = `${parentLinkId}${name}`;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create node passphrase (random)
   * @returns Random passphrase
   */
  generateNodePassphrase(): string {
    return this.crypto.generatePassphrase();
  }

  /**
   * Encrypt node passphrase with parent's key
   * @param passphrase - Node passphrase
   * @param parentNodeKey - Parent folder's private key
   * @returns Armored encrypted passphrase
   */
  async encryptNodePassphrase(
    passphrase: string,
    parentNodeKey: openpgp.PrivateKey
  ): Promise<string> {
    const passphraseBytes = new TextEncoder().encode(passphrase);
    return await this.crypto.encryptBinaryData(passphraseBytes, [
      parentNodeKey.toPublic(),
    ]);
  }

  /**
   * Sign data (detached signature)
   * @param data - Data to sign
   * @param signingKey - Private key to sign with
   * @returns Armored signature
   */
  async signData(data: Uint8Array, signingKey: openpgp.PrivateKey): Promise<string> {
    return await this.crypto.signBinaryDetached(data, signingKey);
  }

  /**
   * Sign text data (detached signature)
   * @param text - Text to sign
   * @param signingKey - Private key to sign with
   * @returns Armored signature
   */
  async signText(text: string, signingKey: openpgp.PrivateKey): Promise<string> {
    const textBytes = new TextEncoder().encode(text);
    return await this.signData(textBytes, signingKey);
  }
}
