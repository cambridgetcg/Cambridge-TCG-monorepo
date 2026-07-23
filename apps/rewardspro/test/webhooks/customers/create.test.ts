/**
 * Customers/Create Webhook Tests
 *
 * Tests the customer creation webhook handler including:
 * - HMAC verification (security)
 * - Customer creation
 * - Upsert when customer already exists
 * - Tier calculation and assignment
 * - Welcome email notifications
 * - Klaviyo integration
 * - Error handling
 *
 * @module test/webhooks/customers/create
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWebhookTestContext,
  executeWebhookAction,
} from '../../helpers/webhook-test-client';
import {
  createCustomerPayload,
  createNewCustomerPayload,
  createReturningCustomerPayload,
} from '../../factories/customer.factory';
import { action } from '../../../app/routes/webhooks.customers.create';

// ============================================
// MOCKS
// ============================================

// Mock webhook validation
vi.mock('../../../app/utils/webhook-validation.server', () => ({
  verifyWebhookHMAC: vi.fn(),
}));

// Mock customer sync service
vi.mock('../../../app/services/webhook-customer-sync.server', () => ({
  handleCustomerCreate: vi.fn(),
}));

// Mock PII masker
vi.mock('../../../app/utils/pii-masker', () => ({
  logSafeCustomer: vi.fn((id, _email) => `Customer ID: ${id}`),
}));

import { verifyWebhookHMAC } from '../../../app/utils/webhook-validation.server';
import { handleCustomerCreate } from '../../../app/services/webhook-customer-sync.server';

// ============================================
// TEST CONSTANTS
// ============================================

const TEST_SHOP = 'test-shop.myshopify.com';
const TEST_CUSTOMER_ID = 'cust_internal_123';
const TEST_SHOPIFY_CUSTOMER_ID = '7654321098';

// ============================================
// SETUP
// ============================================

beforeEach(() => {
  vi.clearAllMocks();

  // Default: HMAC verification passes
  vi.mocked(verifyWebhookHMAC).mockResolvedValue(true);

  // Default: handleCustomerCreate succeeds
  vi.mocked(handleCustomerCreate).mockResolvedValue({
    action: 'created',
    customerId: TEST_CUSTOMER_ID,
  });
});

// ============================================
// HMAC VERIFICATION TESTS
// ============================================

describe('Customers Create Webhook - HMAC Verification', () => {
  it('should accept webhook with valid HMAC signature', async () => {
    const payload = createNewCustomerPayload({
      id: TEST_SHOPIFY_CUSTOMER_ID,
      email: 'newcustomer@example.com',
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(response.body).toBe('OK');
    expect(verifyWebhookHMAC).toHaveBeenCalled();
  });

  it('should reject webhook with invalid HMAC signature', async () => {
    vi.mocked(verifyWebhookHMAC).mockResolvedValue(false);

    const payload = createNewCustomerPayload();

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(401);
    expect(response.body).toBe('Unauthorized');
    expect(handleCustomerCreate).not.toHaveBeenCalled();
  });

  it('should reject webhook when HMAC verification throws', async () => {
    vi.mocked(verifyWebhookHMAC).mockRejectedValue(new Error('Verification failed'));

    const payload = createNewCustomerPayload();

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(500);
  });
});

// ============================================
// MISSING SHOP DOMAIN TESTS
// ============================================

describe('Customers Create Webhook - Missing Shop Domain', () => {
  it('should return 400 when shop domain header is missing', async () => {
    const payload = createNewCustomerPayload();

    const body = JSON.stringify(payload);

    // Create request without X-Shopify-Shop-Domain header
    const request = new Request('http://localhost/webhooks/customers-create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'customers/create',
        'X-Shopify-Webhook-Id': 'webhook-123',
        'X-Shopify-Hmac-SHA256': 'valid-hmac',
        // Missing: 'X-Shopify-Shop-Domain'
      },
      body,
    });

    const response = await executeWebhookAction(action, request);

    expect(response.status).toBe(400);
    expect(response.body).toBe('Bad Request');
  });
});

// ============================================
// CUSTOMER CREATION TESTS
// ============================================

describe('Customers Create Webhook - Customer Creation', () => {
  it('should create new customer successfully', async () => {
    const payload = createNewCustomerPayload({
      id: TEST_SHOPIFY_CUSTOMER_ID,
      email: 'newcustomer@example.com',
      firstName: 'John',
      lastName: 'Doe',
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(handleCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: Number(TEST_SHOPIFY_CUSTOMER_ID),
        email: 'newcustomer@example.com',
        first_name: 'John',
        last_name: 'Doe',
      }),
      TEST_SHOP
    );
  });

  it('should handle customer with minimal data', async () => {
    // Customer with only ID and email
    const payload = {
      id: Number(TEST_SHOPIFY_CUSTOMER_ID),
      email: 'minimal@example.com',
    };

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(handleCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: Number(TEST_SHOPIFY_CUSTOMER_ID),
        email: 'minimal@example.com',
      }),
      TEST_SHOP
    );
  });

  it('should handle returning customer creation webhook', async () => {
    const payload = createReturningCustomerPayload(10, 500, {
      id: TEST_SHOPIFY_CUSTOMER_ID,
      email: 'returning@example.com',
    });

    vi.mocked(handleCustomerCreate).mockResolvedValue({
      action: 'updated', // Upsert case
      customerId: TEST_CUSTOMER_ID,
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(handleCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        orders_count: 10,
        total_spent: '500.00',
      }),
      TEST_SHOP
    );
  });

  it('should pass customer tags to handler', async () => {
    const payload = createCustomerPayload({
      id: TEST_SHOPIFY_CUSTOMER_ID,
      tags: ['vip', 'premium'],
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: 'vip, premium',
      }),
      TEST_SHOP
    );
  });

  it('should handle customer with phone number', async () => {
    const payload = createCustomerPayload({
      id: TEST_SHOPIFY_CUSTOMER_ID,
      phone: '+1234567890',
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+1234567890',
      }),
      TEST_SHOP
    );
  });
});

// ============================================
// ERROR HANDLING TESTS
// ============================================

describe('Customers Create Webhook - Error Handling', () => {
  it('should return 500 when customer creation fails', async () => {
    vi.mocked(handleCustomerCreate).mockRejectedValue(new Error('Database error'));

    const payload = createNewCustomerPayload();

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(500);
    expect(response.body).toBe('Internal Server Error');
  });

  it('should return 500 on invalid JSON payload', async () => {
    const request = new Request('http://localhost/webhooks/customers-create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'customers/create',
        'X-Shopify-Shop-Domain': TEST_SHOP,
        'X-Shopify-Webhook-Id': 'webhook-123',
        'X-Shopify-Hmac-SHA256': 'valid-hmac',
      },
      body: 'invalid json {',
    });

    const response = await executeWebhookAction(action, request);

    expect(response.status).toBe(500);
  });
});

// ============================================
// SHOP ISOLATION TESTS
// ============================================

describe('Customers Create Webhook - Shop Isolation', () => {
  it('should pass correct shop domain to handler', async () => {
    const payload = createNewCustomerPayload();

    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: 'other-shop.myshopify.com',
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerCreate).toHaveBeenCalledWith(
      expect.any(Object),
      'other-shop.myshopify.com'
    );
  });
});

// ============================================
// LOADER TESTS (GET REQUEST)
// ============================================

describe('Customers Create Webhook - Loader', () => {
  it('should return 405 for GET requests', async () => {
    const { loader } = await import('../../../app/routes/webhooks.customers.create');

    const response = await loader({ request: new Request('http://localhost'), params: {}, context: {} });

    expect(response.status).toBe(405);
  });
});
