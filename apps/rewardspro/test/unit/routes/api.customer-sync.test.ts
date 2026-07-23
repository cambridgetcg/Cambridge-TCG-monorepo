import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';

// Mock the authentication module
vi.mock('../../../app/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

// Mock the customer sync job service
vi.mock('../../../app/services/customer-sync-job.server', () => ({
  startSyncJob: vi.fn(),
  processNextBatch: vi.fn(),
  resumeSyncJob: vi.fn(),
  getSyncJobStatus: vi.fn(),
  getSyncJobById: vi.fn(),
  cancelSyncJob: vi.fn(),
}));

import { authenticate } from '../../../app/shopify.server';
import {
  startSyncJob,
  processNextBatch,
  resumeSyncJob,
  getSyncJobStatus,
  getSyncJobById,
  cancelSyncJob,
} from '../../../app/services/customer-sync-job.server';

// Import route handlers
import { action as startAction } from '../../../app/routes/api.customer-sync.start';
import { action as processAction } from '../../../app/routes/api.customer-sync.process';
import { loader as statusLoader, action as statusAction } from '../../../app/routes/api.customer-sync.status';

// Helper to create a mock request
function createMockRequest(options: {
  method?: string;
  body?: any;
  url?: string;
} = {}) {
  const { method = 'POST', body, url = 'http://localhost/api/customer-sync' } = options;

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
      totalCustomers: 100,
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

describe('Customer Sync API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/customer-sync/start', () => {
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
      (startSyncJob as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({ method: 'POST' });
      const response = await startAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.jobId).toBe('job-123');
      expect(startSyncJob).toHaveBeenCalledWith(
        'test-shop.myshopify.com',
        expect.any(Object),
        'manual'
      );
    });

    it('should start sync job with custom triggeredBy', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult();
      (startSyncJob as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'POST',
        body: { triggeredBy: 'install' },
      });
      await startAction({ request, params: {}, context: {} });

      expect(startSyncJob).toHaveBeenCalledWith(
        'test-shop.myshopify.com',
        expect.any(Object),
        'install'
      );
    });

    it('should return 400 when sync fails to start', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult({
        success: false,
        error: 'No tiers configured',
      });
      (startSyncJob as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({ method: 'POST' });
      const response = await startAction({ request, params: {}, context: {} });

      expect(response.status).toBe(400);
    });

    it('should handle service errors gracefully', async () => {
      mockAuthentication();
      (startSyncJob as Mock).mockRejectedValue(new Error('Database error'));

      const request = createMockRequest({ method: 'POST' });
      const response = await startAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Database error');
    });

    it('should handle malformed JSON body gracefully', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult();
      (startSyncJob as Mock).mockResolvedValue(mockResult);

      const request = new Request('http://localhost/api/customer-sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-valid-json',
      });

      await startAction({ request, params: {}, context: {} });

      // Should use default triggeredBy
      expect(startSyncJob).toHaveBeenCalledWith(
        'test-shop.myshopify.com',
        expect.any(Object),
        'manual'
      );
    });

    it('should handle empty request body', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult();
      (startSyncJob as Mock).mockResolvedValue(mockResult);

      const request = new Request('http://localhost/api/customer-sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      await startAction({ request, params: {}, context: {} });

      expect(startSyncJob).toHaveBeenCalledWith(
        'test-shop.myshopify.com',
        expect.any(Object),
        'manual'
      );
    });
  });

  describe('POST /api/customer-sync/process', () => {
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
          totalCustomers: 100,
          createdCount: 45,
          updatedCount: 3,
          skippedCount: 2,
          errorCount: 0,
          percentComplete: 50,
        },
      });
      (processNextBatch as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'POST',
        body: { jobId: 'job-123' },
      });
      const response = await processAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.progress.processedCount).toBe(50);
      expect(processNextBatch).toHaveBeenCalledWith('job-123', expect.any(Object));
    });

    it('should resume job when resume flag is set', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult();
      (resumeSyncJob as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'POST',
        body: { jobId: 'job-123', resume: true },
      });
      await processAction({ request, params: {}, context: {} });

      expect(resumeSyncJob).toHaveBeenCalledWith('job-123', expect.any(Object));
      expect(processNextBatch).not.toHaveBeenCalled();
    });

    it('should return 400 when processing fails', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult({
        success: false,
        status: 'FAILED',
        error: 'Job not found',
      });
      (processNextBatch as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'POST',
        body: { jobId: 'non-existent' },
      });
      const response = await processAction({ request, params: {}, context: {} });

      expect(response.status).toBe(400);
    });

    it('should handle service errors', async () => {
      mockAuthentication();
      (processNextBatch as Mock).mockRejectedValue(new Error('Unexpected error'));

      const request = createMockRequest({
        method: 'POST',
        body: { jobId: 'job-123' },
      });
      const response = await processAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Unexpected error');
    });
  });

  describe('GET /api/customer-sync/status', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthentication(null);

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/customer-sync/status',
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
          totalCustomers: 100,
          createdCount: 90,
          updatedCount: 5,
          skippedCount: 5,
          errorCount: 0,
          percentComplete: 100,
        },
        hasMore: false,
      });
      (getSyncJobStatus as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/customer-sync/status',
      });
      const response = await statusLoader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('COMPLETED');
      expect(getSyncJobStatus).toHaveBeenCalledWith('test-shop.myshopify.com');
    });

    it('should return specific job when jobId is provided', async () => {
      mockAuthentication();
      const mockResult = createMockSyncResult({ jobId: 'specific-job' });
      (getSyncJobById as Mock).mockResolvedValue(mockResult);

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/customer-sync/status?jobId=specific-job',
      });
      const response = await statusLoader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.jobId).toBe('specific-job');
      expect(getSyncJobById).toHaveBeenCalledWith('specific-job');
    });

    it('should return NO_JOB status when no job exists', async () => {
      mockAuthentication();
      (getSyncJobStatus as Mock).mockResolvedValue(null);

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/customer-sync/status',
      });
      const response = await statusLoader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.status).toBe('NO_JOB');
      expect(data.jobId).toBeNull();
    });

    it('should handle service errors', async () => {
      mockAuthentication();
      (getSyncJobStatus as Mock).mockRejectedValue(new Error('Database error'));

      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/customer-sync/status',
      });
      const response = await statusLoader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Database error');
    });
  });

  describe('POST /api/customer-sync/status (cancel)', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthentication(null);

      const request = createMockRequest({
        method: 'POST',
        body: { action: 'cancel', jobId: 'job-123' },
      });
      const response = await statusAction({ request, params: {}, context: {} });

      expect(response.status).toBe(401);
    });

    it('should return 405 for non-POST requests', async () => {
      mockAuthentication();

      const request = createMockRequest({ method: 'GET' });
      const response = await statusAction({ request, params: {}, context: {} });

      expect(response.status).toBe(405);
    });

    it('should cancel job successfully', async () => {
      mockAuthentication();
      (cancelSyncJob as Mock).mockResolvedValue(true);

      const request = createMockRequest({
        method: 'POST',
        body: { action: 'cancel', jobId: 'job-123' },
      });
      const response = await statusAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(cancelSyncJob).toHaveBeenCalledWith('job-123');
    });

    it('should return error when cancel fails', async () => {
      mockAuthentication();
      (cancelSyncJob as Mock).mockResolvedValue(false);

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

    it('should handle service errors', async () => {
      mockAuthentication();
      (cancelSyncJob as Mock).mockRejectedValue(new Error('Unexpected error'));

      const request = createMockRequest({
        method: 'POST',
        body: { action: 'cancel', jobId: 'job-123' },
      });
      const response = await statusAction({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Unexpected error');
    });
  });
});

