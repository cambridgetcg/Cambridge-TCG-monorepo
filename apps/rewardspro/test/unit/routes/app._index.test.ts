import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCKS
// ============================================

vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
  FREE_PLAN: 'RewardsPro Free',
  PRO_PLAN: 'RewardsPro Pro',
  PRO_ANNUAL_PLAN: 'RewardsPro Pro Annual',
  MAX_PLAN: 'RewardsPro Max',
  MAX_ANNUAL_PLAN: 'RewardsPro Max Annual',
  ULTRA_PLAN: 'RewardsPro Ultra',
  ULTRA_ANNUAL_PLAN: 'RewardsPro Ultra Annual',
  STARTER_PLAN: 'Starter',
  GROWTH_PLAN: 'Growth',
  ENTERPRISE_PLAN: 'Enterprise',
}));

vi.mock('~/db.server', () => ({
  default: {
    shopSettings: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    billingSubscription: {
      findUnique: vi.fn(),
    },
    tier: {
      count: vi.fn(),
    },
    syncStatus: {
      findMany: vi.fn(),
    },
    monthlyOrderUsage: {
      findFirst: vi.fn(),
    },
    order: {
      count: vi.fn(),
    },
    webhookProcessed: {
      count: vi.fn(),
    },
    webhookError: {
      count: vi.fn(),
    },
    customerDataRequest: {
      count: vi.fn(),
    },
    storeCreditLedger: {
      aggregate: vi.fn(),
    },
  },
}));

vi.mock('~/constants/billing.constants', () => ({
  MANAGED_PLANS: {
    'RewardsPro Free': { ordersIncluded: 100 },
    'RewardsPro Pro': { ordersIncluded: 1000 },
    'RewardsPro Max': { ordersIncluded: 5000 },
  },
  getPlanOrderLimit: vi.fn(() => 10000),
}));

vi.mock('~/utils/database-health.server', () => ({
  measureQuery: vi.fn(async (fn: () => Promise<any>) => fn()),
  getDatabaseHealth: vi.fn(() => ({
    responseTime: 45,
    status: 'connected',
    uptime: 99.9,
    lastCheck: new Date('2026-03-22T12:00:00Z'),
  })),
}));

vi.mock('~/services/billing/subscription-details.server', () => ({
  getSubscriptionDetails: vi.fn().mockResolvedValue({
    currentAppInstallation: {
      activeSubscriptions: [],
    },
  }),
}));

vi.mock('~/services/widget-detection.server', () => ({
  detectWidgetStatus: vi.fn().mockResolvedValue({
    isEnabled: true,
    membershipWidgetEnabled: true,
    blockType: 'app_embed',
    themeName: 'Dawn',
    lastChecked: new Date('2026-03-22T12:00:00Z'),
  }),
  updateWidgetStatusCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/services/store-credit-spend.server', () => ({
  getStoreCreditSpendProblems: vi.fn().mockResolvedValue([]),
}));

vi.mock('~/hooks/useAnalytics', () => ({
  useAnalytics: vi.fn(),
}));

