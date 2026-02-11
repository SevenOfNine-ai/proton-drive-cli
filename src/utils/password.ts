/**
 * Password and credential resolution for standalone CLI commands.
 *
 * Resolution order (resolveCredentials):
 * 1. --credential-provider git → `git credential fill` (returns username + password)
 * 2. --password-stdin (piped password)
 * 3. Interactive prompt (if TTY)
 * 4. Error
 *
 * Passwords are NEVER read from environment variables or CLI flags
 * (env vars leak via /proc/pid/environ; CLI flags leak via `ps`).
 */

import inquirer from 'inquirer';
import { gitCredentialFill } from './git-credential';

export interface ResolvedCredentials {
  username?: string;
  password: string;
}

/**
 * Read password from stdin pipe.
 * Rejects if stdin is a TTY (nothing piped) or times out after 5 s.
 */
export function readPasswordFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const timeout = setTimeout(() => {
      reject(new Error('Timeout reading password from stdin'));
    }, 5000);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      const trimmed = data.trim();
      if (!trimmed) {
        reject(new Error('No password received from stdin'));
        return;
      }
      resolve(trimmed);
    });
    process.stdin.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    process.stdin.resume();
  });
}

export async function resolveCredentials(options: {
  passwordStdin?: boolean;
  credentialProvider?: string;
}): Promise<ResolvedCredentials> {
  // 1. --credential-provider git → git credential fill
  if (options.credentialProvider === 'git') {
    const cred = await gitCredentialFill();
    return { username: cred.username, password: cred.password };
  }

  // 2. --password-stdin (piped)
  if (options.passwordStdin || !process.stdin.isTTY) {
    const password = await readPasswordFromStdin();
    return { password };
  }

  // 3. Interactive prompt (if TTY)
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Password (for key decryption):',
        mask: '*',
        validate: (input: string) => input.length > 0 || 'Password is required',
      },
    ]);
    return { password: answers.password };
  }

  // 4. Error
  throw new Error(
    'Password required for key decryption. Use --credential-provider git, --password-stdin, or run interactively.'
  );
}

/**
 * Resolve password only (backward-compatible wrapper).
 * Delegates to resolveCredentials() and returns just the password.
 */
export async function resolvePassword(options: { passwordStdin?: boolean; credentialProvider?: string }): Promise<string> {
  const creds = await resolveCredentials(options);
  return creds.password;
}
