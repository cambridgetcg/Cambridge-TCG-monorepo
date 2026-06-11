# Configuration and Deployment Vulnerabilities Security Guide

This comprehensive guide addresses critical configuration and deployment vulnerabilities for React TypeScript Shopify embedded apps using AWS Aurora database and Vercel hosting. Recent research reveals that 87% of production containers have vulnerabilities, 17% of major domains suffer from CORS misconfigurations, and supply chain attacks have compromised millions of weekly downloads through NPM packages in 2024.

## Environment Variables and Secrets Management

The most critical vulnerability in modern web applications stems from improper secrets management. Research shows that 8.5% of Docker images expose API keys and private keys, while frontend bundles frequently leak credentials through environment variables prefixed with `REACT_APP_` or `NEXT_PUBLIC_`.

### Secure Implementation Pattern

```typescript
// config/env.ts - Type-safe environment validation
import { z } from 'zod';

const backendEnvSchema = z.object({
  SHOPIFY_API_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
});

// Never expose these in frontend
export const backendEnv = backendEnvSchema.parse(process.env);

// Frontend-safe variables only
const frontendEnvSchema = z.object({
  REACT_APP_API_URL: z.string().url(),
  REACT_APP_SHOPIFY_APP_URL: z.string().url(),
});

export const frontendEnv = frontendEnvSchema.parse({
  REACT_APP_API_URL: process.env.REACT_APP_API_URL,
  REACT_APP_SHOPIFY_APP_URL: process.env.REACT_APP_SHOPIFY_APP_URL,
});
```

### AWS Secrets Manager Integration

Use AWS Secrets Manager or HashiCorp Vault for production secrets with automatic rotation:

```typescript
// services/secrets-manager.ts
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export class SecretRotationService {
  private secretsManager: SecretsManagerClient;
  
  constructor() {
    this.secretsManager = new SecretsManagerClient({
      region: process.env.AWS_REGION,
    });
  }

  async getRotatingSecret(secretId: string): Promise<string> {
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await this.secretsManager.send(command);
    
    const secret = JSON.parse(response.SecretString!);
    return secret.apiKey || secret.AWSCURRENT;
  }
}
```

## Vercel Deployment Configuration Security

The recent **CVE-2025-29927** vulnerability in Next.js middleware (CVSS 7.5) enables authorization bypass for pages directly under the application root. This affects Next.js 14.x-15.x deployed on Vercel. Update immediately to Next.js 14.2.25+ or 15.2.3+.

### Secure vercel.json Configuration

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.shopify.com; frame-ancestors https://*.myshopify.com"
        },
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ],
  "functions": {
    "api/*.js": {
      "memory": 1024,
      "maxDuration": 30,
      "runtime": "nodejs18.x"
    }
  },
  "env": {
    "NODE_ENV": "production"
  }
}
```

Mark sensitive environment variables as sensitive in the Vercel dashboard to prevent log exposure. Use different variables per environment (development/preview/production) and enable deployment protection.

## AWS Aurora Configuration Vulnerabilities

Aurora databases must be deployed in private subnets with no internet access, using security groups that only allow connections from application servers.

### Secure CDK Configuration

```typescript
import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';

export class SecureAuroraStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const dbKey = new kms.Key(this, 'DatabaseKey', {
      enableKeyRotation: true,
    });

    const vpc = new ec2.Vpc(this, 'DatabaseVPC', {
      maxAzs: 3,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      ],
    });

    const cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_14_9,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      storageEncrypted: true,
      storageEncryptionKey: dbKey,
      deletionProtection: true,
      backupRetention: cdk.Duration.days(30),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      enableDataApi: true,
      enablePerformanceInsights: true,
      cloudwatchLogsExports: ['postgresql'],
      parameterGroup: {
        parameters: {
          'rds.force_ssl': '1',
          'ssl_min_protocol_version': 'TLSv1.2',
        }
      }
    });
  }
}
```

## Docker Container Security

Research shows 87% of production container images have major vulnerabilities. Implement multi-stage builds with non-root users and security scanning.

### Secure Dockerfile

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.24-alpine AS production
USER 101
COPY --from=builder /app/build /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:8080/ || exit 1
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

### Security Scanning in CI/CD

```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'react-app:test'
    format: 'sarif'
    severity: 'CRITICAL,HIGH'
