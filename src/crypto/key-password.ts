/**
 * Key password derivation for decrypting user keys
 * Uses the same bcrypt hashing as SRP but with key salts
 */

import { encodeBase64 as bcryptEncodeBase64, hash as bcryptHash } from 'bcryptjs';
import { BCRYPT_PREFIX } from '../auth/srp/constants';
import '../auth/srp/uint8array-extensions'; // Import for Uint8Array.fromBase64()

/**
 * Derive the key passphrase from password and salt
 * This is used to decrypt user's private keys
 *
 * @param password - User's mailbox password (same as login password in single-password mode)
 * @param keySalt - Base64-encoded key salt from API
 * @returns Derived key passphrase
 */
export async function deriveKeyPassphrase(password: string, keySalt: string): Promise<string> {
  // According to Proton's implementation, the key passphrase for single-password mode
  // is derived using bcrypt with the KeySalt, and then extracting the hash portion only.

  // Decode the key salt from base64
  const saltBinary = Uint8Array.fromBase64(keySalt);

  // Encode salt for bcrypt (same format as SRP)
  const bcryptSalt = bcryptEncodeBase64(saltBinary, saltBinary.length);

  // Hash the password with bcrypt using the salt
  const hashedPassword = await bcryptHash(password, BCRYPT_PREFIX + bcryptSalt);

  // According to Proton's C# SDK (ProtonApiSession.cs line 262):
  // "Skip the first 29 characters which include the algorithm type, the number of rounds and the salt."
  // Bcrypt format: $2y$10$<22 chars salt><31 chars hash>
  // Skip: 7 ($2y$10$) + 22 (salt) = 29 chars
  // Use: Last 31 chars (the actual bcrypt hash output)

  const keyPassphrase = hashedPassword.substring(29);
  return keyPassphrase;
}
