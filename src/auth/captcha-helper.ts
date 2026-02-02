import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import * as fs from 'fs';
import * as tty from 'tty';
import axios from 'axios';

/**
 * Helper for CAPTCHA verification
 *
 * Semi-automated approach:
 * 1. Fetches the captcha page to get prefix values (automated)
 * 2. User completes CAPTCHA in browser
 * 3. User copies the finalize token from Network tab
 * 4. CLI constructs the full verification token
 */

const PROTON_API_BASE = 'https://drive-api.proton.me';

/**
 * Drain any pending input from a TTY stream
 * This consumes spurious characters that may be left over from stdin piping
 */
async function drainTTYInput(ttyStream: tty.ReadStream): Promise<void> {
    return new Promise((resolve) => {
        // Set a very short timeout to collect any immediately available data
        const drainTimeout = setTimeout(() => {
            ttyStream.removeAllListeners('data');
            ttyStream.pause();
            resolve();
        }, 10); // 10ms should be enough to capture buffered data

        let dataReceived = false;
        ttyStream.on('data', () => {
            dataReceived = true;
            // Data received, keep draining
        });

        ttyStream.resume();

        // If no data comes in quickly, resolve immediately
        if (!dataReceived) {
            clearTimeout(drainTimeout);
            ttyStream.removeAllListeners('data');
            ttyStream.pause();
            resolve();
        }
    });
}

/**
 * Create a readline interface that works even after stdin has been consumed
 * Uses /dev/tty directly if stdin is not a TTY (i.e., was piped)
 * Returns both the interface and a cleanup function
 */
async function createReadlineInterface(): Promise<{ rl: readline.Interface; cleanup: () => void }> {
    // If stdin is a TTY, use it normally
    if (input.isTTY) {
        return {
            rl: readline.createInterface({ input, output }),
            cleanup: () => {}
        };
    }

    // Otherwise, stdin was likely piped/consumed - use /dev/tty directly
    try {
        const ttyFd = fs.openSync('/dev/tty', 'r');
        const ttyInput = new tty.ReadStream(ttyFd);

        // Drain any spurious input before creating readline interface
        await drainTTYInput(ttyInput);

        const rl = readline.createInterface({
            input: ttyInput,
            output
        });

        return {
            rl,
            cleanup: () => {
                rl.close();
                ttyInput.destroy();
            }
        };
    } catch (error) {
        // Fallback to stdin if /dev/tty is not available (e.g., Windows or non-interactive)
        return {
            rl: readline.createInterface({ input, output }),
            cleanup: () => {}
        };
    }
}

/**
 * Fetch the captcha HTML page and extract prefix values from tokenCallback
 * The HTML contains: sendToken('prefix1'+'prefix2'+response)
 */
async function fetchPrefixValues(challengeToken: string): Promise<{ prefix1: string; prefix2: string } | null> {
    const captchaUrl = `${PROTON_API_BASE}/core/v4/captcha?Token=${encodeURIComponent(challengeToken)}&ForceWebMessaging=1`;

    console.log(`[DEBUG] Fetching captcha page to extract prefixes...`);

    try {
        const response = await axios.get(captchaUrl, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
            },
        });

        const html = response.data;

        // Parse the tokenCallback function to extract prefix values
        // Pattern: sendToken('prefix1'+'prefix2'+response)
        const tokenCallbackMatch = html.match(/sendToken\s*\(\s*['"]([^'"]+)['"]\s*\+\s*['"]([^'"]+)['"]\s*\+\s*response\s*\)/);

        if (!tokenCallbackMatch) {
            console.error('[DEBUG] Could not parse prefix values from captcha page');
            return null;
        }

        const prefix1 = tokenCallbackMatch[1];
        const prefix2 = tokenCallbackMatch[2];

        console.log(`[DEBUG] Extracted prefix1: ${prefix1}`);
        console.log(`[DEBUG] Extracted prefix2: ${prefix2}`);

        return { prefix1, prefix2 };
    } catch (error: any) {
        console.error('[DEBUG] Failed to fetch captcha page:', error.message);
        return null;
    }
}

/**
 * Semi-automated token extraction
 * We fetch the prefixes automatically, user provides the finalize token
 */