```

## CI/CD Pipeline Security

The 2024 Polyfill.io attack compromised over 100,000 websites, highlighting the critical need for supply chain security. Implement SLSA framework compliance and comprehensive scanning.

### Secure GitHub Actions Workflow

```yaml
name: Secure CI/CD Pipeline
on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      
      - name: Run CodeQL Analysis
        uses: github/codeql-action/init@v3
        with:
          languages: typescript, javascript
      
      - name: Dependency Audit
        run: |
          npm audit --audit-level=moderate
          npx lockfile-lint --path package-lock.json \
            --allowed-hosts npm registry.npmjs.org \
            --validate-https
      
      - name: SAST Scanning
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --fail-on=all
```

## Infrastructure as Code Security

Use automated IaC scanning to detect misconfigurations before deployment:

```yaml
- name: Run Checkov
  uses: bridgecrewio/checkov-action@master
  with:
    directory: terraform/
    framework: terraform
    output_format: sarif

- name: Run tfsec
  uses: aquasecurity/tfsec-action@v1.0.0
  with:
    working_directory: terraform/
```

## Git Repository Security Configuration

Implement comprehensive .gitignore and pre-commit hooks to prevent secret exposure:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitguardian/ggshield
    rev: v1.25.0
    hooks:
      - id: ggshield
        stages: [commit]
  
  - repo: local
    hooks:
      - id: trufflehog
        name: TruffleHog
        entry: bash -c 'trufflehog git file://. --since-commit HEAD --only-verified --fail'
        language: system
```

Enable branch protection with required status checks, signed commits, and code owner reviews:

```hcl
resource "github_branch_protection" "main" {
  repository_id = github_repository.repo.name
  pattern = "main"
  
  required_status_checks {
    strict = true
    contexts = ["ci/security-scan", "ci/build"]
  }
  
  required_pull_request_reviews {
    required_approving_review_count = 2
    require_code_owner_reviews = true
  }
  
  require_signed_commits = true
}
```

## CORS and Origin Configuration

Research found 17% of top domains vulnerable to CORS attacks. Shopify purposely blocks direct CORS requests, requiring App Proxies instead.

### Secure CORS Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://your-shopify-store.myshopify.com']
    : ['http://localhost:3000'];

  const isAllowedOrigin = origin && allowedOrigins.includes(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const response = NextResponse.next();
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return response;
}
```

## SSL/TLS Configuration

OWASP now discourages certificate pinning due to operational risks with certificate lifetimes decreasing to 47 days by 2029. Focus on proper TLS configuration instead:

```typescript
export const createSecureAgent = () => {
  return new HttpsAgent({
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    ciphers: [
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
    ].join(':'),
  });
};
```

## Database Connection Security

Use IAM database authentication and AWS Secrets Manager for credential management:

```typescript
export class SecureAuroraClient {
  async executeQuery<T>(sql: string, parameters?: SqlParametersList): Promise<T[]> {
    const params = {
      secretArn: process.env.DB_SECRET_ARN!,
      resourceArn: process.env.DB_RESOURCE_ARN!,
      database: process.env.DB_NAME!,
      sql,
      parameters,
      includeResultMetadata: true,
    };

    const result = await this.rdsData.executeStatement(params).promise();
    return this.transformResults(result);
  }
}
```

## Dependency Configuration Vulnerabilities

Lock file validation prevents dependency confusion attacks that affected millions of weekly NPM downloads in 2024:

```json
{
  "scripts": {
    "preinstall": "npx npm-force-resolutions",
    "postinstall": "npm audit --audit-level=moderate",
    "validate-deps": "npx lockfile-lint --path package-lock.json --allowed-hosts npm registry.npmjs.org --validate-https"
  }
}
```

## Production vs Development Configuration

Implement strict environment separation with validation:

```typescript
const configs: Record<string, Config> = {
  development: {
    apiUrl: 'http://localhost:3001/api',
    enableAnalytics: false,
    logLevel: 'debug'
  },
  production: {
    apiUrl: process.env.REACT_APP_PROD_API_URL!,
    enableAnalytics: true,
    logLevel: 'error'
  }
};

