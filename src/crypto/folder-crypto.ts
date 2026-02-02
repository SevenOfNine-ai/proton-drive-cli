import * as openpgp from 'openpgp';
import { cryptoService } from './index';

/**
 * Folder-specific encryption utilities
 * Handles folder creation encryption requirements
 */

/**
 * Generate HMAC-SHA256 lookup hash for a folder name
 * @param folderName - Decrypted folder name
 * @param parentHashKey - Parent folder's hash key (binary)
 * @returns Hex-encoded hash for server-side lookups
 */
export async function generateLookupHash(
  folderName: string,
  parentHashKey: Uint8Array
): Promise<string> {
  // Import the hash key for HMAC
  const key = await crypto.subtle.importKey(
    'raw',
    parentHashKey as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  // Compute HMAC signature
  const nameBytes = new TextEncoder().encode(folderName);
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'HMAC', hash: 'SHA-256' },
    key,
    nameBytes
  );

  // Convert to hex string
  const signature = new Uint8Array(signatureBuffer);
  return Array.from(signature)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a hash key for a folder
 * The hash key is used to compute lookup hashes for the folder's children
 * @returns Random 32-byte hash key
 */
export function generateHashKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Encrypt a folder's hash key with the folder's own node key
 * @param hashKey - The folder's hash key (binary)
 * @param folderPrivateKey - The folder's decrypted private key
 * @returns Armored encrypted hash key
 */
export async function encryptHashKey(
  hashKey: Uint8Array,
  folderPrivateKey: openpgp.PrivateKey
): Promise<string> {
  // Convert hash key to armored format using password encryption
  // Use the hash key itself as the "message" to encrypt
  const hashKeyHex = Array.from(hashKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Encrypt with the folder's public key
  const encrypted = await cryptoService.encryptMessage(
    hashKeyHex,
    folderPrivateKey.toPublic()
  );

  return encrypted;
}

/**
 * Encrypt folder name with parent's node key
 * @param folderName - Decrypted folder name
 * @param parentPrivateKey - Parent folder's decrypted private key
 * @returns Armored encrypted name
 */
export async function encryptFolderName(
  folderName: string,
  parentPrivateKey: openpgp.PrivateKey
): Promise<string> {
  return await cryptoService.encryptMessage(
    folderName,
    parentPrivateKey.toPublic()
  );
}

/**
 * Encrypt node passphrase with parent's node key and sign it
 * @param nodePassphrase - Folder's passphrase (plaintext)
 * @param parentPrivateKey - Parent folder's decrypted private key
 * @param signingKey - Address private key for signing
 * @returns Encrypted passphrase and signature
 */
export async function encryptAndSignPassphrase(
  nodePassphrase: string,
  parentPrivateKey: openpgp.PrivateKey,
  signingKey: openpgp.PrivateKey
): Promise<{ encrypted: string; signature: string }> {
  // Encrypt passphrase with parent's public key
  const parentPublicKey = parentPrivateKey.toPublic();

  const message = await openpgp.createMessage({ text: nodePassphrase });

  // Encrypt and sign in one operation
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys: parentPublicKey,
    signingKeys: signingKey,
  });

  // Also create detached signature
  const signature = await openpgp.sign({
    message,
    signingKeys: signingKey,
    detached: true,
  });

  return {
    encrypted: encrypted as string,
    signature: signature as string,
  };
}

/**
 * Extended attributes for folder metadata
 */
export interface FolderExtendedAttributes {
  Common: {
    ModificationTime: string; // ISO 8601 format
  };
}

/**
 * Generate extended attributes for a folder
 * @param modificationTime - Optional modification time (defaults to now)
 * @returns Extended attributes object
 */
export function generateFolderExtendedAttributes(
  modificationTime?: Date
): FolderExtendedAttributes {
  const modTime = modificationTime || new Date();
  return {
    Common: {
      ModificationTime: modTime.toISOString(),
    },
  };
}

