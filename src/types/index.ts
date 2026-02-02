// Re-export auth types
export * from './auth';

// Re-export drive types
export * from './drive';

// Re-export crypto types
export * from './crypto';

// Placeholder for shared types
export interface ProtonSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  uid: string;
  scopes: string[];
}

export interface UploadOptions {
  filePath: string;
  destinationPath: string;
}
