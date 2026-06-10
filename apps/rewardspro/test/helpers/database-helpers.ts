/**
 * Database Helpers for Webhook Testing
 *
 * Provides utilities for mocking Prisma database operations.
 * Uses vitest-mock-extended for deep mocking of Prisma client.
 *
 * Usage:
 *   vi.mock('~/db.server', () => ({ default: getMockPrisma() }));
 *
 *   beforeEach(() => {
 *     resetMockPrisma();
 *     setupMockDatabaseState(getMockPrisma(), { shop: 'test.myshopify.com', ... });
 *   });
 */

import { vi } from 'vitest';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

// ============================================
// TYPES
// ============================================

/**
 * Type for deeply mocked Prisma client
 * This represents the mocked version with all methods as vi.fn()
 */
export type MockPrismaClient = {
  [K in keyof PrismaClient]: K extends
    | '$connect'
    | '$disconnect'
    | '$on'
    | '$transaction'
    | '$use'
    | '$extends'
    | '$queryRaw'
    | '$executeRaw'
    | '$queryRawUnsafe'
    | '$executeRawUnsafe'
    ? ReturnType<typeof vi.fn>
    : {
        [M in keyof PrismaClient[K]]: ReturnType<typeof vi.fn>;
      };
};

export interface DatabaseState {
  /** Shop domain */
  shop?: string;
  /** Shop settings */
  shopSettings?: Partial<ShopSettings>;
  /** Available tiers */
  tiers?: Partial<Tier>[];
  /** Tier products */
  tierProducts?: Partial<TierProduct>[];
  /** Customer record */
  customer?: Partial<Customer>;
  /** Existing orders */
  orders?: Partial<Order>[];
  /** Webhook processed records */
  webhooksProcessed?: Partial<WebhookProcessed>[];
  /** Session record */
  session?: Partial<Session>;
}

// Simplified types for test data
export interface ShopSettings {
  id: string;
  shop: string;
  cashbackEnabled: boolean;
  pointsEngagementEnabled: boolean;
  baseTierId: string | null;
  tierChangePolicy: string;
  maxLifetimeTrialDays: number;
  minDaysBetweenTrials: number;
  allowMultipleTierTrials: boolean;
}

export interface Tier {
  id: string;
  shop: string;
  name: string;
  minSpend: number | Decimal;
  cashbackPercent: number | Decimal;
  pointsMultiplier: number | Decimal;
  sortOrder: number;
}

export interface TierProduct {
  id: string;
  shop: string;
  tierId: string;
  shopifyProductId: string;
  shopifyVariantId: string | null;
  sku: string | null;
  duration: number;
  price: number | Decimal;
  isTrialProduct: boolean;
  trialDays: number | null;
}

export interface Customer {
  id: string;
  shop: string;
  shopifyCustomerId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  totalSpend: number | Decimal;
  netSpend: number | Decimal;
  currentTierId: string | null;
  currentTier?: Partial<Tier> | null;
  manualTierId: string | null;
}

export interface Order {
  id: string;
  shop: string;
  shopifyOrderId: string;
  customerId: string;
  totalPrice: number | Decimal;
  currency: string;
  lineItems?: Partial<OrderLineItem>[];
}

export interface OrderLineItem {
  id: string;
  orderId: string;
  shopifyLineItemId: string;
  productId: string;
  variantId: string | null;
  sku: string | null;
  title: string;
  price: number | Decimal;
  quantity: number;
}

export interface WebhookProcessed {
  id: string;
  shop: string;
  topic: string;
  webhookId: string;
  processedAt: Date;
}

export interface Session {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  accessToken: string;
}

// ============================================
// MOCK PRISMA CLIENT
// ============================================

let mockPrismaInstance: MockPrismaClient | null = null;

/**
 * Create a deeply mocked Prisma client
 */
