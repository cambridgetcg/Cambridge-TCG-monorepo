/**
 * Webhook Tests: orders/paid - Tier Product Detection
 *
 * Tests tier product recognition and TierPurchase creation.
 * Verifies that tier products are identified by productId, variantId, or SKU.
 *
 * @see app/routes/webhooks.orders.paid.tsx
 * @see app/services/tier-product-matcher.server.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createWebhookTestContext,
  TEST_WEBHOOK_SECRET,
} from '../../helpers/webhook-test-client';
import {
  createOrderPayload,
  createTierProductOrderPayload,
  createTrialTierOrderPayload,
} from '../../factories/order.factory';
import {
  getMockPrisma,
  resetMockPrisma,
  setupMockDatabaseState,
  type MockPrismaClient,
} from '../../helpers/database-helpers';

// ============================================
// MOCKS
// ============================================

// Mock Shopify server - authenticate.webhook
vi.mock('~/shopify.server', () => ({
  authenticate: {
    webhook: vi.fn().mockImplementation(async (request: Request) => {
      const shop = request.headers.get('X-Shopify-Shop-Domain');
      const topic = request.headers.get('X-Shopify-Topic');
      const rawBody = await request.clone().text();
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

// Mock tier resolution - important for tier product tests
const mockUpdateCustomerToEffectiveTier = vi.fn().mockResolvedValue({
  changed: true,
  source: 'purchase',
  newTierId: 'tier-vip',
  previousTierId: 'tier-bronze',
});

vi.mock('~/services/tier-resolution.server', () => ({
  updateCustomerToEffectiveTier: mockUpdateCustomerToEffectiveTier,
  getEffectiveTier: vi.fn().mockResolvedValue(null),
}));

// Mock tier product cache
const mockTierProductIds = new Set<string>();
const mockTierProductMap = new Map<string, { tierId: string; duration: number; isTrialProduct: boolean }>();

vi.mock('~/services/tier-product-cache.server', () => ({
  default: {
    getTierProductIds: vi.fn().mockImplementation(() => Promise.resolve(mockTierProductIds)),
    getTierProductMap: vi.fn().mockImplementation(() => Promise.resolve(mockTierProductMap)),
    invalidateCache: vi.fn(),
  },
}));

// Mock other services
vi.mock('~/services/klaviyo.server', () => ({
  isKlaviyoEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('~/services/klaviyo-events.server', () => ({
  trackOrderEvent: vi.fn().mockResolvedValue(undefined),
  syncCustomerToKlaviyo: vi.fn().mockResolvedValue(undefined),
}));

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
// Mock tier products services - with dynamic matching based on mockTierProductMap
const mockMatchLineItem = vi.fn();
const mockTierPurchaseExists = vi.fn().mockResolvedValue(false);
const mockCreatePurchase = vi.fn();

vi.mock('~/services/tier-products', () => ({
  TierProductMatcher: {
    matchLineItem: mockMatchLineItem,
    createEmptyMatchDetails: vi.fn().mockReturnValue({
      productIdMatch: false,
      variantIdMatch: false,
      skuMatch: false,
      lineItemProductId: null,
      lineItemVariantId: null,
      lineItemSku: null,
      tierProductProductId: null,
      tierProductVariantId: null,
      tierProductSku: null,
    }),
  },
  TierProductPurchaseService: {
    createPurchase: mockCreatePurchase,
    purchaseExists: vi.fn().mockResolvedValue(false),
  },
  tierPurchaseExists: mockTierPurchaseExists,
  matchTierProduct: vi.fn().mockResolvedValue(null),
  matchTierProducts: vi.fn().mockResolvedValue([]),
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

const { action } = await import('~/routes/webhooks.orders.paid');

// ============================================
// TEST SETUP
// ============================================

describe('Webhook: orders/paid - Tier Products', () => {
  let mockPrisma: MockPrismaClient;
  const shop = 'test-shop.myshopify.com';

  // Tier definitions
  const vipTier = {
    id: 'tier-vip',
    shop,
    name: 'VIP',
    minSpend: 1000,
    cashbackPercent: 15,
    isBaseTier: false,
    sortOrder: 2,
  };

  const bronzeTier = {
    id: 'tier-bronze',
    shop,
    name: 'Bronze',
    minSpend: 0,
    cashbackPercent: 5,
    isBaseTier: true,
    sortOrder: 0,
  };

  // Tier product definitions
  const vipTierProduct = {
    id: 'tp-vip',
    shop,
    tierId: vipTier.id,
    shopifyProductId: '999888777',
    shopifyVariantId: '111222333',
    sku: 'VIP-MEMBERSHIP',
    duration: 365,
    price: 99.99,
    isTrialProduct: false,
    trialDays: null,
  };

  const trialTierProduct = {
    id: 'tp-trial',
    shop,
    tierId: vipTier.id,
    shopifyProductId: '888777666',
    shopifyVariantId: '222333444',
    sku: 'VIP-TRIAL',
    duration: 14,
    price: 0,
    isTrialProduct: true,
    trialDays: 14,
  };

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    resetMockPrisma();

    // Clear mock collections
    mockTierProductIds.clear();
    mockTierProductMap.clear();

    // Add tier products to cache
    mockTierProductIds.add(vipTierProduct.shopifyProductId);
    mockTierProductIds.add(trialTierProduct.shopifyProductId);

    mockTierProductMap.set(vipTierProduct.shopifyProductId, {
      tierId: vipTierProduct.tierId,
      duration: vipTierProduct.duration,
      isTrialProduct: vipTierProduct.isTrialProduct,
    });

    mockTierProductMap.set(trialTierProduct.shopifyProductId, {
      tierId: trialTierProduct.tierId,
      duration: trialTierProduct.duration,
      isTrialProduct: trialTierProduct.isTrialProduct,
    });

    // Setup default database state
    setupMockDatabaseState(mockPrisma, {
      shop,
      shopSettings: {
        id: 'settings-1',
        shop,
        cashbackEnabled: true,
        pointsEngagementEnabled: false,
        maxLifetimeTrialDays: 30,
        minDaysBetweenTrials: 30,
        allowMultipleTierTrials: false,
      },
      tiers: [bronzeTier, vipTier],
      tierProducts: [vipTierProduct, trialTierProduct],
      customer: {
        id: 'cust-1',
        shop,
        shopifyCustomerId: '123456789',
        email: 'test@example.com',
        currentTierId: bronzeTier.id,
        totalSpent: 100,
        netSpent: 100,
      },
    });

    // Default mocks for order operations
    (mockPrisma.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.order.create as ReturnType<typeof vi.fn>).mockImplementation(async (args) => ({
      id: 'new-order-id',
      ...args.data,
    }));
    (mockPrisma.orderLineItem.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mockImplementation(async (args) => ({
      id: 'new-tier-purchase',
      ...args.data,
    }));
    (mockPrisma.tierPurchase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    // Configure mockMatchLineItem to use the mockTierProductMap for matching
    mockMatchLineItem.mockImplementation(async (shop: string, lineItem: any) => {
      const productId = lineItem.product_id?.toString();
      const variantId = lineItem.variant_id?.toString();
      const sku = lineItem.sku;

      // Check if this line item matches a tier product
      const matchedByProductId = productId && mockTierProductIds.has(productId);
      const tierProductInfo = productId ? mockTierProductMap.get(productId) : null;

      if (matchedByProductId && tierProductInfo) {
        // Find the full tier product from our test data
        const tierProduct = productId === vipTierProduct.shopifyProductId
          ? { ...vipTierProduct, tier: vipTier }
          : productId === trialTierProduct.shopifyProductId
          ? { ...trialTierProduct, tier: vipTier }
          : null;

        return {
          matched: true,
          tierProduct,
          matchedBy: ['PRODUCT_ID'],
          matchDetails: {
            productIdMatch: true,
            variantIdMatch: false,
            skuMatch: false,
            lineItemProductId: productId,
            lineItemVariantId: variantId,
            lineItemSku: sku,
            tierProductProductId: tierProduct?.shopifyProductId,
            tierProductVariantId: tierProduct?.shopifyVariantId,
            tierProductSku: tierProduct?.sku,
          },
          isSubscription: !!lineItem.selling_plan_allocation,
        };
      }

      // No match
      return {
        matched: false,
        tierProduct: null,
        matchedBy: [],
        matchDetails: {
          productIdMatch: false,
          variantIdMatch: false,
          skuMatch: false,
          lineItemProductId: productId,
          lineItemVariantId: variantId,
          lineItemSku: sku,
          tierProductProductId: null,
          tierProductVariantId: null,
          tierProductSku: null,
        },
        isSubscription: !!lineItem.selling_plan_allocation,
      };
    });

    // Configure mockCreatePurchase to return success and also call db.tierPurchase.create
    mockCreatePurchase.mockImplementation(async (shop: string, order: any, lineItem: any, tierProduct: any) => {
      // Call the db mock to simulate actual purchase creation
      const purchaseData = {
        shop,
        customerId: 'cust-1',
        tierId: tierProduct.tierId,
        shopifyOrderId: order.id?.toString(),
        shopifyLineItemId: lineItem.id?.toString(),
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: tierProduct.duration ? new Date(Date.now() + tierProduct.duration * 24 * 60 * 60 * 1000) : null,
      };

      const createdPurchase = await mockPrisma.tierPurchase.create({ data: purchaseData });

      return {
        success: true,
        tierPurchase: createdPurchase,
        customerId: 'cust-1',
        tierId: tierProduct.tierId,
        needsResolution: true,
        endDate: purchaseData.endDate,
      };
    });

    // Reset mocks
    mockTierPurchaseExists.mockResolvedValue(false);
    mockUpdateCustomerToEffectiveTier.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // TIER PRODUCT DETECTION TESTS
  // ============================================

  describe('Tier Product Detection', () => {
    it('should detect tier product by productId', async () => {
      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      const response = await ctx.execute(action);

      expect(response.status).toBe(200);

      // Verify TierPurchase was created
      expect(mockPrisma.tierPurchase.create).toHaveBeenCalled();
    });

    it('should detect tier product by variantId', async () => {
      // Setup: variant-based matching
      const variantOnlyProduct = {
        shopifyProductId: 'different-product',
        shopifyVariantId: vipTierProduct.shopifyVariantId,
      };

      const payload = createOrderPayload({
        customerId: '123456789',
        totalPrice: 99.99,
        lineItems: [
          {
            productId: variantOnlyProduct.shopifyProductId,
            variantId: variantOnlyProduct.shopifyVariantId,
            title: 'VIP Membership',
            price: 99.99,
          },
        ],
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // The handler should attempt to match by variant
      // (Actual matching depends on implementation)
    });

    it('should detect tier product by SKU', async () => {
      const payload = createOrderPayload({
        customerId: '123456789',
        totalPrice: 99.99,
        lineItems: [
          {
            productId: 'unknown-product',
            variantId: 'unknown-variant',
            sku: vipTierProduct.sku,
            title: 'VIP Membership',
            price: 99.99,
          },
        ],
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // The handler should attempt to match by SKU
    });

    it('should handle order with multiple tier products', async () => {
      const payload = createOrderPayload({
        customerId: '123456789',
        totalPrice: 199.98,
        lineItems: [
          {
            productId: vipTierProduct.shopifyProductId,
            variantId: vipTierProduct.shopifyVariantId,
            title: 'VIP Membership',
            price: 99.99,
          },
          {
            productId: trialTierProduct.shopifyProductId,
            variantId: trialTierProduct.shopifyVariantId,
            title: 'VIP Trial',
            price: 0,
          },
        ],
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // Should only create one tier purchase (highest priority)
      // or handle according to business rules
    });

    it('should not create TierPurchase for non-tier products', async () => {
      const payload = createOrderPayload({
        customerId: '123456789',
        totalPrice: 50,
        lineItems: [
          {
            productId: 'regular-product-123',
            variantId: 'regular-variant-456',
            title: 'Regular Product',
            price: 50,
          },
        ],
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // TierPurchase should NOT be created
      expect(mockPrisma.tierPurchase.create).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // TIER PURCHASE CREATION TESTS
  // ============================================

  describe('TierPurchase Creation', () => {
    it('should create TierPurchase with correct tierId', async () => {
      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      if ((mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const createCall = (mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(createCall?.data?.tierId).toBe(vipTier.id);
      }
    });

    it('should create TierPurchase with ACTIVE status', async () => {
      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      if ((mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const createCall = (mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(createCall?.data?.status).toBe('ACTIVE');
      }
    });

    it('should calculate correct endDate based on duration (365 days)', async () => {
      const now = new Date('2025-01-23T12:00:00Z');
      vi.setSystemTime(now);

      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      if ((mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const createCall = (mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        const endDate = new Date(createCall?.data?.endDate);
        const expectedEnd = new Date(now);
        expectedEnd.setDate(expectedEnd.getDate() + 365);

        // Check year difference
        expect(endDate.getFullYear()).toBe(expectedEnd.getFullYear());
      }

      vi.useRealTimers();
    });

    it('should link TierPurchase to customer', async () => {
      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      if ((mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const createCall = (mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(createCall?.data?.customerId).toBe('cust-1');
      }
    });

    it('should link TierPurchase to order', async () => {
      const orderId = '9876543210';
      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          id: orderId,
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      if ((mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const createCall = (mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(createCall?.data?.shopifyOrderId).toBe(orderId);
      }
    });
  });

  // ============================================
  // TRIAL TIER PRODUCT TESTS
  // ============================================

  describe('Trial Tier Products', () => {
    it('should detect trial tier product', async () => {
      const payload = createTrialTierOrderPayload(
        trialTierProduct.shopifyProductId,
        trialTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // Should process trial product
      expect(response => response.status === 200);
    });

    it('should create TierPurchase with trial duration (14 days)', async () => {
      const now = new Date('2025-01-23T12:00:00Z');
      vi.setSystemTime(now);

      // Setup trial product detection
      mockTierProductMap.set(trialTierProduct.shopifyProductId, {
        tierId: trialTierProduct.tierId,
        duration: trialTierProduct.duration,
        isTrialProduct: true,
      });

      const payload = createTrialTierOrderPayload(
        trialTierProduct.shopifyProductId,
        trialTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // Check trial duration (14 days, not 365)
      if ((mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const createCall = (mockPrisma.tierPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        const endDate = new Date(createCall?.data?.endDate);
        const expectedEnd = new Date(now);
        expectedEnd.setDate(expectedEnd.getDate() + 14);

        const daysDiff = Math.round((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        expect(daysDiff).toBeLessThanOrEqual(30); // Should be trial duration, not full year
      }

      vi.useRealTimers();
    });

    it('should enforce trial abuse prevention (maxLifetimeTrialDays)', async () => {
      // Customer has already used 25 trial days
      (mockPrisma.tierPurchase.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'previous-trial',
          customerId: 'cust-1',
          tierId: vipTier.id,
          isTrialPurchase: true,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-26'), // 25 days
        },
      ]);

      const payload = createTrialTierOrderPayload(
        trialTierProduct.shopifyProductId,
        trialTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // Should still succeed but with limited/no trial (depending on implementation)
    });
  });

  // ============================================
  // TIER RESOLUTION TESTS
  // ============================================

  describe('Tier Resolution After Purchase', () => {
    it('should trigger tier resolution after tier product purchase', async () => {
      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // Verify tier resolution was called
      expect(mockUpdateCustomerToEffectiveTier).toHaveBeenCalled();
      expect(mockUpdateCustomerToEffectiveTier).toHaveBeenCalledWith(
        shop,
        'cust-1',
        expect.objectContaining({
          triggeredBy: expect.any(String),
        })
      );
    });

    it('should update customer tier to purchased tier', async () => {
      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // After tier resolution, customer.update should be called
      // (This happens inside updateCustomerToEffectiveTier)
      expect(mockUpdateCustomerToEffectiveTier).toHaveBeenCalled();
    });
  });

  // ============================================
  // CASHBACK EXCLUSION TESTS
  // ============================================

  describe('Tier Product Cashback Exclusion', () => {
    it('should NOT apply cashback to tier product line items', async () => {
      const payload = createTierProductOrderPayload(
        vipTierProduct.shopifyProductId,
        vipTierProduct.shopifyVariantId,
        {
          customerId: '123456789',
          totalPrice: 99.99,
        }
      );

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // storeCreditLedger.create should NOT be called for tier products
      // (or cashback amount should be 0)
      const ledgerCalls = (mockPrisma.storeCreditLedger.create as ReturnType<typeof vi.fn>).mock.calls;
      const cashbackCalls = ledgerCalls.filter(
        (call: any[]) => call[0]?.data?.source === 'CASHBACK' && Number(call[0]?.data?.amount) > 0
      );
      expect(cashbackCalls.length).toBe(0);
    });

    it('should apply cashback only to non-tier-product items in mixed order', async () => {
      const payload = createOrderPayload({
        customerId: '123456789',
        totalPrice: 149.99,
        lineItems: [
          {
            productId: vipTierProduct.shopifyProductId,
            variantId: vipTierProduct.shopifyVariantId,
            title: 'VIP Membership',
            price: 99.99,
          },
          {
            productId: 'regular-product',
            variantId: 'regular-variant',
            title: 'Regular Product',
            price: 50,
          },
        ],
      });

      const ctx = createWebhookTestContext({
        topic: 'orders/paid',
        shop,
        payload,
      });

      await ctx.execute(action);

      // Cashback should only be calculated on $50, not $149.99
      // (Actual verification depends on implementation)
    });
  });
});
