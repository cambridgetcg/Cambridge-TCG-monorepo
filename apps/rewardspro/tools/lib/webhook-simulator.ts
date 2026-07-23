/**
 * Webhook Simulator
 *
 * Simulates Shopify webhooks locally with valid HMAC signatures.
 * Enables testing of webhook handlers without real Shopify events.
 *
 * Features:
 * - Generates valid HMAC-SHA256 signatures matching Shopify's format
 * - Supports all common webhook topics
 * - Runs predefined webhook sequences (order lifecycle, refunds, etc.)
 * - Provides detailed timing and response information
 */

import crypto from 'crypto';
import {
  assertValidShopDomain,
  assertValidWebhookTopic,
  assertValidUrl,
  assertValidPayload,
  validateWebhookSecret,
} from './validation.js';
import {
  withRetry,
  createHttpRetryPredicate,
  type RetryOptions,
} from './retry.js';

// ============================================
// TYPES
// ============================================

export type WebhookTopic =
  | 'orders/create'
  | 'orders/paid'
  | 'orders/cancelled'
  | 'orders/fulfilled'
  | 'orders/updated'
  | 'customers/create'
  | 'customers/update'
  | 'customers/delete'
  | 'refunds/create'
  | 'app/uninstalled'
  | 'shop/update'
  | 'products/create'
  | 'products/update'
  | 'products/delete';

/** Array of all supported webhook topics */
export const WEBHOOK_TOPICS: WebhookTopic[] = [
  'orders/create',
  'orders/paid',
  'orders/cancelled',
  'orders/fulfilled',
  'orders/updated',
  'customers/create',
  'customers/update',
  'customers/delete',
  'refunds/create',
  'app/uninstalled',
  'shop/update',
  'products/create',
  'products/update',
  'products/delete',
];

export interface WebhookSimulatorConfig {
  /** App URL for webhooks (alias: endpoint) */
  appUrl?: string;
  /** Alias for appUrl */
  endpoint?: string;
  /** Shopify webhook secret (alias: secret) */
  webhookSecret?: string;
  /** Alias for webhookSecret */
  secret?: string;
  /** Shopify API version */
  apiVersion?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Default delay between webhooks in sequences */
  defaultDelay?: number;
  /** Retry options for failed requests */
  retry?: {
    /** Enable retry (default: true) */
    enabled?: boolean;
    /** Max retry attempts (default: 3) */
    maxAttempts?: number;
    /** Initial delay before retry in ms (default: 1000) */
    initialDelayMs?: number;
  };
}

export interface WebhookPayload {
  topic: WebhookTopic;
  shop: string;
  payload: Record<string, unknown>;
  apiVersion?: string;
}

export interface WebhookResult {
  success: boolean;
  status: number;
  /** Alias for status */
  statusCode: number;
  webhookId: string;
  topic: WebhookTopic;
  shop: string;
  durationMs: number;
  response?: string;
  error?: string;
}

export interface WebhookSequenceStep {
  topic: WebhookTopic;
  payload: Record<string, unknown>;
  delayMs?: number;
  description?: string;
}

export interface WebhookSequence {
  name: string;
  description: string;
  stopOnFailure: boolean;
  steps: WebhookSequenceStep[];
}

export interface SequenceResult {
  sequenceName: string;
  shop: string;
  results: WebhookResult[];
  allSucceeded: boolean;
  /** Alias for allSucceeded */
  success: boolean;
  totalDurationMs: number;
}

// ============================================
// WEBHOOK SIMULATOR CLASS
// ============================================

export class WebhookSimulator {
  private config: Required<Pick<WebhookSimulatorConfig, 'appUrl' | 'webhookSecret' | 'apiVersion' | 'timeout' | 'verbose' | 'defaultDelay'>>;
  private retryOptions: RetryOptions;

