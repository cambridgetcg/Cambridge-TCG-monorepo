# Comprehensive Security Implementation Guide for RewardsPro

## Overview
This guide provides practical, production-ready security implementations for RewardsPro, a React TypeScript Shopify app with AWS Aurora and Vercel deployment.

## 1. Input Validation & Sanitization

### Zod Schema Implementation
```typescript
// app/utils/validation.ts
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

// Customer input validation
export const customerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().min(1).max(100).transform(val => 
    DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })
  ),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  creditAmount: z.number().min(0).max(999999.99),
  tierId: z.string().uuid()
});

// Order webhook validation
export const orderWebhookSchema = z.object({
  id: z.number(),
  customer: z.object({
    id: z.number(),
    email: z.string().email()
  }),
  total_price: z.string().transform(val => parseFloat(val)),
  currency: z.enum(['USD', 'EUR', 'GBP', /* ... other currencies */])
});

// GraphQL query validation
export const graphqlQuerySchema = z.object({
  query: z.string().max(10000),
  variables: z.record(z.unknown()).optional()
}).refine(
  (data) => !data.query.includes('__schema'),
  { message: 'Introspection queries not allowed' }
);
```

### Route Implementation
```typescript
// app/routes/app.customers.tsx
import { customerSchema } from '~/utils/validation';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  try {
    const validated = customerSchema.parse({
      email: formData.get('email'),
      name: formData.get('name'),
      creditAmount: parseFloat(formData.get('creditAmount') as string)
    });
    
    // Safe to use validated data
    await db.customer.create({
      data: {
        ...validated,
        shop: session.shop // Always scope to shop
      }
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ errors: error.flatten() }, { status: 400 });
    }
    throw error;
  }
};
```

## 2. SQL Injection Prevention

### Parameterized Queries with Prisma
```typescript
// app/utils/database-queries.ts
import { db } from '~/db.server';

// NEVER do string concatenation
// BAD: `WHERE email = '${userInput}'`

// GOOD: Use Prisma's parameterized queries
export async function findCustomersByEmail(shop: string, email: string) {
  return db.customer.findMany({
    where: {
      shop, // Always include shop scope
      email: {
        contains: email,
        mode: 'insensitive'
      }
    }
  });
}

// For raw queries (avoid when possible)
export async function getCustomerCredits(shop: string, customerId: string) {
  return db.$queryRaw`
    SELECT 
      c.id,
      c.email,
      COALESCE(SUM(scl.amount), 0) as total_credit
    FROM customers c
    LEFT JOIN store_credit_ledger scl ON c.id = scl.customer_id
    WHERE c.shop = ${shop} 
      AND c.id = ${customerId}
    GROUP BY c.id, c.email
  `;
}
```

## 3. XSS Prevention

### React Component Security
```typescript
// app/components/CustomerDisplay.tsx
import { Text, Card } from '@shopify/polaris';
import DOMPurify from 'isomorphic-dompurify';

interface CustomerDisplayProps {
  customer: {
    name: string;
    email: string;
    notes?: string;
  };
}

export function CustomerDisplay({ customer }: CustomerDisplayProps) {
  // Never use dangerouslySetInnerHTML with user data
  // BAD: <div dangerouslySetInnerHTML={{ __html: customer.notes }} />
  
  // GOOD: Sanitize if HTML is needed
  const sanitizedNotes = customer.notes 
    ? DOMPurify.sanitize(customer.notes, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
        ALLOWED_ATTR: []
      })
    : '';
  
  return (
    <Card>
      <Text as="h2">{customer.name}</Text>
      <Text as="p">{customer.email}</Text>
      {customer.notes && (
        <div dangerouslySetInnerHTML={{ __html: sanitizedNotes }} />
      )}
    </Card>
  );
}
```

## 4. CSRF Protection

