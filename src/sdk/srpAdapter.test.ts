import { SRPModuleAdapter } from './srpAdapter';

describe('SRPModuleAdapter', () => {
  let adapter: SRPModuleAdapter;

  beforeAll(() => {
    adapter = new SRPModuleAdapter();
  });

  describe('computeKeyPassword', () => {
    it('derives a key passphrase from password and salt', async () => {
      // Use a known salt (base64-encoded 16 bytes)
      const password = 'testpassword';
      const salt = 'AAAAAAAAAAAAAAAAAAAAAA=='; // 16 zero bytes in base64

      const result = await adapter.computeKeyPassword(password, salt);
      expect(typeof result).toBe('string');
      expect(result.length).toBe(31); // bcrypt hash portion is 31 chars
    });

    it('produces different results for different passwords', async () => {
      const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
      const result1 = await adapter.computeKeyPassword('password1', salt);
      const result2 = await adapter.computeKeyPassword('password2', salt);
      expect(result1).not.toBe(result2);
    });

    it('produces different results for different salts', async () => {
      const password = 'testpassword';
      const salt1 = 'AAAAAAAAAAAAAAAAAAAAAA==';
      const salt2 = 'AQEBAQEBAQEBAQEBAQEBAQ==';
      const result1 = await adapter.computeKeyPassword(password, salt1);
      const result2 = await adapter.computeKeyPassword(password, salt2);
      expect(result1).not.toBe(result2);
    });
  });

  describe('getSrpVerifier', () => {
    it('throws not implemented', async () => {
      await expect(adapter.getSrpVerifier('password')).rejects.toThrow(
        'getSrpVerifier is not implemented'
      );
    });
  });
});
