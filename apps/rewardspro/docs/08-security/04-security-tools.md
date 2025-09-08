# Security Tools Configuration Guide for RewardsPro

## Overview

This guide provides detailed configuration and implementation instructions for security tools used in the RewardsPro application, including SAST, DAST, dependency scanning, and runtime protection tools.

## Tool Categories

```
┌─────────────────────────────────────────────────┐
│              Runtime Protection                 │
│         (CSP, Rate Limiting, WAF)              │
├─────────────────────────────────────────────────┤
│           Dynamic Testing (DAST)                │
│      (OWASP ZAP, Burp Suite, Playwright)       │
├─────────────────────────────────────────────────┤
│            Static Analysis (SAST)               │
│    (ESLint, Semgrep, CodeQL, TypeScript)       │
├─────────────────────────────────────────────────┤
│           Dependency Scanning                   │
│      (npm audit, Snyk, OWASP DC)              │
└─────────────────────────────────────────────────┘
```

## 1. Static Analysis (SAST) Tools

### ESLint Security Plugin

```json
// .eslintrc.security.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:security/recommended"
  ],
  "plugins": [
    "security",
    "no-secrets"
  ],
  "rules": {
    // Security rules
    "security/detect-non-literal-fs-filename": "error",
    "security/detect-non-literal-require": "error",
    "security/detect-object-injection": "warn",
    "security/detect-possible-timing-attacks": "warn",
    "security/detect-unsafe-regex": "error",
    "security/detect-buffer-noassert": "error",
    "security/detect-child-process": "error",
    "security/detect-disable-mustache-escape": "error",
    "security/detect-eval-with-expression": "error",
    "security/detect-no-csrf-before-method-override": "error",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-pseudoRandomBytes": "error",
    
    // No secrets in code
    "no-secrets/no-secrets": ["error", {
      "tolerance": 4.5,
      "additionalRegexes": {
        "Shopify API Key": "shppa_[a-fA-F0-9]{32}",
        "Shopify Access Token": "shpat_[a-fA-F0-9]{32}",
        "AWS Access Key": "AKIA[0-9A-Z]{16}",
        "AWS Secret Key": "[0-9a-zA-Z/+=]{40}"
      }
    }],
    
    // React specific security
    "react/no-danger": "error",
    "react/no-danger-with-children": "error",
    "react/jsx-no-script-url": "error",
    "react/jsx-no-target-blank": ["error", {
      "allowReferrer": false,
      "enforceDynamicLinks": "always"
    }]
  }
}
```

### Semgrep Configuration

```yaml
# .semgrep.yml
rules:
  - id: rewardspro-sql-injection
    pattern-either:
      - pattern: |
          $DB.executeStatement({
            ...,
            sql: `... ${$USER_INPUT} ...`,
            ...
          })
      - pattern: |
          $DB.query(`... ${$USER_INPUT} ...`)
    message: Potential SQL injection vulnerability
    severity: ERROR
    languages: [typescript]

  - id: rewardspro-store-credit-manipulation
    pattern: |
      $CREDIT = $USER_INPUT
    message: Direct assignment of user input to store credit
    severity: ERROR
    languages: [typescript]
    paths:
      include:
        - app/routes/*.tsx
        - app/utils/*.ts

  - id: rewardspro-unsafe-shopify-webhook
    pattern: |
      const $BODY = request.body
      ...
      !$HMAC_VERIFY
    message: Webhook processed without HMAC verification
    severity: ERROR
    languages: [typescript]
    paths:
      include:
        - app/routes/webhooks.*.tsx

  - id: rewardspro-missing-auth-check
    pattern: |
      export const loader = async ({ request }) => {
        ...
        !authenticate
        ...
      }
    message: Loader missing authentication check
    severity: ERROR
    languages: [typescript]
    paths:
      include:
        - app/routes/app.*.tsx
```

### TypeScript Strict Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    // Strict type checking
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    
    // Additional checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    
    // Security related
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "exactOptionalPropertyTypes": true
  }
}
```

### GitHub CodeQL

```yaml
# .github/codeql/codeql-config.yml
name: "RewardsPro Security Analysis"

queries:
  - uses: security-extended
  - uses: security-and-quality

query-filters:
  - include:
      id: js/sql-injection
  - include:
      id: js/xss
  - include:
      id: js/nosql-injection
  - include:
      id: js/code-injection
  - include:
      id: js/path-injection

