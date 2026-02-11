import { cleanUsername, checkUsername } from './username';

describe('cleanUsername', () => {
  test('lowercases', () => {
    expect(cleanUsername('UserName')).toBe('username');
  });

  test('removes dots', () => {
    expect(cleanUsername('user.name')).toBe('username');
  });

  test('removes dashes', () => {
    expect(cleanUsername('user-name')).toBe('username');
  });

  test('removes underscores', () => {
    expect(cleanUsername('user_name')).toBe('username');
  });

  test('removes all special chars together', () => {
    expect(cleanUsername('User.Name-Test_123')).toBe('usernametest123');
  });

  test('handles undefined', () => {
    expect(cleanUsername(undefined)).toBe('');
  });

  test('handles empty string', () => {
    expect(cleanUsername('')).toBe('');
  });
});

describe('checkUsername', () => {
  test('version >= 3 always returns true', () => {
    expect(checkUsername(3, undefined, undefined)).toBe(true);
    expect(checkUsername(4, 'a', 'b')).toBe(true);
    expect(checkUsername(4)).toBe(true);
  });

  test('version 2 compares cleaned usernames', () => {
    expect(checkUsername(2, 'User.Name', 'username')).toBe(true);
    expect(checkUsername(2, 'user-name', 'user_name')).toBe(true);
    expect(checkUsername(2, 'different', 'user')).toBe(false);
  });

  test('version 2 throws if username missing', () => {
    expect(() => checkUsername(2, undefined, 'api')).toThrow('Missing username');
    expect(() => checkUsername(2, 'user', undefined)).toThrow('Missing username');
  });

  test('version 1 case-insensitive comparison', () => {
    expect(checkUsername(1, 'User', 'user')).toBe(true);
    expect(checkUsername(1, 'USER', 'user')).toBe(true);
    expect(checkUsername(1, 'User', 'other')).toBe(false);
  });

  test('version 1 does NOT clean special chars', () => {
    // version 1 only lowercases, does not strip dots/dashes/underscores
    expect(checkUsername(1, 'user.name', 'username')).toBe(false);
  });

  test('version 1 throws if username missing', () => {
    expect(() => checkUsername(1, undefined, 'api')).toThrow('Missing username');
    expect(() => checkUsername(1, 'user', undefined)).toThrow('Missing username');
  });

  test('version 0 uses case-insensitive comparison', () => {
    expect(checkUsername(0, 'Test', 'test')).toBe(true);
    expect(checkUsername(0, 'Test', 'other')).toBe(false);
  });
});
