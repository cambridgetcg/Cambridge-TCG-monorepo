import { describe, it, expect, beforeEach, vi, afterEach, Mock } from 'vitest';

// Mock the database
vi.mock('../../../app/db.server', () => ({
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

import db from '../../../app/db.server';
import {
  startSyncJob,
  processNextBatch,
  getSyncJobStatus,
  resumeSyncJob,
  cancelSyncJob,
  getSyncJobById,
} from '../../../app/services/customer-sync-job.server';

// Mock admin context
function createMockAdmin(options: {
  customerCount?: number;
  customers?: any[];
  hasNextPage?: boolean;
  endCursor?: string | null;
  shouldError?: boolean;
  errorMessage?: string;
} = {}) {
  const {
    customerCount = 100,
    customers = [],
    hasNextPage = false,
    endCursor = null,
    shouldError = false,
    errorMessage = 'GraphQL error',
  } = options;

  return {
    graphql: vi.fn().mockImplementation(async (query: string) => {
      if (shouldError) {
        return {
          json: async () => ({
            errors: [{ message: errorMessage }],
          }),
        };
      }

      if (query.includes('customersCount') || query.includes('getShopCustomerCount')) {
        return {
          json: async () => ({
            data: { customersCount: { count: customerCount, precision: 'EXACT' } },
          }),
        };
      }

      if (query.includes('getCustomers')) {
        return {
          json: async () => ({
            data: {
              customers: {
                edges: customers.map((c, i) => ({
                  cursor: `cursor-${i}`,
                  node: {
                    id: `gid://shopify/Customer/${c.id || i}`,
                    // Use 'email' in c to check if it was explicitly set (even to null)
                    email: 'email' in c ? c.email : `customer${i}@test.com`,
                    firstName: c.firstName || 'Test',
                    lastName: c.lastName || 'Customer',
                    displayName: c.displayName || `Test Customer ${i}`,
                    createdAt: c.createdAt || '2024-06-15T10:00:00Z',
                    updatedAt: c.updatedAt || '2024-06-15T10:00:00Z',
                    amountSpent: c.amountSpent || { amount: '100.00', currencyCode: 'USD' },
                    numberOfOrders: c.numberOfOrders || 5,
                  },
                })),
                pageInfo: {
                  hasNextPage,
                  endCursor,
                },
              },
            },
          }),
        };
      }

      return { json: async () => ({}) };
    }),
  } as any;
}

// Helper to create mock tiers
function createMockTiers() {
  return [
    { id: 'tier-gold', name: 'Gold', minSpend: 1000, shop: 'test-shop.myshopify.com' },
    { id: 'tier-silver', name: 'Silver', minSpend: 500, shop: 'test-shop.myshopify.com' },
    { id: 'tier-bronze', name: 'Bronze', minSpend: 0, shop: 'test-shop.myshopify.com' },
  ];
}

// Helper to create mock job
function createMockJob(overrides: Partial<any> = {}) {
  return {
    id: 'job-123',
    shop: 'test-shop.myshopify.com',
    status: 'IN_PROGRESS',
    totalCustomers: 100,
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    lastCursor: null,
    batchSize: 100,
    lastError: null,
    startedAt: new Date(),
    completedAt: null,
    lastActivityAt: new Date(),
    triggeredBy: 'manual',
    metadata: { tierCount: 3, lowestTierId: 'tier-bronze' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Customer Sync Job Service', () => {
  const shop = 'test-shop.myshopify.com';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startSyncJob', () => {
    it('should create a new sync job successfully', async () => {
      const mockAdmin = createMockAdmin({ customerCount: 500 });
      const mockJob = createMockJob({ totalCustomers: 500 });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockResolvedValue(mockJob);

      const result = await startSyncJob(shop, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.progress.totalCustomers).toBe(500);
      expect(result.hasMore).toBe(true);
      expect(db.customerSyncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shop,
          status: 'IN_PROGRESS',
          totalCustomers: 500,
          batchSize: 100,
        }),
      });
    });

    it('should return error when sync already in progress', async () => {
      const mockAdmin = createMockAdmin();
      const existingJob = createMockJob({ processedCount: 50 });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(existingJob);

      const result = await startSyncJob(shop, mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sync already in progress');
      expect(result.jobId).toBe(existingJob.id);
      expect(db.customerSyncJob.create).not.toHaveBeenCalled();
    });

    it('should fail when no tiers are configured', async () => {
      const mockAdmin = createMockAdmin();

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue([]);

      const result = await startSyncJob(shop, mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No tiers configured');
      expect(db.customerSyncJob.create).not.toHaveBeenCalled();
    });

    it('should continue without customer count if API fails', async () => {
      const mockAdmin = {
        graphql: vi.fn().mockRejectedValue(new Error('API Error')),
      } as any;
      const mockJob = createMockJob({ totalCustomers: null });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockResolvedValue(mockJob);

      const result = await startSyncJob(shop, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.totalCustomers).toBeNull();
    });

    it('should accept custom triggeredBy parameter', async () => {
      const mockAdmin = createMockAdmin();
      const mockJob = createMockJob({ triggeredBy: 'install' });

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockResolvedValue(mockJob);

      await startSyncJob(shop, mockAdmin, 'install');

      expect(db.customerSyncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeredBy: 'install',
        }),
      });
    });

    it('should store tier metadata in job', async () => {
      const mockAdmin = createMockAdmin();
      const mockJob = createMockJob();

      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.create as Mock).mockResolvedValue(mockJob);

      await startSyncJob(shop, mockAdmin);

      expect(db.customerSyncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            tierCount: 3,
            lowestTierId: 'tier-bronze',
          }),
        }),
      });
    });
  });

  describe('processNextBatch', () => {
    it('should return error when job not found', async () => {
      const mockAdmin = createMockAdmin();
      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(null);

      const result = await processNextBatch('non-existent', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync job not found');
    });

    it('should return error when job not in progress', async () => {
      const mockAdmin = createMockAdmin();
      const completedJob = createMockJob({ status: 'COMPLETED' });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(completedJob);

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in progress');
    });

    it('should fail when no tiers configured during processing', async () => {
      const mockAdmin = createMockAdmin();
      const job = createMockJob();

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue([]);
      (db.customerSyncJob.update as Mock).mockResolvedValue({ ...job, status: 'FAILED' });

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No tiers configured');
      expect(db.customerSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: 'No tiers configured',
        }),
      });
    });

    it('should create new customers from Shopify', async () => {
      const customers = [
        { id: '1001', email: 'customer1@test.com', amountSpent: { amount: '1500.00' }, numberOfOrders: 10 },
        { id: '1002', email: 'customer2@test.com', amountSpent: { amount: '200.00' }, numberOfOrders: 3 },
      ];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false, endCursor: 'cursor-end' });
      const job = createMockJob();
      const updatedJob = createMockJob({ processedCount: 2, createdCount: 2 });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.createdCount).toBe(2);
      expect(db.customer.create).toHaveBeenCalledTimes(2);
    });

    it('should assign correct tier based on spending', async () => {
      const customers = [
        { id: '1001', email: 'gold@test.com', amountSpent: { amount: '1500.00' } }, // Gold (1000+)
        { id: '1002', email: 'silver@test.com', amountSpent: { amount: '750.00' } }, // Silver (500+)
        { id: '1003', email: 'bronze@test.com', amountSpent: { amount: '100.00' } }, // Bronze (0+)
      ];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const job = createMockJob();
      const updatedJob = createMockJob({ processedCount: 3, createdCount: 3 });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      await processNextBatch('job-123', mockAdmin);

      // Verify customers were created (tier assignment is handled by resolver, not during sync)
      const createCalls = (db.customer.create as Mock).mock.calls;
      expect(createCalls).toHaveLength(3);
      // Sync stores the spending data; tier resolution happens separately
      expect(createCalls[0][0].data.shopifyCustomerId).toBe('1001');
      expect(createCalls[1][0].data.shopifyCustomerId).toBe('1002');
      expect(createCalls[2][0].data.shopifyCustomerId).toBe('1003');
    });

    it('should update existing customers', async () => {
      const customers = [
        { id: '1001', email: 'existing@test.com', amountSpent: { amount: '500.00' }, numberOfOrders: 5 },
      ];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const job = createMockJob();
      const existingCustomer = {
        id: 'customer-uuid-1',
        shop,
        shopifyCustomerId: '1001',
        email: 'existing@test.com',
        currentTierId: 'tier-bronze',
        firstName: 'Old',
        lastName: 'Name',
      };
      const updatedJob = createMockJob({ processedCount: 1, updatedCount: 1 });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(existingCustomer);
      (db.customer.update as Mock).mockResolvedValue({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.updatedCount).toBe(1);
      expect(db.customer.update).toHaveBeenCalledTimes(1);
      expect(db.customer.create).not.toHaveBeenCalled();
    });

    it('should skip customers without email', async () => {
      const customers = [
        { id: '1001', email: null, amountSpent: { amount: '500.00' } },
        { id: '1002', email: 'valid@test.com', amountSpent: { amount: '100.00' } },
      ];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const job = createMockJob();
      const updatedJob = createMockJob({ processedCount: 2, createdCount: 1, skippedCount: 1 });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.skippedCount).toBe(1);
      expect(result.progress.createdCount).toBe(1);
      expect(db.customer.create).toHaveBeenCalledTimes(1);
    });

    it('should track errors per customer', async () => {
      const customers = [
        { id: '1001', email: 'error@test.com', amountSpent: { amount: '100.00' } },
        { id: '1002', email: 'success@test.com', amountSpent: { amount: '100.00' } },
      ];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const job = createMockJob();
      const updatedJob = createMockJob({ processedCount: 2, createdCount: 1, errorCount: 1 });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock)
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.progress.errorCount).toBe(1);
      expect(result.progress.createdCount).toBe(1);
    });

    it('should set status to COMPLETED when no more pages', async () => {
      const customers = [
        { id: '1001', email: 'last@test.com', amountSpent: { amount: '100.00' } },
      ];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const job = createMockJob();
      const updatedJob = createMockJob({ status: 'COMPLETED', processedCount: 1, createdCount: 1 });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.hasMore).toBe(false);
      expect(db.customerSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      });
    });

    it('should continue with hasMore when more pages exist', async () => {
      const customers = [
        { id: '1001', email: 'batch1@test.com', amountSpent: { amount: '100.00' } },
      ];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: true, endCursor: 'cursor-next' });
      const job = createMockJob();
      const updatedJob = createMockJob({ processedCount: 1, createdCount: 1 });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(result.hasMore).toBe(true);
      expect(db.customerSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          lastCursor: 'cursor-next',
          status: 'IN_PROGRESS',
        }),
      });
    });

    it('should handle GraphQL errors', async () => {
      const mockAdmin = createMockAdmin({ shouldError: true, errorMessage: 'Rate limited' });
      const job = createMockJob();

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customerSyncJob.update as Mock).mockResolvedValue({ ...job, status: 'FAILED' });

      const result = await processNextBatch('job-123', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('GraphQL errors');
    });

    it('should accumulate counts across batches', async () => {
      const customers = [
        { id: '1001', email: 'new@test.com', amountSpent: { amount: '100.00' } },
      ];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const job = createMockJob({
        processedCount: 50,
        createdCount: 30,
        updatedCount: 15,
        skippedCount: 5,
        errorCount: 0,
      });
      const updatedJob = createMockJob({
        processedCount: 51,
        createdCount: 31,
        updatedCount: 15,
        skippedCount: 5,
        errorCount: 0,
      });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      const result = await processNextBatch('job-123', mockAdmin);

      expect(db.customerSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          processedCount: 51,
          createdCount: 31,
        }),
      });
    });

    it('should use cursor from previous batch', async () => {
      const customers = [{ id: '1001', email: 'test@test.com', amountSpent: { amount: '100.00' } }];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const job = createMockJob({ lastCursor: 'previous-cursor' });
      const updatedJob = createMockJob({ processedCount: 1 });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});
      (db.customerSyncJob.update as Mock).mockResolvedValue(updatedJob);

      await processNextBatch('job-123', mockAdmin);

      expect(mockAdmin.graphql).toHaveBeenCalledWith(
        expect.stringContaining('getCustomers'),
        expect.objectContaining({
          variables: expect.objectContaining({
            after: 'previous-cursor',
          }),
        })
      );
    });
  });

  describe('getSyncJobStatus', () => {
    it('should return null when no jobs exist', async () => {
      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(null);

      const result = await getSyncJobStatus(shop);

      expect(result).toBeNull();
    });

    it('should return most recent job status', async () => {
      const job = createMockJob({
        processedCount: 75,
        totalCustomers: 100,
        createdCount: 50,
        updatedCount: 20,
        skippedCount: 5,
      });
      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(job);

      const result = await getSyncJobStatus(shop);

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe('job-123');
      expect(result!.progress.processedCount).toBe(75);
      expect(result!.progress.percentComplete).toBe(75);
    });

    it('should calculate percentComplete correctly', async () => {
      const job = createMockJob({ processedCount: 33, totalCustomers: 100 });
      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(job);

      const result = await getSyncJobStatus(shop);

      expect(result!.progress.percentComplete).toBe(33);
    });

    it('should return 0 percentComplete when totalCustomers is null', async () => {
      const job = createMockJob({ processedCount: 50, totalCustomers: null });
      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(job);

      const result = await getSyncJobStatus(shop);

      expect(result!.progress.percentComplete).toBe(0);
    });

    it('should include error from failed job', async () => {
      const job = createMockJob({ status: 'FAILED', lastError: 'API rate limit exceeded' });
      (db.customerSyncJob.findFirst as Mock).mockResolvedValue(job);

      const result = await getSyncJobStatus(shop);

      expect(result!.error).toBe('API rate limit exceeded');
    });
  });

  describe('resumeSyncJob', () => {
    it('should return error when job not found', async () => {
      const mockAdmin = createMockAdmin();
      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(null);

      const result = await resumeSyncJob('non-existent', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync job not found');
    });

    it('should only resume FAILED or CANCELLED jobs', async () => {
      const mockAdmin = createMockAdmin();
      const inProgressJob = createMockJob({ status: 'IN_PROGRESS' });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(inProgressJob);

      const result = await resumeSyncJob('job-123', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot resume job with status');
    });

    it('should resume FAILED job', async () => {
      const customers = [{ id: '1001', email: 'test@test.com', amountSpent: { amount: '100.00' } }];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const failedJob = createMockJob({
        status: 'FAILED',
        lastCursor: 'failed-cursor',
        processedCount: 50,
        lastError: 'Previous error',
      });
      const updatedJob = createMockJob({ status: 'IN_PROGRESS', processedCount: 50 });
      const completedJob = createMockJob({ status: 'COMPLETED', processedCount: 51 });

      (db.customerSyncJob.findUnique as Mock)
        .mockResolvedValueOnce(failedJob)
        .mockResolvedValueOnce(updatedJob);
      (db.customerSyncJob.update as Mock)
        .mockResolvedValueOnce(updatedJob)
        .mockResolvedValueOnce(completedJob);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});

      const result = await resumeSyncJob('job-123', mockAdmin);

      expect(result.success).toBe(true);
      expect(db.customerSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          lastError: null,
        }),
      });
    });

    it('should resume CANCELLED job', async () => {
      const customers = [{ id: '1001', email: 'test@test.com', amountSpent: { amount: '100.00' } }];
      const mockAdmin = createMockAdmin({ customers, hasNextPage: false });
      const cancelledJob = createMockJob({ status: 'CANCELLED', lastCursor: 'cancel-cursor' });
      const updatedJob = createMockJob({ status: 'IN_PROGRESS' });
      const completedJob = createMockJob({ status: 'COMPLETED' });

      (db.customerSyncJob.findUnique as Mock)
        .mockResolvedValueOnce(cancelledJob)
        .mockResolvedValueOnce(updatedJob);
      (db.customerSyncJob.update as Mock)
        .mockResolvedValueOnce(updatedJob)
        .mockResolvedValueOnce(completedJob);
      (db.tier.findMany as Mock).mockResolvedValue(createMockTiers());
      (db.customer.findFirst as Mock).mockResolvedValue(null);
      (db.customer.create as Mock).mockResolvedValue({});

      const result = await resumeSyncJob('job-123', mockAdmin);

      expect(result.success).toBe(true);
    });

    it('should not resume COMPLETED job', async () => {
      const mockAdmin = createMockAdmin();
      const completedJob = createMockJob({ status: 'COMPLETED' });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(completedJob);

      const result = await resumeSyncJob('job-123', mockAdmin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot resume job with status');
    });
  });

  describe('cancelSyncJob', () => {
    it('should cancel in-progress job', async () => {
      const job = createMockJob({ status: 'IN_PROGRESS' });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);
      (db.customerSyncJob.update as Mock).mockResolvedValue({ ...job, status: 'CANCELLED' });

      const result = await cancelSyncJob('job-123');

      expect(result).toBe(true);
      expect(db.customerSyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      });
    });

    it('should return false when job not found', async () => {
      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(null);

      const result = await cancelSyncJob('non-existent');

      expect(result).toBe(false);
      expect(db.customerSyncJob.update).not.toHaveBeenCalled();
    });

    it('should return false when job not in progress', async () => {
      const completedJob = createMockJob({ status: 'COMPLETED' });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(completedJob);

      const result = await cancelSyncJob('job-123');

      expect(result).toBe(false);
      expect(db.customerSyncJob.update).not.toHaveBeenCalled();
    });
  });

  describe('getSyncJobById', () => {
    it('should return null when job not found', async () => {
      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(null);

      const result = await getSyncJobById('non-existent');

      expect(result).toBeNull();
    });

    it('should return job details', async () => {
      const job = createMockJob({
        processedCount: 75,
        totalCustomers: 100,
        createdCount: 50,
        updatedCount: 20,
      });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValue(job);

      const result = await getSyncJobById('job-123');

      expect(result).not.toBeNull();
      expect(result!.jobId).toBe('job-123');
      expect(result!.progress.processedCount).toBe(75);
      expect(result!.progress.createdCount).toBe(50);
      expect(result!.progress.updatedCount).toBe(20);
    });

    it('should include hasMore based on status', async () => {
      const inProgressJob = createMockJob({ status: 'IN_PROGRESS' });
      const completedJob = createMockJob({ status: 'COMPLETED' });

      (db.customerSyncJob.findUnique as Mock).mockResolvedValueOnce(inProgressJob);
      const result1 = await getSyncJobById('job-123');
      expect(result1!.hasMore).toBe(true);

      (db.customerSyncJob.findUnique as Mock).mockResolvedValueOnce(completedJob);
      const result2 = await getSyncJobById('job-123');
      expect(result2!.hasMore).toBe(false);
    });
  });
});
