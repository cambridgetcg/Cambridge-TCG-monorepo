/**
 * Error Handling Utilities
 *
 * Standardized error handling patterns for the application.
 * Provides consistent error types, formatting, and response helpers.
 *
 * Part of Crystal Polishing Plan - Phase 2.2
 */

import { json } from "@remix-run/node";
import { createLogger } from "~/services/logger.server";

const logger = createLogger('ErrorHandler');

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Base application error with structured metadata
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'INTERNAL_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for invalid input data
 */
export class ValidationError extends AppError {
  public readonly fields?: Record<string, string[]>;

  constructor(message: string, fields?: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 400, true, { fields });
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401, true);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (authenticated but not permitted)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 'AUTHORIZATION_ERROR', 403, true);
    this.name = 'AuthorizationError';
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true, { resource, identifier });
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error (e.g., duplicate entry)
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409, true);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT', 429, true, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * External service error (Shopify API, etc.)
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string, originalError?: Error) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, true, {
      service,
      originalError: originalError?.message
    });
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}

// ============================================================================
// ERROR HANDLING HELPERS
// ============================================================================

/**
 * Wrap an async function with standardized error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: {
    logErrors?: boolean;
    rethrow?: boolean;
    defaultValue?: ReturnType<T>;
  }
): T {
  const { logErrors = true, rethrow = true, defaultValue } = options || {};

  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (logErrors) {
        logger.error('Operation failed', error);
      }

      if (rethrow) {
        throw error;
      }

      return defaultValue;
    }
  }) as T;
}

/**
 * Safe wrapper that catches errors and returns a Result type
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export async function safeAsync<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Safe wrapper for sync operations
 */
export function safeSync<T>(fn: () => T): Result<T> {
  try {
    const data = fn();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

interface ErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Convert an error to a standardized JSON response
 */
export function errorResponse(error: unknown, includeDetails = false): Response {
  // Handle AppError instances
  if (error instanceof AppError) {
    const body: ErrorResponse = {
      error: error.message,
      code: error.code
    };

    if (includeDetails && error.context) {
      body.details = error.context;
    }

    // Log non-operational errors (programming errors)
    if (!error.isOperational) {
      logger.error('Non-operational error', error);
    }

    return json(body, { status: error.statusCode });
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    logger.error('Unhandled error', error);

    return json(
      {
        error: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }

  // Handle unknown errors
  logger.error('Unknown error type', new Error(String(error)));

  return json(
    { error: 'An unexpected error occurred', code: 'UNKNOWN_ERROR' },
    { status: 500 }
  );
}

/**
 * Success response helper
 */
export function successResponse<T>(data: T, status = 200): Response {
  return json({ success: true, data }, { status });
}

// ============================================================================
// RETRY HELPERS
// ============================================================================

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry
  } = options;

  let lastError: Error;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      const retryDelay = currentDelay;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      currentDelay *= backoffMultiplier;
    }
  }

  throw lastError!;
}

// ============================================================================
// SHOPIFY-SPECIFIC HELPERS
// ============================================================================

/**
 * Check if an error is a Shopify rate limit error
 */
export function isShopifyRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('Throttled') ||
      error.message.includes('429') ||
      error.message.includes('rate limit')
    );
  }
  return false;
}

/**
 * Check if an error is a Shopify authentication error
 */
export function isShopifyAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('401') ||
      error.message.includes('Unauthorized') ||
      error.message.includes('Invalid API key') ||
      error.message.includes('access token')
    );
  }
  return false;
}

/**
 * Parse Shopify GraphQL user errors
 */
export function parseShopifyUserErrors(
  userErrors: Array<{ field?: string[]; message: string }> | null | undefined
): ValidationError | null {
  if (!userErrors || userErrors.length === 0) {
    return null;
  }

  const fields: Record<string, string[]> = {};

  for (const error of userErrors) {
    const fieldKey = error.field?.join('.') || '_general';
    if (!fields[fieldKey]) {
      fields[fieldKey] = [];
    }
    fields[fieldKey].push(error.message);
  }

  const message = userErrors.map(e => e.message).join('; ');
  return new ValidationError(message, fields);
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Assert that a value is not null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  name: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(`${name} is required`);
  }
}

/**
 * Assert that a condition is true
 */
export function assert(
  condition: boolean,
  message: string,
  ErrorClass: new (message: string) => Error = AppError
): asserts condition {
  if (!condition) {
    throw new ErrorClass(message);
  }
}
