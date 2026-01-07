/**
 * Subscription Correlation & Tracing System
 *
 * Provides correlation IDs for tracing subscription operations through the neural network.
 * Enables debugging by linking all operations from a single webhook/request.
 *
 * Part of Neural Network Optimization - Debugging Infrastructure
 */

import { createLogger } from '~/services/logger.server';
import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// CORRELATION CONTEXT
// ============================================================================

export interface CorrelationContext {
  correlationId: string;
  shop: string;
  operation: string;
  contractId?: string;
  customerId?: string;
  subscriptionId?: string;
  webhookTopic?: string;
  startTime: number;
  queryCount: number;
  metadata: Record<string, unknown>;
}

// AsyncLocalStorage for automatic context propagation
const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

// ============================================================================
// CORRELATION ID GENERATION
// ============================================================================

/**
 * Generate a unique correlation ID
 * Format: sub_<timestamp>_<random>
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sub_${timestamp}_${random}`;
}

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================

/**
 * Get current correlation context (if any)
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

/**
 * Get current correlation ID (or generate new one)
 */
export function getCorrelationId(): string {
  return getCorrelationContext()?.correlationId || generateCorrelationId();
}

/**
 * Run a function with correlation context
 * All nested calls will have access to the same context
 */
export async function withCorrelation<T>(
  context: Omit<CorrelationContext, 'startTime' | 'queryCount' | 'metadata'> & {
    metadata?: Record<string, unknown>;
  },
  fn: () => Promise<T>
): Promise<T> {
  const fullContext: CorrelationContext = {
    ...context,
    startTime: Date.now(),
    queryCount: 0,
    metadata: context.metadata || {},
  };

  return correlationStorage.run(fullContext, fn);
}

/**
 * Increment query count in current context
 */
export function incrementQueryCount(): void {
  const ctx = getCorrelationContext();
  if (ctx) {
    ctx.queryCount++;
  }
}

/**
 * Add metadata to current context
 */
export function addCorrelationMetadata(key: string, value: unknown): void {
  const ctx = getCorrelationContext();
  if (ctx) {
    ctx.metadata[key] = value;
  }
}

/**
 * Get elapsed time in current context
 */
export function getElapsedMs(): number {
  const ctx = getCorrelationContext();
  return ctx ? Date.now() - ctx.startTime : 0;
}

// ============================================================================
// SUBSCRIPTION LOGGER (Enhanced with Correlation)
// ============================================================================

export interface SubscriptionLogEntry {
  timestamp: string;
  correlationId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  operation: string;
  message: string;
  shop?: string;
  contractId?: string;
  customerId?: string;
  subscriptionId?: string;
  durationMs?: number;
  queryCount?: number;
  data?: unknown;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

class SubscriptionLogger {
  private baseLogger = createLogger('Subscription');

  private buildEntry(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: unknown
  ): SubscriptionLogEntry {
    const ctx = getCorrelationContext();

    return {
      timestamp: new Date().toISOString(),
      correlationId: ctx?.correlationId || 'no-correlation',
      level,
      operation: ctx?.operation || 'unknown',
      message,
      shop: ctx?.shop,
      contractId: ctx?.contractId,
      customerId: ctx?.customerId,
      subscriptionId: ctx?.subscriptionId,
      durationMs: ctx ? Date.now() - ctx.startTime : undefined,
      queryCount: ctx?.queryCount,
      data,
    };
  }

  private format(entry: SubscriptionLogEntry): string {
    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(entry);
    }

    // Development: human-readable
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      `[${entry.correlationId}]`,
      `[${entry.operation}]`,
    ];

    if (entry.shop) parts.push(`[shop:${entry.shop.split('.')[0]}]`);
    if (entry.durationMs !== undefined) parts.push(`[${entry.durationMs}ms]`);
    if (entry.queryCount !== undefined) parts.push(`[q:${entry.queryCount}]`);

    parts.push(entry.message);

    if (entry.data) {
      parts.push(JSON.stringify(entry.data));
    }

