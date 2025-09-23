import tracer from 'dd-trace';
import { StatsD } from 'hot-shots';
import type { Span } from 'dd-trace';

// Initialize Datadog APM tracer
export function initDatadog() {
  if (process.env.NODE_ENV === 'production' || process.env.DD_TRACE_ENABLED === 'true') {
    tracer.init({
      service: process.env.DD_SERVICE || 'rewardspro',
      env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
      version: process.env.DD_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',

      // Serverless optimizations
      logInjection: true, // Inject trace IDs into logs
      runtimeMetrics: true, // Collect runtime metrics
      profiling: false, // Disable profiling in serverless (overhead)

      // Sampling configuration
      sampleRate: process.env.DD_TRACE_SAMPLE_RATE
        ? parseFloat(process.env.DD_TRACE_SAMPLE_RATE)
        : 0.2, // Sample 20% of traces in production

      // Tags for all traces
      tags: {
        'deployment.environment': process.env.VERCEL_ENV || 'local',
        'vercel.region': process.env.VERCEL_REGION || 'unknown',
        'vercel.git.commit': process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      },

      // Plugins configuration
      plugins: true, // Enable automatic instrumentation
    });

    // Additional plugin configuration
    tracer.use('http', {
      service: 'rewardspro-http',
      validateStatus: (code: number) => code < 500, // Only mark 5xx as errors
      headers: ['x-correlation-id', 'x-shopify-shop-domain'], // Capture these headers
    });

    // Instrument AWS SDK for Aurora Data API
    tracer.use('aws-sdk', {
      service: 'rewardspro-aws',
      splitByAwsService: true, // Split services (RDS, Secrets Manager)
    });
  }
}

// Initialize StatsD client for custom metrics
const statsd = new StatsD({
  host: process.env.DD_AGENT_HOST || 'localhost',
  port: 8125,
  prefix: 'rewardspro.',
  globalTags: {
    env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
    service: 'rewardspro',
    version: process.env.DD_VERSION || 'unknown',
  },
  errorHandler: (error) => {
    console.error('StatsD error:', error);
  },
});

// Datadog service wrapper
export class DatadogService {
  // Trace a custom operation
  static trace<T>(
    name: string,
    options: { resource?: string; tags?: Record<string, any> } = {},
    fn: (span: Span) => T | Promise<T>
  ): T | Promise<T> {
    return tracer.trace(name, options, fn);
  }

  // Get current trace and span IDs for correlation
  static getTraceContext(): { traceId?: string; spanId?: string } {
    const span = tracer.scope().active();
    if (!span) return {};

    const context = span.context();
    return {
      traceId: context.toTraceId(),
      spanId: context.toSpanId(),
    };
  }

