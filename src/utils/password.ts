/**
 * Password resolution for standalone CLI commands.
 *
 * Resolution order:
 * 1. --password flag (options.password)
 * 2. PROTON_PASSWORD env var
 * 3. Interactive prompt (if TTY)
 * 4. Error
 */

import inquirer from 'inquirer';

export async function resolvePassword(options: { password?: string }): Promise<string> {
  // 1. --password flag
  if (options.password) {
    return options.password;
  }

  // 2. PROTON_PASSWORD env var
  const envPassword = process.env.PROTON_PASSWORD;
  if (envPassword) {
    return envPassword;
  }

  // 3. Interactive prompt (if TTY)
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Password (for key decryption):',
        mask: '*',
        validate: (input: string) => input.length > 0 || 'Password is required',
      },
    ]);
    return answers.password;
  }

  // 4. Error
  throw new Error(
    'Password required for key decryption. Use --password, PROTON_PASSWORD, or run interactively.'
  );
}
