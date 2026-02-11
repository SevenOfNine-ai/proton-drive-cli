import { modExp, mod, byteLength, bigIntToUint8Array, uint8ArrayToBigInt } from './bigint';

describe('bigint', () => {
  describe('modExp', () => {
    test('2^10 mod 1000 = 24', () => {
      expect(modExp(2n, 10n, 1000n)).toBe(24n);
    });

    test('3^4 mod 5 = 1', () => {
      expect(modExp(3n, 4n, 5n)).toBe(1n);
    });

    test('base^0 mod N = 1', () => {
      expect(modExp(7n, 0n, 13n)).toBe(1n);
    });

    test('returns 0 when modulus is 1', () => {
      expect(modExp(5n, 3n, 1n)).toBe(0n);
    });

    test("Fermat's little theorem: a^(p-1) ≡ 1 (mod p)", () => {
      // p=13, a=2: 2^12 mod 13 = 1
      expect(modExp(2n, 12n, 13n)).toBe(1n);
      // p=17, a=3: 3^16 mod 17 = 1
      expect(modExp(3n, 16n, 17n)).toBe(1n);
    });

    test('large values', () => {
      // 2^256 mod (2^256 - 1) = 1
      const big = (1n << 256n) - 1n;
      expect(modExp(2n, 256n, big)).toBe(1n);
    });
  });

  describe('mod', () => {
    test('positive modulo', () => {
      expect(mod(10n, 3n)).toBe(1n);
    });

    test('negative modulo wraps to positive', () => {
      expect(mod(-3n, 7n)).toBe(4n);
    });

    test('-1 mod 5 = 4', () => {
      expect(mod(-1n, 5n)).toBe(4n);
    });

    test('zero mod N = 0', () => {
      expect(mod(0n, 5n)).toBe(0n);
    });

    test('N mod N = 0', () => {
      expect(mod(7n, 7n)).toBe(0n);
    });
  });

  describe('byteLength', () => {
    test('0 → 1 byte', () => {
      expect(byteLength(0n)).toBe(1);
    });

    test('255 → 1 byte', () => {
      expect(byteLength(255n)).toBe(1);
    });

    test('256 → 2 bytes', () => {
      expect(byteLength(256n)).toBe(2);
    });

    test('65535 → 2 bytes', () => {
      expect(byteLength(65535n)).toBe(2);
    });

    test('65536 → 3 bytes', () => {
      expect(byteLength(65536n)).toBe(3);
    });

    test('2^2048 needs 257 bytes', () => {
      expect(byteLength(1n << 2048n)).toBe(257);
    });
  });

  describe('bigIntToUint8Array / uint8ArrayToBigInt roundtrip', () => {
    test('0x1234 big-endian', () => {
      const arr = bigIntToUint8Array(0x1234n, 'be');
      expect(arr).toEqual(new Uint8Array([0x12, 0x34]));
      expect(uint8ArrayToBigInt(arr, 'be')).toBe(0x1234n);
    });

    test('0x1234 little-endian', () => {
      const arr = bigIntToUint8Array(0x1234n, 'le');
      expect(arr).toEqual(new Uint8Array([0x34, 0x12]));
      expect(uint8ArrayToBigInt(arr, 'le')).toBe(0x1234n);
    });

    test('big-endian with padding', () => {
      const arr = bigIntToUint8Array(0xFFn, 'be', 4);
      expect(arr.length).toBe(4);
      expect(arr).toEqual(new Uint8Array([0x00, 0x00, 0x00, 0xFF]));
      expect(uint8ArrayToBigInt(arr, 'be')).toBe(0xFFn);
    });

    test('little-endian with padding', () => {
      const arr = bigIntToUint8Array(0xFFn, 'le', 4);
      expect(arr.length).toBe(4);
      expect(arr).toEqual(new Uint8Array([0xFF, 0x00, 0x00, 0x00]));
      expect(uint8ArrayToBigInt(arr, 'le')).toBe(0xFFn);
    });

    test('roundtrip with large value BE', () => {
      const val = 0xDEADBEEFCAFEn;
      const arr = bigIntToUint8Array(val, 'be');
      expect(uint8ArrayToBigInt(arr, 'be')).toBe(val);
    });

    test('roundtrip with large value LE', () => {
      const val = 0xDEADBEEFCAFEn;
      const arr = bigIntToUint8Array(val, 'le');
      expect(uint8ArrayToBigInt(arr, 'le')).toBe(val);
    });

    test('zero', () => {
      const arr = bigIntToUint8Array(0n, 'be');
      expect(uint8ArrayToBigInt(arr, 'be')).toBe(0n);
    });
  });
});