paths:
  - app
  - prisma
  
paths-ignore:
  - node_modules
  - public
  - tests
```

## 2. Dynamic Analysis (DAST) Tools

### OWASP ZAP Configuration

```yaml
# .zap/zap-config.yml
env:
  contexts:
    - name: RewardsPro
      urls:
        - https://staging.rewardspro.app
      includePaths:
        - https://staging.rewardspro.app/app.*
        - https://staging.rewardspro.app/api.*
      excludePaths:
        - https://staging.rewardspro.app/static.*
        - https://staging.rewardspro.app/health
      
      authentication:
        method: oauth
        parameters:
          loginUrl: https://staging.rewardspro.app/auth/login
          tokenUrl: https://admin.shopify.com/oauth/authorize
      
      users:
        - name: test-merchant
          credentials:
            shop: test-store.myshopify.com
            apiKey: ${SHOPIFY_TEST_API_KEY}
            apiSecret: ${SHOPIFY_TEST_API_SECRET}

  policies:
    - name: RewardsPro-Policy
      scanner:
        maxDepth: 10
        maxChildren: 20
        maxDuration: 60
      
      rules:
        - id: 10012 # Anti-CSRF Tokens
          threshold: LOW
        - id: 10015 # SQLi
          threshold: LOW
        - id: 40012 # XSS
          threshold: LOW
        - id: 90022 # GraphQL
          threshold: MEDIUM

  scripts:
    - name: store-credit-manipulation
      file: scripts/store-credit-fuzzing.js
    - name: tier-escalation
      file: scripts/tier-manipulation.js
```

### ZAP Automation Script

```javascript
// .zap/scripts/store-credit-fuzzing.js
function scanNode(as, msg) {
  // Test store credit manipulation
  const creditEndpoints = [
    '/app/customers/credit/update',
    '/api/credit/add',
    '/webhooks/orders/paid'
  ];
  
  creditEndpoints.forEach(endpoint => {
    // Test negative values
    testPayload(msg, endpoint, { credit: -1000000 });
    
    // Test overflow
    testPayload(msg, endpoint, { credit: Number.MAX_SAFE_INTEGER + 1 });
    
    // Test precision manipulation
    testPayload(msg, endpoint, { credit: "10.999999999" });
    
    // Test type confusion
    testPayload(msg, endpoint, { credit: { "$gt": 0 } });
  });
}

function testPayload(msg, endpoint, payload) {
  const newMsg = msg.cloneRequest();
  newMsg.setRequestHeader("Content-Type", "application/json");
  newMsg.setRequestBody(JSON.stringify(payload));
  newMsg.getRequestHeader().setURI(
    new org.apache.commons.httpclient.URI(endpoint, true)
  );
  
  as.sendAndReceive(newMsg);
  
  // Check for successful manipulation
  if (newMsg.getResponseHeader().getStatusCode() === 200) {
    as.raiseAlert(
      8, // Confidence: High
      3, // Risk: High
      "Store Credit Manipulation",
      "Successfully manipulated store credit with payload: " + JSON.stringify(payload),
      endpoint,
      "credit",
      "Validate and sanitize all credit inputs",
      "Reference: OWASP Business Logic",
      "",
      msg
    );
  }
}
```

### Burp Suite Configuration

```json
// burp-config.json
{
  "project_options": {
    "connections": {
      "hostname_resolution": [
        {
          "hostname": "*.rewardspro.app",
          "ip_address": "staging-ip"
        }
      ]
    },
    "http": {
      "redirections": {
        "follow_redirections": true,
        "follow_in_scope_only": true
      }
    },
    "sessions": {
      "session_handling_rules": [
        {
          "description": "Shopify OAuth Session",
          "enabled": true,
          "actions": [
            {
              "type": "check_session_validity",
              "session_validity_regex": "authenticated\":true"
            },
            {
              "type": "establish_session",
              "url": "https://staging.rewardspro.app/auth/login"
            }
          ]
        }
      ]
    }
  },
  "scanner": {
    "audit_optimization": {
      "consolidate_passive_issues": true,
      "follow_redirections": true,
      "skip_ineffective_checks": true
    },
    "scan_accuracy": "normal",
    "scan_speed": "fast"
  }
}
```

## 3. Dependency Scanning Tools

### npm audit Configuration

```json
// package.json
{
  "scripts": {
    "security:audit": "npm audit --production --audit-level=moderate",
    "security:audit:fix": "npm audit fix --force",
    "security:audit:ci": "npm audit --production --audit-level=moderate --json > audit-report.json"
  },
  "overrides": {
    // Fix specific vulnerabilities
    "lodash": "^4.17.21",
    "minimist": "^1.2.8",
    "node-fetch": "^3.3.2"
  }
}
```

### Snyk Configuration

```yaml
# .snyk
version: v1.0.0
ignore:
  # Ignore specific vulnerabilities with justification
  SNYK-JS-LODASH-567746:
    - lodash:
        reason: Used only in build process, not production
        expires: '2025-12-31T23:59:59.999Z'
        
