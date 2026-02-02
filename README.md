# Proton Drive CLI

A command-line interface for Proton Drive.

**WARNING: This is an attempt to get a usable proton drive client to work on Linux.
I've limited time so the majority of the code (and this README) is vibe coded as this is a side side project.
It shouldn't be used for anything critical, nor without reviewing and understanding the code first.
I'm mostly using it to perform periodic backups.**


## What Works 

- File listing/upload/download 
- Directory creation 

## What Could Work Better 

 - if a CAPTCHA is required it must be solved in the browser and the token manually copied back, more details are provided when logging in
 - session persistence is not working properly, this means you need to login frequently which is quite inconvenient

**PRs to fix the above are welcome**


## Installation

```bash
# Install dependencies and build
npm install
npm run build

# Install globally (optional)
npm run install-global
```

After installing globally, you can use `proton-drive` from anywhere. Otherwise, use `node dist/index.js`.

## Usage

### Authentication

```bash
# Login (interactive prompts)
proton-drive login

# Login with username
proton-drive login -u your.email@proton.me

# Check authentication status
proton-drive status

# Logout
proton-drive logout
```

Session credentials are stored in `~/.proton-drive-cli/session.json`.

**CAPTCHA Support:** If CAPTCHA verification is required during login, the CLI will guide you through the semi-automated token extraction process.

#### Passwords with Special Characters

For passwords containing special characters (like `:`, `\`, `)`, `!`, `$`, etc.), use one of these methods to avoid shell escaping issues:

```bash
# Method 1: Environment variables (recommended for automation)
PROTON_USERNAME="user@proton.me" PROTON_PASSWORD='your:complex\password!' proton-drive login

# Method 2: Read password from stdin
echo 'your:complex\password!' | proton-drive login -u user@proton.me --password-stdin

# Method 3: Use a password file
cat /path/to/password.txt | proton-drive login -u user@proton.me --password-stdin
```

**Environment Variables:**
- `PROTON_USERNAME` - Account email address
- `PROTON_PASSWORD` - Account password (handles all special characters correctly)

### Session Management

Ideally the CLI would refresh the token automatically, this is NOT working at the moment. 

### List Files

```bash
# List files in root directory
proton-drive ls /

# List files in a subdirectory
proton-drive ls /Documents

# Show detailed information (table format)
proton-drive ls / --long
proton-drive ls /Documents -l
```

### Upload Files

```bash
# Upload to root directory
proton-drive upload ./myfile.pdf /

# Upload to a subdirectory
proton-drive upload ./document.pdf /Documents

# Upload with a different name (rename during upload)
proton-drive upload ./local-file.tar /backup.tar
proton-drive upload ./report.pdf /Documents/monthly-report.pdf

# Upload with automatic MIME type detection
proton-drive upload ./photo.jpg /Photos

# Disable progress output
proton-drive upload ./file.txt / --no-progress

# Upload from stdin (pipe from other commands)
cat myfile.txt | proton-drive upload - /Documents/myfile.txt
echo "Hello World" | proton-drive upload - /test.txt
curl https://example.com/file.pdf | proton-drive upload - /Downloads/file.pdf

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

# Create nested folders
proton-drive mkdir /Documents/Projects 2024
```

## Global Options

- `-d, --debug` - Enable debug output with full stack traces
- `--verbose` - Show detailed output (spinners, progress, tables). Default is minimal output for scripting.
- `-q, --quiet` - Suppress all non-error output
- `-v, --version` - Display version number
- `--help` - Show help for any command

### Output Modes

The CLI supports three output modes for different use cases:

- **Normal (default)** - Minimal output suitable for scripting. Commands output just the essential information (file IDs, filenames, etc.)
- **Verbose (`--verbose`)** - Detailed output with spinners, progress bars, colors, and tables. Best for interactive use.
- **Quiet (`-q, --quiet`)** - Only errors are shown. Useful when you only care about failures.

Examples:
```bash
# Minimal output for scripts
proton-drive ls /Documents

# Detailed output for interactive use
proton-drive --verbose ls /Documents

# Silent unless error occurs
proton-drive --quiet upload file.txt /
```

## How It Works

### Encryption & Decryption

All file operations use end-to-end encryption following Proton Drive's protocol:

**Upload Process:**
1. **Key Hierarchy**: User Key → Address Key → Share Key → Node Key → Content Key
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
├── crypto/        - Cryptographic operations (OpenPGP, key management)
├── drive/         - Drive operations (upload, chunking, encryption)
├── cli/           - Command-line interface
└── types/         - TypeScript type definitions
```

## Security

- Passwords are never stored - only encrypted session tokens
- All encryption happens locally before upload
- Private keys are decrypted in memory and never written to disk
- Session files store encrypted credentials with appropriate permissions


## License

MIT