vi.mock('~/hooks/useToast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

vi.mock('~/utils/polaris-icons', () => ({
  StatusActiveIcon: 'StatusActiveIcon',
  SettingsIcon: 'SettingsIcon',
  ChartVerticalIcon: 'ChartVerticalIcon',
  CashDollarIcon: 'CashDollarIcon',
  DatabaseIcon: 'DatabaseIcon',
  RefreshIcon: 'RefreshIcon',
  CheckCircleIcon: 'CheckCircleIcon',
  CreditCardIcon: 'CreditCardIcon',
}));

// ============================================
// IMPORTS (after mocks)
// ============================================

import { authenticate } from '~/shopify.server';
import db from '~/db.server';
import { getSubscriptionDetails } from '~/services/billing/subscription-details.server';
import { detectWidgetStatus, updateWidgetStatusCache } from '~/services/widget-detection.server';
import { getStoreCreditSpendProblems } from '~/services/store-credit-spend.server';
import { loader } from '~/routes/app._index';

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

function setupDefaultMocks() {
  vi.mocked(authenticate.admin).mockResolvedValue({
    session: mockSession,
    admin: {
      graphql: vi.fn(),
    },
    billing: {
      check: vi.fn().mockResolvedValue({
        hasActivePayment: false,
        appSubscriptions: [],
      }),
    },
    cors: vi.fn(),
  } as any);

  // Mock getSubscriptionDetails (used via dynamic import in the route)
  vi.mocked(getSubscriptionDetails).mockResolvedValue({
    currentAppInstallation: {
      activeSubscriptions: [],
    },
  });

  // Mock detectWidgetStatus (used via dynamic import in the route)
  vi.mocked(detectWidgetStatus).mockResolvedValue({
    isEnabled: true,
    membershipWidgetEnabled: true,
    blockType: 'app_embed',
    themeName: 'Dawn',
    lastChecked: new Date('2026-03-22T12:00:00Z'),
  });
  vi.mocked(updateWidgetStatusCache).mockResolvedValue(undefined);

  // Shoppers can spend store credit: nothing to warn about
  vi.mocked(getStoreCreditSpendProblems).mockResolvedValue([]);

  // Shop settings
  vi.mocked(db.shopSettings.findUnique).mockResolvedValue({
    storeCurrency: 'USD',
    advancedAnalyticsEnabled: true,
    autoCashbackProcessingEnabled: true,
    emailMarketingEnabled: false,
    tierProductsEnabled: true,
    customersInitialSynced: true,
    customersSyncInProgress: false,
    widgetIsActive: true,
    widgetSetupDismissed: false,
    reviewBannerDismissed: false,
  } as any);

  // Billing
  vi.mocked(db.billingSubscription.findUnique).mockResolvedValue(null);

  // Tiers
  vi.mocked(db.tier.count).mockResolvedValue(3);

  // Sync status
  vi.mocked(db.syncStatus.findMany).mockResolvedValue([
    {
      syncType: 'customers',
      status: 'COMPLETED',
      lastSyncAt: new Date('2026-03-22T10:00:00Z'),
      recordsProcessed: 150,
    },
    {
      syncType: 'orders',
      status: 'COMPLETED',
      lastSyncAt: new Date('2026-03-22T11:00:00Z'),
      recordsProcessed: 300,
    },
  ] as any);

  // Monthly order usage
  vi.mocked(db.monthlyOrderUsage.findFirst).mockResolvedValue({
    orderCount: 42,
  } as any);

  // No customer data requests waiting
  vi.mocked(db.customerDataRequest.count).mockResolvedValue(0);

  // Webhook stats
  vi.mocked(db.webhookProcessed.count).mockResolvedValue(100);
  vi.mocked(db.webhookError.count)
    .mockResolvedValueOnce(2) // errors last 24h
    .mockResolvedValueOnce(0); // errors last hour
}

// ============================================
// TESTS
// ============================================

describe('app._index (dashboard) loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('should surface customer data requests the merchant has not downloaded', async () => {
    vi.mocked(db.customerDataRequest.count).mockResolvedValue(2);
    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.pendingDataRequests).toBe(2);
    expect(db.customerDataRequest.count).toHaveBeenCalledWith({
      where: { shop: MOCK_SHOP, downloadedAt: null, expiresAt: { gt: expect.any(Date) } },
    });
  });

  it('should load dashboard with all health indicators', async () => {
    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    // Core fields present
    expect(data.shop).toBe(MOCK_SHOP);
    expect(data.shopSettings).toBeDefined();
    expect(data.shopSettings.storeCurrency).toBe('USD');

    // Health indicators
    expect(data.databaseHealth).toMatchObject({
      status: 'connected',
      responseTime: expect.any(Number),
    });
    expect(data.webhookStats).toMatchObject({
      processedLast24h: 100,
      status: 'healthy',
    });
    expect(data.loyaltyEngine).toMatchObject({
      tierCount: 3,
      status: 'operational',
      cashbackEnabled: true,
    });
    expect(data.dataSyncHealth).toMatchObject({
      status: 'operational',
      customerSync: { status: 'completed' },
      orderSync: { status: 'completed' },
    });
  });

  it('should include widget status', async () => {
    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.widgetStatus).toMatchObject({
      isActive: true,
      status: 'active',
      blockType: 'app_embed',
      themeName: 'Dawn',
    });
  });

  it('should include monthly order usage', async () => {
    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.monthlyOrderUsage).toMatchObject({
      orderCount: 42,
      planLimit: 1000, // Free plan limit
      planName: 'RewardsPro Free',
    });
    expect(data.currentMonth).toBeDefined();
    expect(data.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('should reject unauthenticated requests', async () => {
    vi.mocked(authenticate.admin).mockResolvedValue({
      session: { shop: '' },
      admin: { graphql: vi.fn() },
      cors: vi.fn(),
    } as any);

    const request = new Request('https://app.example.com/app');

    await expect(
      loader({ request, params: {}, context: {} })
    ).rejects.toThrow();
  });

  it('should detect loyalty engine needs_setup when no tiers exist', async () => {
    vi.mocked(db.tier.count).mockResolvedValue(0);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.loyaltyEngine.status).toBe('needs_setup');
  });

  it('should detect degraded loyalty engine when cashback disabled', async () => {
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue({
      storeCurrency: 'USD',
      advancedAnalyticsEnabled: false,
      autoCashbackProcessingEnabled: false,
      emailMarketingEnabled: false,
      tierProductsEnabled: false,
      customersInitialSynced: true,
      customersSyncInProgress: false,
      widgetIsActive: false,
      widgetSetupDismissed: false,
      reviewBannerDismissed: false,
    } as any);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.loyaltyEngine.status).toBe('degraded');
  });

  it('should handle null shopSettings gracefully', async () => {
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue(null);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.shopSettings).toBeNull();
    expect(data.loyaltyEngine.status).toBe('needs_setup');
  });

  it('should calculate webhook health correctly', async () => {
    // Reset webhook mocks before overriding with critical-scenario values
    vi.mocked(db.webhookProcessed.count).mockReset().mockResolvedValue(50);
    vi.mocked(db.webhookError.count).mockReset()
      .mockResolvedValueOnce(50) // 50% error rate → critical
      .mockResolvedValueOnce(15); // 15 errors in last hour → critical

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.webhookStats.status).toBe('critical');
  });

  it('should fall back to direct order count when cache is empty', async () => {
    vi.mocked(db.monthlyOrderUsage.findFirst).mockResolvedValue(null);
    vi.mocked(db.order.count).mockResolvedValue(55);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.monthlyOrderUsage.orderCount).toBe(55);
    expect(db.order.count).toHaveBeenCalled();
  });

  it('reports every first-run setup step as done for a set-up shop', async () => {
    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.firstRun).toEqual({
      hasTier: true,
      autoCashbackOn: true,
      widgetOn: true,
      dismissed: false,
      themeEditorUrl:
        'https://test-shop.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=test-api-key/membership_widget',
    });
  });

  it('reports the first-run setup steps a new shop still needs', async () => {
    vi.mocked(db.tier.count).mockResolvedValue(0);
    vi.mocked(detectWidgetStatus).mockResolvedValue({
      isEnabled: false,
      membershipWidgetEnabled: false,
      blockType: 'none',
      themeName: 'Dawn',
      lastChecked: new Date('2026-03-22T12:00:00Z'),
    });
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue({
      storeCurrency: 'GBP',
      autoCashbackProcessingEnabled: false,
      customersInitialSynced: false,
      customersSyncInProgress: true,
      widgetIsActive: false,
      widgetSetupDismissed: false,
      reviewBannerDismissed: false,
      customerAccountBlockDismissed: false,
    } as any);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.firstRun).toMatchObject({
      hasTier: false,
      autoCashbackOn: false,
      widgetOn: false,
      dismissed: false,
    });
  });

  it('remembers a dismissed first-run setup card in the unused customer-account flag', async () => {
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue({
      storeCurrency: 'USD',
      autoCashbackProcessingEnabled: false,
      widgetIsActive: false,
      customerAccountBlockDismissed: true,
    } as any);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.firstRun.dismissed).toBe(true);
    expect(db.shopSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ customerAccountBlockDismissed: true }),
      }),
    );
  });

  it('marks the widget step done only for the membership widget embed, not another of the app\'s blocks', async () => {
    // The missions embed is on; the membership widget embed is not
    vi.mocked(detectWidgetStatus).mockImplementation(async () => ({
      isEnabled: true,
      membershipWidgetEnabled: false,
      blockType: 'app_embed',
      themeName: 'Dawn',
      lastChecked: new Date(),
    }) as any);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.firstRun.widgetOn).toBe(false);
    expect(data.widgetStatus.status).toBe('active');
  });

  it('checks the theme again when a cached answer says the widget is off while the setup card is open', async () => {
    // The merchant turned the embed on after the answer was cached
    vi.mocked(detectWidgetStatus)
      .mockResolvedValueOnce({
        isEnabled: false,
        membershipWidgetEnabled: false,
        blockType: 'none',
        themeName: 'Dawn',
        lastChecked: new Date(Date.now() - 60_000),
      } as any)
      .mockImplementationOnce(async () => ({
        isEnabled: true,
        membershipWidgetEnabled: true,
        blockType: 'app_embed',
        themeName: 'Dawn',
        lastChecked: new Date(),
      }) as any);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.firstRun.widgetOn).toBe(true);
    expect(detectWidgetStatus).toHaveBeenCalledTimes(2);
    expect(detectWidgetStatus).toHaveBeenLastCalledWith(expect.anything(), MOCK_SHOP, true);
  });

  it('checks the theme once when the answer is fresh or the setup card was dismissed', async () => {
    vi.mocked(detectWidgetStatus).mockImplementation(async () => ({
      isEnabled: false,
      membershipWidgetEnabled: false,
      blockType: 'none',
      themeName: 'Dawn',
      lastChecked: new Date(),
    }) as any);

    await loader({ request: new Request('https://app.example.com/app'), params: {}, context: {} });
    expect(detectWidgetStatus).toHaveBeenCalledTimes(1);

    vi.mocked(detectWidgetStatus).mockClear().mockResolvedValue({
      isEnabled: false,
      membershipWidgetEnabled: false,
      blockType: 'none',
      themeName: 'Dawn',
      lastChecked: new Date(Date.now() - 60_000),
    } as any);
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue({
      storeCurrency: 'USD',
      autoCashbackProcessingEnabled: false,
      widgetIsActive: false,
      customerAccountBlockDismissed: true,
    } as any);

    await loader({ request: new Request('https://app.example.com/app'), params: {}, context: {} });
    expect(detectWidgetStatus).toHaveBeenCalledTimes(1);
  });

  it('reports what stops shoppers spending store credit, asking Shopify with the shop\'s Admin client', async () => {
    vi.mocked(getStoreCreditSpendProblems).mockResolvedValue(['legacy-accounts', 'store-credit-off']);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.storeCreditSpendProblems).toEqual(['legacy-accounts', 'store-credit-off']);
    expect(getStoreCreditSpendProblems).toHaveBeenCalledWith(expect.objectContaining({ graphql: expect.any(Function) }), MOCK_SHOP);
  });

  it('says how much pending cashback turning automatic cashback on would pay at once', async () => {
    vi.mocked(db.storeCreditLedger.aggregate).mockResolvedValue({ _count: { _all: 3 }, _sum: { amount: 7.5 } } as any);

    const response = await loader({ request: new Request('https://app.example.com/app'), params: {}, context: {} });
    const data = await response.json();

    expect(data.autoCashbackBacklog).toEqual({ count: 3, total: 7.5 });
    // What the reconciliation cron sends: PENDING cashback from the last 7 days with some left
    expect(db.storeCreditLedger.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shop: MOCK_SHOP,
          type: 'CASHBACK_EARNED',
          createdAt: { gte: expect.any(Date) },
          amount: { gt: 0 },
          metadata: { path: ['syncStatus'], equals: 'PENDING' },
        },
      }),
    );
    const since = vi.mocked(db.storeCreditLedger.aggregate).mock.calls[0][0]!.where!.createdAt as { gte: Date };
    expect(Date.now() - since.gte.getTime()).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -4);
  });

  it('says it could not count the waiting cashback, rather than that none is waiting', async () => {
    vi.mocked(db.storeCreditLedger.aggregate).mockRejectedValueOnce(new Error('canceling statement due to statement timeout'));

    const response = await loader({ request: new Request('https://app.example.com/app'), params: {}, context: {} });
    const data = await response.json();

    expect(data.autoCashbackBacklog).toBeNull();
  });

  it('reports no store credit problems on a shop where shoppers can spend it', async () => {
    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.storeCreditSpendProblems).toEqual([]);
  });

  it('should detect failed data sync status', async () => {
    vi.mocked(db.syncStatus.findMany).mockResolvedValue([
      { syncType: 'customers', status: 'FAILED', lastSyncAt: null, recordsProcessed: 0 },
      { syncType: 'orders', status: 'COMPLETED', lastSyncAt: new Date(), recordsProcessed: 100 },
    ] as any);

    const request = new Request('https://app.example.com/app');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.dataSyncHealth.status).toBe('failed');
    expect(data.dataSyncHealth.customerSync.status).toBe('failed');
  });
});

