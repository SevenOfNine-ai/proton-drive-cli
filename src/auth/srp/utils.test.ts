import {
  mergeUint8Arrays,
  binaryStringToArray,
  arrayToBinaryString,
  encodeUtf8,
  uint8ArrayToString,
} from './utils';

describe('SRP utility functions', () => {
  describe('mergeUint8Arrays', () => {
    test('merges two arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([4, 5, 6]);
      const result = mergeUint8Arrays([a, b]);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    test('merges three arrays', () => {
      const result = mergeUint8Arrays([
        new Uint8Array([0x00]),
        new Uint8Array([0xff]),
        new Uint8Array([0x42]),
      ]);
      expect(result).toEqual(new Uint8Array([0x00, 0xff, 0x42]));
    });

    test('returns empty array for empty input', () => {
      expect(mergeUint8Arrays([])).toEqual(new Uint8Array(0));
    });

    test('returns copy for single array', () => {
      const input = new Uint8Array([1, 2, 3]);
      const result = mergeUint8Arrays([input]);
      expect(result).toEqual(input);
      // Should be a new array, not the same reference
      expect(result).not.toBe(input);
    });

    test('handles empty arrays in the mix', () => {
      const result = mergeUint8Arrays([
        new Uint8Array([]),
        new Uint8Array([1]),
        new Uint8Array([]),
        new Uint8Array([2]),
      ]);
      expect(result).toEqual(new Uint8Array([1, 2]));
    });

    test('preserves total length', () => {
      const arrays = [
        new Uint8Array(100),
        new Uint8Array(200),
        new Uint8Array(50),
      ];
      expect(mergeUint8Arrays(arrays).length).toBe(350);
    });
  });

  describe('binaryStringToArray', () => {
    test('converts ASCII string to Uint8Array', () => {
      const result = binaryStringToArray('ABC');
      expect(result).toEqual(new Uint8Array([65, 66, 67]));
    });

    test('converts empty string', () => {
      expect(binaryStringToArray('')).toEqual(new Uint8Array(0));
    });

    test('converts null byte', () => {
      expect(binaryStringToArray('\0')).toEqual(new Uint8Array([0]));
    });

    test('converts high byte values', () => {
      const result = binaryStringToArray(String.fromCharCode(0xff));
      expect(result).toEqual(new Uint8Array([255]));
    });
  });

  describe('arrayToBinaryString', () => {
    test('converts Uint8Array to string', () => {
      expect(arrayToBinaryString(new Uint8Array([65, 66, 67]))).toBe('ABC');
    });

    test('converts empty array', () => {
      expect(arrayToBinaryString(new Uint8Array(0))).toBe('');
    });

    test('roundtrips with binaryStringToArray', () => {
      const original = 'Hello, World!';
      const roundtripped = arrayToBinaryString(binaryStringToArray(original));
      expect(roundtripped).toBe(original);
    });

    test('roundtrips binary data', () => {
      const original = new Uint8Array([0, 1, 127, 128, 255]);
      const roundtripped = binaryStringToArray(arrayToBinaryString(original));
      expect(roundtripped).toEqual(original);
    });
  });

  describe('encodeUtf8', () => {
    test('passes through ASCII', () => {
      expect(encodeUtf8('hello')).toBe('hello');
    });

    test('encodes multibyte characters', () => {
      // The euro sign (U+20AC) should be encoded as 3 bytes in UTF-8
      const encoded = encodeUtf8('\u20AC');
      expect(encoded.length).toBe(3);
    });

    test('encodes empty string', () => {
      expect(encodeUtf8('')).toBe('');
    });
  });

  describe('uint8ArrayToString', () => {
    test('delegates to arrayToBinaryString', () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]);
      expect(uint8ArrayToString(input)).toBe('Hello');
      expect(uint8ArrayToString(input)).toBe(arrayToBinaryString(input));
    });
  });
});
