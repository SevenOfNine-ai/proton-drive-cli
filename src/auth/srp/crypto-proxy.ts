/**
 * Crypto proxy wrapper for OpenPGP.js
 * Provides a simplified interface similar to ProtonMail's CryptoProxy
 */

import * as openpgp from '@protontech/openpgp';
import { createHash } from 'crypto';
import './uint8array-extensions';

export interface PublicKeyReference {
  _key: any; // Internal OpenPGP key reference
}

export enum VERIFICATION_STATUS {
  NOT_SIGNED = 0,
  SIGNED_AND_VALID = 1,
  SIGNED_AND_INVALID = 2,
}

export class CryptoProxy {
  /**
   * Compute hash of data
   */
  static async computeHash({
    algorithm,
    data,
  }: {
    algorithm: 'SHA512' | 'unsafeMD5';
    data: Uint8Array;
  }): Promise<Uint8Array> {
    if (algorithm === 'SHA512') {
      const hash = createHash('sha512');
      hash.update(data);
      return new Uint8Array(hash.digest());
    } else if (algorithm === 'unsafeMD5') {
      const hash = createHash('md5');
      hash.update(data);
      return new Uint8Array(hash.digest());
    }
    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }

  /**
   * Import a public key from armored format
   */
  static async importPublicKey({
    armoredKey,
  }: {
    armoredKey: string;
  }): Promise<PublicKeyReference> {
    try {
      const key = await openpgp.readKey({ armoredKey });
      return { _key: key };
    } catch (error) {
      throw new Error(`Failed to import public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export a public key to armored or binary format
   */
  static async exportPublicKey({
    key,
    format,
  }: {
    key: PublicKeyReference;
    format: 'armored' | 'binary';
  }): Promise<string | Uint8Array> {
    try {
      if (format === 'armored') {
        return key._key.armor();
      } else {
        return key._key.write();
      }
    } catch (error) {
      throw new Error(`Failed to export public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify a cleartext signed message
   */
  static async verifyCleartextMessage({
    armoredCleartextMessage,
    verificationKeys,
  }: {
    armoredCleartextMessage: string;
    verificationKeys: PublicKeyReference;
  }): Promise<{ data: string; verificationStatus: VERIFICATION_STATUS }> {
    try {
      const cleartextMessage = await openpgp.readCleartextMessage({
        cleartextMessage: armoredCleartextMessage,
      });

      const result = await openpgp.verify({
        message: cleartextMessage,
        verificationKeys: [verificationKeys._key],
      });

      // Check verification results
      const { verified } = result.signatures[0] || {};
      let verificationStatus = VERIFICATION_STATUS.NOT_SIGNED;

      if (verified) {
        try {
          await verified;
          verificationStatus = VERIFICATION_STATUS.SIGNED_AND_VALID;
        } catch {
          verificationStatus = VERIFICATION_STATUS.SIGNED_AND_INVALID;
        }
      }

      return {
        data: result.data,
        verificationStatus,
      };
    } catch (error) {
      throw new Error(`Failed to verify cleartext message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