describe('app._index (dashboard) loader: review request', () => {
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  /** A shop installed `days` ago, with `issued` orders whose cashback reached the customer */
  async function reviewBannerFor(days: number, issued: number, dismissed = false) {
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue({
      storeCurrency: 'GBP',
      autoCashbackProcessingEnabled: true,
      reviewBannerDismissed: dismissed,
      createdAt: new Date(Date.now() - days * DAY),
    } as any);
    vi.mocked(db.order.count).mockImplementation((async (args: any) =>
      args?.where?.cashbackProcessed === true ? issued : 0) as any);

    const response = await loader({ request: new Request('https://app.example.com/app'), params: {}, context: {} });
    return (await response.json()).showReviewBanner;
  }

  it('does not ask on a fresh install with no orders', async () => {
    expect(await reviewBannerFor(0, 0)).toBe(false);
  });

  it('does not ask in the first week, however many orders earned cashback', async () => {
    expect(await reviewBannerFor(6, 50)).toBe(false);
  });

  it('does not ask before three orders have had their cashback issued', async () => {
    expect(await reviewBannerFor(30, 2)).toBe(false);
  });

  it('asks after a week once three orders have had their cashback issued', async () => {
    expect(await reviewBannerFor(7, 3)).toBe(true);
    expect(db.order.count).toHaveBeenCalledWith({
      where: { shop: MOCK_SHOP, cashbackProcessed: true, cashbackAmount: { gt: 0 } },
    });
  });

  it('never asks again once dismissed', async () => {
    expect(await reviewBannerFor(30, 10, true)).toBe(false);
  });
});

describe('app._index (dashboard) loader: subscription records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  async function load() {
    const response = await loader({ request: new Request('https://app.example.com/app'), params: {}, context: {} });
    return response.json();
  }

  it('says a free shop with no agreement has no subscription records', async () => {
    expect((await load()).hasSubscriptionRecords).toBe(false);
  });

  it('says a shop with a stored subscription has records', async () => {
    vi.mocked(db.billingSubscription.findUnique).mockResolvedValue({ shop: MOCK_SHOP, planName: 'RewardsPro Pro' } as any);

    expect((await load()).hasSubscriptionRecords).toBe(true);
  });

  it('says a shop Shopify reports an active subscription for has records', async () => {
    vi.mocked(getSubscriptionDetails).mockResolvedValue({
      currentAppInstallation: { activeSubscriptions: [{ name: 'RewardsPro Pro', status: 'ACTIVE' }] },
    } as any);

    expect((await load()).hasSubscriptionRecords).toBe(true);
  });
});
