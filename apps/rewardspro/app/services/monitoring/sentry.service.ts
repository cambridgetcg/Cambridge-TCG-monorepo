/**
 * Sentry Instrumentation Service
 *
 * Provides comprehensive error tracking, performance monitoring, and
 * business-aware observability for the RewardsPro loyalty app.
 *
 * Key Features:
 * - Multi-tenant context (shop/plan awareness)
 * - Custom transaction spans for critical business flows
 * - Business impact correlation
 * - Smart sampling for critical operations
 * - Integration monitoring for external APIs
 *
 * Architecture:
 * - Complements Datadog (APM) and Better Stack (Logs)
 * - Sentry focuses on: Error tracking, Session Replay, Release Health
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/remix/
 */

import * as Sentry from "@sentry/remix";
import type { Span, Transaction } from "@sentry/types";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ShopContext {
  domain: string;
  plan?: 'FREE' | 'PRO' | 'PRO_ANNUAL' | 'MAX' | 'MAX_ANNUAL' | 'ULTRA' | 'ULTRA_ANNUAL' | 'ENTERPRISE';
  region?: string;
}

export interface CustomerContext {
  id: string;
  tierId?: string | null;
  tierName?: string | null;
  totalSpend?: number;
}

export interface OperationContext {
  type: 'webhook' | 'api' | 'cron' | 'sync' | 'ui' | 'integration';
  name: string;
  correlationId?: string;
}

export interface BusinessImpact {
  affectedCustomers?: number;
  potentialRevenueLoss?: number;
  orderValue?: number;
  pointsAwarded?: number;
  cashbackAmount?: number;
  tierChange?: {
    from: string | null;
    to: string | null;
  };
}

export interface WebhookSpanData {
  topic: string;
  shop: string;
  orderId?: string;
  customerId?: string;
  webhookId?: string;
}

export interface IntegrationSpanData {
  service: 'shopify' | 'klaviyo' | 'sendgrid' | 'recharge' | 'gorgias' | 'judgeme' | 'zapier' | 'slack';
  operation: string;
  endpoint?: string;
  statusCode?: number;
  rateLimitRemaining?: number;
}

// ============================================
// SENTRY SERVICE CLASS
// ============================================

/**
 * SentryService - Centralized Sentry instrumentation for RewardsPro
 *
 * Mirrors BetterStackService pattern for consistency across monitoring stack.
 */
export class SentryService {
  private static isInitialized = false;

  /**
   * Check if Sentry is enabled and initialized
   */
  static isEnabled(): boolean {
    return this.isInitialized && (
      process.env.NODE_ENV === 'production' ||
      process.env.SENTRY_ENABLED === 'true'
    );
  }

  /**
   * Mark Sentry as initialized (called from entry.server.tsx)
   */
  static markInitialized(): void {
    this.isInitialized = true;
  }

  // ============================================
  // CONTEXT MANAGEMENT
  // ============================================

  /**
   * Set shop context for all subsequent Sentry events
   * Call this at the start of request handling
   */
  static setShopContext(shop: ShopContext): void {
    if (!this.isEnabled()) return;

    Sentry.setTag('shop.domain', shop.domain);
    if (shop.plan) Sentry.setTag('shop.plan', shop.plan);
    if (shop.region) Sentry.setTag('shop.region', shop.region);

    Sentry.setContext('shop', {
      domain: shop.domain,
      plan: shop.plan,
      region: shop.region,
    });

    // Set user as shop for multi-tenant identification
    Sentry.setUser({ id: shop.domain });
  }

  /**
   * Set customer context for customer-specific operations
   */
  static setCustomerContext(customer: CustomerContext): void {
    if (!this.isEnabled()) return;

    Sentry.setContext('customer', {
      id: customer.id,
      tierId: customer.tierId,
      tierName: customer.tierName,
      totalSpend: customer.totalSpend,
    });

    Sentry.setTag('customer.tier', customer.tierName || 'none');
  }

