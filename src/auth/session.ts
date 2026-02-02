import * as fs from 'fs-extra';
import * as path from 'path';
import { homedir } from 'os';
import { SessionCredentials } from '../types/auth';

/**
 * Session manager for storing and retrieving authentication credentials
 * Stores session data in ~/.proton-drive-cli/session.json
 */

const SESSION_DIR = path.join(homedir(), '.proton-drive-cli');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

export class SessionManager {
  /**
   * Save session credentials to disk
   * @param session - Session credentials to save
   */
  static async saveSession(session: SessionCredentials): Promise<void> {
    try {
      // Ensure directory exists
      await fs.ensureDir(SESSION_DIR);

      // Write session data
      await fs.writeJson(SESSION_FILE, session, { spaces: 2 });

      // Set restrictive permissions (600 - read/write for owner only)
      await fs.chmod(SESSION_FILE, 0o600);
    } catch (error) {
      throw new Error(`Failed to save session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load session credentials from disk
   * @returns Session credentials or null if not found
   */
  static async loadSession(): Promise<SessionCredentials | null> {
    try {
      if (await fs.pathExists(SESSION_FILE)) {
        const session = await fs.readJson(SESSION_FILE);

        // Validate session has required fields
        if (this.isValidSession(session)) {
          return session;
        } else {
          console.warn('Session file is corrupted or invalid. Please login again.');
          return null;
        }
      }
    } catch (error) {
      console.error('Failed to load session:', error instanceof Error ? error.message : 'Unknown error');
    }
    return null;
  }

  /**
   * Clear saved session from disk
   */
  static async clearSession(): Promise<void> {
    try {
      if (await fs.pathExists(SESSION_FILE)) {
        await fs.remove(SESSION_FILE);
      }
    } catch (error) {
      throw new Error(`Failed to clear session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a valid session exists
   * @returns True if a valid session exists
   */
  static async hasValidSession(): Promise<boolean> {
    const session = await this.loadSession();
    if (!session) return false;

    // TODO: Check if token is expired by decoding JWT
    // For now, just check if required fields exist
    return this.isValidSession(session);
  }

  /**
   * Validate session object has all required fields
   * @param session - Session object to validate
   * @returns True if session is valid
   */
  private static isValidSession(session: any): session is SessionCredentials {
    return !!(
      session &&
      typeof session === 'object' &&
      session.sessionId &&
      session.uid &&
      session.accessToken &&
      session.refreshToken &&
      Array.isArray(session.scopes) &&
      typeof session.passwordMode === 'number'
    );
  }

  /**
   * Get session directory path
   * @returns Path to session directory
   */
  static getSessionDir(): string {
    return SESSION_DIR;
  }

  /**
   * Get session file path
   * @returns Path to session file
   */
  static getSessionFilePath(): string {
    return SESSION_FILE;
  }
}
