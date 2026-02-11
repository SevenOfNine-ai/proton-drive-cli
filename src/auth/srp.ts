import { SRPHandshake } from '../types/auth';
import { getSrp, AuthInfo, AuthCredentials } from './srp/srp-impl';

/**
 * SRP-6a implementation for Proton Drive authentication
 * Adapted from ProtonMail WebClients
 */

export class SRPClient {
  /**
   * Compute SRP handshake for authentication
   * @param username - User's email
   * @param password - User's password
   * @param salt - Salt from auth/info (base64)
   * @param modulus - Modulus from auth/info (base64, PGP-signed)
   * @param serverEphemeral - Server ephemeral from auth/info (base64)
   * @param version - Auth version (default 4)
   */
  static async computeHandshake(
    username: string,
    password: string,
    salt: string,
    modulus: string,
    serverEphemeral: string,
    version: number = 4,
    serverUsername?: string
  ): Promise<SRPHandshake> {
    try {
      // Prepare auth info from server
      const authInfo: AuthInfo = {
        Version: version,
        Modulus: modulus,
        ServerEphemeral: serverEphemeral,
        Salt: salt,
        Username: serverUsername,
      };

      // Prepare credentials
      const credentials: AuthCredentials = {
        username,
        password,
      };

      // Compute SRP proofs
      const result = await getSrp(authInfo, credentials);

      return {
        clientEphemeral: result.clientEphemeral,
        clientProof: result.clientProof,
        expectedServerProof: result.expectedServerProof,
      };
    } catch (error) {
      throw new Error(
        `SRP handshake failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Verify server proof matches expected value
   * @param serverProof - Proof from server
   * @param expectedProof - Expected proof calculated during handshake
   */
  static verifyServerProof(serverProof: string, expectedProof: string): boolean {
    if (serverProof.length !== expectedProof.length) return false;
    const a = Buffer.from(serverProof, 'base64');
    const b = Buffer.from(expectedProof, 'base64');
    if (a.length !== b.length) return false;
    return require('crypto').timingSafeEqual(a, b);
  }
}