  /**
   * Set operation context for categorizing events
   */
  static setOperationContext(operation: OperationContext): void {
    if (!this.isEnabled()) return;

    Sentry.setTag('operation.type', operation.type);
    Sentry.setTag('operation.name', operation.name);
    if (operation.correlationId) {
      Sentry.setTag('correlation.id', operation.correlationId);
    }

    Sentry.setContext('operation', operation);
  }

  /**
   * Clear all custom context (call at end of request)
   */
  static clearContext(): void {
    if (!this.isEnabled()) return;

    Sentry.setUser(null);
    Sentry.setContext('shop', null);
    Sentry.setContext('customer', null);
    Sentry.setContext('operation', null);
  }

  // ============================================
  // ERROR CAPTURE WITH BUSINESS CONTEXT
  // ============================================

  /**
   * Capture exception with full business context
   */
  static captureException(
    error: Error | unknown,
    context?: {
      shop?: ShopContext;
      customer?: CustomerContext;
      operation?: OperationContext;
      businessImpact?: BusinessImpact;
      tags?: Record<string, string>;
      level?: Sentry.SeverityLevel;
    }
  ): string | undefined {
    if (!this.isEnabled()) {
      console.error('[Sentry disabled] Exception:', error);
      return undefined;
    }

    return Sentry.withScope((scope) => {
      // Set shop context
      if (context?.shop) {
        scope.setTag('shop.domain', context.shop.domain);
        if (context.shop.plan) scope.setTag('shop.plan', context.shop.plan);
        scope.setContext('shop', context.shop);
        scope.setUser({ id: context.shop.domain });
      }

      // Set customer context
      if (context?.customer) {
        scope.setContext('customer', context.customer);
        scope.setTag('customer.tier', context.customer.tierName || 'none');
      }

      // Set operation context
      if (context?.operation) {
        scope.setTag('operation.type', context.operation.type);
        scope.setTag('operation.name', context.operation.name);
        scope.setContext('operation', context.operation);
      }

      // Set business impact (critical for prioritization)
      if (context?.businessImpact) {
        scope.setContext('business_impact', context.businessImpact);

        // Add impact-based tags for alerting
        if (context.businessImpact.potentialRevenueLoss) {
          scope.setTag('impact.has_revenue_loss', 'true');
          if (context.businessImpact.potentialRevenueLoss > 100) {
            scope.setTag('impact.severity', 'high');
          }
        }
        if (context.businessImpact.tierChange) {
          scope.setTag('impact.tier_change', 'true');
        }
      }

      // Add custom tags
      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }

      // Set severity level
      if (context?.level) {
        scope.setLevel(context.level);
      }

      return Sentry.captureException(error);
    });
  }

  /**
   * Capture message with context
   */
  static captureMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    context?: {
      shop?: ShopContext;
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    }
  ): string | undefined {
    if (!this.isEnabled()) return undefined;

    return Sentry.withScope((scope) => {
      if (context?.shop) {
        scope.setTag('shop.domain', context.shop.domain);
        scope.setContext('shop', context.shop);
      }
      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }
      if (context?.extra) {
        Object.entries(context.extra).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      scope.setLevel(level);
      return Sentry.captureMessage(message);
    });
  }

  // ============================================
  // TRANSACTION & SPAN MANAGEMENT
  // ============================================

  /**
   * Start a custom transaction for critical business flows
   */
  static startTransaction(
    name: string,
    op: string,
    data?: Record<string, unknown>
  ): Transaction | undefined {
    if (!this.isEnabled()) return undefined;

    return Sentry.startTransaction({
      name,
      op,
      data,
    });
  }

  /**
   * Start a child span within the current transaction
   */
  static startSpan(
    transaction: Transaction | undefined,
    op: string,
    description: string,
    data?: Record<string, unknown>
  ): Span | undefined {
    if (!transaction) return undefined;

    return transaction.startChild({
      op,
      description,
      data,
    });
  }

  // ============================================
  // WEBHOOK INSTRUMENTATION
  // ============================================

  /**
   * Start webhook transaction with appropriate spans
   * Returns helpers for creating child spans
   */
  static startWebhookTransaction(data: WebhookSpanData): {
    transaction: Transaction | undefined;
    startSpan: (op: string, description: string, spanData?: Record<string, unknown>) => Span | undefined;
    finish: (status?: 'ok' | 'error' | 'cancelled') => void;
  } {
    const transaction = this.startTransaction(
      `webhook.${data.topic.replace('/', '.')}`,
      'webhook',
      {
        'webhook.topic': data.topic,
        'webhook.shop': data.shop,
        'webhook.order_id': data.orderId,
        'webhook.customer_id': data.customerId,
        'webhook.id': data.webhookId,
      }
    );

    // Set tags for filtering
    if (transaction) {
      Sentry.setTag('webhook.topic', data.topic);
      Sentry.setTag('shop.domain', data.shop);
    }

    return {
      transaction,
      startSpan: (op: string, description: string, spanData?: Record<string, unknown>) => {
        return this.startSpan(transaction, op, description, spanData);
      },
      finish: (status: 'ok' | 'error' | 'cancelled' = 'ok') => {
        if (transaction) {
          transaction.setStatus(status === 'ok' ? 'ok' : status === 'error' ? 'internal_error' : 'cancelled');
          transaction.finish();
        }
      },
    };
  }

  // ============================================
  // TIER RESOLUTION INSTRUMENTATION
  // ============================================

  /**
   * Instrument tier resolution with detailed spans
   */
  static startTierResolutionTransaction(
    shop: string,
    customerId: string,
    triggeredBy?: string
  ): {
    transaction: Transaction | undefined;
    spanManualCheck: () => Span | undefined;
    spanSubscriptionCheck: () => Span | undefined;
    spanPurchaseCheck: () => Span | undefined;
    spanSpendingCalc: () => Span | undefined;
    spanBaseTierCheck: () => Span | undefined;
    spanConflictResolution: () => Span | undefined;
    spanDatabaseUpdate: () => Span | undefined;
    recordResult: (result: {
      effectiveSource: string;
      effectiveTierId: string | null;
      conflictResolved: boolean;
      changed: boolean;
    }) => void;
    finish: (status?: 'ok' | 'error') => void;
  } {
    const transaction = this.startTransaction(
      'tier.resolution',
      'business.logic',
      {
        shop,
        customerId,
        triggeredBy,
      }
    );

    if (transaction) {
      Sentry.setTag('shop.domain', shop);
      Sentry.setTag('tier.trigger', triggeredBy || 'unknown');
    }

    const createSpanFactory = (op: string, description: string) => () => {
      return this.startSpan(transaction, op, description, { shop, customerId });
    };

    return {
      transaction,
      spanManualCheck: createSpanFactory('db.query', 'Check manual override'),
      spanSubscriptionCheck: createSpanFactory('db.query', 'Check active subscriptions'),
      spanPurchaseCheck: createSpanFactory('db.query', 'Check active purchases'),
      spanSpendingCalc: createSpanFactory('business.logic', 'Calculate spending-based tier'),
      spanBaseTierCheck: createSpanFactory('db.query', 'Check base tier config'),
      spanConflictResolution: createSpanFactory('business.logic', 'Resolve tier conflicts'),
      spanDatabaseUpdate: createSpanFactory('db.transaction', 'Update customer tier'),
      recordResult: (result) => {
        if (transaction) {
          transaction.setData('tier.effective_source', result.effectiveSource);
          transaction.setData('tier.effective_id', result.effectiveTierId);
          transaction.setData('tier.conflict_resolved', result.conflictResolved);
          transaction.setData('tier.changed', result.changed);

          Sentry.setTag('tier.source', result.effectiveSource);
          Sentry.setTag('tier.changed', String(result.changed));
        }
      },
      finish: (status: 'ok' | 'error' = 'ok') => {
        if (transaction) {
          transaction.setStatus(status === 'ok' ? 'ok' : 'internal_error');
          transaction.finish();
        }
      },
    };
  }

  // ============================================
  // INTEGRATION MONITORING
  // ============================================

  /**
   * Track external API calls
   */
  static trackIntegrationCall(
    data: IntegrationSpanData,
    parentTransaction?: Transaction
  ): {
    span: Span | undefined;
    finish: (result: { success: boolean; statusCode?: number; error?: string }) => void;
  } {
    const span = parentTransaction
      ? this.startSpan(parentTransaction, `http.client.${data.service}`, data.operation, {
          'integration.service': data.service,
          'integration.operation': data.operation,
          'integration.endpoint': data.endpoint,
        })
      : undefined;

    return {
      span,
      finish: (result) => {
        if (span) {
          span.setData('http.status_code', result.statusCode);
          span.setData('integration.success', result.success);
          if (result.error) {
            span.setData('integration.error', result.error);
          }
          span.setStatus(result.success ? 'ok' : 'internal_error');
          span.finish();
        }

        // Track rate limits
        if (data.rateLimitRemaining !== undefined && data.rateLimitRemaining < 10) {
          this.captureMessage(
            `${data.service} API rate limit low: ${data.rateLimitRemaining} remaining`,
            'warning',
            {
              tags: {
                'integration.service': data.service,
                'rate_limit.remaining': String(data.rateLimitRemaining),
              },
            }
          );
        }
      },
    };
  }

  // ============================================
  // BREADCRUMBS
  // ============================================

  /**
   * Add breadcrumb for debugging
   */
  static addBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>,
    level: Sentry.SeverityLevel = 'info'
  ): void {
    if (!this.isEnabled()) return;

    Sentry.addBreadcrumb({
      category,
      message,
      data,
      level,
      timestamp: Date.now() / 1000,
    });
  }

  // ============================================
  // BUSINESS EVENTS
  // ============================================

  /**
   * Pre-built business event tracking
   */
  static events = {
    /**
     * Track tier change event
     */
    tierChanged(data: {
      shop: string;
      customerId: string;
      fromTier: string | null;
      toTier: string | null;
      source: string;
      triggered_by: string;
    }): void {
      SentryService.addBreadcrumb('tier', 'Tier changed', {
        fromTier: data.fromTier,
        toTier: data.toTier,
        source: data.source,
      });

      // Capture as event for tracking upgrades/downgrades
      const isUpgrade = !data.fromTier || (data.toTier && data.fromTier);
      SentryService.captureMessage(
        `Tier ${isUpgrade ? 'upgraded' : 'changed'}: ${data.fromTier || 'none'} → ${data.toTier || 'none'}`,
        'info',
        {
          shop: { domain: data.shop },
          tags: {
            'tier.from': data.fromTier || 'none',
            'tier.to': data.toTier || 'none',
            'tier.source': data.source,
            'tier.trigger': data.triggered_by,
          },
        }
      );
    },

    /**
     * Track webhook processing
     */
    webhookProcessed(data: {
      shop: string;
      topic: string;
      success: boolean;
      durationMs: number;
      orderId?: string;
      error?: string;
    }): void {
      SentryService.addBreadcrumb(
        'webhook',
        `Webhook ${data.topic} ${data.success ? 'processed' : 'failed'}`,
        {
          topic: data.topic,
          durationMs: data.durationMs,
          orderId: data.orderId,
        },
        data.success ? 'info' : 'error'
      );

      if (!data.success && data.error) {
        SentryService.captureMessage(
          `Webhook failed: ${data.topic}`,
          'error',
          {
            shop: { domain: data.shop },
            tags: {
              'webhook.topic': data.topic,
              'webhook.order_id': data.orderId || 'none',
            },
            extra: {
              error: data.error,
              durationMs: data.durationMs,
            },
          }
        );
      }
    },

    /**
     * Track points transaction
     */
    pointsTransaction(data: {
      shop: string;
      customerId: string;
      type: 'earn' | 'redeem' | 'expire' | 'adjust';
      points: number;
      balance: number;
      orderId?: string;
    }): void {
      SentryService.addBreadcrumb('points', `Points ${data.type}: ${data.points}`, {
        type: data.type,
        points: data.points,
        balance: data.balance,
        orderId: data.orderId,
      });
    },

    /**
     * Track billing event
     */
    billingEvent(data: {
      shop: string;
      event: 'subscription_created' | 'subscription_updated' | 'subscription_cancelled' | 'charge_succeeded' | 'charge_failed';
      plan?: string;
      amount?: number;
      error?: string;
    }): void {
      const level: Sentry.SeverityLevel = data.event.includes('failed') ? 'error' : 'info';

      SentryService.addBreadcrumb('billing', `Billing: ${data.event}`, {
        plan: data.plan,
        amount: data.amount,
      }, level);

      if (data.event.includes('failed')) {
        SentryService.captureMessage(
          `Billing failed: ${data.event}`,
          'error',
          {
            shop: { domain: data.shop },
            tags: {
              'billing.event': data.event,
              'billing.plan': data.plan || 'unknown',
            },
            extra: {
              error: data.error,
              amount: data.amount,
            },
          }
        );
      }
    },
  };

  // ============================================
  // FLUSH (for serverless)
  // ============================================

  /**
   * Flush pending events before serverless function terminates
   */
  static async flush(timeout = 2000): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await Sentry.flush(timeout);
    } catch (error) {
      console.warn('[Sentry] Flush failed:', error);
    }
  }
}

