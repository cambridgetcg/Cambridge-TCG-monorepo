import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'crypto';
import { DatadogService } from './monitoring/datadog.service';

// AsyncLocalStorage for correlation ID
const correlationStore = new AsyncLocalStorage<string>();

// Pino logger configuration
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  // JSON formatting for structured logging
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
    bindings: () => ({}), // Remove default bindings (pid, hostname)
  },

  // Add base fields to all logs
  base: {
    service: 'rewardspro',
    env: process.env.NODE_ENV || 'development',
    version: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
  },

  // Redact sensitive fields
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.authorization',
      '*.cookie',
      '*.apiKey',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.email', // Redact email for GDPR
      '*.creditCardNumber',
    ],
    remove: true,
  },

  // Pretty print in development
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),

  // Timestamp formatting
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Correlation ID management
export class CorrelationId {
  static generate(): string {
    return randomUUID();
  }

  static get(): string | undefined {
    return correlationStore.getStore();
  }

  static set(id: string): void {
    correlationStore.enterWith(id);
  }

  static async run<T>(id: string, fn: () => T | Promise<T>): Promise<T> {
    return correlationStore.run(id, fn);
  }

  static fromRequest(request: Request): string {
    const headerValue = request.headers.get('x-correlation-id');
    return headerValue || this.generate();
  }

  static attachToResponse(response: Response, id: string): void {
    response.headers.set('x-correlation-id', id);
  }
}

// Logger service wrapper
export class Logger {
  private static getContext() {
    const correlationId = CorrelationId.get();
    const traceContext = DatadogService.getTraceContext();

    return {
      correlationId,
      ...traceContext,
      timestamp: new Date().toISOString(),
    };
  }

  static info(message: string, data: Record<string, any> = {}) {
    logger.info({
      ...this.getContext(),
      ...data,
    }, message);
  }

  static error(message: string, error: Error | unknown, data: Record<string, any> = {}) {
    const errorObject = error instanceof Error
      ? {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        }
      : { error };

    logger.error({
      ...this.getContext(),
      ...errorObject,
      ...data,
    }, message);

    // Also send to Sentry if critical
    if (data.critical) {
      import('@sentry/remix').then((Sentry) => {
        Sentry.captureException(error, {
          tags: data,
          extra: { correlationId: CorrelationId.get() },
        });
      }).catch(() => {
        // Sentry import failed, continue
      });
    }
  }

  static warn(message: string, data: Record<string, any> = {}) {
    logger.warn({
      ...this.getContext(),
      ...data,
    }, message);
  }

  static debug(message: string, data: Record<string, any> = {}) {
    logger.debug({
      ...this.getContext(),
      ...data,
    }, message);
  }

  // Business event logging
  static business = {
    cashbackEarned(customerId: string, amount: number, currency: string, orderId: string) {
      Logger.info('Cashback credited to customer', {
        event: 'cashback_earned',
        customerId,
        amount,
        currency,
        orderId,
        category: 'business',
      });

      // Track metric
      DatadogService.metrics.trackCashback(amount, currency, 'unknown');
    },

    tierChanged(customerId: string, fromTier: string, toTier: string, reason: string) {
      Logger.info('Customer tier changed', {
        event: 'tier_changed',
        customerId,
        fromTier,
        toTier,
        reason,
        category: 'business',
      });

      // Track metric
      DatadogService.metrics.trackTierChange(fromTier, toTier, customerId);
    },

    subscriptionEvent(customerId: string, event: string, plan: string, mrr?: number) {
      Logger.info('Subscription event occurred', {
        event: `subscription_${event}`,
        customerId,
        plan,
        mrr,
        category: 'business',
      });

      // Track metric
      DatadogService.metrics.trackSubscription(
        event as 'created' | 'renewed' | 'cancelled' | 'failed',
        mrr
      );
    },

    paymentFailed(customerId: string, amount: number, reason: string) {
      Logger.warn('Payment failed', {
        event: 'payment_failed',
        customerId,
        amount,
        reason,
        category: 'business',
        alert: true, // Flag for alerting
      });
    },

    ledgerDiscrepancy(customerId: string, expected: number, actual: number) {
      Logger.error('Store credit ledger discrepancy detected', new Error('Ledger mismatch'), {
        event: 'ledger_discrepancy',
        customerId,
        expectedBalance: expected,
        actualBalance: actual,
        difference: Math.abs(expected - actual),
        category: 'business',
        critical: true, // Send to Sentry
      });

      // Track metric
      DatadogService.metrics.trackLedgerConsistency(1);
    },
  };

