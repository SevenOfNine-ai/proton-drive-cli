import { oidToPath, pathToOid } from './bridge-helpers';

const VALID_OID = '4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393';

describe('oidToPath', () => {
  it('converts valid OID to correct path', () => {
    expect(oidToPath('LFS', VALID_OID)).toBe(`/LFS/4d/7a/${VALID_OID}`);
  });

  it('normalizes base by stripping leading/trailing slashes', () => {
    expect(oidToPath('/LFS/', VALID_OID)).toBe(`/LFS/4d/7a/${VALID_OID}`);
  });

  it('lowercases the OID in the result', () => {
    const upper = VALID_OID.toUpperCase();
    const result = oidToPath('LFS', upper);
    expect(result).toBe(`/LFS/4d/7a/${VALID_OID}`);
    expect(result).not.toContain('4D');
  });

  it('rejects short OID', () => {
    expect(() => oidToPath('LFS', 'abc')).toThrow('Invalid OID format');
  });

  it('rejects non-hex OID', () => {
    const nonHex = 'z'.repeat(64);
    expect(() => oidToPath('LFS', nonHex)).toThrow('Invalid OID format');
  });

  it('rejects empty OID', () => {
    expect(() => oidToPath('LFS', '')).toThrow();
  });
});

describe('pathToOid', () => {
  it('roundtrips with oidToPath', () => {
    const path = oidToPath('LFS', VALID_OID);
    expect(pathToOid(path)).toBe(VALID_OID);
  });

  it('rejects path with too few segments', () => {
    expect(() => pathToOid('/LFS/ab')).toThrow('Invalid OID path format');
  });

  it('rejects path with invalid OID in final segment', () => {
    expect(() => pathToOid('/LFS/ab/cd/not-a-valid-hex-oid')).toThrow('Invalid OID');
  });
});
