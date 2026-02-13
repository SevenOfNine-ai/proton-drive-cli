/**
 * `proton-drive credential` subcommand.
 *
 * Manages credentials in the system's Git credential store
 * (macOS Keychain, Windows Credential Manager, Linux Secret Service, etc.).
 *
 * Subcommands:
 *   store  - Store credentials in the git credential helper
 *   remove - Remove credentials from the git credential helper
 *   verify - Verify that credentials can be resolved
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { gitCredentialFill, gitCredentialApprove, gitCredentialReject } from '../utils/git-credential';
import { readPasswordFromStdin } from '../utils/password';
import { handleError } from '../errors/handler';
import { isQuiet, outputResult } from '../utils/output';
import { PROTON_CREDENTIAL_HOST } from '../constants';

export function createCredentialCommand(): Command {
  const cmd = new Command('credential');
  cmd.description('Manage credentials in the git credential store');

  // --- store ---
  cmd
    .command('store')
    .description('Store Proton credentials in the git credential helper')
    .option('-u, --username <email>', 'Proton account email')
    .option('--password-stdin', 'Read password from stdin')
    .option('--host <host>', 'Credential host', PROTON_CREDENTIAL_HOST)
    .action(async (options) => {
      try {
        let username = options.username;
        let password: string | undefined;

        // Read password from stdin if flagged
        if (options.passwordStdin || !process.stdin.isTTY) {
          password = await readPasswordFromStdin();
        }

        // Interactive prompts for missing fields
        if (!username || !password) {
          if (!process.stdin.isTTY || !process.stdout.isTTY) {
            if (!username) console.error(chalk.red('Error: --username is required in non-interactive mode'));
            if (!password) console.error(chalk.red('Error: --password-stdin is required in non-interactive mode'));
            process.exit(1);
          }

          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'username',
              message: 'Proton email:',
              when: !username,
              validate: (input: string) => input.includes('@') || 'Enter a valid email',
            },
            {
              type: 'password',
              name: 'password',
              message: 'Password:',
              when: !password,
              mask: '*',
              validate: (input: string) => input.length > 0 || 'Password is required',
            },
          ]);

          username = username || answers.username;
          password = password || answers.password;
        }

        await gitCredentialApprove({
          protocol: 'https',
          host: options.host,
          username: username!,
          password: password!,
        });

        if (!isQuiet()) {
          outputResult(`Credentials stored for ${username} at ${options.host}`);
        }
      } catch (error) {
        handleError(error, process.env.DEBUG === 'true');
        process.exit(1);
      }
    });

  // --- remove ---
  cmd
    .command('remove')
    .description('Remove Proton credentials from the git credential helper')
    .option('-u, --username <email>', 'Proton account email')
    .option('--host <host>', 'Credential host', PROTON_CREDENTIAL_HOST)
    .action(async (options) => {
      try {
        let username = options.username;

        if (!username) {
          if (!process.stdin.isTTY || !process.stdout.isTTY) {
            console.error(chalk.red('Error: --username is required in non-interactive mode'));
            process.exit(1);
          }

          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'username',
              message: 'Proton email to remove:',
              validate: (input: string) => input.includes('@') || 'Enter a valid email',
            },
          ]);
          username = answers.username;
        }

        await gitCredentialReject({
          protocol: 'https',
          host: options.host,
          username,
          password: '', // password not needed for reject
        });

        if (!isQuiet()) {
          outputResult(`Credentials removed for ${username} at ${options.host}`);
        }
      } catch (error) {
        handleError(error, process.env.DEBUG === 'true');
        process.exit(1);
      }
    });

  // --- verify ---
  cmd
    .command('verify')
    .description('Verify that credentials can be resolved from the git credential helper')
    .option('--host <host>', 'Credential host', PROTON_CREDENTIAL_HOST)
    .action(async (options) => {
      try {
        const cred = await gitCredentialFill(options.host);

        if (!isQuiet()) {
          console.log(chalk.green('Credentials found:'));
          console.log(`  ${chalk.dim('Host:')}     ${cred.host}`);
          console.log(`  ${chalk.dim('Username:')} ${cred.username}`);
          console.log(`  ${chalk.dim('Password:')} ${'*'.repeat(20)}`);
        }
      } catch (error) {
        handleError(error, process.env.DEBUG === 'true');
        process.exit(1);
      }
    });

  return cmd;
}
