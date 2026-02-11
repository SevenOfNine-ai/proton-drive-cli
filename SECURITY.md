# Security

## Credential Handling

- **Passwords are never persisted to disk.** The session file stores only revocable tokens.
- **Passwords are never accepted via CLI flags or environment variables.** Use `--password-stdin` or interactive prompts only.
- **SRP server proof verification** uses constant-time comparison (`crypto.timingSafeEqual`).

## Credential Flows

- **pass-cli mode:** pass-cli -> Go adapter -> stdin -> proton-drive-cli (memory only)
- **git-credential mode:** git credential helper -> proton-drive-cli (local resolution, never sent over HTTP)

## Encryption

- All encryption happens locally before upload via `@protontech/drive-sdk`
- Private keys are decrypted in memory and never written to disk

## File System

- Session directory: `0700`; session file: `0600` (owner-only)
- Path traversal prevention: `..` and null bytes rejected in all path operations
- OID validation: `/^[a-f0-9]{64}$/i` enforced before any bridge operation
- Subprocess calls use `execFile` (not `exec`) to prevent shell injection

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via GitHub Security Advisories rather than opening a public issue.
