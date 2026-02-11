import './uint8array-extensions';
import { generateProofs, srpHasher, getSrp } from './srp-impl';

jest.mock('./modulus', () => ({
  verifyAndGetModulus: jest.fn(),
}));

import { verifyAndGetModulus } from './modulus';

const mockedVerifyAndGetModulus = verifyAndGetModulus as jest.MockedFunction<
  typeof verifyAndGetModulus
>;

describe('srpHasher', () => {
  test('returns 256 bytes (4 x SHA512)', async () => {
    const result = await srpHasher(new Uint8Array([1, 2, 3]));
    expect(result.length).toBe(256);
  });

  test('is deterministic', async () => {
    const input = new Uint8Array([0xFF, 0x00]);
    const a = await srpHasher(input);
    const b = await srpHasher(input);
    expect(a).toEqual(b);
  });
});

describe('generateProofs', () => {
  // Use 32-byte test values for speed (not real SRP params)
  const byteLength = 32;

  // LE-encoded modulus: last byte (LE MSB) non-zero ensures 32-byte bigint
  const modulusArray = (() => {
    const arr = new Uint8Array(32);
    arr[0] = 0x07;
    arr[31] = 0xFF;
    return arr;
  })();

  const hashedPasswordArray = (() => {
    const arr = new Uint8Array(32);
    arr[0] = 0x42;
    return arr;
  })();

  const serverEphemeralArray = (() => {
    const arr = new Uint8Array(32);
    arr[0] = 0x01;
    arr[31] = 0x80;
    return arr;
  })();

  test('returns expected proof structure', async () => {
    const result = await generateProofs({
      byteLength,
      modulusArray,
      hashedPasswordArray,
      serverEphemeralArray,
    });
    expect(result.clientEphemeral).toBeInstanceOf(Uint8Array);
    expect(result.clientProof).toBeInstanceOf(Uint8Array);
    expect(result.expectedServerProof).toBeInstanceOf(Uint8Array);
    expect(result.sharedSession).toBeInstanceOf(Uint8Array);
  });

  test('clientEphemeral has correct byte length', async () => {
    const result = await generateProofs({
      byteLength,
      modulusArray,
      hashedPasswordArray,
      serverEphemeralArray,
    });
    expect(result.clientEphemeral.length).toBe(byteLength);
  });

  test('proofs are 256 bytes (srpHasher output)', async () => {
    const result = await generateProofs({
      byteLength,
      modulusArray,
      hashedPasswordArray,
      serverEphemeralArray,
    });
    expect(result.clientProof.length).toBe(256);
    expect(result.expectedServerProof.length).toBe(256);
  });

  test('sharedSession has correct byte length', async () => {
    const result = await generateProofs({
      byteLength,
      modulusArray,
      hashedPasswordArray,
      serverEphemeralArray,
    });
    expect(result.sharedSession.length).toBe(byteLength);
  });

  test('throws on incorrect modulus size', async () => {
    const wrongModulus = new Uint8Array(16);
    wrongModulus[15] = 0xFF;
    await expect(
      generateProofs({
        byteLength,
        modulusArray: wrongModulus,
        hashedPasswordArray,
        serverEphemeralArray,
      })
    ).rejects.toThrow('SRP modulus has incorrect size');
  });

  test('throws when server ephemeral is zero', async () => {
    await expect(
      generateProofs({
        byteLength,
        modulusArray,
        hashedPasswordArray,
        serverEphemeralArray: new Uint8Array(32), // all zeros
      })
    ).rejects.toThrow('SRP server ephemeral is out of bounds');
  });

  test('throws when server ephemeral equals modulus (B mod N === 0)', async () => {
    // B = N means B mod N === 0, which is a degenerate case in SRP-6a.
    // A rogue server could send B = N to force a known shared secret.
    await expect(
      generateProofs({
        byteLength,
        modulusArray,
        hashedPasswordArray,
        serverEphemeralArray: modulusArray, // B === N → B mod N === 0
      })
    ).rejects.toThrow('SRP server ephemeral is out of bounds');
  });
});

describe('getSrp', () => {
  // 256-byte test modulus (SRP_LEN = 256)
  const testModulus = (() => {
    const arr = new Uint8Array(256);
    arr[0] = 0x07;
    arr[255] = 0xFF;
    return arr;
  })();

  const testServerEphemeral = (() => {
    const arr = new Uint8Array(256);
    arr[0] = 0x42;
    arr[255] = 0x80;
    return arr;
  })();

  beforeEach(() => {
    mockedVerifyAndGetModulus.mockReset();
  });

  test('returns base64-encoded proofs for version 4', async () => {
    mockedVerifyAndGetModulus.mockResolvedValue(testModulus);

    const result = await getSrp(
      {
        Version: 4,
        Modulus: 'mocked-signed-modulus',
        ServerEphemeral: Buffer.from(testServerEphemeral).toString('base64'),
        Salt: Buffer.from('test-salt-value').toString('base64'),
      },
      { username: 'testuser', password: 'testpassword' }
    );

    expect(typeof result.clientEphemeral).toBe('string');
    expect(typeof result.clientProof).toBe('string');
    expect(typeof result.expectedServerProof).toBe('string');
    expect(result.sharedSession).toBeInstanceOf(Uint8Array);

    // Base64 strings should be decodable
    expect(Buffer.from(result.clientEphemeral, 'base64').length).toBe(256);
    expect(Buffer.from(result.clientProof, 'base64').length).toBe(256);
  }, 30_000);

  test('rejects username mismatch for version 2', async () => {
    mockedVerifyAndGetModulus.mockResolvedValue(testModulus);

    await expect(
      getSrp(
        {
          Version: 2,
          Modulus: 'mocked',
          ServerEphemeral: Buffer.from(testServerEphemeral).toString('base64'),
          Salt: Buffer.from('salt').toString('base64'),
          Username: 'serveruser',
        },
        { username: 'differentuser', password: 'pass' }
      )
    ).rejects.toThrow(/ProtonMail username/);
  });

  test('calls verifyAndGetModulus with server modulus', async () => {
    mockedVerifyAndGetModulus.mockResolvedValue(testModulus);

    await getSrp(
      {
        Version: 4,
        Modulus: 'the-signed-modulus-blob',
        ServerEphemeral: Buffer.from(testServerEphemeral).toString('base64'),
        Salt: Buffer.from('proper-test-salt').toString('base64'),
      },
      { username: 'user', password: 'pass' }
    );

    expect(mockedVerifyAndGetModulus).toHaveBeenCalledWith('the-signed-modulus-blob');
  }, 30_000);
});