/**
 * Encrypt extended attributes
 * @param xattr - Extended attributes object
 * @param folderPrivateKey - Folder's decrypted private key
 * @returns Armored encrypted extended attributes
 */
export async function encryptExtendedAttributes(
  xattr: FolderExtendedAttributes,
  folderPrivateKey: openpgp.PrivateKey
): Promise<string> {
  const xattrJson = JSON.stringify(xattr);
  return await cryptoService.encryptMessage(
    xattrJson,
    folderPrivateKey.toPublic()
  );
}

/**
 * Complete folder encryption metadata
 */
export interface FolderEncryptionMetadata {
  // Folder's own keys
  nodeKey: string; // Armored public key
  nodePassphrase: string; // Encrypted passphrase
  nodePassphraseSignature: string;
  nodeHashKey: string; // Encrypted hash key

  // Encrypted folder properties
  encryptedName: string;
  lookupHash: string;
  encryptedXAttr?: string;

  // Signing info
  signatureEmail: string;
}

/**
 * Create complete encryption metadata for a new folder
 * @param folderName - Folder name (plaintext)
 * @param parentPrivateKey - Parent folder's decrypted private key
 * @param parentHashKey - Parent folder's hash key (for name lookup)
 * @param signingKey - Address private key for signing
 * @param signatureEmail - Email address for signature
 * @param modificationTime - Optional modification time
 * @returns Complete folder encryption metadata
 */
export async function createFolderEncryption(
  folderName: string,
  parentPrivateKey: openpgp.PrivateKey,
  parentHashKey: Uint8Array,
  signingKey: openpgp.PrivateKey,
  signatureEmail: string,
  modificationTime?: Date
): Promise<{ metadata: FolderEncryptionMetadata; decryptedKey: openpgp.PrivateKey }> {
  // 1. Generate new key pair for the folder
  const folderPassphrase = cryptoService.generatePassphrase();

  // Generate key pair directly with openpgp.generateKey to get armored strings
  const generatedKey = await openpgp.generateKey({
    type: 'rsa',
    rsaBits: 2048,
    userIDs: [{ name: 'folder' }],
    passphrase: folderPassphrase,
  });

  // Read the generated keys as objects
  const privateKey = await openpgp.readPrivateKey({ armoredKey: generatedKey.privateKey });
  const decryptedPrivateKey = await openpgp.decryptKey({
    privateKey,
    passphrase: folderPassphrase,
  });

  // 2. Encrypt folder name with parent's key
  const encryptedName = await encryptFolderName(folderName, parentPrivateKey);

  // 3. Generate lookup hash
  const lookupHash = await generateLookupHash(folderName, parentHashKey);

  // 4. Generate and encrypt hash key for this folder's children
  const hashKey = generateHashKey();
  const encryptedHashKey = await encryptHashKey(hashKey, decryptedPrivateKey);

  // 5. Encrypt and sign the folder's passphrase
  const { encrypted: encryptedPassphrase, signature: passphraseSignature } =
    await encryptAndSignPassphrase(folderPassphrase, parentPrivateKey, signingKey);

  // 6. Generate and encrypt extended attributes
  const xattr = generateFolderExtendedAttributes(modificationTime);
  const encryptedXAttr = await encryptExtendedAttributes(xattr, decryptedPrivateKey);

  // 7. Use the armored encrypted private key from generateKey
  // NodeKey is the encrypted private key (encrypted with the passphrase)
  const armoredNodeKey = generatedKey.privateKey;

  return {
    metadata: {
      nodeKey: armoredNodeKey,
      nodePassphrase: encryptedPassphrase,
      nodePassphraseSignature: passphraseSignature,
      nodeHashKey: encryptedHashKey,
      encryptedName,
      lookupHash,
      encryptedXAttr,
      signatureEmail,
    },
    decryptedKey: decryptedPrivateKey,
  };
}
