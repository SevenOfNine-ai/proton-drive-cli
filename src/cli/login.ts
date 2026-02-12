import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { AuthService } from '../auth';
import { SessionManager } from '../auth/session';
import { promptForToken } from '../auth/captcha-helper';
import { CaptchaError } from '../errors/types';
import { isAxiosError } from 'axios';
import { handleError } from '../errors/handler';
import { isVerbose, isQuiet, outputResult } from '../utils/output';
import { readPasswordFromStdin, resolveCredentials } from '../utils/password';

/**
 * Create the login command for the CLI
 * Handles user authentication with Proton Drive
 *
 * Credential sources (in priority order):
 * 1. --credential-provider git (resolves both username + password via git credential)
 * 2. --password-stdin (piped password — safe from `ps` and /proc leaks)
 * 3. -u/--username flag (username only — not sensitive)
 * 4. Interactive prompts (if TTY is available)
 *
 * Passwords are NEVER accepted via CLI flags or environment variables.
 */
export function createLoginCommand(): Command {
  const command = new Command('login');

  command
    .description('Authenticate with Proton Drive')
    .option('-u, --username <email>', 'Proton account email')
    .option('--password-stdin', 'Read password from stdin (for scripts with special characters)')
    .option('--credential-provider <type>', 'Credential provider: git (use git credential manager)')
    .action(async (options) => {
      try {
        let username = options.username;
        let password: string | undefined;

        // Handle --credential-provider git (resolves both username + password)
        if (options.credentialProvider === 'git') {
          const creds = await resolveCredentials({ credentialProvider: 'git' });
          username = creds.username || username;
          password = creds.password;
          if (!isQuiet()) {
            console.log(chalk.dim(`[INFO] Credentials resolved via git credential helper for ${username}`));
          }
        }

        // Handle --password-stdin flag or detect piped stdin
        if (!password && (options.passwordStdin || !process.stdin.isTTY)) {
          try {
            password = await readPasswordFromStdin();
            if (!isQuiet()) {
              console.log(chalk.dim('[INFO] Password read from stdin'));
            }
          } catch (err) {
            console.error(chalk.red('Error reading password from stdin:'), err);
            process.exit(1);
          }
        }

        // Session reuse: skip login if already authenticated as this user.
        // If username is known, check if the session belongs to the same user.
        // If the session belongs to a different user, fall through to re-login.
        try {
          if (username) {
            if (await SessionManager.isSessionForUser(username)) {
              if (!isQuiet()) {
                console.log('Already authenticated. Log out first to log in again.');
              } else {
                outputResult('OK');
              }
              return;
            }
          } else {
            // No username yet (will prompt interactively) — just check session exists
            const authCheck = new AuthService();
            if (await authCheck.isAuthenticated()) {
              if (!isQuiet()) {
                console.log('Already authenticated. Log out first to log in again.');
              } else {
                outputResult('OK');
              }
              return;
            }
          }
        } catch {
          // Session file corrupted or unreadable — fall through to login
        }

        if (!username || !password) {
          // Check if we can prompt interactively
          if (!process.stdin.isTTY || !process.stdout.isTTY) {
            // Non-interactive mode - can't prompt
            if (!username) {
              console.error(chalk.red('Error: Username required.'));
              console.error(chalk.dim('Use -u flag or run interactively.'));
            }
            if (!password) {
              console.error(chalk.red('Error: Password required.'));
              console.error(chalk.dim('Use --password-stdin or run interactively.'));
            }
            console.error(chalk.dim('\nExamples:'));
            console.error(chalk.dim('  echo "password" | proton-drive login -u user@example.com --password-stdin'));
            console.error(chalk.dim('  proton-drive login   # interactive prompts'));
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

        // At this point both username and password are guaranteed defined
        const finalUsername = username as string;
        const finalPassword = password as string;

        // Authenticate with spinner
        let spinner;
        if (isVerbose()) {
          spinner = ora('Authenticating...').start();
        }
        const authService = new AuthService();

        try {
          await authService.login(finalUsername.trim(), finalPassword);
          if (spinner) {
            spinner.succeed(chalk.green('Login successful!'));
          }
          if (isVerbose()) {
            console.log(chalk.dim('Session saved (tokens only — password is not stored on disk).'));
            console.log('\nYou can now use the CLI to upload files to Proton Drive.');
          } else if (!isQuiet()) {
            outputResult('OK');
          }
        } catch (error: unknown) {
          if (spinner) {
            spinner.stop();
          }

          // Check if CAPTCHA is required
          if (error instanceof CaptchaError) {
            console.log(chalk.yellow('\n⚠️  CAPTCHA verification required'));

            // Use the CAPTCHA helper to get the token
            const verificationToken = await promptForToken(
              error.captchaUrl,
              error.captchaToken
            );

            if (!verificationToken) {
              console.error(chalk.red('✗ Error: No verification token provided'));
              process.exit(1);
            }

            // Handle browser workaround - retry without token
            if (verificationToken === 'RETRY_WITHOUT_TOKEN') {
              const retrySpinner = ora('Retrying authentication (IP may be allowlisted now)...').start();
              try {
                await authService.login(finalUsername.trim(), finalPassword);
                retrySpinner.succeed(chalk.green('Login successful!'));
                console.log(chalk.dim('Session saved (tokens only). Use --password-stdin with subsequent commands.'));
                console.log('\nYou can now use the CLI to upload files to Proton Drive.');
                return;
              } catch (retryError: unknown) {
                retrySpinner.fail();
                if (retryError instanceof CaptchaError) {
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
              await authService.login(finalUsername.trim(), finalPassword, verificationToken);
              verifySpinner.succeed(chalk.green('Login successful!'));
              console.log(chalk.dim('Session saved (tokens only). Use --password-stdin with subsequent commands.'));
              console.log('\nYou can now use the CLI to upload files to Proton Drive.');
            } catch (retryError: unknown) {
              verifySpinner.fail();
              if (retryError instanceof CaptchaError) {
                console.error(chalk.yellow('\n⚠️  Still getting CAPTCHA challenge'));
                console.error('The token may be invalid or expired.');
                console.error(chalk.dim('\nTry the alternative approach:'));
                console.error('  1. Log in at https://account.proton.me in your browser');
                console.error('  2. Complete any CAPTCHA there');
                console.error('  3. Then try this CLI login again');
              } else if (isAxiosError(retryError) && (retryError.response?.data as Record<string, unknown>)?.Code === 12087) {
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
