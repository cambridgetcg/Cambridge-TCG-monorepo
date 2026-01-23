/**
 * Better Stack (Logtail) Service
 *
 * Provides centralized log aggregation and structured logging.
 * Better Stack excels at log management and uptime monitoring.
 *
 * NOTE: This complements (not replaces) Datadog APM.
 * - Better Stack: Logs, uptime monitoring, basic metrics visualization
 * - Datadog: APM, distributed tracing, deep performance insights
 * - Sentry: Error tracking with stack traces
 *
 * Pricing comparison (as of 2025):
 * - Better Stack: $0.45/GB ingestion, 3GB free, 10 free monitors
 * - Datadog Logs: $0.10/GB (but requires infrastructure plan)
 *
 * @see https://betterstack.com/docs/logs/javascript/
 */

import { Logtail } from '@logtail/node';

// Initialize Logtail client (lazy initialization for serverless)
let logtailInstance: Logtail | null = null;

function getLogtail(): Logtail | null {
  if (logtailInstance) return logtailInstance;

  const sourceToken = process.env.BETTERSTACK_SOURCE_TOKEN?.trim();
  if (!sourceToken) {
    // Silent fail in development - Better Stack is optional
    if (process.env.NODE_ENV === 'production') {
      console.warn('[BetterStack] BETTERSTACK_SOURCE_TOKEN not set, logs will not be sent');
    }
    return null;
  }

  try {
    logtailInstance = new Logtail(sourceToken, {
      // Custom endpoint if using EU region
      endpoint: process.env.BETTERSTACK_ENDPOINT || 'https://in.logs.betterstack.com',
      // Batch settings for serverless
      batchSize: 10,
      batchInterval: 1000, // 1 second
      // Retry settings
      retryCount: 3,
      retryBackoff: 100,
      // Prevent throwing on send failures (graceful degradation)
      throwExceptions: false,
    });
  } catch (error) {
    console.error('[BetterStack] Failed to initialize Logtail client:', error);
    return null;
  }

  return logtailInstance;
}

/**
 * Initialize Better Stack logging
 * Call this in entry.server.tsx
 *
 * @returns true if initialized successfully, false if skipped or failed
 */
export function initBetterStack(): boolean {
  try {
    const logtail = getLogtail();
    if (!logtail) return false;

    // Add default context to all logs
    logtail.use(async (log) => ({
      ...log,
      service: 'rewardspro',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      region: process.env.VERCEL_REGION || 'unknown',
      deployment: process.env.VERCEL_ENV || 'local',
    }));

    console.log('[BetterStack] Logging initialized');
    return true;
  } catch (error) {
    // Graceful degradation - logging should never break the app
    console.error('[BetterStack] Failed to initialize logging:', error);
    return false;
  }
}

/**
 * Better Stack Service
 *
 * Mirrors the DatadogService interface where applicable,
 * but focused on log aggregation rather than APM.
 */
