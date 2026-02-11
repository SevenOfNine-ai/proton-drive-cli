import { DriveCryptoService } from './drive-crypto';

describe('DriveCryptoService', () => {
  let svc: DriveCryptoService;

  beforeEach(() => {
    svc = new DriveCryptoService();
  });

  describe('getPrimaryAddressId', () => {
    test('returns null when no address keys loaded', () => {
      expect(svc.getPrimaryAddressId()).toBeNull();
    });

    test('returns address with lowest Order value', () => {
      // Inject internal state to test ordering
      const internal = svc as any;
      const fakeKey = {} as any;
      internal.addressKeys.set('addr-2', [fakeKey]);
      internal.addressKeys.set('addr-1', [fakeKey]);
      internal.addresses.set('addr-2', { ID: 'addr-2', Email: 'b@test.com', Order: 2, Keys: [] });
      internal.addresses.set('addr-1', { ID: 'addr-1', Email: 'a@test.com', Order: 1, Keys: [] });
      expect(svc.getPrimaryAddressId()).toBe('addr-1');
    });

    test('ignores addresses without decrypted keys', () => {
      const internal = svc as any;
      const fakeKey = {} as any;
      // addr-1 has Order 1 but no decrypted keys
      internal.addresses.set('addr-1', { ID: 'addr-1', Email: 'a@test.com', Order: 1, Keys: [] });
      // addr-2 has Order 2 and has decrypted keys
      internal.addressKeys.set('addr-2', [fakeKey]);
      internal.addresses.set('addr-2', { ID: 'addr-2', Email: 'b@test.com', Order: 2, Keys: [] });
      expect(svc.getPrimaryAddressId()).toBe('addr-2');
    });
  });

  describe('getPrimaryAddressEmail', () => {
    test('returns null when no address keys loaded', () => {
      expect(svc.getPrimaryAddressEmail()).toBeNull();
    });

    test('returns email of address with lowest Order', () => {
      const internal = svc as any;
      const fakeKey = {} as any;
      internal.addressKeys.set('addr-2', [fakeKey]);
      internal.addressKeys.set('addr-1', [fakeKey]);
      internal.addresses.set('addr-2', { ID: 'addr-2', Email: 'secondary@test.com', Order: 2, Keys: [] });
      internal.addresses.set('addr-1', { ID: 'addr-1', Email: 'primary@test.com', Order: 1, Keys: [] });
      expect(svc.getPrimaryAddressEmail()).toBe('primary@test.com');
    });
  });

  describe('getAddressEmail', () => {
    test('returns null for unknown address ID', () => {
      expect(svc.getAddressEmail('unknown-id')).toBeNull();
    });
  });

  describe('getAllAddressVerificationKeys', () => {
    test('returns empty map when no address keys loaded', () => {
      const keys = svc.getAllAddressVerificationKeys();
      expect(keys.size).toBe(0);
    });

    test('returns lowercase email to public key mapping', () => {
      const internal = svc as any;
      const fakeKey = { toPublic: () => ({ type: 'public' }) } as any;
      internal.addressKeys.set('addr-1', [fakeKey]);
      internal.addresses.set('addr-1', { ID: 'addr-1', Email: 'User@Proton.ME', Order: 1, Keys: [] });
      const keys = svc.getAllAddressVerificationKeys();
      expect(keys.size).toBe(1);
      expect(keys.has('user@proton.me')).toBe(true);
      expect(keys.get('user@proton.me')).toEqual({ type: 'public' });
    });

    test('returns keys for all addresses', () => {
      const internal = svc as any;
      const fakeKey1 = { toPublic: () => ({ id: 'pub1' }) } as any;
      const fakeKey2 = { toPublic: () => ({ id: 'pub2' }) } as any;
      internal.addressKeys.set('addr-1', [fakeKey1]);
      internal.addressKeys.set('addr-2', [fakeKey2]);
      internal.addresses.set('addr-1', { ID: 'addr-1', Email: 'a@proton.me', Order: 1, Keys: [] });
      internal.addresses.set('addr-2', { ID: 'addr-2', Email: 'b@pm.me', Order: 2, Keys: [] });
      const keys = svc.getAllAddressVerificationKeys();
      expect(keys.size).toBe(2);
      expect(keys.has('a@proton.me')).toBe(true);
      expect(keys.has('b@pm.me')).toBe(true);
    });
  });

  describe('getSigningKey', () => {
    test('throws when no keys available', () => {
      expect(() => svc.getSigningKey()).toThrow('No decrypted keys available');
    });

    test('throws for unknown address ID', () => {
      expect(() => svc.getSigningKey('unknown')).toThrow(/No decrypted key found/);
    });
  });

  describe('getUserPrivateKey', () => {
    test('throws when no keys available', () => {
      expect(() => svc.getUserPrivateKey()).toThrow('No decrypted keys available');
    });
  });

  describe('clearCache', () => {
    test('does not throw on empty cache', () => {
      expect(() => svc.clearCache()).not.toThrow();
    });

    test('returns undefined (void)', () => {
      expect(svc.clearCache()).toBeUndefined();
    });
  });

  describe('initialize', () => {
    test('throws when API calls fail (no real API)', async () => {
      await expect(svc.initialize('password')).rejects.toThrow();
    });
  });
});
