import * as openpgp from 'openpgp';
import { User, Address, AddressKey, UserKey, KeyPair } from '../types/crypto';

/**
 * Decrypt a private key with a passphrase
 */
export async function decryptPrivateKey(
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
 * Get primary address key
 */
export function getPrimaryAddressKey(addresses: Address[]): AddressKey | null {
  // Find the first address with a primary key
  for (const address of addresses) {
    const primaryKey = address.Keys.find(key => key.Primary === 1);
    if (primaryKey) {
      return primaryKey;
    }
  }
  return null;
}

/**
 * Get primary user key
 */
export function getPrimaryUserKey(user: User): UserKey | null {
  const primaryKey = user.Keys.find(key => key.Primary === 1);
  return primaryKey || null;
}

/**
 * Decrypt user's primary private key
 */
export async function decryptUserKey(
  user: User,
  mailboxPassword: string
): Promise<openpgp.PrivateKey> {
  const primaryKey = getPrimaryUserKey(user);
  if (!primaryKey) {
    throw new Error('No primary user key found');
  }

  return decryptPrivateKey(primaryKey.PrivateKey, mailboxPassword);
}

/**
 * Decrypt address's primary private key
 */
export async function decryptAddressKey(
  addresses: Address[],
  mailboxPassword: string
): Promise<openpgp.PrivateKey> {
  const primaryKey = getPrimaryAddressKey(addresses);
  if (!primaryKey) {
    throw new Error('No primary address key found');
  }

  return decryptPrivateKey(primaryKey.PrivateKey, mailboxPassword);
}

/**
 * Get all decrypted private keys for an address
 */
export async function decryptAllAddressKeys(
  addresses: Address[],
  mailboxPassword: string
): Promise<openpgp.PrivateKey[]> {
  const keys: openpgp.PrivateKey[] = [];

  for (const address of addresses) {
    for (const key of address.Keys) {
      try {
        const decryptedKey = await decryptPrivateKey(key.PrivateKey, mailboxPassword);
        keys.push(decryptedKey);
      } catch (error) {
        // Skip keys that can't be decrypted
        console.warn(`Failed to decrypt key ${key.ID}: ${error}`);
      }
    }
  }

  return keys;
}

/**
 * Read public key from armored string
 */
export async function readPublicKey(armoredKey: string): Promise<openpgp.PublicKey> {
  return openpgp.readKey({ armoredKey });
}

/**
 * Read private key from armored string
 */
export async function readPrivateKey(armoredKey: string): Promise<openpgp.PrivateKey> {
  return openpgp.readPrivateKey({ armoredKey });
}
