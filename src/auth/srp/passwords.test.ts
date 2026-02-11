import './uint8array-extensions';
import { expandHash, hashPassword } from './passwords';

describe('expandHash', () => {
  test('returns 256 bytes (4 x SHA512)', async () => {
    const input = new Uint8Array([1, 2, 3]);
    const result = await expandHash(input);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(256);
  });

  test('is deterministic', async () => {
    const input = new Uint8Array([0xAB, 0xCD]);
    const a = await expandHash(input);
    const b = await expandHash(input);
    expect(a).toEqual(b);
  });

  test('different inputs produce different outputs', async () => {
    const a = await expandHash(new Uint8Array([1]));
    const b = await expandHash(new Uint8Array([2]));
    expect(a).not.toEqual(b);
  });
});

describe('hashPassword', () => {
  test('version 4 requires salt', async () => {
    await expect(
      hashPassword({ password: 'test', version: 4, modulus: new Uint8Array(32) })
    ).rejects.toThrow('Missing salt');
  });

  test('version 3 requires salt', async () => {
    await expect(
      hashPassword({ password: 'test', version: 3, modulus: new Uint8Array(32) })
    ).rejects.toThrow('Missing salt');
  });

  test('version 1 requires username', async () => {
    await expect(
      hashPassword({ password: 'test', version: 1, modulus: new Uint8Array(32) })
    ).rejects.toThrow('Missing username');
  });

  test('version 0 requires username', async () => {
    await expect(
      hashPassword({ password: 'test', version: 0, modulus: new Uint8Array(32) })
    ).rejects.toThrow('Missing username');
  });

  test('unsupported version throws', async () => {
    await expect(
      hashPassword({ password: 'test', version: 99, modulus: new Uint8Array(32) })
    ).rejects.toThrow('Unsupported auth version');
  });

  test('version 4 with valid salt returns 256-byte hash', async () => {
    const result = await hashPassword({
      password: 'testpassword',
      version: 4,
      salt: 'dGVzdHNhbHQ=', // base64("testsalt")
      modulus: new Uint8Array(256).fill(0xFF),
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(256);
  }, 30_000);

  test('version 4 is deterministic', async () => {
    const opts = {
      password: 'mypassword',
      version: 4 as const,
      salt: 'c29tZXNhbHQ=', // base64("somesalt")
      modulus: new Uint8Array(256).fill(0xAB),
    };
    const a = await hashPassword(opts);
    const b = await hashPassword(opts);
    expect(a).toEqual(b);
  }, 30_000);
});
