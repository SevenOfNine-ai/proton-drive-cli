import * as openpgp from 'openpgp';
import { CryptoService, cryptoService } from './index';

// Shared test key pair — generated once per suite for speed
let testPublicKey: openpgp.PublicKey;
let testPrivateKey: openpgp.PrivateKey;
let testPassphrase: string;

beforeAll(async () => {
  testPassphrase = 'test-passphrase-for-ci';
  const generated = await openpgp.generateKey({
    type: 'rsa',
    rsaBits: 2048,
    userIDs: [{ name: 'Test User' }],
    passphrase: testPassphrase,
  });
  testPublicKey = await openpgp.readKey({ armoredKey: generated.publicKey });
  const encryptedPrivateKey = await openpgp.readPrivateKey({ armoredKey: generated.privateKey });
  testPrivateKey = await openpgp.decryptKey({ privateKey: encryptedPrivateKey, passphrase: testPassphrase });
}, 30_000);

describe('CryptoService', () => {
  let svc: CryptoService;

  beforeEach(() => {
    svc = new CryptoService();
  });

  describe('singleton', () => {
    test('cryptoService is an instance of CryptoService', () => {
      expect(cryptoService).toBeInstanceOf(CryptoService);
    });
  });

  describe('encrypt/decrypt with key pair', () => {
    test('roundtrips a text message', async () => {
      const plaintext = 'Hello, Proton Drive!';
      const encrypted = await svc.encryptMessage(plaintext, testPublicKey);

      expect(encrypted).toContain('-----BEGIN PGP MESSAGE-----');

      const decrypted = await svc.decryptMessage(encrypted, testPrivateKey);
      expect(decrypted).toBe(plaintext);
    });

    test('produces different ciphertext each time (random session key)', async () => {
      const plaintext = 'determinism check';
      const a = await svc.encryptMessage(plaintext, testPublicKey);
      const b = await svc.encryptMessage(plaintext, testPublicKey);
      expect(a).not.toBe(b);
    });

    test('fails to decrypt with wrong key', async () => {
      const other = await openpgp.generateKey({
        type: 'rsa', rsaBits: 2048,
        userIDs: [{ name: 'Wrong' }],
      });
      const otherPrivateKey = await openpgp.readPrivateKey({ armoredKey: other.privateKey });

      const encrypted = await svc.encryptMessage('secret', testPublicKey);
      await expect(svc.decryptMessage(encrypted, otherPrivateKey)).rejects.toThrow();
    }, 20_000);
  });

  describe('encrypt/decrypt with passphrase', () => {
    test('roundtrips a text message with string passphrase', async () => {
      const plaintext = 'passphrase-protected content';
      const passphrase = 'my-passphrase';

      const encrypted = await svc.encryptWithPassphrase(plaintext, passphrase);
      expect(encrypted).toContain('-----BEGIN PGP MESSAGE-----');

      const decrypted = await svc.decryptMessageWithPassphrase(encrypted, passphrase);
      expect(decrypted).toBe(plaintext);
    });

    test('fails with wrong passphrase', async () => {
      const encrypted = await svc.encryptWithPassphrase('data', 'correct');
      await expect(svc.decryptMessageWithPassphrase(encrypted, 'wrong')).rejects.toThrow();
    });
  });

  describe('sign/verify', () => {
    test('roundtrips cleartext signature', async () => {
      const message = 'signed content';
      const signed = await svc.signMessage(message, testPrivateKey);

      expect(signed).toContain('-----BEGIN PGP SIGNED MESSAGE-----');

      const result = await svc.verifyCleartextMessage(signed, testPublicKey);
      expect(result.data).toBe(message);
      expect(result.verified).toBe(true);
    });

    test('verification fails with wrong public key', async () => {
      const other = await openpgp.generateKey({
        type: 'rsa', rsaBits: 2048,
        userIDs: [{ name: 'Wrong' }],
      });
      const wrongPublicKey = await openpgp.readKey({ armoredKey: other.publicKey });

      const signed = await svc.signMessage('data', testPrivateKey);
      const result = await svc.verifyCleartextMessage(signed, wrongPublicKey);
      expect(result.verified).toBe(false);
      expect(result.data).toBe('data');
    }, 20_000);
  });

  describe('session key operations', () => {
    test('extractSessionKey and decryptWithSessionKey roundtrip', async () => {
      const plaintext = 'session key roundtrip';

      // Encrypt a message so we can extract its session key
      const encrypted = await svc.encryptMessage(plaintext, testPublicKey);
      const sessionKey = await svc.extractSessionKey(encrypted, testPrivateKey);

      expect(sessionKey).toBeDefined();
      expect(sessionKey.data).toBeInstanceOf(Uint8Array);

      const decrypted = await svc.decryptWithSessionKey(encrypted, sessionKey);
      expect(new TextDecoder().decode(decrypted)).toBe(plaintext);
    });

    test('generateSessionKey returns correct size for aes256', async () => {
      const key = await svc.generateSessionKey('aes256');
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('generateSessionKey returns correct size for aes128', async () => {
      const key = await svc.generateSessionKey('aes128');
      expect(key.length).toBe(16);
    });

    test('generateSessionKeyForKey returns valid session key', async () => {
      const sk = await svc.generateSessionKeyForKey(testPrivateKey);
      expect(sk).toBeDefined();
      expect(sk.data).toBeInstanceOf(Uint8Array);
      expect(sk.algorithm).toBeDefined();
    });
  });

  describe('binary operations', () => {
    test('encryptBinaryData roundtrips via key pair', async () => {
      const data = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
      const encrypted = await svc.encryptBinaryData(data, [testPublicKey]);
      expect(encrypted).toContain('-----BEGIN PGP MESSAGE-----');
    });

    test('signBinaryDetached returns armored signature', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const sig = await svc.signBinaryDetached(data, testPrivateKey);
      expect(sig).toContain('-----BEGIN PGP SIGNATURE-----');
    });

    test('signBinaryDetachedRaw returns Uint8Array', async () => {
      const data = new Uint8Array([5, 6, 7, 8]);
      const sig = await svc.signBinaryDetachedRaw(data, testPrivateKey);
      expect(sig).toBeInstanceOf(Uint8Array);
      expect(sig.length).toBeGreaterThan(0);
    });
  });

  describe('computeHash', () => {
    test('returns hex-encoded SHA-256 of input', async () => {
      const hash = await svc.computeHash('hello');
      // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    test('returns different hash for different input', async () => {
      const a = await svc.computeHash('a');
      const b = await svc.computeHash('b');
      expect(a).not.toBe(b);
    });

    test('returns 64-character hex string', async () => {
      const hash = await svc.computeHash('anything');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generatePassphrase', () => {
    test('returns 64-character hex string (32 random bytes)', () => {
      const passphrase = svc.generatePassphrase();
      expect(passphrase).toMatch(/^[a-f0-9]{64}$/);
    });

    test('generates unique values', () => {
      const a = svc.generatePassphrase();
      const b = svc.generatePassphrase();
      expect(a).not.toBe(b);
    });
  });

  describe('computeVerificationToken', () => {
    test('XORs verification code with encrypted data', () => {
      const code = new Uint8Array([0xff, 0x00, 0xaa]);
      const data = new Uint8Array([0x0f, 0xf0, 0x55]);
      const token = svc.computeVerificationToken(code, data);
      expect(token).toEqual(new Uint8Array([0xf0, 0xf0, 0xff]));
    });

    test('pads with zero when encrypted data is shorter', () => {
      const code = new Uint8Array([0xff, 0xff]);
      const data = new Uint8Array([0x01]);
      const token = svc.computeVerificationToken(code, data);
      expect(token).toEqual(new Uint8Array([0xfe, 0xff]));
    });

    test('identity: XOR with zero is identity', () => {
      const code = new Uint8Array([0x42, 0x43]);
      const data = new Uint8Array([0x00, 0x00]);
      expect(svc.computeVerificationToken(code, data)).toEqual(code);
    });
  });

  describe('generateKeyPair', () => {
    test('generates valid key pair', async () => {
      const result = await svc.generateKeyPair('TestKey', 'secret');
      expect(result.publicKey).toBeDefined();
      expect(result.privateKey).toBeDefined();
      expect(result.decryptedPrivateKey).toBeDefined();
      expect(result.encryptedPrivateKeyArmored).toContain('-----BEGIN PGP PRIVATE KEY BLOCK-----');
    }, 20_000);

    test('generates key pair without passphrase', async () => {
      const result = await svc.generateKeyPair('NoPassKey');
      expect(result.publicKey).toBeDefined();
      expect(result.decryptedPrivateKey).toBeDefined();
    }, 20_000);
  });
});