    return parts.join(' ');
  }

  debug(message: string, data?: unknown): void {
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production') {
      const entry = this.buildEntry('debug', message, data);
      console.log(this.format(entry));
    }
  }

  info(message: string, data?: unknown): void {
    const entry = this.buildEntry('info', message, data);
    console.log(this.format(entry));
  }

  warn(message: string, data?: unknown): void {
    const entry = this.buildEntry('warn', message, data);
    console.warn(this.format(entry));
  }

  error(message: string, error?: Error | unknown): void {
    const entry = this.buildEntry('error', message);

    if (error instanceof Error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as { code?: string }).code,
      };
    } else if (error) {
      entry.error = { message: String(error) };
    }

    if (process.env.NODE_ENV === 'production') {
      console.error(JSON.stringify(entry));
    } else {
      console.error(this.format(entry), error instanceof Error ? `\n${error.stack}` : '');
    }
  }

  /**
   * Log operation start
   */
  operationStart(operationName: string, data?: unknown): void {
    this.info(`Starting ${operationName}`, data);
  }

  /**
   * Log operation complete with timing
   */
  operationComplete(operationName: string, result?: unknown): void {
    const ctx = getCorrelationContext();
    this.info(`Completed ${operationName}`, {
      durationMs: ctx ? Date.now() - ctx.startTime : undefined,
      queryCount: ctx?.queryCount,
      result,
    });
  }

  /**
   * Log state transition
   */
  stateTransition(fromStatus: string, toStatus: string, reason?: string): void {
    this.info('State transition', {
      from: fromStatus,
      to: toStatus,
      reason,
    });
  }

  /**
   * Log Shopify API call
   */
  shopifyCall(mutation: string, success: boolean, details?: unknown): void {
    incrementQueryCount();
    if (success) {
      this.debug(`Shopify ${mutation} succeeded`, details);
    } else {
      this.warn(`Shopify ${mutation} failed`, details);
    }
  }

  /**
   * Log database query
   */
  dbQuery(operation: string, table: string, details?: unknown): void {
    incrementQueryCount();
    this.debug(`DB ${operation} on ${table}`, details);
  }

  /**
   * Log tier resolution
   */
  tierResolution(result: { changed: boolean; source: string; tierId?: string | null }): void {
    this.info('Tier resolved', result);
  }

  /**
   * Log idempotency check
   */
  idempotencyCheck(key: string, exists: boolean): void {
    if (exists) {
      this.info('Idempotent request - already processed', { key });
    } else {
      this.debug('Idempotency check passed', { key });
    }
  }
}

// Singleton logger instance
export const subscriptionLogger = new SubscriptionLogger();

// ============================================================================
// DIAGNOSTIC HELPERS
// ============================================================================

/**
 * Create a diagnostic summary for the current operation
 */
export function getDiagnosticSummary(): {
  correlationId: string;
  operation: string;
  durationMs: number;
  queryCount: number;
  shop?: string;
  contractId?: string;
  metadata: Record<string, unknown>;
} {
  const ctx = getCorrelationContext();

  return {
    correlationId: ctx?.correlationId || 'no-correlation',
    operation: ctx?.operation || 'unknown',
    durationMs: ctx ? Date.now() - ctx.startTime : 0,
    queryCount: ctx?.queryCount || 0,
    shop: ctx?.shop,
    contractId: ctx?.contractId,
    metadata: ctx?.metadata || {},
  };
}

/**
 * Wrap a webhook handler with correlation context
 */
export function withWebhookCorrelation<T>(
  shop: string,
  topic: string,
  contractId: string | undefined,
  handler: () => Promise<T>
): Promise<T> {
  return withCorrelation(
    {
      correlationId: generateCorrelationId(),
      shop,
      operation: `webhook:${topic}`,
      contractId,
      webhookTopic: topic,
    },
    handler
  );
}

/**
 * Wrap an API handler with correlation context
 */
export function withApiCorrelation<T>(
  shop: string,
  operation: string,
  handler: () => Promise<T>
): Promise<T> {
  return withCorrelation(
    {
      correlationId: generateCorrelationId(),
      shop,
      operation: `api:${operation}`,
    },
    handler
  );
}
