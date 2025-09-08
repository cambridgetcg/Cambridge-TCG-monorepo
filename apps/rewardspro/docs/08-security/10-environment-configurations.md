# Environment-Specific Security Configurations

## Overview
This document details the security configurations that should be applied based on the deployment environment (development, staging, production).

## Development Environment

### Security Settings
```typescript
// config/security.development.ts
export const developmentSecurityConfig = {
  // Authentication
  auth: {
    sessionTokenExpiry: 300, // 5 minutes (longer for dev)
    refreshTokenEnabled: false,
    strictValidation: false
  },
  
  // CSRF Protection
  csrf: {
    enabled: false, // Disabled for easier testing
    tokenExpiry: 3600
  },
  
  // Rate Limiting
  rateLimit: {
    enabled: true,
    api: {
      points: 1000, // 10x production limit
      duration: 60
    },
    auth: {
      points: 50, // 10x production limit
      duration: 900
    }
  },
  
  // Security Headers
  headers: {
    csp: {
      reportOnly: true, // Log violations but don't block
      unsafeEval: true, // Allow for dev tools
      unsafeInline: true // Allow for hot reload
    },
    hsts: {
      enabled: false // Not needed in dev
    }
  },
  
  // Logging
  logging: {
    verbose: true,
    includeStackTraces: true,
    logSensitiveData: true, // OK in dev
    prettify: true
  },
  
  // CORS
  cors: {
    origins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000'
    ],
    credentials: true
  },
  
  // Error Handling
  errors: {
    exposeDetails: true,
    includeStack: true
  }
};
```

### Environment Variables (.env.development)
```env
NODE_ENV=development
LOG_LEVEL=debug

# Relaxed security for development
SKIP_HMAC_VALIDATION=false  # Still validate in dev
ALLOW_HTTP=true
DISABLE_RATE_LIMITING=false

# Development URLs
SHOPIFY_APP_URL=http://localhost:3000
WEBHOOK_URL=https://ngrok.io/your-tunnel

# Mock services
USE_MOCK_SHOPIFY=false
USE_MOCK_PAYMENTS=true

# Development secrets (never use in production)
ENCRYPTION_KEY=dev-only-encryption-key-not-for-production
SESSION_SECRET=dev-only-session-secret-not-for-production
```

## Staging Environment

### Security Settings
```typescript
// config/security.staging.ts
export const stagingSecurityConfig = {
  // Authentication
  auth: {
    sessionTokenExpiry: 60, // 1 minute (production standard)
    refreshTokenEnabled: true,
    strictValidation: true
  },
  
  // CSRF Protection
  csrf: {
    enabled: true,
    tokenExpiry: 900, // 15 minutes
    sameSite: 'strict'
  },
  
  // Rate Limiting
  rateLimit: {
    enabled: true,
    api: {
      points: 200, // 2x production for testing
      duration: 60
    },
    auth: {
      points: 10, // 2x production for testing
      duration: 900
    }
  },
  
  // Security Headers
  headers: {
    csp: {
      reportOnly: false,
      reportUri: 'https://staging.rewardspro.app/csp-report',
      unsafeEval: false,
      unsafeInline: false
    },
    hsts: {
      enabled: true,
      maxAge: 86400, // 1 day for staging
      includeSubDomains: true,
      preload: false
    }
  },
  
  // Logging
  logging: {
    verbose: true,
    includeStackTraces: false,
    logSensitiveData: false,
    prettify: false
  },
  
  // CORS
  cors: {
    origins: [
      'https://staging.rewardspro.app',
      'https://*.staging.myshopify.com'
    ],
    credentials: true
  },
  
  // Error Handling
  errors: {
    exposeDetails: false,
    includeStack: false,
    genericMessage: 'An error occurred'
  }
};
```

