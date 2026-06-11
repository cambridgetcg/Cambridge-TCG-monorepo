# Injection Vulnerability Prevention Guide

## Overview

Injection vulnerabilities allow attackers to insert malicious code into your application. This guide provides comprehensive prevention strategies specifically for the RewardsPro Shopify rewards application.

## Types of Injection Attacks

### 1. Cross-Site Scripting (XSS)
- **Stored XSS**: Malicious scripts stored in database
- **Reflected XSS**: Scripts reflected from URL parameters
- **DOM-based XSS**: Client-side script manipulation

### 2. SQL Injection
- Direct SQL manipulation
- Query parameter injection
- Stored procedure attacks

### 3. NoSQL Injection
- MongoDB query manipulation
- GraphQL injection attacks
- JSON injection

### 4. Command Injection
- OS command execution
- Shell injection
- Path traversal

## RewardsPro-Specific Vulnerabilities

### High-Risk Areas

#### Customer Search (`app/routes/app.customers.tsx`)
```typescript
// VULNERABLE - Direct string concatenation
const searchQuery = `email LIKE '%${userInput}%'`;

// SECURE - Using Prisma parameterization
const customers = await db.customer.findMany({
  where: {
    email: { contains: userInput }
  }
});
```

#### Credit Management (`app/routes/app.credit-management.tsx`)
```typescript
// VULNERABLE - Unsanitized HTML in transaction notes
<div dangerouslySetInnerHTML={{ __html: transaction.metadata.note }} />

// SECURE - Sanitized with DOMPurify
import DOMPurify from 'dompurify';

<div dangerouslySetInnerHTML={{ 
  __html: DOMPurify.sanitize(transaction.metadata.note) 
}} />
```

#### Webhook Processing (`app/routes/webhooks.*.tsx`)
```typescript
// VULNERABLE - Trusting webhook data without validation
const orderId = webhookData.order_id;
await processOrder(orderId);

// SECURE - Validate webhook authenticity and data
import crypto from 'crypto';

function validateWebhook(data: string, hmacHeader: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET!)
    .update(data, 'utf8')
    .digest('base64');
  return hash === hmacHeader;
}

// Validate webhook before processing
if (!validateWebhook(rawBody, hmacHeader)) {
  throw new Response('Unauthorized', { status: 401 });
}

// Validate data structure
const schema = z.object({
  order_id: z.string().regex(/^\d+$/),
  // ... other fields
});

const validatedData = schema.parse(webhookData);
```

## Input Validation Implementation

### 1. Install Validation Libraries
```bash
npm install zod dompurify validator
npm install --save-dev @types/dompurify @types/validator
```

### 2. Create Validation Utilities
```typescript
// app/utils/validation.ts
import { z } from 'zod';
import DOMPurify from 'dompurify';
import validator from 'validator';

// Customer validation schema
export const CustomerInputSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email too long')
    .transform(val => validator.normalizeEmail(val) || val),
  
  shopifyCustomerId: z.string()
    .regex(/^\d{13,}$/, 'Invalid Shopify customer ID'),
  
  storeCredit: z.number()
    .min(0, 'Credit cannot be negative')
    .max(999999.99, 'Credit exceeds maximum')
    .transform(val => Math.round(val * 100) / 100), // Round to 2 decimals
});

// Tier validation schema
export const TierInputSchema = z.object({
  name: z.string()
    .min(1, 'Name required')
    .max(50, 'Name too long')
    .regex(/^[a-zA-Z0-9\s\-]+$/, 'Invalid characters in name')
    .transform(val => validator.escape(val)),
  
  minSpend: z.number()
    .int('Must be whole number')
    .min(0, 'Cannot be negative')
    .max(1000000, 'Exceeds maximum'),
  
  cashbackPercent: z.number()
    .min(0, 'Cannot be negative')
    .max(100, 'Cannot exceed 100%'),
  
  evaluationPeriod: z.enum(['ANNUAL', 'LIFETIME']),
});

// Transaction metadata validation
export const TransactionMetadataSchema = z.object({
  note: z.string()
    .max(500, 'Note too long')
    .transform(val => DOMPurify.sanitize(val, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em'],
      ALLOWED_ATTR: []
    })),
  
  reason: z.enum([
    'CASHBACK_EARNED',
    'ORDER_PAYMENT',
    'REFUND_CREDIT',
    'MANUAL_ADJUSTMENT',
    'SHOPIFY_SYNC'
  ]),
  
  orderId: z.string()
    .regex(/^\d+$/, 'Invalid order ID')
    .optional(),
});
```