### Form Implementation
```typescript
// app/utils/csrf.ts
import crypto from 'crypto';

export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateCSRFToken(token: string, sessionToken: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(sessionToken)
  );
}

// app/routes/app.settings.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const csrfToken = generateCSRFToken();
  
  // Store in session
  await sessionStorage.set(session.id, { ...session, csrfToken });
  
  return json({ csrfToken });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const csrfToken = formData.get('csrfToken');
  
  if (!validateCSRFToken(csrfToken as string, session.csrfToken)) {
    throw new Response('Invalid CSRF token', { status: 403 });
  }
  
  // Process form safely
};
```

## 5. Authentication & Session Management

### Shopify Session Token Verification
```typescript
// app/utils/auth/session-token.ts
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export class SessionTokenValidator {
  private readonly secret: string;
  
  constructor(secret: string) {
    this.secret = secret;
  }
  
  async verifyToken(token: string): Promise<SessionTokenPayload> {
    // Decode without verification first to check algorithm
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded || decoded.header.alg !== 'HS256') {
      throw new Error('Invalid token algorithm');
    }
    
    // Verify with correct algorithm
    const payload = jwt.verify(token, this.secret, {
      algorithms: ['HS256'],
      complete: false
    }) as SessionTokenPayload;
    
    // Validate all required claims
    this.validateClaims(payload);
    
    return payload;
  }
  
  private validateClaims(payload: SessionTokenPayload): void {
    const now = Math.floor(Date.now() / 1000);
    
    // Check expiration (1 minute for Shopify session tokens)
    if (!payload.exp || payload.exp < now) {
      throw new Error('Token expired');
    }
    
    // Check not before
    if (!payload.nbf || payload.nbf > now) {
      throw new Error('Token not yet valid');
    }
    
    // Validate issuer format
    if (!payload.iss || !payload.iss.match(/^https:\/\/[a-z0-9-]+\.myshopify\.com\/admin$/)) {
      throw new Error('Invalid issuer');
    }
    
    // Validate destination
    if (!payload.dest || !payload.dest.startsWith('https://')) {
      throw new Error('Invalid destination');
    }
    
    // Validate audience
    if (!payload.aud || payload.aud !== process.env.SHOPIFY_API_KEY) {
      throw new Error('Invalid audience');
    }
  }
}
```

## 6. Secure Headers Implementation

### CSP with Nonces
```typescript
// app/utils/security-headers.ts
import crypto from 'crypto';

export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

export function getSecurityHeaders(nonce: string): HeadersInit {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    'Content-Security-Policy': [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}' https://cdn.shopify.com`,
      `style-src 'self' 'unsafe-inline' https://cdn.shopify.com`,
      `img-src 'self' data: https: blob:`,
      `font-src 'self' https://cdn.shopify.com`,
      `connect-src 'self' https://*.myshopify.com`,
      `frame-ancestors https://*.myshopify.com https://admin.shopify.com`,
      `frame-src https://*.myshopify.com`,
      `child-src 'self' https://*.myshopify.com`,
      `form-action 'self'`,
      `base-uri 'self'`,
      `object-src 'none'`,
      `upgrade-insecure-requests`,
      isDevelopment && `'unsafe-eval'` // Only in dev
    ].filter(Boolean).join('; '),
    
    'X-Frame-Options': 'ALLOWFROM https://admin.shopify.com',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
    
    // HSTS (only in production)
    ...(!isDevelopment && {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    })
  };
}

// app/root.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const nonce = generateNonce();
  
  return json(
    { nonce },
    { headers: getSecurityHeaders(nonce) }
  );
};
```

## 7. Rate Limiting

### Implementation with Redis
```typescript
// app/utils/rate-limiter.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export const rateLimiters = {
  // API rate limiter
  api: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:api',
    points: 100, // requests
    duration: 60, // per minute
    blockDuration: 60 // block for 1 minute
  }),
  
  // Auth rate limiter (stricter)
  auth: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:auth',
    points: 5,
    duration: 900, // 15 minutes
    blockDuration: 900
  }),
  
  // Webhook rate limiter
  webhook: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:webhook',
    points: 1000,
    duration: 60,
    blockDuration: 10
  })
};

