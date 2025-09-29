/**
 * Webhook Testing Framework
 * Automated tests for webhook processing flows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

/**
 * Helper to create a valid HMAC signature for webhook testing
 */
export function createWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return hmac.digest('base64');
}

/**
 * Helper to create a mock webhook request
 */
export function createMockWebhookRequest(params: {
  topic: string;
  shop: string;
  payload: any;
  secret?: string;
}): Request {
  const { topic, shop, payload, secret = 'test-secret' } = params;
  const body = JSON.stringify(payload);
  const signature = createWebhookSignature(body, secret);

  return new Request('http://localhost/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': shop,
      'X-Shopify-Webhook-Id': crypto.randomUUID(),
      'X-Shopify-Hmac-Sha256': signature,
      'X-Shopify-API-Version': '2024-01',
    },
    body: body,
  });
}

/**
 * Test data factories
 */
export const TestFactories = {
  /**
   * Create a test order payload
   */
  createOrder: (overrides?: Partial<any>) => ({
    id: '5843219374293',
    name: '#1001',
    email: 'customer@example.com',
    currency: 'USD',
    total_price: '100.00',
    subtotal_price: '90.00',
    total_tax: '10.00',
    total_shipping: '5.00',
    total_discounts: '5.00',
    financial_status: 'paid',
    fulfillment_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    customer: {
      id: '7234567890',
      email: 'customer@example.com',
      first_name: 'John',
      last_name: 'Doe',
      total_spent: '500.00',
      orders_count: 5,
    },
    line_items: [
      {
        id: '12345',
        product_id: '98765',
        variant_id: '54321',
        title: 'Test Product',
        quantity: 1,
        price: '90.00',
        gift_card: false,
      },
    ],
    ...overrides,
  }),

  /**
   * Create a test refund payload
   */
  createRefund: (orderId: string, overrides?: Partial<any>) => ({
    id: '9876543210',
    order_id: orderId,
    created_at: new Date().toISOString(),
    note: 'Customer requested refund',
    restock: true,
    transactions: [
      {
        id: '111222333',
        order_id: orderId,
        kind: 'refund',
        gateway: 'manual',
        status: 'success',
        message: 'Refunded',
        created_at: new Date().toISOString(),
        amount: '50.00',
        currency: 'USD',
      },
    ],
    refund_line_items: [
      {
        id: '444555666',
        line_item_id: '12345',
        quantity: 1,
        subtotal: '45.00',
        total_tax: '5.00',
      },
    ],
    ...overrides,
  }),

  /**
   * Create a test customer payload
   */
  createCustomer: (overrides?: Partial<any>) => ({
    id: '7234567890',
    email: 'customer@example.com',
    first_name: 'John',
    last_name: 'Doe',
    phone: '+1234567890',
    total_spent: '500.00',
    orders_count: 5,
    state: 'enabled',
    verified_email: true,
    tax_exempt: false,
    tags: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),
};

/**
 * Database mock utilities
 */
export class DatabaseMock {
  private data: Map<string, Map<string, any>> = new Map();

  /**
   * Reset all data
   */
  reset() {
    this.data.clear();
  }

  /**
   * Mock a database table
   */
  mockTable(tableName: string) {
    if (!this.data.has(tableName)) {
      this.data.set(tableName, new Map());
    }

    return {
      create: vi.fn(async ({ data }: any) => {
        const table = this.data.get(tableName)!;
        const id = data.id || crypto.randomUUID();
        const record = { ...data, id };
        table.set(id, record);
        return record;
      }),

      findUnique: vi.fn(async ({ where }: any) => {
        const table = this.data.get(tableName)!;
        if (where.id) {
          return table.get(where.id) || null;
        }
        // Handle composite keys
        for (const [id, record] of table.entries()) {
          let matches = true;
          for (const [key, value] of Object.entries(where)) {
            if (record[key] !== value) {
              matches = false;
              break;
            }
          }
          if (matches) return record;
        }
        return null;
      }),

      findFirst: vi.fn(async ({ where }: any) => {
        const table = this.data.get(tableName)!;
        for (const [id, record] of table.entries()) {
          let matches = true;
          for (const [key, value] of Object.entries(where)) {
            if (record[key] !== value) {
              matches = false;
              break;
            }
          }
          if (matches) return record;
        }
        return null;
      }),

      update: vi.fn(async ({ where, data }: any) => {
        const existing = await this.mockTable(tableName).findUnique({ where });
        if (!existing) throw new Error('Record not found');

        const updated = { ...existing, ...data };
        const table = this.data.get(tableName)!;
        table.set(existing.id, updated);
        return updated;
      }),

      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = await this.mockTable(tableName).findUnique({ where });
        if (existing) {
          return this.mockTable(tableName).update({ where, data: update });
        } else {
          return this.mockTable(tableName).create({ data: create });
        }
      }),
    };
  }

  /**
   * Get all records from a table
   */
  getTableData(tableName: string): any[] {
    const table = this.data.get(tableName);
    if (!table) return [];
    return Array.from(table.values());
  }
}

/**
 * Test scenarios
 */