async function semiAutomatedExtraction(captchaUrl: string, challengeToken: string): Promise<string | null> {
    const { rl, cleanup } = await createReadlineInterface();

    try {
        console.log('\n┌─────────────────────────────────────────────────────────────┐');
        console.log('│  Semi-Automated CAPTCHA Token Extraction                    │');
        console.log('└─────────────────────────────────────────────────────────────┘\n');

        // Step 1: Fetch prefix values
        console.log('Step 1: Extracting prefix values automatically...');
        const prefixes = await fetchPrefixValues(challengeToken);

        if (!prefixes) {
            console.log('        ✗ Failed to extract prefixes, falling back to manual mode\n');
            cleanup();
            return manualTokenExtraction(captchaUrl, challengeToken);
        }
        console.log('        ✓ Prefix values extracted\n');

        // Step 2: User completes CAPTCHA
        console.log('Step 2: Complete the CAPTCHA in your browser\n');
        console.log('   a) Open Developer Tools (F12) and go to the "Network" tab\n');
        console.log('   b) Open this URL in your browser:');
        console.log(`      ${captchaUrl}\n`);
        console.log('   c) Complete the CAPTCHA puzzle\n');
        console.log('   d) In Network tab, find the "validate" request');
        console.log('      (look for a GET to ".../api/validate")\n');
        console.log('   e) Click on it, look at the URL or "Params" tab');
        console.log('      Copy the "token" query parameter value');
        console.log('      (a 64-character hex string like "98eb9d18...")\n');
        console.log('─────────────────────────────────────────────────────────────\n');

        const finalizeToken = await rl.question('Paste the token from validate request (or "full" if you have the complete token): ');

        if (!finalizeToken.trim()) {
            return null;
        }

        // Check if user pasted the full token (contains a colon)
        if (finalizeToken.includes(':')) {
            console.log('\n[DEBUG] User provided full token, using as-is');
            return finalizeToken.trim();
        }

        // Construct the full token
        const fullToken = `${challengeToken}:${prefixes.prefix1}${prefixes.prefix2}${finalizeToken.trim()}`;

        return fullToken;
    } finally {
        cleanup();
    }
}

/**
 * Prompt user for CAPTCHA token with options
 */
export async function promptForToken(captchaUrl: string, challengeToken: string): Promise<string | null> {
    const { rl, cleanup } = await createReadlineInterface();

    try {
        console.log('\n┌─────────────────────────────────────────────────────────────┐');
        console.log('│  CAPTCHA Verification Required                              │');
        console.log('├─────────────────────────────────────────────────────────────┤');
        console.log('│  Choose an option:                                          │');
        console.log('│                                                             │');
        console.log('│  [1] Semi-Auto - Prefixes extracted, you copy final token   │');
        console.log('│  [2] Manual    - Full manual token extraction               │');
        console.log('│  [3] Browser   - Log in via browser to allowlist IP         │');
        console.log('└─────────────────────────────────────────────────────────────┘\n');

        const choice = await rl.question('Enter choice [1/2/3] (default: 1): ');

        if (choice === '2') {
            return manualTokenExtraction(captchaUrl, challengeToken);
        }

        if (choice === '3') {
            return browserWorkaround();
        }

        // Default to semi-automated extraction
        return semiAutomatedExtraction(captchaUrl, challengeToken);
    } finally {
        cleanup();
    }
}

/**
 * Manual token extraction with detailed instructions
 */
async function manualTokenExtraction(captchaUrl: string, challengeToken: string): Promise<string | null> {
    const { rl, cleanup } = await createReadlineInterface();

    try {
        console.log('\n┌─────────────────────────────────────────────────────────────┐');
        console.log('│  Manual Token Extraction                                    │');
        console.log('└─────────────────────────────────────────────────────────────┘\n');

        console.log('STEP 1: Open Developer Tools in your browser (F12)\n');

        console.log('STEP 2: Go to the "Console" tab and paste this code:');
        console.log('        window.addEventListener("message", e => console.log("TOKEN:", e.data))\n');

        console.log('STEP 3: Go to the "Network" tab\n');

        console.log('STEP 4: Open this URL in your browser:');
        console.log(`        ${captchaUrl}\n`);

        console.log('STEP 5: Complete the CAPTCHA puzzle\n');

        console.log('STEP 6: After completion, find the token:');
        console.log('        Option A: Look in Console for "TOKEN: <full-token>"');
        console.log('        Option B: In Network tab, find "validate" request,');
        console.log('                  copy the "token" query parameter (64-char hex)\n');

        console.log('STEP 7: If you only have the validate token, construct full token:');
        console.log(`        ${challengeToken}:<prefix1><prefix2><validate-token>\n`);

        console.log('─────────────────────────────────────────────────────────────');
        console.log(`Challenge token: ${challengeToken}`);
        console.log('─────────────────────────────────────────────────────────────\n');

        const token = await rl.question('Paste the FULL token here (or "skip" to try without): ');

        if (token.toLowerCase() === 'skip') {
            return 'RETRY_WITHOUT_TOKEN';
        }

        return token.trim() || null;
    } finally {
        cleanup();
    }
}

/**
 * Browser workaround - log in via browser to allowlist IP
 */
async function browserWorkaround(): Promise<string | null> {
    const { rl, cleanup } = await createReadlineInterface();

    try {
        console.log('\n┌─────────────────────────────────────────────────────────────┐');
        console.log('│  Browser Workaround                                         │');
        console.log('└─────────────────────────────────────────────────────────────┘\n');
        console.log('This workaround may allowlist your IP address for API access.\n');
        console.log('STEP 1: Open https://account.proton.me in your browser\n');
        console.log('STEP 2: Log in to your Proton account\n');
        console.log('STEP 3: Complete any CAPTCHA if prompted\n');
        console.log('STEP 4: Make sure login is successful (you see your inbox/drive)\n');
        console.log('STEP 5: Come back here and press Enter\n');
        console.log('We\'ll then retry the CLI login - it may work without CAPTCHA.\n');

        await rl.question('Press Enter when you\'ve logged in via browser...');

        return 'RETRY_WITHOUT_TOKEN';
    } finally {
        cleanup();
    }
}
