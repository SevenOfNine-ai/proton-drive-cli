import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createDriveClient } from '../drive/client';
import { handleError } from '../errors/handler';
import { isVerbose, isQuiet, outputResult } from '../utils/output';

/**
 * Create the download command
 */
export function createDownloadCommand(): Command {
  return new Command('download')
    .description('Download a file from Proton Drive')
    .argument('<source>', 'Source path in Drive (e.g., /Documents/file.pdf)')
    .argument('<output>', 'Output path on local filesystem (e.g., ./file.pdf)')
    .option('--skip-verification', 'Skip manifest signature verification (not recommended)')
    .action(downloadCommand);
}

/**
 * Download a file from Proton Drive
 * @param sourcePath - Path in Drive (e.g., '/Documents/file.pdf')
 * @param outputPath - Local output path (e.g., './file.pdf')
 */
async function downloadCommand(sourcePath: string, outputPath: string, options: any) {
  try {
    // Initialize Drive client with spinner in verbose mode
    let initSpinner;
    if (isVerbose()) {
      initSpinner = ora('Initializing Drive client...').start();
    }

    const driveClient = createDriveClient();
    await driveClient.initializeFromSession();

    if (initSpinner) {
      initSpinner.succeed('Drive client initialized');
    }

    if (options.skipVerification && isVerbose()) {
      console.log(chalk.yellow('⚠ Skipping signature verification as requested'));
    }

    // Track download progress
    const startTime = Date.now();
    let lastUpdate = Date.now();
    let progressSpinner: any = null;

    const result = await driveClient.downloadFile(
      sourcePath,
      outputPath,
      (downloaded, total) => {
        // Only show progress in verbose mode
        if (!isVerbose()) return;

        const now = Date.now();
        // Update progress every second
        if (now - lastUpdate >= 1000) {
          const progress = (downloaded / total) * 100;
          const elapsed = (now - startTime) / 1000;
          const speed = downloaded / elapsed;
          const remaining = (total - downloaded) / speed;

          const message =
            chalk.cyan('Downloading: ') +
            `${progress.toFixed(0)}% (${formatSize(downloaded)}/${formatSize(total)}) - ` +
            `${chalk.dim('Speed:')} ${formatSize(speed)}/s - ` +
            `${chalk.dim('Remaining:')} ${remaining.toFixed(0)}s`;

          if (!progressSpinner) {
            progressSpinner = ora(message).start();
          } else {
            progressSpinner.text = message;
          }

          lastUpdate = now;
        }
      },
      options.skipVerification
    );

    if (progressSpinner) {
      progressSpinner.succeed(chalk.green('Download complete'));
    }

    // Output based on verbosity
    const elapsedTime = (Date.now() - startTime) / 1000;
    const avgSpeed = result.size / elapsedTime;

    if (isVerbose()) {
      // Verbose: Show detailed success message
      console.log(chalk.green.bold('\n✓ Download successful!\n'));
      console.log(chalk.dim('Details:'));
      console.log(`  ${chalk.cyan('File:')} ${result.filePath}`);
      console.log(`  ${chalk.cyan('Size:')} ${formatSize(result.size)}`);
      console.log(`  ${chalk.cyan('Blocks:')} ${result.downloadedBlocks}`);
      console.log(`  ${chalk.cyan('Duration:')} ${formatTime(elapsedTime)}`);
      console.log(`  ${chalk.cyan('Avg Speed:')} ${formatSize(avgSpeed)}/s`);
    } else if (!isQuiet()) {
      // Normal: Just show file path for scripting
      outputResult(result.filePath);
    }

  } catch (error) {
    handleError(error, process.env.DEBUG === 'true');
    process.exit(1);
  }
}

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format seconds to human-readable time
 */
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
}
