// Error types for customer sync
export enum SyncErrorType {
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN = 'UNKNOWN'
}

export class SyncError extends Error {
  constructor(
    message: string,
    public type: SyncErrorType,
    public details?: any
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

// Error classifier
export function classifyError(error: any): SyncErrorType {
  const message = error?.message || '';
  const code = error?.extensions?.code || error?.code || '';
  
  // Rate limiting
  if (code === 'THROTTLED' || message.includes('throttle') || message.includes('rate limit')) {
    return SyncErrorType.RATE_LIMIT;
  }
  
  // Network errors
  if (
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('network') ||
    message.includes('fetch failed')
  ) {
    return SyncErrorType.NETWORK;
  }
  
  // Permission errors
  if (
    code === 'FORBIDDEN' ||
    code === 'UNAUTHORIZED' ||
    message.includes('permission') ||
    message.includes('access denied')
  ) {
    return SyncErrorType.PERMISSION;
  }
  
  // Not found errors
  if (code === 'NOT_FOUND' || message.includes('not found')) {
    return SyncErrorType.NOT_FOUND;
  }
  
  // Validation errors
  if (
    code === 'INVALID' ||
    message.includes('invalid') ||
    message.includes('validation')
  ) {
    return SyncErrorType.VALIDATION;
  }
  
  return SyncErrorType.UNKNOWN;
}

// User-friendly error messages
export function getUserFriendlyErrorMessage(error: any): string {
  const errorType = classifyError(error);
  
  switch (errorType) {
    case SyncErrorType.RATE_LIMIT:
      return 'API rate limit reached. The sync will automatically retry with delays.';
    
    case SyncErrorType.NETWORK:
      return 'Network connection issue. Please check your internet connection and try again.';
    
    case SyncErrorType.PERMISSION:
      return 'Permission denied. Please ensure the app has the required permissions to access customer data.';
    
    case SyncErrorType.NOT_FOUND:
      return 'Resource not found. Some customers may have been deleted or moved.';
    
    case SyncErrorType.VALIDATION:
      return 'Data validation error. Some customer data may be invalid or incomplete.';
    
    default:
      return error?.message || 'An unexpected error occurred during sync.';
  }
}

// Retry strategy
export function shouldRetry(error: any, attemptNumber: number): boolean {
  const errorType = classifyError(error);
  const maxAttempts = 3;
  
  if (attemptNumber >= maxAttempts) {
    return false;
  }
  
  switch (errorType) {
    case SyncErrorType.RATE_LIMIT:
    case SyncErrorType.NETWORK:
      return true;
    
    case SyncErrorType.PERMISSION:
    case SyncErrorType.VALIDATION:
    case SyncErrorType.NOT_FOUND:
      return false;
    
    default:
      return attemptNumber < 2; // Try once more for unknown errors
  }
}

// Calculate retry delay
export function getRetryDelay(errorType: SyncErrorType, attemptNumber: number): number {
  const baseDelay = 1000; // 1 second
  
  switch (errorType) {
    case SyncErrorType.RATE_LIMIT:
      // Longer delay for rate limits
      return Math.min(baseDelay * Math.pow(2, attemptNumber) * 5, 60000);
    
    case SyncErrorType.NETWORK:
      // Standard exponential backoff
      return Math.min(baseDelay * Math.pow(2, attemptNumber), 30000);
    
    default:
      return baseDelay * attemptNumber;
  }
}

// Error aggregator for multiple errors
export class ErrorAggregator {
  private errors: Map<string, { count: number; lastError: any; firstOccurred: Date }> = new Map();
  
  addError(key: string, error: any) {
    const existing = this.errors.get(key);
    
    if (existing) {
      existing.count++;
      existing.lastError = error;
    } else {
      this.errors.set(key, {
        count: 1,
        lastError: error,
        firstOccurred: new Date()
      });
    }
  }
  
  getSummary(): string[] {
    const summary: string[] = [];
    
    for (const data of this.errors.values()) {
      const message = getUserFriendlyErrorMessage(data.lastError);
      if (data.count > 1) {
        summary.push(`${message} (occurred ${data.count} times)`);
      } else {
        summary.push(message);
      }
    }
    
    return summary;
  }
  
  hasErrors(): boolean {
    return this.errors.size > 0;
  }
  
  getErrorCount(): number {
    let total = 0;
    for (const data of this.errors.values()) {
      total += data.count;
    }
    return total;
  }
}
