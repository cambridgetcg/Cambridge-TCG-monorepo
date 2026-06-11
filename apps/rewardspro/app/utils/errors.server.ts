/**
 * Application Error Types
 *
 * Centralized error handling with typed errors for consistent
 * error responses across the application.
 */

// ============================================
// BASE ERROR CLASS
// ============================================

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
    };
  }
}

// ============================================
// CLIENT ERRORS (4xx)
// ============================================

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401, true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 'AUTHORIZATION_ERROR', 403, true);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true, { resource, identifier });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, true, details);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Too many requests. Please try again later.', 'RATE_LIMITED', 429, true, { retryAfter });
  }
}

// ============================================
// SERVER ERRORS (5xx)
// ============================================

export class InternalError extends AppError {
  constructor(message: string = 'An internal error occurred', details?: Record<string, unknown>) {
    super(message, 'INTERNAL_ERROR', 500, false, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} is temporarily unavailable`, 'SERVICE_UNAVAILABLE', 503, true, { service });
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: Error) {
    super(
      `External service error: ${service}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      true,
      { service, originalError: originalError?.message }
    );
  }
}

// ============================================
// BUSINESS LOGIC ERRORS
// ============================================

export class PlanLimitExceededError extends AppError {
  constructor(limit: string, current: number, max: number) {
    super(
      `${limit} limit exceeded: ${current}/${max}`,
      'PLAN_LIMIT_EXCEEDED',
      402,
      true,
      { limit, current, max }
    );
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(required: number, available: number, currency: string = 'USD') {
    super(
      `Insufficient balance: ${currency} ${available} available, ${currency} ${required} required`,
      'INSUFFICIENT_BALANCE',
      402,
      true,
      { required, available, currency }
    );
  }
}

export class TierNotFoundError extends AppError {
  constructor(tierId?: string) {
    super(
      tierId ? `Tier '${tierId}' not found` : 'Tier not found',
      'TIER_NOT_FOUND',
      404,
      true,
      { tierId }
    );
  }
}

export class CustomerNotFoundError extends AppError {
  constructor(customerId?: string) {
    super(
      customerId ? `Customer '${customerId}' not found` : 'Customer not found',
      'CUSTOMER_NOT_FOUND',
      404,
      true,
      { customerId }
    );
  }
}

export class OrderNotFoundError extends AppError {
  constructor(orderId?: string) {
    super(
      orderId ? `Order '${orderId}' not found` : 'Order not found',
      'ORDER_NOT_FOUND',
      404,
      true,
      { orderId }
    );
  }
}

export class WebhookProcessingError extends AppError {
  constructor(topic: string, message: string, details?: Record<string, unknown>) {
    super(
      `Webhook processing failed for ${topic}: ${message}`,
      'WEBHOOK_PROCESSING_ERROR',
      500,
      false,
      { topic, ...details }
    );
  }
}

export class IdempotencyError extends AppError {
  constructor(webhookId: string) {
    super(
      `Webhook ${webhookId} already processed`,
      'IDEMPOTENCY_ERROR',
      200,
      true,
      { webhookId, alreadyProcessed: true }
    );
  }
}

// ============================================
// ERROR HANDLING UTILITIES
// ============================================

/**
 * Check if an error is an operational AppError (expected error)
 */
export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational;
}

/**
 * Convert any error to an AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, { originalStack: error.stack });
  }

  return new InternalError('An unknown error occurred', { error: String(error) });
}

/**
 * Create a JSON response for an error
 */
export function errorResponse(error: AppError): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    }),
    {
      status: error.statusCode,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = toAppError(error);
      if (context) {
        (appError as any).details = { ...((appError as any).details || {}), context };
      }
      throw appError;
    }
  }) as T;
}

/**
 * Log error with appropriate level based on whether it's operational
 */
export function logError(error: unknown, context?: string): void {
  const appError = toAppError(error);

  if (appError.isOperational) {
    console.warn(`[${context || 'Error'}] ${appError.code}: ${appError.message}`, appError.details);
  } else {
    console.error(`[${context || 'Error'}] ${appError.code}: ${appError.message}`, appError.stack, appError.details);
  }
}