  // Track custom business metrics
  static metrics = {
    // Increment a counter
    increment(metric: string, value = 1, tags?: string[]) {
      statsd.increment(metric, value, tags);
    },

    // Record a gauge value
    gauge(metric: string, value: number, tags?: string[]) {
      statsd.gauge(metric, value, tags);
    },

    // Record a histogram value (for distributions)
    histogram(metric: string, value: number, tags?: string[]) {
      statsd.histogram(metric, value, tags);
    },

    // Record timing in milliseconds
    timing(metric: string, duration: number, tags?: string[]) {
      statsd.timing(metric, duration, tags);
    },

    // Cashback-specific metrics
    trackCashback(amount: number, currency: string, tierId: string) {
      this.increment('loyalty.cashback.earned');
      this.histogram('loyalty.cashback.amount', amount, [
        `currency:${currency}`,
        `tier:${tierId}`,
      ]);
      this.gauge('loyalty.cashback.daily_total', amount, [`currency:${currency}`]);
    },

    // Tier change metrics
    trackTierChange(fromTier: string, toTier: string, customerId: string) {
      this.increment('loyalty.tier.change', 1, [
        `from_tier:${fromTier}`,
        `to_tier:${toTier}`,
      ]);

      // Track active customers per tier
      this.increment(`loyalty.tier.active.${toTier}`);
      if (fromTier !== 'none') {
        this.increment(`loyalty.tier.active.${fromTier}`, -1);
      }
    },

    // Webhook metrics
    trackWebhook(topic: string, success: boolean, duration: number) {
      const status = success ? 'success' : 'failure';
      this.increment('webhook.processed', 1, [
        `topic:${topic}`,
        `status:${status}`,
      ]);
      this.timing('webhook.processing_time', duration, [`topic:${topic}`]);

      if (!success) {
        this.increment('webhook.failed', 1, [`topic:${topic}`]);
      }
    },

    // API latency metrics
    trackAPILatency(endpoint: string, method: string, duration: number, statusCode: number) {
      this.timing('api.latency', duration, [
        `endpoint:${endpoint}`,
        `method:${method}`,
        `status:${statusCode}`,
      ]);

      // Track error rates
      if (statusCode >= 500) {
        this.increment('api.errors.5xx', 1, [`endpoint:${endpoint}`]);
      } else if (statusCode >= 400) {
        this.increment('api.errors.4xx', 1, [`endpoint:${endpoint}`]);
      }
    },

    // Database query metrics
    trackDatabaseQuery(operation: string, table: string, duration: number, error?: boolean) {
      this.timing('database.query_time', duration, [
        `operation:${operation}`,
        `table:${table}`,
        `error:${error || false}`,
      ]);

      if (duration > 100) { // Slow query threshold
        this.increment('database.slow_queries', 1, [
          `operation:${operation}`,
          `table:${table}`,
        ]);
      }

      if (error) {
        this.increment('database.errors', 1, [
          `operation:${operation}`,
          `table:${table}`,
        ]);
      }
    },

    // Subscription metrics
    trackSubscription(event: 'created' | 'renewed' | 'cancelled' | 'failed', mrr?: number) {
      this.increment(`subscription.${event}`);

      if (mrr !== undefined) {
        this.gauge('subscription.mrr', mrr);
      }
    },

    // External API metrics (Shopify, Exchange Rate, etc.)
    trackExternalAPI(service: string, endpoint: string, duration: number, success: boolean) {
      this.timing(`external_api.latency`, duration, [
        `service:${service}`,
        `endpoint:${endpoint}`,
        `success:${success}`,
      ]);

      if (!success) {
        this.increment('external_api.errors', 1, [
          `service:${service}`,
          `endpoint:${endpoint}`,
        ]);
      }
    },

    // Store credit ledger consistency check
    trackLedgerConsistency(discrepancyCount: number) {
      this.gauge('loyalty.ledger.discrepancies', discrepancyCount);

      if (discrepancyCount > 0) {
        this.increment('loyalty.ledger.inconsistency_detected', discrepancyCount);
      }
    },
  };

  // Wrapper for Aurora Data API calls with tracing
  static async traceAuroraQuery<T>(
    operation: string,
    query: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let error = false;

    return this.trace(
      'aurora.query',
      {
        resource: operation,
        tags: {
          'db.type': 'aurora',
          'db.operation': operation,
          'db.statement': query.substring(0, 100), // Truncate for safety
        },
      },
      async (span) => {
        try {
          const result = await fn();
          return result;
        } catch (err) {
          error = true;
          span.setTag('error', true);
          span.setTag('error.message', (err as Error).message);
          throw err;
        } finally {
          const duration = Date.now() - startTime;
          const table = extractTableName(query);
          this.metrics.trackDatabaseQuery(operation, table, duration, error);
        }
      }
    );
  }

  // Wrapper for Shopify API calls with tracing
  static async traceShopifyCall<T>(
    endpoint: string,
    method: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;

    return this.trace(
      'shopify.api_call',
      {
        resource: `${method} ${endpoint}`,
        tags: {
          'shopify.endpoint': endpoint,
          'shopify.method': method,
        },
      },
      async (span) => {
        try {
          const result = await fn();
          return result;
        } catch (err) {
          success = false;
          span.setTag('error', true);
          span.setTag('error.message', (err as Error).message);

          // Check for rate limiting
          if ((err as any).statusCode === 429) {
            span.setTag('shopify.rate_limited', true);
            this.metrics.increment('shopify.rate_limit_hit');
          }

          throw err;
        } finally {
          const duration = Date.now() - startTime;
          this.metrics.trackExternalAPI('shopify', endpoint, duration, success);
        }
      }
    );
  }

  // Close connections on shutdown
  static async shutdown() {
    await new Promise<void>((resolve) => {
      statsd.close((error) => {
        if (error) console.error('Error closing StatsD:', error);
        resolve();
      });
    });
  }
}

// Helper to extract table name from SQL
function extractTableName(query: string): string {
  const patterns = [
    /FROM\s+["']?(\w+)["']?/i,
    /UPDATE\s+["']?(\w+)["']?/i,
    /INSERT\s+INTO\s+["']?(\w+)["']?/i,
    /DELETE\s+FROM\s+["']?(\w+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) return match[1];
  }

  return 'unknown';
}

// Initialize on import
initDatadog();