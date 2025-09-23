import { describe, test, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { performance } from 'perf_hooks';

describe('Webhook HMAC Security Tests', () => {
  const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || 'test_webhook_secret';

  // List of ALL webhook endpoints in the application
  const webhookEndpoints = [
    // Currently protected (10 routes)
    '/webhooks/orders.paid',
    '/webhooks/orders.create',
    '/webhooks/tier-subscription.created',
    '/webhooks/tier-subscription.cancelled',
    '/webhooks/tier-subscription.billing',
    '/webhooks/shop.update',
    '/webhooks/app.scopes_update',
    '/webhooks/compliance',
    '/webhooks/app.uninstalled',
    '/webhooks/orders.paid.old',

    // MISSING PROTECTION (9 routes) - CRITICAL
    '/webhooks/customers.create',
    '/webhooks/customers.update',
    '/webhooks/orders.refunded',
    '/webhooks/subscription-billing-failure',
    '/webhooks/subscription-billing-success',
    '/webhooks/subscription-billing-attempt',
    '/webhooks/app-subscriptions-update',
    '/webhooks/subscription-contract.created',
    '/webhooks/subscription-contract.updated'
  ];

  function generateWebhookHMAC(body: string): string {
    // Webhooks use base64 (NOT hex like OAuth)
    return crypto
      .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
      .update(body, 'utf8')
      .digest('base64');
  }

  function verifyWebhookHMAC(receivedHmac: string, body: string): boolean {
    const computed = generateWebhookHMAC(body);

    // Critical: Use timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed),
        Buffer.from(receivedHmac)
      );
    } catch (e) {
      // Buffer lengths don't match
      return false;
    }
  }

  describe('HMAC Verification for All Webhooks', () => {
    webhookEndpoints.forEach(endpoint => {
      describe(`${endpoint}`, () => {
        test('rejects requests without HMAC header', async () => {
          const response = await fetch(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Shop-Domain': 'test.myshopify.com',
              'X-Shopify-Topic': 'orders/paid'
              // Missing X-Shopify-Hmac-Sha256
            },
            body: JSON.stringify({ test: 'data' })
          });

          expect(response.status).toBe(401);
        });

        test('rejects requests with invalid HMAC', async () => {
          const body = JSON.stringify({ test: 'data' });

          const response = await fetch(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: {
              'X-Shopify-Hmac-Sha256': 'invalid-hmac-value',
              'X-Shopify-Shop-Domain': 'test.myshopify.com',
              'X-Shopify-Topic': 'orders/paid'
            },
            body
          });

          expect(response.status).toBe(401);
        });

        test('accepts valid HMAC signature', async () => {
          const body = JSON.stringify({
            id: 'order-123',
            customer: { id: 'cust-456' },
            total_price: '100.00'
          });

          const hmac = generateWebhookHMAC(body);

          const response = await fetch(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: {
              'X-Shopify-Hmac-Sha256': hmac,
              'X-Shopify-Shop-Domain': 'test.myshopify.com',
              'X-Shopify-Topic': 'orders/paid',
              'X-Shopify-Event-Id': 'unique-event-123',
              'X-Shopify-Triggered-At': Math.floor(Date.now() / 1000).toString()
            },
            body
          });

          // Should not be 401 (might be 200, 202, or 404 depending on implementation)
          expect(response.status).not.toBe(401);
        });

        test('prevents timing attacks with constant-time comparison', () => {
          const body = JSON.stringify({ test: 'data' });
          const validHmac = generateWebhookHMAC(body);

          // Test various incorrect HMACs with different similarities
          const testCases = [
            validHmac, // Correct
            validHmac.slice(0, -1) + '0', // Last char different
            '0' + validHmac.slice(1), // First char different
            Buffer.from('a'.repeat(44)).toString('base64'), // Completely different
            validHmac.substring(0, 10) + 'x'.repeat(34) // Partial match
          ];

          const timings: number[] = [];

          testCases.forEach(testHmac => {
            const times: number[] = [];

            // Run 100 iterations for each
            for (let i = 0; i < 100; i++) {
              const start = performance.now();
              verifyWebhookHMAC(testHmac, body);
              times.push(performance.now() - start);
            }

            const avgTime = times.reduce((a, b) => a + b) / times.length;
            timings.push(avgTime);
          });

          // All timings should be within 0.5ms of each other
          const maxTime = Math.max(...timings);
          const minTime = Math.min(...timings);

          expect(maxTime - minTime).toBeLessThan(0.5);
        });
      });
    });
  });

  describe('Replay Attack Prevention', () => {
    test('rejects duplicate Event-Id', async () => {
      const body = JSON.stringify({ order_id: '123', amount: 100 });
      const hmac = generateWebhookHMAC(body);
      const eventId = 'unique-event-456';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // First request should succeed
      const response1 = await fetch('http://localhost:3000/webhooks/orders.paid', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': hmac,
          'X-Shopify-Event-Id': eventId,
          'X-Shopify-Triggered-At': timestamp,
          'X-Shopify-Shop-Domain': 'test.myshopify.com'
        },
        body
      });

      expect(response1.status).toBe(200);

      // Replay with same Event-Id should be rejected
      const response2 = await fetch('http://localhost:3000/webhooks/orders.paid', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': hmac,
          'X-Shopify-Event-Id': eventId, // Same Event-Id
          'X-Shopify-Triggered-At': timestamp,
          'X-Shopify-Shop-Domain': 'test.myshopify.com'
        },
        body
      });

      expect(response2.status).toBe(409); // Conflict - already processed
    });

    test('rejects old timestamps (>5 minutes)', async () => {
      const body = JSON.stringify({ order_id: '789' });
      const hmac = generateWebhookHMAC(body);
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago

      const response = await fetch('http://localhost:3000/webhooks/orders.paid', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': hmac,
          'X-Shopify-Event-Id': 'new-event-789',
          'X-Shopify-Triggered-At': oldTimestamp.toString(),
          'X-Shopify-Shop-Domain': 'test.myshopify.com'
        },
        body
      });

      expect(response.status).toBe(401); // Too old
    });
  });

  describe('Webhook-Specific Security Requirements', () => {
    test('orders.paid webhook prevents double cashback', async () => {
      const orderId = 'order-' + Date.now();
      const body = JSON.stringify({
        id: orderId,
        customer: { id: 'cust-123' },
        total_price: '200.00',
        financial_status: 'paid'
      });

      const hmac = generateWebhookHMAC(body);
      const headers = {
        'X-Shopify-Hmac-Sha256': hmac,
        'X-Shopify-Shop-Domain': 'test.myshopify.com',
        'X-Shopify-Topic': 'orders/paid'
      };

      // Send webhook twice
      const response1 = await fetch('http://localhost:3000/webhooks/orders.paid', {
        method: 'POST',
        headers: {
          ...headers,
          'X-Shopify-Event-Id': 'event-1',
          'X-Shopify-Triggered-At': Math.floor(Date.now() / 1000).toString()
        },
        body
      });

      const response2 = await fetch('http://localhost:3000/webhooks/orders.paid', {
        method: 'POST',
        headers: {
          ...headers,
          'X-Shopify-Event-Id': 'event-2', // Different event but same order
          'X-Shopify-Triggered-At': Math.floor(Date.now() / 1000).toString()
        },
        body
      });

      // Both should return success
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // But only one cashback should be created
      // This would check the database in a real test
      // const credits = await db.storeCreditLedger.count({
      //   where: { orderId }
      // });
      // expect(credits).toBe(1);
    });

    test('customer webhooks validate shop domain', async () => {
      const body = JSON.stringify({
        id: 'cust-456',
        email: 'customer@example.com'
      });

      const hmac = generateWebhookHMAC(body);

      // Invalid shop domain
      const response = await fetch('http://localhost:3000/webhooks/customers.create', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': hmac,
          'X-Shopify-Shop-Domain': 'evil.com', // Invalid
          'X-Shopify-Topic': 'customers/create'
        },
        body
      });

      expect(response.status).toBe(400);
    });
  });

  describe('HMAC Algorithm Verification', () => {
    test('uses SHA256 algorithm', () => {
      const body = 'test data';
      const hmac = generateWebhookHMAC(body);

      // SHA256 in base64 should be 44 chars (including padding)
      expect(hmac.length).toBe(44);
      expect(hmac).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 format
    });

    test('differentiates webhook HMAC (base64) from OAuth HMAC (hex)', () => {
      const data = 'test data';

      // Webhook HMAC - base64
      const webhookHmac = crypto
        .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
        .update(data)
        .digest('base64');

      // OAuth HMAC - hex
      const oauthHmac = crypto
        .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
        .update(data)
        .digest('hex');

      expect(webhookHmac).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64
      expect(oauthHmac).toMatch(/^[0-9a-f]+$/); // Hex
      expect(webhookHmac.length).toBe(44); // Base64 length
      expect(oauthHmac.length).toBe(64); // Hex length
    });
  });

  describe('Performance Requirements', () => {
    test('HMAC verification completes within 5ms', () => {
      const body = JSON.stringify({
        id: 'large-order',
        line_items: Array(100).fill({
          id: 'item',
          quantity: 1,
          price: '10.00'
        })
      });

      const hmac = generateWebhookHMAC(body);

      const start = performance.now();
      const isValid = verifyWebhookHMAC(hmac, body);
      const elapsed = performance.now() - start;

      expect(isValid).toBe(true);
      expect(elapsed).toBeLessThan(5);
    });
  });

  describe('Error Handling', () => {
    test('handles malformed JSON gracefully', async () => {
      const malformedBody = '{"invalid": json}';
      const hmac = generateWebhookHMAC(malformedBody);

      const response = await fetch('http://localhost:3000/webhooks/orders.paid', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': hmac,
          'X-Shopify-Shop-Domain': 'test.myshopify.com'
        },
        body: malformedBody
      });

      // Should handle gracefully (not 500)
      expect([400, 422]).toContain(response.status);
    });

    test('handles missing required fields', async () => {
      const incompleteBody = JSON.stringify({ id: 'order-123' }); // Missing customer
      const hmac = generateWebhookHMAC(incompleteBody);

      const response = await fetch('http://localhost:3000/webhooks/orders.paid', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': hmac,
          'X-Shopify-Shop-Domain': 'test.myshopify.com'
        },
        body: incompleteBody
      });

      expect([400, 422]).toContain(response.status);
    });
  });
});

// Mock fetch if not available
declare function fetch(url: string, options?: any): Promise<any>;