function createMockPrismaClient(): MockPrismaClient {
  // List of all Prisma models we need to mock
  const models = [
    'session',
    'shopSettings',
    'customer',
    'tier',
    'tierProduct',
    'tierPurchase',
    'tierSubscription',
    'order',
    'orderLineItem',
    'orderRefund',
    'storeCreditLedger',
    'pointsLedger',
    'pointsConfig',
    'webhookProcessed',
    'webhookError',
    'syncJob',
    'auditLog',
  ] as const;

  // Methods available on each model delegate
  const modelMethods = [
    'findUnique',
    'findUniqueOrThrow',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
    'count',
    'aggregate',
    'groupBy',
  ] as const;

  const mock: Record<string, unknown> = {};

  // Create mock for each model
  for (const model of models) {
    const modelMock: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of modelMethods) {
      // findMany should return empty array by default, not null
      if (method === 'findMany') {
        modelMock[method] = vi.fn().mockResolvedValue([]);
      }
      // count should return 0 by default
      else if (method === 'count') {
        modelMock[method] = vi.fn().mockResolvedValue(0);
      }
      // aggregate should return a valid structure
      else if (method === 'aggregate') {
        modelMock[method] = vi.fn().mockResolvedValue({
          _count: { id: 0 },
          _sum: {},
          _avg: {},
          _min: {},
          _max: {},
        });
      }
      // createMany should return count object
      else if (method === 'createMany') {
        modelMock[method] = vi.fn().mockResolvedValue({ count: 0 });
      }
      else {
        modelMock[method] = vi.fn().mockResolvedValue(null);
      }
    }
    mock[model] = modelMock;
  }

  // Mock special Prisma methods
  mock.$connect = vi.fn().mockResolvedValue(undefined);
  mock.$disconnect = vi.fn().mockResolvedValue(undefined);
  mock.$on = vi.fn();
  mock.$use = vi.fn();
  mock.$extends = vi.fn();
  mock.$queryRaw = vi.fn().mockResolvedValue([]);
  mock.$executeRaw = vi.fn().mockResolvedValue(0);
  mock.$queryRawUnsafe = vi.fn().mockResolvedValue([]);
  mock.$executeRawUnsafe = vi.fn().mockResolvedValue(0);

  // Mock $transaction - execute callback with the mock itself
  mock.$transaction = vi.fn().mockImplementation(async (arg) => {
    if (typeof arg === 'function') {
      return arg(mock as MockPrismaClient);
    }
    // Array of promises
    return Promise.all(arg);
  });

  return mock as MockPrismaClient;
}

/**
 * Get or create the singleton mock Prisma client
 */
export function getMockPrisma(): MockPrismaClient {
  if (!mockPrismaInstance) {
    mockPrismaInstance = createMockPrismaClient();
  }
  return mockPrismaInstance;
}

/**
 * Reset all mock states between tests
 */
export function resetMockPrisma(): void {
  if (mockPrismaInstance) {
    // Reset all model mocks
    const models = [
      'session',
      'shopSettings',
      'customer',
      'tier',
      'tierProduct',
      'tierPurchase',
      'tierSubscription',
      'order',
      'orderLineItem',
      'orderRefund',
      'storeCreditLedger',
      'pointsLedger',
      'pointsConfig',
      'webhookProcessed',
      'webhookError',
      'syncJob',
      'auditLog',
    ];

    for (const model of models) {
      const modelMock = (mockPrismaInstance as Record<string, Record<string, ReturnType<typeof vi.fn>>>)[model];
      if (modelMock) {
        Object.entries(modelMock).forEach(([method, fn]) => {
          if (typeof fn.mockReset === 'function') {
            fn.mockReset();
            // Set appropriate default values based on method type
            if (method === 'findMany') {
              fn.mockResolvedValue([]);
            } else if (method === 'count') {
              fn.mockResolvedValue(0);
            } else if (method === 'aggregate') {
              fn.mockResolvedValue({
                _count: { id: 0 },
                _sum: {},
                _avg: {},
                _min: {},
                _max: {},
              });
            } else if (method === 'createMany') {
              fn.mockResolvedValue({ count: 0 });
            } else {
              fn.mockResolvedValue(null);
            }
          }
        });
      }
    }

    // Reset special methods
    (mockPrismaInstance.$transaction as ReturnType<typeof vi.fn>).mockReset();
    (mockPrismaInstance.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (prisma: MockPrismaClient) => Promise<unknown>)(mockPrismaInstance!);
        }
        return Promise.all(arg as Promise<unknown>[]);
      }
    );
  }
}

