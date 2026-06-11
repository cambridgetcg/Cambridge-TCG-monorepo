/**
 * Shopify API Monitoring Wrapper
 *
 * Provides instrumentation for Shopify GraphQL API calls:
 * - Rate limit tracking and warnings
 * - Error capture with context
 * - Performance spans for tracing
 * - Automatic retry detection
 *
 * Usage:
 * ```typescript
 * const result = await monitoredGraphQL(admin, {
 *   shop: 'myshop.myshopify.com',
 *   operation: 'GetCustomer',
 *   query: `query GetCustomer($id: ID!) { customer(id: $id) { id } }`,
 *   variables: { id: 'gid://shopify/Customer/123' },
 * });
 * ```
 */

import { SentryService } from "~/services/monitoring/sentry.service";
import { createLogger } from "~/services/logger.server";

const logger = createLogger('ShopifyAPI');

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface GraphQLMonitorOptions {
  shop: string;
  operation: string;
  query: string;
  variables?: Record<string, unknown>;
  /** Parent Sentry transaction for nested spans */
  parentTransaction?: any;
  /** Whether this is a mutation (vs query) */
  isMutation?: boolean;
}

export interface GraphQLMonitorResult<T> {
  data: T | null;
  errors: Array<{ message: string; extensions?: Record<string, unknown> }> | null;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
  rateLimitInfo?: {
    remaining: number;
    maximum: number;
    restoreRate: number;
    percentUsed: number;
  };
  durationMs: number;
}

// ============================================
// RATE LIMIT TRACKING
// ============================================

interface RateLimitState {
  currentlyAvailable: number;
  maximumAvailable: number;
  restoreRate: number;
  lastUpdated: Date;
}

// Per-shop rate limit tracking (in-memory, resets on cold start)
const rateLimitCache = new Map<string, RateLimitState>();

/**
 * Update rate limit state from GraphQL response
 */
function updateRateLimitState(shop: string, extensions?: GraphQLMonitorResult<unknown>['extensions']): void {
  if (!extensions?.cost?.throttleStatus) return;

  const { maximumAvailable, currentlyAvailable, restoreRate } = extensions.cost.throttleStatus;

  rateLimitCache.set(shop, {
    currentlyAvailable,
    maximumAvailable,
    restoreRate,
    lastUpdated: new Date(),
  });

  // Warn if approaching rate limit
  const percentUsed = ((maximumAvailable - currentlyAvailable) / maximumAvailable) * 100;

  if (percentUsed >= 80) {
    logger.warn('Shopify API rate limit warning', {
      shop,
      percentUsed: percentUsed.toFixed(1),
      remaining: currentlyAvailable,
      maximum: maximumAvailable,
    });

    // Capture in Sentry for alerting
    SentryService.captureMessage(
      `Shopify API rate limit at ${percentUsed.toFixed(0)}%`,
      percentUsed >= 95 ? 'error' : 'warning',
      {
        shop: { domain: shop },
        tags: {
          'rate_limit.percent_used': percentUsed.toFixed(0),
          'rate_limit.remaining': String(currentlyAvailable),
        },
        extra: {
          maximumAvailable,
          currentlyAvailable,
          restoreRate,
        },
      }
    );
  }
}

/**
 * Get current rate limit state for a shop
 */
export function getRateLimitState(shop: string): RateLimitState | undefined {
  return rateLimitCache.get(shop);
}

// ============================================
// MONITORED GRAPHQL WRAPPER
// ============================================

/**
 * Execute a Shopify GraphQL query with monitoring
 *
 * This wrapper:
 * 1. Creates a Sentry span for tracing
 * 2. Tracks rate limit usage
 * 3. Captures errors with context
 * 4. Logs performance metrics
 */