  constructor(config: WebhookSimulatorConfig) {
    // Support both naming conventions
    const appUrl = config.appUrl || config.endpoint || 'http://localhost:3000';
    const webhookSecret = config.webhookSecret || config.secret || '';

    // Validate URL
    assertValidUrl(appUrl, 'webhookEndpoint');

    // Warn if secret is missing or short (but don't fail - allow for testing)
    const secretValidation = validateWebhookSecret(webhookSecret);
    if (!secretValidation.valid && config.verbose) {
      console.warn(`[WebhookSimulator] Warning: ${secretValidation.error}`);
    }

    this.config = {
      appUrl,
      webhookSecret,
      apiVersion: config.apiVersion || '2024-01',
      timeout: config.timeout || 30000,
      verbose: config.verbose || false,
      defaultDelay: config.defaultDelay || 1000,
    };

    // Configure retry options
    const retryEnabled = config.retry?.enabled !== false;
    this.retryOptions = retryEnabled
      ? {
          maxAttempts: config.retry?.maxAttempts || 3,
          initialDelayMs: config.retry?.initialDelayMs || 1000,
          isRetryable: createHttpRetryPredicate(),
          onRetry: config.verbose
            ? (error, attempt, delayMs) => {
                console.warn(
                  `[WebhookSimulator] Retry attempt ${attempt} after ${delayMs}ms: ${error.message}`
                );
              }
            : undefined,
        }
      : { maxAttempts: 1 }; // No retry
  }

  /**
   * Generate HMAC-SHA256 signature matching Shopify's format
   */
  private generateHMAC(body: string): string {
    return crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(body, 'utf8')
      .digest('base64');
  }

  /**
   * Map webhook topic to endpoint path
   */
  private getWebhookEndpoint(topic: WebhookTopic): string {
    const mapping: Record<string, string> = {
      'orders/create': '/webhooks/orders-create',
      'orders/paid': '/webhooks/orders-paid',
      'orders/cancelled': '/webhooks/orders-cancelled',
      'orders/fulfilled': '/webhooks/orders-fulfilled',
      'orders/updated': '/webhooks/orders-updated',
      'customers/create': '/webhooks/customers-create',
      'customers/update': '/webhooks/customers-update',
      'customers/delete': '/webhooks/customers-delete',
      'refunds/create': '/webhooks/refunds-create',
      'app/uninstalled': '/webhooks/app-uninstalled',
      'shop/update': '/webhooks/shop-update',
      'products/create': '/webhooks/products-create',
      'products/update': '/webhooks/products-update',
      'products/delete': '/webhooks/products-delete',
    };
    return mapping[topic] || `/webhooks/${topic.replace('/', '-')}`;
  }

  /**
   * Send a simulated webhook to the app
   */
  async send(webhook: WebhookPayload): Promise<WebhookResult> {
    // Validate inputs
    const shop = assertValidShopDomain(webhook.shop);
    assertValidWebhookTopic(webhook.topic);
    const payload = assertValidPayload(webhook.payload);

    const body = JSON.stringify(payload);
    const hmac = this.generateHMAC(body);
    const webhookId = crypto.randomUUID();
    const endpoint = this.getWebhookEndpoint(webhook.topic);
    const url = `${this.config.appUrl}${endpoint}`;
    const startTime = Date.now();

    if (this.config.verbose) {
      console.log(`[Webhook] Sending ${webhook.topic} to ${url} for ${shop}`);
    }

    // Define the fetch operation
    const fetchWebhook = async (): Promise<{ ok: boolean; status: number; text: string }> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Topic': webhook.topic,
            'X-Shopify-Shop-Domain': shop,
            'X-Shopify-Webhook-Id': webhookId,
            'X-Shopify-Hmac-SHA256': hmac,
            'X-Shopify-API-Version': webhook.apiVersion || this.config.apiVersion,
            'X-Shopify-Triggered-At': new Date().toISOString(),
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const text = await response.text();

        // Throw on server errors to trigger retry
        if (response.status >= 500) {
          const error = new Error(`Server error: status ${response.status}`);
          (error as any).statusCode = response.status;
          throw error;
        }

        return { ok: response.ok, status: response.status, text };
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    };

    // Execute with retry
    const result = await withRetry(fetchWebhook, this.retryOptions);

    if (result.success && result.result) {
      return {
        success: result.result.ok,
        status: result.result.status,
        statusCode: result.result.status,
        webhookId,
        topic: webhook.topic,
        shop,
        durationMs: Date.now() - startTime,
        response: result.result.text || undefined,
      };
    }

