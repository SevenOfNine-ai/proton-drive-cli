import axios, { AxiosInstance } from 'axios';
import { User, Address } from '../types/crypto';
import { SessionManager } from '../auth/session';

/**
 * User API client for fetching user keys and addresses
 */
export class UserApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = 'https://drive-api.proton.me') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-pm-appversion': 'web-drive@5.2.0',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(
      async (config) => {
        const session = await SessionManager.loadSession();
        if (!session) {
          throw new Error('No valid session. Please login first.');
        }
        config.headers['Authorization'] = `Bearer ${session.accessToken}`;
        config.headers['x-pm-uid'] = session.uid;
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response) {
          const { status, data } = error.response;

          // Handle 401 Unauthorized - token expired
          if (status === 401) {
            throw new Error('Session expired. Please login again.');
          }

          // Handle other API errors
          if (data?.Error) {
            throw new Error(`API Error (${data.Code}): ${data.Error}`);
          }
        }
        throw error;
      }
    );
  }

  /**
   * Get user information including keys
   * @returns User object with keys
   */
  async getUser(): Promise<User> {
    const response = await this.client.get<{ Code: number; User: User }>('/core/v4/users');
    return response.data.User;
  }

  /**
   * Get user addresses with keys
   * @returns Array of addresses
   */
  async getAddresses(): Promise<Address[]> {
    const response = await this.client.get<{ Code: number; Addresses: Address[] }>('/core/v4/addresses');
    return response.data.Addresses;
  }

  /**
   * Get salts for key decryption
   * @returns Array of key salts
   */
  async getKeySalts(): Promise<Array<{ ID: string; KeySalt: string | null }>> {
    const response = await this.client.get<{
      Code: number;
      KeySalts: Array<{ ID: string; KeySalt: string | null }>;
    }>('/core/v4/keys/salts');
    return response.data.KeySalts;
  }
}
