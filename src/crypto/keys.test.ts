import { getPrimaryAddressKey, decryptAddressKey, decryptAllAddressKeys } from './keys';
import { Address, AddressKey } from '../types/crypto';

function makeAddressKey(overrides: Partial<AddressKey> = {}): AddressKey {
  return {
    ID: 'key-1',
    Version: 3,
    Primary: 0,
    Flags: 3,
    PrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nmock\n-----END PGP PRIVATE KEY BLOCK-----',
    Token: null,
    Signature: null,
    Activation: null,
    ...overrides,
  };
}

function makeAddress(keys: AddressKey[], overrides: Partial<Address> = {}): Address {
  return {
    ID: 'addr-1',
    Email: 'user@proton.me',
    Status: 1,
    Type: 1,
    Order: 1,
    Priority: 1,
    Keys: keys,
    ...overrides,
  };
}

describe('getPrimaryAddressKey', () => {
  test('returns primary key from first address', () => {
    const primary = makeAddressKey({ ID: 'pk-1', Primary: 1 });
    const secondary = makeAddressKey({ ID: 'sk-1', Primary: 0 });
    const addresses = [makeAddress([secondary, primary])];

    const result = getPrimaryAddressKey(addresses);

    expect(result).not.toBeNull();
    expect(result!.ID).toBe('pk-1');
    expect(result!.Primary).toBe(1);
  });

  test('returns primary key from second address if first has none', () => {
    const secondary = makeAddressKey({ ID: 'sk-1', Primary: 0 });
    const primary = makeAddressKey({ ID: 'pk-2', Primary: 1 });
    const addresses = [
      makeAddress([secondary], { ID: 'addr-1' }),
      makeAddress([primary], { ID: 'addr-2' }),
    ];

    const result = getPrimaryAddressKey(addresses);
    expect(result!.ID).toBe('pk-2');
  });

  test('returns null when no primary key exists', () => {
    const addresses = [
      makeAddress([makeAddressKey({ Primary: 0 })]),
    ];
    expect(getPrimaryAddressKey(addresses)).toBeNull();
  });

  test('returns null for empty addresses array', () => {
    expect(getPrimaryAddressKey([])).toBeNull();
  });

  test('returns null for address with empty keys', () => {
    expect(getPrimaryAddressKey([makeAddress([])])).toBeNull();
  });

  test('returns first primary key when multiple exist', () => {
    const first = makeAddressKey({ ID: 'first', Primary: 1 });
    const second = makeAddressKey({ ID: 'second', Primary: 1 });
    const addresses = [makeAddress([first, second])];

    expect(getPrimaryAddressKey(addresses)!.ID).toBe('first');
  });
});

describe('decryptAddressKey', () => {
  test('throws when no primary key found', async () => {
    const addresses = [makeAddress([makeAddressKey({ Primary: 0 })])];

    await expect(decryptAddressKey(addresses, 'passphrase'))
      .rejects.toThrow('No primary address key found');
  });

  test('throws for empty addresses', async () => {
    await expect(decryptAddressKey([], 'passphrase'))
      .rejects.toThrow('No primary address key found');
  });
});

describe('decryptAllAddressKeys', () => {
  test('returns empty array when all keys fail decryption', async () => {
    // Mock keys with invalid armored data will fail decryption
    const addresses = [
      makeAddress([
        makeAddressKey({ ID: 'bad-1', PrivateKey: 'not-valid-pgp' }),
        makeAddressKey({ ID: 'bad-2', PrivateKey: 'also-invalid' }),
      ]),
    ];

    // Suppress console.warn from the catch block
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    const keys = await decryptAllAddressKeys(addresses, 'passphrase');

    expect(keys).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  test('returns empty array for empty addresses', async () => {
    const keys = await decryptAllAddressKeys([], 'passphrase');
    expect(keys).toEqual([]);
  });
});
