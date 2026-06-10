/**
 * Webhook Error Types
 * Provides structured error handling for webhook processing.
 *
 * Phase 1B: Webhook Security Hardening
 * Date: 2025-01-07
 *
 * Error classification determines retry behavior:
 * - Retryable errors: Return 500 to trigger Shopify retry
 * - Non-retryable errors: Return 200/400 to prevent retries
 */

// ============================================
// BASE ERROR CLASS
// ============================================

/**
 * Base class for all webhook errors.
 * Includes retry flag to determine HTTP status code.
 */
export class WebhookError extends Error {
  constructor(
    message: string,
    /** Whether Shopify should retry this webhook */
    public readonly isRetryable: boolean,
    /** HTTP status code to return */
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'WebhookError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ============================================
// NON-RETRYABLE ERRORS
// ============================================

/**
 * Validation errors - data is invalid and won't become valid on retry.
 */
export class ValidationError extends WebhookError {
  constructor(message: string, public readonly field?: string) {
    super(message, false, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Resource not found - requested entity doesn't exist.
 */
export class NotFoundError extends WebhookError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, false, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict errors - operation conflicts with current state.
 * (e.g., trying to process an already cancelled order)
 */
export class ConflictError extends WebhookError {
  constructor(message: string) {
    super(message, false, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Business logic errors - operation violates business rules.
 * (e.g., customer ineligible for tier upgrade)
 */
export class BusinessLogicError extends WebhookError {
  constructor(message: string, public readonly code?: string) {
    super(message, false, 422);
    this.name = 'BusinessLogicError';
  }
}

/**
 * Duplicate processing - webhook already handled.
 */
export class DuplicateError extends WebhookError {
  constructor(webhookId: string) {
    super(`Webhook already processed: ${webhookId}`, false, 200);
    this.name = 'DuplicateError';
  }
}

// ============================================
// RETRYABLE ERRORS
// ============================================

/**
 * Transient errors - temporary failures that may resolve on retry.
 */
export class TransientError extends WebhookError {
  constructor(message: string, public readonly cause?: Error) {
    super(message, true, 503);
    this.name = 'TransientError';
  }
}

/**
 * Database errors - database connectivity or timeout issues.
 */
export class DatabaseError extends WebhookError {
  constructor(message: string, public readonly code?: string) {
    super(message, true, 503);
    this.name = 'DatabaseError';
  }
}

/**
 * External service errors - third-party API failures.
 */
export class ExternalServiceError extends WebhookError {
  constructor(service: string, message: string) {
    super(`${service} error: ${message}`, true, 503);
    this.name = 'ExternalServiceError';
  }
}

/**
 * Rate limit errors - too many requests.
 */
export class RateLimitError extends WebhookError {
  constructor(public readonly retryAfter?: number) {
    super('Rate limit exceeded', true, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Timeout errors - operation took too long.
 */
export class TimeoutError extends WebhookError {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`, true, 504);
    this.name = 'TimeoutError';
  }
}

// ============================================
// ERROR DETECTION
// ============================================

/**
 * Determines if an error should trigger a Shopify retry.
 */
export function shouldRetryError(error: unknown): boolean {
  // Known webhook errors
  if (error instanceof WebhookError) {
    return error.isRetryable;
  }

  // Unknown errors - check for common retryable patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network/connection errors - retryable
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('socket') ||
      message.includes('dns')
    ) {
      return true;
    }

    // Database errors - usually retryable
    if (
      message.includes('database') ||
      message.includes('connection') ||
      message.includes('deadlock') ||
      message.includes('lock timeout')
    ) {
      return true;
    }

    // Rate limits - retryable
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('throttl')
    ) {
      return true;
    }

    // Validation/business logic - not retryable
    if (
      message.includes('invalid') ||
      message.includes('not found') ||
      message.includes('already exists') ||
      message.includes('already processed') ||
      message.includes('duplicate')
    ) {
      return false;
    }
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Converts a generic error to a WebhookError with appropriate retry behavior.
 */
export function toWebhookError(error: unknown): WebhookError {
  if (error instanceof WebhookError) {
    return error;
  }

  if (error instanceof Error) {
    const isRetryable = shouldRetryError(error);
    const statusCode = isRetryable ? 503 : 500;
    return new WebhookError(error.message, isRetryable, statusCode);
  }

  return new WebhookError(String(error), false, 500);
}

// ============================================
// ERROR FACTORY FUNCTIONS
// ============================================

/**
 * Creates appropriate error for missing required field.
 */
export function missingRequiredField(field: string): ValidationError {
  return new ValidationError(`Missing required field: ${field}`, field);
}

/**
 * Creates appropriate error for invalid field value.
 */
export function invalidFieldValue(field: string, value: unknown): ValidationError {
  return new ValidationError(
    `Invalid value for ${field}: ${JSON.stringify(value)}`,
    field
  );
}

/**
 * Creates appropriate error for resource not found.
 */
export function resourceNotFound(resource: string, id: string): NotFoundError {
  return new NotFoundError(resource, id);
}

/**
 * Creates appropriate error for database operation failure.
 */
export function databaseOperationFailed(operation: string, error: Error): DatabaseError {
  return new DatabaseError(`Database operation '${operation}' failed: ${error.message}`);
}