    return {
      success: false,
      status: 0,
      statusCode: 0,
      webhookId,
      topic: webhook.topic,
      shop,
      durationMs: Date.now() - startTime,
      error: result.error?.message || 'Unknown error',
    };
  }

  /**
   * Run a sequence of webhooks simulating a real flow
   */
  async runSequence(shop: string, sequence: WebhookSequence): Promise<SequenceResult> {
    // Validate shop domain upfront
    const validatedShop = assertValidShopDomain(shop);

    const results: WebhookResult[] = [];
    const sequenceStartTime = Date.now();

    if (this.config.verbose) {
      console.log(`[Sequence] Starting ${sequence.name} for ${validatedShop}`);
    }

    for (let i = 0; i < sequence.steps.length; i++) {
      const step = sequence.steps[i];

      // Wait for specified delay
      const delayMs = step.delayMs ?? this.config.defaultDelay;
      if (delayMs > 0 && i > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const result = await this.send({
        topic: step.topic,
        shop: validatedShop,
        payload: step.payload,
      });

      results.push(result);

      // Stop sequence on failure if configured
      if (!result.success && sequence.stopOnFailure) {
        break;
      }
    }

    const allSucceeded = results.every((r) => r.success);

    return {
      sequenceName: sequence.name,
      shop: validatedShop,
      results,
      allSucceeded,
      success: allSucceeded,
      totalDurationMs: Date.now() - sequenceStartTime,
    };
  }

  /**
   * Verify webhook endpoint is reachable
   */
  async healthCheck(): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.appUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return {
        reachable: response.ok,
        latencyMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        reachable: false,
        latencyMs: Date.now() - startTime,
        error: error.message,
      };
    }
  }
}

// ============================================
// PAYLOAD GENERATORS
// ============================================

/**
 * Generate a realistic order payload
 */
export function generateOrderPayload(
  orderId: string,
  customerId: string,
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled',
  totalAmount: number = 99.99,
  options: {
    email?: string;
    lineItems?: number;
    currency?: string;
    tags?: string[];
  } = {}
): Record<string, unknown> {
  const numericOrderId = parseInt(orderId) || Math.floor(Math.random() * 1000000000);
  const numericCustomerId = parseInt(customerId) || Math.floor(Math.random() * 1000000000);
  const orderNumber = Math.floor(1000 + Math.random() * 9000);
  const lineItemCount = options.lineItems || 1;
  const itemPrice = totalAmount / lineItemCount;

  const lineItems = Array.from({ length: lineItemCount }, (_, i) => ({
    id: Math.floor(Math.random() * 1000000000),
    title: `Test Product ${i + 1}`,
    quantity: 1,
    price: itemPrice.toFixed(2),
    product_id: Math.floor(Math.random() * 1000000000),
    variant_id: Math.floor(Math.random() * 1000000000),
    sku: `SKU-${Math.random().toString(36).substring(7).toUpperCase()}`,
    taxable: true,
  }));

  return {
    id: numericOrderId,
    admin_graphql_api_id: `gid://shopify/Order/${numericOrderId}`,
    name: `#${orderNumber}`,
    order_number: orderNumber,
    email: options.email || 'test@example.com',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    total_price: totalAmount.toFixed(2),
    subtotal_price: (totalAmount * 0.9).toFixed(2),
    total_tax: (totalAmount * 0.1).toFixed(2),
    total_discounts: '0.00',
    currency: options.currency || 'USD',
    financial_status: status === 'paid' || status === 'fulfilled' ? 'paid' : 'pending',
    fulfillment_status: status === 'fulfilled' ? 'fulfilled' : null,
    cancelled_at: status === 'cancelled' ? new Date().toISOString() : null,
    cancel_reason: status === 'cancelled' ? 'customer' : null,
    tags: options.tags?.join(', ') || '',
    customer: {
      id: numericCustomerId,
      admin_graphql_api_id: `gid://shopify/Customer/${numericCustomerId}`,
      email: options.email || 'test@example.com',
      first_name: 'Test',
      last_name: 'Customer',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      orders_count: 1,
      total_spent: totalAmount.toFixed(2),
      tags: '',
    },
    line_items: lineItems,
    shipping_address: {
      first_name: 'Test',
      last_name: 'Customer',
      address1: '123 Test Street',
      city: 'Test City',
      province: 'CA',
      country: 'US',
      zip: '90210',
      phone: '+1234567890',
    },
    billing_address: {
      first_name: 'Test',
      last_name: 'Customer',
      address1: '123 Test Street',
      city: 'Test City',
      province: 'CA',
      country: 'US',
      zip: '90210',
    },
  };
}

/**
 * Generate a realistic customer payload
 */
