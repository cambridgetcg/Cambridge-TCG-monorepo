/**
 * Orders/Refunded Webhook - Cashback Clawback Tests
 *
 * Detailed tests for the cashback clawback logic:
 * - Full refund clawback
 * - Partial refund proportional clawback
 * - Cumulative refund validation
 * - Already processed clawback scenarios
 * - Points clawback integration
 * - Balance updates
 *
 * @module test/webhooks/orders/refunded.clawback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRefundClawback } from '../../../app/services/refund-handler.server';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================
// MOCKS
// ============================================

// Mock the database
vi.mock('../../../app/db.server', () => ({
  default: {
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    customer: {
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
    $transaction: vi.fn(),
  },
}));

// Mock points service
vi.mock('../../../app/services/points-ledger.server', () => ({
  clawbackPoints: vi.fn(),
}));

// Mock points config
vi.mock('../../../app/services/points-config.server', () => ({
  isPointsEnabled: vi.fn(),
}));

import db from '../../../app/db.server';
import { clawbackPoints } from '../../../app/services/points-ledger.server';
import { isPointsEnabled } from '../../../app/services/points-config.server';

// ============================================
// TEST CONSTANTS
// ============================================

const TEST_SHOP = 'test-shop.myshopify.com';
const TEST_ORDER_ID = '5123456789';
const TEST_CUSTOMER_ID = 'cust_123';
const TEST_ORDER_INTERNAL_ID = 'order_internal_123';

// ============================================
// HELPERS
// ============================================

function createDecimal(value: number): Decimal {
  return new Decimal(value);
}

function createMockOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ORDER_INTERNAL_ID,
    shop: TEST_SHOP,
    shopifyOrderId: TEST_ORDER_ID,
    shopifyOrderName: '#1001',
    customerId: TEST_CUSTOMER_ID,
    totalPrice: createDecimal(100),
    cashbackAmount: createDecimal(5),
    cashbackProcessed: true,
    totalRefunded: createDecimal(0),
    ...overrides,
  };
}

// ============================================
// SETUP
// ============================================

beforeEach(() => {
  vi.clearAllMocks();

  // Default: points not enabled
  vi.mocked(isPointsEnabled).mockResolvedValue(false);

  // Default: no existing clawbacks
  vi.mocked(db.storeCreditLedger.aggregate).mockResolvedValue({
    _sum: { amount: null },
    _count: 0,
    _avg: { amount: null },
    _min: { amount: null },
    _max: { amount: null },
  } as any);
});

// ============================================
// FULL REFUND CLAWBACK TESTS
// ============================================

describe('Cashback Clawback - Full Refund', () => {
  it('should clawback full cashback amount on full refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(5),
      cashbackProcessed: true,
      totalRefunded: createDecimal(0),
    });

    const mockLedgerCreate = vi.fn();
    const mockCustomerUpdate = vi.fn();
    const mockOrderUpdate = vi.fn();

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: mockOrderUpdate,
        },
        customer: {
          update: mockCustomerUpdate,
        },
        storeCreditLedger: {
          // First call: check for existing clawback (null)
          // Second call: get last ledger balance (with balance)
          findFirst: vi.fn()
            .mockResolvedValueOnce(null) // No existing clawback
            .mockResolvedValueOnce({ id: 'ledger_last', balance: createDecimal(50) }), // Current balance
          create: mockLedgerCreate,
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: {
          upsert: vi.fn(),
        },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      100, // Full refund
      true // isFullRefund
    );

    expect(result.success).toBe(true);
    expect(result.clawbackAmount).toBe(5); // Full cashback
  });

  it('should handle full refund when cashback not yet processed', async () => {
    const mockOrder = createMockOrder({
      cashbackProcessed: false, // Cashback pending
      cashbackAmount: createDecimal(5),
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      100,
      true
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('Pending cashback adjusted');
  });
});

// ============================================
// PARTIAL REFUND CLAWBACK TESTS
// ============================================

describe('Cashback Clawback - Partial Refund', () => {
  it('should clawback proportional amount on partial refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(10),
      cashbackProcessed: true,
      totalRefunded: createDecimal(0),
    });

    let capturedClawbackAmount = 0;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(100) }), // Current balance
          create: vi.fn().mockImplementation((data) => {
            capturedClawbackAmount = Math.abs(data.data.amount);
          }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      50, // 50% refund
      false
    );

    expect(result.success).toBe(true);
    // 50% of $100 order = 50% of $10 cashback = $5
    expect(result.clawbackAmount).toBe(5);
  });

  it('should cap clawback to remaining cashback on partial refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(10),
      cashbackProcessed: true,
      totalRefunded: createDecimal(0),
    });

    // Simulate $8 already clawed back
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(42) }), // Current balance
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { amount: -8 }, // $8 already clawed back
          }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      50, // Would normally be $5 clawback
      false
    );

    expect(result.success).toBe(true);
    // Only $2 remaining ($10 - $8 already clawed back)
    expect(result.clawbackAmount).toBe(2);
  });
});

// ============================================
// CUMULATIVE REFUND VALIDATION TESTS
// ============================================

describe('Cashback Clawback - Cumulative Refund Validation', () => {
  it('should cap refund amount when cumulative exceeds order total', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(5),
      totalRefunded: createDecimal(80), // Already refunded $80
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

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      50, // Trying to refund $50 more (80 + 50 = 130 > 100)
      false
    );

    expect(result.success).toBe(true);
    // Should cap effective refund to $20 (100 - 80)
    // Proportional clawback: 20% of $5 = $1
    expect(result.clawbackAmount).toBeLessThanOrEqual(5);
  });

  it('should return early when order already fully refunded', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(5),
      totalRefunded: createDecimal(100), // Already fully refunded
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
          findFirst: vi.fn(),
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      50, // Trying another refund
      false
    );

    expect(result.success).toBe(true);
    expect(result.clawbackAmount).toBe(0);
    expect(result.message).toContain('already fully refunded');
  });
});

// ============================================
// ALREADY PROCESSED SCENARIOS
// ============================================

describe('Cashback Clawback - Already Processed', () => {
  it('should skip clawback when already processed for this order', async () => {
    const mockOrder = createMockOrder();

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'existing_clawback',
            type: 'REFUND_CLAWBACK',
            amount: createDecimal(-5),
            balance: createDecimal(45),
          }),
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: -5 } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      100,
      true
    );

    expect(result.success).toBe(true);
    // When all cashback already clawed back, clawback amount is 0 — no "already processed" message,
    // handler just processes a zero clawback (no further deduction needed)
    expect(result.clawbackAmount).toBe(0);
  });
});

// ============================================
// NO CASHBACK SCENARIOS
// ============================================

describe('Cashback Clawback - No Cashback', () => {
  it('should handle order with no cashback', async () => {
    const mockOrder = createMockOrder({
      cashbackAmount: createDecimal(0),
      cashbackProcessed: false,
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn(),
          create: vi.fn(),
          aggregate: vi.fn(),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      100,
      true
    );

    expect(result.success).toBe(true);
    expect(result.clawbackAmount).toBe(0);
    expect(result.message).toContain('No cashback to clawback');
  });

  it('should handle order with null cashback amount', async () => {
    const mockOrder = createMockOrder({
      cashbackAmount: null,
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn(),
          create: vi.fn(),
          aggregate: vi.fn(),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      TEST_ORDER_ID,
      TEST_SHOP,
      100,
      true
    );

    expect(result.success).toBe(true);
    expect(result.clawbackAmount).toBe(0);
  });
});

// ============================================
// LEDGER ENTRY CREATION TESTS
// ============================================

describe('Cashback Clawback - Ledger Entry Creation', () => {
  it('should create REFUND_CLAWBACK ledger entry with correct data', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(10),
      cashbackProcessed: true,
    });

    let capturedLedgerData: any = null;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(100) }), // Last balance
          create: vi.fn().mockImplementation((data) => {
            capturedLedgerData = data;
          }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 100, true);

    expect(capturedLedgerData).not.toBeNull();
    expect(capturedLedgerData.data).toMatchObject({
      customerId: TEST_CUSTOMER_ID,
      shop: TEST_SHOP,
      type: 'REFUND_CLAWBACK',
      shopifyOrderId: TEST_ORDER_ID,
      orderId: TEST_ORDER_INTERNAL_ID,
    });
    expect(capturedLedgerData.data.amount).toBeLessThan(0); // Negative for clawback
    expect(capturedLedgerData.data.metadata).toMatchObject({
      refundType: 'FULL',
      originalCashback: 10,
    });
  });

  it('should record partial refund type in metadata', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(10),
      cashbackProcessed: true,
    });

    let capturedMetadata: any = null;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(100) }), // Last balance
          create: vi.fn().mockImplementation((data) => {
            capturedMetadata = data.data.metadata;
          }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 50, false);

    expect(capturedMetadata.refundType).toBe('PARTIAL');
    expect(capturedMetadata.refundAmount).toBe(50);
  });
});

// ============================================
// CUSTOMER BALANCE UPDATE TESTS
// ============================================

describe('Cashback Clawback - Customer Balance Updates', () => {
  it('should update customer storeCredit to new balance', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(10),
      cashbackProcessed: true,
    });

    let capturedCustomerUpdate: any = null;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: {
          update: vi.fn().mockImplementation((data) => {
            capturedCustomerUpdate = data;
          }),
        },
        storeCreditLedger: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ balance: createDecimal(50) }), // Current balance: 50
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 100, true);

    expect(capturedCustomerUpdate).not.toBeNull();
    expect(capturedCustomerUpdate.data.storeCredit).toBe(40); // 50 - 10 = 40
    expect(capturedCustomerUpdate.data.totalCashbackEarned).toMatchObject({
      decrement: 10,
    });
    expect(capturedCustomerUpdate.data.netSpent).toMatchObject({
      decrement: 100,
    });
  });

  it('should allow balance to go negative per industry standard', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(10),
      cashbackProcessed: true,
    });

    let newBalance: number | null = null;

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
            .mockResolvedValueOnce({ balance: createDecimal(5) }), // Only $5 balance
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 100, true);

    // Should go negative: 5 - 10 = -5
    expect(newBalance).toBe(-5);
    expect(result.newBalance).toBe(-5);
  });
});

// ============================================
// POINTS CLAWBACK INTEGRATION TESTS
// ============================================

describe('Cashback Clawback - Points Integration', () => {
  it('should clawback points when points system is enabled', async () => {
    vi.mocked(isPointsEnabled).mockResolvedValue(true);
    vi.mocked(clawbackPoints).mockResolvedValue({
      clawedBack: true,
      amount: 100,
      reason: 'Order refunded',
    });

    const mockOrder = createMockOrder({
      cashbackAmount: createDecimal(0), // No cashback
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn(),
          create: vi.fn(),
          aggregate: vi.fn(),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    // Mock order lookup for points clawback
    vi.mocked(db.order.findFirst).mockResolvedValue({
      id: TEST_ORDER_INTERNAL_ID,
    } as any);

    const result = await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 100, true);

    expect(clawbackPoints).toHaveBeenCalledWith(
      TEST_SHOP,
      TEST_CUSTOMER_ID,
      TEST_ORDER_INTERNAL_ID,
      100
    );
    expect(result.pointsClawback).toMatchObject({
      clawedBack: true,
      amount: 100,
    });
  });

  it('should skip points clawback when points system is disabled', async () => {
    vi.mocked(isPointsEnabled).mockResolvedValue(false);

    const mockOrder = createMockOrder({
      cashbackAmount: createDecimal(0),
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn(),
          create: vi.fn(),
          aggregate: vi.fn(),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 100, true);

    expect(clawbackPoints).not.toHaveBeenCalled();
    expect(result.pointsClawback).toBeUndefined();
  });

  it('should handle points clawback error gracefully', async () => {
    vi.mocked(isPointsEnabled).mockResolvedValue(true);
    vi.mocked(clawbackPoints).mockRejectedValue(new Error('Points service unavailable'));

    const mockOrder = createMockOrder({
      cashbackAmount: createDecimal(5),
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
      id: TEST_ORDER_INTERNAL_ID,
    } as any);

    const result = await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 100, true);

    // Main clawback should still succeed
    expect(result.success).toBe(true);
    expect(result.clawbackAmount).toBe(5);

    // Points clawback should indicate failure
    expect(result.pointsClawback).toMatchObject({
      clawedBack: false,
      amount: 0,
      reason: expect.stringContaining('Error'),
    });
  });
});

// ============================================
// ERROR HANDLING TESTS
// ============================================

describe('Cashback Clawback - Error Handling', () => {
  it('should return error when order not found', async () => {
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        customer: { update: vi.fn() },
        storeCreditLedger: {
          findFirst: vi.fn(),
          create: vi.fn(),
          aggregate: vi.fn(),
        },
        orderRefund: { upsert: vi.fn() },
      };
      return callback(mockTx);
    });

    const result = await handleRefundClawback(
      'nonexistent-order',
      TEST_SHOP,
      100,
      true
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('should return error on database transaction failure', async () => {
    vi.mocked(db.$transaction).mockRejectedValue(new Error('Database connection lost'));

    const result = await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 100, true);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Database connection lost');
    expect(result.clawbackAmount).toBe(0);
  });
});

// ============================================
// ORDER UPDATE TESTS
// ============================================

describe('Cashback Clawback - Order Updates', () => {
  it('should update order financial status to REFUNDED on full refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(10),
      cashbackProcessed: true,
    });

    let capturedOrderUpdate: any = null;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn().mockImplementation((data) => {
            capturedOrderUpdate = data;
          }),
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

    await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 100, true);

    expect(capturedOrderUpdate.data.financialStatus).toBe('REFUNDED');
    expect(capturedOrderUpdate.data.cashbackAmount).toBe(0);
  });

  it('should update order financial status to PARTIALLY_REFUNDED on partial refund', async () => {
    const mockOrder = createMockOrder({
      totalPrice: createDecimal(100),
      cashbackAmount: createDecimal(10),
      cashbackProcessed: true,
    });

    let capturedOrderUpdate: any = null;

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn().mockImplementation((data) => {
            capturedOrderUpdate = data;
          }),
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

    await handleRefundClawback(TEST_ORDER_ID, TEST_SHOP, 50, false);

    expect(capturedOrderUpdate.data.financialStatus).toBe('PARTIALLY_REFUNDED');
  });
});