  // Security event logging
  static security = {
    hmacValidationFailed(shop: string, endpoint: string) {
      Logger.warn('HMAC validation failed', {
        event: 'hmac_validation_failed',
        shop,
        endpoint,
        category: 'security',
        alert: true,
      });
    },

    rateLimitExceeded(identifier: string, endpoint: string) {
      Logger.warn('Rate limit exceeded', {
        event: 'rate_limit_exceeded',
        identifier,
        endpoint,
        category: 'security',
      });
    },

    suspiciousActivity(description: string, details: Record<string, any>) {
      Logger.warn('Suspicious activity detected', {
        event: 'suspicious_activity',
        description,
        ...details,
        category: 'security',
        alert: true,
      });
    },

    authenticationFailed(username: string, reason: string) {
      Logger.info('Authentication failed', {
        event: 'auth_failed',
        username: username.substring(0, 3) + '***', // Partially redact
        reason,
        category: 'security',
      });
    },
  };

  // Performance logging
  static performance = {
    slowQuery(query: string, duration: number, table: string) {
      Logger.warn('Slow database query detected', {
        event: 'slow_query',
        query: query.substring(0, 200), // Truncate long queries
        duration,
        table,
        category: 'performance',
        alert: duration > 1000, // Alert if > 1 second
      });
    },

    apiLatency(endpoint: string, method: string, duration: number, statusCode: number) {
      const level = duration > 1000 ? 'warn' : 'debug';
      Logger[level]('API request completed', {
        event: 'api_request',
        endpoint,
        method,
        duration,
        statusCode,
        category: 'performance',
      });

      // Track metric
      DatadogService.metrics.trackAPILatency(endpoint, method, duration, statusCode);
    },

    externalAPICall(service: string, endpoint: string, duration: number, success: boolean) {
      Logger.debug('External API call completed', {
        event: 'external_api_call',
        service,
        endpoint,
        duration,
        success,
        category: 'performance',
      });

      // Track metric
      DatadogService.metrics.trackExternalAPI(service, endpoint, duration, success);
    },
  };

  // Webhook logging
  static webhook = {
    received(topic: string, shop: string, webhookId: string) {
      Logger.info('Webhook received', {
        event: 'webhook_received',
        topic,
        shop,
        webhookId,
        category: 'webhook',
      });
    },

    processed(topic: string, shop: string, webhookId: string, duration: number) {
      Logger.info('Webhook processed successfully', {
        event: 'webhook_processed',
        topic,
        shop,
        webhookId,
        duration,
        category: 'webhook',
      });

      // Track metric
      DatadogService.metrics.trackWebhook(topic, true, duration);
    },

    failed(topic: string, shop: string, webhookId: string, error: Error, duration: number) {
      Logger.error('Webhook processing failed', error, {
        event: 'webhook_failed',
        topic,
        shop,
        webhookId,
        duration,
        category: 'webhook',
        alert: true,
      });

      // Track metric
      DatadogService.metrics.trackWebhook(topic, false, duration);
    },

    duplicate(topic: string, shop: string, webhookId: string) {
      Logger.debug('Duplicate webhook ignored', {
        event: 'webhook_duplicate',
        topic,
        shop,
        webhookId,
        category: 'webhook',
      });
    },
  };

  // Request/Response logging middleware for Remix
  static async logRequest(
    request: Request,
    handler: () => Promise<Response>
  ): Promise<Response> {
    const correlationId = CorrelationId.fromRequest(request);
    const startTime = Date.now();
    const url = new URL(request.url);

    // Log request
    Logger.info('Request received', {
      method: request.method,
      path: url.pathname,
      query: url.search,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for'),
    });

    try {
      // Run handler with correlation ID context
      const response = await CorrelationId.run(correlationId, handler);

      // Log response
      const duration = Date.now() - startTime;
      Logger.info('Request completed', {
        method: request.method,
        path: url.pathname,
        statusCode: response.status,
        duration,
      });

      // Track API latency
      Logger.performance.apiLatency(
        url.pathname,
        request.method,
        duration,
        response.status
      );

      // Attach correlation ID to response
      CorrelationId.attachToResponse(response, correlationId);

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error('Request failed', error as Error, {
        method: request.method,
        path: url.pathname,
        duration,
      });
      throw error;
    }
  }

  // Helper to create child logger with additional context
  static child(bindings: Record<string, any>) {
    return {
      info: (message: string, data?: Record<string, any>) =>
        Logger.info(message, { ...bindings, ...data }),
      error: (message: string, error: Error | unknown, data?: Record<string, any>) =>
        Logger.error(message, error, { ...bindings, ...data }),
      warn: (message: string, data?: Record<string, any>) =>
        Logger.warn(message, { ...bindings, ...data }),
      debug: (message: string, data?: Record<string, any>) =>
        Logger.debug(message, { ...bindings, ...data }),
    };
  }
}