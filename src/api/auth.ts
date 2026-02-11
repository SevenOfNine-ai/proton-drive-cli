import axios, { AxiosInstance } from 'axios';
import { AuthInfoResponse, AuthResponse } from '../types/auth';
import { CaptchaError } from '../errors/types';
import { logger } from '../utils/logger';

/**
 * Authentication API client for Proton API
 * Handles SRP authentication flow with Proton's API
 */
export class AuthApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = 'https://drive-api.proton.me') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'x-pm-appversion': 'web-drive@5.2.0',
      },
    });
  }

  /**
   * Get authentication info (Step 1 of SRP auth)
   * @param username - User's email address
   * @param captchaToken - Optional CAPTCHA verification token
   * @returns Auth info including SRP parameters
   */
  async getAuthInfo(username: string, captchaToken?: string): Promise<AuthInfoResponse> {
    try {
      const headers: any = {};
      if (captchaToken) {
        // Proton API requires TWO separate headers for human verification
        // See: https://github.com/ProtonMail/proton-python-client
        headers['X-PM-Human-Verification-Token-Type'] = 'captcha';
        headers['X-PM-Human-Verification-Token'] = captchaToken;
        logger.debug(`Sending CAPTCHA headers to getAuthInfo`);
        logger.debug(`  X-PM-Human-Verification-Token-Type: captcha`);
      }

      const response = await this.client.post<AuthInfoResponse>(
        '/auth/v4/info',
        { Username: username },
        { headers }
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.data?.Code === 9001) {
        const details = error.response.data.Details;
        logger.debug('getAuthInfo CAPTCHA error details:', JSON.stringify(details, null, 2));
        throw new CaptchaError({
          captchaUrl: details.WebUrl,
          captchaToken: details.HumanVerificationToken,
          verificationMethods: details.HumanVerificationMethods,
        });
      }

      if (error.response) {
        logger.debug('API Error Response:', JSON.stringify(error.response.data, null, 2));
        logger.debug('Status:', error.response.status);
      }
      throw error;
    }
  }

  /**
   * Authenticate with SRP proofs (Step 2 of SRP auth)
   * @param username - User's email address
   * @param clientEphemeral - Client ephemeral value (base64)
   * @param clientProof - Client proof (base64)
   * @param srpSession - SRP session ID from auth/info
   * @param captchaToken - Optional CAPTCHA verification token
   * @returns Authentication response with tokens
   */
  async authenticate(
    username: string,
    clientEphemeral: string,
    clientProof: string,
    srpSession: string,
    captchaToken?: string
  ): Promise<AuthResponse> {
    try {
      const headers: any = {};
      if (captchaToken) {
        // Proton API requires TWO separate headers for human verification
        // See: https://github.com/ProtonMail/proton-python-client
        headers['X-PM-Human-Verification-Token-Type'] = 'captcha';
        headers['X-PM-Human-Verification-Token'] = captchaToken;
        logger.debug(`Sending CAPTCHA headers to authenticate()`);
        logger.debug(`  X-PM-Human-Verification-Token-Type: captcha`);
      }

      const response = await this.client.post<AuthResponse>(
        '/auth/v4',
        {
          Username: username,
          ClientEphemeral: clientEphemeral,
          ClientProof: clientProof,
          SRPSession: srpSession,
        },
        { headers }
      );

      const data = response.data;
      if (!data.UID || !data.AccessToken || !data.RefreshToken || !data.ServerProof) {
        throw new Error('Incomplete auth response: missing required tokens');
      }
      return data;
    } catch (error: any) {
      if (error.response?.data?.Code === 9001) {
        const details = error.response.data.Details;
        logger.debug('authenticate CAPTCHA error details:', JSON.stringify(details, null, 2));
        throw new CaptchaError({
          captchaUrl: details.WebUrl,
          captchaToken: details.HumanVerificationToken,
          verificationMethods: details.HumanVerificationMethods,
        });
      }

      if (error.response) {
        logger.debug('API Error Response:', JSON.stringify(error.response.data, null, 2));
        logger.debug('Status:', error.response.status);
      }
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param uid - User ID
   * @param refreshToken - Refresh token
   * @returns New access and refresh tokens
   */
  async refreshToken(
    uid: string,
    refreshToken: string
  ): Promise<{ AccessToken: string; RefreshToken: string }> {
    const response = await this.client.post('/auth/v4/refresh', {
      UID: uid,
      RefreshToken: refreshToken,
      ResponseType: 'token',
      GrantType: 'refresh_token',
      RedirectURI: 'http://proton.me',
    }, {
      headers: { 'x-pm-uid': uid },
    });

    const data = response.data;
    if (!data.AccessToken || !data.RefreshToken) {
      throw new Error('Incomplete refresh response: missing tokens');
    }
    return data;
  }

  /**
   * Logout and revoke current session
   * @param accessToken - Current access token
   */
  async logout(accessToken: string): Promise<void> {
    await this.client.delete('/auth/v4', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  }
}