// ============================================
// STATE SETUP HELPERS
// ============================================

/**
 * Setup common database state for testing
 */
export function setupMockDatabaseState(
  prisma: MockPrismaClient,
  state: DatabaseState
): void {
  const shop = state.shop || 'test-shop.myshopify.com';

  // Setup session
  if (state.session || state.shop) {
    const session = {
      id: 'test-session-id',
      shop,
      state: 'active',
      isOnline: false,
      accessToken: 'test-access-token',
      ...state.session,
    };
    (prisma.session.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(session);
  }

  // Setup shop settings
  if (state.shopSettings) {
    const settings = {
      id: 'settings-1',
      shop,
      cashbackEnabled: true,
      pointsEngagementEnabled: false,
      baseTierId: null,
      tierChangePolicy: 'immediate',
      maxLifetimeTrialDays: 30,
      minDaysBetweenTrials: 30,
      allowMultipleTierTrials: false,
      ...state.shopSettings,
    };
    (prisma.shopSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(settings);
    (prisma.shopSettings.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(settings);
  }

  // Setup tiers
  if (state.tiers) {
    const tiers = state.tiers.map((t, i) => ({
      id: `tier-${i}`,
      shop,
      name: `Tier ${i}`,
      minSpend: 0,
      cashbackPercent: 5,
      pointsMultiplier: 1,
      sortOrder: i,
      ...t,
    }));
    (prisma.tier.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(tiers);
    (prisma.tier.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async (args?: { where?: { id?: string; shop?: string } }) => {
        if (args?.where?.id) {
          return tiers.find((t) => t.id === args.where!.id) || null;
        }
        return tiers[0] || null;
      }
    );
    (prisma.tier.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
      async (args?: { where?: { id?: string } }) => {
        if (args?.where?.id) {
          return tiers.find((t) => t.id === args.where!.id) || null;
        }
        return null;
      }
    );
  }

  // Setup tier products
  if (state.tierProducts) {
    const tierProducts = state.tierProducts.map((tp, i) => ({
      id: `tier-product-${i}`,
      shop,
      tierId: `tier-0`,
      shopifyProductId: `product-${i}`,
      shopifyVariantId: `variant-${i}`,
      sku: null,
      duration: 365,
      price: 99.99,
      isTrialProduct: false,
      trialDays: null,
      ...tp,
    }));
    (prisma.tierProduct.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(tierProducts);
    (prisma.tierProduct.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async (args?: { where?: { shopifyProductId?: string; shopifyVariantId?: string } }) => {
        if (args?.where?.shopifyProductId) {
          return (
            tierProducts.find((tp) => tp.shopifyProductId === args.where!.shopifyProductId) ||
            null
          );
        }
        return tierProducts[0] || null;
      }
    );
  }

  // Setup customer
  if (state.customer) {
    const customer = {
      id: 'customer-1',
      shop,
      shopifyCustomerId: '123456789',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'Customer',
      totalSpend: 0,
      netSpend: 0,
      currentTierId: null,
      manualTierId: null,
      ...state.customer,
    };
    (prisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(customer);
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(customer);
    (prisma.customer.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(customer);
    (prisma.customer.update as ReturnType<typeof vi.fn>).mockResolvedValue(customer);
    (prisma.customer.create as ReturnType<typeof vi.fn>).mockResolvedValue(customer);
  }

  // Setup orders
  if (state.orders) {
    const orders = state.orders.map((o, i) => ({
      id: `order-${i}`,
      shop,
      shopifyOrderId: `${1000000000 + i}`,
      customerId: 'customer-1',
      totalPrice: 99.99,
      currency: 'USD',
      ...o,
    }));
    (prisma.order.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(orders);
    (prisma.order.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async (args?: { where?: { shopifyOrderId?: string } }) => {
        if (args?.where?.shopifyOrderId) {
          return orders.find((o) => o.shopifyOrderId === args.where!.shopifyOrderId) || null;
        }
        return orders[0] || null;
      }
    );
  }

  // Setup webhook processed records
  if (state.webhooksProcessed) {
    const webhooks = state.webhooksProcessed.map((w, i) => ({
      id: `wp-${i}`,
      shop,
      topic: 'orders/paid',
      webhookId: `webhook-${i}`,
      processedAt: new Date(),
      ...w,
    }));
    (prisma.webhookProcessed.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
      async (args?: { where?: { webhookId?: string } }) => {
        if (args?.where?.webhookId) {
          return webhooks.find((w) => w.webhookId === args.where!.webhookId) || null;
        }
        return null;
      }
    );
  } else {
    // Default: no webhooks processed
    (prisma.webhookProcessed.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  }

  // Default create operations to return the input data
  (prisma.webhookProcessed.create as ReturnType<typeof vi.fn>).mockImplementation(
    async (args: { data: Partial<WebhookProcessed> }) => ({
      id: 'new-wp',
      ...args.data,
    })
  );
  (prisma.order.create as ReturnType<typeof vi.fn>).mockImplementation(
    async (args: { data: Partial<Order> }) => ({
      id: 'new-order',
      ...args.data,
    })
  );
  (prisma.tierPurchase.create as ReturnType<typeof vi.fn>).mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: 'new-tier-purchase',
      ...args.data,
    })
  );
  (prisma.storeCreditLedger.create as ReturnType<typeof vi.fn>).mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: 'new-ledger',
      ...args.data,
    })
  );
  (prisma.pointsLedger.create as ReturnType<typeof vi.fn>).mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: 'new-points-ledger',
      ...args.data,
    })
  );
}

