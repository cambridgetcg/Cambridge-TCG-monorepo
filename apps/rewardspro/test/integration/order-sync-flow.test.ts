import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';

/**
 * Integration Tests for Order Sync Flow
 *
 * These tests verify the complete order sync workflow from UI to database.
 * They test realistic scenarios including:
 * - Full sync completion
 * - Interrupted and resumed syncs
 * - Error handling and recovery
 * - Progress tracking accuracy
 */

// Mock database
vi.mock('../../app/db.server', () => ({
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

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substring(7)),
}));

import db from '../../app/db.server';
import {
  startOrderSyncJob,
  processOrderBatch,
  resumeOrderSyncJob,
  cancelOrderSyncJob,
} from '../../app/services/order-sync-job.server';

// State tracker for simulating real database behavior
class MockDatabaseState {
  private jobs: Map<string, any> = new Map();
  private orders: Map<string, any> = new Map();
  private customers: Map<string, any> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.jobs.clear();
    this.orders.clear();
    this.customers.clear();
  }

  addJob(job: any) {
    // Ensure all required fields have defaults
    const jobWithDefaults = {
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      totalOrders: null,
      lastCursor: null,
      batchSize: 50,
      status: 'IN_PROGRESS',
      ...job,
    };
    this.jobs.set(job.id, jobWithDefaults);
  }

  getJob(id: string) {
    return this.jobs.get(id) || null;
  }

  updateJob(id: string, data: any) {
    const job = this.jobs.get(id);
    if (job) {
      // Merge data but preserve existing values for fields not in data
      const updatedJob = { ...job, ...data };
      this.jobs.set(id, updatedJob);
      return updatedJob;
    }
    return null;
  }

  getLatestJob(shop: string) {
    const shopJobs = Array.from(this.jobs.values()).filter(j => j.shop === shop);
    return shopJobs.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  }

  addCustomer(customer: any) {
    this.customers.set(customer.shopifyCustomerId, customer);
  }

  getCustomer(shopifyCustomerId: string) {
    return this.customers.get(shopifyCustomerId) || null;
  }

  addOrder(order: any) {
    this.orders.set(order.shopifyOrderId, order);
  }

  getOrder(shopifyOrderId: string) {
    return this.orders.get(shopifyOrderId) || null;
  }
}

// Create mock Shopify Admin context
function createMockShopifyAdmin(options: {
  totalOrders?: number;
  ordersPerBatch?: number;
  totalBatches?: number;
  shouldFail?: boolean;
  failAtBatch?: number;
}) {
  const {
    totalOrders = 100,
    ordersPerBatch = 50,
    totalBatches = Math.ceil(totalOrders / ordersPerBatch),
    shouldFail = false,
    failAtBatch = -1,
  } = options;

  let currentBatch = 0;

  return {
    graphql: vi.fn().mockImplementation(async (query: string) => {
      if (query.includes('ordersCount')) {
        return {
          json: async () => ({
            data: { ordersCount: { count: totalOrders } }
          }),
        };
      }

      if (query.includes('getOrders')) {
        currentBatch++;

        if (shouldFail && currentBatch === failAtBatch) {
          return {
            json: async () => ({
              errors: [{ message: 'Simulated API error' }],
            }),
          };
        }

        const isLastBatch = currentBatch >= totalBatches;
        const ordersInThisBatch = isLastBatch
          ? totalOrders - (currentBatch - 1) * ordersPerBatch
          : ordersPerBatch;

        const edges = Array.from({ length: ordersInThisBatch }, (_, i) => ({
          cursor: `cursor-batch${currentBatch}-${i}`,
          node: {
            id: `gid://shopify/Order/${currentBatch * 1000 + i}`,
            name: `#${1000 + currentBatch * 100 + i}`,
            email: `customer${i}@test.com`,
            createdAt: '2024-06-15T10:00:00Z',
            updatedAt: '2024-06-15T10:00:00Z',
            processedAt: '2024-06-15T10:00:00Z',
            currencyCode: 'USD',
            subtotalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
            totalDiscountsSet: { shopMoney: { amount: '0.00' } },
            totalShippingPriceSet: { shopMoney: { amount: '5.00' } },
            totalTaxSet: { shopMoney: { amount: '8.00' } },
            totalPriceSet: { shopMoney: { amount: '113.00' } },
            totalRefundedSet: { shopMoney: { amount: '0.00' } },
            netPaymentSet: { shopMoney: { amount: '113.00' } },
            displayFinancialStatus: 'PAID',
            displayFulfillmentStatus: 'UNFULFILLED',
            customer: {
              id: `gid://shopify/Customer/${i}`,
              email: `customer${i}@test.com`,
            },
            lineItems: { edges: [] },
            refunds: [],
          },
        }));

        return {
          json: async () => ({
            data: {
              orders: {
                edges,
                pageInfo: {
                  hasNextPage: !isLastBatch,
                  endCursor: `cursor-batch${currentBatch}-end`,
                },
              },
            },
          }),
        };
      }

      return { json: async () => ({}) };
    }),
    resetBatchCounter: () => { currentBatch = 0; },
  };
}

