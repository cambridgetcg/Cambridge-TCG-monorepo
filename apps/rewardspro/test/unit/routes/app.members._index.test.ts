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
    customer: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    tier: {
      findMany: vi.fn(),
    },
    customerTierState: {
      findMany: vi.fn(),
    },
    tierChangeLog: {
      findMany: vi.fn(),
    },
    shopSettings: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('~/services/shop-data-provider.server', () => ({
  getShopTiers: vi.fn(),
  getShopSettings: vi.fn(),
}));

vi.mock('~/services/entitlements.server', () => ({
  getEntitlements: vi.fn(),
}));

vi.mock('~/services/customer-order-summary.server', () => ({
  getCustomerOrderSummariesBatch: vi.fn(),
}));

vi.mock('~/services/tier-calculation.server', () => ({
  calculateAllCustomerTiers: vi.fn(),
}));

vi.mock('~/services/manual-tier-assignment.server', () => ({
  assignCustomerToTier: vi.fn(),
  hasManualOverride: vi.fn(),
}));

vi.mock('~/services/tier-resolution.server', () => ({
  updateCustomerToEffectiveTier: vi.fn(),
}));

vi.mock('~/services/background-customer-sync.server', () => ({
  syncCustomersInBackground: vi.fn(),
}));

vi.mock('~/services/klaviyo-events.server', () => ({
  trackCashbackAdjusted: vi.fn(),
}));

vi.mock('~/components/CustomerDetailModal', () => ({
  CustomerDetailModal: () => null,
}));

vi.mock('~/components/StoreCredit', () => ({
  StoreCreditDisplay: () => null,
}));

vi.mock('~/utils/tier-styles', () => ({
  getTierStyle: vi.fn(() => ({})),
}));

vi.mock('~/utils/currency', () => ({
  formatCurrency: vi.fn((amount: number) => `$${amount.toFixed(2)}`),
}));

vi.mock('~/utils/polaris-icons', () => ({
  SearchIcon: 'SearchIcon',
  PersonIcon: 'PersonIcon',
  RefreshIcon: 'RefreshIcon',
  ChartVerticalIcon: 'ChartVerticalIcon',
  AlertTriangleIcon: 'AlertTriangleIcon',
  InfoIcon: 'InfoIcon',
  StarIcon: 'StarIcon',
  ExportIcon: 'ExportIcon',
  FilterIcon: 'FilterIcon',
}));