export async function monitoredGraphQL<T = unknown>(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  options: GraphQLMonitorOptions
): Promise<GraphQLMonitorResult<T>> {
  const { shop, operation, query, variables, parentTransaction, isMutation } = options;
  const startTime = Date.now();

  // Start Sentry span
  const integrationTracker = SentryService.trackIntegrationCall(
    {
      service: 'shopify',
      operation,
      endpoint: isMutation ? 'graphql-mutation' : 'graphql-query',
    },
    parentTransaction
  );

  // Add breadcrumb for debugging
  SentryService.addBreadcrumb('shopify.api', `${isMutation ? 'Mutation' : 'Query'}: ${operation}`, {
    shop,
    hasVariables: !!variables,
  });

  try {
    const response = await admin.graphql(query, { variables });
    const durationMs = Date.now() - startTime;

    // Parse response
    const json = await response.json() as {
      data?: T;
      errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
      extensions?: GraphQLMonitorResult<T>['extensions'];
    };

    // Extract rate limit info
    const rateLimitInfo = json.extensions?.cost?.throttleStatus ? {
      remaining: json.extensions.cost.throttleStatus.currentlyAvailable,
      maximum: json.extensions.cost.throttleStatus.maximumAvailable,
      restoreRate: json.extensions.cost.throttleStatus.restoreRate,
      percentUsed: ((json.extensions.cost.throttleStatus.maximumAvailable - json.extensions.cost.throttleStatus.currentlyAvailable) /
        json.extensions.cost.throttleStatus.maximumAvailable) * 100,
    } : undefined;

    // Update rate limit tracking
    updateRateLimitState(shop, json.extensions);

    // Check for GraphQL errors
    if (json.errors && json.errors.length > 0) {
      const errorMessages = json.errors.map(e => e.message).join('; ');

      logger.warn('Shopify GraphQL errors', {
        shop,
        operation,
        errors: errorMessages,
        durationMs,
      });

      // Determine if this is a rate limit error
      const isRateLimitError = json.errors.some(e =>
        e.message.includes('Throttled') ||
        e.extensions?.code === 'THROTTLED'
      );

      // Capture in Sentry
      SentryService.captureException(new Error(`Shopify GraphQL error: ${errorMessages}`), {
        shop: { domain: shop },
        operation: {
          type: 'integration',
          name: `shopify.${operation}`,
        },
        tags: {
          'shopify.operation': operation,
          'shopify.is_mutation': String(isMutation || false),
          'shopify.is_rate_limit': String(isRateLimitError),
        },
        level: isRateLimitError ? 'warning' : 'error',
      });

      integrationTracker.finish({
        success: false,
        statusCode: isRateLimitError ? 429 : 400,
        error: errorMessages,
      });
    } else {
      // Success
      integrationTracker.finish({
        success: true,
        statusCode: 200,
      });

      // Log slow queries
      if (durationMs > 2000) {
        logger.warn('Slow Shopify GraphQL query', {
          shop,
          operation,
          durationMs,
          queryCost: json.extensions?.cost?.actualQueryCost,
        });
      }
    }

    return {
      data: json.data || null,
      errors: json.errors || null,
      extensions: json.extensions,
      rateLimitInfo,
      durationMs,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('Shopify GraphQL request failed', error);

    // Determine error type
    let errorType = 'unknown';
    if (error instanceof Error) {
      if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
        errorType = 'timeout';
      } else if (error.message.includes('ECONNRESET')) {
        errorType = 'connection_reset';
      } else if (error.message.includes('fetch')) {
        errorType = 'network';
      }
    }

    // Capture in Sentry
    SentryService.captureException(error, {
      shop: { domain: shop },
      operation: {
        type: 'integration',
        name: `shopify.${operation}`,
      },
      tags: {
        'shopify.operation': operation,
        'shopify.error_type': errorType,
      },
      level: 'error',
    });

    integrationTracker.finish({
      success: false,
      statusCode: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      data: null,
      errors: [{
        message: error instanceof Error ? error.message : 'Unknown error',
        extensions: { type: errorType },
      }],
      durationMs,
    };
  }
}

// ============================================
// CONVENIENCE WRAPPERS
// ============================================

/**
 * Execute a monitored GraphQL query
 */
export async function monitoredQuery<T = unknown>(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  shop: string,
  operation: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLMonitorResult<T>> {
  return monitoredGraphQL<T>(admin, {
    shop,
    operation,
    query,
    variables,
    isMutation: false,
  });
}

/**
 * Execute a monitored GraphQL mutation
 */
export async function monitoredMutation<T = unknown>(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  shop: string,
  operation: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLMonitorResult<T>> {
  return monitoredGraphQL<T>(admin, {
    shop,
    operation,
    query,
    variables,
    isMutation: true,
  });
}

// ============================================
// BATCH OPERATION MONITORING
// ============================================

/**
 * Monitor a batch of GraphQL operations
 */
export async function monitoredBatchOperations<T>(
  operations: Array<() => Promise<T>>,
  options: {
    shop: string;
    batchName: string;
    concurrency?: number;
  }
): Promise<{
  results: Array<{ success: boolean; data?: T; error?: Error }>;
  totalDurationMs: number;
  successCount: number;
  errorCount: number;
}> {
  const { shop, batchName, concurrency = 5 } = options;
  const startTime = Date.now();

  // Start transaction
  const transaction = SentryService.startTransaction(
    `shopify.batch.${batchName}`,
    'batch',
    { shop, operationCount: operations.length, concurrency }
  );

  const results: Array<{ success: boolean; data?: T; error?: Error }> = [];
  let successCount = 0;
  let errorCount = 0;

  // Process in batches
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(batch.map(op => op()));

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push({ success: true, data: result.value });
        successCount++;
      } else {
        results.push({ success: false, error: result.reason });
        errorCount++;
      }
    }
  }

  const totalDurationMs = Date.now() - startTime;

  // Record batch completion
  if (transaction) {
    transaction.setData('batch.success_count', successCount);
    transaction.setData('batch.error_count', errorCount);
    transaction.setData('batch.duration_ms', totalDurationMs);
    transaction.setStatus(errorCount === 0 ? 'ok' : errorCount === operations.length ? 'internal_error' : 'ok');
    transaction.finish();
  }

  // Log summary
  logger.info('Batch operation completed', {
    shop,
    batchName,
    total: operations.length,
    successCount,
    errorCount,
    durationMs: totalDurationMs,
  });

  // Capture if high error rate
  if (errorCount > 0 && errorCount / operations.length > 0.1) {
    SentryService.captureMessage(
      `High error rate in batch operation: ${batchName}`,
      'warning',
      {
        shop: { domain: shop },
        tags: {
          'batch.name': batchName,
          'batch.error_rate': ((errorCount / operations.length) * 100).toFixed(1),
        },
        extra: {
          total: operations.length,
          successCount,
          errorCount,
          durationMs: totalDurationMs,
        },
      }
    );
  }

  return {
    results,
    totalDurationMs,
    successCount,
    errorCount,
  };
}
