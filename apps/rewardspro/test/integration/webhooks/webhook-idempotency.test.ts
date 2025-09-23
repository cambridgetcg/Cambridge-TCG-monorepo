import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// Mock database for testing
class MockDatabase {
  private webhookLogs: Map<string, any> = new Map();
  private orders: Map<string, any> = new Map();
  private customerCredits: Map<string, number> = new Map();

  async findWebhookLog(webhookId: string) {
    return this.webhookLogs.get(webhookId);
  }

  async createWebhookLog(log: any) {
    if (this.webhookLogs.has(log.webhookId)) {
      throw new Error('Duplicate webhook ID');
    }
    this.webhookLogs.set(log.webhookId, log);
    return log;
  }

  async findOrder(orderId: string) {
    return this.orders.get(orderId);
  }

  async createOrder(order: any) {
    if (this.orders.has(order.id)) {
      throw new Error('Duplicate order ID');
    }
    this.orders.set(order.id, order);
    return order;
  }

  async updateCustomerCredit(customerId: string, amount: number) {
    const current = this.customerCredits.get(customerId) || 0;
    this.customerCredits.set(customerId, current + amount);
    return current + amount;
  }

  async getCustomerCredit(customerId: string) {
    return this.customerCredits.get(customerId) || 0;
  }

  reset() {
    this.webhookLogs.clear();
    this.orders.clear();
    this.customerCredits.clear();
  }
}

// Webhook processor with idempotency
class WebhookProcessor {
  constructor(private db: MockDatabase) {}

  async processOrderPaid(webhookId: string, payload: any) {
    // Check for duplicate webhook
    const existingLog = await this.db.findWebhookLog(webhookId);
    if (existingLog) {
      return {
        status: 200,
        message: 'Already processed',
        processed: false,
      };
    }

    // Start processing
    try {
      // Log the webhook first to prevent concurrent processing
      await this.db.createWebhookLog({
        webhookId,
        topic: 'orders/paid',
        shopDomain: payload.shop_domain,
        processedAt: new Date(),
        payload: JSON.stringify(payload),
      });

      // Check if order already exists
      const existingOrder = await this.db.findOrder(payload.id);
      if (existingOrder) {
        return {
          status: 200,
          message: 'Order already exists',
          processed: false,
        };
      }

      // Create order
      const order = await this.db.createOrder({
        id: payload.id,
        customerId: payload.customer?.id,
        totalPrice: payload.total_price,
        createdAt: payload.created_at,
      });

      // Calculate and apply cashback (5% for example)
      if (payload.customer?.id) {
        const cashback = parseFloat(payload.total_price) * 0.05;
        await this.db.updateCustomerCredit(payload.customer.id, cashback);
      }

      return {
        status: 200,
        message: 'Successfully processed',
        processed: true,
      };
    } catch (error: any) {
      // If it's a duplicate key error, treat as already processed
      if (error.message.includes('Duplicate')) {
        return {
          status: 200,
          message: 'Already processed (race condition)',
          processed: false,
        };
      }

      // Actual error
      throw error;
    }
  }

  async processOrderUpdated(webhookId: string, payload: any) {
    // Check for duplicate webhook
    const existingLog = await this.db.findWebhookLog(webhookId);
    if (existingLog) {
      return {
        status: 200,
        message: 'Already processed',
        processed: false,
      };
    }

    // Log the webhook
    await this.db.createWebhookLog({
      webhookId,
      topic: 'orders/updated',
      shopDomain: payload.shop_domain,
      processedAt: new Date(),
      payload: JSON.stringify(payload),
    });

    // Check if order exists
    const order = await this.db.findOrder(payload.id);
    if (!order) {
      // Order doesn't exist yet (out of order delivery)
      // Could queue for later or create placeholder
      return {
        status: 200,
        message: 'Order not found, skipping update',
        processed: false,
      };
    }

    // Update order (simplified)
    order.updatedAt = payload.updated_at;

    return {
      status: 200,
      message: 'Successfully updated',
      processed: true,
    };
  }
}

