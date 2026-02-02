/**
 * Extensions for Uint8Array to support Base64 and hex encoding
 * These methods are used in the SRP implementation
 */

declare global {
  interface Uint8Array {
    toBase64(): string;
    toHex(): string;
  }
  interface Uint8ArrayConstructor {
    fromBase64(base64: string): Uint8Array;
    fromHex(hex: string): Uint8Array;
  }
}

// Base64 encoding/decoding
if (!Uint8Array.prototype.toBase64) {
  Uint8Array.prototype.toBase64 = function(): string {
    // Use Buffer.from directly to avoid spread operator issues with large arrays
    return Buffer.from(this).toString('base64');
  };
}

if (!Uint8Array.fromBase64) {
  Uint8Array.fromBase64 = function(base64: string): Uint8Array {
    const buffer = Buffer.from(base64, 'base64');
    return new Uint8Array(buffer);
  };
}

// Hex encoding/decoding
if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function(): string {
    return Array.from(this)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  };
}

if (!Uint8Array.fromHex) {
  Uint8Array.fromHex = function(hex: string): Uint8Array {
    const matches = hex.match(/.{1,2}/g);
    if (!matches) return new Uint8Array(0);
    return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
  };
}

// Export empty object to make this a module
export {};
