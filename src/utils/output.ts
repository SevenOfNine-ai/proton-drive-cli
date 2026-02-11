import chalk from 'chalk';

/**
 * Check if verbose mode is enabled
 */
export function isVerbose(): boolean {
  return process.env.VERBOSE === 'true';
}

/**
 * Check if quiet mode is enabled
 */
export function isQuiet(): boolean {
  return process.env.QUIET === 'true';
}

/**
 * Print message only in verbose mode
 */
export function verboseLog(...args: any[]): void {
  if (!isQuiet() && isVerbose()) {
    console.log(...args);
  }
}

/**
 * Print message in normal and verbose mode (suppressed in quiet mode)
 */
export function normalLog(...args: any[]): void {
  if (!isQuiet()) {
    console.log(...args);
  }
}

/**
 * Print minimal output for scripts (always shown, even in quiet for success)
 */
export function outputResult(data: string): void {
  console.log(data);
}
