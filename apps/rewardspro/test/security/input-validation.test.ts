import { describe, test, expect } from 'vitest';
import { z } from 'zod';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import fc from 'fast-check';

// Setup DOMPurify
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as any);

describe('Input Validation & XSS Prevention', () => {
  describe('Zod Schema Validation', () => {
    // Example schema from the app
    const customerSchema = z.object({
      email: z.string().email().toLowerCase().trim(),
      name: z.string().min(1).max(100).transform(val =>
        DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })
      ),
      creditAmount: z.number().min(0).max(999999.99),
      shop: z.string().regex(/^[a-z0-9-]+\.myshopify\.com$/)
    });

    test('validates correct input types', () => {
      const validInput = {
        email: 'Customer@Example.com  ',
        name: 'John Doe',
        creditAmount: 100.50,
        shop: 'test-shop.myshopify.com'
      };

      const result = customerSchema.parse(validInput);
      expect(result.email).toBe('customer@example.com'); // Lowercased & trimmed
      expect(result.name).toBe('John Doe');
      expect(result.creditAmount).toBe(100.50);
    });

    test('rejects invalid input types', () => {
      const invalidCases = [
        { email: 'not-an-email' },
        { name: '' }, // Too short
        { name: 'a'.repeat(101) }, // Too long
        { creditAmount: -1 }, // Negative
        { creditAmount: 1000000 }, // Too large
        { shop: 'invalid-shop' } // Not myshopify domain
      ];

      invalidCases.forEach(badInput => {
        expect(() => customerSchema.parse({
          email: 'valid@example.com',
          name: 'Valid Name',
          creditAmount: 100,
          shop: 'valid-shop.myshopify.com',
          ...badInput
        })).toThrow();
      });
    });

    test('sanitizes HTML in string fields', () => {
      const maliciousInput = {
        email: 'test@example.com',
        name: '<script>alert("XSS")</script>John',
        creditAmount: 100,
        shop: 'test-shop.myshopify.com'
      };

      const result = customerSchema.parse(maliciousInput);
      expect(result.name).toBe('John'); // Script tag removed
      expect(result.name).not.toContain('<script>');
    });
  });

  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror="alert(1)">',
      'javascript:alert(1)',
      '<svg onload=alert(1)>',
      '"><script>alert(String.fromCharCode(88,83,83))</script>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<body onload="alert(1)">',
      '<input type="text" onfocus="alert(1)" autofocus>',
      '<a href="javascript:void(0)" onclick="alert(1)">Click</a>',
      '<style>body{background:url("javascript:alert(1)")}</style>'
    ];

    xssPayloads.forEach(payload => {
      test(`sanitizes XSS: ${payload.substring(0, 30)}...`, () => {
        const clean = DOMPurify.sanitize(payload);

        // Should not contain script tags
        expect(clean).not.toContain('<script');
        expect(clean).not.toContain('javascript:');
        expect(clean).not.toContain('onerror');
        expect(clean).not.toContain('onload');
        expect(clean).not.toContain('onfocus');
        expect(clean).not.toContain('onclick');
      });
    });

    test('DOMPurify removes dangerous attributes', () => {
      const dirty = '<div onclick="alert(1)" style="background: url(javascript:alert(2))">Test</div>';
      const clean = DOMPurify.sanitize(dirty);

      expect(clean).toBe('<div>Test</div>');
    });

    test('preserves safe HTML when configured', () => {
      const safeHtml = '<p>Hello <strong>World</strong> <a href="/safe-link">Link</a></p>';
      const clean = DOMPurify.sanitize(safeHtml, {
        ALLOWED_TAGS: ['p', 'strong', 'a'],
        ALLOWED_ATTR: ['href']
      });

      expect(clean).toBe(safeHtml);
    });

    test('API endpoints reject XSS in responses', async () => {
      const xssName = '<script>alert(1)</script>Customer';

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: xssName,
          email: 'test@example.com'
        })
      });

      if (response.ok) {
        const customer = await response.json();
        expect(customer.name).not.toContain('<script>');
        expect(customer.name).not.toContain('alert');
      }
    });
  });

  describe('SQL Injection Prevention', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE customers; --",
      "1' OR '1'='1",
      "admin'--",
      "' UNION SELECT * FROM customers--",
      "1; DELETE FROM customers WHERE 1=1--",
      "Robert'); DROP TABLE customers;--", // Bobby Tables
      "\" OR \"\"=\"",
      "` OR 1=1 /*",
      "' OR 1=1 #",
      "1' AND (SELECT COUNT(*) FROM users) > 0--"
    ];

    sqlInjectionPayloads.forEach(payload => {
      test(`blocks SQL injection: ${payload.substring(0, 30)}...`, async () => {
        const response = await fetch('/api/customers/search', {
          method: 'GET',
          headers: { 'X-Search-Query': payload }
        });

        // Should either sanitize or reject
        expect([200, 400]).toContain(response.status);

        // Should not leak SQL error details
        const body = await response.text();
        expect(body).not.toMatch(/syntax error/i);
        expect(body).not.toMatch(/SQL/i);
        expect(body).not.toMatch(/DROP TABLE/i);
        expect(body).not.toMatch(/DELETE FROM/i);
      });
    });

    test('parameterized queries prevent injection', async () => {
      const maliciousId = "1 OR 1=1";

      const response = await fetch(`/api/customers/${encodeURIComponent(maliciousId)}`);

      // Should not return all customers
      if (response.status === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(false); // Single customer, not array
      } else {
        expect(response.status).toBe(404); // Not found
      }
    });
  });

  describe('NoSQL Injection Prevention', () => {
    test('blocks MongoDB-style operators', async () => {
      const noSqlPayloads = [
        { name: { $ne: null } }, // Would return all documents
        { name: { $gt: '' } },    // Greater than empty string
        { $where: 'this.credits > 0' }, // JavaScript execution
        { name: { $regex: '.*' } }, // Regex wildcard
        { '$or': [{ name: 'admin' }, { name: 'user' }] }
      ];

      for (const payload of noSqlPayloads) {
        const response = await fetch('/api/customers/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        expect(response.status).toBe(400); // Bad request
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      'file:///etc/passwd',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc%252fpasswd'
    ];

    pathTraversalPayloads.forEach(payload => {
      test(`blocks path traversal: ${payload.substring(0, 30)}...`, async () => {
        const response = await fetch(`/api/files/${encodeURIComponent(payload)}`);
        expect(response.status).toBe(400); // Bad request

        const body = await response.text();
        expect(body).not.toContain('passwd');
        expect(body).not.toContain('root:');
      });
    });

    test('only allows whitelisted file extensions', async () => {
      const invalidFiles = [
        'report.pdf.exe',
        'data.php',
        'script.sh',
        '.htaccess',
        'web.config'
      ];

      for (const file of invalidFiles) {
        const response = await fetch(`/api/download/${file}`);
        expect(response.status).toBe(400);
      }
    });
  });

  describe('Property-Based Testing with fast-check', () => {
    test('handles arbitrary string inputs without crashing', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (input) => {
            const response = await fetch('/api/customers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: input,
                email: 'test@example.com'
              })
            });

            // Should never crash (500)
            expect(response.status).not.toBe(500);
            expect([200, 400, 422]).toContain(response.status);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('validates numeric boundaries correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float(),
          async (amount) => {
            const response = await fetch('/api/credit-adjustment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount })
            });

            if (amount < 0 || amount > 999999.99 || !isFinite(amount)) {
              expect(response.status).toBe(400);
            } else {
              expect([200, 201]).toContain(response.status);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('email validation with property testing', () => {
      // Generate random strings and test email validation
      fc.assert(
        fc.property(
          fc.string(),
          (str) => {
            const emailSchema = z.string().email();

            try {
              emailSchema.parse(str);
              // If it passes, it should look like an email
              expect(str).toContain('@');
              expect(str).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
            } catch {
              // If it fails, it shouldn't be a valid email format
              const isValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
              expect(isValidFormat).toBe(false);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('Command Injection Prevention', () => {
    test('blocks shell command injection attempts', async () => {
      const commandPayloads = [
        'file.txt; ls -la',
        'file.txt && cat /etc/passwd',
        'file.txt | grep password',
        '`cat /etc/passwd`',
        '$(cat /etc/passwd)',
        'file.txt\ncat /etc/passwd'
      ];

      for (const payload of commandPayloads) {
        const response = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: payload })
        });

        expect(response.status).toBe(400);
        const body = await response.text();
        expect(body).not.toContain('passwd');
      }
    });
  });

  describe('Error Message Security', () => {
    test('does not leak sensitive information in errors', async () => {
      const response = await fetch('/api/customers/invalid-id');
      const body = await response.text();

      // Should not reveal database structure
      expect(body).not.toMatch(/column/i);
      expect(body).not.toMatch(/table/i);
      expect(body).not.toMatch(/database/i);
      expect(body).not.toMatch(/PostgreSQL/i);
      expect(body).not.toMatch(/Prisma/i);

      // Should give generic error
      if (response.status === 404) {
        expect(body).toMatch(/not found/i);
      }
    });
  });

  describe('Performance of Security Checks', () => {
    test('input validation completes quickly', async () => {
      const largeInput = 'a'.repeat(10000);

      const start = performance.now();
      const schema = z.string().max(100);

      try {
        schema.parse(largeInput);
      } catch {
        // Expected to fail
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10); // Should fail fast
    });

    test('DOMPurify sanitization is performant', () => {
      const complexHtml = '<div>' +
        xssPayloads.join('') +
        '</div>'.repeat(100);

      const start = performance.now();
      DOMPurify.sanitize(complexHtml);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50); // 50ms for complex input
    });
  });
});

// Declare fetch for testing (would be your actual implementation)
declare function fetch(url: string, options?: any): Promise<any>;