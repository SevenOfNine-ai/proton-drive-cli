import chalk from 'chalk';

let isShuttingDown = false;
const cleanupHandlers: Array<() => Promise<void> | void> = [];

/**
 * Register cleanup handler
 */
export function onShutdown(handler: () => Promise<void> | void): void {
  cleanupHandlers.push(handler);
}

/**
 * Perform cleanup
 */
async function cleanup(): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(chalk.yellow('\n\n🧹 Cleaning up...'));

  for (const handler of cleanupHandlers) {
    try {
      await handler();
    } catch (error) {
      if (process.env.DEBUG) {
        console.error(chalk.red('Cleanup error:'), error);
      }
    }
  }

  console.log(chalk.dim('Cleanup complete'));
}

/**
 * Setup graceful shutdown handlers
 */
export function setupShutdownHandlers(): void {
  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\n⚠️  Received interrupt signal (Ctrl+C)'));
    await cleanup();
    process.exit(130); // Standard exit code for SIGINT
  });

  // Handle termination
  process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n\n⚠️  Received termination signal'));
    await cleanup();
    process.exit(143); // Standard exit code for SIGTERM
  });
}

/**
 * Check if shutting down
 */
export function isShuttingDownFlag(): boolean {
  return isShuttingDown;
}

/**
 * Clear all shutdown handlers (useful for testing)
 */
export function clearShutdownHandlers(): void {
  cleanupHandlers.length = 0;
}
