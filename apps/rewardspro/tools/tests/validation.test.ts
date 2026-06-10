/**
 * Validation Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateShopDomain,
  assertValidShopDomain,
  validateWebhookSecret,
  assertValidWebhookSecret,
  validateWebhookTopic,
  assertValidWebhookTopic,
  validateUrl,
  assertValidUrl,
  validateDatabaseUrl,
  assertValidDatabaseUrl,
  validatePayload,
  assertValidPayload,
  validateShopifyId,
  normalizeToGid,
  validateAll,
} from '../lib/validation.js';

// ============================================================================
// Shop Domain Validation
// ============================================================================

describe('validateShopDomain', () => {
  it('accepts valid myshopify.com domains', () => {
    expect(validateShopDomain('test-store.myshopify.com').valid).toBe(true);
    expect(validateShopDomain('my-awesome-shop.myshopify.com').valid).toBe(true);
    expect(validateShopDomain('shop123.myshopify.com').valid).toBe(true);
  });

  it('rejects invalid domains', () => {
    expect(validateShopDomain('test.com').valid).toBe(false);
    expect(validateShopDomain('test.shopify.com').valid).toBe(false);
    expect(validateShopDomain('myshopify.com').valid).toBe(false);
    expect(validateShopDomain('test_store.myshopify.com').valid).toBe(false);
    expect(validateShopDomain('-test.myshopify.com').valid).toBe(false);
  });

  it('normalizes case', () => {
    const result = assertValidShopDomain('TEST-STORE.myshopify.com');
    expect(result).toBe('test-store.myshopify.com');
  });

  it('trims whitespace', () => {
    const result = assertValidShopDomain('  test-store.myshopify.com  ');
    expect(result).toBe('test-store.myshopify.com');
  });

  it('rejects null and undefined', () => {
    expect(validateShopDomain(null).valid).toBe(false);
    expect(validateShopDomain(undefined).valid).toBe(false);
    expect(validateShopDomain(null).error).toBe('shop is required');
  });

  it('rejects non-strings', () => {
    expect(validateShopDomain(123).valid).toBe(false);
    expect(validateShopDomain({}).valid).toBe(false);
    expect(validateShopDomain([]).valid).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(validateShopDomain('').valid).toBe(false);
    expect(validateShopDomain('   ').valid).toBe(false);
  });

  it('uses custom field name in error messages', () => {
    const result = validateShopDomain(null, { fieldName: 'storeDomain' });
    expect(result.error).toBe('storeDomain is required');
  });
});

describe('assertValidShopDomain', () => {
  it('returns normalized domain on success', () => {
    expect(assertValidShopDomain('test.myshopify.com')).toBe('test.myshopify.com');
  });

  it('throws on invalid domain', () => {
    expect(() => assertValidShopDomain('invalid')).toThrow();
    expect(() => assertValidShopDomain(null)).toThrow('shop is required');
  });
});

// ============================================================================
// Webhook Secret Validation
// ============================================================================

describe('validateWebhookSecret', () => {
  it('accepts valid secrets (16+ chars)', () => {
    expect(validateWebhookSecret('a'.repeat(16)).valid).toBe(true);
    expect(validateWebhookSecret('a'.repeat(32)).valid).toBe(true);
    expect(validateWebhookSecret('shpss_abcdef123456789012345678901234').valid).toBe(true);
  });

  it('rejects short secrets', () => {
    expect(validateWebhookSecret('short').valid).toBe(false);
    expect(validateWebhookSecret('a'.repeat(15)).valid).toBe(false);
    expect(validateWebhookSecret('a'.repeat(15)).error).toContain('too short');
  });

  it('rejects null and empty', () => {
    expect(validateWebhookSecret(null).valid).toBe(false);
    expect(validateWebhookSecret(undefined).valid).toBe(false);
    expect(validateWebhookSecret('').valid).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(validateWebhookSecret(12345678901234567890).valid).toBe(false);
  });
});

// ============================================================================
// Webhook Topic Validation
// ============================================================================

describe('validateWebhookTopic', () => {
  it('accepts valid topics', () => {
    expect(validateWebhookTopic('orders/create').valid).toBe(true);
    expect(validateWebhookTopic('orders/paid').valid).toBe(true);
    expect(validateWebhookTopic('customers/create').valid).toBe(true);
    expect(validateWebhookTopic('refunds/create').valid).toBe(true);
    expect(validateWebhookTopic('app/uninstalled').valid).toBe(true);
  });

  it('rejects invalid topics', () => {
    expect(validateWebhookTopic('invalid/topic').valid).toBe(false);
    expect(validateWebhookTopic('orders').valid).toBe(false);
    expect(validateWebhookTopic('').valid).toBe(false);
    expect(validateWebhookTopic(null).valid).toBe(false);
  });

  it('provides list of valid topics in error', () => {
    const result = validateWebhookTopic('invalid');
    expect(result.error).toContain('orders/create');
  });
});

describe('assertValidWebhookTopic', () => {
  it('returns topic on success', () => {
    expect(assertValidWebhookTopic('orders/create')).toBe('orders/create');
  });

  it('throws on invalid topic', () => {
    expect(() => assertValidWebhookTopic('invalid')).toThrow();
  });
});

// ============================================================================
// URL Validation
// ============================================================================

describe('validateUrl', () => {
  it('accepts valid HTTP/HTTPS URLs', () => {
    expect(validateUrl('https://example.com').valid).toBe(true);
    expect(validateUrl('http://localhost:3000').valid).toBe(true);
    expect(validateUrl('https://api.example.com/webhooks').valid).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(validateUrl('not-a-url').valid).toBe(false);
    expect(validateUrl('ftp://files.example.com').valid).toBe(false);
    expect(validateUrl('file:///etc/passwd').valid).toBe(false);
  });

  it('rejects null and empty', () => {
    expect(validateUrl(null).valid).toBe(false);
    expect(validateUrl('').valid).toBe(false);
  });
});

// ============================================================================
// Database URL Validation
// ============================================================================

describe('validateDatabaseUrl', () => {
  it('accepts PostgreSQL URLs', () => {
    expect(validateDatabaseUrl('postgres://user:pass@host:5432/db').valid).toBe(true);
    expect(validateDatabaseUrl('postgresql://user:pass@host/db').valid).toBe(true);
  });

  it('rejects non-PostgreSQL URLs', () => {
    expect(validateDatabaseUrl('mysql://user:pass@host/db').valid).toBe(false);
    expect(validateDatabaseUrl('mongodb://host/db').valid).toBe(false);
    expect(validateDatabaseUrl('https://example.com').valid).toBe(false);
  });

  it('rejects null and empty', () => {
    expect(validateDatabaseUrl(null).valid).toBe(false);
    expect(validateDatabaseUrl('').valid).toBe(false);
  });
});

// ============================================================================
// Payload Validation
// ============================================================================

describe('validatePayload', () => {
  it('accepts objects', () => {
    expect(validatePayload({}).valid).toBe(true);
    expect(validatePayload({ key: 'value' }).valid).toBe(true);
    expect(validatePayload({ nested: { object: true } }).valid).toBe(true);
  });

  it('accepts null/undefined (defaults to empty object)', () => {
    expect(validatePayload(null).valid).toBe(true);
    expect(validatePayload(undefined).valid).toBe(true);
  });

  it('rejects arrays', () => {
    expect(validatePayload([]).valid).toBe(false);
    expect(validatePayload([1, 2, 3]).valid).toBe(false);
  });

  it('rejects primitives', () => {
    expect(validatePayload('string').valid).toBe(false);
    expect(validatePayload(123).valid).toBe(false);
    expect(validatePayload(true).valid).toBe(false);
  });
});

describe('assertValidPayload', () => {
  it('returns empty object for null/undefined', () => {
    expect(assertValidPayload(null)).toEqual({});
    expect(assertValidPayload(undefined)).toEqual({});
  });

  it('returns the payload object', () => {
    const payload = { key: 'value' };
    expect(assertValidPayload(payload)).toBe(payload);
  });
});

// ============================================================================
// Shopify ID Validation
// ============================================================================

describe('validateShopifyId', () => {
  it('accepts numeric IDs', () => {
    expect(validateShopifyId('123456789').valid).toBe(true);
    expect(validateShopifyId(123456789).valid).toBe(true);
  });

  it('accepts GID format', () => {
    expect(validateShopifyId('gid://shopify/Order/123').valid).toBe(true);
    expect(validateShopifyId('gid://shopify/Customer/456').valid).toBe(true);
    expect(validateShopifyId('gid://shopify/Product/789').valid).toBe(true);
  });

  it('validates resource type when specified', () => {
    expect(validateShopifyId('gid://shopify/Order/123', 'Order').valid).toBe(true);
    expect(validateShopifyId('gid://shopify/Customer/123', 'Order').valid).toBe(false);
  });

  it('rejects invalid formats', () => {
    expect(validateShopifyId('abc').valid).toBe(false);
    expect(validateShopifyId('gid://other/Order/123').valid).toBe(false);
    expect(validateShopifyId('').valid).toBe(false);
    expect(validateShopifyId(null).valid).toBe(false);
  });
});

describe('normalizeToGid', () => {
  it('converts numeric ID to GID', () => {
    expect(normalizeToGid('123', 'Order')).toBe('gid://shopify/Order/123');
    expect(normalizeToGid(456, 'Customer')).toBe('gid://shopify/Customer/456');
  });

  it('returns GID unchanged', () => {
    expect(normalizeToGid('gid://shopify/Order/123', 'Order')).toBe('gid://shopify/Order/123');
  });

  it('throws on invalid ID', () => {
    expect(() => normalizeToGid('invalid', 'Order')).toThrow('Cannot normalize invalid ID');
  });
});

// ============================================================================
// Composite Validation
// ============================================================================

describe('validateAll', () => {
  it('returns valid when all validations pass', () => {
    const result = validateAll([
      { field: 'shop', value: 'test.myshopify.com', validator: validateShopDomain },
      { field: 'url', value: 'https://example.com', validator: validateUrl },
    ]);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('collects all errors', () => {
    const result = validateAll([
      { field: 'shop', value: 'invalid', validator: validateShopDomain },
      { field: 'url', value: 'invalid', validator: validateUrl },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('shop:');
    expect(result.error).toContain('url:');
  });

  it('returns valid for empty array', () => {
    expect(validateAll([]).valid).toBe(true);
  });
});
