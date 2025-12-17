import { describe, it, expect, beforeEach, vi, afterEach, Mock } from 'vitest';

/**
 * Integration Tests for Customer Sync Flow
 *
 * These tests verify the complete customer sync workflow from UI to database.
 * They test realistic scenarios including:
 * - Full sync completion
 * - Interrupted and resumed syncs
 * - Error handling and recovery
 * - Progress tracking accuracy
 * - Tier assignment based on spending
 */

// Mock database
vi.mock('../../app/db.server', () => ({
  default: {
    customerSyncJob: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tier: {
      findMany: vi.fn(),
    },
  },
}));

import db from '../../app/db.server';
import {
  startSyncJob,
  processNextBatch,
  getSyncJobStatus,
  resumeSyncJob,
  cancelSyncJob,
} from '../../app/services/customer-sync-job.server';

// State tracker for simulating real database behavior
class MockDatabaseState {
  private jobs: Map<string, any> = new Map();
  private customers: Map<string, any> = new Map();
  private tiers: any[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.jobs.clear();
    this.customers.clear();
    this.tiers = [];
  }

  setTiers(tiers: any[]) {
    this.tiers = tiers;
  }

  getTiers() {
    return this.tiers;
  }

  addJob(job: any) {
    // Ensure all required fields have defaults
    const jobWithDefaults = {
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      totalCustomers: null,
      lastCursor: null,
      batchSize: 100,
      status: 'IN_PROGRESS',
      lastError: null,
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
}

// Create mock Shopify Admin context
function createMockShopifyAdmin(options: {
  totalCustomers?: number;
  customersPerBatch?: number;
  totalBatches?: number;
  shouldFail?: boolean;
  failAtBatch?: number;
  customersData?: any[];
}) {
  const {
    totalCustomers = 100,
    customersPerBatch = 100,
    totalBatches = Math.ceil(totalCustomers / customersPerBatch),
    shouldFail = false,
    failAtBatch = -1,
    customersData,
  } = options;

  let currentBatch = 0;

  return {
    graphql: vi.fn().mockImplementation(async (query: string) => {
      if (query.includes('getShopCustomerCount')) {
        return {
          json: async () => ({
            data: { shop: { customersCount: totalCustomers } },
          }),
        };
      }

      if (query.includes('getCustomers')) {
        currentBatch++;

        if (shouldFail && currentBatch === failAtBatch) {
          return {
            json: async () => ({
              errors: [{ message: 'Simulated API error' }],
            }),
          };
        }

        const isLastBatch = currentBatch >= totalBatches;
        const customersInThisBatch = isLastBatch
          ? totalCustomers - (currentBatch - 1) * customersPerBatch
          : customersPerBatch;

        const edges = customersData?.slice(
          (currentBatch - 1) * customersPerBatch,
          currentBatch * customersPerBatch
        ).map((c, i) => ({
          cursor: `cursor-batch${currentBatch}-${i}`,
          node: c,
        })) || Array.from({ length: customersInThisBatch }, (_, i) => ({
          cursor: `cursor-batch${currentBatch}-${i}`,
          node: {
            id: `gid://shopify/Customer/${currentBatch * 1000 + i}`,
            email: `customer${currentBatch * 100 + i}@test.com`,
            firstName: 'Test',
            lastName: `Customer${i}`,
            displayName: `Test Customer ${i}`,
            createdAt: '2024-06-15T10:00:00Z',
            updatedAt: '2024-06-15T10:00:00Z',
            amountSpent: { amount: '100.00', currencyCode: 'USD' },
            numberOfOrders: 5,
          },
        }));

        return {
          json: async () => ({
            data: {
              customers: {
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

// Create mock tiers
function createMockTiers() {
  return [
    { id: 'tier-gold', name: 'Gold', minSpend: 1000, shop: 'test-shop.myshopify.com' },
    { id: 'tier-silver', name: 'Silver', minSpend: 500, shop: 'test-shop.myshopify.com' },
    { id: 'tier-bronze', name: 'Bronze', minSpend: 0, shop: 'test-shop.myshopify.com' },
  ];
}

describe('Customer Sync Flow Integration Tests', () => {
  let dbState: MockDatabaseState;
  const shop = 'test-shop.myshopify.com';

  beforeEach(() => {
    vi.clearAllMocks();
    dbState = new MockDatabaseState();
    dbState.setTiers(createMockTiers());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Sync Flow', () => {
    it('should complete a full sync from start to finish', async () => {
      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 150,
        customersPerBatch: 100,
      });

      // Setup database mocks
      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = {
          id: 'job-123',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});

      // Step 1: Start the sync
      const startResult = await startSyncJob(shop, mockAdmin as any);
      expect(startResult.success).toBe(true);
      expect(startResult.progress.totalCustomers).toBe(150);

      // Step 2: Process first batch (100 customers)
      let result = await processNextBatch(startResult.jobId, mockAdmin as any);
      expect(result.success).toBe(true);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.hasMore).toBe(true);
      expect(result.progress.processedCount).toBe(100);

      // Step 3: Process second batch (50 customers)
      result = await processNextBatch(startResult.jobId, mockAdmin as any);
      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.hasMore).toBe(false);
      expect(result.progress.processedCount).toBe(150);
    });

    it('should track progress accurately across batches', async () => {
      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 300,
        customersPerBatch: 100,
      });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});

      const startResult = await startSyncJob(shop, mockAdmin as any);

      const progressHistory: number[] = [];

      // Process all batches
      let result = startResult;
      while (result.hasMore) {
        result = await processNextBatch(startResult.jobId, mockAdmin as any);
        progressHistory.push(result.progress.percentComplete);
      }

      // Progress should increase monotonically
      expect(progressHistory).toEqual([33, 67, 100]);
      expect(result.status).toBe('COMPLETED');
    });

    it('should correctly count created vs updated customers', async () => {
      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 3,
        customersPerBatch: 100,
      });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });

      // First customer exists, second and third don't
      (db.customer.findFirst as Mock)
        .mockResolvedValueOnce({ id: 'existing-customer', shopifyCustomerId: '1000', currentTierId: 'tier-bronze' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (db.customer.create as Mock).mockResolvedValue({});
      (db.customer.update as Mock).mockResolvedValue({});

      const startResult = await startSyncJob(shop, mockAdmin as any);
      const result = await processNextBatch(startResult.jobId, mockAdmin as any);

      expect(result.progress.createdCount).toBe(2);
      expect(result.progress.updatedCount).toBe(1);
    });
  });

  describe('Tier Assignment', () => {
    it('should assign correct tiers based on spending', async () => {
      const customersData = [
        { id: 'gid://shopify/Customer/1', email: 'gold@test.com', firstName: 'Gold', lastName: 'Customer', displayName: 'Gold', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '1500.00', currencyCode: 'USD' }, numberOfOrders: 20 },
        { id: 'gid://shopify/Customer/2', email: 'silver@test.com', firstName: 'Silver', lastName: 'Customer', displayName: 'Silver', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '750.00', currencyCode: 'USD' }, numberOfOrders: 10 },
        { id: 'gid://shopify/Customer/3', email: 'bronze@test.com', firstName: 'Bronze', lastName: 'Customer', displayName: 'Bronze', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '100.00', currencyCode: 'USD' }, numberOfOrders: 2 },
      ];

      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 3,
        customersPerBatch: 100,
        customersData,
      });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockResolvedValue(null);

      const createCalls: any[] = [];
      (db.customer.create as Mock).mockImplementation(async ({ data }) => {
        createCalls.push(data);
        return data;
      });

      const startResult = await startSyncJob(shop, mockAdmin as any);
      await processNextBatch(startResult.jobId, mockAdmin as any);

      // Verify tier assignments
      expect(createCalls[0].currentTierId).toBe('tier-gold');   // $1500
      expect(createCalls[1].currentTierId).toBe('tier-silver'); // $750
      expect(createCalls[2].currentTierId).toBe('tier-bronze'); // $100
    });

    it('should handle edge case at tier boundaries', async () => {
      const customersData = [
        { id: 'gid://shopify/Customer/1', email: 'exactly-gold@test.com', firstName: 'Exactly', lastName: 'Gold', displayName: 'Gold', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '1000.00', currencyCode: 'USD' }, numberOfOrders: 15 },
        { id: 'gid://shopify/Customer/2', email: 'just-under-gold@test.com', firstName: 'Just', lastName: 'Under', displayName: 'Under', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '999.99', currencyCode: 'USD' }, numberOfOrders: 14 },
        { id: 'gid://shopify/Customer/3', email: 'exactly-silver@test.com', firstName: 'Exactly', lastName: 'Silver', displayName: 'Silver', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '500.00', currencyCode: 'USD' }, numberOfOrders: 8 },
      ];

      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 3,
        customersPerBatch: 100,
        customersData,
      });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockResolvedValue(null);

      const createCalls: any[] = [];
      (db.customer.create as Mock).mockImplementation(async ({ data }) => {
        createCalls.push(data);
        return data;
      });

      const startResult = await startSyncJob(shop, mockAdmin as any);
      await processNextBatch(startResult.jobId, mockAdmin as any);

      // $1000 exactly should get Gold
      expect(createCalls[0].currentTierId).toBe('tier-gold');
      // $999.99 should get Silver (not Gold)
      expect(createCalls[1].currentTierId).toBe('tier-silver');
      // $500 exactly should get Silver
      expect(createCalls[2].currentTierId).toBe('tier-silver');
    });
  });

  describe('Interrupt and Resume Flow', () => {
    it('should resume from where it left off after failure', async () => {
      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 200,
        customersPerBatch: 100,
        shouldFail: true,
        failAtBatch: 2,
      });

      // Setup
      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});

      // Start and process first batch
      const startResult = await startSyncJob(shop, mockAdmin as any);
      let result = await processNextBatch(startResult.jobId, mockAdmin as any);

      expect(result.success).toBe(true);
      expect(result.progress.processedCount).toBe(100);

      // Second batch fails
      result = await processNextBatch(startResult.jobId, mockAdmin as any);
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('GraphQL errors');

      // Create new admin that won't fail
      const fixedAdmin = createMockShopifyAdmin({
        totalCustomers: 200,
        customersPerBatch: 100,
      });

      // Resume the job
      result = await resumeSyncJob(startResult.jobId, fixedAdmin as any);
      expect(result.success).toBe(true);
    });

    it('should preserve cursor when resuming', async () => {
      const savedCursor = 'saved-cursor-position';

      // Track the current job state
      let currentJobState = {
        id: 'job-123',
        shop,
        status: 'FAILED',
        lastCursor: savedCursor,
        processedCount: 100,
        totalCustomers: 200,
        createdCount: 90,
        updatedCount: 8,
        skippedCount: 2,
        errorCount: 0,
        batchSize: 100,
        lastError: 'Previous error',
      };

      // findUnique should always return current state
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async () => {
        return { ...currentJobState };
      });

      // update should modify the state and return it
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ data }) => {
        currentJobState = { ...currentJobState, ...data };
        return { ...currentJobState };
      });

      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());

      let capturedVariables: any = null;
      const mockAdmin = {
        graphql: vi.fn().mockImplementation(async (query: string, options?: any) => {
          if (query.includes('getCustomers')) {
            capturedVariables = options?.variables;
            return {
              json: async () => ({
                data: {
                  customers: {
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

      (db.customer.findFirst as Mock).mockResolvedValue(null);

      await resumeSyncJob('job-123', mockAdmin);

      // Verify that the cursor was passed to the GraphQL query
      expect(capturedVariables?.after).toBe(savedCursor);
    });
  });

  describe('Cancel Flow', () => {
    it('should allow canceling an in-progress sync', async () => {
      (db.customerSyncJob.findUnique as Mock).mockResolvedValue({
        id: 'job-123',
        shop,
        status: 'IN_PROGRESS',
        processedCount: 50,
      });
      (db.customerSyncJob.update as Mock).mockResolvedValue({});

      const result = await cancelSyncJob('job-123');

      expect(result).toBe(true);
      expect(db.customerSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      });
    });

    it('should allow resuming a cancelled job', async () => {
      const cancelledJob = {
        id: 'job-123',
        shop,
        status: 'CANCELLED',
        lastCursor: 'some-cursor',
        processedCount: 50,
        totalCustomers: 100,
        createdCount: 45,
        updatedCount: 3,
        skippedCount: 2,
        errorCount: 0,
        batchSize: 100,
      };

      let currentJobState = { ...cancelledJob };

      (db.customerSyncJob.findUnique as Mock).mockImplementation(async () => {
        return { ...currentJobState };
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ data }) => {
        currentJobState = { ...currentJobState, ...data };
        return { ...currentJobState };
      });
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});

      const mockAdmin = createMockShopifyAdmin({ totalCustomers: 100 });
      const result = await resumeSyncJob('job-123', mockAdmin as any);

      // Should successfully resume
      expect(result.status).not.toBe('CANCELLED');
    });
  });

  describe('Error Handling', () => {
    it('should skip customers without email', async () => {
      const customersData = [
        { id: 'gid://shopify/Customer/1', email: null, firstName: 'No', lastName: 'Email', displayName: 'No Email', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '100.00', currencyCode: 'USD' }, numberOfOrders: 5 },
        { id: 'gid://shopify/Customer/2', email: 'valid@test.com', firstName: 'Valid', lastName: 'Customer', displayName: 'Valid', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '100.00', currencyCode: 'USD' }, numberOfOrders: 5 },
      ];

      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 2,
        customersPerBatch: 100,
        customersData,
      });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});

      const startResult = await startSyncJob(shop, mockAdmin as any);
      const result = await processNextBatch(startResult.jobId, mockAdmin as any);

      expect(result.progress.skippedCount).toBe(1);
      expect(result.progress.createdCount).toBe(1);
      expect(db.customer.create).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed success and failure in batch', async () => {
      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 5,
        customersPerBatch: 100,
      });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockResolvedValue(null);

      let createCount = 0;
      (db.customer.create as Mock).mockImplementation(async () => {
        createCount++;
        if (createCount === 3) {
          throw new Error('Database error');
        }
        return {};
      });

      const startResult = await startSyncJob(shop, mockAdmin as any);
      const result = await processNextBatch(startResult.jobId, mockAdmin as any);

      // Should complete but with mixed results
      expect(result.success).toBe(true);
      expect(result.progress.errorCount).toBe(1);
      expect(result.progress.createdCount).toBe(4);
    });

    it('should fail when no tiers configured', async () => {
      const mockAdmin = createMockShopifyAdmin({ totalCustomers: 100 });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue([]); // No tiers

      const result = await startSyncJob(shop, mockAdmin as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No tiers configured');
    });

    it('should handle API throttling gracefully', async () => {
      let callCount = 0;

      const mockAdmin = {
        graphql: vi.fn().mockImplementation(async (query: string) => {
          if (query.includes('getShopCustomerCount')) {
            return { json: async () => ({ data: { shop: { customersCount: 100 } } }) };
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
                customers: {
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
        totalCustomers: 100,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        lastCursor: null,
        batchSize: 100,
      };

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ data }) => ({
        ...job,
        ...data,
      }));

      // Should fail on throttling
      const result = await processNextBatch('job-123', mockAdmin);
      expect(result.status).toBe('FAILED');
    });
  });

  describe('Data Integrity', () => {
    it('should not create duplicate customers on re-sync', async () => {
      const existingCustomer = {
        id: 'existing-customer-uuid',
        shopifyCustomerId: '1000',
        shop,
        email: 'existing@test.com',
        currentTierId: 'tier-bronze',
        firstName: 'Existing',
        lastName: 'Customer',
      };

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue({
        id: 'job-123',
        shop,
        status: 'IN_PROGRESS',
        processedCount: 0,
        totalCustomers: 1,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        lastCursor: null,
        batchSize: 100,
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ data }) => data);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(existingCustomer);
      (db.customer.update as Mock).mockResolvedValue({});

      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 1,
        customersPerBatch: 100,
      });

      const result = await processNextBatch('job-123', mockAdmin as any);

      expect(result.progress.updatedCount).toBe(1);
      expect(result.progress.createdCount).toBe(0);
      expect(db.customer.create).not.toHaveBeenCalled();
      expect(db.customer.update).toHaveBeenCalled();
    });

    it('should store customer spending data correctly', async () => {
      const customersData = [
        { id: 'gid://shopify/Customer/1', email: 'customer@test.com', firstName: 'Test', lastName: 'Customer', displayName: 'Test', createdAt: '2024-01-01', updatedAt: '2024-01-01', amountSpent: { amount: '1234.56', currencyCode: 'USD' }, numberOfOrders: 15 },
      ];

      const mockAdmin = createMockShopifyAdmin({
        totalCustomers: 1,
        customersPerBatch: 100,
        customersData,
      });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockImplementation(async ({ data }) => {
        const job = { id: 'job-123', ...data, createdAt: new Date() };
        dbState.addJob(job);
        return job;
      });
      (db.customerSyncJob.findUnique as Mock).mockImplementation(async ({ where }) => {
        return dbState.getJob(where.id);
      });
      (db.customerSyncJob.update as Mock).mockImplementation(async ({ where, data }) => {
        return dbState.updateJob(where.id, data);
      });
      (db.customer.findFirst as Mock).mockResolvedValue(null);

      let capturedCustomerData: any = null;
      (db.customer.create as Mock).mockImplementation(async ({ data }) => {
        capturedCustomerData = data;
        return data;
      });

      const startResult = await startSyncJob(shop, mockAdmin as any);
      await processNextBatch(startResult.jobId, mockAdmin as any);

      expect(capturedCustomerData).not.toBeNull();
      expect(capturedCustomerData.totalSpent).toBe(1234.56);
      expect(capturedCustomerData.orderCount).toBe(15);
      expect(capturedCustomerData.currentTierId).toBe('tier-gold'); // $1234.56 > $1000
    });
  });
});
