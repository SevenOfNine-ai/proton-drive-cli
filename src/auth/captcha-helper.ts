import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import * as fs from 'fs';
import * as tty from 'tty';
import { execSync } from 'child_process';
import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * Helper for CAPTCHA verification
 *
 * Simplified flow:
 * 1. Auto-open CAPTCHA URL in browser
 * 2. Extract prefix values from the CAPTCHA page (automated)
 * 3. Poll for CAPTCHA completion OR wait for user to press Enter
 * 4. Return the full verification token for auth retry
 */

const PROTON_API_BASE = 'https://drive-api.proton.me';

/**
 * Open a URL in the system default browser.
 * Silently fails if no browser is available (e.g. headless CI).
 */
function openInBrowser(url: string): void {
    try {
        const cmd = process.platform === 'darwin' ? 'open'
            : process.platform === 'win32' ? 'start'
            : 'xdg-open';
        execSync(`${cmd} ${JSON.stringify(url)}`, { stdio: 'ignore' });
    } catch {
        // Non-fatal — URL is also printed to the terminal
    }
}

/**
 * Drain any pending input from a TTY stream
 * This consumes spurious characters that may be left over from stdin piping
 */
async function drainTTYInput(ttyStream: tty.ReadStream): Promise<void> {
    return new Promise((resolve) => {
        const drainTimeout = setTimeout(() => {
            ttyStream.removeAllListeners('data');
            ttyStream.pause();
            resolve();
        }, 10);

        let dataReceived = false;
        ttyStream.on('data', () => {
            dataReceived = true;
        });

        ttyStream.resume();

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
 */
async function createReadlineInterface(): Promise<{ rl: readline.Interface; cleanup: () => void }> {
    if (input.isTTY) {
        return {
            rl: readline.createInterface({ input, output }),
            cleanup: () => {}
        };
    }

    try {
        const ttyFd = fs.openSync('/dev/tty', 'r');
        const ttyInput = new tty.ReadStream(ttyFd);
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
    } catch {
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

    logger.debug(`Fetching captcha page to extract prefixes...`);

    try {
        const response = await axios.get(captchaUrl, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
            },
        });

        const html = response.data;

        const tokenCallbackMatch = html.match(/sendToken\s*\(\s*['"]([^'"]+)['"]\s*\+\s*['"]([^'"]+)['"]\s*\+\s*response\s*\)/);

        if (!tokenCallbackMatch) {
            logger.debug('Could not parse prefix values from captcha page');
            return null;
        }

        const prefix1 = tokenCallbackMatch[1];
        const prefix2 = tokenCallbackMatch[2];

        logger.debug(`Extracted prefix1: ${prefix1}`);
        logger.debug(`Extracted prefix2: ${prefix2}`);

        return { prefix1, prefix2 };
    } catch (error: any) {
        logger.debug('Failed to fetch captcha page:', error.message);
        return null;
    }
}

/**
 * Main CAPTCHA prompt — simplified UX
 *
 * Opens the CAPTCHA URL in the browser, extracts prefix values automatically,
 * then waits for the user to complete the CAPTCHA and press Enter.
 *
 * Two modes:
 * - Default: browser opens CAPTCHA, user completes it, presses Enter → CLI retries without token
 *   (works when Proton allowlists the IP after browser CAPTCHA completion)
 * - Advanced: if IP allowlisting doesn't work, user can paste the validate token from DevTools
 */
export async function promptForToken(captchaUrl: string, challengeToken: string): Promise<string | null> {
    const { rl, cleanup } = await createReadlineInterface();

    try {
        console.log('\n  CAPTCHA verification required by Proton\n');

        // Auto-open the CAPTCHA URL
        console.log('  Opening CAPTCHA in your browser...');
        openInBrowser(captchaUrl);
        console.log(`  URL: ${captchaUrl}\n`);

        // Extract prefix values in the background (for advanced mode)
        const prefixPromise = fetchPrefixValues(challengeToken);

        console.log('  Complete the CAPTCHA in your browser, then press Enter here.');
        console.log('  (Or paste a token from DevTools if you have one)\n');

        const userInput = await rl.question('  > ');
        const trimmed = userInput.trim();

        // Empty input = browser workaround (retry without token)
        if (!trimmed) {
            return 'RETRY_WITHOUT_TOKEN';
        }

        // Full token (contains a colon) — use as-is
        if (trimmed.includes(':')) {
            logger.debug('User provided full token, using as-is');
            return trimmed;
        }

        // Short token from validate endpoint — construct full token with prefixes
        const prefixes = await prefixPromise;
        if (prefixes) {
            const fullToken = `${challengeToken}:${prefixes.prefix1}${prefixes.prefix2}${trimmed}`;
            logger.debug(`Constructed full token from validate token`);
            return fullToken;
        }

        // No prefixes available, try the input as-is
        logger.debug('No prefix values available, using input as-is');
        return trimmed;
    } finally {
        cleanup();
    }
}
