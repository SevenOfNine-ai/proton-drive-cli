/**
 * Username utilities for SRP
 * From ProtonMail WebClients packages/srp/lib/utils/username.ts
 */

/**
 * Clean the username, remove underscore, dashes, dots and lowercase.
 */
export function cleanUsername(name: string = ''): string {
  return name.replace(/[.\-_]/g, '').toLowerCase();
}

/**
 * Validate username for old auth versions.
 */
export function checkUsername(
  authVersion: number,
  username?: string,
  usernameApi?: string
): boolean {
  if (authVersion === 2) {
    if (!username || !usernameApi) {
      throw new Error('Missing username');
    }
    if (cleanUsername(username) !== cleanUsername(usernameApi)) {
      return false;
    }
  }

  if (authVersion <= 1) {
    if (!username || !usernameApi) {
      throw new Error('Missing username');
    }
    if (username.toLowerCase() !== usernameApi.toLowerCase()) {
      return false;
    }
  }

  return true;
}