export class BetterStackService {
  /**
   * Log levels with structured data
   */
  static debug(message: string, context?: Record<string, unknown>): void {
    const logtail = getLogtail();
    if (logtail) {
      logtail.debug(message, context);
    }
    // Also log to console for local visibility
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${message}`, context);
    }
  }

  static info(message: string, context?: Record<string, unknown>): void {
    const logtail = getLogtail();
    if (logtail) {
      logtail.info(message, context);
    }
  }

  static warn(message: string, context?: Record<string, unknown>): void {
    const logtail = getLogtail();
    if (logtail) {
      logtail.warn(message, context);
    }
  }

  static error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const logtail = getLogtail();
    if (logtail) {
      const errorContext = error instanceof Error
        ? {
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
            ...context,
          }
        : { error, ...context };

      logtail.error(message, errorContext);
    }
  }

  /**
   * Business event logging
   * These structured logs can be queried in Better Stack for metrics/alerts
   */
  static events = {
    // Loyalty events
    cashbackEarned(data: {
      shop: string;
      customerId: string;
      amount: number;
      currency: string;
      tierId: string;
      orderId: string;
    }): void {
      BetterStackService.info('loyalty.cashback.earned', {
        event: 'cashback_earned',
        ...data,
      });
    },

    tierChange(data: {
      shop: string;
      customerId: string;
      fromTier: string;
      toTier: string;
      reason: 'spending' | 'purchase' | 'subscription' | 'manual' | 'expiry';
    }): void {
      BetterStackService.info('loyalty.tier.changed', {
        event: 'tier_changed',
        ...data,
      });
    },

    tierPurchase(data: {
      shop: string;
      customerId: string;
      tierId: string;
      tierName: string;
      amount: number;
      currency: string;
      orderId: string;
      duration: string;
    }): void {
      BetterStackService.info('loyalty.tier.purchased', {
        event: 'tier_purchased',
        ...data,
      });
    },

    // Webhook events
    webhookProcessed(data: {
      shop: string;
      topic: string;
      orderId?: string;
      success: boolean;
      durationMs: number;
      error?: string;
    }): void {
      const level = data.success ? 'info' : 'error';
      const logtail = getLogtail();
      if (logtail) {
        logtail[level]('webhook.processed', {
          event: 'webhook_processed',
          ...data,
        });
      }
    },

    // API events
    apiRequest(data: {
      method: string;
      path: string;
      statusCode: number;
      durationMs: number;
      shop?: string;
      error?: string;
    }): void {
      const isError = data.statusCode >= 500;
      const level = isError ? 'error' : data.statusCode >= 400 ? 'warn' : 'info';
      const logtail = getLogtail();
      if (logtail) {
        logtail[level]('api.request', {
          event: 'api_request',
          ...data,
        });
      }
    },

    // Database events
    slowQuery(data: {
      operation: string;
      table: string;
      durationMs: number;
      query?: string;
    }): void {
      BetterStackService.warn('database.slow_query', {
        event: 'slow_query',
        ...data,
        // Truncate query for safety
        query: data.query?.substring(0, 200),
      });
    },

    // Subscription events
    subscriptionEvent(data: {
      shop: string;
      customerId: string;
      subscriptionId: string;
      event: 'created' | 'renewed' | 'cancelled' | 'failed';
      amount?: number;
      currency?: string;
      error?: string;
    }): void {
      const level = data.event === 'failed' ? 'error' : 'info';
      const logtail = getLogtail();
      if (logtail) {
        logtail[level]('subscription.event', {
          event: `subscription_${data.event}`,
          ...data,
        });
      }
    },

    // Cron job events
    cronJobStarted(data: {
      jobName: string;
      correlationId: string;
    }): void {
      BetterStackService.info('cron.job.started', {
        event: 'cron_job_started',
        ...data,
      });
    },

    cronJobCompleted(data: {
      jobName: string;
      correlationId: string;
      durationMs: number;
      itemsProcessed?: number;
      success: boolean;
      error?: string;
    }): void {
      const level = data.success ? 'info' : 'error';
      const logtail = getLogtail();
      if (logtail) {
        logtail[level]('cron.job.completed', {
          event: 'cron_job_completed',
          ...data,
        });
      }
    },

    // Security events
    securityEvent(data: {
      type: 'hmac_failure' | 'rate_limit' | 'auth_failure' | 'suspicious_activity';
      shop?: string;
      ip?: string;
      userAgent?: string;
      details?: string;
    }): void {
      BetterStackService.warn('security.event', {
        event: `security_${data.type}`,
        ...data,
      });
    },
  };

  /**
   * Flush pending logs
   *
   * Call this in critical paths before serverless function termination:
   * - End of webhook handlers
   * - End of cron job loaders
   * - After error logging in catch blocks
   *
   * @example
   * ```typescript
   * export async function action({ request }) {
   *   try {
   *     // ... webhook processing
   *   } finally {
   *     await BetterStackService.flush();
   *   }
   * }
   * ```
   */
  static async flush(): Promise<void> {
    try {
      const logtail = getLogtail();
      if (logtail) {
        await logtail.flush();
      }
    } catch (error) {
      // Silently fail - don't let logging break the app
      console.warn('[BetterStack] Flush failed:', error);
    }
  }

  /**
   * Flush and log with a timeout guard for serverless
   *
   * Use this when you need guaranteed flush within a time limit:
   * @param timeoutMs - Maximum time to wait for flush (default: 2000ms)
   */
  static async flushWithTimeout(timeoutMs = 2000): Promise<void> {
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('[BetterStack] Flush timeout reached');
        resolve();
      }, timeoutMs);
    });

    await Promise.race([this.flush(), timeoutPromise]);
  }

  /**
   * Shutdown the client
   * Call this on application shutdown (not typically needed in serverless)
   */
  static async shutdown(): Promise<void> {
    try {
      if (logtailInstance) {
        await logtailInstance.flush();
        logtailInstance = null;
      }
    } catch (error) {
      console.warn('[BetterStack] Shutdown error:', error);
      logtailInstance = null;
    }
  }
}

/**
 * Create a scoped logger for a specific component/service
 * Mirrors createLogger pattern from logger.server.ts
 */
export function createBetterStackLogger(
  prefix: string,
  defaultContext?: Record<string, unknown>
) {
  return {
    debug(message: string, context?: Record<string, unknown>) {
      BetterStackService.debug(`[${prefix}] ${message}`, { ...defaultContext, ...context });
    },
    info(message: string, context?: Record<string, unknown>) {
      BetterStackService.info(`[${prefix}] ${message}`, { ...defaultContext, ...context });
    },
    warn(message: string, context?: Record<string, unknown>) {
      BetterStackService.warn(`[${prefix}] ${message}`, { ...defaultContext, ...context });
    },
    error(message: string, error?: Error | unknown, context?: Record<string, unknown>) {
      BetterStackService.error(`[${prefix}] ${message}`, error, { ...defaultContext, ...context });
    },
    withContext(additionalContext: Record<string, unknown>) {
      return createBetterStackLogger(prefix, { ...defaultContext, ...additionalContext });
    },
  };
}

// Export singleton for direct use
export const betterStack = BetterStackService;
