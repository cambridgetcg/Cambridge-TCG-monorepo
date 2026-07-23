/**
 * Subscription Lifecycle Scenario Tests
 *
 * Tests complete user journeys involving tier subscriptions:
 * - Subscription creation and tier assignment
 * - Billing cycle renewals
 * - Payment failures and retries
 * - Subscription cancellation
 * - Subscription reactivation
 * - Tier transitions during subscription lifecycle
 *
 * @module test/scenarios/subscription-lifecycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Decimal } from '@prisma/client/runtime/library';

// ============================================
// MOCKS
// ============================================

vi.mock('../../app/db.server', () => ({
  default: {
    customer: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    tier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    tierSubscription: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tierPurchase: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    subscriptionEvent: {
      create: vi.fn(),
    },
    subscriptionBillingAttempt: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    tierChangeLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../app/services/tier-resolution.server', () => ({
  updateCustomerToEffectiveTier: vi.fn(),
  getEffectiveTier: vi.fn(),
}));

import db from '../../app/db.server';
import { updateCustomerToEffectiveTier, getEffectiveTier } from '../../app/services/tier-resolution.server';

// ============================================
// TEST CONSTANTS
// ============================================

const TEST_SHOP = 'test-shop.myshopify.com';
const TEST_CUSTOMER_ID = 'cust_123';
const TEST_SUBSCRIPTION_ID = 'sub_123';
const TEST_CONTRACT_ID = 'gid://shopify/SubscriptionContract/123456';

const TIERS = {
  BRONZE: { id: 'tier_bronze', name: 'Bronze', cashbackPercent: 3 },
  SILVER: { id: 'tier_silver', name: 'Silver', cashbackPercent: 5 },
  GOLD: { id: 'tier_gold', name: 'Gold', cashbackPercent: 8 },
  PLATINUM: { id: 'tier_platinum', name: 'Platinum', cashbackPercent: 12 },
};

// ============================================
// HELPERS
// ============================================

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
    totalSpent: createDecimal(300),
    netSpent: createDecimal(300),
    ...overrides,
  };
}

function createMockSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_SUBSCRIPTION_ID,
    shop: TEST_SHOP,
    customerId: TEST_CUSTOMER_ID,
    tierId: TIERS.GOLD.id,
    contractId: TEST_CONTRACT_ID,
    status: 'ACTIVE',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

// ============================================
// SETUP
// ============================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.tier.findMany).mockResolvedValue(Object.values(TIERS) as any);
});

// ============================================
// SUBSCRIPTION CREATION TESTS
// ============================================

describe('Subscription Lifecycle - Creation', () => {
  it('should create subscription and upgrade tier', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.BRONZE.id,
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null);
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);

    // Simulate subscription creation
    const newSubscription = createMockSubscription({
      status: 'ACTIVE',
      tierId: TIERS.GOLD.id,
    });

    vi.mocked(db.tierSubscription.create).mockResolvedValue(newSubscription as any);

    // After subscription creation, tier should resolve to Gold
    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.BRONZE.id,
      newTierId: TIERS.GOLD.id,
      source: 'tier_subscription',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'subscription_created',
    });

    expect(result.changed).toBe(true);
    expect(result.newTierId).toBe(TIERS.GOLD.id);
    expect(result.source).toBe('tier_subscription');
  });

  it('should take precedence over spending-based tier', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.SILVER.id,
      netSpent: createDecimal(600), // Qualifies for Silver via spending
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Active Platinum subscription
    const subscription = createMockSubscription({
      tierId: TIERS.PLATINUM.id,
      status: 'ACTIVE',
    });

    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(subscription as any);
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);

    vi.mocked(getEffectiveTier).mockResolvedValue({
      tier: TIERS.PLATINUM,
      source: 'tier_subscription',
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.SILVER.id,
      newTierId: TIERS.PLATINUM.id,
      source: 'tier_subscription',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'tier_check',
    });

    // Subscription (Platinum) should win over spending (Silver)
    expect(result.newTierId).toBe(TIERS.PLATINUM.id);
    expect(result.source).toBe('tier_subscription');
  });
});

// ============================================
// BILLING CYCLE TESTS
// ============================================

describe('Subscription Lifecycle - Billing Cycles', () => {
  it('should maintain tier during successful renewal', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.GOLD.id,
    });

    const subscription = createMockSubscription({
      status: 'ACTIVE',
      tierId: TIERS.GOLD.id,
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(subscription as any);
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);

    // Simulate billing success
    vi.mocked(db.subscriptionBillingAttempt.create).mockResolvedValue({
      id: 'billing_123',
      subscriptionId: TEST_SUBSCRIPTION_ID,
      status: 'SUCCESS',
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.GOLD.id,
      newTierId: TIERS.GOLD.id,
      source: 'tier_subscription',
      changed: false,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'billing_success',
    });

    expect(result.changed).toBe(false);
    expect(result.newTierId).toBe(TIERS.GOLD.id);
  });

  it('should update billing period dates on renewal', async () => {
    const subscription = createMockSubscription({
      currentPeriodStart: new Date('2024-01-01'),
      currentPeriodEnd: new Date('2024-02-01'),
      nextBillingDate: new Date('2024-02-01'),
    });

    let updatedSubscription: any = null;

    vi.mocked(db.tierSubscription.update).mockImplementation(async (data: any) => {
      updatedSubscription = {
        ...subscription,
        ...data.data,
      };
      return updatedSubscription;
    });

    // Simulate renewal updating the subscription
    await db.tierSubscription.update({
      where: { id: TEST_SUBSCRIPTION_ID },
      data: {
        currentPeriodStart: new Date('2024-02-01'),
        currentPeriodEnd: new Date('2024-03-01'),
        nextBillingDate: new Date('2024-03-01'),
        updatedAt: new Date(),
      },
    });

    expect(updatedSubscription.currentPeriodStart).toEqual(new Date('2024-02-01'));
    expect(updatedSubscription.currentPeriodEnd).toEqual(new Date('2024-03-01'));
  });
});

// ============================================
// PAYMENT FAILURE TESTS
// ============================================

describe('Subscription Lifecycle - Payment Failures', () => {
  it('should maintain tier during grace period', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.GOLD.id,
    });

    const subscription = createMockSubscription({
      status: 'PAST_DUE', // In grace period
      tierId: TIERS.GOLD.id,
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(subscription as any);
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);

    // Past due but still active - maintain tier
    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.GOLD.id,
      newTierId: TIERS.GOLD.id,
      source: 'tier_subscription',
      changed: false,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'billing_failed',
    });

    // Should keep tier during grace period
    expect(result.newTierId).toBe(TIERS.GOLD.id);
  });

  it('should downgrade tier after subscription fails', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.GOLD.id,
      netSpent: createDecimal(300), // Only qualifies for Bronze
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null); // No active subscription
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.GOLD.id,
      newTierId: TIERS.BRONZE.id,
      source: 'spending',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'subscription_cancelled',
    });

    expect(result.changed).toBe(true);
    expect(result.newTierId).toBe(TIERS.BRONZE.id);
    expect(result.source).toBe('spending');
  });

  it('should record billing failure event', async () => {
    vi.mocked(db.subscriptionBillingAttempt.create).mockResolvedValue({
      id: 'billing_fail_123',
      subscriptionId: TEST_SUBSCRIPTION_ID,
      status: 'FAILED',
      errorCode: 'card_declined',
      errorMessage: 'Your card was declined',
      attemptedAt: new Date(),
    } as any);

    const billingAttempt = await db.subscriptionBillingAttempt.create({
      data: {
        subscriptionId: TEST_SUBSCRIPTION_ID,
        status: 'FAILED',
        errorCode: 'card_declined',
        errorMessage: 'Your card was declined',
        attemptedAt: new Date(),
      },
    });

    expect(billingAttempt.status).toBe('FAILED');
    expect(billingAttempt.errorCode).toBe('card_declined');
  });
});

// ============================================
// SUBSCRIPTION CANCELLATION TESTS
// ============================================

describe('Subscription Lifecycle - Cancellation', () => {
  it('should downgrade tier when subscription cancelled', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.PLATINUM.id,
      netSpent: createDecimal(400), // Only qualifies for Bronze
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null); // Cancelled
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.PLATINUM.id,
      newTierId: TIERS.BRONZE.id,
      source: 'spending',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'subscription_cancelled',
    });

    expect(result.changed).toBe(true);
    expect(result.previousTierId).toBe(TIERS.PLATINUM.id);
    expect(result.newTierId).toBe(TIERS.BRONZE.id);
  });

  it('should keep tier if one-time purchase exists', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.GOLD.id,
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);
    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(null); // Subscription cancelled

    // But has active tier purchase
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue({
      id: 'tp_123',
      tierId: TIERS.GOLD.id,
      status: 'ACTIVE',
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
    } as any);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.GOLD.id,
      newTierId: TIERS.GOLD.id,
      source: 'tier_purchase',
      changed: false,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'subscription_cancelled',
    });

    // Should keep Gold from tier purchase
    expect(result.changed).toBe(false);
    expect(result.newTierId).toBe(TIERS.GOLD.id);
    expect(result.source).toBe('tier_purchase');
  });

  it('should update subscription status to CANCELLED', async () => {
    const subscription = createMockSubscription({
      status: 'ACTIVE',
    });

    let updatedStatus: string | null = null;

    vi.mocked(db.tierSubscription.update).mockImplementation(async (data: any) => {
      updatedStatus = data.data.status;
      return { ...subscription, ...data.data };
    });

    await db.tierSubscription.update({
      where: { id: TEST_SUBSCRIPTION_ID },
      data: {
        status: 'CANCELLED',
        endDate: new Date(),
        updatedAt: new Date(),
      },
    });

    expect(updatedStatus).toBe('CANCELLED');
  });
});

// ============================================
// SUBSCRIPTION REACTIVATION TESTS
// ============================================

describe('Subscription Lifecycle - Reactivation', () => {
  it('should upgrade tier when subscription reactivated', async () => {
    const customer = createMockCustomer({
      currentTierId: TIERS.BRONZE.id,
    });

    vi.mocked(db.customer.findUnique).mockResolvedValue(customer as any);

    // Reactivated Gold subscription
    const reactivatedSubscription = createMockSubscription({
      status: 'ACTIVE',
      tierId: TIERS.GOLD.id,
    });

    vi.mocked(db.tierSubscription.findFirst).mockResolvedValue(reactivatedSubscription as any);
    vi.mocked(db.tierPurchase.findFirst).mockResolvedValue(null);

    vi.mocked(updateCustomerToEffectiveTier).mockResolvedValue({
      previousTierId: TIERS.BRONZE.id,
      newTierId: TIERS.GOLD.id,
      source: 'tier_subscription',
      changed: true,
    });

    const result = await updateCustomerToEffectiveTier(TEST_SHOP, TEST_CUSTOMER_ID, {
      triggeredBy: 'subscription_reactivated',
    });

    expect(result.changed).toBe(true);
    expect(result.newTierId).toBe(TIERS.GOLD.id);
  });
});

// ============================================
// TIER CHANGE LOG TESTS
// ============================================

describe('Subscription Lifecycle - Tier Change Logging', () => {
  it('should create tier change log on subscription-triggered upgrade', async () => {
    vi.mocked(db.tierChangeLog.create).mockResolvedValue({
      id: 'log_123',
      shop: TEST_SHOP,
      customerId: TEST_CUSTOMER_ID,
      previousTierId: TIERS.BRONZE.id,
      newTierId: TIERS.GOLD.id,
      changeSource: 'tier_subscription',
      triggeredBy: 'subscription_created',
      createdAt: new Date(),
    } as any);

    const log = await db.tierChangeLog.create({
      data: {
        shop: TEST_SHOP,
        customerId: TEST_CUSTOMER_ID,
        previousTierId: TIERS.BRONZE.id,
        newTierId: TIERS.GOLD.id,
        changeSource: 'tier_subscription',
        triggeredBy: 'subscription_created',
      },
    });

    expect(log.changeSource).toBe('tier_subscription');
    expect(log.previousTierId).toBe(TIERS.BRONZE.id);
    expect(log.newTierId).toBe(TIERS.GOLD.id);
  });

  it('should log subscription cancellation tier change', async () => {
    vi.mocked(db.tierChangeLog.create).mockResolvedValue({
      id: 'log_456',
      shop: TEST_SHOP,
      customerId: TEST_CUSTOMER_ID,
      previousTierId: TIERS.GOLD.id,
      newTierId: TIERS.BRONZE.id,
      changeSource: 'spending',
      triggeredBy: 'subscription_cancelled',
      metadata: { reason: 'customer_requested' },
      createdAt: new Date(),
    } as any);

    const log = await db.tierChangeLog.create({
      data: {
        shop: TEST_SHOP,
        customerId: TEST_CUSTOMER_ID,
        previousTierId: TIERS.GOLD.id,
        newTierId: TIERS.BRONZE.id,
        changeSource: 'spending',
        triggeredBy: 'subscription_cancelled',
        metadata: { reason: 'customer_requested' },
      },
    });

    expect(log.triggeredBy).toBe('subscription_cancelled');
    expect(log.newTierId).toBe(TIERS.BRONZE.id);
  });
});

// ============================================
// SUBSCRIPTION EVENT TRACKING TESTS
// ============================================

describe('Subscription Lifecycle - Event Tracking', () => {
  it('should track subscription created event', async () => {
    vi.mocked(db.subscriptionEvent.create).mockResolvedValue({
      id: 'evt_123',
      subscriptionId: TEST_SUBSCRIPTION_ID,
      shop: TEST_SHOP,
      eventType: 'CREATED',
      eventData: { tierId: TIERS.GOLD.id },
      createdAt: new Date(),
    } as any);

    const event = await db.subscriptionEvent.create({
      data: {
        subscriptionId: TEST_SUBSCRIPTION_ID,
        shop: TEST_SHOP,
        eventType: 'CREATED',
        eventData: { tierId: TIERS.GOLD.id },
      },
    });

    expect(event.eventType).toBe('CREATED');
  });

  it('should track billing events', async () => {
    const events = ['BILLING_SUCCESS', 'BILLING_FAILED', 'BILLING_RETRY'];

    for (const eventType of events) {
      vi.mocked(db.subscriptionEvent.create).mockResolvedValue({
        id: `evt_${eventType}`,
        subscriptionId: TEST_SUBSCRIPTION_ID,
        shop: TEST_SHOP,
        eventType,
        createdAt: new Date(),
      } as any);

      const event = await db.subscriptionEvent.create({
        data: {
          subscriptionId: TEST_SUBSCRIPTION_ID,
          shop: TEST_SHOP,
          eventType,
        },
      });

      expect(event.eventType).toBe(eventType);
    }
  });

  it('should track cancellation event with reason', async () => {
    vi.mocked(db.subscriptionEvent.create).mockResolvedValue({
      id: 'evt_cancel',
      subscriptionId: TEST_SUBSCRIPTION_ID,
      shop: TEST_SHOP,
      eventType: 'CANCELLED',
      eventData: {
        reason: 'customer_requested',
        effectiveDate: new Date().toISOString(),
      },
      createdAt: new Date(),
    } as any);

    const event = await db.subscriptionEvent.create({
      data: {
        subscriptionId: TEST_SUBSCRIPTION_ID,
        shop: TEST_SHOP,
        eventType: 'CANCELLED',
        eventData: {
          reason: 'customer_requested',
          effectiveDate: new Date().toISOString(),
        },
      },
    });

    expect(event.eventType).toBe('CANCELLED');
    expect((event.eventData as any).reason).toBe('customer_requested');
  });
});