// Middleware
export async function rateLimitMiddleware(
  request: Request,
  limiter: keyof typeof rateLimiters
) {
  const ip = getClientIp(request);
  const key = `${ip}:${request.url}`;
  
  try {
    await rateLimiters[limiter].consume(key);
  } catch (rejRes) {
    throw new Response('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': String(rejRes.msBeforeNext / 1000),
        'X-RateLimit-Limit': String(rejRes.points),
        'X-RateLimit-Remaining': String(rejRes.remainingPoints),
        'X-RateLimit-Reset': String(rejRes.resetTime)
      }
    });
  }
}
```

## 8. File Upload Security

```typescript
// app/utils/file-upload.ts
import { z } from 'zod';
import crypto from 'crypto';
import sharp from 'sharp';

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

const fileUploadSchema = z.object({
  size: z.number().max(5 * 1024 * 1024), // 5MB max
  type: z.enum(allowedMimeTypes as [string, ...string[]])
});

export async function processFileUpload(file: File): Promise<ProcessedFile> {
  // Validate file
  fileUploadSchema.parse({
    size: file.size,
    type: file.type
  });
  
  // Generate safe filename
  const ext = file.name.split('.').pop()?.toLowerCase();
  const safeFilename = `${crypto.randomUUID()}.${ext}`;
  
  // Process image (resize, strip metadata)
  const buffer = Buffer.from(await file.arrayBuffer());
  const processed = await sharp(buffer)
    .resize(1200, 1200, { 
      fit: 'inside',
      withoutEnlargement: true 
    })
    .rotate() // Auto-rotate based on EXIF
    .removeMetadata() // Strip all metadata
    .toBuffer();
  
  // Scan for malware (integrate with service)
  await scanForMalware(processed);
  
  return {
    buffer: processed,
    filename: safeFilename,
    mimeType: file.type
  };
}
```

## 9. API Security

### GraphQL Security
```typescript
// app/utils/graphql-security.ts
import depthLimit from 'graphql-depth-limit';
import costAnalysis from 'graphql-cost-analysis';

export const graphqlSecurityRules = [
  depthLimit(5), // Max query depth
  costAnalysis({
    maximumCost: 1000,
    defaultCost: 1,
    scalarCost: 1,
    objectCost: 2,
    listFactor: 10,
    introspectionCost: 1000,
    enforceIntrospectionCost: false
  })
];

// Disable introspection in production
export const graphqlConfig = {
  introspection: process.env.NODE_ENV === 'development',
  playground: process.env.NODE_ENV === 'development',
  validationRules: graphqlSecurityRules
};
```

## 10. Error Handling

```typescript
// app/utils/error-handler.ts
export class SecurityError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

export function sanitizeError(error: unknown): {
  message: string;
  statusCode: number;
} {
  // Never expose stack traces in production
  if (process.env.NODE_ENV === 'production') {
    if (error instanceof SecurityError) {
      return {
        message: 'A security error occurred',
        statusCode: error.statusCode
      };
    }
    
    return {
      message: 'An unexpected error occurred',
      statusCode: 500
    };
  }
  
  // Development: return full error
  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode: error instanceof SecurityError ? error.statusCode : 500
    };
  }
  
  return {
    message: 'Unknown error',
    statusCode: 500
  };
}

// app/entry.server.tsx
export function handleError(
  error: unknown,
  { request }: DataFunctionArgs
): void {
  // Log full error server-side
  console.error('Application error:', error);
  
  // Log security events
  if (error instanceof SecurityError) {
    logSecurityEvent({
      type: 'SECURITY_ERROR',
      code: error.code,
      url: request.url,
      timestamp: new Date()
    });
  }
}
```

## 11. Cryptography

### Encryption Implementation
```typescript
// app/utils/encryption.ts
import crypto from 'crypto';

