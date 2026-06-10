import { describe, it, expect, beforeEach, vi, afterEach, Mock } from 'vitest';

// Mock the db module before importing the service
vi.mock('../../../app/db.server', () => ({
  default: {
    orderSyncJob: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    orderLineItem: {
      create: vi.fn(),
    },
    orderRefund: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    orderRefundLineItem: {
      create: vi.fn(),
    },
    storeCreditLedger: {
      create: vi.fn(),
    },
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substring(7)),
}));

import db from '../../../app/db.server';
import {
  startOrderSyncJob,
  processOrderBatch,
  getOrderSyncJobStatus,
  resumeOrderSyncJob,
  cancelOrderSyncJob,
  getOrderSyncJobById,
} from '../../../app/services/order-sync-job.server';

// Helper to create mock admin context
function createMockAdminContext(mockResponses: Record<string, any> = {}) {
  return {
    graphql: vi.fn().mockImplementation(async (query: string, options?: any) => {
      // Return different responses based on query content
      if (query.includes('ordersCount')) {
        return {
          json: async () => mockResponses.ordersCount || {
            data: { ordersCount: { count: 100 } }
          }
        };
      }
      if (query.includes('getOrders')) {
        return {
          json: async () => mockResponses.orders || {
            data: {
              orders: {
                edges: [],
                pageInfo: { hasNextPage: false, endCursor: null }
              }
            }
          }
        };
      }
      return { json: async () => ({}) };
    }),
  } as any;
}

