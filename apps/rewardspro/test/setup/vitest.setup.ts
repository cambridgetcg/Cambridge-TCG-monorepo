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
    window.localStorage.clear();
    window.sessionStorage.clear();
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
process.env.ENCRYPTION_KEY = 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcw=='; // Base64 encoded 32-byte key
process.env.SESSION_SECRET = 'test-session-secret-32-bytes-long';

// Mock AWS credentials for Data API testing
process.env.AURORA_RESOURCE_ARN = 'arn:aws:rds:us-east-1:123456789:cluster:test';
process.env.AURORA_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789:secret:test';
process.env.AURORA_DATABASE_NAME = 'test_db';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.AWS_REGION = 'us-east-1';

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