export const WebhookTestScenarios = {
  /**
   * Test order payment webhook processing
   */
  orderPayment: async (db: DatabaseMock, processWebhook: Function) => {
    const order = TestFactories.createOrder();
    const request = createMockWebhookRequest({
      topic: 'orders/paid',
      shop: 'test-shop.myshopify.com',
      payload: order,
    });

    const response = await processWebhook(request);

    // Verify response
    expect(response.status).toBe(200);

    // Verify customer was created/updated
    const customers = db.getTableData('customer');
    expect(customers).toHaveLength(1);
    expect(customers[0].email).toBe(order.customer.email);

    // Verify cashback ledger entry was created
    const ledgerEntries = db.getTableData('storeCreditLedger');
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].entryType).toBe('CASHBACK_EARNED');

    // Verify webhook was marked as processed
    const webhookProcessed = db.getTableData('webhookProcessed');
    expect(webhookProcessed).toHaveLength(1);

    return { order, customers, ledgerEntries };
  },

  /**
   * Test order refund webhook processing
   */
  orderRefund: async (db: DatabaseMock, processWebhook: Function) => {
    // First create an order with cashback
    const orderResult = await WebhookTestScenarios.orderPayment(db, processWebhook);

    // Now process refund
    const refund = TestFactories.createRefund(orderResult.order.id);
    const request = createMockWebhookRequest({
      topic: 'orders/refunded',
      shop: 'test-shop.myshopify.com',
      payload: refund,
    });

    const response = await processWebhook(request);

    // Verify response
    expect(response.status).toBe(200);

    // Verify clawback ledger entry was created
    const ledgerEntries = db.getTableData('storeCreditLedger');
    expect(ledgerEntries).toHaveLength(2); // Original + clawback

    const clawback = ledgerEntries.find(e => e.entryType === 'REFUND_CLAWBACK');
    expect(clawback).toBeDefined();
    expect(clawback.amount).toBeLessThan(0); // Should be negative

    return { refund, ledgerEntries };
  },

  /**
   * Test idempotency (duplicate webhook)
   */
  idempotency: async (db: DatabaseMock, processWebhook: Function) => {
    const order = TestFactories.createOrder();
    const request1 = createMockWebhookRequest({
      topic: 'orders/paid',
      shop: 'test-shop.myshopify.com',
      payload: order,
    });

    // Process first time
    await processWebhook(request1);

    // Process second time (duplicate)
    const request2 = createMockWebhookRequest({
      topic: 'orders/paid',
      shop: 'test-shop.myshopify.com',
      payload: order,
    });

    await processWebhook(request2);

    // Verify only one ledger entry was created
    const ledgerEntries = db.getTableData('storeCreditLedger');
    expect(ledgerEntries).toHaveLength(1);

    // Verify only one webhook process entry
    const webhookProcessed = db.getTableData('webhookProcessed');
    expect(webhookProcessed).toHaveLength(1);
  },
};

/**
 * Example test suite
 */
describe('Webhook Processing', () => {
  let db: DatabaseMock;

  beforeEach(() => {
    db = new DatabaseMock();
    // Set up mock tables
    db.mockTable('customer');
    db.mockTable('storeCreditLedger');
    db.mockTable('webhookProcessed');
    db.mockTable('order');
    db.mockTable('tier');
  });

  afterEach(() => {
    db.reset();
  });

  it('should process order payment and create cashback', async () => {
    // This would be your actual webhook processing function
    const processWebhook = async (request: Request) => {
      // Mock implementation - replace with actual
      return new Response('OK', { status: 200 });
    };

    await WebhookTestScenarios.orderPayment(db, processWebhook);
  });

  it('should process refund and clawback cashback', async () => {
    const processWebhook = async (request: Request) => {
      // Mock implementation - replace with actual
      return new Response('OK', { status: 200 });
    };

    await WebhookTestScenarios.orderRefund(db, processWebhook);
  });

  it('should handle duplicate webhooks (idempotency)', async () => {
    const processWebhook = async (request: Request) => {
      // Mock implementation - replace with actual
      return new Response('OK', { status: 200 });
    };

    await WebhookTestScenarios.idempotency(db, processWebhook);
  });
});

/**
 * Performance testing utilities
 */
export class PerformanceTest {
  /**
   * Load test webhook processing
   */
  static async loadTest(params: {
    processWebhook: Function;
    concurrency: number;
    totalRequests: number;
    shop: string;
  }) {
    const { processWebhook, concurrency, totalRequests, shop } = params;

    const results = {
      successful: 0,
      failed: 0,
      totalTime: 0,
      averageTime: 0,
      minTime: Infinity,
      maxTime: 0,
    };

    const startTime = Date.now();
    const batches = Math.ceil(totalRequests / concurrency);

    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(concurrency, totalRequests - (batch * concurrency));
      const promises = [];

      for (let i = 0; i < batchSize; i++) {
        const order = TestFactories.createOrder({
          id: `order-${batch}-${i}`,
          name: `#${1000 + (batch * concurrency) + i}`,
        });

        const request = createMockWebhookRequest({
          topic: 'orders/paid',
          shop,
          payload: order,
        });

        const requestStartTime = Date.now();

        promises.push(
          processWebhook(request)
            .then((response: Response) => {
              const requestTime = Date.now() - requestStartTime;
              results.successful++;
              results.totalTime += requestTime;
              results.minTime = Math.min(results.minTime, requestTime);
              results.maxTime = Math.max(results.maxTime, requestTime);
              return response;
            })
            .catch((error: any) => {
              results.failed++;
              console.error(`Request failed:`, error);
            })
        );
      }

      await Promise.all(promises);
    }

    const totalTime = Date.now() - startTime;
    results.averageTime = results.totalTime / results.successful;

    return {
      ...results,
      totalTime,
      requestsPerSecond: (totalRequests / totalTime) * 1000,
    };
  }
}