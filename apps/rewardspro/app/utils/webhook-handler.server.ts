/**
 * Webhook Handler Wrapper
 * Provides standardized webhook authentication, error handling, and idempotency.
 *
 * Phase 1B: Webhook Security Hardening
 * Date: 2025-01-07
 */

import { json, type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { createLogger } from '~/services/logger.server';
import {
  checkAndAcquireIdempotencyLock,
  completeIdempotencyRecord,
  failIdempotencyRecord,
  generateOrderIdempotencyKey,
} from '~/services/webhook-idempotency.server';
import { WebhookError, shouldRetryError } from './webhook-errors.server';

const logger = createLogger('WebhookHandler');

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface WebhookHandlerOptions {
  /** Expected webhook topic (e.g., 'ORDERS_PAID', 'ORDERS_CREATE') */
  expectedTopic: string;
  /** Whether admin API access is required */
  requireAdmin?: boolean;
  /** Enable idempotency checking (default: true) */
  enableIdempotency?: boolean;
  /** Custom idempotency key generator */
  generateIdempotencyKey?: (context: WebhookContext) => string;
}

export interface WebhookContext {
  /** Shop domain */
  shop: string;
  /** Webhook topic */
  topic: string;
  /** Parsed webhook payload */
  payload: any;
  /** Admin API client (if available) */
  admin: any;
  /** Shopify webhook ID */
  webhookId: string;
  /** Request headers */
  headers: Headers;
}

export type WebhookProcessor<T = any> = (context: WebhookContext) => Promise<T>;

// ============================================
// MAIN HANDLER FACTORY
// ============================================

/**
 * Creates a standardized webhook action handler.
 *
 * Features:
 * - Automatic HMAC verification via Shopify middleware
 * - Topic validation
 * - Admin access validation (optional)
 * - Idempotency protection
 * - Structured error handling
 * - Logging with timing metrics
 *
 * @example
 * ```typescript
 * export const action = createWebhookHandler(
 *   { expectedTopic: 'ORDERS_PAID', requireAdmin: true },
 *   async ({ shop, payload, admin, webhookId }) => {
 *     // Process order...
 *     return { orderId: payload.id };
 *   }
 * );
 * ```
 */
export function createWebhookHandler<T = any>(
  options: WebhookHandlerOptions,
  processor: WebhookProcessor<T>
) {
  return async function action({ request }: ActionFunctionArgs) {
    const startTime = Date.now();
    let webhookId = 'unknown';
    let shop = 'unknown';

    try {
      // 1. Authenticate webhook (Shopify handles HMAC verification)
      const webhookData = await authenticate.webhook(request);

      const { topic, admin, payload } = webhookData;
      shop = webhookData.shop;

      // Get webhook ID from headers (for idempotency)
      webhookId = request.headers.get('X-Shopify-Webhook-Id') ||
                  `${options.expectedTopic}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      logger.debug('Webhook received', {
        shop,
        topic,
        webhookId,
        expectedTopic: options.expectedTopic,
      });

      // 2. Validate topic
      if (topic !== options.expectedTopic) {
        logger.warn('Unexpected webhook topic', {
          shop,
          expected: options.expectedTopic,
          received: topic,
          webhookId,
        });
        return json({ success: false, error: 'Invalid topic' }, { status: 400 });
      }

      // 3. Check admin access if required
      if (options.requireAdmin && !admin) {
        logger.error('Webhook requires admin access but none provided', {
          shop,
          topic,
          webhookId,
        });
        return json({ success: false, error: 'Admin access required' }, { status: 401 });
      }

      // 4. Create context
      const context: WebhookContext = {
        shop,
        topic,
        payload,
        admin,
        webhookId,
        headers: request.headers,
      };

      // 5. Idempotency check (if enabled)
      if (options.enableIdempotency !== false) {
        const idempotencyKey = options.generateIdempotencyKey
          ? options.generateIdempotencyKey(context)
          : webhookId;

        const idempotency = await checkAndAcquireIdempotencyLock(
          idempotencyKey,
          options.expectedTopic,
          { shop }
        );

        if (!idempotency.isNew) {
          logger.info('Webhook already processed (idempotency)', {
            shop,
            topic,
            webhookId,
            idempotencyKey,
          });
          return json({
            success: true,
            message: 'Already processed',
            cached: true,
          });
        }
      }

      // 6. Process webhook
      const result = await processor(context);

      // 7. Mark idempotency as complete
      if (options.enableIdempotency !== false) {
        await completeIdempotencyRecord(webhookId, result);
      }

      const duration = Date.now() - startTime;
      logger.info('Webhook processed successfully', {
        shop,
        topic,
        webhookId,
        duration,
      });

      return json({ success: true, ...result });

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Handle known webhook errors
      if (error instanceof WebhookError) {
        logger.warn('Webhook processing failed with known error', {
          shop,
          webhookId,
          error: error.message,
          isRetryable: error.isRetryable,
          duration,
        });

        // Mark idempotency as failed
        if (options.enableIdempotency !== false) {
          await failIdempotencyRecord(webhookId, error.message);
        }

        return json(
          { success: false, error: error.message },
          { status: error.statusCode }
        );
      }

      // Handle authentication failures
      if (error instanceof Response) {
        if (error.status === 401) {
          logger.error('Webhook authentication failed', {
            shop,
            webhookId,
            duration,
          });
          return new Response('Unauthorized', { status: 401 });
        }
        return error;
      }

      // Handle unknown errors
      logger.error('Webhook processing failed with unknown error', {
        shop,
        webhookId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      // Mark idempotency as failed
      if (options.enableIdempotency !== false) {
        await failIdempotencyRecord(webhookId, error.message);
      }

      // Determine if error should trigger retry
      if (shouldRetryError(error)) {
        return json({ success: false, error: error.message }, { status: 500 });
      }

      // Non-retryable error - return 200 to prevent Shopify retries
      return json({ success: false, error: error.message }, { status: 200 });
    }
  };
}

// ============================================
// SPECIALIZED HANDLERS
// ============================================

/**
 * Creates a webhook handler for order-related webhooks.
 * Includes order-specific idempotency key generation.
 */
export function createOrderWebhookHandler<T = any>(
  options: Omit<WebhookHandlerOptions, 'generateIdempotencyKey'>,
  processor: WebhookProcessor<T>
) {
  return createWebhookHandler(
    {
      ...options,
      generateIdempotencyKey: (context) => {
        const shopifyWebhookId = context.headers.get('X-Shopify-Webhook-Id');
        const orderId = context.payload?.id?.toString() || 'unknown';
        return generateOrderIdempotencyKey(shopifyWebhookId, orderId, options.expectedTopic);
      },
    },
    processor
  );
}

/**
 * Creates a webhook handler without idempotency (for webhooks that are naturally idempotent).
 */
export function createSimpleWebhookHandler<T = any>(
  options: Omit<WebhookHandlerOptions, 'enableIdempotency'>,
  processor: WebhookProcessor<T>
) {
  return createWebhookHandler(
    {
      ...options,
      enableIdempotency: false,
    },
    processor
  );
}
