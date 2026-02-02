import * as openpgp from 'openpgp';
import { CryptoService } from './index';
import { UserApiClient } from '../api/user';
import { decryptAddressKey, decryptAllAddressKeys } from './keys';
import { DecryptedShareContext, DecryptedNodeContext, User, Address } from '../types/crypto';
import { Share, Link } from '../types/drive';
import { deriveKeyPassphrase } from './key-password';

/**
 * Drive-specific crypto operations
 * Handles the key hierarchy: User Key -> Share Key -> Node Key -> Content
 */
export class DriveCryptoService {
  private crypto: CryptoService;
  private userApi: UserApiClient;
  private userKeys: Map<string, openpgp.PrivateKey> = new Map(); // User keys (primary account keys)
  private addressKeys: Map<string, openpgp.PrivateKey> = new Map(); // Address keys (email-specific keys)
  private addresses: Map<string, Address> = new Map(); // Full address info by address ID
  private shareContexts: Map<string, DecryptedShareContext> = new Map();
  private nodeContexts: Map<string, DecryptedNodeContext> = new Map();

  constructor() {
    this.crypto = new CryptoService();
    this.userApi = new UserApiClient();
  }

  /**
   * Initialize crypto service with user's mailbox password
   * Decrypts and caches all user private keys
   */
  async initialize(mailboxPassword: string): Promise<void> {
    // Normalize password (Proton uses NFC normalization)
    const normalizedPassword = mailboxPassword.normalize('NFC');

    // Get key salts from API
    const keySalts = await this.userApi.getKeySalts();

    // Create a map of key ID to salt
    const saltMap = new Map<string, string | null>();
    for (const keySalt of keySalts) {
      saltMap.set(keySalt.ID, keySalt.KeySalt);
    }

    // Get user information (for user keys)
    const user = await this.userApi.getUser();

    // Decrypt user keys first (these are the primary account keys)
    console.log(`Decrypting user keys for: ${user.Name}`);

    for (const key of user.Keys) {
      try {
        const salt = saltMap.get(key.ID);

        // In single-password mode, always try raw password first
        try {
          const decryptedKey = await this.decryptPrivateKeyWithPassphrase(key.PrivateKey, normalizedPassword);
          this.userKeys.set(key.ID, decryptedKey);
          continue;
        } catch (rawPassError) {
          // Raw password failed, try with salt derivation
        }

        // If raw password failed and we have a salt, try deriving passphrase
        if (salt) {
          const passphrase = await deriveKeyPassphrase(normalizedPassword, salt);
          const decryptedKey = await this.decryptPrivateKeyWithPassphrase(key.PrivateKey, passphrase);
          this.userKeys.set(key.ID, decryptedKey);
        } else {
          throw new Error('No salt available and raw password failed');
        }
      } catch (error) {
        console.warn(`Failed to decrypt user key: ${error}`);
      }
    }

    // Get user addresses
    const addresses = await this.userApi.getAddresses();

    // Decrypt address keys (these are encrypted with tokens from user keys)
    for (const address of addresses) {
      for (const key of address.Keys) {
        try {
          let passphrase: string;

          if (key.Token && this.userKeys.size > 0) {
            // Address key is encrypted with a token that's encrypted with the user key
            const userKey = Array.from(this.userKeys.values())[0]; // Get first user key
            const decryptedToken = await this.crypto.decryptMessage(key.Token, userKey);
            passphrase = decryptedToken;
          } else {
            // Fall back to password-based decryption
            const salt = saltMap.get(key.ID);
            if (salt) {
              passphrase = await deriveKeyPassphrase(normalizedPassword, salt);
            } else {
              passphrase = normalizedPassword;
            }
          }

          // Try to decrypt the key
          const decryptedKey = await this.decryptPrivateKeyWithPassphrase(key.PrivateKey, passphrase);
          this.addressKeys.set(address.ID, decryptedKey);
          this.addresses.set(address.ID, address); // Store full address info
          break; // Successfully decrypted one key for this address
        } catch (error) {
          console.warn(`Failed to decrypt address key: ${error}`);
        }
      }
    }

    if (this.userKeys.size === 0 && this.addressKeys.size === 0) {
      throw new Error('Failed to decrypt any keys');
    }

    console.log(`\n✓ Decrypted ${this.userKeys.size} user key(s) and ${this.addressKeys.size} address key(s)`);
  }