patch:
  # Auto-patch vulnerabilities
  'npm:lodash:20180130':
    - lodash:
        patched: '2025-01-01T00:00:00.000Z'

# Custom rules
rules:
  - id: rewardspro-dependency-check
    description: Check for RewardsPro-specific vulnerable patterns
    severity: high
    cwe: [CWE-1104]
    
language-settings:
  javascript:
    enableLinters: true
    projectType: application
```

### OWASP Dependency Check

```xml
<!-- dependency-check-suppression.xml -->
<suppressions>
  <suppress>
    <notes>False positive in dev dependency</notes>
    <packageUrl regex="true">^pkg:npm/.*eslint.*$</packageUrl>
    <cpe>cpe:/a:eslint:eslint</cpe>
  </suppress>
  
  <suppress>
    <notes>Used only in test environment</notes>
    <packageUrl regex="true">^pkg:npm/.*jest.*$</packageUrl>
    <vulnerabilityName regex="true">.*</vulnerabilityName>
  </suppress>
</suppressions>
```

## 4. Runtime Protection Tools

### Content Security Policy (CSP)

```typescript
// app/utils/security-headers.ts
export function getSecurityHeaders(): HeadersInit {
  const nonce = generateNonce();
  
  return {
    // CSP Header
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://cdn.shopify.com`,
      "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://cdn.shopify.com",
      "connect-src 'self' https://*.myshopify.com wss://*.myshopify.com",
      "frame-src 'self' https://admin.shopify.com",
      "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
      "block-all-mixed-content",
      `report-uri /api/csp-report?nonce=${nonce}`
    ].join('; '),
    
    // Additional Security Headers
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
  };
}
```

### Rate Limiting

```typescript
// app/utils/rate-limiter.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Different limiters for different endpoints
export const rateLimiters = {
  // API endpoints
  api: new RateLimiterMemory({
    points: 100, // requests
    duration: 60, // per minute
    blockDuration: 60 * 5, // block for 5 minutes
  }),
  
  // Authentication endpoints
  auth: new RateLimiterMemory({
    points: 5,
    duration: 60 * 15, // per 15 minutes
    blockDuration: 60 * 60, // block for 1 hour
  }),
  
  // Credit operations
  credit: new RateLimiterMemory({
    points: 10,
    duration: 60,
    blockDuration: 60 * 10,
  }),
  
  // Webhook endpoints
  webhook: new RateLimiterMemory({
    points: 1000,
    duration: 60,
    blockDuration: 60,
  })
};

