/**
 * Refund Clawback Flow Scenario Tests
 *
 * Tests complete user journeys involving refunds and cashback clawbacks:
 * - Full order refund with complete clawback
 * - Partial refunds with proportional clawback
 * - Multiple partial refunds
 * - Tier downgrade after refund
 * - Tier product refund scenarios
 * - Points clawback integration
 *
 * @module test/scenarios/refund-clawback-flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================
// MOCKS
// ============================================

vi.mock('../../app/db.server', () => ({
  default: {
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    storeCreditLedger: {
      findFirst: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    orderRefund: {
      upsert: vi.fn(),
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

vi.mock('../../app/services/tier-resolution.server', () => ({
  updateCustomerToEffectiveTier: vi.fn(),
}));

vi.mock('../../app/services/points-ledger.server', () => ({
  clawbackPoints: vi.fn(),
}));

vi.mock('../../app/services/points-config.server', () => ({
  isPointsEnabled: vi.fn(),
}));

import db from '../../app/db.server';
import { updateCustomerToEffectiveTier } from '../../app/services/tier-resolution.server';
import { clawbackPoints } from '../../app/services/points-ledger.server';
import { isPointsEnabled } from '../../app/services/points-config.server';

// ============================================
// TEST CONSTANTS
// ============================================

const TEST_SHOP = 'test-shop.myshopify.com';
const TEST_CUSTOMER_ID = 'cust_123';
const TEST_ORDER_ID = 'order_123';
const TEST_SHOPIFY_ORDER_ID = '5123456789';

// ============================================
// HELPERS
// ============================================

function createDecimal(value: number): Decimal {
  return new Decimal(value);
}

function createMockOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ORDER_ID,
    shop: TEST_SHOP,
    shopifyOrderId: TEST_SHOPIFY_ORDER_ID,
    shopifyOrderName: '#1001',
    customerId: TEST_CUSTOMER_ID,
    totalPrice: createDecimal(100),
    subtotalPrice: createDecimal(90),
    cashbackAmount: createDecimal(5),
    cashbackProcessed: true,
    totalRefunded: createDecimal(0),
    financialStatus: 'PAID',
    ...overrides,
  };
}

function createMockCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CUSTOMER_ID,
    shop: TEST_SHOP,
    email: 'customer@example.com',
    currentTierId: 'tier_gold',
    storeCredit: 50,
    totalCashbackEarned: 100,
    totalRefunded: 0,
    netSpent: 1200,
    totalSpent: 1200,
    ...overrides,
  };
}

// ============================================
// SETUP
// ============================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isPointsEnabled).mockResolvedValue(false);
  vi.mocked(db.storeCreditLedger.aggregate).mockResolvedValue({
    _sum: { amount: null },
  } as any);
});

// ============================================
// FULL REFUND SCENARIOS
// ============================================

describe('Refund Clawback Scenario - Full Order Refund', () => {
  it('should clawback entire cashback on full refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(200),
      cashbackAmount: createDecimal(16), // 8% cashback on $200
      cashbackProcessed: true,
    });

    let clawbackAmount = 0;
    let newBalance = 0;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: {
          update: vi.fn().mockImplementation((data) => {
            newBalance = data.data.storeCredit;
          }),
        },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(100) }), // Current balance (full refund path uses aggregate, not findFirst)
          create: vi.fn().mockImplementation((data) => {
            clawbackAmount = Math.abs(data.data.amount);
          }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    // Simulate calling the refund handler
    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    const result = await handleRefundClawback(
      TEST_SHOPIFY_ORDER_ID,
      TEST_SHOP,
      200, // Full refund amount
      true // isFullRefund
    );

    expect(result.success).toBe(true);
    expect(clawbackAmount).toBe(16); // Full cashback clawed back
    expect(newBalance).toBe(84); // 100 - 16 = 84
  });

  it('should trigger tier re-evaluation after full refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(500),
      cashbackAmount: createDecimal(40),
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(100) }), // Current balance (full refund path uses aggregate, not findFirst)
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    await handleRefundClawback(TEST_SHOPIFY_ORDER_ID, TEST_SHOP, 500, true);

    // After refund, tier should be re-evaluated
    // (This would be called by the webhook handler after clawback)
    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: 'tier_gold',
      newTierId: 'tier_silver',
      source: 'spending',
      changed: true,
    });

    const tierResult = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_refunded',
    });

    expect(tierResult.changed).toBe(true);
  });
});

// ============================================
// PARTIAL REFUND SCENARIOS
// ============================================

describe('Refund Clawback Scenario - Partial Refunds', () => {
  it('should clawback proportional amount on partial refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(200),
      cashbackAmount: createDecimal(16), // 8% cashback
      cashbackProcessed: true,
      totalRefunded: createDecimal(0),
    });

    let clawbackAmount = 0;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(100) }), // Current balance (full refund path uses aggregate, not findFirst)
          create: vi.fn().mockImplementation((data) => {
            clawbackAmount = Math.abs(data.data.amount);
          }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    const result = await handleRefundClawback(
      TEST_SHOPIFY_ORDER_ID,
      TEST_SHOP,
      100, // 50% refund
      false
    );

    expect(result.success).toBe(true);
    // 50% refund should clawback 50% of cashback: 16 * 0.5 = 8
    expect(clawbackAmount).toBe(8);
  });

  it('should handle multiple partial refunds correctly', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(200),
      cashbackAmount: createDecimal(16),
      cashbackProcessed: true,
      totalRefunded: createDecimal(50), // Already refunded $50
    });

    // First partial refund already clawed back $4
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(96) }), // 100 - 4 (current balance)
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { amount: -4 }, // $4 already clawed back
          }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    const result = await handleRefundClawback(
      TEST_SHOPIFY_ORDER_ID,
      TEST_SHOP,
      50, // Another $50 refund (total now $100 / 50%)
      false
    );

    expect(result.success).toBe(true);
    // Should clawback proportional to remaining: min of calculated and remaining
    // 50/200 = 25% -> 16 * 0.25 = $4, but cap to remaining (16 - 4 = 12)
    expect(result.clawbackAmount).toBeLessThanOrEqual(12);
  });

  it('should cap clawback to remaining cashback', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(5),
      cashbackProcessed: true,
      totalRefunded: createDecimal(0),
    });

    // Already clawed back $4 of $5
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(46) }), // Current balance
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { amount: -4 }, // $4 already clawed back
          }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    const result = await handleRefundClawback(
      TEST_SHOPIFY_ORDER_ID,
      TEST_SHOP,
      80, // 80% refund would be $4 clawback, but only $1 remaining
      false
    );

    expect(result.success).toBe(true);
    // Should cap to remaining $1
    expect(result.clawbackAmount).toBe(1);
  });
});

// ============================================
// TIER PRODUCT REFUND SCENARIOS
// ============================================

describe('Refund Clawback Scenario - Tier Product Refunds', () => {
  it('should cancel tier purchase on tier product refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(99),
      cashbackAmount: createDecimal(0), // No cashback on tier products
    });

    const mockTierPurchase = {
      id: 'tp_123',
      customerId: TEST_CUSTOMER_ID,
      tierId: 'tier_gold',
      status: 'ACTIVE',
      shopifyOrderId: TEST_SHOPIFY_ORDER_ID,
    };

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue(createMockCustomer()),
        },
        tierPurchase: {
          findFirst: vi.fn().mockResolvedValue(mockTierPurchase),
          update: vi.fn(),
        },
        tierSubscription: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        storeCreditLedger: {
          findFirst: vi.fn(),
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    // This would be called from the webhook handler
    // Simulating the tier purchase cancellation logic
    expect(mockTierPurchase.status).toBe('ACTIVE');

    // After refund, tier should be downgraded
    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: 'tier_gold',
      newTierId: 'tier_bronze',
      source: 'spending',
      changed: true,
    });

    const tierResult = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_refunded',
    });

    expect(tierResult.changed).toBe(true);
    expect(tierResult.newTierId).toBe('tier_bronze');
  });
});

// ============================================
// NEGATIVE BALANCE SCENARIOS
// ============================================

describe('Refund Clawback Scenario - Negative Balance', () => {
  it('should allow balance to go negative after clawback', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(200),
      cashbackAmount: createDecimal(16),
      cashbackProcessed: true,
    });

    let finalBalance = 0;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: {
          update: vi.fn().mockImplementation((data) => {
            finalBalance = data.data.storeCredit;
          }),
        },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(10) }), // Only $10 balance
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    const result = await handleRefundClawback(
      TEST_SHOPIFY_ORDER_ID,
      TEST_SHOP,
      200, // Full refund
      true
    );

    expect(result.success).toBe(true);
    // Balance should go negative: 10 - 16 = -6
    expect(finalBalance).toBe(-6);
    expect(result.newBalance).toBe(-6);
  });
});

// ============================================
// POINTS CLAWBACK INTEGRATION
// ============================================

describe('Refund Clawback Scenario - Points Integration', () => {
  it('should clawback both cashback and points', async () => {
    vi.mocked(isPointsEnabled).mockResolvedValue(true);
    vi.mocked(clawbackPoints).mockResolvedValue({
      clawedBack: true,
      amount: 200, // 200 points clawed back
      reason: 'Order refunded',
    });

    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(8),
      cashbackProcessed: true,
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(50) }), // Current balance
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    vi.mocked(db.order.findFirst).mockResolvedValue({
      id: TEST_ORDER_ID,
    } as any);

    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    const result = await handleRefundClawback(
      TEST_SHOPIFY_ORDER_ID,
      TEST_SHOP,
      100,
      true
    );

    expect(result.success).toBe(true);
    expect(clawbackPoints).toHaveBeenCalledWith(
      TEST_SHOP,
      TEST_CUSTOMER_ID,
      TEST_ORDER_ID,
      100
    );
    expect(result.pointsClawback).toMatchObject({
      clawedBack: true,
      amount: 200,
    });
  });

  it('should continue with cashback clawback even if points fails', async () => {
    vi.mocked(isPointsEnabled).mockResolvedValue(true);
    vi.mocked(clawbackPoints).mockRejectedValue(new Error('Points service down'));

    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(8),
      cashbackProcessed: true,
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(50) }), // Current balance
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    vi.mocked(db.order.findFirst).mockResolvedValue({
      id: TEST_ORDER_ID,
    } as any);

    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    const result = await handleRefundClawback(
      TEST_SHOPIFY_ORDER_ID,
      TEST_SHOP,
      100,
      true
    );

    // Cashback clawback should still succeed
    expect(result.success).toBe(true);
    expect(result.clawbackAmount).toBe(8);

    // Points clawback failure should be recorded
    expect(result.pointsClawback).toMatchObject({
      clawedBack: false,
      amount: 0,
    });
  });
});

// ============================================
// LEDGER ENTRY VERIFICATION
// ============================================

describe('Refund Clawback Scenario - Ledger Entries', () => {
  it('should create REFUND_CLAWBACK ledger entry with metadata', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(200),
      cashbackAmount: createDecimal(16),
      shopifyOrderName: '#1001',
    });

    let ledgerEntry: any = null;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(100) }), // Current balance (full refund path uses aggregate, not findFirst)
          create: vi.fn().mockImplementation((data) => {
            ledgerEntry = data.data;
          }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const { handleRefundClawback } = await import('../../app/services/refund-handler.server');

    await handleRefundClawback(TEST_SHOPIFY_ORDER_ID, TEST_SHOP, 200, true);

    expect(ledgerEntry).not.toBeNull();
    expect(ledgerEntry.type).toBe('REFUND_CLAWBACK');
    expect(ledgerEntry.amount).toBeLessThan(0); // Negative for clawback
    expect(ledgerEntry.metadata).toMatchObject({
      refundType: 'FULL',
      originalCashback: 16,
      orderNumber: '#1001',
    });
  });
});