  /**
   * Decrypt a private key with a passphrase
   */
  private async decryptPrivateKeyWithPassphrase(
    armoredKey: string,
    passphrase: string
  ): Promise<openpgp.PrivateKey> {
    const privateKey = await openpgp.readPrivateKey({ armoredKey });
    const decryptedKey = await openpgp.decryptKey({
      privateKey,
      passphrase,
    });
    return decryptedKey;
  }

  /**
   * Get a decrypted key by address ID
   */
  private getKeyForAddress(addressId: string): openpgp.PrivateKey {
    const key = this.addressKeys.get(addressId);
    if (!key) {
      throw new Error(`No decrypted key found for address ${addressId}`);
    }
    return key;
  }

  /**
   * Get any available private key (try user keys first, then address keys)
   */
  private getAnyPrivateKey(): openpgp.PrivateKey {
    // Try user keys first (these are primary keys)
    const userKeys = Array.from(this.userKeys.values());
    if (userKeys.length > 0) {
      return userKeys[0];
    }

    // Fall back to address keys
    const addressKeys = Array.from(this.addressKeys.values());
    if (addressKeys.length > 0) {
      return addressKeys[0];
    }

    throw new Error('No decrypted keys available');
  }

  /**
   * Decrypt a share's private key
   * @param share - Share object from API
   * @returns Decrypted share private key
   */
  async decryptShare(share: Share): Promise<DecryptedShareContext> {
    // Check cache first
    if (this.shareContexts.has(share.ShareID)) {
      return this.shareContexts.get(share.ShareID)!;
    }

    // Get address private key for decrypting the share passphrase
    const addressKey = share.AddressID
      ? this.getKeyForAddress(share.AddressID)
      : this.getAnyPrivateKey();

    // Step 1: Decrypt the share passphrase (encrypted PGP message)
    const sharePassphrase = await this.crypto.decryptMessage(share.Passphrase, addressKey);

    // Step 2: Decrypt the share's private key using the passphrase
    const sharePrivateKey = await this.decryptPrivateKeyWithPassphrase(
      share.Key,
      sharePassphrase
    );

    const context: DecryptedShareContext = {
      shareId: share.ShareID,
      shareKey: sharePrivateKey, // This is now an openpgp.PrivateKey, not a string
      sharePassphrase,
    };

    // Cache for future use
    this.shareContexts.set(share.ShareID, context);

    return context;
  }

  /**
   * Decrypt a node's (file/folder) key and passphrase
   * @param link - Link object from API
   * @param shareContext - Decrypted share context
   * @returns Decrypted node context
   */
  async decryptNode(link: Link, shareContext: DecryptedShareContext): Promise<DecryptedNodeContext> {
    // Check cache first
    const cacheKey = `${shareContext.shareId}:${link.LinkID}`;
    if (this.nodeContexts.has(cacheKey)) {
      return this.nodeContexts.get(cacheKey)!;
    }

    // Use the share's private key to decrypt node key and passphrase
    const sharePrivateKey = shareContext.shareKey;

    // Step 1: Extract session key from NodePassphrase (encrypted with share private key)
    const passphraseSessionKey = await this.crypto.extractSessionKey(
      link.NodePassphrase,
      sharePrivateKey
    );

    // Step 2: Decrypt the NodePassphrase with the session key to get passphrase string
    const nodePassphraseBytes = await this.crypto.decryptWithSessionKey(
      link.NodePassphrase,
      passphraseSessionKey
    );
    const nodePassphrase = new TextDecoder().decode(nodePassphraseBytes);

    // Step 3: Decrypt node private key with the node passphrase
    const nodePrivateKey = await this.decryptPrivateKeyWithPassphrase(
      link.NodeKey,
      nodePassphrase
    );

    const context: DecryptedNodeContext = {
      linkId: link.LinkID,
      nodeKey: nodePrivateKey, // This is now openpgp.PrivateKey, not a string
      nodePassphrase,
    };

    // Cache for future use
    this.nodeContexts.set(cacheKey, context);

    return context;
  }

