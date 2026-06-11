/**
 * App/Uninstalled Webhook Tests
 *
 * Tests the app uninstall webhook handler including:
 * - Authentication via Shopify authenticate.webhook
 * - Comprehensive shop data cleanup
 * - GDPR compliance
 * - Error handling and fallback session cleanup
 * - Idempotent behavior (safe to run multiple times)
 *
 * @module test/webhooks/app/uninstalled
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action } from '../../../app/routes/webhooks.app.uninstalled';

// ============================================
// MOCKS
// ============================================

// Mock Shopify authentication
vi.mock('../../../app/shopify.server', () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

// Mock shop data cleanup service
vi.mock('../../../app/services/shop-data-cleanup.server', () => ({
  cleanupShopData: vi.fn(),
}));

// Mock database (for fallback session cleanup)
vi.mock('../../../app/db.server', () => ({
  default: {
    session: {
      deleteMany: vi.fn(),
    },
  },
}));

import { authenticate } from '../../../app/shopify.server';
import { cleanupShopData } from '../../../app/services/shop-data-cleanup.server';
import db from '../../../app/db.server';

// ============================================
// TEST CONSTANTS
// ============================================

const TEST_SHOP = 'test-shop.myshopify.com';
const TEST_SESSION = {
  id: 'session_123',
  shop: TEST_SHOP,
  state: 'active',
  isOnline: false,
  scope: 'read_products',
  accessToken: 'test-token',
};

// ============================================
// SETUP
// ============================================

beforeEach(() => {
  vi.clearAllMocks();

  // Default: Authentication succeeds
  vi.mocked(authenticate.webhook).mockResolvedValue({
    shop: TEST_SHOP,
    session: TEST_SESSION,
    topic: 'APP_UNINSTALLED',
    payload: {},
    admin: null,
  } as any);

  // Default: Cleanup succeeds
  vi.mocked(cleanupShopData).mockResolvedValue({
    success: true,
    shop: TEST_SHOP,
    deletedCounts: {
      Customer: 10,
      Order: 25,
      Tier: 3,
      Session: 1,
    },
    errors: [],
    durationMs: 150,
  });
});

// ============================================
// AUTHENTICATION TESTS
// ============================================

describe('App Uninstalled Webhook - Authentication', () => {
  it('should call authenticate.webhook for authentication', async () => {
    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    await action({ request, params: {}, context: {} });

    expect(authenticate.webhook).toHaveBeenCalledWith(request);
  });

  it('should handle authentication failure gracefully', async () => {
    vi.mocked(authenticate.webhook).mockRejectedValue(new Error('Invalid webhook signature'));

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    // The action should throw when authentication fails
    await expect(action({ request, params: {}, context: {} })).rejects.toThrow();
  });
});

// ============================================
// DATA CLEANUP TESTS
// ============================================

describe('App Uninstalled Webhook - Data Cleanup', () => {
  it('should call cleanupShopData with shop domain', async () => {
    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await action({ request, params: {}, context: {} });

    expect(cleanupShopData).toHaveBeenCalledWith(TEST_SHOP);
  });

  it('should return success response after cleanup', async () => {
    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await action({ request, params: {}, context: {} });

    expect(response).toBeInstanceOf(Response);
    // Webhook handlers typically return 200 with empty body
    expect(response.status).toBe(200);
  });

  it('should handle cleanup with some errors but still succeed', async () => {
    vi.mocked(cleanupShopData).mockResolvedValue({
      success: true,
      shop: TEST_SHOP,
      deletedCounts: {
        Customer: 10,
        Order: 25,
        PointsLedger: 0, // Failed but non-fatal
      },
      errors: ['Failed to delete PointsLedger: Table does not exist'],
      durationMs: 200,
    });

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await action({ request, params: {}, context: {} });

    expect(response.status).toBe(200);
    expect(cleanupShopData).toHaveBeenCalled();
  });

  it('should handle complete cleanup failure gracefully', async () => {
    vi.mocked(cleanupShopData).mockResolvedValue({
      success: false,
      shop: TEST_SHOP,
      deletedCounts: {},
      errors: ['Fatal: Database connection failed'],
      durationMs: 50,
    });

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    // Should still return 200 (acknowledge webhook)
    const response = await action({ request, params: {}, context: {} });
    expect(response.status).toBe(200);
  });
});

// ============================================
// FALLBACK SESSION CLEANUP TESTS
// ============================================

describe('App Uninstalled Webhook - Fallback Session Cleanup', () => {
  it('should attempt session deletion if cleanup throws', async () => {
    vi.mocked(cleanupShopData).mockRejectedValue(new Error('Cleanup failed'));

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await action({ request, params: {}, context: {} });

    // Should try fallback session deletion
    expect(db.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: TEST_SHOP },
    });

    // Should still return success
    expect(response.status).toBe(200);
  });

  it('should not attempt session deletion if session is null', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue({
      shop: TEST_SHOP,
      session: null, // No session
      topic: 'APP_UNINSTALLED',
      payload: {},
      admin: null,
    } as any);

    vi.mocked(cleanupShopData).mockRejectedValue(new Error('Cleanup failed'));

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await action({ request, params: {}, context: {} });

    // Should not attempt session deletion without session
    expect(db.session.deleteMany).not.toHaveBeenCalled();
  });

  it('should handle fallback session deletion failure gracefully', async () => {
    vi.mocked(cleanupShopData).mockRejectedValue(new Error('Cleanup failed'));
    vi.mocked(db.session.deleteMany).mockRejectedValue(new Error('Session deletion failed'));

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    // Should not throw even if fallback fails
    const response = await action({ request, params: {}, context: {} });
    expect(response.status).toBe(200);
  });
});

// ============================================
// IDEMPOTENCY TESTS
// ============================================

describe('App Uninstalled Webhook - Idempotency', () => {
  it('should handle being called multiple times safely', async () => {
    // First call - successful cleanup
    vi.mocked(cleanupShopData).mockResolvedValueOnce({
      success: true,
      shop: TEST_SHOP,
      deletedCounts: { Customer: 10, Order: 25 },
      errors: [],
      durationMs: 150,
    });

    // Second call - nothing to delete
    vi.mocked(cleanupShopData).mockResolvedValueOnce({
      success: true,
      shop: TEST_SHOP,
      deletedCounts: { Customer: 0, Order: 0 },
      errors: [],
      durationMs: 50,
    });

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    // First call
    const response1 = await action({ request: request.clone(), params: {}, context: {} });
    expect(response1.status).toBe(200);

    // Second call
    const response2 = await action({ request: request.clone(), params: {}, context: {} });
    expect(response2.status).toBe(200);

    expect(cleanupShopData).toHaveBeenCalledTimes(2);
  });

  it('should handle webhook even after session is deleted', async () => {
    // Simulate session already deleted (from previous uninstall)
    vi.mocked(authenticate.webhook).mockResolvedValue({
      shop: TEST_SHOP,
      session: undefined, // Session was deleted
      topic: 'APP_UNINSTALLED',
      payload: {},
      admin: null,
    } as any);

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await action({ request, params: {}, context: {} });

    expect(response.status).toBe(200);
    expect(cleanupShopData).toHaveBeenCalledWith(TEST_SHOP);
  });
});

// ============================================
// SHOP ISOLATION TESTS
// ============================================

describe('App Uninstalled Webhook - Shop Isolation', () => {
  it('should cleanup only the specified shop data', async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue({
      shop: 'other-shop.myshopify.com',
      session: { ...TEST_SESSION, shop: 'other-shop.myshopify.com' },
      topic: 'APP_UNINSTALLED',
      payload: {},
      admin: null,
    } as any);

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await action({ request, params: {}, context: {} });

    expect(cleanupShopData).toHaveBeenCalledWith('other-shop.myshopify.com');
    expect(cleanupShopData).not.toHaveBeenCalledWith(TEST_SHOP);
  });
});

// ============================================
// GDPR COMPLIANCE TESTS
// ============================================

describe('App Uninstalled Webhook - GDPR Compliance', () => {
  it('should always attempt data cleanup for GDPR compliance', async () => {
    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await action({ request, params: {}, context: {} });

    // cleanupShopData should always be called to ensure GDPR compliance
    expect(cleanupShopData).toHaveBeenCalled();
  });

  it('should delete customer data as part of cleanup', async () => {
    vi.mocked(cleanupShopData).mockResolvedValue({
      success: true,
      shop: TEST_SHOP,
      deletedCounts: {
        Customer: 50,
        PointsLedger: 200,
        StoreCreditLedger: 150,
        TierChangeLog: 30,
      },
      errors: [],
      durationMs: 250,
    });

    const request = new Request('http://localhost/webhooks/app-uninstalled', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await action({ request, params: {}, context: {} });

    expect(response.status).toBe(200);
    // Verify cleanup was called (GDPR data deletion)
    expect(cleanupShopData).toHaveBeenCalledWith(TEST_SHOP);
  });
});
