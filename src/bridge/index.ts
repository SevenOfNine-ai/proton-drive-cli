/**
 * Shared bridge exports for Git LFS integration.
 *
 * proton-drive-cli owns the bridge protocol (stdin/stdout JSON contract).
 * proton-lfs-bridge imports these via workspace dependency to avoid
 * duplicating types, validators, and OID path helpers.
 *
 * IMPORTANT: This module re-exports only from bridge/validators.ts,
 * which has no transitive dependencies on chalk, DriveClient, etc.
 * This keeps the import lightweight for proton-lfs-bridge's Jest tests.
 */

export {
  // Types
  BridgeRequest,
  BridgeResponse,

  // Constants
  OID_PATTERN,

  // Validators
  validateOid,
  validateLocalPath,
  errorToStatusCode,

  // OID path mapping
  oidToPath,
  pathToOid,
} from './validators';
