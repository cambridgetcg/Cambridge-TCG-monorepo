import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';

// Mock the authentication module
vi.mock('../../../app/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

// Mock the order sync job service
vi.mock('../../../app/services/order-sync-job.server', () => ({
  startOrderSyncJob: vi.fn(),
  processOrderBatch: vi.fn(),
  resumeOrderSyncJob: vi.fn(),
  getOrderSyncJobStatus: vi.fn(),
  getOrderSyncJobById: vi.fn(),
  cancelOrderSyncJob: vi.fn(),
}));

import { authenticate } from '../../../app/shopify.server';
import {
  startOrderSyncJob,
  processOrderBatch,
  resumeOrderSyncJob,
  getOrderSyncJobStatus,
  getOrderSyncJobById,
  cancelOrderSyncJob,
} from '../../../app/services/order-sync-job.server';

// Import route handlers
import { action as startAction } from '../../../app/routes/api.order-sync.start';
import { action as processAction } from '../../../app/routes/api.order-sync.process';
import { loader as statusLoader, action as statusAction } from '../../../app/routes/api.order-sync.status';

// Helper to create a mock request
function createMockRequest(options: {
  method?: string;
  body?: any;
  url?: string;
} = {}) {
  const { method = 'POST', body, url = 'http://localhost/api/order-sync' } = options;

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Helper to create authenticated session
function mockAuthentication(shop: string | null = 'test-shop.myshopify.com') {
  (authenticate.admin as Mock).mockResolvedValue({
    session: shop ? { shop } : null,
    admin: {
      graphql: vi.fn(),
    },
  });
}

// Helper for sync job result
function createMockSyncResult(overrides: Partial<any> = {}) {
  return {
    success: true,
    jobId: 'job-123',
    status: 'IN_PROGRESS',
    progress: {
      processedCount: 0,
      totalOrders: 100,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      percentComplete: 0,
    },
    hasMore: true,
    ...overrides,
  };
}

describe('Order Sync API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/order-sync/start', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthentication(null);

      const request = createMockRequest({ method: 'POST' });
      const response = await startAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 405 for non-POST requests', async () => {
      mockAuthentication();

      const request = createMockRequest({ method: 'GET' });
      const response = await startAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toBe('Method not allowed');
    });

    it('should start sync job with default triggeredBy', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult();
      (startOrderSyncJob as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({ method: 'POST' });
      const response = await startAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.jobId).toBe('job-123');
      expect(startOrderSyncJob).toHaveBeenCalledWith(
        'test-shop.myshopify.com',
        expect.any(Object),
        'manual',
        expect.objectContaining({})
      );
    });

    it('should start sync job with custom triggeredBy', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult();
      (startOrderSyncJob as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'POST',
        body: { triggeredBy: 'install' },
      });
      await startAction({ request, params: {}, context: {} });

      expect(startOrderSyncJob).toHaveBeenCalledWith(
        'test-shop.myshopify.com',
        expect.any(Object),
        'install',
        expect.objectContaining({})
      );
    });

    it('should start sync job with custom date range', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult();
      (startOrderSyncJob as Mock).mockResolvedValue(mockResult);

      const startDate = '2024-01-01';
      const endDate = '2024-06-30';

      const request = createMockRequest({
        method: 'POST',
        body: { startDate, endDate },
      });
      await startAction({ request, params: {}, context: {} });

      expect(startOrderSyncJob).toHaveBeenCalledWith(
        'test-shop.myshopify.com',
        expect.any(Object),
        'manual',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      );
    });

    it('should return 400 when sync fails to start', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult({
        success: false,
        error: 'Sync already in progress',
      });
      (startOrderSyncJob as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({ method: 'POST' });
      const response = await startAction({ request, params: {}, context: {} });

      expect(response.status).toBe(400);
    });

    it('should handle service errors gracefully', async () => {
      mockAuthentication();
      (startOrderSyncJob as Mock).mockRejectedValue(new Error('Database error'));

      const request = createMockRequest({ method: 'POST' });
      const response = await startAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Database error');
    });
  });

  describe('POST /api/order-sync/process', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthentication(null);

      const request = createMockRequest({ method: 'POST', body: { jobId: 'job-123' } });
      const response = await processAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 405 for non-POST requests', async () => {
      mockAuthentication();

      const request = createMockRequest({ method: 'GET' });
      const response = await processAction({ request, params: {}, context: {} });

      expect(response.status).toBe(405);
    });

    it('should return 400 when jobId is missing', async () => {
      mockAuthentication();

      const request = createMockRequest({ method: 'POST', body: {} });
      const response = await processAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('jobId is required');
    });

    it('should process next batch successfully', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult({
        progress: {
          processedCount: 50,
          totalOrders: 100,
          createdCount: 45,
          updatedCount: 3,
          skippedCount: 2,
          errorCount: 0,
          percentComplete: 50,
        },
      });
      (processOrderBatch as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'POST',
        body: { jobId: 'job-123' },
      });
      const response = await processAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.progress.processedCount).toBe(50);
      expect(processOrderBatch).toHaveBeenCalledWith('job-123', expect.any(Object));
    });

    it('should resume job when resume flag is set', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult();
      (resumeOrderSyncJob as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'POST',
        body: { jobId: 'job-123', resume: true },
      });
      await processAction({ request, params: {}, context: {} });

      expect(resumeOrderSyncJob).toHaveBeenCalledWith('job-123', expect.any(Object));
      expect(processOrderBatch).not.toHaveBeenCalled();
    });

    it('should return 400 when processing fails', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult({
        success: false,
        status: 'FAILED',
        error: 'Job not found',
      });
      (processOrderBatch as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'POST',
        body: { jobId: 'non-existent' },
      });
      const response = await processAction({ request, params: {}, context: {} });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/order-sync/status', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthentication(null);

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/order-sync/status',
      });
      const response = await statusLoader({ request, params: {}, context: {} });

      expect(response.status).toBe(401);
    });

    it('should return job status for shop', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult({
        status: 'COMPLETED',
        progress: {
          processedCount: 100,
          totalOrders: 100,
          createdCount: 90,
          updatedCount: 5,
          skippedCount: 5,
          errorCount: 0,
          percentComplete: 100,
        },
        hasMore: false,
      });
      (getOrderSyncJobStatus as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/order-sync/status',
      });
      const response = await statusLoader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('COMPLETED');
      expect(getOrderSyncJobStatus).toHaveBeenCalledWith('test-shop.myshopify.com');
    });

    it('should return specific job when jobId is provided', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult({ jobId: 'specific-job' });
      (getOrderSyncJobById as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/order-sync/status?jobId=specific-job',
      });
      const response = await statusLoader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.jobId).toBe('specific-job');
      expect(getOrderSyncJobById).toHaveBeenCalledWith('specific-job');
    });

    it('should return NO_JOB status when no job exists', async () => {
      mockAuthentication();
      (getOrderSyncJobStatus as Mock).mockResolvedValue(null);

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/order-sync/status',
      });
      const response = await statusLoader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.status).toBe('NO_JOB');
      expect(data.jobId).toBeNull();
    });
  });

  describe('POST /api/order-sync/status (cancel)', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthentication(null);

      const request = createMockRequest({
        method: 'POST',
        body: { action: 'cancel', jobId: 'job-123' },
      });
      const response = await statusAction({ request, params: {}, context: {} });

      expect(response.status).toBe(401);
    });

    it('should cancel job successfully', async () => {
      mockAuthentication();
      (cancelOrderSyncJob as Mock).mockResolvedValue(true);

      const request = createMockRequest({
        method: 'POST',
        body: { action: 'cancel', jobId: 'job-123' },
      });
      const response = await statusAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(cancelOrderSyncJob).toHaveBeenCalledWith('job-123');
    });

    it('should return error when cancel fails', async () => {
      mockAuthentication();
      (cancelOrderSyncJob as Mock).mockResolvedValue(false);

      const request = createMockRequest({
        method: 'POST',
        body: { action: 'cancel', jobId: 'job-123' },
      });
      const response = await statusAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toContain('Failed to cancel');
    });

    it('should return 400 for invalid action', async () => {
      mockAuthentication();

      const request = createMockRequest({
        method: 'POST',
        body: { action: 'invalid', jobId: 'job-123' },
      });
      const response = await statusAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid action');
    });

    it('should return 400 when action is cancel but jobId is missing', async () => {
      mockAuthentication();

      const request = createMockRequest({
        method: 'POST',
        body: { action: 'cancel' },
      });
      const response = await statusAction({ request, params: {}, context: {} });

      expect(response.status).toBe(400);
    });
  });
});