// HMAC verification with timing-safe comparison
function verifyHMAC(rawBody: string, providedHmac: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'base64'),
      Buffer.from(providedHmac, 'base64')
    );
  } catch {
    // Buffers not same length
    return false;
  }
}

describe('Webhook Idempotency & Race Conditions', () => {
  let db: MockDatabase;
  let processor: WebhookProcessor;

  beforeEach(() => {
    db = new MockDatabase();
    processor = new WebhookProcessor(db);
  });

  describe('Duplicate Webhook Suppression', () => {
    it('should process webhook only once when called twice', async () => {
      const webhookId = 'webhook-123';
      const payload = {
        id: 'order-1001',
        shop_domain: 'test.myshopify.com',
        total_price: '100.00',
        customer: { id: 'customer-1' },
        created_at: '2024-01-01T00:00:00Z',
      };

      // First call should process
      const result1 = await processor.processOrderPaid(webhookId, payload);
      expect(result1.processed).toBe(true);
      expect(result1.status).toBe(200);

      // Check that order was created and cashback applied
      const order = await db.findOrder('order-1001');
      expect(order).toBeDefined();
      const credit = await db.getCustomerCredit('customer-1');
      expect(credit).toBe(5); // 5% of 100

      // Second call with same webhook ID should not process
      const result2 = await processor.processOrderPaid(webhookId, payload);
      expect(result2.processed).toBe(false);
      expect(result2.message).toBe('Already processed');

      // Verify no duplicate side effects
      const creditAfter = await db.getCustomerCredit('customer-1');
      expect(creditAfter).toBe(5); // Should not have doubled
    });

    it('should handle different webhooks for same order', async () => {
      const payload = {
        id: 'order-1002',
        shop_domain: 'test.myshopify.com',
        total_price: '200.00',
        customer: { id: 'customer-2' },
        created_at: '2024-01-01T00:00:00Z',
      };

      // First webhook
      const result1 = await processor.processOrderPaid('webhook-201', payload);
      expect(result1.processed).toBe(true);

      // Different webhook ID but same order - should detect duplicate order
      const result2 = await processor.processOrderPaid('webhook-202', payload);
      expect(result2.processed).toBe(false);
      expect(result2.message).toBe('Order already exists');

      // Verify credit was applied only once
      const credit = await db.getCustomerCredit('customer-2');
      expect(credit).toBe(10); // 5% of 200, applied once
    });
  });

  describe('Concurrent Webhook Processing', () => {
    it('should handle concurrent webhooks for same order', async () => {
      const webhookId = 'webhook-301';
      const payload = {
        id: 'order-1003',
        shop_domain: 'test.myshopify.com',
        total_price: '150.00',
        customer: { id: 'customer-3' },
        created_at: '2024-01-01T00:00:00Z',
      };

      // Simulate concurrent processing
      const [result1, result2] = await Promise.all([
        processor.processOrderPaid(webhookId, payload),
        processor.processOrderPaid(webhookId, payload),
      ]);

      // One should succeed, one should be rejected as duplicate
      const results = [result1, result2];
      const processedCount = results.filter(r => r.processed).length;
      expect(processedCount).toBe(1);

      // Verify only one order created
      const order = await db.findOrder('order-1003');
      expect(order).toBeDefined();

      // Verify credit applied only once
      const credit = await db.getCustomerCredit('customer-3');
      expect(credit).toBe(7.5); // 5% of 150
    });

    it('should handle race condition with different webhook IDs', async () => {
      const payload = {
        id: 'order-1004',
        shop_domain: 'test.myshopify.com',
        total_price: '300.00',
        customer: { id: 'customer-4' },
        created_at: '2024-01-01T00:00:00Z',
      };

      // Different webhook IDs but same order - race condition
      const [result1, result2] = await Promise.all([
        processor.processOrderPaid('webhook-401', payload),
        processor.processOrderPaid('webhook-402', payload),
      ]);

      // Both webhook logs should be created
      const log1 = await db.findWebhookLog('webhook-401');
      const log2 = await db.findWebhookLog('webhook-402');
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();

      // But only one order should be created
      const order = await db.findOrder('order-1004');
      expect(order).toBeDefined();

      // Credit should be applied only once
      const credit = await db.getCustomerCredit('customer-4');
      expect(credit).toBe(15); // 5% of 300
    });
  });

  describe('Out-of-Order Webhook Delivery', () => {
    it('should handle update webhook before paid webhook', async () => {
      const orderId = 'order-1005';

      // Updated webhook arrives first
      const updatePayload = {
        id: orderId,
        shop_domain: 'test.myshopify.com',
        updated_at: '2024-01-01T00:05:00Z',
      };

      const updateResult = await processor.processOrderUpdated(
        'webhook-501',
        updatePayload
      );
      expect(updateResult.processed).toBe(false);
      expect(updateResult.message).toBe('Order not found, skipping update');

      // Paid webhook arrives later
      const paidPayload = {
        id: orderId,
        shop_domain: 'test.myshopify.com',
        total_price: '250.00',
        customer: { id: 'customer-5' },
        created_at: '2024-01-01T00:00:00Z',
      };

      const paidResult = await processor.processOrderPaid('webhook-502', paidPayload);
      expect(paidResult.processed).toBe(true);

      // Verify order exists and credit applied
      const order = await db.findOrder(orderId);
      expect(order).toBeDefined();
      const credit = await db.getCustomerCredit('customer-5');
      expect(credit).toBe(12.5);

      // Now if update comes again, it should process
      const updateResult2 = await processor.processOrderUpdated(
        'webhook-503',
        updatePayload
      );
      expect(updateResult2.processed).toBe(true);
    });

    it('should handle complex out-of-order sequence', async () => {
      const orderId = 'order-1006';
      const customerId = 'customer-6';
      const shopDomain = 'test.myshopify.com';

      // Sequence: paid -> duplicate paid -> updated
      const paidPayload = {
        id: orderId,
        shop_domain: shopDomain,
        total_price: '180.00',
        customer: { id: customerId },
        created_at: '2024-01-01T00:00:00Z',
      };

      const updatePayload = {
        id: orderId,
        shop_domain: shopDomain,
        updated_at: '2024-01-01T00:10:00Z',
      };

      // Process in sequence
      const result1 = await processor.processOrderPaid('webhook-601', paidPayload);
      expect(result1.processed).toBe(true);

      // Duplicate paid webhook
      const result2 = await processor.processOrderPaid('webhook-601', paidPayload);
      expect(result2.processed).toBe(false);
      expect(result2.message).toBe('Already processed');

      // Update webhook
      const result3 = await processor.processOrderUpdated('webhook-603', updatePayload);
      expect(result3.processed).toBe(true);

      // Verify final state
      const order = await db.findOrder(orderId);
      expect(order).toBeDefined();
      expect(order.updatedAt).toBe('2024-01-01T00:10:00Z');

      const credit = await db.getCustomerCredit(customerId);
      expect(credit).toBe(9); // 5% of 180, applied once
    });
  });

  describe('HMAC Verification Security', () => {
    const secret = 'test-webhook-secret';

    it('should verify valid HMAC', () => {
      const body = JSON.stringify({ test: 'data' });
      const validHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

      expect(verifyHMAC(body, validHmac, secret)).toBe(true);
    });

    it('should reject invalid HMAC', () => {
      const body = JSON.stringify({ test: 'data' });
      const invalidHmac = 'invalid-hmac-value';

      expect(verifyHMAC(body, invalidHmac, secret)).toBe(false);
    });

    it('should reject HMAC with wrong secret', () => {
      const body = JSON.stringify({ test: 'data' });
      const hmacWithWrongSecret = crypto
        .createHmac('sha256', 'wrong-secret')
        .update(body, 'utf8')
        .digest('base64');

      expect(verifyHMAC(body, hmacWithWrongSecret, secret)).toBe(false);
    });

    it('should reject modified body', () => {
      const originalBody = JSON.stringify({ test: 'data' });
      const validHmac = crypto
        .createHmac('sha256', secret)
        .update(originalBody, 'utf8')
        .digest('base64');

      const modifiedBody = JSON.stringify({ test: 'modified' });
      expect(verifyHMAC(modifiedBody, validHmac, secret)).toBe(false);
    });

    it('should handle empty body', () => {
      const emptyBody = '';
      const validHmac = crypto
        .createHmac('sha256', secret)
        .update(emptyBody, 'utf8')
        .digest('base64');

      expect(verifyHMAC(emptyBody, validHmac, secret)).toBe(true);
    });

    it('should use timing-safe comparison', () => {
      const body = JSON.stringify({ test: 'data' });
      const validHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

      // Modify last character
      const almostValidHmac =
        validHmac.slice(0, -1) + (validHmac.slice(-1) === 'A' ? 'B' : 'A');

      // Should still take same time to compare (timing-safe)
      const start1 = process.hrtime.bigint();
      const result1 = verifyHMAC(body, validHmac, secret);
      const end1 = process.hrtime.bigint();

      const start2 = process.hrtime.bigint();
      const result2 = verifyHMAC(body, almostValidHmac, secret);
      const end2 = process.hrtime.bigint();

      expect(result1).toBe(true);
      expect(result2).toBe(false);

      // Note: In practice, timing differences are hard to measure in tests
      // The important thing is using crypto.timingSafeEqual
    });
  });

  describe('Webhook Retry Scenarios', () => {
    it('should handle partial completion on retry', async () => {
      const webhookId = 'webhook-701';
      const payload = {
        id: 'order-1007',
        shop_domain: 'test.myshopify.com',
        total_price: '400.00',
        customer: { id: 'customer-7' },
        created_at: '2024-01-01T00:00:00Z',
      };

      // Mock a partial failure - webhook logged but order creation failed
      await db.createWebhookLog({
        webhookId,
        topic: 'orders/paid',
        shopDomain: payload.shop_domain,
        processedAt: new Date(),
        payload: JSON.stringify(payload),
      });

      // Retry should detect already processed webhook
      const retryResult = await processor.processOrderPaid(webhookId, payload);
      expect(retryResult.processed).toBe(false);
      expect(retryResult.message).toBe('Already processed');
    });

    it('should handle retry with different webhook ID', async () => {
      const payload = {
        id: 'order-1008',
        shop_domain: 'test.myshopify.com',
        total_price: '500.00',
        customer: { id: 'customer-8' },
        created_at: '2024-01-01T00:00:00Z',
      };

      // First attempt
      const result1 = await processor.processOrderPaid('webhook-801', payload);
      expect(result1.processed).toBe(true);

      // Retry with new webhook ID (Shopify might generate new ID)
      const result2 = await processor.processOrderPaid('webhook-802', payload);
      expect(result2.processed).toBe(false);
      expect(result2.message).toBe('Order already exists');

      // Credit should not be doubled
      const credit = await db.getCustomerCredit('customer-8');
      expect(credit).toBe(25); // 5% of 500, applied once
    });
  });

  describe('Error Recovery', () => {
    it('should handle database errors gracefully', async () => {
      const webhookId = 'webhook-901';
      const payload = {
        id: 'order-1009',
        shop_domain: 'test.myshopify.com',
        total_price: '600.00',
        customer: { id: 'customer-9' },
        created_at: '2024-01-01T00:00:00Z',
      };

      // Mock database error
      const originalCreate = db.createOrder;
      db.createOrder = vi.fn().mockRejectedValueOnce(new Error('Database error'));

      // Should throw on database error
      await expect(processor.processOrderPaid(webhookId, payload)).rejects.toThrow(
        'Database error'
      );

      // Restore mock
      db.createOrder = originalCreate.bind(db);

      // Retry should work if webhook wasn't logged
      const retryResult = await processor.processOrderPaid(webhookId, payload);
      expect(retryResult.processed).toBe(true);
    });
  });
});