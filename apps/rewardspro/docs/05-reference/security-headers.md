# Security Headers Configuration for RewardsPro

## Overview

This reference guide provides the complete security headers configuration for the RewardsPro application, optimized for Shopify app embedding while maintaining strong security.

## Required Headers for Shopify Apps

### Content Security Policy (CSP)

```typescript
// app/utils/security-headers.ts
export function getCSPHeader(nonce: string): string {
  return [
    // Default policy
    "default-src 'self'",
    
    // Scripts - Required for Shopify App Bridge
    `script-src 'self' 'nonce-${nonce}' https://cdn.shopify.com https://cdn.jsdelivr.net`,
    
    // Styles - Allow inline for Polaris components
    "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",
    
    // Images - Allow data URIs and external images
    "img-src 'self' data: https: blob:",
    
    // Fonts - Shopify CDN fonts
    "font-src 'self' data: https://cdn.shopify.com",
    
    // Connections - Shopify API and WebSocket
    "connect-src 'self' https://*.myshopify.com wss://*.myshopify.com https://api.shopify.com",
    
    // Frames - Required for Shopify Admin embedding
    "frame-src 'self' https://admin.shopify.com https://*.myshopify.com",
    
    // Frame ancestors - CRITICAL for Shopify embedding
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
    
    // Forms
    "form-action 'self'",
    
    // Base URI
    "base-uri 'self'",
    
    // Object sources
    "object-src 'none'",
    
    // Upgrade insecure requests
    "upgrade-insecure-requests",
    
    // Block mixed content
    "block-all-mixed-content",
    
    // Report URI for violations
    `report-uri /api/csp-report?nonce=${nonce}`
  ].join('; ');
}
```

### Complete Headers Implementation

```typescript
// app/utils/security-headers.ts
import { randomBytes } from 'crypto';

export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

export function getSecurityHeaders(request: Request): HeadersInit {
  const nonce = generateNonce();
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    // Content Security Policy
    'Content-Security-Policy': getCSPHeader(nonce),
    
    // Prevent clickjacking (except from Shopify)
    'X-Frame-Options': 'ALLOW-FROM https://admin.shopify.com',
    
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // XSS Protection (legacy browsers)
    'X-XSS-Protection': '1; mode=block',
    
    // Referrer Policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Permissions Policy (Feature Policy)
    'Permissions-Policy': [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'interest-cohort=()',
      'battery=()',
      'ambient-light-sensor=()',
      'autoplay=(self)',
      'display-capture=()',
      'document-domain=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=(self)',
      'xr-spatial-tracking=()'
    ].join(', '),
    
    // HSTS (HTTP Strict Transport Security)
    'Strict-Transport-Security': isProduction 
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=86400',
    
    // CORS Headers (if needed)
    'Access-Control-Allow-Origin': 'https://admin.shopify.com',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Shopify-Access-Token',
    'Access-Control-Max-Age': '86400',
    
    // Additional Security Headers
    'X-DNS-Prefetch-Control': 'on',
    'X-Permitted-Cross-Domain-Policies': 'none',
    
    // Custom Security Headers
    'X-Request-ID': generateRequestId(),
    'X-Response-Time': Date.now().toString(),
    
    // Cache Control for sensitive pages
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    
    // CORP (Cross-Origin Resource Policy)
    'Cross-Origin-Resource-Policy': 'same-site',
    
    // COEP (Cross-Origin Embedder Policy)
    'Cross-Origin-Embedder-Policy': 'unsafe-none', // Required for Shopify
    
    // COOP (Cross-Origin Opener Policy)
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
  };
}
```

## Remix Route Implementation

```typescript
// app/root.tsx
import { getSecurityHeaders } from '~/utils/security-headers';

