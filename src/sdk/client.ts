/**
 * SDK client factory for the Proton Drive SDK.
 *
 * Constructs a ProtonDriveClient with all required adapters:
 * - OpenPGPCryptoProxy → OpenPGPCryptoWithCryptoProxy
 * - HTTPClientAdapter (injects session tokens)
 * - AccountAdapter (wraps DriveCryptoService)
 * - SRPModuleAdapter (wraps SRP + key derivation)
 * - MemoryCache × 2 (entities + crypto)
 */

import {
  ProtonDriveClient,
  MemoryCache,
  OpenPGPCryptoWithCryptoProxy,
} from '@protontech/drive-sdk';
import { ProtonOpenPGPCryptoProxy } from './cryptoProxy';
import { HTTPClientAdapter } from './httpClientAdapter';
import { AccountAdapter } from './accountAdapter';
import { SRPModuleAdapter } from './srpAdapter';
import { DriveCryptoService } from '../crypto/drive-crypto';
import { AuthService } from '../auth';
import { SessionManager } from '../auth/session';
import { logger } from '../utils/logger';

/**
 * Create an authenticated ProtonDriveClient with all adapters.
 *
 * Handles two flows:
 * 1. Existing session + password → restore session, initialize crypto
 * 2. Full login → authenticate, then initialize crypto
 *
 * @param password - User's mailbox password (always required for crypto)
 * @param username - Required for full login (optional if restoring session)
 * @returns Initialized ProtonDriveClient ready for operations
 */
export async function createSDKClient(
  password: string,
  username?: string,
): Promise<ProtonDriveClient> {
  // Initialize DriveCryptoService with the password.
  // This decrypts user keys, address keys, and caches them.
  const driveCrypto = new DriveCryptoService();

  // Try existing session first
  let needsFullLogin = false;
  try {
    const session = await SessionManager.loadSession();
    if (session && password) {
      await driveCrypto.initialize(password);
      logger.debug('SDK client: restored from existing session');
    } else {
      needsFullLogin = true;
    }
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('session') || msg.includes('login') || msg.includes('no valid') || msg.includes('corrupt')) {
      needsFullLogin = true;
    } else {
      throw err;
    }
  }

  if (needsFullLogin) {
    if (!username || !password) {
      throw new Error('No session found and credentials not provided');
    }
    const authService = new AuthService();
    await authService.login(username, password);
    await driveCrypto.initialize(password);
    logger.debug('SDK client: authenticated with full login');
  }

  // Build adapters
  const cryptoProxy = new ProtonOpenPGPCryptoProxy();
  const openPGPCrypto = new OpenPGPCryptoWithCryptoProxy(cryptoProxy);
  const httpClient = new HTTPClientAdapter();
  const account = new AccountAdapter(driveCrypto);
  const srpModule = new SRPModuleAdapter();

  // Construct ProtonDriveClient with all required adapters
  const client = new ProtonDriveClient({
    httpClient,
    entitiesCache: new MemoryCache(),
    cryptoCache: new MemoryCache(),
    account,
    openPGPCryptoModule: openPGPCrypto,
    srpModule,
  });

  return client;
}
