/**
 * Password hashing for SRP
 * From ProtonMail WebClients packages/srp/lib/passwords.ts
 */

import { encodeBase64 as bcryptEncodeBase64, hash as bcryptHash } from 'bcryptjs';
import './uint8array-extensions';
import { CryptoProxy } from './crypto-proxy';
import { binaryStringToArray, encodeUtf8, mergeUint8Arrays } from './utils';
import { BCRYPT_PREFIX } from './constants';
import { cleanUsername } from './username';

/**
 * Expand a hash using SHA512
 */
export async function expandHash(input: Uint8Array): Promise<Uint8Array> {
  const promises = new Array(4).fill(null).map((_, i) =>
    CryptoProxy.computeHash({
      algorithm: 'SHA512',
      data: mergeUint8Arrays([input, new Uint8Array([i])]),
    })
  );
  return mergeUint8Arrays(await Promise.all(promises));
}

/**
 * Format a hash
 */
async function formatHash(password: string, salt: string, modulus: Uint8Array): Promise<Uint8Array> {
  const unexpandedHash = await bcryptHash(password, BCRYPT_PREFIX + salt);
  return expandHash(mergeUint8Arrays([binaryStringToArray(unexpandedHash), modulus]));
}

/**
 * Hash password in version 3 and 4.
 */
function hashPassword3(password: string, salt: string, modulus: Uint8Array): Promise<Uint8Array> {
  const saltBinary = binaryStringToArray(`${salt}proton`);
  const bcryptSalt = bcryptEncodeBase64(saltBinary, saltBinary.length);
  return formatHash(password, bcryptSalt, modulus);
}

/**
 * Hash password in version 1 and 2.
 */
async function hashPassword1(password: string, username: string, modulus: Uint8Array): Promise<Uint8Array> {
  const value = binaryStringToArray(encodeUtf8(username.toLowerCase()));
  const salt = (await CryptoProxy.computeHash({ algorithm: 'unsafeMD5', data: value })).toHex();
  return formatHash(password, salt, modulus);
}

/**
 * Hash password in version 0.
 */
async function hashPassword0(password: string, username: string, modulus: Uint8Array): Promise<Uint8Array> {
  const value = await CryptoProxy.computeHash({
    algorithm: 'SHA512',
    data: binaryStringToArray(username.toLowerCase() + encodeUtf8(password)),
  });
  const prehashed = value.toBase64();
  return hashPassword1(prehashed, username, modulus);
}

/**
 * Hash a password based on the auth version.
 */
export async function hashPassword({
  password,
  salt,
  username,
  modulus,
  version,
}: {
  password: string;
  salt?: string;
  username?: string;
  modulus: Uint8Array;
  version: number;
}): Promise<Uint8Array> {
  if (version === 4 || version === 3) {
    if (!salt) {
      throw new Error('Missing salt');
    }
    return hashPassword3(password, salt, modulus);
  }

  if (version === 2) {
    return hashPassword1(password, cleanUsername(username), modulus);
  }

  if (version === 1) {
    if (!username) {
      throw new Error('Missing username');
    }
    return hashPassword1(password, username, modulus);
  }

  if (version === 0) {
    if (!username) {
      throw new Error('Missing username');
    }
    return hashPassword0(password, username, modulus);
  }

  throw new Error('Unsupported auth version');
}
