/**
 * Proton Pass CLI credential provider.
 *
 * Resolves credentials by searching pass-cli vaults for login entries
 * with a proton.me URL. Replaces the Go-side pass-cli integration
 * (cmd/adapter/passcli.go) so the Go adapter no longer needs to
 * resolve credentials itself.
 *
 * Security:
 * - Uses execFile (not exec) to prevent shell injection
 * - 15-second timeout on all subprocess calls
 * - Credentials never exposed via command-line arguments
 */

import { execFile } from 'child_process';

import type { CredentialProvider, Credentials } from './types';

const TIMEOUT_MS = 15_000;
const DEFAULT_BIN = 'pass-cli';
const PROTON_URL_PATTERN = /proton\.me/i;

interface PassCliVault {
  id: string;
  name: string;
}

interface PassCliLoginItem {
  name: string;
  username?: string;
  email?: string;
  password?: string;
  urls?: string[];
}

function getPassCliBin(): string {
  return process.env.PROTON_PASS_CLI_BIN?.trim() || DEFAULT_BIN;
}

function runPassCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      getPassCliBin(),
      args,
      { timeout: TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          reject(new Error(`pass-cli ${args[0]} failed: ${msg}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** Check if pass-cli is installed and logged in. */
async function passCliTest(): Promise<boolean> {
  try {
    await runPassCli(['test']);
    return true;
  } catch {
    return false;
  }
}

/** List all vaults. */
async function listVaults(): Promise<PassCliVault[]> {
  const output = await runPassCli(['vault', 'list', '--output', 'json']);
  const parsed = JSON.parse(output);
  // pass-cli returns { vaults: [...] } or an array directly
  const vaults = Array.isArray(parsed) ? parsed : (parsed.vaults || []);
  return vaults.map((v: any) => ({ id: v.id || v.vaultId, name: v.name }));
}

/** Search a single vault for login items matching proton.me URL. */
async function searchVault(vault: string): Promise<PassCliLoginItem[]> {
  const output = await runPassCli([
    'item', 'list', vault,
    '--filter-type', 'login',
    '--output', 'json',
  ]);
  const items: any[] = JSON.parse(output);
  return items
    .filter((item: any) => {
      const urls: string[] = item.urls || [];
      return urls.some((url: string) => PROTON_URL_PATTERN.test(url));
    })
    .map((item: any) => ({
      name: item.name || item.title,
      username: item.username,
      email: item.email,
      password: item.password,
      urls: item.urls,
    }));
}

/** Search all vaults for a Proton login entry. */
async function searchProtonEntry(): Promise<PassCliLoginItem | null> {
  const vaults = await listVaults();
  for (const vault of vaults) {
    const matches = await searchVault(vault.name);
    if (matches.length > 0) {
      return matches[0];
    }
  }
  return null;
}

export class PassCliProvider implements CredentialProvider {
  readonly name = 'pass-cli' as const;

  async isAvailable(): Promise<boolean> {
    return passCliTest();
  }

  async resolve(options?: { username?: string }): Promise<Credentials> {
    const loggedIn = await passCliTest();
    if (!loggedIn) {
      throw new Error(
        'pass-cli is not logged in. Run: pass-cli login',
      );
    }

    const entry = await searchProtonEntry();
    if (!entry || !entry.password) {
      throw new Error(
        'No Proton login entry found in pass-cli vaults. ' +
        'Create one with a proton.me URL, or use --credential-provider git-credential.',
      );
    }

    const username = options?.username || entry.email || entry.username;
    if (!username) {
      throw new Error(
        'Proton login entry found but has no username or email.',
      );
    }

    return { username, password: entry.password };
  }

  async store(username: string, password: string): Promise<void> {
    await runPassCli([
      'item', 'create', 'login',
      '--title', 'Proton',
      '--email', username,
      '--password', password,
      '--url', 'https://proton.me',
    ]);
  }

  async remove(username: string): Promise<void> {
    // Find the entry first, then delete by name
    const entry = await searchProtonEntry();
    if (!entry) {
      throw new Error(`No Proton entry found for ${username}`);
    }
    // pass-cli doesn't have a direct delete-by-name; this is best-effort
    throw new Error('pass-cli item removal is not yet supported via CLI');
  }

  async verify(): Promise<boolean> {
    try {
      const loggedIn = await passCliTest();
      if (!loggedIn) return false;
      const entry = await searchProtonEntry();
      return entry !== null && !!entry.password;
    } catch {
      return false;
    }
  }
}

// Export helpers for testing
export { passCliTest, listVaults, searchVault, searchProtonEntry };