export function generateCustomerPayload(
  customerId: string,
  options: {
    email?: string;
    firstName?: string;
    lastName?: string;
    ordersCount?: number;
    totalSpent?: number;
    tags?: string[];
  } = {}
): Record<string, unknown> {
  const numericId = parseInt(customerId) || Math.floor(Math.random() * 1000000000);
  const email = options.email || `test-${Date.now()}@example.com`;

  return {
    id: numericId,
    admin_graphql_api_id: `gid://shopify/Customer/${numericId}`,
    email,
    first_name: options.firstName || 'Test',
    last_name: options.lastName || 'Customer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    orders_count: options.ordersCount || 0,
    total_spent: (options.totalSpent || 0).toFixed(2),
    tags: options.tags?.join(', ') || '',
    verified_email: true,
    accepts_marketing: false,
    state: 'enabled',
    default_address: {
      id: Math.floor(Math.random() * 1000000000),
      first_name: options.firstName || 'Test',
      last_name: options.lastName || 'Customer',
      address1: '123 Test Street',
      city: 'Test City',
      province: 'California',
      country: 'United States',
      zip: '90210',
      phone: '+1234567890',
      default: true,
    },
  };
}

/**
 * Generate a realistic refund payload
 */
export function generateRefundPayload(
  orderId: string,
  refundAmount: number,
  options: {
    reason?: string;
    note?: string;
    restock?: boolean;
  } = {}
): Record<string, unknown> {
  const numericOrderId = parseInt(orderId) || Math.floor(Math.random() * 1000000000);
  const refundId = Math.floor(Math.random() * 1000000000);

  return {
    id: refundId,
    admin_graphql_api_id: `gid://shopify/Refund/${refundId}`,
    order_id: numericOrderId,
    created_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    note: options.note || 'Test refund',
    restock: options.restock ?? true,
    transactions: [
      {
        id: Math.floor(Math.random() * 1000000000),
        order_id: numericOrderId,
        kind: 'refund',
        gateway: 'shopify_payments',
        status: 'success',
        amount: refundAmount.toFixed(2),
        currency: 'USD',
        created_at: new Date().toISOString(),
      },
    ],
    refund_line_items: [],
    order_adjustments: [
      {
        id: Math.floor(Math.random() * 1000000000),
        order_id: numericOrderId,
        refund_id: refundId,
        amount: (-refundAmount).toFixed(2),
        tax_amount: '0.00',
        kind: 'refund_discrepancy',
        reason: options.reason || 'Refund',
      },
    ],
  };
}

/**
 * Generate app uninstalled payload
 */
