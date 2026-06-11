/**
 * Structured Logger Service
 *
 * Provides consistent, structured logging across the application.
 * In production: JSON format for log aggregation (CloudWatch, Datadog, etc.)
 * In development: Human-readable format
 *
 * Part of Crystal Polishing Plan - Phase 2.1
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  shop?: string;
  customerId?: string;
  orderId?: string;
  traceId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  prefix: string;
  message: string;
  data?: unknown;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  [key: string]: unknown;
}

class Logger {
  private prefix: string;
  private context: LogContext;

  constructor(prefix: string, context: LogContext = {}) {
    this.prefix = prefix;
    this.context = context;
  }

  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const entry: LogEntry = {
      timestamp,
      level,
      prefix: this.prefix,
      message,
      ...(this.context as Record<string, unknown>),
      ...(data !== undefined ? { data } : {})
    };

    // Structured JSON in production, pretty in dev
    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(entry);
    }

    // Development: human-readable format
    const contextStr = Object.keys(this.context).length > 0
      ? ` ${JSON.stringify(this.context)}`
      : '';
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.prefix}]${contextStr} ${message}${dataStr}`;
  }

  private formatError(level: LogLevel, message: string, error?: Error | unknown): string {
    const timestamp = new Date().toISOString();

    // Handle different error types
    let errorDetails: { message: string; stack?: string; code?: string; status?: number } | undefined;

    if (error instanceof Error) {
      errorDetails = {
        message: error.message,
        stack: error.stack,
        code: (error as { code?: string }).code
      };
    } else if (error instanceof Response) {
      // Handle Response objects (e.g., from Shopify auth failures)
      errorDetails = {
        message: `HTTP ${error.status} ${error.statusText || 'Response'}`,
        status: error.status
      };
    } else if (error) {
      errorDetails = { message: String(error) };
    }

    const entry: LogEntry = {
      timestamp,
      level,
      prefix: this.prefix,
      message,
      ...this.context,
      ...(errorDetails && { error: errorDetails })
    };

    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(entry);
    }

    const contextStr = Object.keys(this.context).length > 0
      ? ` ${JSON.stringify(this.context)}`
      : '';
    let errorStr = '';
    if (error instanceof Error) {
      errorStr = ` Error: ${error.message}`;
    } else if (error instanceof Response) {
      errorStr = ` Error: HTTP ${error.status} ${error.statusText || 'Response'}`;
    } else if (error) {
      errorStr = ` Error: ${String(error)}`;
    }
    return `[${timestamp}] [${level.toUpperCase()}] [${this.prefix}]${contextStr} ${message}${errorStr}`;
  }

  debug(message: string, data?: unknown): void {
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production') {
      console.log(this.format('debug', message, data));
    }
  }

  info(message: string, data?: unknown): void {
    console.log(this.format('info', message, data));
  }

  warn(message: string, data?: unknown): void {
    console.warn(this.format('warn', message, data));
  }

  error(message: string, error?: Error | unknown): void {
    console.error(this.formatError('error', message, error));
  }

  /**
   * Create a child logger with additional context
   * Useful for adding request-specific data like shop, customerId, orderId
   */
  withContext(additionalContext: LogContext): Logger {
    return new Logger(this.prefix, { ...this.context, ...additionalContext });
  }

  /**
   * Log a GDPR compliance action (always logged, never suppressed)
   * These logs are critical for audit trails
   */
  gdpr(action: string, data: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      prefix: 'GDPR',
      action,
      ...this.context,
      ...data
    };
    // Always log GDPR actions as JSON for compliance audit
    console.log(JSON.stringify(entry));
  }
}

/**
 * Create a new logger instance with the specified prefix
 *
 * @param prefix - The service/component name for log identification
 * @param context - Optional initial context (shop, customerId, etc.)
 * @returns A Logger instance
 *
 * @example
 * ```ts
 * const logger = createLogger('TierCalculation');
 * logger.info('Processing tier upgrade', { customerId: '123' });
 *
 * // With context
 * const orderLogger = createLogger('OrderSync', { shop: 'myshop.myshopify.com' });
 * orderLogger.info('Syncing order', { orderId: '456' });
 * ```
 */
export function createLogger(prefix: string, context?: LogContext): Logger {
  return new Logger(prefix, context);
}

// Pre-configured loggers for common use cases
export const webhookLogger = createLogger('Webhook');
export const cronLogger = createLogger('Cron');
export const billingLogger = createLogger('Billing');
export const tierLogger = createLogger('Tier');
export const syncLogger = createLogger('Sync');
export const gdprLogger = createLogger('GDPR');