### 3. Apply Validation in Routes
```typescript
// app/routes/app.tiers.tsx
import { TierInputSchema } from '~/utils/validation';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  try {
    // Validate input
    const validatedData = TierInputSchema.parse({
      name: formData.get('name'),
      minSpend: Number(formData.get('minSpend')),
      cashbackPercent: Number(formData.get('cashbackPercent')),
      evaluationPeriod: formData.get('evaluationPeriod'),
    });
    
    // Safe to use validated data
    await db.tier.create({
      data: {
        id: uuidv4(),
        shop: session.shop,
        ...validatedData,
        createdAt: new Date(),
      }
    });
    
    return json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ 
        success: false, 
        errors: error.errors 
      }, { status: 400 });
    }
    throw error;
  }
};
```

## Content Sanitization

### HTML Sanitization Configuration
```typescript
// app/utils/sanitizer.ts
import DOMPurify from 'dompurify';

export const SanitizationProfiles = {
  // For rich text content (customer notes, descriptions)
  richText: (html: string): string => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'i', 'em', 'u',
        'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote'
      ],
      ALLOWED_ATTR: ['class'],
      ALLOW_DATA_ATTR: false,
      STRIP_DANGEROUS_TAGS: true,
    });
  },
  
  // For plain text only (names, IDs)
  plainText: (text: string): string => {
    return DOMPurify.sanitize(text, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  },
  
  // For URLs
  url: (url: string): string => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '';
      }
      return parsed.toString();
    } catch {
      return '';
    }
  },
};
```

## Content Security Policy Implementation

### Configure CSP Headers
```typescript
// app/utils/security-headers.ts
export function getSecurityHeaders(nonce: string): HeadersInit {
  return {
    'Content-Security-Policy': [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}' https://cdn.shopify.com`,
      `style-src 'self' 'unsafe-inline' https://cdn.shopify.com`,
      `img-src 'self' data: https: blob:`,
      `font-src 'self' data: https://cdn.shopify.com`,
      `connect-src 'self' https://*.myshopify.com wss://*.myshopify.com`,
      `frame-src 'self' https://*.myshopify.com`,
      `frame-ancestors https://*.myshopify.com https://admin.shopify.com`,
      `form-action 'self'`,
      `base-uri 'self'`,
      `object-src 'none'`,
      `upgrade-insecure-requests`,
    ].join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

// app/root.tsx
import { getSecurityHeaders } from '~/utils/security-headers';
import crypto from 'crypto';

export const headers: HeadersFunction = () => {
  const nonce = crypto.randomBytes(16).toString('base64');
  return getSecurityHeaders(nonce);
};
```

## Database Security

### Prisma Query Security
```typescript
// NEVER use raw queries with string concatenation
// BAD - SQL Injection vulnerability
const result = await db.$queryRaw`
  SELECT * FROM Customer 
  WHERE email = ${userInput}
`;

// GOOD - Parameterized query
const result = await db.customer.findMany({
  where: {
    email: userInput
  }
});

// If raw query is necessary, use Prisma.sql
import { Prisma } from '@prisma/client';

const query = Prisma.sql`
  SELECT * FROM Customer 
  WHERE email = ${userInput}
  AND shop = ${session.shop}
`;
const result = await db.$queryRaw(query);
```

### AWS Data API Security
```typescript
// app/utils/aurora-data-api.ts
import { DataAPIClient } from '@aws-sdk/client-rds-data';

// Use parameterized statements
const statement = `
  SELECT * FROM Customer 
  WHERE email = :email 
  AND shop = :shop
`;

const params = {
  resourceArn: process.env.AURORA_RESOURCE_ARN!,
  secretArn: process.env.AURORA_SECRET_ARN!,
  database: process.env.AURORA_DATABASE_NAME!,
  sql: statement,
  parameters: [
    { name: 'email', value: { stringValue: email } },
    { name: 'shop', value: { stringValue: shop } },
  ],
};

const result = await client.executeStatement(params);
```

## GraphQL Security

### Query Depth Limiting
```typescript
// app/utils/graphql-security.ts
import depthLimit from 'graphql-depth-limit';