describe('Customer Sync API - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle concurrent sync attempts', async () => {
    mockAuthentication();
    const existingJobResult = createMockSyncResult({
      success: false,
      error: 'Sync already in progress',
    });
    (startSyncJob as Mock).mockResolvedValue(existingJobResult);

    const request = createMockRequest({ method: 'POST' });
    const response = await startAction({ request, params: {}, context: {} });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('already in progress');
  });

  it('should handle no tiers configured error', async () => {
    mockAuthentication();
    const noTiersResult = createMockSyncResult({
      success: false,
      error: 'No tiers configured. Please create at least one tier before syncing customers.',
    });
    (startSyncJob as Mock).mockResolvedValue(noTiersResult);

    const request = createMockRequest({ method: 'POST' });
    const response = await startAction({ request, params: {}, context: {} });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('No tiers configured');
  });

  it('should return progress with all fields', async () => {
    mockAuthentication();
    const mockResult = createMockSyncResult({
      progress: {
        processedCount: 75,
        totalCustomers: 100,
        createdCount: 50,
        updatedCount: 20,
        skippedCount: 3,
        errorCount: 2,
        percentComplete: 75,
      },
    });
    (getSyncJobStatus as Mock).mockResolvedValue(mockResult);

    const request = createMockRequest({
      method: 'GET',
      url: 'http://localhost/api/customer-sync/status',
    });
    const response = await statusLoader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.progress.processedCount).toBe(75);
    expect(data.progress.totalCustomers).toBe(100);
    expect(data.progress.createdCount).toBe(50);
    expect(data.progress.updatedCount).toBe(20);
    expect(data.progress.skippedCount).toBe(3);
    expect(data.progress.errorCount).toBe(2);
    expect(data.progress.percentComplete).toBe(75);
  });
});
