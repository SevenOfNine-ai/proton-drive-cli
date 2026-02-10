import { Command } from 'commander';
import { createDriveClient } from '../drive/client';
import chalk from 'chalk';
import { resolvePassword } from '../utils/password';

/**
 * Create mkdir command
 * Creates a new folder in Proton Drive
 */
export function createMkdirCommand(): Command {
  const mkdir = new Command('mkdir');

  mkdir
    .description('Create a new folder in Proton Drive')
    .argument('<path>', 'Path where to create the folder (e.g., /Documents)')
    .argument('<folder-name>', 'Name of the folder to create')
    .option('-p, --parents', 'Create parent directories as needed (not implemented yet)')
    .option('--password <password>', 'Password for key decryption (or set PROTON_PASSWORD)')
    .action(async (path: string, folderName: string, options) => {
      try {
        if (options.parents) {
          console.log(chalk.yellow('Warning: -p/--parents option is not yet implemented'));
        }

        // Resolve password for key decryption
        const password = await resolvePassword(options);

        // Initialize Drive client
        const client = createDriveClient();
        await client.initializeFromSession(password);

        console.log(chalk.cyan(`Creating folder "${folderName}" at ${path}...`));

        // Create the folder
        const folderId = await client.createFolder(path, folderName);

        console.log(chalk.green('✓ Folder created successfully'));
        console.log(chalk.gray(`  Folder ID: ${folderId}`));
        console.log(chalk.gray(`  Full path: ${path}/${folderName}`));
      } catch (error) {
        if (error instanceof Error) {
          console.error(chalk.red('Error:'), error.message);
        } else {
          console.error(chalk.red('Error:'), String(error));
        }
        process.exit(1);
      }
    });

  return mkdir;
}
