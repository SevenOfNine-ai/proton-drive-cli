export interface AuthInfoResponse {
  Modulus: string;           // Base64-encoded, PGP-signed
  ServerEphemeral: string;   // Base64-encoded
  Version: number;           // Auth version (usually 4)
  Salt: string;              // Base64-encoded
  SRPSession: string;        // Session ID for this auth attempt
  Username?: string;         // Username returned by server (for old auth versions)
}

export interface AuthResponse {
  UID: string;
  AccessToken: string;
  RefreshToken: string;
  TokenType: string;
  Scopes: string[];
  ServerProof: string;       // For verification
  PasswordMode: number;      // 1 = single password, 2 = two password
  '2FA': {
    Enabled: number;
    FIDO2: { RegisteredKeys: any[] };
    TOTP: number;
  };
}

export interface SessionCredentials {
  sessionId: string;
  uid: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  passwordMode: number;
  mailboxPassword?: string; // Stored for crypto operations (encrypted storage recommended in production)
}

export interface SRPHandshake {
  clientEphemeral: string;
  clientProof: string;
  expectedServerProof: string;
}
