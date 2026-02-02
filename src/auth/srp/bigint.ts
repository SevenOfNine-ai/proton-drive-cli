/**
 * BigInteger utilities for SRP implementation
 * Adapted from ProtonMail WebClients @proton/crypto/lib/bigInteger
 */

/**
 * Modular exponentiation: (base^exponent) mod modulus
 */
export function modExp(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n;

  let result = 1n;
  base = base % modulus;

  while (exponent > 0n) {
    if (exponent % 2n === 1n) {
      result = (result * base) % modulus;
    }
    exponent = exponent >> 1n;
    base = (base * base) % modulus;
  }

  return result;
}

/**
 * Modulo operation
 */
export function mod(n: bigint, modulus: bigint): bigint {
  const result = n % modulus;
  return result < 0n ? result + modulus : result;
}

/**
 * Get byte length of a BigInt
 */
export function byteLength(n: bigint): number {
  if (n === 0n) return 1;
  return Math.ceil(n.toString(16).length / 2);
}

/**
 * Convert BigInt to Uint8Array
 * @param n - BigInt to convert
 * @param endianness - 'be' for big-endian, 'le' for little-endian
 * @param length - Target length in bytes
 */
export function bigIntToUint8Array(
  n: bigint,
  endianness: 'be' | 'le' = 'be',
  length?: number
): Uint8Array {
  const hex = n.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
  const arr = new Uint8Array(paddedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  if (length !== undefined && arr.length < length) {
    const padded = new Uint8Array(length);
    if (endianness === 'be') {
      padded.set(arr, length - arr.length);
      return padded;
    } else {
      // For little-endian: reverse first, then pad at the end
      padded.set(arr.reverse(), 0);
      return padded;
    }
  }

  if (endianness === 'le') {
    return arr.reverse();
  }

  return arr;
}

/**
 * Convert Uint8Array to BigInt
 * @param arr - Uint8Array to convert
 * @param endianness - 'be' for big-endian, 'le' for little-endian
 */
export function uint8ArrayToBigInt(arr: Uint8Array, endianness: 'be' | 'le' = 'be'): bigint {
  const bytes = endianness === 'le' ? arr.slice().reverse() : arr;
  const hex = Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return BigInt('0x' + (hex || '0'));
}
