/**
 * Download-related type definitions
 */

/**
 * Block metadata from API
 */
export interface BlockMetadata {
  index: number;
  bareUrl: string;
  token: string;
  hash: string; // Base64-encoded SHA-256 hash
  encryptedSignature?: string;
}

/**
 * Manifest signature metadata
 */
export interface ManifestSignature {
  armoredSignature: string;
}

/**
 * Download options
 */
export interface DownloadOptions {
  /** Output file path */
  outputPath: string;
  /** Progress callback */
  onProgress?: (downloaded: number, total: number) => void;
  /** Skip integrity verification (not recommended) */
  skipVerification?: boolean;
}

/**
 * Download result
 */
export interface DownloadResult {
  /** Downloaded file path */
  filePath: string;
  /** Total bytes downloaded */
  size: number;
  /** Number of blocks downloaded */
  downloadedBlocks: number;
  /** Whether manifest signature was verified (false if signer unknown or verification skipped) */
  verified: boolean;
}

/**
 * Revision response from API
 */
export interface RevisionResponse {
  Revision: {
    ID: string;
    ManifestSignature: string;
    SignatureAddress: string;
    Blocks: Array<{
      Index: number;
      BareURL: string;
      Token: string;
      Hash: string; // Base64 SHA-256
      EncSignature?: string;
    }>;
    Thumbnails?: Array<{
      Type: number;
      Hash: string;
    }>;
  };
}

/**
 * Maximum number of concurrent block downloads per file
 */
export const MAX_CONCURRENT_DOWNLOADS = 10;

/**
 * Default block size (4MB)
 */
export const DEFAULT_BLOCK_SIZE = 4 * 1024 * 1024;