// Helper to create a mock job
function createMockJob(overrides: Partial<any> = {}) {
  return {
    id: 'job-123',
    shop: 'test-shop.myshopify.com',
    status: 'IN_PROGRESS',
    totalOrders: 100,
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    lastCursor: null,
    batchSize: 50,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    startedAt: new Date(),
    lastActivityAt: new Date(),
    triggeredBy: 'manual',
    lastError: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Helper to create a mock Shopify order response
function createMockShopifyOrder(overrides: Partial<any> = {}) {
  return {
    id: 'gid://shopify/Order/12345',
    name: '#1001',
    email: 'customer@example.com',
    createdAt: '2024-06-15T10:00:00Z',
    updatedAt: '2024-06-15T10:00:00Z',
    processedAt: '2024-06-15T10:00:00Z',
    currencyCode: 'USD',
    subtotalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
    totalDiscountsSet: { shopMoney: { amount: '10.00' } },
    totalShippingPriceSet: { shopMoney: { amount: '5.00' } },
    totalTaxSet: { shopMoney: { amount: '8.00' } },
    totalPriceSet: { shopMoney: { amount: '103.00' } },
    totalRefundedSet: { shopMoney: { amount: '0.00' } },
    netPaymentSet: { shopMoney: { amount: '103.00' } },
    displayFinancialStatus: 'PAID',
    displayFulfillmentStatus: 'UNFULFILLED',
    customer: {
      id: 'gid://shopify/Customer/67890',
      email: 'customer@example.com',
    },
    lineItems: { edges: [] },
    refunds: [],
    ...overrides,
  };
}

describe('Order Sync Job Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startOrderSyncJob', () => {
    const shop = 'test-shop.myshopify.com';

    it('should create a new sync job when no existing job is in progress', async () => {
      const mockAdmin = createMockAdminContext();
      const mockCreatedJob = createMockJob();

      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.orderSyncJob.create as Mock).mockResolvedValue(mockCreatedJob);

      const result = await startOrderSyncJob(shop, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.jobId).toBe('job-123');
      expect(result.progress.totalOrders).toBe(100);
      expect(result.hasMore).toBe(true);

      expect(db.orderSyncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shop,
          status: 'IN_PROGRESS',
          totalOrders: 100,
          batchSize: 50,
          triggeredBy: 'manual',
        }),
      });
    });

    it('should return existing job info when sync is already in progress', async () => {
      const mockAdmin = createMockAdminContext();
      const existingJob = createMockJob({
        processedCount: 50,
        createdCount: 40,
        updatedCount: 5,
        skippedCount: 5,
      });

      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(existingJob);

      const result = await startOrderSyncJob(shop, mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sync already in progress');
      expect(result.jobId).toBe('job-123');
      expect(result.progress.processedCount).toBe(50);
      expect(db.orderSyncJob.create).not.toHaveBeenCalled();
    });

    it('should handle Shopify API errors gracefully when getting order count', async () => {
      const mockAdmin = {
        graphql: vi.fn().mockRejectedValue(new Error('API Error')),
      } as any;

      const mockCreatedJob = createMockJob({ totalOrders: null });

      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.orderSyncJob.create as Mock).mockResolvedValue(mockCreatedJob);

      const result = await startOrderSyncJob(shop, mockAdmin);

      // Should still succeed but without totalOrders
      expect(result.success).toBe(true);
      expect(result.progress.totalOrders).toBeNull();
    });

    it('should use custom date range when provided', async () => {
      const mockAdmin = createMockAdminContext();
      const mockCreatedJob = createMockJob();
      const customStartDate = new Date('2024-06-01');
      const customEndDate = new Date('2024-06-30');

      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.orderSyncJob.create as Mock).mockResolvedValue(mockCreatedJob);

      await startOrderSyncJob(shop, mockAdmin, 'manual', {
        startDate: customStartDate,
        endDate: customEndDate,
      });

      expect(db.orderSyncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          startDate: customStartDate,
          endDate: customEndDate,
        }),
      });
    });

    it('should set triggeredBy correctly', async () => {
      const mockAdmin = createMockAdminContext();
      const mockCreatedJob = createMockJob();

      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.orderSyncJob.create as Mock).mockResolvedValue(mockCreatedJob);

      await startOrderSyncJob(shop, mockAdmin, 'install');

      expect(db.orderSyncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeredBy: 'install',
        }),
      });
    });
  });

  describe('processOrderBatch', () => {
    it('should return error when job is not found', async () => {
      const mockAdmin = createMockAdminContext();
      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(null);

      const result = await processOrderBatch('non-existent-job', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync job not found');
      expect(result.status).toBe('FAILED');
    });

    it('should return error when job is not in progress', async () => {
      const mockAdmin = createMockAdminContext();
      const completedJob = createMockJob({ status: 'COMPLETED' });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(completedJob);

      const result = await processOrderBatch('job-123', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in progress');
    });

    it('should skip guest checkout orders', async () => {
      const job = createMockJob();
      const guestOrder = createMockShopifyOrder({
        customer: null, // Guest checkout
      });

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [{ cursor: 'cursor1', node: guestOrder }],
              pageInfo: { hasNextPage: false, endCursor: 'cursor1' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.customer.findMany as Mock).mockResolvedValue([]);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
        skippedCount: 1,
        processedCount: 1,
      }));

      const result = await processOrderBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.skippedCount).toBe(1);
      expect(result.progress.createdCount).toBe(0);
    });

    it('should skip orders for customers not in database', async () => {
      const job = createMockJob();
      const orderWithUnknownCustomer = createMockShopifyOrder();

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [{ cursor: 'cursor1', node: orderWithUnknownCustomer }],
              pageInfo: { hasNextPage: false, endCursor: 'cursor1' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.customer.findFirst as Mock).mockResolvedValue(null); // Customer not found
      (db.customer.findMany as Mock).mockResolvedValue([]);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
        skippedCount: 1,
        processedCount: 1,
      }));

      const result = await processOrderBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.skippedCount).toBe(1);
    });

    it('should create new order when it does not exist', async () => {
      const job = createMockJob();
      const order = createMockShopifyOrder();
      const customer = {
        id: 'customer-uuid',
        shop: 'test-shop.myshopify.com',
        shopifyCustomerId: '67890',
        email: 'customer@example.com',
        currentTier: {
          id: 'tier-1',
          name: 'Gold',
          cashbackPercent: 5,
        },
      };

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [{ cursor: 'cursor1', node: order }],
              pageInfo: { hasNextPage: false, endCursor: 'cursor1' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.customer.findFirst as Mock).mockResolvedValue(customer);
      (db.order.findFirst as Mock).mockResolvedValue(null); // Order doesn't exist
      (db.order.create as Mock).mockResolvedValue({});
      (db.storeCreditLedger.create as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
        createdCount: 1,
      }));

      const result = await processOrderBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.createdCount).toBe(1);
      expect(db.order.create).toHaveBeenCalled();
    });

    it('should update existing order instead of creating new one', async () => {
      const job = createMockJob();
      const order = createMockShopifyOrder();
      const customer = {
        id: 'customer-uuid',
        shop: 'test-shop.myshopify.com',
        shopifyCustomerId: '67890',
        email: 'customer@example.com',
        currentTier: null,
      };
      const existingOrder = {
        id: 'existing-order-uuid',
        shopifyOrderId: '12345',
      };

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [{ cursor: 'cursor1', node: order }],
              pageInfo: { hasNextPage: false, endCursor: 'cursor1' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.customer.findFirst as Mock).mockResolvedValue(customer);
      (db.order.findFirst as Mock).mockResolvedValue(existingOrder);
      (db.order.update as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
        updatedCount: 1,
      }));

      const result = await processOrderBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.updatedCount).toBe(1);
      expect(db.order.update).toHaveBeenCalled();
      expect(db.order.create).not.toHaveBeenCalled();
    });

    it('should update cursor and mark as completed when no more pages', async () => {
      const job = createMockJob({ processedCount: 90 });
      const order = createMockShopifyOrder();
      const customer = {
        id: 'customer-uuid',
        shop: 'test-shop.myshopify.com',
        shopifyCustomerId: '67890',
        email: 'customer@example.com',
        currentTier: null,
      };

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [{ cursor: 'final-cursor', node: order }],
              pageInfo: { hasNextPage: false, endCursor: 'final-cursor' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.customer.findFirst as Mock).mockResolvedValue(customer);
      (db.order.findFirst as Mock).mockResolvedValue(null);
      (db.order.create as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);
      (db.order.aggregate as Mock).mockResolvedValue({
        _sum: { totalPrice: 100, totalRefunded: 0, cashbackAmount: 5 },
        _count: { id: 1 },
        _max: { shopifyCreatedAt: new Date() },
      });
      (db.customer.update as Mock).mockResolvedValue({});
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
        status: 'COMPLETED',
      }));

      const result = await processOrderBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.hasMore).toBe(false);
      expect(db.orderSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          lastCursor: 'final-cursor',
          completedAt: expect.any(Date),
        }),
      });
    });

    it('should continue with IN_PROGRESS when more pages exist', async () => {
      const job = createMockJob();
      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [],
              pageInfo: { hasNextPage: true, endCursor: 'next-cursor' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
      }));

      const result = await processOrderBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.hasMore).toBe(true);
    });

    it('should handle GraphQL errors and mark job as failed', async () => {
      const job = createMockJob();
      const mockAdmin = createMockAdminContext({
        orders: {
          errors: [{ message: 'GraphQL error' }],
        },
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
      }));

      const result = await processOrderBatch('job-123', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('GraphQL errors');
    });

    it('should calculate cashback correctly when customer has a tier', async () => {
      const job = createMockJob();
      const order = createMockShopifyOrder({
        subtotalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
        totalDiscountsSet: { shopMoney: { amount: '10.00' } },
      });
      const customer = {
        id: 'customer-uuid',
        shop: 'test-shop.myshopify.com',
        shopifyCustomerId: '67890',
        email: 'customer@example.com',
        currentTier: {
          id: 'tier-gold',
          name: 'Gold',
          cashbackPercent: 5, // 5%
        },
      };

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [{ cursor: 'cursor1', node: order }],
              pageInfo: { hasNextPage: false, endCursor: 'cursor1' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.customer.findFirst as Mock).mockResolvedValue(customer);
      (db.order.findFirst as Mock).mockResolvedValue(null);
      (db.order.create as Mock).mockResolvedValue({});
      (db.storeCreditLedger.create as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
      }));

      await processOrderBatch('job-123', mockAdmin);

      // Cashback should be 5% of (100 - 10) = 5% of 90 = 4.5
      expect(db.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cashbackPercent: 5,
          cashbackAmount: 4.5, // (100 - 10) * 0.05
          tierIdAtOrder: 'tier-gold',
          tierNameAtOrder: 'Gold',
        }),
      });
    });
  });

  describe('getOrderSyncJobStatus', () => {
    it('should return null when no job exists', async () => {
      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);

      const result = await getOrderSyncJobStatus('test-shop.myshopify.com');

      expect(result).toBeNull();
    });

    it('should return job status with correct progress', async () => {
      const job = createMockJob({
        processedCount: 75,
        totalOrders: 100,
        createdCount: 60,
        updatedCount: 10,
        skippedCount: 5,
        errorCount: 0,
      });

      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(job);

      const result = await getOrderSyncJobStatus('test-shop.myshopify.com');

      expect(result).not.toBeNull();
      expect(result!.progress.processedCount).toBe(75);
      expect(result!.progress.percentComplete).toBe(75);
      expect(result!.progress.createdCount).toBe(60);
      expect(result!.progress.updatedCount).toBe(10);
      expect(result!.progress.skippedCount).toBe(5);
    });

    it('should calculate percentage as 0 when totalOrders is null', async () => {
      const job = createMockJob({
        processedCount: 50,
        totalOrders: null,
      });

      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(job);

      const result = await getOrderSyncJobStatus('test-shop.myshopify.com');

      expect(result!.progress.percentComplete).toBe(0);
    });
  });

  describe('resumeOrderSyncJob', () => {
    it('should return error when job not found', async () => {
      const mockAdmin = createMockAdminContext();
      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(null);

      const result = await resumeOrderSyncJob('non-existent', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync job not found');
    });

    it('should return error when job is not in FAILED or CANCELLED status', async () => {
      const mockAdmin = createMockAdminContext();
      const completedJob = createMockJob({ status: 'COMPLETED' });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(completedJob);

      const result = await resumeOrderSyncJob('job-123', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot resume job with status');
    });

    it('should reset job status and process next batch when resuming failed job', async () => {
      const failedJob = createMockJob({
        status: 'FAILED',
        lastCursor: 'some-cursor',
        processedCount: 50,
        lastError: 'Previous error',
      });

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [],
              pageInfo: { hasNextPage: false, endCursor: 'some-cursor' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock)
        .mockResolvedValueOnce(failedJob) // First call in resumeOrderSyncJob
        .mockResolvedValueOnce({ ...failedJob, status: 'IN_PROGRESS', lastError: null }); // Second call in processOrderBatch

      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...failedJob,
        ...data,
      }));
      (db.customer.findMany as Mock).mockResolvedValue([]);

      const result = await resumeOrderSyncJob('job-123', mockAdmin);

      // Verify the job was reset to IN_PROGRESS
      expect(db.orderSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          lastError: null,
        }),
      });
    });

    it('should allow resuming cancelled jobs', async () => {
      const cancelledJob = createMockJob({
        status: 'CANCELLED',
        lastCursor: 'some-cursor',
        processedCount: 25,
      });

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [],
              pageInfo: { hasNextPage: false, endCursor: 'some-cursor' },
            },
          },
        },
      });

      (db.orderSyncJob.findUnique as Mock)
        .mockResolvedValueOnce(cancelledJob)
        .mockResolvedValueOnce({ ...cancelledJob, status: 'IN_PROGRESS' });

      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...cancelledJob,
        ...data,
      }));
      (db.customer.findMany as Mock).mockResolvedValue([]);

      const result = await resumeOrderSyncJob('job-123', mockAdmin);

      expect(db.orderSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
        }),
      });
    });
  });

  describe('cancelOrderSyncJob', () => {
    it('should return false when job not found', async () => {
      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(null);

      const result = await cancelOrderSyncJob('non-existent');

      expect(result).toBe(false);
    });

    it('should return false when job is not in progress', async () => {
      const completedJob = createMockJob({ status: 'COMPLETED' });
      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(completedJob);

      const result = await cancelOrderSyncJob('job-123');

      expect(result).toBe(false);
      expect(db.orderSyncJob.update).not.toHaveBeenCalled();
    });

    it('should cancel in-progress job and return true', async () => {
      const inProgressJob = createMockJob({ status: 'IN_PROGRESS' });
      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(inProgressJob);
      (db.orderSyncJob.update as Mock).mockResolvedValue({});

      const result = await cancelOrderSyncJob('job-123');

      expect(result).toBe(true);
      expect(db.orderSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      });
    });
  });

  describe('getOrderSyncJobById', () => {
    it('should return null when job not found', async () => {
      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(null);

      const result = await getOrderSyncJobById('non-existent');

      expect(result).toBeNull();
    });

    it('should return job with correct progress', async () => {
      const job = createMockJob({
        processedCount: 80,
        totalOrders: 100,
        lastError: 'Some error',
      });

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);

      const result = await getOrderSyncJobById('job-123');

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe('job-123');
      expect(result!.progress.percentComplete).toBe(80);
      expect(result!.error).toBe('Some error');
    });
  });

  describe('Progress Calculation', () => {
    it('should calculate percentage correctly', async () => {
      const testCases = [
        { processed: 0, total: 100, expected: 0 },
        { processed: 25, total: 100, expected: 25 },
        { processed: 50, total: 100, expected: 50 },
        { processed: 75, total: 100, expected: 75 },
        { processed: 100, total: 100, expected: 100 },
        { processed: 33, total: 100, expected: 33 },
        { processed: 1, total: 3, expected: 33 }, // Rounds down
        { processed: 2, total: 3, expected: 67 }, // Rounds up
      ];

      for (const { processed, total, expected } of testCases) {
        const job = createMockJob({
          processedCount: processed,
          totalOrders: total,
        });

        (db.orderSyncJob.findFirst as Mock).mockResolvedValue(job);

        const result = await getOrderSyncJobStatus('test-shop.myshopify.com');

        expect(result!.progress.percentComplete).toBe(expected);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle individual order processing errors without failing entire batch', async () => {
      const job = createMockJob();
      const goodOrder = createMockShopifyOrder({ id: 'gid://shopify/Order/1' });
      const badOrder = createMockShopifyOrder({ id: 'gid://shopify/Order/2' });

      const mockAdmin = createMockAdminContext({
        orders: {
          data: {
            orders: {
              edges: [
                { cursor: 'cursor1', node: goodOrder },
                { cursor: 'cursor2', node: badOrder },
              ],
              pageInfo: { hasNextPage: false, endCursor: 'cursor2' },
            },
          },
        },
      });

      const customer = {
        id: 'customer-uuid',
        shop: 'test-shop.myshopify.com',
        shopifyCustomerId: '67890',
        email: 'customer@example.com',
        currentTier: null,
      };

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.customer.findFirst as Mock).mockResolvedValue(customer);
      (db.order.findFirst as Mock)
        .mockResolvedValueOnce(null) // First order doesn't exist
        .mockResolvedValueOnce(null); // Second order doesn't exist

      let callCount = 0;
      (db.order.create as Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Database error on second order');
        }
        return {};
      });

      (db.customer.findMany as Mock).mockResolvedValue([]);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
      }));

      const result = await processOrderBatch('job-123', mockAdmin);

      // Batch should complete with one error
      expect(result.success).toBe(true);
      expect(result.progress.createdCount).toBe(1);
      expect(result.progress.errorCount).toBe(1);
    });
  });
});