// ============================================
// SCOPED LOGGER FACTORY
// ============================================

/**
 * Create a Sentry-integrated logger for a specific component
 * Mirrors createBetterStackLogger pattern
 */
export function createSentryLogger(
  prefix: string,
  defaultContext?: {
    shop?: ShopContext;
    operation?: OperationContext;
  }
) {
  return {
    /**
     * Add debug breadcrumb
     */
    debug(message: string, data?: Record<string, unknown>): void {
      SentryService.addBreadcrumb(prefix, message, data, 'debug');
    },

    /**
     * Add info breadcrumb
     */
    info(message: string, data?: Record<string, unknown>): void {
      SentryService.addBreadcrumb(prefix, message, data, 'info');
    },

    /**
     * Add warning breadcrumb and optionally capture
     */
    warn(message: string, data?: Record<string, unknown>, capture = false): void {
      SentryService.addBreadcrumb(prefix, message, data, 'warning');
      if (capture) {
        SentryService.captureMessage(`[${prefix}] ${message}`, 'warning', {
          shop: defaultContext?.shop,
          extra: data,
        });
      }
    },

    /**
     * Capture error with context
     */
    error(message: string, error?: Error | unknown, data?: Record<string, unknown>): string | undefined {
      SentryService.addBreadcrumb(prefix, message, data, 'error');
      return SentryService.captureException(error || new Error(message), {
        shop: defaultContext?.shop,
        operation: defaultContext?.operation,
        tags: {
          'logger.prefix': prefix,
        },
      });
    },

    /**
     * Create child logger with additional context
     */
    withContext(additionalContext: {
      shop?: ShopContext;
      customer?: CustomerContext;
      operation?: OperationContext;
    }) {
      return createSentryLogger(prefix, {
        ...defaultContext,
        ...additionalContext,
      });
    },
  };
}

