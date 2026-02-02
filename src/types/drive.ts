/**
 * Type definitions for Proton Drive API
 */

/**
 * Volume represents a user's Drive storage container
 */
export interface Volume {
  VolumeID: string;
  CreateTime: number;
  ModifyTime: number;
  State: number; // 1 = active, 2 = restoring, 3 = deleted
  MaxSpace: number;
  UsedSpace: number;
  Share: {
    ShareID: string;
    Type: number; // 1 = main, 2 = standard, 3 = device, 4 = photos
    State: number;
    LinkID: string; // Root folder link ID
    VolumeID: string;
    Creator: string;
    Locked: boolean;
    Flags: number;
    Key: string; // Encrypted share key
    Passphrase: string; // Encrypted passphrase
    PassphraseSignature: string;
    AddressID: string;
  };
}

/**
 * List volumes response
 */
export interface VolumesResponse {
  Code: number;
  Volumes: Volume[];
}

/**
 * Share represents a shared space in Drive
 */
export interface Share {
  ShareID: string;
  Type: number; // 1 = main, 2 = standard, 3 = device, 4 = photos
  State: number;
  LinkID: string; // Root folder link ID
  VolumeID: string;
  Creator: string;
  Locked: boolean;
  Flags: number;
  Key: string; // Encrypted share key
  Passphrase: string; // Encrypted passphrase
  PassphraseSignature: string;
  AddressID: string;
}

/**
 * List shares response
 */
export interface SharesResponse {
  Code: number;
  Shares: Share[];
}

/**
 * Link represents a file or folder in Drive
 */
export interface Link {
  LinkID: string;
  ParentLinkID: string | null;
  Type: number; // 1 = folder, 2 = file
  Name: string; // Encrypted name
  NameSignatureEmail: string;
  Hash: string; // Hash of decrypted name
  State: number; // 1 = active, 2 = trashed, 3 = deleted
  ExpirationTime: number | null;
  Size: number; // File size in bytes (for files)
  MIMEType: string; // Encrypted MIME type
  Attributes: number;
  Permissions: number;
  NodeKey: string; // Encrypted node key
  NodePassphrase: string; // Encrypted node passphrase
  NodePassphraseSignature: string;
  SignatureEmail: string;
  CreateTime: number;
  ModifyTime: number;
  Trashed: number | null;
  Shared: number; // 0 = not shared, 1 = shared by link, 2 = shared by member
  FileProperties?: {
    ContentKeyPacket: string;
    ContentKeyPacketSignature: string;
    ActiveRevision?: {
      ID: string;
      CreateTime: number;
      Size: number;
      State: number;
      Thumbnail: number;
      ThumbnailHash: string;
      ManifestSignature: string;
      SignatureEmail: string;
      XAttr: string;
      Blocks: Array<{
        Index: number;
        Hash: string;
        EncSignature: string;
        URL: string;
        BareURL: string;
        Token: string;
      }>;
    };
  };
  FolderProperties?: {
    NodeHashKey: string;
  };
}

/**
 * List children response
 */
export interface ChildrenResponse {
  Code: number;
  Links: Link[];
}

/**
 * Get link response
 */
export interface LinkResponse {
  Code: number;
  Link: Link;
}

/**
 * Create folder request
 */
export interface CreateFolderRequest {
  ShareID: string;
  ParentLinkID: string;
  Name: string; // Encrypted name
  Hash: string; // Hash of decrypted name
  NodeKey: string; // Encrypted node key
  NodePassphrase: string; // Encrypted node passphrase
  NodePassphraseSignature: string;
  SignatureEmail: string; // Changed from SignatureAddress to match API
  NodeHashKey: string; // For folder
}

/**
 * Create folder response
 */
export interface CreateFolderResponse {
  Code: number;
  Folder: {
    ID: string;
  };
}

/**
 * File upload metadata
 */
export interface FileUploadMetadata {
  Name: string; // Encrypted name
  Hash: string; // Hash of decrypted name
  MIMEType: string; // Encrypted MIME type
  NodeKey: string; // Encrypted node key
  NodePassphrase: string; // Encrypted node passphrase
  NodePassphraseSignature: string;
  SignatureAddress: string;
  ContentKeyPacket: string;
  ContentKeyPacketSignature: string;
}

/**
 * Create file request
 */
export interface CreateFileRequest {
  ShareID: string;
  ParentLinkID: string;
  Name: string;
  Hash: string;
  MIMEType: string;
  NodeKey: string;
  NodePassphrase: string;
  NodePassphraseSignature: string;
  SignatureAddress: string;
  ContentKeyPacket: string;
  ContentKeyPacketSignature: string;
}

/**
 * Create file response
 */
export interface CreateFileResponse {
  Code: number;
  File: {
    ID: string;
    RevisionID: string;
  };
}

/**
 * File revision for upload
 */
export interface FileRevision {
  ID: string;
  State: number;
  Blocks: Array<{
    Index: number;
    URL: string;
    Token: string;
  }>;
}

/**
 * Error response from API
 */
export interface DriveErrorResponse {
  Code: number;
  Error: string;
  Details?: any;
}

/**
 * Node type enum
 */
export enum NodeType {
  FOLDER = 1,
  FILE = 2,
}

/**
 * Node - simplified representation of a file or folder
 */
export interface Node {
  linkId: string;
  parentLinkId: string | null;
  type: NodeType;
  name: string; // Decrypted name
  nameSignatureEmail: string;
  hash: string;
  state: number;
  mimeType: string;
  size: number;
  createTime: number;
  modifyTime: number;
  // File-specific
  activeRevisionId?: string;
  // Folder-specific
  nodeHashKey?: string;
}

/**
 * Node identity - uniquely identifies a node in the Drive hierarchy
 */
export interface NodeIdentity {
  volumeId: string;
  shareId: string;
  linkId: string;
}