describe('Order Sync Job - Integration Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should complete a full sync cycle from start to finish', async () => {
    const shop = 'test-shop.myshopify.com';

    // Mock order count
    const mockAdmin = createMockAdminContext({
      ordersCount: { data: { ordersCount: { count: 2 } } },
      orders: {
        data: {
          orders: {
            edges: [
              {
                cursor: 'cursor1',
                node: createMockShopifyOrder({
                  id: 'gid://shopify/Order/1',
                  customer: { id: 'gid://shopify/Customer/1', email: 'c1@test.com' },
                }),
              },
              {
                cursor: 'cursor2',
                node: createMockShopifyOrder({
                  id: 'gid://shopify/Order/2',
                  customer: { id: 'gid://shopify/Customer/2', email: 'c2@test.com' },
                }),
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: 'cursor2' },
          },
        },
      },
    });

    const createdJob = createMockJob({ totalOrders: 2 });

    // Setup mocks
    (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
    (db.orderSyncJob.create as Mock).mockResolvedValue(createdJob);

    // Step 1: Start sync job
    const startResult = await startOrderSyncJob(shop, mockAdmin);
    expect(startResult.success).toBe(true);
    expect(startResult.progress.totalOrders).toBe(2);

    // Step 2: Process batch
    (db.orderSyncJob.findUnique as Mock).mockResolvedValue(createdJob);
    (db.customer.findFirst as Mock).mockResolvedValue({
      id: 'cust-1',
      shop,
      shopifyCustomerId: '1',
      currentTier: { id: 'tier-1', name: 'Gold', cashbackPercent: 5 },
    });
    (db.order.findFirst as Mock).mockResolvedValue(null);
    (db.order.create as Mock).mockResolvedValue({});
    (db.storeCreditLedger.create as Mock).mockResolvedValue({});
    (db.customer.findMany as Mock).mockResolvedValue([{ id: 'cust-1' }]);
    (db.order.aggregate as Mock).mockResolvedValue({
      _sum: { totalPrice: 200, totalRefunded: 0, cashbackAmount: 10 },
      _count: { id: 2 },
      _max: { shopifyCreatedAt: new Date() },
    });
    (db.customer.update as Mock).mockResolvedValue({});
    (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
      ...createdJob,
      ...data,
      status: 'COMPLETED',
      processedCount: 2,
      createdCount: 2,
    }));

    const processResult = await processOrderBatch(startResult.jobId, mockAdmin);
    expect(processResult.success).toBe(true);
    expect(processResult.status).toBe('COMPLETED');
    expect(processResult.hasMore).toBe(false);
  });

  it('should handle multi-page sync correctly', async () => {
    const shop = 'test-shop.myshopify.com';
    let batchNumber = 0;

    const mockAdmin = {
      graphql: vi.fn().mockImplementation(async (query: string) => {
        if (query.includes('ordersCount')) {
          return { json: async () => ({ data: { ordersCount: { count: 100 } } }) };
        }
        if (query.includes('getOrders')) {
          batchNumber++;
          const hasMore = batchNumber < 2;
          return {
            json: async () => ({
              data: {
                orders: {
                  edges: [
                    {
                      cursor: `cursor-${batchNumber}`,
                      node: createMockShopifyOrder({
                        id: `gid://shopify/Order/${batchNumber}`,
                        customer: { id: 'gid://shopify/Customer/1', email: 'test@test.com' },
                      }),
                    },
                  ],
                  pageInfo: {
                    hasNextPage: hasMore,
                    endCursor: `cursor-${batchNumber}`,
                  },
                },
              },
            }),
          };
        }
        return { json: async () => ({}) };
      }),
    } as any;

    const job = createMockJob({ totalOrders: 100 });

    (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
    (db.orderSyncJob.create as Mock).mockResolvedValue(job);
    (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
    (db.customer.findFirst as Mock).mockResolvedValue({
      id: 'cust-1',
      shop,
      shopifyCustomerId: '1',
      currentTier: null,
    });
    (db.order.findFirst as Mock).mockResolvedValue(null);
    (db.order.create as Mock).mockResolvedValue({});
    (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
      ...job,
      ...data,
    }));

    // First batch - should have more
    const result1 = await processOrderBatch(job.id, mockAdmin);
    expect(result1.hasMore).toBe(true);
    expect(result1.status).toBe('IN_PROGRESS');

    // Second batch - should complete
    (db.customer.findMany as Mock).mockResolvedValue([]);
    const result2 = await processOrderBatch(job.id, mockAdmin);
    expect(result2.hasMore).toBe(false);
    expect(result2.status).toBe('COMPLETED');
  });
});
