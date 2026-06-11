/**
 * Webhook Test Client
 *
 * Provides utilities for testing Shopify webhook handlers with:
 * - Valid HMAC signature generation
 * - Standard Shopify headers
 * - Request/Response handling
 *
 * Usage:
 *   const ctx = createWebhookTestContext({
 *     topic: 'orders/paid',
 *     shop: 'test.myshopify.com',
 *     payload: orderPayload,
 *   });
 *   const response = await ctx.execute(action);
 */

import crypto from 'crypto';
import type { ActionFunctionArgs } from '@remix-run/node';

// ============================================
// TYPES
// ============================================

export type WebhookTopic =
  | 'orders/create'
  | 'orders/paid'
  | 'orders/cancelled'
  | 'orders/fulfilled'
  | 'orders/updated'
  | 'orders/refunded'
  | 'customers/create'
  | 'customers/update'
  | 'customers/delete'
  | 'refunds/create'
  | 'app/uninstalled'
  | 'app/scopes_update'
  | 'shop/update'
  | 'products/create'
  | 'products/update'
  | 'products/delete'
  | 'subscription_billing_attempts/success'
  | 'subscription_contracts/create'
  | 'subscription_contracts/update';

export interface WebhookTestRequest {
  /** Webhook topic (e.g., 'orders/paid') */
  topic: WebhookTopic | string;
  /** Shop domain (e.g., 'test.myshopify.com') */
  shop: string;
  /** Webhook payload */
  payload: Record<string, unknown>;
  /** Override webhook ID (auto-generated if not provided) */
  webhookId?: string;
  /** Shopify API version */
  apiVersion?: string;
}

export interface WebhookTestResponse {
  /** HTTP status code */
  status: number;
  /** Response body (parsed JSON or text) */
  body: unknown;
  /** Response headers */
  headers: Record<string, string>;
}

export interface WebhookTestContext {
  /** The constructed Request object */
  request: Request;
  /** The webhook secret used for HMAC */
  secret: string;
  /** The webhook ID */
  webhookId: string;
  /** The raw body string */
  rawBody: string;
  /** The HMAC signature */
  hmac: string;
  /** Execute the webhook against an action function */
  execute: (
    actionFn: (args: ActionFunctionArgs) => Promise<Response>
  ) => Promise<WebhookTestResponse>;
}

// ============================================
// CONSTANTS
// ============================================

/** Default webhook secret for testing */
export const TEST_WEBHOOK_SECRET = 'test-webhook-secret-for-testing';

/** Default API version */
export const DEFAULT_API_VERSION = '2025-07';

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Generate HMAC-SHA256 signature matching Shopify's format
 */
export function generateHMAC(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
}

/**
 * Verify HMAC signature (useful for testing verification logic)
 */
export function verifyHMAC(
  body: string,
  providedHmac: string,
  secret: string
): boolean {
  const expectedHmac = generateHMAC(body, secret);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHmac),
      Buffer.from(providedHmac)
    );
  } catch {
    return false;
  }
}

/**
 * Map webhook topic to Remix route path
 */
export function topicToPath(topic: string): string {
  // Convert 'orders/paid' to '/webhooks/orders-paid'
  // Handle special cases like 'app/uninstalled' -> '/webhooks/app-uninstalled'
  const normalized = topic.replace(/[/_]/g, '-').replace(/--/g, '-');
  return `/webhooks/${normalized}`;
}

/**
 * Create a mock Request object with valid Shopify webhook headers
 */
export function createWebhookRequest(
  options: WebhookTestRequest,
  secret: string = TEST_WEBHOOK_SECRET
): Request {
  const body = JSON.stringify(options.payload);
  const hmac = generateHMAC(body, secret);
  const webhookId = options.webhookId || crypto.randomUUID();
  const apiVersion = options.apiVersion || DEFAULT_API_VERSION;
  const path = topicToPath(options.topic);

  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': options.topic,
      'X-Shopify-Shop-Domain': options.shop,
      'X-Shopify-Webhook-Id': webhookId,
      'X-Shopify-Hmac-SHA256': hmac,
      'X-Shopify-API-Version': apiVersion,
      'X-Shopify-Triggered-At': new Date().toISOString(),
    },
    body,
  });
}

/**
 * Create a request with INVALID HMAC (for testing rejection)
 */
export function createInvalidHmacRequest(
  options: WebhookTestRequest
): Request {
  const body = JSON.stringify(options.payload);
  const webhookId = options.webhookId || crypto.randomUUID();
  const apiVersion = options.apiVersion || DEFAULT_API_VERSION;
  const path = topicToPath(options.topic);

  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': options.topic,
      'X-Shopify-Shop-Domain': options.shop,
      'X-Shopify-Webhook-Id': webhookId,
      'X-Shopify-Hmac-SHA256': 'invalid-hmac-signature',
      'X-Shopify-API-Version': apiVersion,
      'X-Shopify-Triggered-At': new Date().toISOString(),
    },
    body,
  });
}