export const graphqlSecurityRules = {
  depthLimit: depthLimit(5),
  costLimit: 1000,
  rateLimit: {
    window: '1m',
    max: 100,
  },
};
```

### Input Validation for GraphQL
```typescript
// app/api/graphql/resolvers.ts
const resolvers = {
  Query: {
    customer: async (_, { id }, context) => {
      // Validate ID format
      const customerIdSchema = z.string().regex(/^gid:\/\/shopify\/Customer\/\d+$/);
      
      try {
        const validatedId = customerIdSchema.parse(id);
        return await fetchCustomer(validatedId);
      } catch (error) {
        throw new GraphQLError('Invalid customer ID format');
      }
    },
  },
  
  Mutation: {
    updateCredit: async (_, { customerId, amount }, context) => {
      // Validate inputs
      const schema = z.object({
        customerId: z.string().regex(/^\d{13,}$/),
        amount: z.number().min(0).max(10000),
      });
      
      const validated = schema.parse({ customerId, amount });
      return await updateCustomerCredit(validated);
    },
  },
};
```

## React Component Security

### Safe Component Patterns
```typescript
// app/components/SecureContent.tsx
import { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface SecureContentProps {
  content: string;
  allowedTags?: string[];
}

export function SecureContent({ 
  content, 
  allowedTags = ['p', 'br', 'strong', 'em'] 
}: SecureContentProps) {
  const sanitizedContent = useMemo(() => {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: [],
    });
  }, [content, allowedTags]);
  
  if (!sanitizedContent) {
    return null;
  }
  
  return (
    <div 
      className="secure-content"
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
```

### Form Security
```typescript
// app/components/SecureForm.tsx
import { z } from 'zod';
import { useState } from 'react';

export function SecureCreditForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const schema = z.object({
    amount: z.string()
      .regex(/^\d+\.?\d{0,2}$/, 'Invalid amount format')
      .transform(val => parseFloat(val))
      .refine(val => val > 0 && val <= 10000, 'Amount must be between 0 and 10000'),
    
    reason: z.string()
      .min(1, 'Reason required')
      .max(200, 'Reason too long')
      .transform(val => DOMPurify.sanitize(val)),
  });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    
    try {
      const validated = schema.parse({
        amount: formData.get('amount'),
        reason: formData.get('reason'),
      });
      
      // Add CSRF token
      const csrfToken = document.querySelector<HTMLMetaElement>(
        'meta[name="csrf-token"]'
      )?.content;
      
      if (!csrfToken) {
        throw new Error('CSRF token missing');
      }
      
      // Submit validated data
      await submitCredit({ ...validated, _csrf: csrfToken });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

## Security Testing Examples

### Unit Tests for Injection Prevention
```typescript
// app/utils/__tests__/validation.test.ts
import { CustomerInputSchema } from '../validation';

describe('Input Validation Security', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '"><script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    'javascript:alert("XSS")',
    '<svg onload=alert("XSS")>',
  ];
  
  test.each(xssPayloads)('should reject XSS payload: %s', (payload) => {
    const result = CustomerInputSchema.safeParse({
      email: payload,
      shopifyCustomerId: '12345678901234',
      storeCredit: 100,
    });
    
    expect(result.success).toBe(false);
  });
  
  test('should sanitize valid but dangerous input', () => {
    const input = {
      email: 'test@example.com',
      shopifyCustomerId: '12345678901234',
      storeCredit: 100.999, // Should round to 100.99
    };
    
    const result = CustomerInputSchema.parse(input);
    expect(result.storeCredit).toBe(101.00);
    expect(result.email).toBe('test@example.com');
  });
});
```

## Security Checklist

### Code Review Checklist
- [ ] All user inputs validated with Zod schemas
- [ ] HTML content sanitized with DOMPurify
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] Database queries use parameterization
- [ ] GraphQL queries have depth limits
- [ ] CSP headers configured
- [ ] CSRF tokens on state-changing operations
- [ ] Error messages don't leak sensitive info
- [ ] No hardcoded secrets or API keys
- [ ] Dependencies scanned for vulnerabilities

### Testing Checklist
- [ ] XSS payloads tested
- [ ] SQL injection attempts blocked
- [ ] GraphQL query limits enforced
- [ ] CSP violations logged
- [ ] Input validation boundaries tested
- [ ] Error handling doesn't expose stack traces
- [ ] Rate limiting functional
- [ ] Authentication bypass attempts failed
- [ ] CSRF protection verified
- [ ] Security headers present

## Quick Reference

### Common XSS Payloads to Test
```javascript
const testPayloads = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
  '<iframe src=javascript:alert(1)>',
  '<body onload=alert(1)>',
  '<input onfocus=alert(1) autofocus>',
  '<select onfocus=alert(1) autofocus>',
  '<textarea onfocus=alert(1) autofocus>',
  '<keygen onfocus=alert(1) autofocus>',
  '<video><source onerror=alert(1)>',
  '<audio src=x onerror=alert(1)>',
  '<marquee onstart=alert(1)>',
  '<meter onmouseover=alert(1)>1</meter>',
];
```

### SQL Injection Test Patterns
```sql
-- Common SQL injection attempts
' OR '1'='1
'; DROP TABLE users; --
' UNION SELECT * FROM passwords --
admin'--
' OR 1=1--
1' AND '1' = '1
```

## Next Steps

1. Implement validation schemas for all inputs
2. Add DOMPurify to package.json
3. Configure CSP headers in root.tsx
4. Create security test suite
5. Set up SAST tools in CI/CD
6. Review all database queries
7. Audit `dangerouslySetInnerHTML` usage
8. Enable TypeScript strict mode

---

*Last Updated: January 2025 | Priority: CRITICAL | Owner: Security Team*