/**
 * Retry Utilities
 *
 * Provides exponential backoff retry logic for network requests
 * and other potentially flaky operations.
 */

// ============================================================================
// Types
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to delays (default: true) */
  jitter?: boolean;
  /** Function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: Error) => boolean;
  /** Callback called before each retry attempt */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  /** Timeout for each attempt in ms (default: no timeout) */
  attemptTimeoutMs?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDurationMs: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable' | 'attemptTimeoutMs'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

// ============================================================================
// Retry Implementation
// ============================================================================

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // Wrap with timeout if specified
      let result: T;
      if (opts.attemptTimeoutMs) {
        result = await withTimeout(fn(), opts.attemptTimeoutMs);
      } else {
        result = await fn();
      }

      return {
        success: true,
        result,
        attempts: attempt,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt >= opts.maxAttempts) {
        break; // Max attempts reached
      }

      if (opts.isRetryable && !opts.isRetryable(lastError)) {
        break; // Error is not retryable
      }

      // Calculate delay with exponential backoff
      let delayMs = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );

      // Add jitter (±25%)
      if (opts.jitter) {
        const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
        delayMs = Math.floor(delayMs * jitterFactor);
      }

      // Notify callback
      if (opts.onRetry) {
        opts.onRetry(lastError, attempt, delayMs);
      }

      // Wait before retry
      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: opts.maxAttempts,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Execute with retry, throwing on failure
 */
export async function withRetryThrow<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const result = await withRetry(fn, options);

  if (!result.success) {
    const error = result.error || new Error('Unknown error after retries');
    (error as any).attempts = result.attempts;
    (error as any).totalDurationMs = result.totalDurationMs;
    throw error;
  }

  return result.result!;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Custom timeout error
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Common Retry Predicates
// ============================================================================

/**
 * Check if error is a network error that should be retried
 */
export function isNetworkError(error: Error): boolean {
  const networkErrorPatterns = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'socket hang up',
    'network error',
    'fetch failed',
  ];

  const message = error.message.toLowerCase();
  return networkErrorPatterns.some((pattern) =>
    message.includes(pattern.toLowerCase())
  );
}

/**
 * Check if HTTP status code is retryable
 */
export function isRetryableStatusCode(statusCode: number): boolean {
  // Retry on server errors (5xx) and rate limiting (429)
  return statusCode >= 500 || statusCode === 429;
}

/**
 * Create a retry predicate for HTTP errors
 */
export function createHttpRetryPredicate(): (error: Error) => boolean {
  return (error: Error) => {
    // Always retry network errors
    if (isNetworkError(error)) {
      return true;
    }

    // Check for HTTP status codes in error
    const statusMatch = error.message.match(/status[:\s]+(\d{3})/i);
    if (statusMatch) {
      return isRetryableStatusCode(parseInt(statusMatch[1], 10));
    }

    // Check for timeout errors
    if (error instanceof TimeoutError || error.name === 'TimeoutError') {
      return true;
    }

    // Don't retry other errors by default
    return false;
  };
}