// ============================================
// SMART SAMPLING CONFIGURATION
// ============================================

/**
 * Smart sampler for Sentry transactions
 * Use this in Sentry.init({ tracesSampler: smartSampler })
 */
export function createSmartSampler(defaultRate = 0.2) {
  return (samplingContext: {
    transactionContext: { name?: string; [key: string]: unknown };
    parentSampled?: boolean;
    [key: string]: unknown;
  }): number => {
    const name = samplingContext.transactionContext?.name || '';
    const { parentSampled } = samplingContext;
    const attributes = (samplingContext.transactionContext?.data || {}) as Record<string, unknown>;

    // Inherit parent decision if available
    if (typeof parentSampled === 'boolean') {
      return parentSampled ? 1.0 : 0;
    }

    // Always trace billing operations
    if (name.includes('billing') || name.includes('subscription')) {
      return 1.0;
    }

    // Always trace tier resolution
    if (name.includes('tier')) {
      return 1.0;
    }

    // Always trace webhook operations
    if (name.startsWith('webhook.')) {
      return 0.5;
    }

    // Always trace errors
    if (attributes?.error) {
      return 1.0;
    }

    // Higher rate for critical paths
    if (name.includes('points') || name.includes('cashback')) {
      return 0.5;
    }

    // Default sampling rate
    return defaultRate;
  };
}

// Export singleton and helpers
export const sentry = SentryService;
export { Sentry };