export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;
  private readonly saltLength = 64;
  private readonly iterations = 100000;
  
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, this.iterations, this.keyLength, 'sha256');
  }
  
  encrypt(text: string, password: string): string {
    const salt = crypto.randomBytes(this.saltLength);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(this.ivLength);
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      encrypted
    ]);
    
    return combined.toString('base64');
  }
  
  decrypt(encryptedText: string, password: string): string {
    const combined = Buffer.from(encryptedText, 'base64');
    
    const salt = combined.slice(0, this.saltLength);
    const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
    const tag = combined.slice(
      this.saltLength + this.ivLength,
      this.saltLength + this.ivLength + this.tagLength
    );
    const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);
    
    const key = this.deriveKey(password, salt);
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  }
}
```

## 12. API Token Management

```typescript
// app/utils/api-token-manager.ts
import crypto from 'crypto';
import { db } from '~/db.server';

export class APITokenManager {
  async generateToken(shop: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url');
    const hashedToken = this.hashToken(token);
    
    await db.apiToken.create({
      data: {
        shop,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        lastUsedAt: null
      }
    });
    
    return token;
  }
  
  async validateToken(token: string): Promise<{ valid: boolean; shop?: string }> {
    const hashedToken = this.hashToken(token);
    
    const apiToken = await db.apiToken.findUnique({
      where: { token: hashedToken }
    });
    
    if (!apiToken || apiToken.expiresAt < new Date()) {
      return { valid: false };
    }
    
    // Update last used
    await db.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsedAt: new Date() }
    });
    
    return { valid: true, shop: apiToken.shop };
  }
  
  private hashToken(token: string): string {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }
}
```

## 13. Webhook Security

### HMAC Validation
```typescript
// app/utils/webhook-validator.ts
import crypto from 'crypto';

export class WebhookValidator {
  private readonly secret: string;
  
  constructor(secret: string) {
    this.secret = secret;
  }
  
  async validateWebhook(
    rawBody: string,
    hmacHeader: string
  ): Promise<boolean> {
    const hash = crypto
      .createHmac('sha256', this.secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    
    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  }
}

// app/routes/webhooks.orders.paid.tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  
  if (!hmacHeader) {
    throw new Response('Unauthorized', { status: 401 });
  }
  
  const rawBody = await request.text();
  const validator = new WebhookValidator(process.env.SHOPIFY_WEBHOOK_SECRET!);
  
  if (!await validator.validateWebhook(rawBody, hmacHeader)) {
    throw new Response('Invalid signature', { status: 401 });
  }
  
  // Process webhook
  const data = JSON.parse(rawBody);
  // ...
};
```

## 14. Dependency Security

### Package Auditing
```json
// package.json
{
  "scripts": {
    "audit": "npm audit --audit-level=moderate",
    "audit:fix": "npm audit fix",
    "outdated": "npm outdated",
    "security:check": "npm run audit && npm run outdated"
  }
}
```

### Automated Scanning
```yaml
# .github/workflows/security.yml
name: Security Scan
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 0 * * 0' # Weekly

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run npm audit
        run: npm audit --audit-level=moderate
      
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/typescript
            p/react
```

## 15. Data Privacy & GDPR

### Data Handling
```typescript
// app/utils/gdpr.ts
export class GDPRHandler {
  async exportUserData(customerId: string, shop: string): Promise<UserData> {
    const customer = await db.customer.findUnique({
      where: { id: customerId, shop },
      include: {
        storeCreditLedger: true,
        tierChangeLogs: true
      }
    });
    
    if (!customer) {
      throw new Error('Customer not found');
    }
    
    // Format for export
    return {
      personalData: {
        email: customer.email,
        name: customer.firstName + ' ' + customer.lastName,
        phone: customer.phone
      },
      transactionData: customer.storeCreditLedger.map(entry => ({
        date: entry.createdAt,
        type: entry.entryType,
        amount: entry.amount
      })),
      tierHistory: customer.tierChangeLogs.map(log => ({
        date: log.changedAt,
        from: log.previousTierId,
        to: log.newTierId
      }))
    };
  }
  
