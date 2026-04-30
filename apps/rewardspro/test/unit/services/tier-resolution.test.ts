/**
 * Direct unit tests for tier-resolution.server.ts
 *
 * Existing tests exercise the resolver only through `updateCustomerToEffectiveTier`
 * which always passes a transaction client — that path masked a TDZ bug
 * (`const prisma = options?.tx || prisma;` which threw ReferenceError when no
 * tx was provided). These tests call `resolveEffectiveTier` directly without
 * a tx to cover that path, plus exercise the priority resolution rules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// MOCKS
// ============================================

vi.mock('../../../app/db.server', () => ({
  default: {
    customer: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    tier: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    tierSubscription: { findMany: vi.fn() },
    tierPurchase: { findMany: vi.fn() },
    tierChangeLog: { create: vi.fn() },
    customerTierState: { upsert: vi.fn() },
    $transaction: vi.fn((fn: any) => fn({
      customer: { findFirst: vi.fn(), update: vi.fn() },
      tier: { findFirst: vi.fn(), findMany: vi.fn() },
      tierSubscription: { findMany: vi.fn() },
      tierPurchase: { findMany: vi.fn() },
      tierChangeLog: { create: vi.fn() },
      customerTierState: { upsert: vi.fn() },
    })),
  },
}));

vi.mock('../../../app/services/manual-tier-assignment.server', () => ({
  getManualOverride: vi.fn(),
  hasManualOverride: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../app/services/tier-calculation.server', () => ({
  calculateCustomerTierFromDB: vi.fn(),
}));

vi.mock('../../../app/services/base-tier.server', () => ({
  getBaseTier: vi.fn(),
  getBaseTierConfig: vi.fn().mockResolvedValue({ enabled: false, autoDetect: false }),
}));

vi.mock('../../../app/services/customer-tier-state-update.server', () => ({
  calculateProgress: vi.fn().mockReturnValue({
    progressPercent: 0,
    nextTierId: null,
    nextTierName: null,
    nextTierMinSpend: 0,
    amountToNextTier: 0,
    isMaxTier: false,
  }),
}));

vi.mock('../../../app/services/logger.server', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withContext: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

vi.mock('../../../app/services/monitoring/sentry.service', () => ({
  SentryService: {
    startTierResolutionTransaction: () => ({
      recordResult: vi.fn(),
      finish: vi.fn(),
    }),
    events: { tierChanged: vi.fn() },
    captureException: vi.fn(),
  },
}));

vi.mock('../../../app/services/sns-event-publisher.server', () => ({
  snsEventPublisher: {
    publishTierUpgrade: vi.fn().mockResolvedValue({ success: true }),
    publishTierDowngrade: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// ============================================
// IMPORTS (after mocks)
// ============================================

import db from '../../../app/db.server';
import { resolveEffectiveTier } from '../../../app/services/tier-resolution.server';
import { getManualOverride } from '../../../app/services/manual-tier-assignment.server';
import { calculateCustomerTierFromDB } from '../../../app/services/tier-calculation.server';
import { getBaseTier, getBaseTierConfig } from '../../../app/services/base-tier.server';

// ============================================
// FIXTURES
// ============================================

const SHOP = 'test-shop.myshopify.com';
const CUSTOMER_ID = 'cust_test_123';

const tierBasic = { id: 'tier_basic', name: 'Basic', minSpend: 0, cashbackPercent: 3, shop: SHOP };
const tierSilver = { id: 'tier_silver', name: 'Silver', minSpend: 100, cashbackPercent: 5, shop: SHOP };
const tierGold = { id: 'tier_gold', name: 'Gold', minSpend: 500, cashbackPercent: 8, shop: SHOP };

beforeEach(() => {
  vi.clearAllMocks();

  // Default: customer exists with no tier assigned
  (db.customer.findFirst as any).mockResolvedValue({
    id: CUSTOMER_ID,
    shop: SHOP,
    currentTierId: null,
    currentTier: null,
    netSpent: 0,
  });

  // Default: no override, no subscription, no purchase, no spending tier, no base tier
  (getManualOverride as any).mockResolvedValue({ hasOverride: false, tierId: null, tierName: null });
  (db.tierSubscription.findMany as any).mockResolvedValue([]);
  (db.tierPurchase.findMany as any).mockResolvedValue([]);
  (calculateCustomerTierFromDB as any).mockResolvedValue({ newTierId: null, newTierName: null, totalSpending: 0 });
  (getBaseTier as any).mockResolvedValue(null);
  (db.tier.findFirst as any).mockResolvedValue(null);
});

// ============================================
// TESTS
// ============================================

describe('resolveEffectiveTier', () => {
  describe('regression: TDZ bug', () => {
    it('does NOT throw ReferenceError when called without options.tx', async () => {
      // Before the fix: `const prisma = options?.tx || prisma;` caused a TDZ
      // ReferenceError: "Cannot access 'prisma' before initialization".
      // After the fix: local var renamed to `db`, falls back to module-level prisma.
      await expect(resolveEffectiveTier(SHOP, CUSTOMER_ID)).resolves.toBeDefined();
    });

    it('does NOT throw when called without options at all', async () => {
      await expect(resolveEffectiveTier(SHOP, CUSTOMER_ID)).resolves.toMatchObject({
        effectiveSource: 'NONE',
      });
    });
  });

  describe('no qualifying source', () => {
    it('returns NONE when customer not found', async () => {
      (db.customer.findFirst as any).mockResolvedValue(null);

      const result = await resolveEffectiveTier(SHOP, 'nonexistent');

      expect(result.effectiveTierId).toBeNull();
      expect(result.effectiveSource).toBe('NONE');
      expect(result.allSources).toEqual([]);
    });

    it('returns NONE when customer has no tier sources', async () => {
      const result = await resolveEffectiveTier(SHOP, CUSTOMER_ID);

      expect(result.effectiveSource).toBe('NONE');
      expect(result.conflictResolved).toBe(false);
    });
  });

  describe('priority resolution', () => {
    it('MANUAL_OVERRIDE wins over SPENDING_BASED', async () => {
      (getManualOverride as any).mockResolvedValue({
        hasOverride: true,
        tierId: tierSilver.id,
        tierName: tierSilver.name,
      });
      (db.tier.findFirst as any).mockResolvedValue(tierSilver);
      (calculateCustomerTierFromDB as any).mockResolvedValue({
        newTierId: tierGold.id,
        newTierName: tierGold.name,
        totalSpending: 600,
      });

      const result = await resolveEffectiveTier(SHOP, CUSTOMER_ID);

      expect(result.effectiveSource).toBe('MANUAL_OVERRIDE');
      expect(result.effectiveTierId).toBe(tierSilver.id);
      expect(result.conflictResolved).toBe(true);
    });

    it('TIER_SUBSCRIPTION wins over TIER_PURCHASE wins over SPENDING_BASED', async () => {
      (db.tierSubscription.findMany as any).mockResolvedValue([
        { id: 'sub_1', customerId: CUSTOMER_ID, shop: SHOP, status: 'ACTIVE',
          tierId: tierSilver.id, tier: tierSilver, currentPeriodEnd: new Date(Date.now() + 86400000) },
      ]);
      (db.tierPurchase.findMany as any).mockResolvedValue([
        { id: 'pur_1', customerId: CUSTOMER_ID, shop: SHOP, status: 'ACTIVE',
          tierId: tierBasic.id, tier: tierBasic, endDate: null },
      ]);
      (calculateCustomerTierFromDB as any).mockResolvedValue({
        newTierId: tierGold.id,
        newTierName: tierGold.name,
        totalSpending: 600,
      });
      (db.tier.findFirst as any).mockResolvedValue(tierGold);

      const result = await resolveEffectiveTier(SHOP, CUSTOMER_ID);

      expect(result.effectiveSource).toBe('TIER_SUBSCRIPTION');
      expect(result.effectiveTierId).toBe(tierSilver.id);
      expect(result.allSources.length).toBe(3);
    });

    it('falls through to SPENDING_BASED when no override/subscription/purchase', async () => {
      (calculateCustomerTierFromDB as any).mockResolvedValue({
        newTierId: tierSilver.id,
        newTierName: tierSilver.name,
        totalSpending: 200,
      });
      (db.tier.findFirst as any).mockResolvedValue(tierSilver);

      const result = await resolveEffectiveTier(SHOP, CUSTOMER_ID);

      expect(result.effectiveSource).toBe('SPENDING_BASED');
      expect(result.effectiveTierId).toBe(tierSilver.id);
    });

    it('falls back to DEFAULT_BASE_TIER when nothing else qualifies and base tier is enabled', async () => {
      (getBaseTierConfig as any).mockResolvedValue({ enabled: true, autoDetect: false });
      (getBaseTier as any).mockResolvedValue(tierBasic);

      const result = await resolveEffectiveTier(SHOP, CUSTOMER_ID);

      expect(result.effectiveSource).toBe('DEFAULT_BASE_TIER');
      expect(result.effectiveTierId).toBe(tierBasic.id);
    });
  });

  describe('options', () => {
    it('skips manual override check when skipManualCheck=true', async () => {
      (getManualOverride as any).mockResolvedValue({
        hasOverride: true,
        tierId: tierGold.id,
        tierName: tierGold.name,
      });

      const result = await resolveEffectiveTier(SHOP, CUSTOMER_ID, { skipManualCheck: true });

      expect(getManualOverride).not.toHaveBeenCalled();
      expect(result.effectiveSource).not.toBe('MANUAL_OVERRIDE');
    });

    it('skips spending calc when skipSpendingCalc=true', async () => {
      (calculateCustomerTierFromDB as any).mockResolvedValue({
        newTierId: tierSilver.id,
        newTierName: tierSilver.name,
        totalSpending: 200,
      });

      await resolveEffectiveTier(SHOP, CUSTOMER_ID, { skipSpendingCalc: true });

      expect(calculateCustomerTierFromDB).not.toHaveBeenCalled();
    });
  });

  describe('data integrity', () => {
    it('filters out tier subscriptions with missing tier records', async () => {
      (db.tierSubscription.findMany as any).mockResolvedValue([
        { id: 'sub_orphan', customerId: CUSTOMER_ID, shop: SHOP, status: 'ACTIVE',
          tierId: 'nonexistent', tier: null, currentPeriodEnd: new Date(Date.now() + 86400000) },
      ]);

      const result = await resolveEffectiveTier(SHOP, CUSTOMER_ID);

      expect(result.allSources.find(s => s.source === 'TIER_SUBSCRIPTION')).toBeUndefined();
    });

    it('filters out tier purchases with missing tier records', async () => {
      (db.tierPurchase.findMany as any).mockResolvedValue([
        { id: 'pur_orphan', customerId: CUSTOMER_ID, shop: SHOP, status: 'ACTIVE',
          tierId: 'nonexistent', tier: null, endDate: null },
      ]);

      const result = await resolveEffectiveTier(SHOP, CUSTOMER_ID);

      expect(result.allSources.find(s => s.source === 'TIER_PURCHASE')).toBeUndefined();
    });
  });
});
