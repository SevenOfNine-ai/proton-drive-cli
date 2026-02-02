import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { AuthService } from '../auth';
import { promptForToken } from '../auth/captcha-helper';
import { handleError } from '../errors/handler';
import { isVerbose, isQuiet, outputResult } from '../utils/output';

/**
 * Read password from stdin (for piped input)
 * This allows: echo "password" | proton-drive login -u user@example.com --password-stdin
 */
async function readPasswordFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const timeout = setTimeout(() => {
      reject(new Error('Timeout reading from stdin'));
    }, 5000);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      // Remove all leading and trailing whitespace (newlines, spaces, tabs, etc.)
      resolve(data.trim());
    });
    process.stdin.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    process.stdin.resume();
  });
}

/**
 * Create the login command for the CLI
 * Handles user authentication with Proton Drive
 *
 * Credential sources (in priority order):
 * 1. Environment variables: PROTON_USERNAME and PROTON_PASSWORD
 * 2. Command line options: -u/--username and -p/--password
 * 3. Stdin for password: --password-stdin flag
 * 4. Interactive prompts (if TTY is available)
 *
 * For passwords with special characters, use environment variables or --password-stdin
 * to avoid shell escaping issues.
 */
export function createLoginCommand(): Command {
  const command = new Command('login');

  command
    .description('Authenticate with Proton Drive')
    .option('-u, --username <email>', 'Proton account email (or set PROTON_USERNAME env var)')
    .option('-p, --password <password>', 'Proton account password (or set PROTON_PASSWORD env var)')
    .option('--password-stdin', 'Read password from stdin (for scripts with special characters)')
    .action(async (options) => {
      try {
        // Priority 1: Environment variables (best for automation with special characters)
        // Priority 2: Command line options
        // Priority 3: Stdin for password (--password-stdin)
        // Priority 4: Interactive prompt
        let username = process.env.PROTON_USERNAME || options.username;
        let password = process.env.PROTON_PASSWORD || options.password;

        // Handle --password-stdin flag
        if (options.passwordStdin && !password) {
          if (process.stdin.isTTY) {
            console.error(chalk.red('Error: --password-stdin requires piped input'));
            console.error(chalk.dim('Example: echo "your-password" | proton-drive login -u user@example.com --password-stdin'));
            process.exit(1);
          }
          try {
            password = await readPasswordFromStdin();
            if (!password) {
              console.error(chalk.red('Error: No password received from stdin'));
              process.exit(1);
            }
            // Always show password info when using --password-stdin to help with debugging
            if (!isQuiet()) {
              console.log(chalk.dim(`[INFO] Password read from stdin: length=${password.length} characters`));
            }
          } catch (err) {
            console.error(chalk.red('Error reading password from stdin:'), err);
            process.exit(1);
          }
        }

        if (!username || !password) {
          // Check if we can prompt interactively
          if (!process.stdin.isTTY || !process.stdout.isTTY) {
            // Non-interactive mode - can't prompt
            if (!username) {
              console.error(chalk.red('Error: Username required.'));
              console.error(chalk.dim('Set PROTON_USERNAME environment variable or use -u flag.'));
            }
            if (!password) {
              console.error(chalk.red('Error: Password required.'));
              console.error(chalk.dim('Set PROTON_PASSWORD environment variable, use -p flag, or use --password-stdin.'));
            }
            console.error(chalk.dim('\nFor passwords with special characters, use:'));
            console.error(chalk.dim('  PROTON_PASSWORD="your:complex\\password" proton-drive login -u user@example.com'));
            console.error(chalk.dim('  echo "your:complex\\password" | proton-drive login -u user@example.com --password-stdin'));
            process.exit(1);
          }

          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'username',
              message: 'Email:',
              when: !username,
              validate: (input: string) => {
                if (!input || !input.includes('@')) {
                  return 'Please enter a valid email address';
                }
                return true;
              },
            },
            {
              type: 'password',
              name: 'password',
              message: 'Password:',
              when: !password,
              mask: '*',
              validate: (input: string) => {
                if (!input || input.length < 1) {
                  return 'Password is required';
                }
                return true;
              },
            },
          ]);

          username = username || answers.username;
          password = password || answers.password;
        }

        // Authenticate with spinner
        let spinner;
        if (isVerbose()) {
          spinner = ora('Authenticating...').start();
        }
        const authService = new AuthService();

        try {
          await authService.login(username.trim(), password);
          if (spinner) {
            spinner.succeed(chalk.green('Login successful!'));
          }
          if (isVerbose()) {
            console.log(chalk.dim('Session saved to ~/.proton-drive-cli/session.json'));
            console.log('\nYou can now use the CLI to upload files to Proton Drive.');
          } else if (!isQuiet()) {
            outputResult('OK');
          }
        } catch (error: any) {
          if (spinner) {
            spinner.stop();
          }

          // Check if CAPTCHA is required
          if (error.requiresCaptcha) {
            console.log(chalk.yellow('\n⚠️  CAPTCHA verification required'));

            // Use the CAPTCHA helper to get the token
            const verificationToken = await promptForToken(
              error.captchaUrl,
              error.captchaToken || ''
            );

            if (!verificationToken) {
              console.error(chalk.red('✗ Error: No verification token provided'));
              process.exit(1);
            }

            // Handle browser workaround - retry without token
            if (verificationToken === 'RETRY_WITHOUT_TOKEN') {
              const retrySpinner = ora('Retrying authentication (IP may be allowlisted now)...').start();
              try {
                await authService.login(username.trim(), password);
                retrySpinner.succeed(chalk.green('Login successful!'));
                console.log(chalk.dim('Session saved to ~/.proton-drive-cli/session.json'));
                console.log('\nYou can now use the CLI to upload files to Proton Drive.');
                return;
              } catch (retryError: any) {
                retrySpinner.fail();
                if (retryError.requiresCaptcha) {
                  console.error(chalk.red('\n✗ Still getting CAPTCHA challenge.'));
                  console.error('The IP allowlisting may not have worked.');
                  console.error('Try the manual token extraction method instead.');
                }
                throw retryError;
              }
            }

            // Retry login with the verification token
            const verifySpinner = ora('Retrying authentication with verification token...').start();
            try {
              await authService.login(username.trim(), password, verificationToken);
              verifySpinner.succeed(chalk.green('Login successful!'));
              console.log(chalk.dim('Session saved to ~/.proton-drive-cli/session.json'));
              console.log('\nYou can now use the CLI to upload files to Proton Drive.');
            } catch (retryError: any) {
              verifySpinner.fail();
              if (retryError.requiresCaptcha) {
                console.error(chalk.yellow('\n⚠️  Still getting CAPTCHA challenge'));
                console.error('The token may be invalid or expired.');
                console.error(chalk.dim('\nTry the alternative approach:'));
                console.error('  1. Log in at https://account.proton.me in your browser');
                console.error('  2. Complete any CAPTCHA there');
                console.error('  3. Then try this CLI login again');
              } else if (retryError.response?.data?.Code === 12087) {
                console.error(chalk.yellow('\n⚠️  CAPTCHA validation failed (code 12087)'));
                console.error('The token was not accepted by the server.');
                console.error(chalk.dim('\nThis can happen if:'));
                console.error('  - The CAPTCHA wasn\'t fully completed');
                console.error('  - The token expired before we could use it');
                console.error('  - The token format is incorrect');
              }
              throw retryError;
            }
            return;
          } else {
            throw error;
          }
        }
      } catch (error) {
        handleError(error, process.env.DEBUG === 'true');
        process.exit(1);
      }
    });

  return command;
}

