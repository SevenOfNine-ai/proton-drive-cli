/**
 * Utility functions for SRP implementation
 * Adapted from ProtonMail WebClients
 */

/**
 * Merge multiple Uint8Arrays into a single Uint8Array
 */
export function mergeUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Convert binary string to Uint8Array
 */
export function binaryStringToArray(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

/**
 * Convert Uint8Array to binary string
 */
export function arrayToBinaryString(arr: Uint8Array): string {
  return String.fromCharCode(...arr);
}

/**
 * Encode UTF-8 string
 */
export function encodeUtf8(str: string): string {
  return unescape(encodeURIComponent(str));
}

/**
 * Convert Uint8Array to string
 */
export function uint8ArrayToString(arr: Uint8Array): string {
  return arrayToBinaryString(arr);
}