export function generateAppUninstalledPayload(shop: string): Record<string, unknown> {
  const liquidAmount = '{{amount}}';

  return {
    id: Math.floor(Math.random() * 1000000000),
    name: shop.replace('.myshopify.com', ''),
    email: `admin@${shop}`,
    domain: shop.replace('.myshopify.com', '.com'),
    province: 'California',
    country: 'US',
    address1: '123 Test Street',
    zip: '90210',
    city: 'Los Angeles',
    source: null,
    phone: '+1234567890',
    latitude: 34.0522,
    longitude: -118.2437,
    primary_locale: 'en',
    currency: 'USD',
    timezone: '(GMT-08:00) Pacific Time (US & Canada)',
    iana_timezone: 'America/Los_Angeles',
    shop_owner: 'Test Owner',
    money_format: `$${liquidAmount}`,
    money_with_currency_format: `$${liquidAmount} USD`,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ============================================
// PRE-BUILT WEBHOOK SEQUENCES
// ============================================

export const WEBHOOK_SEQUENCES = {
  /**
   * Complete order lifecycle: create -> paid -> fulfilled
   */
  orderLifecycle: (orderId: string, customerId: string, amount: number = 99.99): WebhookSequence => ({
    name: 'order-lifecycle',
    description: 'Complete order lifecycle: create -> paid -> fulfilled',
    stopOnFailure: true,
    steps: [
      {
        topic: 'orders/create',
        payload: generateOrderPayload(orderId, customerId, 'pending', amount),
        description: 'Order created',
        delayMs: 0,
      },
      {
        topic: 'orders/paid',
        payload: generateOrderPayload(orderId, customerId, 'paid', amount),
        description: 'Order paid',
        delayMs: 100,
      },
      {
        topic: 'orders/fulfilled',
        payload: generateOrderPayload(orderId, customerId, 'fulfilled', amount),
        description: 'Order fulfilled',
        delayMs: 100,
      },
    ],
  }),

  /**
   * Order with refund
   */
  orderWithRefund: (orderId: string, customerId: string, amount: number = 99.99): WebhookSequence => ({
    name: 'order-with-refund',
    description: 'Order paid then refunded',
    stopOnFailure: true,
    steps: [
      {
        topic: 'orders/paid',
        payload: generateOrderPayload(orderId, customerId, 'paid', amount),
        description: 'Order paid',
        delayMs: 0,
      },
      {
        topic: 'refunds/create',
        payload: generateRefundPayload(orderId, amount / 2, { reason: 'Partial refund' }),
        description: 'Partial refund issued',
        delayMs: 500,
      },
    ],
  }),

  /**
   * New customer with first order
   */
  newCustomerFirstOrder: (customerId: string, amount: number = 150.0): WebhookSequence => ({
    name: 'new-customer-first-order',
    description: 'New customer created, then places first order',
    stopOnFailure: false,
    steps: [
      {
        topic: 'customers/create',
        payload: generateCustomerPayload(customerId),
        description: 'Customer created',
        delayMs: 0,
      },
      {
        topic: 'orders/paid',
        payload: generateOrderPayload(crypto.randomUUID(), customerId, 'paid', amount),
        description: 'First order paid',
        delayMs: 200,
      },
    ],
  }),

  /**
   * High-value customer simulation (multiple orders)
   */
  highValueCustomer: (customerId: string): WebhookSequence => ({
    name: 'high-value-customer',
    description: 'Simulate high-value customer with multiple orders for tier qualification',
    stopOnFailure: false,
    steps: [
      {
        topic: 'customers/create',
        payload: generateCustomerPayload(customerId),
        description: 'Customer created',
        delayMs: 0,
      },
      {
        topic: 'orders/paid',
        payload: generateOrderPayload(crypto.randomUUID(), customerId, 'paid', 200),
        description: 'Order 1 - $200',
        delayMs: 100,
      },
      {
        topic: 'orders/paid',
        payload: generateOrderPayload(crypto.randomUUID(), customerId, 'paid', 350),
        description: 'Order 2 - $350',
        delayMs: 100,
      },
      {
        topic: 'orders/paid',
        payload: generateOrderPayload(crypto.randomUUID(), customerId, 'paid', 500),
        description: 'Order 3 - $500 (should trigger tier upgrade)',
        delayMs: 100,
      },
    ],
  }),

  /**
   * Order cancellation flow
   */
  orderCancellation: (orderId: string, customerId: string, amount: number = 99.99): WebhookSequence => ({
    name: 'order-cancellation',
    description: 'Order created, paid, then cancelled',
    stopOnFailure: true,
    steps: [
      {
        topic: 'orders/paid',
        payload: generateOrderPayload(orderId, customerId, 'paid', amount),
        description: 'Order paid',
        delayMs: 0,
      },
      {
        topic: 'orders/cancelled',
        payload: generateOrderPayload(orderId, customerId, 'cancelled', amount),
        description: 'Order cancelled',
        delayMs: 300,
      },
    ],
  }),

  /**
   * App uninstall simulation
   */
  appUninstall: (shop: string): WebhookSequence => ({
    name: 'app-uninstall',
    description: 'Simulate app uninstallation',
    stopOnFailure: true,
    steps: [
      {
        topic: 'app/uninstalled',
        payload: generateAppUninstalledPayload(shop),
        description: 'App uninstalled',
        delayMs: 0,
      },
    ],
  }),
};

/**
 * Get list of available sequences
 */
export function getAvailableSequences(): string[] {
  return Object.keys(WEBHOOK_SEQUENCES);
}

// ============================================
// FACTORY AND ALIASES
// ============================================

/**
 * Factory function to create a WebhookSimulator instance
 */
export function createWebhookSimulator(config: WebhookSimulatorConfig): WebhookSimulator {
  return new WebhookSimulator(config);
}

/**
 * Pre-built webhook sequences for common testing scenarios
 * Alias for WEBHOOK_SEQUENCES for CLI compatibility
 */
export const WebhookSequences: Record<string, WebhookSequence> = {
  orderLifecycle: WEBHOOK_SEQUENCES.orderLifecycle('test-order', 'test-customer', 99.99),
  orderWithRefund: WEBHOOK_SEQUENCES.orderWithRefund('test-order', 'test-customer', 99.99),
  newCustomerFirstOrder: WEBHOOK_SEQUENCES.newCustomerFirstOrder('test-customer', 150.0),
  highValueCustomer: WEBHOOK_SEQUENCES.highValueCustomer('test-customer'),
  orderCancellation: WEBHOOK_SEQUENCES.orderCancellation('test-order', 'test-customer', 99.99),
  appUninstall: WEBHOOK_SEQUENCES.appUninstall('test.myshopify.com'),
};