describe('Order Sync Flow Integration Tests', () => {
  let dbState: MockDatabaseState;
  const shop = 'test-shop.myshopify.com';

  beforeEach(() => {
    vi.clearAllMocks();
    dbState = new MockDatabaseState();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Add test customers
    for (let i = 0; i < 10; i++) {
      dbState.addCustomer({
        id: `customer-uuid-${i}`,
        shop,
        shopifyCustomerId: String(i),
        email: `customer${i}@test.com`,
        currentTier: {
          id: 'tier-gold',
          name: 'Gold',
          cashbackPercent: 5,
        },
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Sync Flow', () => {
    it('should complete a full sync from start to finish', async () => {
      const mockAdmin = createMockShopifyAdmin({
        totalOrders: 100,
        ordersPerBatch: 50,
      });

      // Setup database mocks
      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.orderSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = {
          id: 'job-123',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        dbState.addJob(job);
        return job;
      });
      (db.orderSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockImplementation(async ({ where }) => {
        return dbState.getCustomer(where.shopifyCustomerId);
      });
      (db.order.findFirst as Mock).mockImplementation(async ({ where }) => {
        return dbState.getOrder(where.shopifyOrderId);
      });
      (db.order.create as Mock).mockImplementation(async ({ data }) => {
        dbState.addOrder(data);
        return data;
      });
      (db.storeCreditLedger.create as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);

      // Step 1: Start the sync
      const startResult = await startOrderSyncJob(shop, mockAdmin as any);
      expect(startResult.success).toBe(true);
      expect(startResult.progress.totalOrders).toBe(100);

      // Step 2: Process first batch
      let result = await processOrderBatch(startResult.jobId, mockAdmin as any);
      expect(result.success).toBe(true);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.hasMore).toBe(true);
      expect(result.progress.processedCount).toBe(50);

      // Step 3: Process second batch
      result = await processOrderBatch(startResult.jobId, mockAdmin as any);
      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.hasMore).toBe(false);
      expect(result.progress.processedCount).toBe(100);
    });

    it('should track progress accurately across batches', async () => {
      const mockAdmin = createMockShopifyAdmin({
        totalOrders: 150,
        ordersPerBatch: 50,
      });

      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.orderSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.orderSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockImplementation(async ({ where }) => {
        return dbState.getCustomer(where.shopifyCustomerId);
      });
      (db.order.findFirst as Mock).mockResolvedValue(null);
      (db.order.create as Mock).mockResolvedValue({});
      (db.storeCreditLedger.create as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);

      const startResult = await startOrderSyncJob(shop, mockAdmin as any);

      const progressHistory: number[] = [];

      // Process all batches
      let result = startResult;
      while (result.hasMore) {
        result = await processOrderBatch(startResult.jobId, mockAdmin as any);
        progressHistory.push(result.progress.percentComplete);
      }

      // Progress should increase monotonically
      expect(progressHistory).toEqual([33, 67, 100]);
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('Interrupt and Resume Flow', () => {
    it('should resume from where it left off after failure', async () => {
      const mockAdmin = createMockShopifyAdmin({
        totalOrders: 100,
        ordersPerBatch: 50,
        shouldFail: true,
        failAtBatch: 2,
      });

      // Setup
      (db.orderSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.orderSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.orderSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockImplementation(async ({ where }) => {
        return dbState.getCustomer(where.shopifyCustomerId);
      });
      (db.order.findFirst as Mock).mockResolvedValue(null);
      (db.order.create as Mock).mockResolvedValue({});
      (db.storeCreditLedger.create as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);

      // Start and process first batch
      const startResult = await startOrderSyncJob(shop, mockAdmin as any);
      let result = await processOrderBatch(startResult.jobId, mockAdmin as any);

      expect(result.success).toBe(true);
      expect(result.progress.processedCount).toBe(50);

      // Second batch fails
      result = await processOrderBatch(startResult.jobId, mockAdmin as any);
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('GraphQL errors');

      // Create new admin that won't fail
      const fixedAdmin = createMockShopifyAdmin({
        totalOrders: 100,
        ordersPerBatch: 50,
      });

      // Resume the job
      result = await resumeOrderSyncJob(startResult.jobId, fixedAdmin as any);
      expect(result.success).toBe(true);
      // Should complete on resume since the fixed admin returns last batch
    });

    it('should preserve cursor when resuming', async () => {
      const savedCursor = 'saved-cursor-position';

      // Track the current job state
      let currentJobState = {
        id: 'job-123',
        shop,
        status: 'FAILED',
        lastCursor: savedCursor,
        processedCount: 50,
        totalOrders: 100,
        createdCount: 45,
        updatedCount: 3,
        skippedCount: 2,
        errorCount: 0,
        batchSize: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        lastError: 'Previous error',
      };

      // findUnique should always return current state
      (db.orderSyncJob.findUnique as Mock).mockImplementation(async () => {
        return { ...currentJobState };
      });

      // update should modify the state and return it
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => {
        currentJobState = { ...currentJobState, ...data };
        return { ...currentJobState };
      });

      let capturedVariables: any = null;
      const mockAdmin = {
        graphql: vi.fn().mockImplementation(async (query: string, options?: any) => {
          if (query.includes('getOrders')) {
            capturedVariables = options?.variables;
            return {
              json: async () => ({
                data: {
                  orders: {
                    edges: [],
                    pageInfo: { hasNextPage: false, endCursor: 'final-cursor' },
                  },
                },
              }),
            };
          }
          return { json: async () => ({}) };
        }),
      } as any;

      (db.customer.findMany as Mock).mockResolvedValue([]);

      await resumeOrderSyncJob('job-123', mockAdmin);

      // Verify that the cursor was passed to the GraphQL query
      expect(capturedVariables?.after).toBe(savedCursor);
    });
  });

  describe('Cancel Flow', () => {
    it('should allow canceling an in-progress sync', async () => {
      (db.orderSyncJob.findUnique as Mock).mockResolvedValue({
        id: 'job-123',
        shop,
        status: 'IN_PROGRESS',
        processedCount: 50,
      });
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

    it('should allow resuming a cancelled job', async () => {
      (db.orderSyncJob.findUnique as Mock)
        .mockResolvedValueOnce({
          id: 'job-123',
          shop,
          status: 'CANCELLED',
          lastCursor: 'some-cursor',
          processedCount: 50,
          totalOrders: 100,
          createdCount: 45,
          updatedCount: 3,
          skippedCount: 2,
          errorCount: 0,
          batchSize: 50,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        })
        .mockResolvedValueOnce({
          id: 'job-123',
          shop,
          status: 'IN_PROGRESS',
          lastCursor: 'some-cursor',
          processedCount: 50,
          totalOrders: 100,
          createdCount: 45,
          updatedCount: 3,
          skippedCount: 2,
          errorCount: 0,
          batchSize: 50,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        });

      (db.orderSyncJob.update as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);

      const mockAdmin = createMockShopifyAdmin({ totalOrders: 100 });
      const result = await resumeOrderSyncJob('job-123', mockAdmin as any);

      // Should successfully resume
      expect(result.status).not.toBe('CANCELLED');
    });
  });

  describe('Error Handling', () => {
    it('should handle mixed success and failure in batch', async () => {
      const job = {
        id: 'job-123',
        shop,
        status: 'IN_PROGRESS',
        processedCount: 0,
        totalOrders: 10,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        lastCursor: null,
        batchSize: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      };

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
      }));

      let orderCreateCount = 0;
      (db.customer.findFirst as Mock).mockImplementation(async ({ where }) => {
        // Some customers exist, some don't
        if (parseInt(where.shopifyCustomerId) % 2 === 0) {
          return {
            id: `customer-${where.shopifyCustomerId}`,
            shop,
            shopifyCustomerId: where.shopifyCustomerId,
            currentTier: { id: 'tier-1', name: 'Gold', cashbackPercent: 5 },
          };
        }
        return null; // Customer not found
      });
      (db.order.findFirst as Mock).mockResolvedValue(null);
      (db.order.create as Mock).mockImplementation(async () => {
        orderCreateCount++;
        if (orderCreateCount === 3) {
          throw new Error('Database error');
        }
        return {};
      });
      (db.storeCreditLedger.create as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);

      const mockAdmin = createMockShopifyAdmin({
        totalOrders: 10,
        ordersPerBatch: 10,
      });

      const result = await processOrderBatch('job-123', mockAdmin as any);

      // Should complete but with mixed results
      expect(result.success).toBe(true);
      expect(result.progress.skippedCount).toBeGreaterThan(0); // Missing customers
      expect(result.progress.errorCount).toBeGreaterThan(0); // DB error
      expect(result.progress.createdCount).toBeGreaterThan(0); // Some succeeded
    });

    it('should handle API throttling gracefully', async () => {
      let callCount = 0;

      const mockAdmin = {
        graphql: vi.fn().mockImplementation(async (query: string) => {
          if (query.includes('ordersCount')) {
            return { json: async () => ({ data: { ordersCount: { count: 100 } } }) };
          }

          callCount++;
          if (callCount === 1) {
            // First call throttled
            return {
              json: async () => ({
                errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
              }),
            };
          }

          // Subsequent calls succeed
          return {
            json: async () => ({
              data: {
                orders: {
                  edges: [],
                  pageInfo: { hasNextPage: false, endCursor: 'cursor' },
                },
              },
            }),
          };
        }),
      } as any;

      const job = {
        id: 'job-123',
        shop,
        status: 'IN_PROGRESS',
        processedCount: 0,
        totalOrders: 100,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        lastCursor: null,
        batchSize: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      };

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
      }));
      (db.customer.findMany as Mock).mockResolvedValue([]);

      // Should fail on throttling
      const result = await processOrderBatch('job-123', mockAdmin);
      expect(result.status).toBe('FAILED');
    });
  });

  describe('Data Integrity', () => {
    it('should not create duplicate orders on re-sync', async () => {
      const existingOrder = {
        id: 'existing-order-uuid',
        shopifyOrderId: '1000',
        shop,
      };

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue({
        id: 'job-123',
        shop,
        status: 'IN_PROGRESS',
        processedCount: 0,
        totalOrders: 1,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        lastCursor: null,
        batchSize: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => data);
      (db.customer.findFirst as Mock).mockResolvedValue({
        id: 'customer-1',
        shop,
        shopifyCustomerId: '0',
        currentTier: null,
      });
      (db.order.findFirst as Mock).mockResolvedValue(existingOrder);
      (db.order.update as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);

      const mockAdmin = createMockShopifyAdmin({
        totalOrders: 1,
        ordersPerBatch: 1,
      });

      const result = await processOrderBatch('job-123', mockAdmin as any);

      expect(result.progress.updatedCount).toBe(1);
      expect(result.progress.createdCount).toBe(0);
      expect(db.order.create).not.toHaveBeenCalled();
      expect(db.order.update).toHaveBeenCalled();
    });

    it('should correctly calculate cashback for orders with tiers', async () => {
      let capturedOrderData: any = null;

      (db.orderSyncJob.findUnique as Mock).mockResolvedValue({
        id: 'job-123',
        shop,
        status: 'IN_PROGRESS',
        processedCount: 0,
        totalOrders: 1,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        lastCursor: null,
        batchSize: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });
      (db.orderSyncJob.update as Mock).mockImplementation(async ({ data }) => data);
      (db.customer.findFirst as Mock).mockResolvedValue({
        id: 'customer-1',
        shop,
        shopifyCustomerId: '0',
        email: 'customer@test.com',
        currentTier: {
          id: 'tier-platinum',
          name: 'Platinum',
          cashbackPercent: 10, // 10% cashback
        },
      });
      (db.order.findFirst as Mock).mockResolvedValue(null);
      (db.order.create as Mock).mockImplementation(async ({ data }) => {
        capturedOrderData = data;
        return data;
      });
      (db.storeCreditLedger.create as Mock).mockResolvedValue({});
      (db.customer.findMany as Mock).mockResolvedValue([]);

      // Order with $100 subtotal, $20 discount = $80 net = $8 cashback (10%)
      const mockAdmin = {
        graphql: vi.fn().mockImplementation(async (query: string) => {
          if (query.includes('ordersCount')) {
            return { json: async () => ({ data: { ordersCount: { count: 1 } } }) };
          }
          if (query.includes('getOrders')) {
            return {
              json: async () => ({
                data: {
                  orders: {
                    edges: [{
                      cursor: 'cursor-1',
                      node: {
                        id: 'gid://shopify/Order/12345',
                        name: '#1001',
                        email: 'customer@test.com',
                        createdAt: '2024-06-15T10:00:00Z',
                        updatedAt: '2024-06-15T10:00:00Z',
                        processedAt: '2024-06-15T10:00:00Z',
                        currencyCode: 'USD',
                        subtotalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
                        totalDiscountsSet: { shopMoney: { amount: '20.00' } },
                        totalShippingPriceSet: { shopMoney: { amount: '5.00' } },
                        totalTaxSet: { shopMoney: { amount: '6.40' } },
                        totalPriceSet: { shopMoney: { amount: '91.40' } },
                        totalRefundedSet: { shopMoney: { amount: '0.00' } },
                        netPaymentSet: { shopMoney: { amount: '91.40' } },
                        displayFinancialStatus: 'PAID',
                        displayFulfillmentStatus: 'UNFULFILLED',
                        customer: { id: 'gid://shopify/Customer/0', email: 'customer@test.com' },
                        lineItems: { edges: [] },
                        refunds: [],
                      },
                    }],
                    pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
                  },
                },
              }),
            };
          }
          return { json: async () => ({}) };
        }),
      } as any;

      await processOrderBatch('job-123', mockAdmin);

      // Verify cashback calculation: (100 - 20) * 10% = 8
      expect(capturedOrderData).not.toBeNull();
      expect(capturedOrderData.cashbackPercent).toBe(10);
      expect(capturedOrderData.cashbackAmount).toBe(8); // (100 - 20) * 0.10
      expect(capturedOrderData.tierIdAtOrder).toBe('tier-platinum');
      expect(capturedOrderData.tierNameAtOrder).toBe('Platinum');
    });
  });
});
