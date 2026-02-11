# Proton Drive CLI

A command-line interface for Proton Drive with end-to-end encryption, powered by the official `@protontech/drive-sdk`.

## Installation

```bash
npm install
npm run build
```

For local development, invoke the CLI directly with `node dist/index.js`.

## Usage

### Authentication

```bash
# Login (interactive prompts)
proton-drive login

# Login with username (password prompted interactively)
proton-drive login -u your.email@proton.me

# Login with piped password (for scripts / special characters)
printf '%s' 'your-password' | proton-drive login -u your.email@proton.me --password-stdin

# Check authentication status
proton-drive status

# Logout
proton-drive logout
```

Session tokens (no passwords) are stored in `~/.proton-drive-cli/session.json` with `0600` permissions. Tokens are refreshed automatically on HTTP 401 and Proton error code 9101 (insufficient scope).

**Passwords are never accepted via CLI flags or environment variables.** This prevents leaks via `ps`, `/proc/pid/environ`, and shell history. Use interactive prompts or `--password-stdin`.

**CAPTCHA Support:** If CAPTCHA verification is required during login, the CLI will guide you through the semi-automated token extraction process.

#### Credential Providers

The CLI supports multiple credential providers via `--credential-provider`:

**Git Credential Manager** (`--credential-provider git`):

```bash
# Store credentials in the system credential helper (macOS Keychain, etc.)
proton-drive credential store -u your.email@proton.me
# Verify credentials are stored
proton-drive credential verify
# Login using stored credentials
proton-drive login --credential-provider git
# Use with any command
proton-drive ls / --credential-provider git
# Remove stored credentials
proton-drive credential remove -u your.email@proton.me
```

This uses `git credential fill/approve/reject` under the hood, delegating to the system's configured credential helper.

**Scripted usage** (pipe credentials):

```bash
printf '%s' 'password' | proton-drive credential store -u user@proton.me --password-stdin
```

#### Git LFS Integration (pass-cli)

When used through `proton-git-lfs` (`Go adapter -> proton-lfs-bridge -> proton-drive-cli`), credentials are resolved via `pass-cli` and passed over stdin. In that flow, do not run `proton-drive login` manually.

#### Git LFS Integration (git-credential)

Alternatively, use git credential manager instead of pass-cli:

```bash
proton-drive credential store -u your.email@proton.me
export PROTON_CREDENTIAL_PROVIDER=git-credential
```

In this mode, `proton-drive-cli` resolves credentials locally via `git credential fill` — credentials are never sent over HTTP to the LFS bridge.

### File Operations

```bash
# List files
proton-drive ls /
proton-drive ls /Documents --long

# Upload files
proton-drive upload ./file.pdf /Documents
cat data.json | proton-drive upload - /Documents --name data.json

# Download files
proton-drive download /Documents/file.pdf ./file.pdf

# Create folders
proton-drive mkdir /Documents Projects

# Show file/folder metadata
proton-drive info /Documents/file.pdf

# Stream file contents to stdout
proton-drive cat /Documents/file.txt

# Move or rename files/folders
proton-drive mv /Documents/old-name.pdf /Documents/new-name.pdf
proton-drive mv /Documents/file.pdf /Archive/file.pdf

# Remove files/folders (trash)
proton-drive rm /Documents/old-file.pdf
proton-drive rm /Documents/old-file.pdf --permanent
```

### Git LFS Bridge Protocol

The bridge command reads JSON from stdin and writes JSON to stdout using a `{ ok, payload, error, code }` envelope:

```bash
echo '{"password":"...","oid":"<64-hex>"}' | proton-drive bridge exists
echo '{"password":"...","oid":"<64-hex>","path":"./file"}' | proton-drive bridge upload
echo '{"password":"...","oid":"<64-hex>","outputPath":"./out"}' | proton-drive bridge download
echo '{"password":"..."}' | proton-drive bridge list
echo '{"password":"...","oid":"<64-hex>"}' | proton-drive bridge delete
echo '{"password":"..."}' | proton-drive bridge init
echo '{}' | proton-drive bridge refresh
echo '{"password":"...","oids":["<oid1>","<oid2>"]}' | proton-drive bridge batch-exists
echo '{"password":"...","oids":["<oid1>","<oid2>"]}' | proton-drive bridge batch-delete
```

## Global Options

- `-d, --debug` - Enable debug output with full stack traces
- `--verbose` - Show detailed output (spinners, progress, tables)
- `-q, --quiet` - Suppress all non-error output
- `-v, --version` - Display version number
- `--help` - Show help for any command

## Architecture

```
src/
├── api/           - Proton API clients (auth, user)
├── auth/          - SRP-6a authentication and session management
│   └── srp/       - SRP protocol implementation
├── bridge/        - Shared types and validators (exported for proton-lfs-bridge)
├── cli/           - Command implementations (ls, upload, download, rm, mv, cat, info, bridge, credential)
├── crypto/        - Cryptographic operations (OpenPGP key management, Drive crypto)
├── errors/        - Error types, codes, and CLI error handler
├── sdk/           - @protontech/drive-sdk adapter layer
│   ├── httpClientAdapter.ts  - HTTP client with auto token refresh
│   ├── cryptoProxy.ts        - OpenPGP crypto proxy
│   ├── accountAdapter.ts     - Account/address key provider
│   ├── srpAdapter.ts         - SRP module adapter
│   ├── pathResolver.ts       - Path-to-UID resolution
│   └── client.ts             - ProtonDriveClient factory
├── types/         - TypeScript type definitions
└── utils/         - Logging, password handling, git-credential, validation
```

## Security

- **Passwords are never persisted to disk.** The session file stores only revocable tokens.
- **Passwords are never accepted via CLI flags or environment variables.** Use `--password-stdin` or interactive prompts only.
- **SRP server proof verification** uses constant-time comparison (`crypto.timingSafeEqual`).
- **Credential flow (pass-cli mode):** pass-cli -> Go adapter -> stdin -> proton-drive-cli (memory only)
- **Credential flow (git-credential mode):** git credential helper -> proton-drive-cli (local resolution, never sent over HTTP)
- All encryption happens locally before upload via `@protontech/drive-sdk`
- Private keys are decrypted in memory and never written to disk
- Session directory: `0700`; session file: `0600` (owner-only)
- Path traversal prevention: `..` and null bytes rejected in all path operations
- OID validation: `/^[a-f0-9]{64}$/i` enforced before any bridge operation
- Subprocess calls use `execFile` (not `exec`) to prevent shell injection

## Testing

```bash
npm test                    # Run all 438 tests across 27 suites
npx jest --no-cache         # Without cache
npx jest src/sdk/           # Run SDK adapter tests only
npx jest src/cli/e2e.test   # Run E2E CLI tests
```

## License

MIT
