import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { performance } from 'perf_hooks';

// Import the HMAC verification functions
import { verifyWebhookHMAC } from '~/utils/hmac-verification';
import { validateOAuthCallback } from '~/utils/oauth-validation';

describe('HMAC Validation Security Tests', () => {
  const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || 'test-webhook-secret';
  const API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-api-secret';

  // Helper to generate valid webhook HMAC (base64)
  function generateWebhookHMAC(body: Buffer | string, secret: string): string {
    const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return crypto.createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('base64');
  }

  // Helper to generate OAuth HMAC (hex)
  function generateOAuthHMAC(params: URLSearchParams, secret: string): string {
    // Sort parameters lexicographically (excluding hmac)
    const sortedParams = new URLSearchParams();
    const entries = Array.from(params.entries())
      .filter(([key]) => key !== 'hmac')
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [key, value] of entries) {
      sortedParams.append(key, value);
    }

    const message = sortedParams.toString();
    return crypto.createHmac('sha256', secret)
      .update(message)
      .digest('hex');
  }

  describe('Webhook HMAC Verification', () => {
    it('should accept valid webhook HMAC signatures', () => {
      const payload = JSON.stringify({ test: 'data', timestamp: Date.now() });
      const validHmac = generateWebhookHMAC(payload, WEBHOOK_SECRET);

      const result = verifyWebhookHMAC(payload, validHmac, WEBHOOK_SECRET);
      expect(result).toBe(true);
    });

    it('should reject invalid webhook HMAC signatures', () => {
      const payload = JSON.stringify({ test: 'data' });
      const validHmac = generateWebhookHMAC(payload, WEBHOOK_SECRET);
      const invalidHmac = validHmac.slice(0, -1) + '0'; // Tamper with last character

      const result = verifyWebhookHMAC(payload, invalidHmac, WEBHOOK_SECRET);
      expect(result).toBe(false);
    });

    it('should reject HMAC with wrong secret', () => {
      const payload = JSON.stringify({ test: 'data' });
      const hmacWithWrongSecret = generateWebhookHMAC(payload, 'wrong-secret');

      const result = verifyWebhookHMAC(payload, hmacWithWrongSecret, WEBHOOK_SECRET);
      expect(result).toBe(false);
    });

    it('should reject modified payload with valid HMAC', () => {
      const originalPayload = JSON.stringify({ test: 'data' });
      const validHmac = generateWebhookHMAC(originalPayload, WEBHOOK_SECRET);
      const modifiedPayload = JSON.stringify({ test: 'modified' });

      const result = verifyWebhookHMAC(modifiedPayload, validHmac, WEBHOOK_SECRET);
      expect(result).toBe(false);
    });

    it('should handle empty payload', () => {
      const emptyPayload = '';
      const validHmac = generateWebhookHMAC(emptyPayload, WEBHOOK_SECRET);

      const result = verifyWebhookHMAC(emptyPayload, validHmac, WEBHOOK_SECRET);
      expect(result).toBe(true);
    });

    it('should handle large payloads efficiently', () => {
      const largePayload = JSON.stringify({
        data: 'x'.repeat(100000), // 100KB payload
        nested: Array(1000).fill({ item: 'test' })
      });
      const validHmac = generateWebhookHMAC(largePayload, WEBHOOK_SECRET);

      const start = performance.now();
      const result = verifyWebhookHMAC(largePayload, validHmac, WEBHOOK_SECRET);
      const duration = performance.now() - start;

      expect(result).toBe(true);
      expect(duration).toBeLessThan(5); // Should complete within 5ms
    });

    it('should reject malformed HMAC formats', () => {
      const payload = JSON.stringify({ test: 'data' });

      // Test various malformed HMACs
      const malformedHmacs = [
        '', // Empty
        'not-base64!@#$%', // Invalid base64
        '12345', // Too short
        'a'.repeat(500), // Too long
      ];

      for (const malformedHmac of malformedHmacs) {
        const result = verifyWebhookHMAC(payload, malformedHmac, WEBHOOK_SECRET);
        expect(result).toBe(false);
      }
    });
  });

  describe('Timing-Safe Comparison', () => {
    it('should use constant-time comparison for HMAC verification', () => {
      const payload = Buffer.from(JSON.stringify({ test: 'data' }));
      const secret = WEBHOOK_SECRET;
      const validHmac = generateWebhookHMAC(payload, secret);

      // Create an invalid HMAC that differs only in the last character
      const invalidHmac = validHmac.slice(0, -1) + (validHmac.slice(-1) === '0' ? '1' : '0');

      const timingsValid: number[] = [];
      const timingsInvalid: number[] = [];
      const iterations = 1000;

      // Measure valid HMAC verification times
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        verifyWebhookHMAC(payload, validHmac, secret);
        timingsValid.push(performance.now() - start);
      }

      // Measure invalid HMAC verification times
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        verifyWebhookHMAC(payload, invalidHmac, secret);
        timingsInvalid.push(performance.now() - start);
      }

      // Calculate statistics
      const avgValid = timingsValid.reduce((a, b) => a + b, 0) / timingsValid.length;
      const avgInvalid = timingsInvalid.reduce((a, b) => a + b, 0) / timingsInvalid.length;

      const stdDevValid = Math.sqrt(
        timingsValid.reduce((sum, t) => sum + Math.pow(t - avgValid, 2), 0) / timingsValid.length
      );
      const stdDevInvalid = Math.sqrt(
        timingsInvalid.reduce((sum, t) => sum + Math.pow(t - avgInvalid, 2), 0) / timingsInvalid.length
      );

      // The average times should be very close (within noise margin)
      const timeDifference = Math.abs(avgValid - avgInvalid);
      const acceptableVariance = Math.max(stdDevValid, stdDevInvalid) * 2; // 2 standard deviations

      expect(timeDifference).toBeLessThan(acceptableVariance);

      // Log for inspection (optional)
      console.log(`Valid HMAC avg: ${avgValid.toFixed(4)}ms ± ${stdDevValid.toFixed(4)}`);
      console.log(`Invalid HMAC avg: ${avgInvalid.toFixed(4)}ms ± ${stdDevInvalid.toFixed(4)}`);
      console.log(`Time difference: ${timeDifference.toFixed(4)}ms`);
    });

    it('should handle early-mismatch vs late-mismatch HMACs equally', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = WEBHOOK_SECRET;
      const validHmac = generateWebhookHMAC(payload, secret);

      // Create HMACs that differ at different positions
      const earlyMismatchHmac = '0' + validHmac.slice(1); // First character different
      const lateMismatchHmac = validHmac.slice(0, -1) + '0'; // Last character different

      const timingsEarly: number[] = [];
      const timingsLate: number[] = [];

      for (let i = 0; i < 500; i++) {
        const startEarly = performance.now();
        verifyWebhookHMAC(payload, earlyMismatchHmac, secret);
        timingsEarly.push(performance.now() - startEarly);

        const startLate = performance.now();
        verifyWebhookHMAC(payload, lateMismatchHmac, secret);
        timingsLate.push(performance.now() - startLate);
      }

      const avgEarly = timingsEarly.reduce((a, b) => a + b, 0) / timingsEarly.length;
      const avgLate = timingsLate.reduce((a, b) => a + b, 0) / timingsLate.length;

      // Both should take similar time (no early exit optimization)
      expect(Math.abs(avgEarly - avgLate)).toBeLessThan(0.5);
    });
  });

  describe('OAuth Callback HMAC Validation', () => {
    it('should validate correct OAuth callback HMAC', () => {
      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: 'test-authorization-code',
        state: 'nonce-123456',
        timestamp: Math.floor(Date.now() / 1000).toString(),
      });

      const hmac = generateOAuthHMAC(params, API_SECRET);
      params.set('hmac', hmac);

      const result = validateOAuthCallback(params, API_SECRET);
      expect(result).toBe(true);
    });

    it('should reject OAuth callback with tampered parameters', () => {
      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: 'test-authorization-code',
        state: 'nonce-123456',
        timestamp: Math.floor(Date.now() / 1000).toString(),
      });

      const hmac = generateOAuthHMAC(params, API_SECRET);
      params.set('hmac', hmac);

      // Tamper with the shop parameter after HMAC generation
      params.set('shop', 'evil-shop.myshopify.com');

      const result = validateOAuthCallback(params, API_SECRET);
      expect(result).toBe(false);
    });

    it('should reject OAuth callback with old timestamp', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: 'test-authorization-code',
        state: 'nonce-123456',
        timestamp: oldTimestamp.toString(),
      });

      const hmac = generateOAuthHMAC(params, API_SECRET);
      params.set('hmac', hmac);

      const result = validateOAuthCallback(params, API_SECRET, { maxAge: 300 }); // 5 minute window
      expect(result).toBe(false);
    });

    it('should handle parameter sorting correctly', () => {
      // Create params in non-alphabetical order
      const params = new URLSearchParams();
      params.set('timestamp', '1234567890');
      params.set('shop', 'test-shop.myshopify.com');
      params.set('code', 'abc123');
      params.set('state', 'xyz789');

      const hmac = generateOAuthHMAC(params, API_SECRET);
      params.set('hmac', hmac);

      // Rearrange params (URLSearchParams maintains insertion order)
      const reorderedParams = new URLSearchParams();
      reorderedParams.set('code', params.get('code')!);
      reorderedParams.set('shop', params.get('shop')!);
      reorderedParams.set('state', params.get('state')!);
      reorderedParams.set('timestamp', params.get('timestamp')!);
      reorderedParams.set('hmac', params.get('hmac')!);

      // Should still validate correctly
      const result = validateOAuthCallback(reorderedParams, API_SECRET);
      expect(result).toBe(true);
    });
  });

  describe('Replay Attack Prevention', () => {
    it('should track and reject duplicate webhook event IDs', async () => {
      const eventId = 'webhook-event-12345';
      const payload = JSON.stringify({
        id: 123,
        email: 'test@example.com'
      });
      const hmac = generateWebhookHMAC(payload, WEBHOOK_SECRET);

      // Mock webhook processing function that tracks event IDs
      const processedEvents = new Set<string>();

      const processWebhook = (eventId: string, payload: string, hmac: string): boolean => {
        // Verify HMAC
        if (!verifyWebhookHMAC(payload, hmac, WEBHOOK_SECRET)) {
          return false;
        }

        // Check for duplicate
        if (processedEvents.has(eventId)) {
          return false; // Reject duplicate
        }

        processedEvents.add(eventId);
        return true;
      };

      // First attempt should succeed
      const firstResult = processWebhook(eventId, payload, hmac);
      expect(firstResult).toBe(true);

      // Second attempt with same event ID should fail (replay attack)
      const secondResult = processWebhook(eventId, payload, hmac);
      expect(secondResult).toBe(false);

      // Different event ID should succeed
      const newEventId = 'webhook-event-67890';
      const thirdResult = processWebhook(newEventId, payload, hmac);
      expect(thirdResult).toBe(true);
    });

    it('should reject webhooks with stale timestamps', () => {
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes old
      const payload = JSON.stringify({
        timestamp: oldTimestamp,
        data: 'test'
      });
      const hmac = generateWebhookHMAC(payload, WEBHOOK_SECRET);

      // Mock webhook processor with timestamp validation
      const processWebhook = (payload: string, hmac: string, maxAge = 300000): boolean => {
        if (!verifyWebhookHMAC(payload, hmac, WEBHOOK_SECRET)) {
          return false;
        }

        try {
          const data = JSON.parse(payload);
          const age = Date.now() - data.timestamp;
          if (age > maxAge) {
            return false; // Reject stale webhook
          }
          return true;
        } catch {
          return false;
        }
      };

      // Should reject old timestamp
      const result = processWebhook(payload, hmac, 5 * 60 * 1000); // 5 minute tolerance
      expect(result).toBe(false);

      // Fresh timestamp should pass
      const freshPayload = JSON.stringify({
        timestamp: Date.now(),
        data: 'test'
      });
      const freshHmac = generateWebhookHMAC(freshPayload, WEBHOOK_SECRET);
      const freshResult = processWebhook(freshPayload, freshHmac);
      expect(freshResult).toBe(true);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should verify HMAC within performance budget', () => {
      const payloads = [
        Buffer.from('small'), // Small payload
        Buffer.alloc(1024, 'a'), // 1KB
        Buffer.alloc(10240, 'b'), // 10KB
        Buffer.alloc(102400, 'c'), // 100KB
      ];

      for (const payload of payloads) {
        const hmac = generateWebhookHMAC(payload, WEBHOOK_SECRET);

        const start = performance.now();
        const result = verifyWebhookHMAC(payload, hmac, WEBHOOK_SECRET);
        const duration = performance.now() - start;

        expect(result).toBe(true);
        expect(duration).toBeLessThan(5); // All should complete within 5ms

        console.log(`HMAC verification for ${payload.length} bytes: ${duration.toFixed(3)}ms`);
      }
    });
  });
});