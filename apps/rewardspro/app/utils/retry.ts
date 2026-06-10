/**
 * Retry Utility with Exponential Backoff
 * Provides resilient API calls with automatic retry logic
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  shouldRetry: (error) => {
    // Don't retry on client errors (4xx)
    if (error.status >= 400 && error.status < 500) {
      return false;
    }
    
    // Don't retry on specific error messages
    const message = error.message?.toLowerCase() || '';
    if (
      message.includes('invalid') ||
      message.includes('not found') ||
      message.includes('already exists') ||
      message.includes('duplicate')
    ) {
      return false;
    }
    
    // Retry on network errors, timeouts, and 5xx errors
    return true;
  },
  onRetry: (attempt, error) => {
    console.log(`Retry attempt ${attempt} after error:`, error.message);
  },
};

/**
 * Execute an async operation with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if we should retry
      if (!opts.shouldRetry(error)) {
        throw error;
      }
      
      // Don't retry if this was the last attempt
      if (attempt === opts.maxAttempts) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );
      
      // Call retry callback
      opts.onRetry(attempt, error);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All attempts failed
  throw new Error(`Operation failed after ${opts.maxAttempts} attempts: ${lastError?.message}`);
}

/**
 * Batch retry operations with individual error handling
 */
export async function batchWithRetry<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  options: RetryOptions = {}
): Promise<{
  successful: R[];
  failed: Array<{ item: T; error: Error }>;
}> {
  const results = await Promise.allSettled(
    items.map(item => withRetry(() => operation(item), options))
  );
  
  const successful: R[] = [];
  const failed: Array<{ item: T; error: Error }> = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      failed.push({
        item: items[index],
        error: result.reason,
      });
    }
  });
  
  return { successful, failed };
}

/**
 * Circuit breaker pattern for API calls
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly threshold = 5,
    private readonly timeout = 60000, // 1 minute
    private readonly resetTimeout = 30000 // 30 seconds
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error(`Circuit breaker opened after ${this.failures} failures`);
      }
      
      throw error;
    }
  }
  
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureTime = 0;
  }
  
  getState(): string {
    return this.state;
  }
}