### Environment Variables (.env.staging)
```env
NODE_ENV=staging
LOG_LEVEL=info

# Staging security
ENFORCE_HTTPS=true
ENABLE_SECURITY_HEADERS=true
ENABLE_WAF=true
WAF_MODE=COUNT  # Count violations but don't block

# Staging URLs
SHOPIFY_APP_URL=https://staging.rewardspro.app
WEBHOOK_URL=https://staging.rewardspro.app/webhooks

# AWS Staging
AWS_REGION=eu-north-1
AURORA_CLUSTER_ARN=arn:aws:rds:eu-north-1:xxx:cluster:staging
AURORA_SECRET_ARN=arn:aws:secretsmanager:eu-north-1:xxx:secret:staging

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/staging
SENTRY_ENVIRONMENT=staging
DATADOG_API_KEY=staging-key

# Staging secrets (rotate regularly)
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
SESSION_SECRET=<random-32-byte-secret>
```

## Production Environment

### Security Settings
```typescript
// config/security.production.ts
export const productionSecurityConfig = {
  // Authentication
  auth: {
    sessionTokenExpiry: 60, // 1 minute strict
    refreshTokenEnabled: true,
    strictValidation: true,
    requireMFA: false, // Enable when ready
    maxLoginAttempts: 5,
    lockoutDuration: 3600 // 1 hour
  },
  
  // CSRF Protection
  csrf: {
    enabled: true,
    tokenExpiry: 600, // 10 minutes
    sameSite: 'strict',
    secure: true,
    httpOnly: true
  },
  
  // Rate Limiting
  rateLimit: {
    enabled: true,
    api: {
      points: 100,
      duration: 60,
      blockDuration: 600
    },
    auth: {
      points: 5,
      duration: 900,
      blockDuration: 3600
    },
    webhook: {
      points: 1000,
      duration: 60,
      blockDuration: 60
    }
  },
  
  // Security Headers
  headers: {
    csp: {
      reportOnly: false,
      reportUri: 'https://rewardspro.app/csp-report',
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'nonce-{nonce}'", "https://cdn.shopify.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.shopify.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        fontSrc: ["'self'", "https://cdn.shopify.com"],
        connectSrc: ["'self'", "https://*.myshopify.com"],
        frameAncestors: ["https://*.myshopify.com", "https://admin.shopify.com"],
        formAction: ["'self'"],
        upgradeInsecureRequests: true
      }
    },
    hsts: {
      enabled: true,
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    additional: {
      'X-Frame-Options': 'ALLOWFROM https://admin.shopify.com',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=()'
    }
  },
  
  // Logging
  logging: {
    verbose: false,
    includeStackTraces: false,
    logSensitiveData: false,
    prettify: false,
    securityEventsOnly: true
  },
  
  // CORS
  cors: {
    origins: [
      'https://rewardspro.app',
      'https://*.myshopify.com'
    ],
    credentials: true,
    maxAge: 86400
  },
  
  // Error Handling
  errors: {
    exposeDetails: false,
    includeStack: false,
    genericMessage: 'An unexpected error occurred',
    notifyTeam: true
  },
  
  // AWS WAF
  waf: {
    enabled: true,
    mode: 'BLOCK',
    rules: [
      'SQLiMatchStatement',
      'XSSMatchStatement',
      'SizeRestrictionStatement',
      'GeoMatchStatement',
      'RateLimitStatement'
    ]
  },
  
  // Additional Production Security
  features: {
    encryptSensitiveData: true,
    auditLogging: true,
    ipWhitelisting: false, // Enable for admin routes
    sessionRecording: false, // Enable for debugging
    vulnerabilityScanning: true,
    dependencyUpdates: 'automatic'
  }
};
```

### Environment Variables (.env.production)
```env
NODE_ENV=production
LOG_LEVEL=warn

# Production security (all required)
ENFORCE_HTTPS=true
ENABLE_SECURITY_HEADERS=true
ENABLE_WAF=true
WAF_MODE=BLOCK
REQUIRE_HMAC_VALIDATION=true
ENABLE_AUDIT_LOGGING=true

# Production URLs
SHOPIFY_APP_URL=https://rewardspro.app
WEBHOOK_URL=https://rewardspro.app/webhooks

# AWS Production
AWS_REGION=eu-north-1
AURORA_CLUSTER_ARN=arn:aws:rds:eu-north-1:xxx:cluster:production
AURORA_SECRET_ARN=arn:aws:secretsmanager:eu-north-1:xxx:secret:production
USE_IAM_AUTH=true  # Use IAM for database auth

# Monitoring & Alerting
SENTRY_DSN=https://xxx@sentry.io/production
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
DATADOG_API_KEY=production-key
PAGERDUTY_INTEGRATION_KEY=xxx

# Security Monitoring
SECURITY_EMAIL=security@rewardspro.app
ALERT_EMAIL=alerts@rewardspro.app
SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx

# Production secrets (rotate monthly)
ENCRYPTION_KEY=<kms-encrypted-key>
SESSION_SECRET=<kms-encrypted-secret>
SHOPIFY_WEBHOOK_SECRET=<from-shopify-admin>

# Backup & Recovery
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=30
POINT_IN_TIME_RECOVERY=true
```

