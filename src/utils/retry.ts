import pRetry, { AbortError } from 'p-retry';
import { AppError } from '../errors/types';

export interface RetryOptions {
  maxRetries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    minTimeout = 1000,
    maxTimeout = 10000,
    onRetry,
  } = options;

  return pRetry(
    async () => {
      try {
        return await operation();
      } catch (error) {
        // Don't retry on non-recoverable errors
        if (error instanceof AppError && !error.isRecoverable) {
          throw new AbortError(error);
        }

        // Re-throw to trigger retry
        throw error;
      }
    },
    {
      retries: maxRetries,
      minTimeout,
      maxTimeout,
      onFailedAttempt: (context) => {
        if (onRetry && context.retriesLeft > 0) {
          onRetry(context as any, context.attemptNumber);
        }
      },
    }
  );
}

/**
 * Check if error should be retried
 */
export function shouldRetry(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isRecoverable;
  }

  // Retry on network errors
  const nodeError = error as NodeJS.ErrnoException;
  return !!(
    nodeError.code === 'ETIMEDOUT' ||
    nodeError.code === 'ECONNREFUSED' ||
    nodeError.code === 'ENOTFOUND' ||
    nodeError.code === 'ECONNRESET' ||
    nodeError.code === 'EAI_AGAIN'
  );
}

/**
 * Create a retry function with default options for network operations
 */
export function createNetworkRetry<T>(
  operation: () => Promise<T>,
  onRetry?: (error: Error, attempt: number) => void
): Promise<T> {
  return retryOperation(operation, {
    maxRetries: 3,
    minTimeout: 1000,
    maxTimeout: 10000,
    onRetry,
  });
}

/**
 * Create a retry function with fewer retries for quick operations
 */
export function createQuickRetry<T>(
  operation: () => Promise<T>,
  onRetry?: (error: Error, attempt: number) => void
): Promise<T> {
  return retryOperation(operation, {
    maxRetries: 2,
    minTimeout: 500,
    maxTimeout: 2000,
    onRetry,
  });
}
