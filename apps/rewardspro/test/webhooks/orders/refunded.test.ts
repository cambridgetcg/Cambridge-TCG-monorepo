/**
 * Orders/Refunded Webhook Tests
 *
 * Tests the order refund webhook handler including:
 * - HMAC verification (security)
 * - Idempotency (reliability)
 * - Tier membership cancellation
 * - Cashback clawback logic
 * - Tier re-evaluation after refund
 *
 * @module test/webhooks/orders/refunded
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createWebhookTestContext,
  createInvalidHmacRequest,
  createNoHmacRequest,
  executeWebhookAction,
  TEST_WEBHOOK_SECRET,
} from '../../helpers/webhook-test-client';
import { createRefundPayload, createFullRefundPayload, createPartialRefundPayload } from '../../factories/refund.factory';
import { action } from '../../../app/routes/webhooks.orders.refunded';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================
// MOCKS
// ============================================

// Mock the database
vi.mock('../../../app/db.server', () => ({
  default: {
    webhookProcessed: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tierPurchase: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    tierSubscription: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock tier product cache
vi.mock('../../../app/services/tier-product-cache.server', () => ({
  default: {
    getTierProductIds: vi.fn(),
  },
}));

// Mock tier resolution
vi.mock('../../../app/services/tier-resolution.server', () => ({
  updateCustomerToEffectiveTier: vi.fn(),
}));

// Mock refund handler
vi.mock('../../../app/services/refund-handler.server', () => ({
  handleRefundClawback: vi.fn(),
}));

// Import mocked modules
import db from '../../../app/db.server';
import TierProductCache from '../../../app/services/tier-product-cache.server';
import { updateCustomerToEffectiveTier } from '../../../app/services/tier-resolution.server';
import { handleRefundClawback } from '../../../app/services/refund-handler.server';

// ============================================
// TEST CONSTANTS
// ============================================

const TEST_SHOP = 'test-shop.myshopify.com';
const TEST_ORDER_ID = '5123456789';
const TEST_CUSTOMER_ID = 'cust_123456';
const TEST_ORDER_INTERNAL_ID = 'order_internal_123';
const TEST_TIER_ID = 'tier_gold_123';
const TEST_TIER_PURCHASE_ID = 'tp_123';
const TEST_TIER_SUBSCRIPTION_ID = 'ts_123';

// ============================================
// SETUP
// ============================================

beforeEach(() => {
  vi.clearAllMocks();

  // Set webhook secret
  process.env.SHOPIFY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  // Default mock implementations
  vi.mocked(db.webhookProcessed.findUnique).mockResolvedValue(null);
  vi.mocked(db.webhookProcessed.create).mockResolvedValue({
    id: 'wp_123',
    shop: TEST_SHOP,
    topic: 'orders/refunded',
    webhookId: 'webhook_123',
    processedAt: new Date(),
  });

  // Default tier product cache - no tier products
  vi.mocked(TierProductCache.getTierProductIds).mockResolvedValue(new Set());

  // Default clawback handler
  vi.mocked(handleRefundClawback).mockResolvedValue({
    success: true,
    clawbackAmount: 0,
    newBalance: 0,
    message: 'No cashback to clawback',
  });

  // Default tier resolution
  vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.SHOPIFY_WEBHOOK_SECRET;
});

// ============================================
// HELPER: Create mock order record
// ============================================

function createMockOrderRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ORDER_INTERNAL_ID,
    shop: TEST_SHOP,
    shopifyOrderId: TEST_ORDER_ID,
    shopifyOrderName: '#1001',
    customerId: TEST_CUSTOMER_ID,
    totalPrice: new Decimal(100),
    subtotalPrice: new Decimal(90),
    cashbackAmount: new Decimal(5),
    cashbackProcessed: true,
    totalRefunded: new Decimal(0),
    lineItems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CUSTOMER_ID,
    shop: TEST_SHOP,
    shopifyCustomerId: '7654321',
    email: 'customer@example.com',
    currentTierId: TEST_TIER_ID,
    currentTier: {
      id: TEST_TIER_ID,
      name: 'Gold',
      cashbackPercent: 5,
    },
    storeCredit: 50,
    totalCashbackEarned: 100,
    totalRefunded: 0,
    netSpent: 500,
    ...overrides,
  };
}

// ============================================
// HMAC VERIFICATION TESTS
// ============================================

describe('Orders Refunded Webhook - HMAC Verification', () => {
  it('should accept webhook with valid HMAC signature', async () => {
    // Setup: Order not found (simplest case for HMAC test)
    vi.mocked(db.$transaction).mockResolvedValue(null);

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
  });

  it('should reject webhook with invalid HMAC signature', async () => {
    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const request = createInvalidHmacRequest({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await executeWebhookAction(action, request);

    expect(response.status).toBe(401);
    expect(response.body).toBe('Unauthorized');
  });

  it('should reject webhook with missing HMAC header', async () => {
    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const request = createNoHmacRequest({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await executeWebhookAction(action, request);

    expect(response.status).toBe(401);
    expect(response.body).toBe('Unauthorized');
  });

  it('should reject webhook when webhook secret is not configured', async () => {
    // Remove the webhook secret
    delete process.env.SHOPIFY_WEBHOOK_SECRET;

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(401);
  });
});

// ============================================
// IDEMPOTENCY TESTS
// ============================================

describe('Orders Refunded Webhook - Idempotency', () => {
  it('should process webhook on first request', async () => {
    vi.mocked(db.$transaction).mockResolvedValue(null);
    vi.mocked(db.webhookProcessed.findUnique).mockResolvedValue(null);

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
  });

  it('should return success without reprocessing for duplicate webhook', async () => {
    // Simulate already processed webhook
    vi.mocked(db.webhookProcessed.findUnique).mockResolvedValue({
      id: 'wp_existing',
      shop: TEST_SHOP,
      topic: 'orders/refunded',
      webhookId: 'duplicate-webhook-id',
      processedAt: new Date(Date.now() - 60000),
    });

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
      webhookId: 'duplicate-webhook-id',
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Already processed',
    });
    // Transaction should not be called for duplicate
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('should mark webhook as processed after successful processing', async () => {
    const mockOrder = createMockOrderRecord();
    const mockCustomer = createMockCustomer();

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue(mockCustomer),
        },
        tierPurchase: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        tierSubscription: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      };
      return callback(mockTx);
    });

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
      webhookId: 'new-webhook-id',
    });

    await ctx.execute(action);

    expect(db.webhookProcessed.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shop: TEST_SHOP,
        topic: 'orders/refunded',
        webhookId: 'new-webhook-id',
      }),
    });
  });
});

// ============================================
// ORDER/CUSTOMER NOT FOUND TESTS
// ============================================

describe('Orders Refunded Webhook - Order/Customer Not Found', () => {
  it('should return 200 when order is not found in database', async () => {
    // Transaction returns null when order not found
    vi.mocked(db.$transaction).mockResolvedValue(null);

    const payload = createRefundPayload({
      orderId: 'nonexistent-order',
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Order or customer not found',
    });
  });

  it('should return 200 when customer is not found', async () => {
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(createMockOrderRecord()),
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue(null), // Customer not found
        },
        tierPurchase: { findFirst: vi.fn(), update: vi.fn() },
        tierSubscription: { findFirst: vi.fn(), update: vi.fn() },
      };
      return callback(mockTx);
    });

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
  });
});

// ============================================
// MISSING SHOP DOMAIN TESTS
// ============================================

describe('Orders Refunded Webhook - Missing Shop Domain', () => {
  it('should return 400 when shop domain header is missing', async () => {
    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const body = JSON.stringify(payload);
    const hmac = require('crypto')
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(body, 'utf8')
      .digest('base64');

    // Create request without X-Shopify-Shop-Domain header
    const request = new Request('http://localhost/webhooks/orders-refunded', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'orders/refunded',
        'X-Shopify-Webhook-Id': 'webhook-123',
        'X-Shopify-Hmac-SHA256': hmac,
        // Missing: 'X-Shopify-Shop-Domain'
      },
      body,
    });

    const response = await executeWebhookAction(action, request);

    expect(response.status).toBe(400);
    expect(response.body).toBe('Missing shop domain');
  });
});

// ============================================
// TIER PRODUCT REFUND TESTS
// ============================================

describe('Orders Refunded Webhook - Tier Product Refunds', () => {
  const TIER_PRODUCT_ID = '9999999999';
  const TIER_VARIANT_ID = '8888888888';

  beforeEach(() => {
    // Setup tier product cache to recognize the tier product
    vi.mocked(TierProductCache.getTierProductIds).mockResolvedValue(
      new Set([TIER_PRODUCT_ID])
    );
  });

  it('should cancel TierPurchase when tier product is refunded', async () => {
    const mockTierPurchaseUpdate = vi.fn();

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(createMockOrderRecord()),
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue(createMockCustomer()),
        },
        tierPurchase: {
          findFirst: vi.fn().mockResolvedValue({
            id: TEST_TIER_PURCHASE_ID,
            shop: TEST_SHOP,
            shopifyOrderId: TEST_ORDER_ID,
            status: 'ACTIVE',
            tierId: TEST_TIER_ID,
          }),
          update: mockTierPurchaseUpdate,
        },
        tierSubscription: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      };
      return callback(mockTx);
    });

    // Create refund payload with tier product
    const payload = {
      id: 123456789,
      order_id: Number(TEST_ORDER_ID),
      created_at: new Date().toISOString(),
      refund_line_items: [
        {
          id: 111,
          line_item_id: 222,
          quantity: 1,
          line_item: {
            id: 222,
            product_id: Number(TIER_PRODUCT_ID),
            variant_id: Number(TIER_VARIANT_ID),
            price: '99.00',
            quantity: 1,
          },
          subtotal: '99.00',
          total_tax: '0.00',
        },
      ],
      transactions: [
        { amount: '99.00', currency: 'USD', kind: 'refund' },
      ],
    };

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(mockTierPurchaseUpdate).toHaveBeenCalledWith({
      where: { id: TEST_TIER_PURCHASE_ID },
      data: expect.objectContaining({
        status: 'REFUNDED',
        endDate: expect.any(Date),
      }),
    });
  });

  it('should cancel TierSubscription when tier product is refunded', async () => {
    const mockTierSubscriptionUpdate = vi.fn();

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(createMockOrderRecord()),
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue(createMockCustomer()),
        },
        tierPurchase: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        tierSubscription: {
          findFirst: vi.fn().mockResolvedValue({
            id: TEST_TIER_SUBSCRIPTION_ID,
            customerId: TEST_CUSTOMER_ID,
            status: 'ACTIVE',
            tierId: TEST_TIER_ID,
          }),
          update: mockTierSubscriptionUpdate,
        },
      };
      return callback(mockTx);
    });

    const payload = {
      id: 123456789,
      order_id: Number(TEST_ORDER_ID),
      created_at: new Date().toISOString(),
      refund_line_items: [
        {
          id: 111,
          line_item_id: 222,
          quantity: 1,
          line_item: {
            id: 222,
            product_id: Number(TIER_PRODUCT_ID),
            variant_id: Number(TIER_VARIANT_ID),
            price: '99.00',
            quantity: 1,
          },
          subtotal: '99.00',
          total_tax: '0.00',
        },
      ],
      transactions: [
        { amount: '99.00', currency: 'USD', kind: 'refund' },
      ],
    };

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(mockTierSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: TEST_TIER_SUBSCRIPTION_ID },
      data: expect.objectContaining({
        status: 'CANCELLED',
        endDate: expect.any(Date),
      }),
    });
  });

  it('should re-evaluate customer tier after tier product refund', async () => {
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(createMockOrderRecord()),
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue(createMockCustomer()),
        },
        tierPurchase: {
          findFirst: vi.fn().mockResolvedValue({
            id: TEST_TIER_PURCHASE_ID,
            status: 'ACTIVE',
          }),
          update: vi.fn(),
        },
        tierSubscription: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      };
      return callback(mockTx);
    });

    const payload = {
      id: 123456789,
      order_id: Number(TEST_ORDER_ID),
      created_at: new Date().toISOString(),
      refund_line_items: [
        {
          id: 111,
          line_item_id: 222,
          quantity: 1,
          line_item: {
            id: 222,
            product_id: Number(TIER_PRODUCT_ID),
            variant_id: Number(TIER_VARIANT_ID),
            price: '99.00',
            quantity: 1,
          },
          subtotal: '99.00',
          total_tax: '0.00',
        },
      ],
      transactions: [
        { amount: '99.00', currency: 'USD', kind: 'refund' },
      ],
    };

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(updateCustomerToEffectiveTier).toHaveBeenCalledWith(
      TEST_SHOP,
      TEST_CUSTOMER_ID,
      expect.objectContaining({
        triggeredBy: 'order_refunded',
        orderId: TEST_ORDER_INTERNAL_ID,
      })
    );
  });
});

// ============================================
// CASHBACK CLAWBACK TESTS
// ============================================

describe('Orders Refunded Webhook - Cashback Clawback', () => {
  beforeEach(() => {
    const mockOrder = createMockOrderRecord();
    const mockCustomer = createMockCustomer();

    // Create a proper mock Decimal for refundAmount that has the equals method
    const createMockDecimal = (value: number) => ({
      toNumber: () => value,
      equals: (other: any) => value === (other?.toNumber?.() ?? other),
      plus: (other: any) => createMockDecimal(value + (other?.toNumber?.() ?? other)),
      toString: () => value.toString(),
    });

    vi.mocked(db.$transaction).mockImplementation(async (_callback: any) => {
      // Return the result object that the handler expects
      return {
        orderRecord: mockOrder,
        customer: mockCustomer,
        refundAmount: createMockDecimal(50),
        isFullRefund: false,
        tierProductRefunded: false,
      };
    });
  });

  it('should call clawback handler for full refund', async () => {
    vi.mocked(handleRefundClawback).mockResolvedValue({
      success: true,
      clawbackAmount: 5,
      newBalance: 45,
      message: 'Full clawback processed',
    });

    const payload = createFullRefundPayload(TEST_ORDER_ID, 100);

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    // The clawback handler is called with the calculated refund amount from the transaction
    expect(handleRefundClawback).toHaveBeenCalled();
  });

  it('should call clawback handler for partial refund', async () => {
    vi.mocked(handleRefundClawback).mockResolvedValue({
      success: true,
      clawbackAmount: 2.5,
      newBalance: 47.5,
      message: 'Partial clawback processed',
    });

    const payload = createPartialRefundPayload(TEST_ORDER_ID, 50, 'Partial refund');

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(handleRefundClawback).toHaveBeenCalled();
  });

  it('should continue processing even if clawback fails', async () => {
    vi.mocked(handleRefundClawback).mockResolvedValue({
      success: false,
      clawbackAmount: 0,
      newBalance: 0,
      message: 'Database error during clawback',
    });

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    // Should still succeed (clawback failure is non-fatal)
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true });

    // Tier re-evaluation should still happen
    expect(updateCustomerToEffectiveTier).toHaveBeenCalled();
  });
});

// ============================================
// TIER RE-EVALUATION TESTS
// ============================================

describe('Orders Refunded Webhook - Tier Re-evaluation', () => {
  it('should always re-evaluate tier after processing refund', async () => {
    const mockOrder = createMockOrderRecord();
    const mockCustomer = createMockCustomer();

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue(mockCustomer),
        },
        tierPurchase: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        tierSubscription: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      };
      return callback(mockTx);
    });

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(updateCustomerToEffectiveTier).toHaveBeenCalledWith(
      TEST_SHOP,
      TEST_CUSTOMER_ID,
      {
        triggeredBy: 'order_refunded',
        orderId: TEST_ORDER_INTERNAL_ID,
      }
    );
  });
});

// ============================================
// ERROR HANDLING TESTS
// ============================================

describe('Orders Refunded Webhook - Error Handling', () => {
  it('should return 500 on database transaction error', async () => {
    vi.mocked(db.$transaction).mockRejectedValue(new Error('Database connection failed'));

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(500);
    expect(response.body).toContain('Database connection failed');
  });

  it('should return 500 on unexpected processing error', async () => {
    vi.mocked(db.$transaction).mockImplementation(async () => {
      throw new Error('Unexpected processing error');
    });

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(500);
  });
});

// ============================================
// SHOP ISOLATION TESTS
// ============================================

describe('Orders Refunded Webhook - Shop Isolation', () => {
  it('should only process refunds for the correct shop', async () => {
    const mockOrderFindFirst = vi.fn().mockResolvedValue(null);

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: mockOrderFindFirst,
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        tierPurchase: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        tierSubscription: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      };
      return callback(mockTx);
    });

    const payload = createRefundPayload({
      orderId: TEST_ORDER_ID,
      amount: 50,
    });

    const ctx = createWebhookTestContext({
      topic: 'orders/refunded',
      shop: 'other-shop.myshopify.com',
      payload,
    });

    await ctx.execute(action);

    // Order lookup should use the shop from the header
    expect(mockOrderFindFirst).toHaveBeenCalledWith({
      where: {
        shop: 'other-shop.myshopify.com',
        shopifyOrderId: TEST_ORDER_ID,
      },
      include: { lineItems: true },
    });
  });
});