describe('Order Sync API - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle malformed JSON body gracefully', async () => {
    mockAuthentication();
    const mockResult = createMockSyncResult();
    (startOrderSyncJob as Mock).mockResolvedValue(mockResult);

    // Create request with invalid JSON
    const request = new Request('http://localhost/api/order-sync/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json',
    });

    // Should use defaults when JSON parsing fails
    await startAction({ request, params: {}, context: {} });

    // The handler catches JSON parse errors and uses defaults
    expect(startOrderSyncJob).toHaveBeenCalledWith(
      'test-shop.myshopify.com',
      expect.any(Object),
      'manual',
      expect.any(Object)
    );
  });

  it('should handle empty request body', async () => {
    mockAuthentication();
    const mockResult = createMockSyncResult();
    (startOrderSyncJob as Mock).mockResolvedValue(mockResult);

    const request = new Request('http://localhost/api/order-sync/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    await startAction({ request, params: {}, context: {} });

    // Should use defaults
    expect(startOrderSyncJob).toHaveBeenCalledWith(
      'test-shop.myshopify.com',
      expect.any(Object),
      'manual',
      expect.any(Object)
    );
  });

  it('should handle concurrent requests for same shop', async () => {
    mockAuthentication();
    const existingJobResult = createMockSyncResult({
      success: false,
      error: 'Sync already in progress',
    });
    (startOrderSyncJob as Mock).mockResolvedValue(existingJobResult);

    const request = createMockRequest({ method: 'POST' });
    const response = await startAction({ request, params: {}, context: {} });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('already in progress');
  });
});