## Vercel-Specific Configuration

### vercel.json
```json
{
  "env": {
    "NODE_ENV": "production"
  },
  "build": {
    "env": {
      "DATABASE_URL": "postgresql://placeholder:placeholder@localhost:5432/placeholder"
    }
  },
  "functions": {
    "app/routes/*.tsx": {
      "maxDuration": 10
    },
    "app/routes/webhooks.*.tsx": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "ALLOWFROM https://admin.shopify.com"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ]
}
```

## Security Configuration Loading

### Implementation
```typescript
// app/utils/security-config.ts
import { developmentSecurityConfig } from '~/config/security.development';
import { stagingSecurityConfig } from '~/config/security.staging';
import { productionSecurityConfig } from '~/config/security.production';

export function getSecurityConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return productionSecurityConfig;
    case 'staging':
      return stagingSecurityConfig;
    case 'development':
    default:
      return developmentSecurityConfig;
  }
}

// Usage in app
const securityConfig = getSecurityConfig();

// Apply rate limiting
if (securityConfig.rateLimit.enabled) {
  app.use(rateLimitMiddleware(securityConfig.rateLimit));
}

// Apply security headers
if (securityConfig.headers.hsts.enabled) {
  app.use(hstsMiddleware(securityConfig.headers.hsts));
}
```

## Environment Variable Validation

### Schema Validation
```typescript
// app/utils/env-validation.ts
import { z } from 'zod';

const envSchema = z.object({
  // Required in all environments
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  AURORA_RESOURCE_ARN: z.string().startsWith('arn:aws:rds:'),
  AURORA_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
  AURORA_DATABASE_NAME: z.string(),
  SHOPIFY_API_KEY: z.string(),
  SHOPIFY_API_SECRET: z.string(),
  
  // Required in production
  ...(process.env.NODE_ENV === 'production' && {
    ENCRYPTION_KEY: z.string().length(44), // Base64 32 bytes
    SESSION_SECRET: z.string().min(32),
    SHOPIFY_WEBHOOK_SECRET: z.string(),
    SENTRY_DSN: z.string().url(),
  })
});

export function validateEnvironment() {
  try {
    envSchema.parse(process.env);
  } catch (error) {
    console.error('Environment validation failed:', error);
    if (process.env.NODE_ENV === 'production') {
      // Fail fast in production
      process.exit(1);
    }
  }
}

// Call on app startup
validateEnvironment();
```

## Security Monitoring by Environment

### Development
- Console logging only
- Verbose error messages
- No external monitoring

### Staging
- Sentry error tracking (100% sample rate)
- CloudWatch logs
- Weekly security reports
- Test vulnerability scanning

### Production
- Sentry error tracking (10% sample rate)
- CloudWatch logs with alerts
- Real-time security monitoring
- Daily security reports
- Continuous vulnerability scanning
- PagerDuty integration for critical alerts
- Slack notifications for security events

## Deployment Checklist

### Moving to Staging
- [ ] Update environment variables
- [ ] Enable HTTPS
- [ ] Configure CSP headers
- [ ] Set up monitoring
- [ ] Test rate limiting
- [ ] Verify HMAC validation

### Moving to Production
- [ ] Rotate all secrets
- [ ] Enable WAF in BLOCK mode
- [ ] Configure backup strategy
- [ ] Set up alerting
- [ ] Enable audit logging
- [ ] Verify all security headers
- [ ] Test incident response plan
- [ ] Schedule penetration test

---

*Last Updated: January 2025 | Security Level: CRITICAL | Classification: Internal*
*Different environments require different security postures - never use development settings in production*