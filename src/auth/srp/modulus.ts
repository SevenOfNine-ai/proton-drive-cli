/**
 * Modulus verification for SRP
 * From ProtonMail WebClients packages/srp/lib/utils/modulus.ts
 */

import './uint8array-extensions';
import { CryptoProxy, PublicKeyReference, VERIFICATION_STATUS } from './crypto-proxy';
import { SRP_MODULUS_KEY } from './constants';

const { NOT_SIGNED, SIGNED_AND_VALID } = VERIFICATION_STATUS;

/**
 * Get key to verify the modulus (cached)
 */
const getModulusKey = (() => {
  let cachedKeyReference: PublicKeyReference | undefined;

  const get = async (): Promise<PublicKeyReference> => {
    try {
      const keyReference = await CryptoProxy.importPublicKey({ armoredKey: SRP_MODULUS_KEY });
      cachedKeyReference = keyReference;
      return cachedKeyReference;
    } catch (e) {
      cachedKeyReference = undefined;
      throw e;
    }
  };

  return async (): Promise<PublicKeyReference> => {
    const isValidKeyReference =
      cachedKeyReference &&
      // after logging out, the key store is cleared, and the key reference becomes invalid.
      // try and export the key to see if it's still valid
      (await CryptoProxy.exportPublicKey({ key: cachedKeyReference, format: 'binary' })
        .then(() => true)
        .catch(() => false));

    if (isValidKeyReference) {
      return cachedKeyReference as PublicKeyReference;
    }
    return get();
  };
})();

/**
 * Verify the modulus signature with the SRP public key
 * @returns modulus value if verification is successful
 * @throws on verification error
 */
export async function verifyModulus(publicKey: PublicKeyReference, modulus: string): Promise<string> {
  try {
    const { data: modulusData, verificationStatus = NOT_SIGNED } = await CryptoProxy.verifyCleartextMessage({
      armoredCleartextMessage: modulus,
      verificationKeys: publicKey,
    });

    if (verificationStatus !== SIGNED_AND_VALID) {
      throw new Error('Modulus signature verification failed');
    }

    return modulusData;
  } catch (e) {
    throw new Error('Unable to verify server identity');
  }
}

/**
 * Verify modulus from the API and get the value.
 */
export async function verifyAndGetModulus(modulus: string): Promise<Uint8Array> {
  const publicKey = await getModulusKey();
  const modulusData = await verifyModulus(publicKey, modulus);
  const modulusBytes = Uint8Array.fromBase64(modulusData);
  return modulusBytes;
}
