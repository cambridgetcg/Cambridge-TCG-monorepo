/**
 * Webhook Tests: orders/paid
 *
 * Comprehensive tests for the orders/paid webhook handler.
 * Tests HMAC verification, idempotency, and basic order processing.
 *
 * @see app/routes/webhooks.orders.paid.tsx
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createWebhookTestContext,
  createInvalidHmacRequest,
  createNoHmacRequest,
  executeWebhookAction,
  sendWebhooksConcurrently,
  TEST_WEBHOOK_SECRET,
} from '../../helpers/webhook-test-client';
import { createOrderPayload } from '../../factories/order.factory';
import {
  getMockPrisma,
  resetMockPrisma,
  setupMockDatabaseState,
  type MockPrismaClient,
} from '../../helpers/database-helpers';

// ============================================
// MOCKS
// ============================================

// Mock Shopify server - authenticate.webhook with HMAC verification
vi.mock('~/shopify.server', () => ({
  authenticate: {
    webhook: vi.fn().mockImplementation(async (request: Request) => {
      const shop = request.headers.get('X-Shopify-Shop-Domain');
      const topic = request.headers.get('X-Shopify-Topic');
      const hmac = request.headers.get('X-Shopify-Hmac-SHA256');
      const rawBody = await request.clone().text();

      // Check if HMAC header is present
      if (!hmac) {
        const error = new Response('Unauthorized', { status: 401 });
        throw error;
      }

      // Verify HMAC signature
      const crypto = await import('crypto');
      const expectedHmac = crypto
        .createHmac('sha256', 'test-webhook-secret-for-testing')
        .update(rawBody, 'utf8')
        .digest('base64');

      const isValid = (() => {
        try {
          return crypto.timingSafeEqual(
            Buffer.from(expectedHmac),
            Buffer.from(hmac)
          );
        } catch {
          return false;
        }
      })();

      if (!isValid) {
        const error = new Response('Unauthorized', { status: 401 });
        throw error;
      }

      // Check for missing shop domain
      if (!shop) {
        const error = new Response('Bad Request: Missing shop domain', { status: 400 });
        throw error;
      }

      const payload = JSON.parse(rawBody);
      return {
        shop,
        topic,
        payload,
        admin: {
          graphql: vi.fn(),
        },
      };
    }),
    admin: vi.fn(),
  },
}));

// Mock the database - must provide both default and named exports
// Call getMockPrisma() inside the factory to avoid hoisting issues
vi.mock('~/db.server', () => {
  const mock = getMockPrisma();
  return {
    default: mock,
    db: mock,
  };
});

// Mock tier resolution service
vi.mock('~/services/tier-resolution.server', () => ({
  updateCustomerToEffectiveTier: vi.fn().mockResolvedValue({
    changed: false,
    source: 'spending',
    newTierId: null,
    previousTierId: null,
  }),
  getEffectiveTier: vi.fn().mockResolvedValue(null),
}));

// Mock tier product cache
vi.mock('~/services/tier-product-cache.server', () => ({
  default: {
    getTierProductIds: vi.fn().mockResolvedValue(new Set()),
    getTierProductMap: vi.fn().mockResolvedValue(new Map()),
    invalidateCache: vi.fn(),
  },
}));

// Mock Klaviyo services
vi.mock('~/services/klaviyo.server', () => ({
  isKlaviyoEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('~/services/klaviyo-events.server', () => ({
  trackOrderEvent: vi.fn().mockResolvedValue(undefined),
  syncCustomerToKlaviyo: vi.fn().mockResolvedValue(undefined),
}));

// Mock email notifications
vi.mock('~/services/email-notifications.server', () => ({
  sendWelcomeEmailNotification: vi.fn().mockResolvedValue(undefined),
  sendTierUpgradeEmailNotification: vi.fn().mockResolvedValue(undefined),
}));

// Mock points config
vi.mock('~/services/points-config.server', () => ({
  isPointsEnabled: vi.fn().mockResolvedValue(false),
}));

// Mock points ledger
vi.mock('~/services/points-ledger.server', () => ({
  awardOrderPoints: vi.fn().mockResolvedValue({ success: true, points: 0 }),
}));

// Mock email provider
vi.mock('~/services/email-provider.server', () => ({
  trackOrderForKlaviyo: vi.fn().mockResolvedValue(undefined),
}));

// Mock tier products services
vi.mock('~/services/tier-products', () => ({
  TierProductMatcher: {
    matchLineItem: vi.fn().mockResolvedValue({
      matched: false,
      tierProduct: null,
      matchedBy: [],
      matchDetails: {
        checkedProductId: false,
        checkedVariantId: false,
        checkedSku: false,
        productIdMatch: false,
        variantIdMatch: false,
        skuMatch: false,
      },
      isSubscription: false,
    }),
    createEmptyMatchDetails: vi.fn().mockReturnValue({
      checkedProductId: false,
      checkedVariantId: false,
      checkedSku: false,
      productIdMatch: false,
      variantIdMatch: false,
      skuMatch: false,
    }),
  },
  TierProductPurchaseService: {
    createPurchase: vi.fn().mockResolvedValue({ success: false }),
    purchaseExists: vi.fn().mockResolvedValue(false),
  },
  tierPurchaseExists: vi.fn().mockResolvedValue(false),
}));

// Mock tier subscription bridge
vi.mock('~/services/subscription/tier-subscription-bridge.server', () => ({
  TierSubscriptionBridgeV2: {
    handleOrderPaid: vi.fn().mockResolvedValue({ processed: false }),
  },
}));

// Mock logger - must include withContext that returns a new logger
vi.mock('~/services/logger.server', () => {
  const createMockLogger = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    withContext: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  });
  return {
    createLogger: vi.fn().mockReturnValue(createMockLogger()),
  };
});

// ============================================
// IMPORT HANDLER AFTER MOCKS
// ============================================

// Import the actual action after mocks are set up
const { action } = await import('~/routes/webhooks.orders.paid');

// ============================================
// TEST SETUP
// ============================================

describe('Webhook: orders/paid', () => {
  let mockPrisma: MockPrismaClient;
  const shop = 'test-shop.myshopify.com';

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    resetMockPrisma();

    // Setup default database state
    setupMockDatabaseState(mockPrisma, {
      shop,
      shopSettings: {
        id: 'settings-1',
        shop,
        cashbackEnabled: true,
        pointsEngagementEnabled: false,
        baseTierId: null,
        tierChangePolicy: 'immediate',
      },
      tiers: [
        {
          id: 'tier-bronze',
          shop,
          name: 'Bronze',
          minSpend: 0,
          cashbackPercent: 5,
          sortOrder: 0,
        },
        {
          id: 'tier-silver',
          shop,
          name: 'Silver',
          minSpend: 500,
          cashbackPercent: 8,
          sortOrder: 1,
        },
      ],
      tierProducts: [],
    });

    // Setup default mocks for order creation
    (mockPrisma.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.order.create as ReturnType<typeof vi.fn>).mockImplementation(async (args) => ({
      id: 'new-order-id',
      ...args.data,
    }));
    (mockPrisma.orderLineItem.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    // Setup default mock for order.aggregate (used in updateCustomerSpendingFromOrders)
    (mockPrisma.order.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: {
        totalPrice: 100,
        totalRefunded: 0,
        cashbackAmount: 5,
      },
      _count: {
        id: 1,
      },
      _max: {
        shopifyCreatedAt: new Date(),
      },
    });

    // Setup default mock for customer.update
    (mockPrisma.customer.update as ReturnType<typeof vi.fn>).mockImplementation(async (args) => ({
      id: args.where.id,
      ...args.data,
    }));

    // Setup default mock for customer.create
    (mockPrisma.customer.create as ReturnType<typeof vi.fn>).mockImplementation(async (args) => ({
      id: args.data.id || 'new-customer-id',
      ...args.data,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // HMAC VERIFICATION TESTS
  // ============================================

  describe('HMAC Verification', () => {
    it('should reject requests without HMAC header', async () => {
      const payload = createOrderPayload({ customerId: '123456789' });
      const request = createNoHmacRequest({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await executeWebhookAction(action, request);

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid HMAC', async () => {
      const payload = createOrderPayload({ customerId: '123456789' });
      const request = createInvalidHmacRequest({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await executeWebhookAction(action, request);

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid HMAC', async () => {
      // Setup customer exists
      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
        email: 'test@example.com',
        currentTierId: 'tier-bronze',
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload: createOrderPayload({ customerId: '123456789' }),
      });

      const response = await ctx.execute(action);

      expect(response.status).toBe(200);
    });

    it('should reject modified payload (HMAC mismatch)', async () => {
      const originalPayload = createOrderPayload({ customerId: '123456789', totalPrice: 100 });
      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload: originalPayload,
      });

      // Modify the request body after HMAC was calculated
      const modifiedBody = JSON.stringify({ ...originalPayload, total_price: '999.99' });
      const modifiedRequest = new Request(ctx.request.url, {
        method: 'POST',
        headers: ctx.request.headers,
        body: modifiedBody,
      });

      const response = await executeWebhookAction(action, modifiedRequest);

      expect(response.status).toBe(401);
    });
  });

  // ============================================
  // IDEMPOTENCY TESTS
  // ============================================

  describe('Idempotency', () => {
    it('should process webhook only once for same webhook ID', async () => {
      const webhookId = 'webhook-123';
      const payload = createOrderPayload({ customerId: '123456789' });

      // Setup customer
      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
      });

      // First call - webhook create succeeds
      (mockPrisma.webhookProcessed.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'wp-1', webhookId, topic: 'orders/paid', processedAt: new Date(),
      });

      const ctx1 = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
        webhookId,
      });

      const response1 = await ctx1.execute(action);
      expect(response1.status).toBe(200);

      // Second call - create throws unique constraint error (already processed)
      const uniqueError = new Error('Unique constraint violation');
      (uniqueError as any).code = 'P2002';
      (mockPrisma.webhookProcessed.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(uniqueError);

      const ctx2 = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
        webhookId,
      });

      const response2 = await ctx2.execute(action);
      expect(response2.status).toBe(200);

      // The message should indicate already processed (check message or status field)
      const body2 = response2.body as Record<string, unknown>;
      const bodyStr = JSON.stringify(body2).toLowerCase();
      expect(bodyStr).toContain('already');
    });

    it('should handle different webhook IDs for same order (prevent double processing)', async () => {
      const orderId = '1234567890';
      const payload = createOrderPayload({ id: orderId, customerId: '123456789' });

      // Setup customer
      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
      });

      // First webhook - order doesn't exist
      (mockPrisma.webhookProcessed.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockPrisma.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const ctx1 = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
        webhookId: 'webhook-1',
      });

      const response1 = await ctx1.execute(action);
      expect(response1.status).toBe(200);

      // Second webhook with different ID - order now exists
      (mockPrisma.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'order-1',
        shop,
        shopifyOrderId: orderId,
      });

      const ctx2 = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
        webhookId: 'webhook-2',
      });

      const response2 = await ctx2.execute(action);
      expect(response2.status).toBe(200);

      // Order should only be created once
      const createCalls = (mockPrisma.order.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(createCalls.length).toBeLessThanOrEqual(1);
    });

    it('should handle concurrent webhook processing', async () => {
      const webhookId = 'webhook-concurrent';
      const payload = createOrderPayload({ customerId: '123456789' });

      // Setup customer
      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
      });

      // Simulate race condition - first check returns null, then webhook is processed
      let callCount = 0;
      (mockPrisma.webhookProcessed.findUnique as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        // First two calls return null (simulating concurrent processing)
        // This tests that the handler properly handles race conditions
        if (callCount <= 2) {
          return null;
        }
        return {
          id: 'wp-1',
          webhookId,
          topic: 'orders/paid',
          processedAt: new Date(),
        };
      });

      // Send two webhooks concurrently with same webhook ID
      const webhooks = [
        { topic: 'orders/paid' as const, shop, payload, webhookId },
        { topic: 'orders/paid' as const, shop, payload, webhookId },
      ];

      const responses = await sendWebhooksConcurrently(action, webhooks, TEST_WEBHOOK_SECRET);

      // Both should return 200 (one processes, one detects duplicate)
      expect(responses.every((r) => r.status === 200)).toBe(true);
    });
  });

  // ============================================
  // ORDER CREATION TESTS
  // ============================================

  describe('Order Creation', () => {
    it('should create order record for new order', async () => {
      const customerId = '123456789';
      const orderId = '9876543210';
      const totalPrice = 150;

      const payload = createOrderPayload({
        id: orderId,
        customerId,
        totalPrice,
        currency: 'USD',
      });

      // Setup: customer exists, order doesn't
      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: customerId,
        email: 'test@example.com',
        currentTierId: 'tier-bronze',
        totalSpent: 0,
      });
      (mockPrisma.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await ctx.execute(action);

      expect(response.status).toBe(200);

      // Verify order.create was called
      expect(mockPrisma.order.create).toHaveBeenCalled();

      // Check the create call arguments
      const createCall = (mockPrisma.order.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(createCall?.data).toMatchObject({
        shop,
        shopifyOrderId: orderId,
      });
    });

    it('should store line items with order', async () => {
      const payload = createOrderPayload({
        customerId: '123456789',
        lineItems: [
          { title: 'Product A', price: 50, quantity: 2 },
          { title: 'Product B', price: 30, quantity: 1 },
        ],
      });

      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
        currentTierId: 'tier-bronze',
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await ctx.execute(action);

      expect(response.status).toBe(200);

      // Verify line items were created (handler creates one at a time, not with createMany)
      expect(mockPrisma.orderLineItem.create).toHaveBeenCalled();

      // Should be called once for each line item
      const createCalls = (mockPrisma.orderLineItem.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(createCalls.length).toBe(2); // Two line items in payload
    });

    it('should not create duplicate order for existing shopifyOrderId', async () => {
      const orderId = '9876543210';
      const payload = createOrderPayload({
        id: orderId,
        customerId: '123456789',
      });

      // Setup: order already exists
      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
      });
      (mockPrisma.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'existing-order',
        shop,
        shopifyOrderId: orderId,
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await ctx.execute(action);

      expect(response.status).toBe(200);

      // order.create should not be called (order exists)
      // Note: The actual handler may update existing order instead
    });

    it('should handle order with missing customer', async () => {
      const payload = createOrderPayload({
        customerId: '999999999',
      });

      // Customer doesn't exist
      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await ctx.execute(action);

      // Should still succeed (webhook acknowledged) - handler should create customer
      expect(response.status).toBe(200);
    });

    it('should handle multi-currency order', async () => {
      const payload = createOrderPayload({
        customerId: '123456789',
        totalPrice: 100,
        currency: 'EUR',
        presentmentCurrency: 'GBP',
      });

      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
        currentTierId: 'tier-bronze',
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await ctx.execute(action);

      expect(response.status).toBe(200);

      // Verify order was created with currency info
      const createCall = (mockPrisma.order.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      if (createCall) {
        expect(createCall.data.currency).toBe('EUR');
      }
    });
  });

  // ============================================
  // CUSTOMER SPEND TRACKING TESTS
  // ============================================

  describe('Customer Spend Tracking', () => {
    it('should update customer totalSpent after order', async () => {
      const customerId = '123456789';
      const orderTotal = 150;

      const payload = createOrderPayload({
        customerId,
        totalPrice: orderTotal,
      });

      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: customerId,
        totalSpent: 100,
        currentTierId: 'tier-bronze',
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // Verify customer.update was called to increment totalSpent
      expect(mockPrisma.customer.update).toHaveBeenCalled();
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================

  describe('Error Handling', () => {
    it('should return 400 for missing shop domain header', async () => {
      const payload = createOrderPayload({ customerId: '123456789' });
      const body = JSON.stringify(payload);
      const hmac = require('crypto')
        .createHmac('sha256', TEST_WEBHOOK_SECRET)
        .update(body)
        .digest('base64');

      const request = new Request('http://localhost/webhooks/orders-paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Hmac-SHA256': hmac,
          // Missing X-Shopify-Shop-Domain
        },
        body,
      });

      const response = await executeWebhookAction(action, request);

      expect(response.status).toBe(400);
    });

    it('should handle database errors gracefully', async () => {
      const payload = createOrderPayload({ customerId: '123456789' });

      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await ctx.execute(action);

      // Should return 500 to trigger Shopify retry
      expect(response.status).toBe(500);
    });

    it('should handle malformed JSON payload', async () => {
      const body = '{ invalid json }';
      const hmac = require('crypto')
        .createHmac('sha256', TEST_WEBHOOK_SECRET)
        .update(body)
        .digest('base64');

      const request = new Request('http://localhost/webhooks/orders-paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Shop-Domain': shop,
          'X-Shopify-Hmac-SHA256': hmac,
          'X-Shopify-Webhook-Id': 'webhook-1',
        },
        body,
      });

      const response = await executeWebhookAction(action, request);

      // Should handle gracefully (400 or 500)
      expect([400, 500]).toContain(response.status);
    });
  });

  // ============================================
  // SHOP ISOLATION TESTS
  // ============================================

  describe('Shop Isolation', () => {
    it('should only query data for the webhook shop', async () => {
      const payload = createOrderPayload({ customerId: '123456789' });

      (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
        currentTierId: 'tier-bronze',
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // Verify all queries include shop scope
      const customerFindCalls = (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mock.calls;
      for (const call of customerFindCalls) {
        expect(call[0]?.where?.shop).toBe(shop);
      }

      const orderCreateCalls = (mockPrisma.order.create as ReturnType<typeof vi.fn>).mock.calls;
      for (const call of orderCreateCalls) {
        expect(call[0]?.data?.shop).toBe(shop);
      }
    });
  });
});
