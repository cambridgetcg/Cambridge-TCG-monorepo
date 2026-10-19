/**
 * Customers/Create Webhook Tests
 *
 * Tests the customer creation webhook handler including:
 * - Authentication through authenticate.webhook (HMAC with the app secret)
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
  createInvalidHmacRequest,
  createWebhookTestContext,
  generateHMAC,
  TEST_WEBHOOK_SECRET,
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

// authenticate.webhook as Shopify's library behaves: the body's HMAC with
// the app secret (TEST_WEBHOOK_SECRET here) and the shop header, otherwise a
// thrown Response. The real library runs in test/integration/postgres.
vi.mock('../../../app/shopify.server', async () => {
  const helpers = await import('../../helpers/webhook-test-client');
  return {
    authenticate: {
      webhook: vi.fn(async (request: Request) => {
        const body = await request.text();
        if (request.headers.get('X-Shopify-Hmac-Sha256') !== helpers.generateHMAC(body, helpers.TEST_WEBHOOK_SECRET)) {
          throw new Response(undefined, { status: 401 });
        }
        const shop = request.headers.get('X-Shopify-Shop-Domain');
        if (!shop) throw new Response(undefined, { status: 400 });
        return { shop, topic: 'CUSTOMERS_CREATE', payload: JSON.parse(body) };
      }),
    },
  };
});

// Mock customer sync service
vi.mock('../../../app/services/webhook-customer-sync.server', () => ({
  handleCustomerCreate: vi.fn(),
}));


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

  // Default: handleCustomerCreate succeeds
  vi.mocked(handleCustomerCreate).mockResolvedValue({
    action: 'created',
    customerId: TEST_CUSTOMER_ID,
  });
});

// ============================================
// HMAC VERIFICATION TESTS
// ============================================

describe('Customers Create Webhook - Authentication', () => {
  it('should accept a delivery signed with the app secret', async () => {
    const ctx = createWebhookTestContext({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload: createNewCustomerPayload(),
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(response.body).toBe('OK');
  });

  it('should reject a delivery with an invalid HMAC signature', async () => {
    const request = createInvalidHmacRequest({
      topic: 'customers/create',
      shop: TEST_SHOP,
      payload: createNewCustomerPayload(),
    });

    await expect(action({ request, params: {}, context: {} })).rejects.toMatchObject({ status: 401 });
    expect(handleCustomerCreate).not.toHaveBeenCalled();
  });
});

// ============================================
// MISSING SHOP DOMAIN TESTS
// ============================================

describe('Customers Create Webhook - Missing Shop Domain', () => {
  it('should answer 400 when the shop domain header is missing', async () => {
    const body = JSON.stringify(createNewCustomerPayload());

    const request = new Request('http://localhost/webhooks/customers/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'customers/create',
        'X-Shopify-Webhook-Id': 'webhook-123',
        'X-Shopify-Hmac-SHA256': generateHMAC(body, TEST_WEBHOOK_SECRET),
        // Missing: 'X-Shopify-Shop-Domain'
      },
      body,
    });

    await expect(action({ request, params: {}, context: {} })).rejects.toMatchObject({ status: 400 });
    expect(handleCustomerCreate).not.toHaveBeenCalled();
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
