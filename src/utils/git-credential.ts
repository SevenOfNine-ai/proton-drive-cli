/**
 * Git Credential Manager integration.
 *
 * Uses `git credential fill/approve/reject` to resolve credentials
 * from the system's configured credential helper (macOS Keychain,
 * Windows Credential Manager, Linux Secret Service, etc.).
 *
 * Security:
 * - Uses execFile (not exec) to prevent shell injection
 * - 10-second timeout to prevent hanging on interactive helpers
 * - Credentials are passed via stdin, not command-line arguments
 */

import { execFile } from 'child_process';

export interface GitCredential {
  protocol: string;
  host: string;
  username: string;
  password: string;
}

const DEFAULT_HOST = 'drive.proton.me';
const DEFAULT_PROTOCOL = 'https';
const TIMEOUT_MS = 10_000;

/**
 * Parse `key=value` lines from git credential output.
 */
function parseCredentialOutput(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 1) continue;
    const key = trimmed.substring(0, eqIndex);
    const value = trimmed.substring(eqIndex + 1);
    result[key] = value;
  }
  return result;
}

/**
 * Format a GitCredential as `key=value\n` lines for stdin.
 */
function formatCredentialInput(fields: Partial<GitCredential>): string {
  const lines: string[] = [];
  if (fields.protocol) lines.push(`protocol=${fields.protocol}`);
  if (fields.host) lines.push(`host=${fields.host}`);
  if (fields.username) lines.push(`username=${fields.username}`);
  if (fields.password) lines.push(`password=${fields.password}`);
  lines.push(''); // trailing blank line signals end of input
  return lines.join('\n');
}

/**
 * Run a `git credential <action>` command.
 */
function runGitCredential(
  action: 'fill' | 'approve' | 'reject',
  stdinData: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      ['credential', action],
      { timeout: TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          reject(new Error(`git credential ${action} failed: ${msg}`));
          return;
        }
        resolve(stdout);
      },
    );

    child.stdin?.write(stdinData);
    child.stdin?.end();
  });
}

/**
 * Resolve credentials using `git credential fill`.
 *
 * Writes `protocol=https\nhost=<host>\n\n` to stdin of
 * `git credential fill` and parses the key=value output.
 *
 * @param host - Credential host (default: drive.proton.me)
 * @returns Resolved credential with username and password
 */
export async function gitCredentialFill(host?: string): Promise<GitCredential> {
  const input = formatCredentialInput({
    protocol: DEFAULT_PROTOCOL,
    host: host || DEFAULT_HOST,
  });

  const output = await runGitCredential('fill', input);
  const parsed = parseCredentialOutput(output);

  if (!parsed.username || !parsed.password) {
    throw new Error(
      'git credential fill did not return username and password. ' +
      'Ensure a credential helper is configured (e.g., git-credential-manager).',
    );
  }

  return {
    protocol: parsed.protocol || DEFAULT_PROTOCOL,
    host: parsed.host || host || DEFAULT_HOST,
    username: parsed.username,
    password: parsed.password,
  };
}

/**
 * Store credentials using `git credential approve`.
 *
 * Call this after a successful authentication to persist
 * credentials in the configured credential helper.
 */
export async function gitCredentialApprove(cred: GitCredential): Promise<void> {
  const input = formatCredentialInput(cred);
  await runGitCredential('approve', input);
}

/**
 * Remove credentials using `git credential reject`.
 *
 * Call this when credentials are known to be invalid so the
 * credential helper can remove them from its store.
 */
export async function gitCredentialReject(cred: GitCredential): Promise<void> {
  const input = formatCredentialInput(cred);
  await runGitCredential('reject', input);
}
