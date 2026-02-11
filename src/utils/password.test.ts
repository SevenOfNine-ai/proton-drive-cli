import { resolveCredentials, resolvePassword } from './password';

// Mock git-credential module
jest.mock('./git-credential', () => ({
  gitCredentialFill: jest.fn(),
}));

import { gitCredentialFill } from './git-credential';

const mockedGitCredentialFill = gitCredentialFill as jest.MockedFunction<typeof gitCredentialFill>;

describe('resolveCredentials', () => {
  const originalStdin = process.stdin;

  afterEach(() => {
    jest.restoreAllMocks();
    mockedGitCredentialFill.mockReset();
  });

  describe('git credential provider', () => {
    test('calls gitCredentialFill when credentialProvider is "git"', async () => {
      mockedGitCredentialFill.mockResolvedValue({
        protocol: 'https',
        host: 'drive.proton.me',
        username: 'user@proton.me',
        password: 's3cret',
      });

      const result = await resolveCredentials({ credentialProvider: 'git' });

      expect(mockedGitCredentialFill).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        username: 'user@proton.me',
        password: 's3cret',
      });
    });

    test('propagates gitCredentialFill errors', async () => {
      mockedGitCredentialFill.mockRejectedValue(new Error('git credential fill failed'));

      await expect(resolveCredentials({ credentialProvider: 'git' }))
        .rejects.toThrow('git credential fill failed');
    });
  });

  describe('error case', () => {
    test('throws descriptive error when no method available', async () => {
      // Set stdin and stdout as TTY but stdout as non-TTY to hit the error path
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      await expect(resolveCredentials({})).rejects.toThrow(
        /Password required for key decryption/
      );

      // Restore
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });
  });
});

describe('resolvePassword', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockedGitCredentialFill.mockReset();
  });

  test('returns only password from resolveCredentials', async () => {
    mockedGitCredentialFill.mockResolvedValue({
      protocol: 'https',
      host: 'drive.proton.me',
      username: 'user@proton.me',
      password: 'my-password',
    });

    const result = await resolvePassword({ credentialProvider: 'git' });

    expect(result).toBe('my-password');
  });
});