/**
 * Create a request without HMAC header (for testing missing header)
 */
export function createNoHmacRequest(options: WebhookTestRequest): Request {
  const body = JSON.stringify(options.payload);
  const webhookId = options.webhookId || crypto.randomUUID();
  const apiVersion = options.apiVersion || DEFAULT_API_VERSION;
  const path = topicToPath(options.topic);

  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': options.topic,
      'X-Shopify-Shop-Domain': options.shop,
      'X-Shopify-Webhook-Id': webhookId,
      'X-Shopify-API-Version': apiVersion,
      'X-Shopify-Triggered-At': new Date().toISOString(),
    },
    body,
  });
}

/**
 * Execute a webhook handler action and parse the response
 */
export async function executeWebhookAction(
  actionFn: (args: ActionFunctionArgs) => Promise<Response>,
  request: Request
): Promise<WebhookTestResponse> {
  const response = await actionFn({ request, params: {}, context: {} });

  let body: unknown;
  const contentType = response.headers.get('content-type');

  // Clone response to read body (response can only be read once)
  const clonedResponse = response.clone();

  try {
    if (contentType?.includes('application/json')) {
      body = await clonedResponse.json();
    } else {
      body = await clonedResponse.text();
    }
  } catch {
    body = null;
  }

  return {
    status: response.status,
    body,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

/**
 * Create a complete webhook test context with all utilities
 */
export function createWebhookTestContext(
  options: WebhookTestRequest,
  secret: string = TEST_WEBHOOK_SECRET
): WebhookTestContext {
  const rawBody = JSON.stringify(options.payload);
  const hmac = generateHMAC(rawBody, secret);
  const webhookId = options.webhookId || crypto.randomUUID();
  const request = createWebhookRequest({ ...options, webhookId }, secret);

  return {
    request,
    secret,
    webhookId,
    rawBody,
    hmac,
    execute: async (
      actionFn: (args: ActionFunctionArgs) => Promise<Response>
    ) => {
      return executeWebhookAction(actionFn, request);
    },
  };
}

// ============================================
// ASSERTION HELPERS
// ============================================

/**
 * Assert webhook was accepted (status 200)
 */
export function assertWebhookAccepted(response: WebhookTestResponse): void {
  if (response.status !== 200) {
    throw new Error(
      `Expected webhook to be accepted (200), got ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
}

/**
 * Assert webhook was rejected due to authentication (status 401)
 */
export function assertWebhookUnauthorized(response: WebhookTestResponse): void {
  if (response.status !== 401) {
    throw new Error(
      `Expected webhook to be unauthorized (401), got ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
}

/**
 * Assert response indicates already processed (idempotent)
 */
export function assertAlreadyProcessed(response: WebhookTestResponse): void {
  assertWebhookAccepted(response);
  const body = response.body as Record<string, unknown>;
  if (!body || !String(body.message || '').toLowerCase().includes('already')) {
    throw new Error(
      `Expected 'already processed' message, got: ${JSON.stringify(response.body)}`
    );
  }
}

// ============================================
// BATCH TESTING UTILITIES
// ============================================

/**
 * Send multiple webhooks in sequence with optional delays
 */
export async function sendWebhookSequence(
  actionFn: (args: ActionFunctionArgs) => Promise<Response>,
  webhooks: Array<WebhookTestRequest & { delayMs?: number }>,
  secret: string = TEST_WEBHOOK_SECRET
): Promise<WebhookTestResponse[]> {
  const results: WebhookTestResponse[] = [];

  for (let i = 0; i < webhooks.length; i++) {
    const webhook = webhooks[i];

    // Apply delay between webhooks (except first)
    if (i > 0 && webhook.delayMs && webhook.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, webhook.delayMs));
    }

    const ctx = createWebhookTestContext(webhook, secret);
    const response = await ctx.execute(actionFn);
    results.push(response);
  }

  return results;
}

/**
 * Send webhooks concurrently (for race condition testing)
 */
export async function sendWebhooksConcurrently(
  actionFn: (args: ActionFunctionArgs) => Promise<Response>,
  webhooks: WebhookTestRequest[],
  secret: string = TEST_WEBHOOK_SECRET
): Promise<WebhookTestResponse[]> {
  const promises = webhooks.map((webhook) => {
    const ctx = createWebhookTestContext(webhook, secret);
    return ctx.execute(actionFn);
  });

  return Promise.all(promises);
}
