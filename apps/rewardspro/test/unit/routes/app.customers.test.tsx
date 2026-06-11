import { describe, it, expect, beforeEach, vi } from 'vitest';
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';

// Mock the Shopify authentication
vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

// Mock the database
vi.mock('~/db.server', () => ({
  db: {
    customer: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    tier: {
      findMany: vi.fn(),
    },
  },
}));

// Import after mocks are set up
import { authenticate } from '~/shopify.server';
import { db } from '~/db.server';

// Example loader function (simplified version of app.customers)
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const searchTerm = url.searchParams.get('query') || '';
  const tierFilter = url.searchParams.get('tier') || '';
  const page = Number(url.searchParams.get('page') || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const where = {
    shop: session.shop,
    ...(searchTerm && {
      OR: [
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { displayName: { contains: searchTerm, mode: 'insensitive' } },
      ],
    }),
    ...(tierFilter && { tierId: tierFilter }),
  };

  const [customers, totalCount, tiers] = await Promise.all([
    db.customer.findMany({
      where,
      select: {
        id: true,
        shopifyCustomerId: true,
        email: true,
        displayName: true,
        storeCreditBalance: true,
        tierId: true,
        tier: {
          select: {
            name: true,
            color: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.customer.count({ where }),
    db.tier.findMany({
      where: { shop: session.shop },
      select: { id: true, name: true },
      orderBy: { minSpend: 'asc' },
    }),
  ]);

  return json({
    customers,
    totalCount,
    tiers,
    currentPage: page,
    totalPages: Math.ceil(totalCount / limit),
    searchTerm,
    tierFilter,
  });
}

describe('app.customers loader', () => {
  const mockShop = 'test-shop.myshopify.com';
  const mockSession = {
    shop: mockShop,
    state: '12345',
    isOnline: true,
    scope: 'read_customers,write_customers',
    accessToken: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    vi.mocked(authenticate.admin).mockResolvedValue({
      session: mockSession,
      admin: {
        graphql: vi.fn(),
        rest: {
          get: vi.fn(),
          post: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
        },
      },
      cors: vi.fn(),
    });
  });

  it('should return customers for authenticated shop', async () => {
    const mockCustomers = [
      {
        id: '1',
        shopifyCustomerId: 'gid://shopify/Customer/1',
        email: 'john@example.com',
        displayName: 'John Doe',
        storeCreditBalance: 50.00,
        tierId: 'tier-1',
        tier: {
          name: 'Gold',
          color: '#FFD700',
        },
      },
      {
        id: '2',
        shopifyCustomerId: 'gid://shopify/Customer/2',
        email: 'jane@example.com',
        displayName: 'Jane Smith',
        storeCreditBalance: 100.00,
        tierId: 'tier-2',
        tier: {
          name: 'Platinum',
          color: '#E5E4E2',
        },
      },
    ];

    const mockTiers = [
      { id: 'tier-1', name: 'Gold' },
      { id: 'tier-2', name: 'Platinum' },
    ];

    vi.mocked(db.customer.findMany).mockResolvedValue(mockCustomers);
    vi.mocked(db.customer.count).mockResolvedValue(2);
    vi.mocked(db.tier.findMany).mockResolvedValue(mockTiers);

    const request = new Request('https://app.example.com/app/customers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data).toEqual({
      customers: mockCustomers,
      totalCount: 2,
      tiers: mockTiers,
      currentPage: 1,
      totalPages: 1,
      searchTerm: '',
      tierFilter: '',
    });

    // Verify the query included shop scope
    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: mockShop,
        }),
      })
    );
  });

  it('should throw 401 for unauthenticated request', async () => {
    vi.mocked(authenticate.admin).mockResolvedValue({
      session: null,
      admin: null,
      cors: vi.fn(),
    });

    const request = new Request('https://app.example.com/app/customers');

    await expect(loader({ request, params: {}, context: {} })).rejects.toThrow(
      expect.objectContaining({
        status: 401,
      })
    );
  });

  it('should filter customers by search term', async () => {
    vi.mocked(db.customer.findMany).mockResolvedValue([]);
    vi.mocked(db.customer.count).mockResolvedValue(0);
    vi.mocked(db.tier.findMany).mockResolvedValue([]);

    const searchTerm = 'john';
    const request = new Request(
      `https://app.example.com/app/customers?query=${searchTerm}`
    );

    await loader({ request, params: {}, context: {} });

    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: mockShop,
          OR: [
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { displayName: { contains: searchTerm, mode: 'insensitive' } },
          ],
        }),
      })
    );
  });

  it('should filter customers by tier', async () => {
    vi.mocked(db.customer.findMany).mockResolvedValue([]);
    vi.mocked(db.customer.count).mockResolvedValue(0);
    vi.mocked(db.tier.findMany).mockResolvedValue([]);

    const tierId = 'tier-gold';
    const request = new Request(
      `https://app.example.com/app/customers?tier=${tierId}`
    );

    await loader({ request, params: {}, context: {} });

    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: mockShop,
          tierId: tierId,
        }),
      })
    );
  });

  it('should handle pagination correctly', async () => {
    vi.mocked(db.customer.findMany).mockResolvedValue([]);
    vi.mocked(db.customer.count).mockResolvedValue(100);
    vi.mocked(db.tier.findMany).mockResolvedValue([]);

    const request = new Request('https://app.example.com/app/customers?page=3');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.currentPage).toBe(3);
    expect(data.totalPages).toBe(5); // 100 items / 20 per page

    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40, // (page 3 - 1) * 20
        take: 20,
      })
    );
  });

  it('should always scope queries to authenticated shop', async () => {
    // Mock a different shop trying to access data
    const differentShop = 'malicious-shop.myshopify.com';
    vi.mocked(authenticate.admin).mockResolvedValue({
      session: { ...mockSession, shop: differentShop },
      admin: { graphql: vi.fn() },
      cors: vi.fn(),
    });

    vi.mocked(db.customer.findMany).mockResolvedValue([]);
    vi.mocked(db.customer.count).mockResolvedValue(0);
    vi.mocked(db.tier.findMany).mockResolvedValue([]);

    const request = new Request('https://app.example.com/app/customers');
    await loader({ request, params: {}, context: {} });

    // Verify queries are scoped to the authenticated shop, not the original
    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: differentShop, // Should use authenticated shop
        }),
      })
    );

    expect(db.tier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: differentShop,
        }),
      })
    );
  });

  it('should handle database errors gracefully', async () => {
    vi.mocked(db.customer.findMany).mockRejectedValue(
      new Error('Database connection failed')
    );

    const request = new Request('https://app.example.com/app/customers');

    await expect(loader({ request, params: {}, context: {} })).rejects.toThrow(
      'Database connection failed'
    );
  });

  it('should return empty results when no customers exist', async () => {
    vi.mocked(db.customer.findMany).mockResolvedValue([]);
    vi.mocked(db.customer.count).mockResolvedValue(0);
    vi.mocked(db.tier.findMany).mockResolvedValue([]);

    const request = new Request('https://app.example.com/app/customers');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.customers).toEqual([]);
    expect(data.totalCount).toBe(0);
    expect(data.totalPages).toBe(0);
  });
});