// ============================================
// VERIFICATION HELPERS
// ============================================

/**
 * Assert that a specific create was called
 */
export function assertCreateCalled(
  prisma: MockPrismaClient,
  model: keyof MockPrismaClient,
  matcher?: Record<string, unknown>
): void {
  const modelMock = prisma[model] as Record<string, ReturnType<typeof vi.fn>>;
  const createFn = modelMock.create;

  expect(createFn).toHaveBeenCalled();

  if (matcher) {
    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining(matcher),
      })
    );
  }
}

/**
 * Assert that a specific update was called
 */
export function assertUpdateCalled(
  prisma: MockPrismaClient,
  model: keyof MockPrismaClient,
  whereMatcher?: Record<string, unknown>,
  dataMatcher?: Record<string, unknown>
): void {
  const modelMock = prisma[model] as Record<string, ReturnType<typeof vi.fn>>;
  const updateFn = modelMock.update;

  expect(updateFn).toHaveBeenCalled();

  const matchers: Record<string, unknown> = {};
  if (whereMatcher) {
    matchers.where = expect.objectContaining(whereMatcher);
  }
  if (dataMatcher) {
    matchers.data = expect.objectContaining(dataMatcher);
  }

  if (Object.keys(matchers).length > 0) {
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining(matchers));
  }
}

/**
 * Get all calls to a specific model method
 */
export function getModelCalls(
  prisma: MockPrismaClient,
  model: keyof MockPrismaClient,
  method: string
): unknown[][] {
  const modelMock = prisma[model] as Record<string, ReturnType<typeof vi.fn>>;
  const fn = modelMock[method];
  return fn.mock.calls;
}
