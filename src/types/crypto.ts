/**
 * Type definitions for cryptographic operations
 */

/**
 * User's cryptographic keys
 */
export interface UserKeys {
  privateKeys: string[]; // Armored private keys
  publicKeys: string[]; // Armored public keys
}

/**
 * Address key from API
 */
export interface AddressKey {
  ID: string;
  Version: number;
  Primary: number; // 1 = primary, 0 = not primary
  Flags: number;
  PrivateKey: string; // Armored encrypted private key
  Token: string | null; // Key token (encrypted with primary key)
  Signature: string | null; // Signature of the key
  Activation: string | null; // Activation token
}

/**
 * Address from API
 */
export interface Address {
  ID: string;
  Email: string;
  Status: number;
  Type: number;
  Order: number;
  Priority: number;
  Keys: AddressKey[];
}

/**
 * User key from API
 */
export interface UserKey {
  ID: string;
  Version: number;
  Primary: number;
  PrivateKey: string; // Armored encrypted private key
  Token: string | null;
  Fingerprint: string;
  Activation: string | null;
}

/**
 * User info from API
 */
export interface User {
  ID: string;
  Name: string;
  Email: string;
  Keys: UserKey[];
}

/**
 * Decrypted share context
 */
export interface DecryptedShareContext {
  shareId: string;
  shareKey: any; // Decrypted share private key (openpgp.PrivateKey)
  sharePassphrase: string; // Decrypted passphrase
}

/**
 * Decrypted node context
 */
export interface DecryptedNodeContext {
  linkId: string;
  nodeKey: any; // Decrypted node private key (openpgp.PrivateKey)
  nodePassphrase: string; // Decrypted passphrase
}

/**
 * Key pair for OpenPGP
 */
export interface KeyPair {
  privateKey: any; // OpenPGP.PrivateKey
  publicKey: any; // OpenPGP.PublicKey
}

/**
 * Decryption result
 */
export interface DecryptionResult {
  data: string | Uint8Array;
  verified: boolean;
}

/**
 * Encryption result
 */
export interface EncryptionResult {
  message: string; // Armored encrypted message
  signature?: string; // Armored signature
}
