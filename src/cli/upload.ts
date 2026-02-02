import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createDriveClient } from '../drive';
import { handleError } from '../errors/handler';
import { validateFilePath, validateFileSize } from '../utils/validation';
import { onShutdown, isShuttingDownFlag } from '../utils/shutdown';
import { AppError, ErrorCode } from '../errors/types';
import {
  isStdinPiped,
  readStdinToTempFile,
  cleanupTempFile,
  extractFilenameFromPath,
  getParentPath,
} from '../utils/stdin';
import { isVerbose, isQuiet, verboseLog, normalLog, outputResult } from '../utils/output';

/**
 * Create the upload command
 */
export function createUploadCommand(): Command {
  const cmd = new Command('upload');

  cmd
    .description('Upload a file to Proton Drive (use "-" to read from stdin)')
    .argument('<file>', 'Local file to upload (or "-" for stdin)')
    .argument('[destination]', 'Destination path in Drive - can be a folder (/Documents) or include filename (/Documents/newname.txt)', '/')
    .option('--no-progress', 'Disable progress output')
    .option('--name <filename>', 'Filename to use when uploading from stdin')
    .action(async (file: string, destination: string, options) => {
      const startTime = Date.now();
      let uploadCancelled = false;
      let isStdin = false;
      let tempFilePath: string | null = null;
      let actualFilePath: string;
      let fileName: string;
      let uploadDestination: string;

      try {
        // Handle stdin upload
        if (file === '-') {
          isStdin = true;

          // Check if stdin is actually piped
          if (!isStdinPiped()) {
            throw new AppError(
              'No input provided. Please pipe data to stdin or provide a file path.',
              ErrorCode.INVALID_FILE,
              {},
              false
            );
          }

          // Try to extract filename from destination path
          const extractedFilename = extractFilenameFromPath(destination);

          if (extractedFilename) {
            // Destination includes filename (e.g., /Documents/myfile.txt)
            fileName = extractedFilename;
            uploadDestination = getParentPath(destination);
          } else if (options.name) {
            // Filename provided via --name flag
            fileName = options.name;
            uploadDestination = destination;
          } else {
            // No filename provided
            throw new AppError(
              'When uploading from stdin, you must either:\n' +
              '  1. Include filename in destination: proton-drive upload - /Documents/myfile.txt\n' +
              '  2. Use --name flag: proton-drive upload - /Documents --name myfile.txt',
              ErrorCode.VALIDATION_ERROR,
              {},
              false
            );
          }

          // Read stdin to temp file
          let spinner;
          if (isVerbose()) {
            spinner = ora('Reading from stdin...').start();
          }
          tempFilePath = await readStdinToTempFile();
          actualFilePath = tempFilePath;
          if (spinner) {
            spinner.succeed('Data received from stdin');
          }
        } else {
          // Regular file upload
          await validateFilePath(file);
          actualFilePath = file;

          // Check if destination includes a filename (for renaming during upload)
          const extractedFilename = extractFilenameFromPath(destination);

          if (extractedFilename) {
            // Destination includes filename (e.g., /Documents/newname.txt)
            fileName = extractedFilename;
            uploadDestination = getParentPath(destination);
          } else {
            // Destination is a folder path - use local file's basename
            fileName = path.basename(file);
            uploadDestination = destination;
          }
        }

        const stats = await fs.stat(actualFilePath);

        // Validate file size
        validateFileSize(stats.size);

        const fileSize = stats.size;

        // Display file info in verbose mode
        if (isVerbose()) {
          console.log(boxen(
            chalk.bold('Upload Details\n\n') +
            `${chalk.cyan('Source:')} ${isStdin ? 'stdin' : file}\n` +
            `${chalk.cyan('File:')} ${fileName}\n` +
            `${chalk.cyan('Size:')} ${formatBytes(fileSize)}\n` +
            `${chalk.cyan('Destination:')} ${uploadDestination}`,
            {
              padding: 1,
              borderColor: 'blue',
              borderStyle: 'round',
              margin: { top: 1, bottom: 1 }
            }
          ));
        }

        // Register cleanup handler for Ctrl+C
        onShutdown(async () => {
          uploadCancelled = true;
          if (isVerbose()) {
            console.log(chalk.yellow('\n⚠️  Upload cancelled'));
          }
          if (tempFilePath) {
            await cleanupTempFile(tempFilePath);
          }
        });

        // Create and initialize drive client
        let initSpinner;
        if (isVerbose()) {
          initSpinner = ora('Initializing Drive client...').start();
        }
        const client = createDriveClient();
        await client.initializeFromSession();
        if (initSpinner) {
          initSpinner.succeed('Client initialized');
        }

        // Track upload progress
        let lastProgress = 0;
        let progressSpinner: any = null;

        const onProgress = (uploaded: number, total: number) => {
          // Check if cancelled
          if (uploadCancelled || isShuttingDownFlag()) {
            throw new AppError(
              'Upload cancelled by user',
              ErrorCode.OPERATION_CANCELLED,
              {},
              false
            );
          }

          // Only show progress in verbose mode
          if (!options.progress || !isVerbose()) return;

          const progress = Math.floor((uploaded / total) * 100);
          if (progress !== lastProgress) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = uploaded / elapsed;
            const remaining = (total - uploaded) / speed;

            const message =
              chalk.cyan('Uploading: ') +
              `${progress}% (${formatBytes(uploaded)}/${formatBytes(total)}) - ` +
              `${chalk.dim('Speed:')} ${formatBytes(speed)}/s - ` +
              `${chalk.dim('Remaining:')} ${formatTime(remaining)}`;

            if (!progressSpinner) {
              progressSpinner = ora(message).start();
            } else {
              progressSpinner.text = message;
            }

            lastProgress = progress;
          }
        };

        // Upload file (use actualFilePath which is either the original file or temp file)
        // For stdin uploads, we pass the fileName separately since the temp file has a generated name
        const result = await client.uploadFile(
          actualFilePath,
          uploadDestination,
          onProgress,
          isStdin ? fileName : undefined
        );

        if (progressSpinner) {
          progressSpinner.succeed(chalk.green('Upload complete'));
        }

        // Clean up temp file if used
        if (tempFilePath) {
          await cleanupTempFile(tempFilePath);
        }

        const elapsedTime = (Date.now() - startTime) / 1000;
        const avgSpeed = fileSize / elapsedTime;

        // Output based on verbosity
        if (isVerbose()) {
          // Verbose: Show detailed success message
          console.log(chalk.green.bold('\n✓ Upload successful!\n'));
          console.log(chalk.dim('Details:'));
          console.log(`  ${chalk.cyan('File ID:')} ${result.fileId}`);
          console.log(`  ${chalk.cyan('Revision ID:')} ${result.revisionId}`);
          console.log(`  ${chalk.cyan('Blocks:')} ${result.uploadedBlocks}`);
          console.log(`  ${chalk.cyan('Duration:')} ${formatTime(elapsedTime)}`);
          console.log(`  ${chalk.cyan('Avg Speed:')} ${formatBytes(avgSpeed)}/s`);
        } else if (!isQuiet()) {
          // Normal: Just show file ID for scripting
          outputResult(result.fileId);
        }
      } catch (error) {
        // Clean up temp file on error
        if (tempFilePath) {
          await cleanupTempFile(tempFilePath);
        }

        handleError(error, process.env.DEBUG === 'true');
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
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