export const headers = ({ loaderHeaders }: { loaderHeaders: Headers }) => {
  const headers = new Headers(loaderHeaders);
  const securityHeaders = getSecurityHeaders(request);
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  return headers;
};
```

## Per-Route Header Customization

```typescript
// app/routes/app._index.tsx
export const headers = () => {
  return {
    // Page-specific cache control
    'Cache-Control': 'private, max-age=0, must-revalidate',
    
    // Additional CSP for this route
    'Content-Security-Policy-Report-Only': "script-src 'self' 'unsafe-eval'",
  };
};
```

## Webhook Route Headers

```typescript
// app/routes/webhooks.$.tsx
export const headers = () => {
  return {
    // Webhooks don't need standard browser security headers
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-store',
    
    // But should have API security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
};
```

## CSP Violation Reporting

```typescript
// app/routes/api.csp-report.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';

export async function action({ request }: ActionFunctionArgs) {
  const report = await request.json();
  
  // Log CSP violations
  console.error('CSP Violation:', {
    documentUri: report['document-uri'],
    violatedDirective: report['violated-directive'],
    effectiveDirective: report['effective-directive'],
    originalPolicy: report['original-policy'],
    blockedUri: report['blocked-uri'],
    lineNumber: report['line-number'],
    columnNumber: report['column-number'],
    sourceFile: report['source-file'],
    timestamp: new Date().toISOString()
  });
  
  // Send to monitoring service
  if (process.env.SENTRY_DSN) {
    // Report to Sentry
    Sentry.captureMessage('CSP Violation', {
      level: 'warning',
      extra: report
    });
  }
  
  return json({ received: true });
}
```

## Header Validation Middleware

```typescript
// app/utils/validate-headers.ts
export function validateSecurityHeaders(headers: Headers): boolean {
  const required = [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Strict-Transport-Security'
  ];
  
  const missing = required.filter(header => !headers.get(header));
  
  if (missing.length > 0) {
    console.error('Missing security headers:', missing);
    return false;
  }
  
  // Validate CSP includes frame-ancestors for Shopify
  const csp = headers.get('Content-Security-Policy');
  if (csp && !csp.includes('frame-ancestors')) {
    console.error('CSP missing frame-ancestors directive');
    return false;
  }
  
  return true;
}
```

## Environment-Specific Headers

```typescript
// app/utils/env-headers.ts
export function getEnvironmentHeaders(env: string): HeadersInit {
  switch (env) {
    case 'production':
      return {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'Content-Security-Policy': getStrictCSP(),
        'X-Robots-Tag': 'all'
      };
      
    case 'staging':
      return {
        'Strict-Transport-Security': 'max-age=86400',
        'Content-Security-Policy-Report-Only': getStrictCSP(),
        'X-Robots-Tag': 'noindex, nofollow'
      };
      
    case 'development':
      return {
        'Content-Security-Policy-Report-Only': getDevCSP(),
        'X-Robots-Tag': 'none'
      };
      
    default:
      return {};
  }
}
```

## Testing Security Headers

```typescript
// tests/security-headers.test.ts
import { describe, it, expect } from 'vitest';
import { getSecurityHeaders } from '~/utils/security-headers';

describe('Security Headers', () => {
  it('should include all required headers', () => {
    const headers = getSecurityHeaders(new Request('https://app.rewardspro.com'));
    
    expect(headers['Content-Security-Policy']).toBeDefined();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toContain('ALLOW-FROM');
    expect(headers['Strict-Transport-Security']).toBeDefined();
  });
  
  it('should allow Shopify admin embedding', () => {
    const headers = getSecurityHeaders(new Request('https://app.rewardspro.com'));
    const csp = headers['Content-Security-Policy'];
    
    expect(csp).toContain('frame-ancestors https://admin.shopify.com');
    expect(headers['X-Frame-Options']).toContain('https://admin.shopify.com');
  });
  
  it('should include nonce in CSP', () => {
    const headers = getSecurityHeaders(new Request('https://app.rewardspro.com'));
    const csp = headers['Content-Security-Policy'];
    
    expect(csp).toMatch(/script-src.*'nonce-[\w+/=]+'/);
  });
});
```

## Common Issues and Solutions

### Issue: App Not Loading in Shopify Admin

**Problem**: Strict CSP or X-Frame-Options blocking embedding

**Solution**:
```typescript
// Ensure frame-ancestors includes Shopify domains
"frame-ancestors https://admin.shopify.com https://*.myshopify.com"

// Use ALLOW-FROM for X-Frame-Options
'X-Frame-Options': 'ALLOW-FROM https://admin.shopify.com'
```

### Issue: App Bridge Not Working

**Problem**: CSP blocking Shopify scripts

**Solution**:
```typescript
// Allow Shopify CDN in script-src
"script-src 'self' https://cdn.shopify.com"

// Allow Shopify connections
"connect-src 'self' https://*.myshopify.com wss://*.myshopify.com"
```

### Issue: Styles Not Loading

**Problem**: CSP blocking inline styles from Polaris

**Solution**:
```typescript
// Allow unsafe-inline for styles (required by Polaris)
"style-src 'self' 'unsafe-inline' https://cdn.shopify.com"
```

## Security Header Checklist

- [ ] CSP configured with frame-ancestors for Shopify
- [ ] X-Frame-Options allows Shopify admin
- [ ] X-Content-Type-Options set to nosniff
- [ ] Strict-Transport-Security enabled in production
- [ ] Referrer-Policy configured
- [ ] Permissions-Policy restricts unnecessary features
- [ ] CORS headers configured if needed
- [ ] CSP violation reporting endpoint configured
- [ ] Environment-specific headers implemented
- [ ] Header validation in tests

## Monitoring Headers

```bash
# Check headers with curl
curl -I https://app.rewardspro.com

# Security header scanner
npm run security:headers

# Online tools
# - securityheaders.com
# - observatory.mozilla.org
```

## References

- [MDN Web Docs - Security Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
- [Shopify App Security](https://shopify.dev/apps/auth/security)
- [Content Security Policy](https://content-security-policy.com/)

---

*Last Updated: January 2025 | Security Level: HIGH | Classification: Internal*