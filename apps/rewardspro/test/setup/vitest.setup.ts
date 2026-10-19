import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { server } from '../mocks/server';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// BigInt serialization fix for tests
// This allows JSON.stringify to work with BigInt values
if (typeof BigInt !== 'undefined') {
  // @ts-ignore
  BigInt.prototype.toJSON = function() {
    return this.toString();
  };
}

// Polaris responsive utilities subscribe to matchMedia in component tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// MSW Server Setup
beforeAll(() => {
  // Start the MSW server before all tests
  server.listen({
    onUnhandledRequest: 'error', // Fail tests on unhandled requests
  });
});

// Reset handlers and cleanup after each test
afterEach(() => {
  // Reset any request handlers that are declared in tests
  server.resetHandlers();

  // Cleanup React Testing Library
  cleanup();

  // Clear all mocks
  vi.clearAllMocks();

  // Clear any localStorage/sessionStorage if used
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage?.clear) {
        window.localStorage.clear();
      }
      if (window.sessionStorage?.clear) {
        window.sessionStorage.clear();
      }
    } catch {
      // Ignore localStorage errors in non-browser environments
    }
  }
});

// Clean up after all tests
afterAll(() => {
  server.close();
});

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.SHOPIFY_API_KEY = 'test-api-key';
process.env.SHOPIFY_API_SECRET = 'test-api-secret';
process.env.SHOPIFY_APP_URL = 'https://test.example.com';
process.env.SHOPIFY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SESSION_SECRET = 'test-session-secret-32-bytes-long';
// Session token encryption (utils/encryption.ts) fails closed without these
process.env.ENCRYPTION_SECRET = 'test-encryption-secret';
process.env.ENCRYPTION_SALT = '00112233445566778899aabbccddeeff';

// db.server.ts builds its client at import. Unit tests mock it or never
// query; integration tests (test/integration) point this at a real database.
process.env.DATABASE_URL ??= 'postgresql://unit-tests@127.0.0.1:1/unit-tests';

// Mock console methods to reduce test output noise
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = vi.fn((message, ...args) => {
    // Only show actual errors, not React warnings
    if (
      typeof message === 'string' &&
      !message.includes('Warning:') &&
      !message.includes('ReactDOM.render')
    ) {
      originalError(message, ...args);
    }
  });

  console.warn = vi.fn((message, ...args) => {
    // Suppress specific warnings that are expected in tests
    if (
      typeof message === 'string' &&
      !message.includes('componentWillReceiveProps') &&
      !message.includes('componentWillMount')
    ) {
      originalWarn(message, ...args);
    }
  });
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Global test utilities
global.testUtils = {
  // Generate a test shop domain
  generateShopDomain: () => `test-shop-${Date.now()}.myshopify.com`,

  // Generate a valid HMAC for webhook testing
  generateWebhookHMAC: (body: string, secret = process.env.SHOPIFY_WEBHOOK_SECRET) => {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', secret!)
      .update(body, 'utf8')
      .digest('base64');
  },

  // Generate a test JWT session token
  generateSessionToken: (shop: string, exp?: number) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: `${shop}/admin`,
      dest: `https://${shop}`,
      aud: process.env.SHOPIFY_API_KEY,
      sub: '12345',
      exp: exp || Math.floor(Date.now() / 1000) + 60,
      nbf: Math.floor(Date.now() / 1000),
      iat: Math.floor(Date.now() / 1000),
      jti: '4321',
      sid: 'test-session-id',
    };

    // For testing, return a mock token structure
    return {
      header,
      payload,
      token: 'mock.jwt.token',
    };
  },
};

// Type augmentation for global test utilities
declare global {
  var testUtils: {
    generateShopDomain: () => string;
    generateWebhookHMAC: (body: string, secret?: string) => string;
    generateSessionToken: (shop: string, exp?: number) => {
      header: any;
      payload: any;
      token: string;
    };
  };
}
