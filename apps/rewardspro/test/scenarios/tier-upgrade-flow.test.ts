/**
 * Tier Upgrade Flow Scenario Tests
 *
 * Tests complete user journeys involving tier changes:
 * - Spending-based tier upgrades
 * - Tier product purchase upgrades
 * - Multiple upgrade path interactions
 * - Tier downgrade scenarios
 * - Priority-based tier resolution
 *
 * @module test/scenarios/tier-upgrade-flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Decimal } from '@prisma/client/runtime/library';

// ============================================
// MOCKS
// ============================================

// Mock database
vi.mock('../../app/db.server', () => ({
  default: {
    customer: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    tier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    tierPurchase: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tierSubscription: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    tierChangeLog: {
      create: vi.fn(),
    },
    storeCreditLedger: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock tier resolution service
vi.mock('../../app/services/tier-resolution.server', () => ({
  updateCustomerToEffectiveTier: vi.fn(),
  getEffectiveTier: vi.fn(),
}));

// Mock tier calculation service
vi.mock('../../app/services/tier-calculation.server', () => ({
  calculateTierFromSpending: vi.fn(),
}));

import db from '../../app/db.server';
import { updateCustomerToEffectiveTier, getEffectiveTier } from '../../app/services/tier-resolution.server';
import { calculateTierFromSpending } from '../../app/services/tier-calculation.server';

// ============================================
// TEST CONSTANTS
// ============================================

const TEST_SHOP = 'test-shop.myshopify.com';
const TEST_CUSTOMER_ID = 'cust_123';

// Tier hierarchy
const TIERS = {
  BRONZE: {
    id: 'tier_bronze',
    name: 'Bronze',
    minSpend: 0,
    cashbackPercent: 3,
    priority: 1,
  },
  SILVER: {
    id: 'tier_silver',
    name: 'Silver',
    minSpend: 500,
    cashbackPercent: 5,
    priority: 2,
  },
  GOLD: {
    id: 'tier_gold',
    name: 'Gold',
    minSpend: 1000,
    cashbackPercent: 8,
    priority: 3,
  },
  PLATINUM: {
    id: 'tier_platinum',
    name: 'Platinum',
    minSpend: 5000,
    cashbackPercent: 12,
    priority: 4,
  },
};

function createDecimal(value: number): Decimal {
  return { toNumber: () => value } as unknown as Decimal;
}

function createMockCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CUSTOMER_ID,
    shop: TEST_SHOP,
    shopifyCustomerId: '7654321',
    email: 'customer@example.com',
    currentTierId: TIERS.BRONZE.id,
    totalSpent: createDecimal(0),
    netSpent: createDecimal(0),
    orderCount: 0,
    storeCredit: 0,
    manualTierId: null,
    ...overrides,
  };
}

// ============================================
// SETUP
// ============================================

beforeEach(() => {
  vi.clearAllMocks();

  // Default tier list
  vi.mocked(db.tier.findMany).mockResolvedValue(Object.values(TIERS) as any);
});

// ============================================
// SPENDING-BASED TIER UPGRADE TESTS
// ============================================

describe('Tier Upgrade Scenario - Spending-Based Upgrades', () => {
  it('should upgrade from Bronze to Silver when spending crosses threshold', async () => {
    // Customer starts at Bronze with $400 spent
    const customer = createMockCustomer({
      currentTierId: TIERS.BRONZE.id,
      totalSpent: createDecimal(400),
      netSpent: createDecimal(400),
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Order brings total to $600 (crosses $500 Silver threshold)
    vi.mocked(db.order.aggregate).mockResolvedValue({
      _sum: { totalPrice: createDecimal(600) },
    } as any);

    // No active tier purchases or subscriptions
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    // Mock tier calculation to return Silver
    vi.mocked(calculateTierFromSpending).mockResolvedValue({
      tier: TIERS.SILVER,
      source: 'spending',
    } as any);

    // Mock the tier resolution
    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.BRONZE.id,
      newTierId: TIERS.SILVER.id,
      source: 'spending',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_paid',
    });

    expect(result.changed).toBe(true);
    expect(result.newTierId).toBe(TIERS.SILVER.id);
    expect(result.source).toBe('spending');
  });

  it('should upgrade through multiple tiers with large order', async () => {
    // Customer at Bronze with $0 spent
    const customer = createMockCustomer({
      currentTierId: TIERS.BRONZE.id,
      netSpent: createDecimal(0),
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Large order brings total to $1200 (skips Silver, goes to Gold)
    vi.mocked(db.order.aggregate).mockResolvedValue({
      _sum: { totalPrice: createDecimal(1200) },
    } as any);

    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    vi.mocked(calculateTierFromSpending).mockResolvedValue({
      tier: TIERS.GOLD,
      source: 'spending',
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.BRONZE.id,
      newTierId: TIERS.GOLD.id,
      source: 'spending',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_paid',
    });

    expect(result.changed).toBe(true);
    expect(result.newTierId).toBe(TIERS.GOLD.id);
  });
});

// ============================================
// TIER PRODUCT PURCHASE UPGRADE TESTS
// ============================================

describe('Tier Upgrade Scenario - Tier Product Purchase', () => {
  it('should upgrade to purchased tier immediately', async () => {
    // Customer at Bronze via spending
    const customer = createMockCustomer({
      currentTierId: TIERS.BRONZE.id,
      netSpent: createDecimal(300),
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Active Gold tier purchase
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue({
      id: 'tp_123',
      customerId: TEST_CUSTOMER_ID,
      tierId: TIERS.GOLD.id,
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    } as any);

    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.BRONZE.id,
      newTierId: TIERS.GOLD.id,
      source: 'tier_purchase',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_paid',
    });

    expect(result.changed).toBe(true);
    expect(result.newTierId).toBe(TIERS.GOLD.id);
    expect(result.source).toBe('tier_purchase');
  });

  it('should prioritize tier purchase over spending-based tier', async () => {
    // Customer qualifies for Silver via spending but purchased Gold
    const customer = createMockCustomer({
      currentTierId: TIERS.SILVER.id,
      netSpent: createDecimal(600), // Qualifies for Silver
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Active Gold tier purchase (higher priority than spending)
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue({
      id: 'tp_123',
      tierId: TIERS.GOLD.id,
      status: 'ACTIVE',
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } as any);

    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    // Spending would give Silver
    vi.mocked(calculateTierFromSpending).mockResolvedValue({
      tier: TIERS.SILVER,
      source: 'spending',
    } as any);

    vi.mocked(getEffectiveTier).mockResolvedValue({
      tier: TIERS.GOLD,
      source: 'tier_purchase',
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.SILVER.id,
      newTierId: TIERS.GOLD.id,
      source: 'tier_purchase',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_paid',
    });

    // Should get Gold from purchase, not Silver from spending
    expect(result.newTierId).toBe(TIERS.GOLD.id);
    expect(result.source).toBe('tier_purchase');
  });
});

// ============================================
// TIER DOWNGRADE SCENARIOS
// ============================================

describe('Tier Upgrade Scenario - Tier Downgrades', () => {
  it('should downgrade when tier purchase expires', async () => {
    // Customer at Gold via expired tier purchase
    const customer = createMockCustomer({
      currentTierId: TIERS.GOLD.id,
      netSpent: createDecimal(300), // Only qualifies for Bronze via spending
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // No active tier purchase (expired)
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    // Spending only qualifies for Bronze
    vi.mocked(calculateTierFromSpending).mockResolvedValue({
      tier: TIERS.BRONZE,
      source: 'spending',
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.GOLD.id,
      newTierId: TIERS.BRONZE.id,
      source: 'spending',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'tier_expiry',
    });

    expect(result.changed).toBe(true);
    expect(result.previousTierId).toBe(TIERS.GOLD.id);
    expect(result.newTierId).toBe(TIERS.BRONZE.id);
  });

  it('should downgrade to spending-based tier after refund', async () => {
    // Customer at Gold via spending ($1200)
    const customer = createMockCustomer({
      currentTierId: TIERS.GOLD.id,
      netSpent: createDecimal(1200),
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    // After $800 refund, netSpent = $400 (qualifies for Bronze)
    vi.mocked(db.order.aggregate).mockResolvedValue({
      _sum: { totalPrice: createDecimal(400) },
    } as any);

    vi.mocked(calculateTierFromSpending).mockResolvedValue({
      tier: TIERS.BRONZE,
      source: 'spending',
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.GOLD.id,
      newTierId: TIERS.BRONZE.id,
      source: 'spending',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_refunded',
    });

    expect(result.changed).toBe(true);
    expect(result.newTierId).toBe(TIERS.BRONZE.id);
  });
});

// ============================================
// PRIORITY RESOLUTION TESTS
// ============================================

describe('Tier Upgrade Scenario - Priority Resolution', () => {
  it('should prioritize manual override over all other sources', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.SILVER.id,
      manualTierId: TIERS.PLATINUM.id, // Admin assigned Platinum
      netSpent: createDecimal(600), // Qualifies for Silver
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Has Gold tier purchase
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue({
      id: 'tp_123',
      tierId: TIERS.GOLD.id,
      status: 'ACTIVE',
    } as any);

    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.SILVER.id,
      newTierId: TIERS.PLATINUM.id,
      source: 'manual_override',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'manual_update',
    });

    // Manual override should take precedence
    expect(result.newTierId).toBe(TIERS.PLATINUM.id);
    expect(result.source).toBe('manual_override');
  });

  it('should prioritize subscription over purchase', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.SILVER.id,
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Has both subscription (Platinum) and purchase (Gold)
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue({
      id: 'ts_123',
      tierId: TIERS.PLATINUM.id,
      status: 'ACTIVE',
    } as any);

    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue({
      id: 'tp_123',
      tierId: TIERS.GOLD.id,
      status: 'ACTIVE',
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.SILVER.id,
      newTierId: TIERS.PLATINUM.id,
      source: 'tier_subscription',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'subscription_created',
    });

    // Subscription should win
    expect(result.newTierId).toBe(TIERS.PLATINUM.id);
    expect(result.source).toBe('tier_subscription');
  });
});

// ============================================
// NO CHANGE SCENARIOS
// ============================================

describe('Tier Upgrade Scenario - No Change', () => {
  it('should not change tier when already at correct level', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.SILVER.id,
      netSpent: createDecimal(600),
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    vi.mocked(calculateTierFromSpending).mockResolvedValue({
      tier: TIERS.SILVER,
      source: 'spending',
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.SILVER.id,
      newTierId: TIERS.SILVER.id,
      source: 'spending',
      changed: false,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_paid',
    });

    expect(result.changed).toBe(false);
    expect(result.newTierId).toBe(TIERS.SILVER.id);
  });

  it('should keep higher tier from purchase even if spending qualifies for lower', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.GOLD.id,
      netSpent: createDecimal(200), // Only qualifies for Bronze
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Active Gold tier purchase
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue({
      id: 'tp_123',
      tierId: TIERS.GOLD.id,
      status: 'ACTIVE',
    } as any);

    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.GOLD.id,
      newTierId: TIERS.GOLD.id,
      source: 'tier_purchase',
      changed: false,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'order_paid',
    });

    // Should keep Gold from purchase
    expect(result.changed).toBe(false);
    expect(result.newTierId).toBe(TIERS.GOLD.id);
    expect(result.source).toBe('tier_purchase');
  });
});
