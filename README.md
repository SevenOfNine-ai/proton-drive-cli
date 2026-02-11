# Proton Drive CLI

A command-line interface for Proton Drive.

**WARNING: This is an attempt to get a usable Proton Drive client to work on Linux.
I've limited time so the majority of the code (and this README) is vibe coded as this is a side side project.
It shouldn't be used for anything critical, nor without reviewing and understanding the code first.
I'm mostly using it to perform periodic backups.**


## What Works

- File listing/upload/download
- Directory creation

## What Could Work Better

 - If a CAPTCHA is required it must be solved in the browser and the token manually copied back; more details are provided when logging in
 - Session persistence is not working properly; this means you need to login frequently which is quite inconvenient

**PRs to fix the above are welcome**


## Installation

```bash
# Enable Corepack and activate Yarn 4 (once per machine)
corepack enable
corepack prepare yarn@4.1.1 --activate

# Install dependencies and build
yarn install
yarn build
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
echo "your-password" | proton-drive login -u your.email@proton.me --password-stdin

# Check authentication status
proton-drive status

# Logout
proton-drive logout
```

Session tokens (no passwords) are stored in `~/.proton-drive-cli/session.json` with `0600` permissions.

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
proton-drive upload ./file.pdf /Documents --credential-provider git
# Remove stored credentials
proton-drive credential remove -u your.email@proton.me
```

This uses `git credential fill/approve/reject` under the hood, delegating to the system's configured credential helper.

**Scripted usage** (pipe credentials):

```bash
echo "password" | proton-drive credential store -u user@proton.me --password-stdin
```

#### Git LFS Integration (pass-cli)

When used through `proton-git-lfs` (`Go adapter -> proton-lfs-bridge -> proton-drive-cli`), credentials are resolved via `pass-cli` and passed over stdin. In that flow, do not run `proton-drive login` manually.

From the `proton-git-lfs` repository root:

```bash
pass-cli login
eval "$(make -s pass-env)"
make build-drive-cli
export SDK_BACKEND_MODE=proton-drive-cli
make check-sdk-prereqs
make test-integration-sdk
```

Default pass references:
- `pass://Personal/Proton Git LFS/username`
- `pass://Personal/Proton Git LFS/password`

#### Git LFS Integration (git-credential)

Alternatively, use git credential manager instead of pass-cli:

```bash
# Store credentials once
proton-drive credential store -u your.email@proton.me

# Configure the Go adapter to use git-credential
export PROTON_CREDENTIAL_PROVIDER=git-credential
```

In this mode, `proton-drive-cli` resolves credentials locally via `git credential fill` — credentials are never sent over HTTP to the LFS bridge.

### Session Management

Ideally the CLI would refresh the token automatically. This is NOT working at the moment.

### List Files

```bash
# List files in root directory (password prompted interactively)
proton-drive ls /

# List files in a subdirectory
proton-drive ls /Documents

# Show detailed information (table format)
proton-drive ls / --long
proton-drive ls /Documents -l

# With piped password
echo "password" | proton-drive ls / --password-stdin
```

### Upload Files

```bash
# Upload to root directory
proton-drive upload ./myfile.pdf /

# Upload to a subdirectory
proton-drive upload ./document.pdf /Documents

# Upload with a different name
proton-drive upload ./local-file.tar /backup.tar
proton-drive upload ./report.pdf /Documents/monthly-report.pdf

# Disable progress output
proton-drive upload ./file.txt / --no-progress

# Upload from stdin
cat myfile.txt | proton-drive upload - /Documents/myfile.txt
echo "Hello World" | proton-drive upload - /test.txt

# Upload from stdin with --name flag
cat data.json | proton-drive upload - /Documents --name data.json
```

### Download Files

```bash
# Download from root directory
proton-drive download /myfile.pdf ./myfile.pdf

# Download from a subdirectory
proton-drive download /Documents/document.pdf ./document.pdf

# Download to a different filename
proton-drive download /Photos/photo.jpg ./downloaded-photo.jpg
```

### Create Folders

```bash
# Create a folder in root directory
proton-drive mkdir / MyFolder

# Create a subfolder
proton-drive mkdir /Documents Projects
```

## Global Options

- `-d, --debug` - Enable debug output with full stack traces
- `--verbose` - Show detailed output (spinners, progress, tables). Default is minimal output for scripting.
- `-q, --quiet` - Suppress all non-error output
- `-v, --version` - Display version number
- `--help` - Show help for any command

### Output Modes

- **Normal (default)** - Minimal output suitable for scripting
- **Verbose (`--verbose`)** - Detailed output with spinners, progress bars, colors, and tables
- **Quiet (`-q, --quiet`)** - Only errors are shown

## How It Works

### Encryption & Decryption

All file operations use end-to-end encryption following Proton Drive's protocol:

**Upload Process:**
1. **Key Hierarchy**: User Key -> Address Key -> Share Key -> Node Key -> Content Key
2. **Block Encryption**: Files are split into 4MB blocks, each encrypted with a session key
3. **Signatures**: Blocks are signed with your address key before encryption
4. **Verification**: Each block includes a verification token to ensure integrity
5. **Manifest**: All block hashes are concatenated and signed to verify completeness

**Download Process:**
1. **Key Decryption**: Decrypt node key using parent folder's key, then decrypt content session key
2. **Block Download**: Download encrypted blocks concurrently (up to 10 at a time)
3. **Integrity Verification**: Verify SHA-256 hash of each encrypted block
4. **Block Decryption**: Decrypt each block using the content session key
5. **Manifest Verification**: Verify the manifest signature to ensure all blocks are authentic
6. **Assembly**: Write decrypted blocks to file in sequential order

### Architecture

```
src/
├── auth/          - SRP authentication and session management
├── api/           - Proton API clients (auth, user, drive)
├── bridge/        - Shared types and validators (exported for proton-lfs-bridge)
├── crypto/        - Cryptographic operations (OpenPGP, key management)
├── drive/         - Drive operations (upload, chunking, encryption)
├── cli/           - Command-line interface
└── types/         - TypeScript type definitions
```

## Security

- **Passwords are never persisted to disk.** The session file stores only revocable tokens.
- **Passwords are never accepted via CLI flags or environment variables.** Use `--password-stdin` or interactive prompts only. This prevents exposure via `ps`, `/proc`, or shell history.
- **Credential flow (pass-cli mode):** pass-cli -> Go adapter -> stdin -> proton-drive-cli (memory only)
- **Credential flow (git-credential mode):** git credential helper -> proton-drive-cli (local resolution, never sent over HTTP)
- All encryption happens locally before upload
- Private keys are decrypted in memory and never written to disk
- Session directory: `0700`; session file: `0600` (owner-only)
- All logging goes through the logger (respects log level); no `console.log` in library code


## License

MIT
