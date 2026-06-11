import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCKS
// ============================================

vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock('~/db.server', () => ({
  default: {
    tier: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    shopSettings: {
      findUnique: vi.fn(),
    },
    customer: {
      findMany: vi.fn(),
    },
    tierProduct: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/services/entitlements.server', () => ({
  getEntitlements: vi.fn(),
}));

vi.mock('~/utils/require-feature.server', () => ({
  checkLimitAccess: vi.fn(),
}));

vi.mock('~/utils/atomic-limit-control.server', () => ({
  atomicTierCreate: vi.fn(),
  LimitExceededError: class LimitExceededError extends Error {},
}));

vi.mock('~/utils/tier-styles', () => ({
  getTierStyle: vi.fn(() => ({})),
}));

vi.mock('~/utils/currency', () => ({
  formatCurrency: vi.fn((amount: number) => `$${amount.toFixed(2)}`),
}));

vi.mock('~/utils/polaris-icons', () => ({
  PlusIcon: 'PlusIcon',
  DeleteIcon: 'DeleteIcon',
  EditIcon: 'EditIcon',
  CashDollarIcon: 'CashDollarIcon',
  CalendarIcon: 'CalendarIcon',
  PackageIcon: 'PackageIcon',
}));

vi.mock('~/hooks/useToast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

vi.mock('~/components/TierEmptyStateVariations', () => ({
  TierEmptyStateV1B: () => null,
}));

vi.mock('~/components/Billing/UpgradePrompt', () => ({
  LimitHint: () => null,
  PageLimitStatus: () => null,
}));

// ============================================
// IMPORTS (after mocks)
// ============================================

import { authenticate } from '~/shopify.server';
import db from '~/db.server';
import { getEntitlements } from '~/services/entitlements.server';
import { checkLimitAccess } from '~/utils/require-feature.server';
import { loader } from '~/routes/app.members.tiers';

// ============================================
// TEST HELPERS
// ============================================

const MOCK_SHOP = 'test-shop.myshopify.com';

const mockSession = {
  shop: MOCK_SHOP,
  state: '12345',
  isOnline: true,
  scope: 'read_customers,write_customers',
  accessToken: 'test-token',
};

const mockTiers = [
  {
    id: 'tier-1',
    name: 'Silver',
    cashbackPercent: 2,
    minSpend: 0,
    evaluationPeriod: 'LIFETIME',
    shop: MOCK_SHOP,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'tier-2',
    name: 'Gold',
    cashbackPercent: 5,
    minSpend: 100,
    evaluationPeriod: 'ANNUAL',
    shop: MOCK_SHOP,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'tier-3',
    name: 'Platinum',
    cashbackPercent: 10,
    minSpend: 500,
    evaluationPeriod: 'LIFETIME',
    shop: MOCK_SHOP,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function setupDefaultMocks() {
  vi.mocked(authenticate.admin).mockResolvedValue({
    session: mockSession,
    admin: { graphql: vi.fn() },
    cors: vi.fn(),
  } as any);

  vi.mocked(db.tier.findMany).mockResolvedValue(mockTiers as any);
  vi.mocked(db.tier.count).mockResolvedValue(3);

  vi.mocked(db.shopSettings.findUnique).mockResolvedValue({
    storeCurrency: 'USD',
    currencyDisplayType: 'symbol',
  } as any);

  // Customers with tiers for distribution
  vi.mocked(db.customer.findMany).mockResolvedValue([
    { currentTierId: 'tier-1' },
    { currentTierId: 'tier-1' },
    { currentTierId: 'tier-2' },
    { currentTierId: 'tier-3' },
    { currentTierId: null },
  ] as any);

  // Tier products
  vi.mocked(db.tierProduct.findMany).mockResolvedValue([
    { tierId: 'tier-2', duration: 'MONTHLY' },
    { tierId: 'tier-2', duration: 'ANNUAL' },
    { tierId: 'tier-3', duration: 'LIFETIME' },
  ] as any);

  vi.mocked(getEntitlements).mockResolvedValue({
    featureAnnualEval: true,
    featurePurchasableTiers: true,
  } as any);

  vi.mocked(checkLimitAccess).mockResolvedValue({
    hasAccess: true,
    error: null,
  } as any);
}

// ============================================
// TESTS
// ============================================

describe('app.members.tiers loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('should load tiers with names and cashback percentages', async () => {
    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.tiers).toHaveLength(3);

    expect(data.tiers[0]).toMatchObject({
      id: 'tier-1',
      name: 'Silver',
      cashbackPercent: 2,
      minSpend: 0,
    });
    expect(data.tiers[1]).toMatchObject({
      id: 'tier-2',
      name: 'Gold',
      cashbackPercent: 5,
      minSpend: 100,
    });
    expect(data.tiers[2]).toMatchObject({
      id: 'tier-3',
      name: 'Platinum',
      cashbackPercent: 10,
      minSpend: 500,
    });
  });

  it('should include tier distribution counts', async () => {
    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    // Based on mock data: 2 Silver, 1 Gold, 1 Platinum
    expect(data.tierDistribution).toEqual({
      'tier-1': 2,
      'tier-2': 1,
      'tier-3': 1,
    });
  });

  it('should include tier product coverage', async () => {
    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.tierProductCoverage['tier-2']).toMatchObject({
      tierId: 'tier-2',
      productCount: 2,
      hasMontly: true,
      hasAnnual: true,
      hasLifetime: false,
    });

    expect(data.tierProductCoverage['tier-3']).toMatchObject({
      tierId: 'tier-3',
      productCount: 1,
      hasLifetime: true,
    });
  });

  it('should include shop settings for currency display', async () => {
    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.shopSettings).toEqual({
      storeCurrency: 'USD',
      currencyDisplayType: 'symbol',
    });
  });

  it('should include limit access info', async () => {
    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.limitAccess).toMatchObject({
      canCreate: true,
      current: 3,
    });
  });

  it('should include entitlement flags', async () => {
    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.hasAnnualEval).toBe(true);
    expect(data.hasPurchasableTiers).toBe(true);
  });

  it('should scope all queries to the authenticated shop', async () => {
    const request = new Request('https://app.example.com/app/members/tiers');
    await loader({ request, params: {}, context: {} });

    expect(db.tier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: MOCK_SHOP },
      })
    );
    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: MOCK_SHOP },
      })
    );
    expect(db.tierProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shop: MOCK_SHOP }),
      })
    );
  });

  it('should handle empty tiers (no tiers created yet)', async () => {
    vi.mocked(db.tier.findMany).mockResolvedValue([]);
    vi.mocked(db.tier.count).mockResolvedValue(0);
    vi.mocked(db.customer.findMany).mockResolvedValue([]);
    vi.mocked(db.tierProduct.findMany).mockResolvedValue([]);
    vi.mocked(checkLimitAccess).mockResolvedValue({
      hasAccess: true,
      error: null,
    } as any);

    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.tiers).toEqual([]);
    expect(data.tierDistribution).toEqual({});
    expect(data.tierProductCoverage).toEqual({});
  });

  it('should handle null shopSettings', async () => {
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue(null);

    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.shopSettings).toBeNull();
  });

  it('should handle null cashbackPercent/minSpend by defaulting to 0', async () => {
    vi.mocked(db.tier.findMany).mockResolvedValue([
      { id: 'tier-x', name: 'Basic', cashbackPercent: null, minSpend: null, evaluationPeriod: null },
    ] as any);
    vi.mocked(db.tier.count).mockResolvedValue(1);

    const request = new Request('https://app.example.com/app/members/tiers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.tiers[0].cashbackPercent).toBe(0);
    expect(data.tiers[0].minSpend).toBe(0);
    expect(data.tiers[0].evaluationPeriod).toBe('LIFETIME');
  });
});