if (process.env.NODE_ENV === 'production' && !config.apiUrl) {
  throw new Error('REACT_APP_PROD_API_URL is required in production');
}
```

## Logging Configuration Security

Prevent sensitive data exposure through comprehensive masking:

```typescript
const SENSITIVE_PATTERNS: MaskingRule[] = [
  { field: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, replacement: '***@***.com' },
  { field: 'creditCard', pattern: /\d{4}\s?\d{4}\s?\d{4}\s?\d{4}/, replacement: '**** **** **** ****' },
  { field: 'apiKey', pattern: /.+/, replacement: '[REDACTED]' }
];

export function maskSensitiveData<T>(data: T): T {
  // Recursive masking implementation
}
```

## Monitoring and Alerting

Implement comprehensive security event monitoring:

```typescript
class SecurityMonitor {
  private alertThresholds = {
    authFailures: 10,
    anomalousQueries: 50,
    privilegeEscalations: 1
  };

  async checkThresholds(event: SecurityEvent) {
    if (this.metrics.authFailures > this.alertThresholds.authFailures) {
      await this.triggerAlert('HIGH_AUTH_FAILURES', this.metrics);
    }
  }
}
```

## Zero-Trust Architecture Implementation

Deploy service mesh with mTLS for service-to-service communication:

```typescript
class ServiceMeshSecurity {
  async establishSecureConnection(serviceA: string, serviceB: string) {
    const authorized = await this.checkAuthorizationPolicy(serviceAIdentity, serviceBIdentity);
    if (!authorized) {
      throw new Error('Service-to-service communication not authorized');
    }
    return await this.createMTLSConnection(serviceAIdentity, serviceBIdentity);
  }
}
```

## Automated Configuration Scanning

Integrate Cloud Security Posture Management tools:

```typescript
class CSPMIntegration {
  async scanCloudConfiguration(): Promise<CSPMFinding[]> {
    const securityHubFindings = await this.getSecurityHubFindings();
    const customFindings = await this.runCustomSecurityChecks();
    return [...securityHubFindings, ...customFindings].filter(f => f.status === 'OPEN');
  }
}
```

## Critical Recommendations and Priorities

### Immediate Actions Required

1. **Update Next.js** to patch CVE-2025-29927 middleware bypass
2. **Migrate secrets** to AWS Secrets Manager with rotation
3. **Enable Aurora encryption** with customer-managed KMS keys
4. **Implement SLSA Level 1** provenance for builds
5. **Configure comprehensive security headers** in vercel.json

### Short-term Security Improvements (1-3 months)

1. **Deploy Istio/Linkerd** service mesh for zero-trust networking
2. **Implement automated drift detection** with Spacelift
3. **Set up comprehensive SIEM integration**
4. **Establish backup validation procedures**
5. **Enable container scanning** in CI/CD pipelines

## Implementation Checklist

- [ ] Update Next.js to latest security patch
- [ ] Migrate all secrets to AWS Secrets Manager
- [ ] Configure Vercel security headers
- [ ] Implement Docker security scanning
- [ ] Set up GitHub branch protection
- [ ] Configure AWS Aurora security groups
- [ ] Enable dependency vulnerability scanning
- [ ] Implement CORS middleware properly
- [ ] Set up comprehensive logging with masking
- [ ] Deploy monitoring and alerting system

## Conclusion

This defense-in-depth approach addresses the full spectrum of configuration and deployment vulnerabilities, from secret management to zero-trust architecture, ensuring robust security for your React TypeScript Shopify application stack. Regular audits and updates of these configurations are essential to maintain security posture against evolving threats.

## Related Documentation

- [Authentication Security Guide](./07-authentication-security.md)
- [Shopify Auth Security Guide](./08-shopify-auth-security.md)
- [Security Checklist](../05-reference/security-checklist.md)
- [AWS Aurora Setup](../03-deployment/aws-aurora-setup.md)
- [Vercel Deployment](../03-deployment/vercel-deployment.md)