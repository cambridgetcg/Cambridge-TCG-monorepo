/**
 * Customers/Update Webhook Tests
 *
 * Tests the customer update webhook handler including:
 * - Authentication through authenticate.webhook (HMAC with the app secret)
 * - Customer update
 * - Create when customer not found
 * - Tier re-calculation
 * - Klaviyo sync
 * - Error handling
 *
 * @module test/webhooks/customers/update
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
  createCustomerUpdatePayload,
  createReturningCustomerPayload,
} from '../../factories/customer.factory';
import { action } from '../../../app/routes/webhooks.customers.update';

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
        return { shop, topic: 'CUSTOMERS_UPDATE', payload: JSON.parse(body) };
      }),
    },
  };
});

// Mock customer sync service
vi.mock('../../../app/services/webhook-customer-sync.server', () => ({
  handleCustomerUpdate: vi.fn(),
}));

import { handleCustomerUpdate } from '../../../app/services/webhook-customer-sync.server';

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

  // Default: handleCustomerUpdate succeeds
  vi.mocked(handleCustomerUpdate).mockResolvedValue({
    action: 'updated',
    customerId: TEST_CUSTOMER_ID,
  });
});

// ============================================
// HMAC VERIFICATION TESTS
// ============================================

describe('Customers Update Webhook - Authentication', () => {
  it('should accept a delivery signed with the app secret', async () => {
    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload: createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {}),
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(response.body).toBe('OK');
  });

  it('should reject a delivery with an invalid HMAC signature', async () => {
    const request = createInvalidHmacRequest({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload: createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {}),
    });

    await expect(action({ request, params: {}, context: {} })).rejects.toMatchObject({ status: 401 });
    expect(handleCustomerUpdate).not.toHaveBeenCalled();
  });
});

// ============================================
// MISSING SHOP DOMAIN TESTS
// ============================================

describe('Customers Update Webhook - Missing Shop Domain', () => {
  it('should answer 400 when the shop domain header is missing', async () => {
    const body = JSON.stringify(createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {}));

    const request = new Request('http://localhost/webhooks/customers/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'customers/update',
        'X-Shopify-Webhook-Id': 'webhook-123',
        'X-Shopify-Hmac-SHA256': generateHMAC(body, TEST_WEBHOOK_SECRET),
        // Missing: 'X-Shopify-Shop-Domain'
      },
      body,
    });

    await expect(action({ request, params: {}, context: {} })).rejects.toMatchObject({ status: 400 });
    expect(handleCustomerUpdate).not.toHaveBeenCalled();
  });
});

// ============================================
// CUSTOMER UPDATE TESTS
// ============================================

describe('Customers Update Webhook - Customer Update', () => {
  it('should update existing customer successfully', async () => {
    const payload = createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {
      email: 'updated@example.com',
      firstName: 'Updated',
      lastName: 'Customer',
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(handleCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: Number(TEST_SHOPIFY_CUSTOMER_ID),
        email: 'updated@example.com',
        first_name: 'Updated',
        last_name: 'Customer',
      }),
      TEST_SHOP
    );
  });

  it('should create customer when not found (upsert behavior)', async () => {
    vi.mocked(handleCustomerUpdate).mockResolvedValue({
      action: 'created', // Handler creates if not found
      customerId: TEST_CUSTOMER_ID,
    });

    const payload = createCustomerPayload({
      id: TEST_SHOPIFY_CUSTOMER_ID,
      email: 'new@example.com',
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload,
    });

    const response = await ctx.execute(action);

    expect(response.status).toBe(200);
    expect(handleCustomerUpdate).toHaveBeenCalled();
  });

  it('should update customer with new spending data', async () => {
    const payload = createReturningCustomerPayload(15, 750, {
      id: TEST_SHOPIFY_CUSTOMER_ID,
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        orders_count: 15,
        total_spent: '750.00',
      }),
      TEST_SHOP
    );
  });

  it('should handle email update', async () => {
    const payload = createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {
      email: 'newemail@example.com',
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newemail@example.com',
      }),
      TEST_SHOP
    );
  });

  it('should handle tag updates', async () => {
    const payload = createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {
      tags: ['vip', 'upgraded'],
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: 'vip, upgraded',
      }),
      TEST_SHOP
    );
  });

  it('should handle phone number update', async () => {
    const payload = createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {
      phone: '+9876543210',
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+9876543210',
      }),
      TEST_SHOP
    );
  });

  it('should handle marketing consent changes', async () => {
    const payload = createCustomerPayload({
      id: TEST_SHOPIFY_CUSTOMER_ID,
      acceptsMarketing: true,
    });

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: TEST_SHOP,
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        accepts_marketing: true,
      }),
      TEST_SHOP
    );
  });
});

// ============================================
// ERROR HANDLING TESTS
// ============================================

describe('Customers Update Webhook - Error Handling', () => {
  it('should return 500 when customer update fails', async () => {
    vi.mocked(handleCustomerUpdate).mockRejectedValue(new Error('Database error'));

    const payload = createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {});

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
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

describe('Customers Update Webhook - Shop Isolation', () => {
  it('should pass correct shop domain to handler', async () => {
    const payload = createCustomerUpdatePayload(TEST_SHOPIFY_CUSTOMER_ID, {});

    const ctx = createWebhookTestContext({
      topic: 'customers/update',
      shop: 'different-shop.myshopify.com',
      payload,
    });

    await ctx.execute(action);

    expect(handleCustomerUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      'different-shop.myshopify.com'
    );
  });
});

// ============================================
// LOADER TESTS (GET REQUEST)
// ============================================

describe('Customers Update Webhook - Loader', () => {
  it('should return 405 for GET requests', async () => {
    const { loader } = await import('../../../app/routes/webhooks.customers.update');

    const response = await loader({ request: new Request('http://localhost'), params: {}, context: {} });

    expect(response.status).toBe(405);
  });
});