vi.mock('~/hooks/useToast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

// ============================================
// IMPORTS (after mocks)
// ============================================

import { authenticate } from '~/shopify.server';
import db from '~/db.server';
import { getShopTiers, getShopSettings } from '~/services/shop-data-provider.server';
import { getEntitlements } from '~/services/entitlements.server';
import { getCustomerOrderSummariesBatch } from '~/services/customer-order-summary.server';

// Import the actual loader
import { loader } from '~/routes/app.members._index';

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

function createRequest(url = 'https://app.example.com/app/members') {
  return new Request(url);
}

function createMockCustomer(overrides: Record<string, any> = {}) {
  const defaults: Record<string, any> = {
    id: 'cust-1',
    shopifyCustomerId: 'gid://shopify/Customer/1',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    storeCredit: 50.0,
    currentTierId: 'tier-gold',
    currentTier: {
      id: 'tier-gold',
      name: 'Gold',
      cashbackPercent: 5,
      minSpend: 100,
    },
    orderCount: 3,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    lastOrderDate: new Date('2025-05-15'),
  };
  // Use Object.assign so explicit null/undefined overrides are preserved
  return { ...defaults, ...overrides };
}

const mockTiers = [
  {
    id: 'tier-silver',
    name: 'Silver',
    cashbackPercent: 2,
    minSpend: 0,
    evaluationPeriod: 'LIFETIME',
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'tier-gold',
    name: 'Gold',
    cashbackPercent: 5,
    minSpend: 100,
    evaluationPeriod: 'LIFETIME',
    createdAt: new Date('2025-01-01'),
  },
];

// ============================================
// SETUP
// ============================================

function setupDefaultMocks() {
  vi.mocked(authenticate.admin).mockResolvedValue({
    session: mockSession,
    admin: { graphql: vi.fn() },
    cors: vi.fn(),
  } as any);

  vi.mocked(getShopTiers).mockResolvedValue(mockTiers as any);
  vi.mocked(getShopSettings).mockResolvedValue({
    storeCurrency: 'USD',
    currencyDisplayType: 'symbol',
  } as any);
  vi.mocked(getEntitlements).mockResolvedValue({
    effectivePlan: 'RewardsPro Free',
    featureAnnualEval: false,
    featurePurchasableTiers: false,
    limitMaxHistoricalDays: 7,
  } as any);

  // Default: return 2 customers
  const customers = [
    createMockCustomer({ id: 'cust-1', email: 'john@example.com' }),
    createMockCustomer({ id: 'cust-2', email: 'jane@example.com', storeCredit: 100 }),
  ];
  vi.mocked(db.customer.findMany).mockResolvedValue(customers as any);
  vi.mocked(db.customer.count).mockResolvedValue(2);

  // Deferred data mocks
  vi.mocked(db.customerTierState.findMany).mockResolvedValue([]);
  vi.mocked(db.tierChangeLog.findMany).mockResolvedValue([]);
  vi.mocked(getCustomerOrderSummariesBatch).mockResolvedValue(new Map());
}

// ============================================
// TESTS
// ============================================

describe('app.members._index loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('should load members page with customers and tiers', async () => {
    const request = createRequest();
    const response = await loader({ request, params: {}, context: {} });

    // defer() returns a Response-like object; extract the immediate data
    // The response from defer has a body we can read
    const data = (response as any).init?.data ?? (response as any).data;

    // Verify immediate (non-deferred) data is present
    expect(data).toBeDefined();
    expect(data.tiers).toBeDefined();
    expect(data.tiers.length).toBe(2);
    expect(data.tiers[0].name).toBe('Silver');
    expect(data.tiers[1].name).toBe('Gold');

    // Verify customers data
    expect(data.customersData).toBeDefined();
    expect(data.customersData.customers.length).toBe(2);
    expect(data.customersData.pagination.currentPage).toBe(1);
    expect(data.customersData.pagination.totalItems).toBe(2);

    // Verify shop settings
    expect(data.shopSettings).toEqual({
      storeCurrency: 'USD',
      currencyDisplayType: 'symbol',
    });
  });

  it('should authenticate and scope queries to shop', async () => {
    const request = createRequest();
    await loader({ request, params: {}, context: {} });

    expect(authenticate.admin).toHaveBeenCalledWith(request);

    // Verify db.customer.findMany was called with shop in where clause
    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: MOCK_SHOP,
        }),
      })
    );
  });

  it('should reject unauthenticated requests (no shop)', async () => {
    vi.mocked(authenticate.admin).mockResolvedValue({
      session: { ...mockSession, shop: '' },
      admin: { graphql: vi.fn() },
      cors: vi.fn(),
    } as any);

    const request = createRequest();

    // The loader checks !session?.shop and throws 401
    await expect(
      loader({ request, params: {}, context: {} })
    ).rejects.toThrow();
  });

  it('should pass search query to fetchPaginatedCustomers', async () => {
    const request = createRequest(
      'https://app.example.com/app/members?search=john'
    );
    await loader({ request, params: {}, context: {} });

    // Verify OR clause was used in db.customer.findMany for search
    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: MOCK_SHOP,
          OR: expect.arrayContaining([
            expect.objectContaining({
              email: { contains: 'john', mode: 'insensitive' },
            }),
          ]),
        }),
      })
    );
  });

  it('should pass tier filter to fetchPaginatedCustomers', async () => {
    const request = createRequest(
      'https://app.example.com/app/members?tier=tier-gold'
    );
    await loader({ request, params: {}, context: {} });

    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: MOCK_SHOP,
          currentTierId: 'tier-gold',
        }),
      })
    );
  });

  it('should handle "none" tier filter (no tier assigned)', async () => {
    const request = createRequest(
      'https://app.example.com/app/members?tier=none'
    );
    await loader({ request, params: {}, context: {} });

    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: MOCK_SHOP,
          currentTierId: null,
        }),
      })
    );
  });

  it('should handle pagination correctly', async () => {
    vi.mocked(db.customer.count).mockResolvedValue(100);
    vi.mocked(db.customer.findMany).mockResolvedValue([]);

    const request = createRequest(
      'https://app.example.com/app/members?page=3&pageSize=25'
    );
    const response = await loader({ request, params: {}, context: {} });
    const data = (response as any).init?.data ?? (response as any).data;

    // Should have calculated pagination
    expect(data.customersData.pagination.currentPage).toBe(3);
    expect(data.customersData.pagination.totalPages).toBe(4); // 100 / 25

    // Verify skip/take in db call
    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 50, // (3-1) * 25
        take: 25,
      })
    );
  });

  // ============================================
  // BUG-001: null storeCredit crash scenario
  // ============================================
  it('BUG-001: should handle customers with null storeCredit without crashing', async () => {
    const customersWithNullCredit = [
      createMockCustomer({ id: 'cust-1', storeCredit: null }),
      createMockCustomer({ id: 'cust-2', storeCredit: undefined }),
      createMockCustomer({ id: 'cust-3', storeCredit: 0 }),
    ];
    vi.mocked(db.customer.findMany).mockResolvedValue(customersWithNullCredit as any);
    vi.mocked(db.customer.count).mockResolvedValue(3);

    const request = createRequest();
    const response = await loader({ request, params: {}, context: {} });
    const data = (response as any).init?.data ?? (response as any).data;

    // Should not crash — all storeCredit values should be parsed to numbers
    expect(data.customersData.customers).toHaveLength(3);
    expect(data.customersData.customers[0].storeCredit).toBe(0); // null → 0
    expect(data.customersData.customers[1].storeCredit).toBe(0); // undefined → 0
    expect(data.customersData.customers[2].storeCredit).toBe(0); // 0 stays 0
  });

  it('BUG-001: should handle search + filter combined with null storeCredit', async () => {
    const customers = [
      createMockCustomer({ id: 'cust-1', email: 'test@example.com', storeCredit: null }),
    ];
    vi.mocked(db.customer.findMany).mockResolvedValue(customers as any);
    vi.mocked(db.customer.count).mockResolvedValue(1);

    const request = createRequest(
      'https://app.example.com/app/members?search=test&tier=tier-gold'
    );

    // Should not throw
    const response = await loader({ request, params: {}, context: {} });
    const data = (response as any).init?.data ?? (response as any).data;

    expect(data.customersData.customers).toHaveLength(1);
    expect(data.customersData.customers[0].storeCredit).toBe(0);
  });

  it('should handle customers with null currentTier', async () => {
    const customers = [
      createMockCustomer({ id: 'cust-1', currentTier: null, currentTierId: null }),
    ];
    vi.mocked(db.customer.findMany).mockResolvedValue(customers as any);
    vi.mocked(db.customer.count).mockResolvedValue(1);

    const request = createRequest();
    const response = await loader({ request, params: {}, context: {} });
    const data = (response as any).init?.data ?? (response as any).data;

    expect(data.customersData.customers[0].currentTier).toBeNull();
  });

  it('should handle database errors gracefully', async () => {
    vi.mocked(db.customer.findMany).mockRejectedValue(
      new Error('Database connection failed')
    );

    const request = createRequest();

    // The loader wraps fetch in try/catch and returns empty on error
    // (based on the catch block in fetchPaginatedCustomers)
    const response = await loader({ request, params: {}, context: {} });
    const data = (response as any).init?.data ?? (response as any).data;

    // fetchPaginatedCustomers catches errors and returns empty
    expect(data.customersData.customers).toEqual([]);
    expect(data.customersData.pagination.totalItems).toBe(0);
  });

  it('should return empty results when no customers exist', async () => {
    vi.mocked(db.customer.findMany).mockResolvedValue([]);
    vi.mocked(db.customer.count).mockResolvedValue(0);

    const request = createRequest();
    const response = await loader({ request, params: {}, context: {} });
    const data = (response as any).init?.data ?? (response as any).data;

    expect(data.customersData.customers).toEqual([]);
    expect(data.customersData.pagination.totalItems).toBe(0);
    expect(data.customersData.pagination.totalPages).toBe(0);
  });

  it('should validate sort key against whitelist', async () => {
    // Attempt SQL injection via sortKey — should fall back to 'createdAt'
    const request = createRequest(
      'https://app.example.com/app/members?sortKey=email;DROP TABLE customers'
    );
    await loader({ request, params: {}, context: {} });

    // Should use default 'createdAt' since the injected value isn't in whitelist
    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('should cap pageSize at MAX_PAGE_SIZE (200)', async () => {
    const request = createRequest(
      'https://app.example.com/app/members?pageSize=9999'
    );
    await loader({ request, params: {}, context: {} });

    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
      })
    );
  });
});