/**
 * Create the logout command for the CLI
 * Clears the current session
 */
export function createLogoutCommand(): Command {
  const command = new Command('logout');

  command
    .description('Logout and clear current session')
    .action(async () => {
      try {
        const authService = new AuthService();
        const isAuthenticated = await authService.isAuthenticated();

        if (!isAuthenticated) {
          console.log(chalk.yellow('Not currently logged in'));
          return;
        }

        await authService.logout();
        console.log(chalk.green('✓ Logged out successfully'));
      } catch (error) {
        handleError(error, process.env.DEBUG === 'true');
        process.exit(1);
      }
    });

  return command;
}

/**
 * Create the status command for the CLI
 * Shows current authentication status
 */
export function createStatusCommand(): Command {
  const command = new Command('status');

  command
    .description('Show authentication status')
    .action(async () => {
      try {
        const authService = new AuthService();
        const isAuthenticated = await authService.isAuthenticated();

        if (isAuthenticated) {
          const session = await authService.getSession();
          console.log(chalk.green('✓ Authenticated\n'));
          console.log(chalk.cyan('Session Information:'));
          console.log(`  ${chalk.dim('User ID:')} ${session.uid}`);
          console.log(`  ${chalk.dim('Session ID:')} ${session.sessionId.substring(0, 20)}...`);
          console.log(`  ${chalk.dim('Scopes:')} ${session.scopes.join(', ')}`);
          console.log(`  ${chalk.dim('Password Mode:')} ${session.passwordMode === 1 ? 'Single' : 'Two-password'}`);
        } else {
          console.log(chalk.yellow('✗ Not authenticated'));
          console.log(chalk.dim('\nRun:'), chalk.bold('proton-drive login'));
        }
      } catch (error) {
        handleError(error, process.env.DEBUG === 'true');
        process.exit(1);
      }
    });

  return command;
}
