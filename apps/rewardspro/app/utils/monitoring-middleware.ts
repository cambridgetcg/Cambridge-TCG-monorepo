import type { LoaderFunction, ActionFunction } from '@remix-run/node';
import { Logger, CorrelationId } from '~/services/logger.service';
import { DatadogService } from '~/services/monitoring/datadog.service';
import * as Sentry from '@sentry/remix';

/**
 * Wrap a loader function with monitoring capabilities
 */
export function withMonitoring<T extends LoaderFunction | ActionFunction>(
  handler: T,
  options: {
    name?: string;
    resource?: string;
    tags?: Record<string, any>;
  } = {}
): T {
  return (async (args) => {
    const request = args.request;
    const correlationId = CorrelationId.fromRequest(request);
    const startTime = Date.now();
    const url = new URL(request.url);

    // Start Datadog trace
    return DatadogService.trace(
      options.name || `remix.${request.method.toLowerCase()}`,
      {
        resource: options.resource || url.pathname,
        tags: {
          'http.method': request.method,
          'http.url': url.pathname,
          'correlation_id': correlationId,
          ...options.tags,
        },
      },
      async (span) => {
        // Add to Sentry scope
        Sentry.configureScope((scope) => {
          scope.setTag('correlation_id', correlationId);
          scope.setContext('trace', {
            traceId: span.context().toTraceId(),
            spanId: span.context().toSpanId(),
          });
        });

        try {
          // Run handler with correlation ID context
          const response = await CorrelationId.run(correlationId, () => handler(args));

          // Log successful completion
          const duration = Date.now() - startTime;
          Logger.performance.apiLatency(
            url.pathname,
            request.method,
            duration,
            response.status || 200
          );

          // Add correlation ID to response
          if (response instanceof Response) {
            CorrelationId.attachToResponse(response, correlationId);
            span.setTag('http.status_code', response.status);
          }

          return response;
        } catch (error) {
          const duration = Date.now() - startTime;

          // Mark span as error
          span.setTag('error', true);
          span.setTag('error.message', (error as Error).message);

          // Log error
          Logger.error('Request handler failed', error as Error, {
            method: request.method,
            path: url.pathname,
            duration,
          });

          // Track error metric
          DatadogService.metrics.increment('errors.request_handler', 1, [
            `path:${url.pathname}`,
            `method:${request.method}`,
          ]);

          throw error;
        }
      }
    );
  }) as T;
}

/**
 * Wrap Aurora Data API calls with monitoring
 */
export async function withDatabaseMonitoring<T>(
  operation: string,
  query: string,
  fn: () => Promise<T>
): Promise<T> {
  return DatadogService.traceAuroraQuery(operation, query, fn);
}

/**
 * Wrap Shopify API calls with monitoring
 */
export async function withShopifyMonitoring<T>(
  endpoint: string,
  method: string,
  fn: () => Promise<T>
): Promise<T> {
  return DatadogService.traceShopifyCall(endpoint, method, fn);
}

/**
 * Wrap webhook handlers with monitoring
 */
export function withWebhookMonitoring<T extends ActionFunction>(
  handler: T,
  topic: string
): T {
  return (async (args) => {
    const request = args.request;
    const startTime = Date.now();
    const webhookId = request.headers.get('x-shopify-webhook-id') || 'unknown';
    const shop = request.headers.get('x-shopify-shop-domain') || 'unknown';
    const correlationId = CorrelationId.fromRequest(request);

    // Log webhook receipt
    Logger.webhook.received(topic, shop, webhookId);

    // Start trace
    return DatadogService.trace(
      'webhook.process',
      {
        resource: topic,
        tags: {
          'webhook.topic': topic,
          'webhook.shop': shop,
          'webhook.id': webhookId,
          'correlation_id': correlationId,
        },
      },
      async (span) => {
        try {
          // Run handler with correlation ID
          const response = await CorrelationId.run(correlationId, () => handler(args));

          // Log successful processing
          const duration = Date.now() - startTime;
          Logger.webhook.processed(topic, shop, webhookId, duration);

          return response;
        } catch (error) {
          const duration = Date.now() - startTime;

          // Mark span as error
          span.setTag('error', true);
          span.setTag('error.message', (error as Error).message);

          // Log failed processing
          Logger.webhook.failed(topic, shop, webhookId, error as Error, duration);

          throw error;
        }
      }
    );
  }) as T;
}

/**
 * Track custom business operations
 */
export async function withBusinessOperation<T>(
  operation: string,
  data: Record<string, any>,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  return DatadogService.trace(
    'business.operation',
    {
      resource: operation,
      tags: {
        'business.operation': operation,
        ...data,
      },
    },
    async (span) => {
      try {
        Logger.info(`Starting business operation: ${operation}`, data);

        const result = await fn();

        const duration = Date.now() - startTime;
        Logger.info(`Completed business operation: ${operation}`, {
          ...data,
          duration,
        });

        // Track metric
        DatadogService.metrics.timing(`business.${operation}`, duration);

        return result;
      } catch (error) {
        span.setTag('error', true);
        span.setTag('error.message', (error as Error).message);

        Logger.error(`Business operation failed: ${operation}`, error as Error, data);

        // Track failure metric
        DatadogService.metrics.increment(`business.${operation}.failures`);

        throw error;
      }
    }
  );
}

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private startTime: number;
  private marks: Map<string, number> = new Map();

  constructor(private name: string) {
    this.startTime = Date.now();
  }

  mark(label: string) {
    const now = Date.now();
    const duration = now - this.startTime;
    this.marks.set(label, duration);

    Logger.debug(`Performance mark: ${this.name}.${label}`, {
      mark: label,
      duration,
    });

    return duration;
  }

  end(label = 'total') {
    const duration = this.mark(label);

    // Report all marks as metrics
    for (const [markLabel, markDuration] of this.marks) {
      DatadogService.metrics.timing(
        `performance.${this.name}.${markLabel}`,
        markDuration
      );
    }

    return duration;
  }

  getMarks() {
    return Object.fromEntries(this.marks);
  }
}

/**
 * Rate limiting tracker
 */
export class RateLimitTracker {
  private static shopifyAPICallsRemaining: number | null = null;

  static updateFromShopifyHeaders(headers: Headers) {
    const limitHeader = headers.get('x-shopify-shop-api-call-limit');
    if (!limitHeader) return;

    // Parse format: "current/max" e.g., "32/40"
    const [current, max] = limitHeader.split('/').map(Number);
    this.shopifyAPICallsRemaining = max - current;

    // Track metric
    DatadogService.metrics.gauge('shopify.api_calls_remaining', this.shopifyAPICallsRemaining);

    // Log warning if approaching limit
    const percentUsed = (current / max) * 100;
    if (percentUsed > 80) {
      Logger.warn('Approaching Shopify API rate limit', {
        current,
        max,
        remaining: this.shopifyAPICallsRemaining,
        percentUsed,
      });
    }

    if (percentUsed > 95) {
      // Critical - might start getting 429s soon
      Logger.error('Critical: Near Shopify API rate limit', new Error('Rate limit warning'), {
        current,
        max,
        remaining: this.shopifyAPICallsRemaining,
        percentUsed,
        critical: true,
      });
    }
  }

  static get remaining() {
    return this.shopifyAPICallsRemaining;
  }
}