// Middleware
export async function rateLimitMiddleware(
  request: Request,
  limiterKey: keyof typeof rateLimiters
) {
  const ip = getClientIp(request);
  const limiter = rateLimiters[limiterKey];
  
  try {
    await limiter.consume(ip);
  } catch (rejRes) {
    throw new Response('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': String(Math.round(rejRes.msBeforeNext / 1000)),
        'X-RateLimit-Limit': String(limiter.points),
        'X-RateLimit-Remaining': String(rejRes.remainingPoints),
        'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString(),
      }
    });
  }
}
```

### Web Application Firewall (WAF) Rules

```typescript
// app/utils/waf-rules.ts
export const wafRules = {
  // SQL Injection patterns
  sqlInjection: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE)\b)/gi,
    /(['"]?\s*;\s*-{2})/gi,
    /(\bOR\b\s*['"]?\s*[0-9]+\s*=\s*[0-9]+)/gi,
  ],
  
  // XSS patterns
  xss: [
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
  ],
  
  // Path traversal patterns
  pathTraversal: [
    /\.\.[\/\\]/g,
    /%2e%2e[%2f%5c]/gi,
    /\.\.;/g,
  ],
  
  // Command injection patterns
  commandInjection: [
    /[;&|`$()]/g,
    /\$\{.*\}/g,
  ]
};

export function checkWafRules(input: string): boolean {
  for (const [category, patterns] of Object.entries(wafRules)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        console.error(`WAF: Blocked ${category} attempt`);
        return false;
      }
    }
  }
  return true;
}
```

## 5. Security Monitoring Tools

### Sentry Security Configuration

```typescript
// app/entry.client.tsx
import * as Sentry from "@sentry/remix";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  
  // Security-specific configuration
  beforeSend(event, hint) {
    // Sanitize sensitive data
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers?.authorization;
      delete event.request.headers?.['x-shopify-access-token'];
    }
    
    // Filter security events
    if (event.tags?.security) {
      // Send security events to separate project
      event.dsn = process.env.SENTRY_SECURITY_DSN;
    }
    
    return event;
  },
  
  // Track security-relevant transactions
  tracesSampler(samplingContext) {
    // Always trace security-critical operations
    if (samplingContext.transactionContext.name?.includes('credit')) {
      return 1.0;
    }
    if (samplingContext.transactionContext.name?.includes('auth')) {
      return 1.0;
    }
    // Regular sampling for other operations
    return 0.1;
  },
  
  // Security integrations
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.LinkedErrors(),
  ],
});
```

### Security Event Logging

```typescript
// app/utils/security-logger.ts
import winston from 'winston';

export const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'rewardspro-security' },
  transports: [
    // Security events file
    new winston.transports.File({ 
      filename: 'security.log',
      level: 'warning'
    }),
    
    // Critical security alerts
    new winston.transports.File({ 
      filename: 'security-critical.log',
      level: 'error'
    }),
    
    // Audit log
    new winston.transports.File({ 
      filename: 'audit.log',
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
});

// Log security events
export function logSecurityEvent(
  type: 'AUTH_FAILURE' | 'INJECTION_ATTEMPT' | 'RATE_LIMIT' | 'CREDIT_ANOMALY',
  details: Record<string, any>
) {
  securityLogger.warn({
    type,
    timestamp: new Date().toISOString(),
    ...details
  });
  
  // Alert on critical events
  if (type === 'INJECTION_ATTEMPT' || type === 'CREDIT_ANOMALY') {
    alertSecurityTeam(type, details);
  }
}
```

## 6. CI/CD Security Integration

### GitHub Actions Security Workflow

```yaml
# .github/workflows/security.yml
name: Security Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *' # Daily security scan

jobs:
  security-scan:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      # Secret scanning
      - name: TruffleHog OSS
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          
      # SAST
      - name: ESLint Security
        run: |
          npm ci
          npm run lint:security
          
      - name: Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: .semgrep.yml
          
      # Dependency scanning
      - name: npm audit
        run: npm audit --production --audit-level=moderate
        
      - name: Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          
      # Container scanning (if using Docker)
      - name: Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'rewardspro:latest'
          format: 'sarif'
          output: 'trivy-results.sarif'
          
      # Upload results
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
```

## 7. Tool Integration Matrix

| Tool | Purpose | Integration Point | Frequency |
|------|---------|------------------|-----------|
| ESLint | Code quality & security | Pre-commit, CI | Every commit |
| TypeScript | Type safety | Build process | Every build |
| Semgrep | Custom security rules | CI/CD | Every PR |
| CodeQL | Advanced analysis | GitHub Actions | Daily |
| npm audit | Dependency vulnerabilities | CI/CD | Every build |
| Snyk | Comprehensive scanning | CI/CD, IDE | Real-time |
| OWASP ZAP | Dynamic testing | Staging deploy | Weekly |
| Burp Suite | Manual testing | Pre-release | Monthly |
| Sentry | Runtime monitoring | Production | Continuous |
| WAF | Attack prevention | Edge/CDN | Real-time |

## 8. Security Tool Commands

```bash
# Quick security check
npm run security:check

# Full security scan
npm run security:full

# Fix vulnerabilities
npm run security:fix

# Generate security report
npm run security:report

# Run specific tool
npm run security:eslint
npm run security:semgrep
npm run security:audit
npm run security:snyk
```

---

*Last Updated: January 2025 | Security Level: HIGH | Classification: Internal*