  async deleteUserData(customerId: string, shop: string): Promise<void> {
    // Soft delete with anonymization
    await db.customer.update({
      where: { id: customerId, shop },
      data: {
        email: `deleted-${customerId}@anonymous.com`,
        firstName: 'DELETED',
        lastName: 'USER',
        phone: null,
        deletedAt: new Date()
      }
    });
  }
}
```

## 16. AWS Aurora Security

### IAM Database Authentication
```typescript
// app/utils/aurora-iam-auth.ts
import { Signer } from '@aws-sdk/rds-signer';

export async function getIAMAuthToken(): Promise<string> {
  const signer = new Signer({
    region: process.env.AWS_REGION,
    hostname: process.env.AURORA_CLUSTER_ENDPOINT,
    port: 5432,
    username: process.env.AURORA_IAM_USER
  });
  
  return signer.getAuthToken();
}

// app/db.server.ts
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

if (process.env.USE_IAM_AUTH === 'true') {
  const token = await getIAMAuthToken();
  
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${process.env.AURORA_IAM_USER}:${encodeURIComponent(token)}@${process.env.AURORA_CLUSTER_ENDPOINT}:5432/${process.env.AURORA_DATABASE_NAME}?sslmode=require`
      }
    }
  });
} else {
  // Use Data API
  prisma = createDataAPIPrismaClient();
}
```

## 17. Logging & Monitoring

### Security Event Logging
```typescript
// app/utils/security-logger.ts
import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs';

export class SecurityLogger {
  private cloudwatch: CloudWatchLogs;
  private logGroupName = '/aws/rewardspro/security';
  
  constructor() {
    this.cloudwatch = new CloudWatchLogs({
      region: process.env.AWS_REGION
    });
  }
  
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    const logEvent = {
      timestamp: Date.now(),
      message: JSON.stringify({
        ...event,
        environment: process.env.NODE_ENV,
        appVersion: process.env.APP_VERSION
      })
    };
    
    await this.cloudwatch.putLogEvents({
      logGroupName: this.logGroupName,
      logStreamName: new Date().toISOString().split('T')[0],
      logEvents: [logEvent]
    });
    
    // Alert on critical events
    if (event.severity === 'CRITICAL') {
      await this.sendAlert(event);
    }
  }
  
  private async sendAlert(event: SecurityEvent): Promise<void> {
    // Send to SNS, PagerDuty, etc.
  }
}
```

## 18. Security Testing

### Automated Security Tests
```typescript
// tests/security/auth.test.ts
import { describe, it, expect } from 'vitest';
import { SessionTokenValidator } from '~/utils/auth/session-token';

describe('Authentication Security', () => {
  const validator = new SessionTokenValidator(process.env.SHOPIFY_API_SECRET!);
  
  it('rejects none algorithm', async () => {
    const noneToken = 'eyJhbGciOiJub25lIn0.eyJzaG9wIjoidGVzdCJ9.';
    await expect(validator.verifyToken(noneToken))
      .rejects.toThrow('Invalid token algorithm');
  });
  
  it('rejects expired tokens', async () => {
    const expiredToken = generateExpiredToken();
    await expect(validator.verifyToken(expiredToken))
      .rejects.toThrow('Token expired');
  });
  
  it('validates HMAC correctly', () => {
    const validHmac = generateValidHmac('test-data');
    const invalidHmac = 'invalid-hmac';
    
    expect(validateHmac('test-data', validHmac)).toBe(true);
    expect(validateHmac('test-data', invalidHmac)).toBe(false);
  });
});
```

## 19. Compliance

### PCI DSS Compliance
```typescript
// app/utils/pci-compliance.ts
export class PCICompliance {
  // Never store card data
  sanitizePaymentData(data: any): any {
    const sensitiveFields = [
      'card_number',
      'cvv',
      'card_verification_value',
      'card_security_code'
    ];
    
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        delete sanitized[field];
      }
    }
    
    return sanitized;
  }
  
  // Log access to payment data
  async logPaymentDataAccess(
    userId: string,
    action: string,
    resource: string
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        userId,
        action,
        resource,
        category: 'PAYMENT_DATA_ACCESS',
        timestamp: new Date(),
        ipAddress: getClientIp()
      }
    });
  }
}
```

## 20. Incident Response

### Automated Response
```typescript
// app/utils/incident-response.ts
export class IncidentResponse {
  async handleSecurityIncident(
    type: 'BREACH' | 'SUSPICIOUS_ACTIVITY' | 'FAILED_AUTH_SPIKE',
    details: any
  ): Promise<void> {
    // 1. Log incident
    await this.logIncident(type, details);
    
    // 2. Take immediate action
    switch (type) {
      case 'BREACH':
        await this.lockdownSystem();
        await this.notifyTeam('CRITICAL');
        break;
      
      case 'SUSPICIOUS_ACTIVITY':
        await this.increaseMonitoring();
        await this.notifyTeam('HIGH');
        break;
      
      case 'FAILED_AUTH_SPIKE':
        await this.enableStricterRateLimiting();
        await this.notifyTeam('MEDIUM');
        break;
    }
    
    // 3. Create incident ticket
    await this.createIncidentTicket(type, details);
  }
  
  private async lockdownSystem(): Promise<void> {
    // Disable critical features
    await db.featureFlag.updateMany({
      where: { critical: true },
      data: { enabled: false }
    });
    
    // Invalidate all sessions
    await db.session.deleteMany({});
    
    // Enable emergency mode
    process.env.EMERGENCY_MODE = 'true';
  }
}
```

## Environment-Specific Security Configuration

### Development
```typescript
// config/security.development.ts
export const securityConfig = {
  csrf: {
    enabled: false // Easier testing
  },
  rateLimit: {
    enabled: true,
    multiplier: 10 // More lenient
  },
  logging: {
    verbose: true,
    includeStackTraces: true
  },
  cors: {
    origins: ['http://localhost:3000']
  }
};
```

### Staging
```typescript
// config/security.staging.ts
export const securityConfig = {
  csrf: {
    enabled: true
  },
  rateLimit: {
    enabled: true,
    multiplier: 2 // Slightly lenient
  },
  logging: {
    verbose: true,
    includeStackTraces: false
  },
  cors: {
    origins: ['https://staging.rewardspro.app']
  }
};
```

### Production
```typescript
// config/security.production.ts
export const securityConfig = {
  csrf: {
    enabled: true
  },
  rateLimit: {
    enabled: true,
    multiplier: 1 // Strict
  },
  logging: {
    verbose: false,
    includeStackTraces: false
  },
  cors: {
    origins: ['https://rewardspro.app']
  },
  waf: {
    enabled: true,
    rules: 'strict'
  }
};
```

## Security Checklist for Implementation

### Before Development
- [ ] Review this security guide
- [ ] Set up development security tools
- [ ] Configure pre-commit hooks
- [ ] Review OWASP Top 10

### During Development
- [ ] Validate all inputs with Zod
- [ ] Use parameterized queries
- [ ] Implement proper error handling
- [ ] Add security tests
- [ ] Review dependencies

### Before Deployment
- [ ] Run security audit (`npm audit`)
- [ ] Run SAST scan
- [ ] Review security headers
- [ ] Test rate limiting
- [ ] Verify HTTPS/TLS

### After Deployment
- [ ] Monitor security logs
- [ ] Set up alerts
- [ ] Schedule penetration test
- [ ] Review incident response plan
- [ ] Update security documentation

---

*Last Updated: January 2025 | Security Level: CRITICAL | Classification: Internal*
*This guide should be reviewed monthly and updated with new threats and patterns*