  /**
   * Decrypt a file or folder name
   * @param link - Link object from API
   * @param nodeContext - Decrypted node context
   * @returns Decrypted name
   */
  async decryptName(link: Link, nodeContext: DecryptedNodeContext): Promise<string> {
    // Decrypt name (encrypted with parent node's private key)
    const decryptedName = await this.crypto.decryptMessage(
      link.Name,
      nodeContext.nodeKey
    );

    return decryptedName;
  }

  /**
   * Decrypt MIME type
   * @param link - Link object from API
   * @param nodeContext - Decrypted node context
   * @returns Decrypted MIME type
   */
  async decryptMimeType(link: Link, nodeContext: DecryptedNodeContext): Promise<string> {
    if (!link.MIMEType) {
      return 'application/octet-stream';
    }

    // Decrypt MIME type (encrypted with node private key)
    const decryptedMimeType = await this.crypto.decryptMessage(
      link.MIMEType,
      nodeContext.nodeKey
    );

    return decryptedMimeType;
  }

  /**
   * Decrypt a node's key using parent node context (not share)
   * @param link - Link object from API
   * @param parentNodeContext - Parent node's decrypted context
   * @returns Decrypted node context
   */
  async decryptNodeWithParent(link: Link, parentNodeContext: DecryptedNodeContext): Promise<DecryptedNodeContext> {
    // Check cache first
    const cacheKey = `node:${link.LinkID}`;
    if (this.nodeContexts.has(cacheKey)) {
      return this.nodeContexts.get(cacheKey)!;
    }

    const parentPrivateKey = parentNodeContext.nodeKey;

    // Step 1: Extract session key from NodePassphrase (encrypted with parent node's private key)
    const passphraseSessionKey = await this.crypto.extractSessionKey(
      link.NodePassphrase,
      parentPrivateKey
    );

    // Step 2: Decrypt the NodePassphrase with the session key to get passphrase string
    const nodePassphraseBytes = await this.crypto.decryptWithSessionKey(
      link.NodePassphrase,
      passphraseSessionKey
    );
    const nodePassphrase = new TextDecoder().decode(nodePassphraseBytes);

    // Step 3: Decrypt node private key with the node passphrase
    const nodePrivateKey = await this.decryptPrivateKeyWithPassphrase(
      link.NodeKey,
      nodePassphrase
    );

    const context: DecryptedNodeContext = {
      linkId: link.LinkID,
      nodeKey: nodePrivateKey,
      nodePassphrase,
    };

    // Cache for future use
    this.nodeContexts.set(cacheKey, context);

    return context;
  }

  /**
   * Get the primary address ID
   * @returns Primary address ID
   */
  getPrimaryAddressId(): string | null {
    const addressIds = Array.from(this.addressKeys.keys());
    return addressIds.length > 0 ? addressIds[0] : null;
  }

  /**
   * Get the primary address email
   * @returns Primary address email
   */
  getPrimaryAddressEmail(): string | null {
    const addressId = this.getPrimaryAddressId();
    if (!addressId) {
      return null;
    }
    const address = this.addresses.get(addressId);
    return address ? address.Email : null;
  }

  /**
   * Get address email by ID
   * @param addressId - Address ID
   * @returns Address email
   */
  getAddressEmail(addressId: string): string | null {
    const address = this.addresses.get(addressId);
    return address ? address.Email : null;
  }

  /**
   * Get the signing key for an address
   * @param addressId - Address ID (optional, uses primary if not specified)
   * @returns Signing key (private key)
   */
  getSigningKey(addressId?: string): openpgp.PrivateKey {
    if (addressId) {
      return this.getKeyForAddress(addressId);
    }
    return this.getAnyPrivateKey();
  }

  /**
   * Get user private key (for general operations)
   * @returns User private key
   */
  getUserPrivateKey(): openpgp.PrivateKey {
    return this.getAnyPrivateKey();
  }

  /**
   * Clear all cached keys and contexts (for logout)
   */
  clearCache(): void {
    this.userKeys.clear();
    this.addressKeys.clear();
    this.addresses.clear();
    this.shareContexts.clear();
    this.nodeContexts.clear();
  }
}

export const driveCrypto = new DriveCryptoService();
