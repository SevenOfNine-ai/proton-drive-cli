import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { jwtDecode } from 'jwt-decode';
import {
  Volume,
  VolumesResponse,
  Share,
  SharesResponse,
  Link,
  ChildrenResponse,
  LinkResponse,
  CreateFolderRequest,
  CreateFolderResponse,
  CreateFileRequest,
  CreateFileResponse,
} from '../types/drive';
import { RevisionResponse } from '../types/download';
import { SessionManager } from '../auth/session';
import { SessionCredentials } from '../types/auth';
import { verboseLog } from '../utils/output';

/**
 * Drive API client for Proton Drive operations
 * Handles authenticated requests to the Drive API
 */
export class DriveApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<void> | null = null;

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

    // Add request interceptor to include auth token and check expiration
    this.client.interceptors.request.use(
      async (config) => {
        let session = await SessionManager.loadSession();
        if (!session) {
          throw new Error('No valid session. Please login first.');
        }

        // Check if token is about to expire (within 5 minutes)
        if (this.isTokenExpiringSoon(session.accessToken)) {
          verboseLog('[Token Refresh] Access token expiring soon, refreshing proactively...');

          // Refresh the token proactively
          if (this.isRefreshing && this.refreshPromise) {
            // Wait for ongoing refresh
            await this.refreshPromise;
          } else {
            // Start new refresh
            this.isRefreshing = true;
            this.refreshPromise = this.refreshAccessToken();
            try {
              await this.refreshPromise;
            } catch (error) {
              if (process.env.VERBOSE === 'true') {
                console.error('[Token Refresh] Proactive refresh failed:', error);
              }
              // Continue with current token - will fail with 401 if truly expired
            } finally {
              this.isRefreshing = false;
              this.refreshPromise = null;
            }
          }

          // Reload session to get fresh token
          session = await SessionManager.loadSession();
          if (!session) {
            throw new Error('Session lost during token refresh');
          }
        }

        config.headers['Authorization'] = `Bearer ${session.accessToken}`;
        config.headers['x-pm-uid'] = session.uid;
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling and token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (error.response) {
          const { status, data } = error.response;

          // Handle 401 Unauthorized - try to refresh token
          if (status === 401 && !originalRequest._retry) {
            // Mark this request as already retried to prevent infinite loops
            originalRequest._retry = true;

            try {
              // If already refreshing, wait for that to complete
              if (this.isRefreshing && this.refreshPromise) {
                await this.refreshPromise;
              } else {
                // Start a new refresh
                this.isRefreshing = true;
                this.refreshPromise = this.refreshAccessToken();
                await this.refreshPromise;
                this.isRefreshing = false;
                this.refreshPromise = null;
              }

              // Retry the original request with updated token
              const session = await SessionManager.loadSession();
              if (session) {
                originalRequest.headers['Authorization'] = `Bearer ${session.accessToken}`;
                originalRequest.headers['x-pm-uid'] = session.uid;
                return this.client(originalRequest);
              }
            } catch (refreshError) {
              // Token refresh failed - user needs to login again
              this.isRefreshing = false;
              this.refreshPromise = null;
              throw new Error('Session expired and could not be refreshed. Please login again.');
            }
          }

          // Handle scope errors (9101)
          if (data && typeof data === 'object' && 'Code' in data) {
            const apiData = data as { Code?: number; Error?: string };

            if (apiData.Code === 9101) {
              // Insufficient scope - this usually means session needs to be refreshed or re-authenticated
              throw new Error(
                'Session has insufficient permissions. This may happen after token refresh. ' +
                'Please login again using: proton-drive login'
              );
            }

            // Handle other API errors
            if ('Error' in data) {
              throw new Error(`API Error (${apiData.Code}): ${apiData.Error}`);
            }
          }
        }
        throw error;
      }
    );
  }

  /**
   * Refresh the access token using the refresh token
   * This is called automatically when a 401 error is encountered
   */
  private async refreshAccessToken(): Promise<void> {
    const currentSession = await SessionManager.loadSession();
    if (!currentSession || !currentSession.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      verboseLog(`[Token Refresh] Current scopes: ${currentSession.scopes.join(', ')}`);

      // Call the auth API to refresh the token
      const response = await axios.post<{
        AccessToken: string;
        RefreshToken: string;
        Scopes?: string[];
      }>(
        `${this.baseUrl}/auth/v4/refresh`,
        {
          UID: currentSession.uid,
          RefreshToken: currentSession.refreshToken,
          ResponseType: 'token',
          GrantType: 'refresh_token',
          RedirectURI: 'http://proton.me',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-pm-appversion': 'web-drive@5.2.0',
          },
          timeout: 15000,
        }
      );

      verboseLog(`[Token Refresh] Response scopes: ${response.data.Scopes?.join(', ') || 'none provided'}`);

      // Update session with new tokens and scopes (if provided)
      const updatedSession: SessionCredentials = {
        ...currentSession,
        accessToken: response.data.AccessToken,
        refreshToken: response.data.RefreshToken,
        // Use new scopes if provided, otherwise keep existing
        scopes: response.data.Scopes || currentSession.scopes,
      };

      await SessionManager.saveSession(updatedSession);
      verboseLog(`[Token Refresh] Access token refreshed successfully with scopes: ${updatedSession.scopes.join(', ')}`);
    } catch (error) {
      if (process.env.VERBOSE === 'true') {
        console.error('[Token Refresh] Failed to refresh token:', error instanceof Error ? error.message : 'Unknown error');
      }
      throw error;
    }
  }

  /**
   * Check if a JWT token is expiring soon (within 5 minutes)
   * @param token - JWT access token
   * @returns True if token expires within 5 minutes
   */
  private isTokenExpiringSoon(token: string): boolean {
    try {
      const decoded = jwtDecode<{ exp: number }>(token);
      if (!decoded.exp) {
        return false; // No expiration claim
      }

      const now = Math.floor(Date.now() / 1000); // Current time in seconds
      const expiresIn = decoded.exp - now;
      const fiveMinutes = 5 * 60;

      return expiresIn < fiveMinutes;
    } catch (error) {
      // If we can't decode the token, assume it's not expiring soon
      // This prevents unnecessary refresh attempts on malformed tokens
      return false;
    }
  }

  /**
   * List all volumes for the authenticated user
   * @returns Array of volumes
   */
  async listVolumes(): Promise<Volume[]> {
    const response = await this.client.get<VolumesResponse>('/drive/volumes');
    return response.data.Volumes;
  }

  /**
   * Get a specific volume by ID
   * @param volumeId - Volume ID
   * @returns Volume details
   */
  async getVolume(volumeId: string): Promise<Volume> {
    const volumes = await this.listVolumes();
    const volume = volumes.find(v => v.VolumeID === volumeId);
    if (!volume) {
      throw new Error(`Volume not found: ${volumeId}`);
    }
    return volume;
  }

  /**
   * List all shares in a volume
   * @param volumeId - Volume ID
   * @returns Array of shares
   */
  async listShares(volumeId: string): Promise<Share[]> {
    const response = await this.client.get<SharesResponse>(
      `/drive/volumes/${volumeId}/shares`
    );
    return response.data.Shares;
  }

  /**
   * Get a specific share by ID (bootstrap endpoint)
   * @param shareId - Share ID
   * @returns Share details with encryption keys
   */
  async getShare(shareId: string): Promise<Share> {
    // Note: The API returns the share object directly in response.data, not wrapped in a Share property
    const response = await this.client.get<Share & { Code: number }>(
      `/drive/shares/${shareId}`
    );
    return response.data as Share;
  }

  /**
   * Get a specific link (file or folder) by ID
   * @param shareId - Share ID
   * @param linkId - Link ID
   * @returns Link details
   */
  async getLink(shareId: string, linkId: string): Promise<Link> {
    const response = await this.client.get<LinkResponse>(
      `/drive/shares/${shareId}/links/${linkId}`
    );
    return response.data.Link;
  }

  /**
   * List children of a folder
   * @param shareId - Share ID
   * @param linkId - Parent folder link ID
   * @param page - Page number (0-indexed)
   * @param pageSize - Number of items per page
   * @returns Array of child links
   */
  async listChildren(
    shareId: string,
    linkId: string,
    page: number = 0,
    pageSize: number = 150
  ): Promise<Link[]> {
    const response = await this.client.get<ChildrenResponse>(
      `/drive/shares/${shareId}/folders/${linkId}/children`,
      {
        params: {
          Page: page,
          PageSize: pageSize,
        },
      }
    );
    return response.data.Links;
  }

  /**
   * Create a new folder
   * @param volumeId - Volume ID
   * @param request - Folder creation request
   * @returns Created folder ID
   */
  async createFolder(volumeId: string, request: CreateFolderRequest): Promise<string> {
    const response = await this.client.post<CreateFolderResponse>(
      `/drive/v2/volumes/${volumeId}/folders`,
      request
    );

    return response.data.Folder.ID;
  }

  /**
   * Create a new file
   * @param shareId - Share ID
   * @param request - File creation request
   * @returns Created file metadata
   */
  async createFile(shareId: string, request: Omit<CreateFileRequest, 'ShareID'>): Promise<CreateFileResponse> {
    const response = await this.client.post<CreateFileResponse>(
      `/drive/shares/${shareId}/files`,
      { ShareID: shareId, ...request }
    );
    return response.data;
  }

  /**
   * Get verification data for a file revision
   * @param volumeId - Volume ID
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @returns Verification code and content key packet
   */
  async getVerificationData(
    volumeId: string,
    fileId: string,
    revisionId: string
  ): Promise<{
    VerificationCode: string;
    ContentKeyPacket: string;
  }> {
    const response = await this.client.get(
      `/drive/v2/volumes/${volumeId}/links/${fileId}/revisions/${revisionId}/verification`
    );
    return response.data;
  }

  /**
   * Create upload links for file blocks
   * @param volumeId - Volume ID
   * @param shareId - Share ID (not used in URL but needed in request)
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @param addressId - Address ID
   * @param blockList - List of blocks to upload
   * @returns Upload URLs and tokens for each block
   */
  async createBlockLinks(
    volumeId: string,
    shareId: string,
    fileId: string,
    revisionId: string,
    addressId: string,
    blockList: Array<{
      Index: number;
      Hash: string;
      EncSignature: string;
      Size: number;
      Verifier: {
        Token: string;
      };
    }>
  ): Promise<{
    UploadLinks: Array<{
      Index: number;
      URL: string;
      Token: string;
      BareURL: string;
    }>;
  }> {
    const response = await this.client.post('/drive/blocks', {
      AddressID: addressId,
      VolumeID: volumeId,
      LinkID: fileId,
      RevisionID: revisionId,
      BlockList: blockList,
    });
    return response.data;
  }

  /**
   * Upload a block to the provided URL
   * @param url - Upload URL
   * @param token - Upload token
   * @param blockData - Encrypted block data
   * @returns Upload result
   */
  async uploadBlock(url: string, token: string, blockData: Uint8Array): Promise<void> {
    // Create FormData with the block as a Blob (matching SDK implementation)
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('Block', Buffer.from(blockData), { filename: 'blob' });

    await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`,
      },
      timeout: 900000, // 15 minutes for large blocks
    });
  }

  /**
   * Finalize file revision after all blocks are uploaded
   * @param volumeId - Volume ID
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @param manifestSignature - Manifest signature
   * @param signatureAddress - Signature address (email)
   * @returns Finalized revision
   */
  async finalizeRevision(
    volumeId: string,
    fileId: string,
    revisionId: string,
    manifestSignature: string,
    signatureAddress: string
  ): Promise<void> {
    await this.client.put(
      `/drive/v2/volumes/${volumeId}/files/${fileId}/revisions/${revisionId}`,
      {
        ManifestSignature: manifestSignature,
        SignatureAddress: signatureAddress,
        XAttr: null,
        Photo: null,
      }
    );
  }

  /**
   * Delete a link (file or folder)
   * @param shareId - Share ID
   * @param linkId - Link ID to delete
   */
  async deleteLink(shareId: string, linkId: string): Promise<void> {
    await this.client.delete(`/drive/shares/${shareId}/links/${linkId}`);
  }

  /**
   * Move a link to trash
   * @param shareId - Share ID
   * @param linkId - Link ID to trash
   */
  async trashLink(shareId: string, linkId: string): Promise<void> {
    await this.client.post(`/drive/shares/${shareId}/links/${linkId}/trash`);
  }

  /**
   * Restore a link from trash
   * @param shareId - Share ID
   * @param linkId - Link ID to restore
   */
  async restoreLink(shareId: string, linkId: string): Promise<void> {
    await this.client.put(`/drive/shares/${shareId}/links/${linkId}/restore`);
  }

  /**
   * Rename a link
   * @param shareId - Share ID
   * @param linkId - Link ID
   * @param name - New encrypted name
   * @param hash - Hash of decrypted name
   * @param signatureAddress - Signature address
   */
  async renameLink(
    shareId: string,
    linkId: string,
    name: string,
    hash: string,
    signatureAddress: string
  ): Promise<Link> {
    const response = await this.client.put<LinkResponse>(
      `/drive/shares/${shareId}/links/${linkId}`,
      {
        Name: name,
        Hash: hash,
        SignatureAddress: signatureAddress,
      }
    );
    return response.data.Link;
  }

  /**
   * Get download URL for a file
   * @param shareId - Share ID
   * @param linkId - File link ID
   * @param revisionId - Revision ID
   * @returns Download URL and token
   */
  async getDownloadUrl(
    shareId: string,
    linkId: string,
    revisionId: string
  ): Promise<{ Blocks: Array<{ URL: string; Token: string }> }> {
    const response = await this.client.get(
      `/drive/shares/${shareId}/files/${linkId}/revisions/${revisionId}`
    );
    return response.data.Revision;
  }

  /**
   * Get file revision with block metadata for download
   * @param volumeId - Volume ID
   * @param linkId - File link ID
   * @param revisionId - Revision ID
   * @returns Revision with blocks and manifest signature
   */
  async getRevisionBlocks(
    volumeId: string,
    linkId: string,
    revisionId: string
  ): Promise<RevisionResponse> {
    const response = await this.client.get<RevisionResponse>(
      `/drive/v2/volumes/${volumeId}/files/${linkId}/revisions/${revisionId}`
    );
    return response.data;
  }

  /**
   * Download a block from storage
   * @param url - Block storage URL
   * @param token - Authorization token
   * @returns Encrypted block data
   */
  async downloadBlock(url: string, token: string): Promise<Uint8Array> {
    const response = await axios.get(url, {
      headers: {
        'pm-storage-token': token,
      },
      responseType: 'arraybuffer',
      timeout: 900000, // 15 minutes for large blocks
    });

    return new Uint8Array(response.data);
  }
}
