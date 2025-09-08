# RewardsPro Deployment Guide

## 🚀 Deployment Overview

RewardsPro uses a modern CI/CD pipeline with Vercel for automatic deployments. Every push to GitHub triggers a deployment, with preview deployments for pull requests and production deployments for the main branch.

## 🏗️ Deployment Architecture

```
GitHub Repository
       │
       ├─── Push to main ────────► Production Deploy
       │
       ├─── Pull Request ────────► Preview Deploy
       │
       └─── Branch Push ─────────► Branch Deploy
                │
                ▼
         Vercel Build
                │
         ┌──────┴──────┐
         │             │
    Build Phase   Deploy Phase
         │             │
    - Install     - Upload
    - TypeCheck   - Activate
    - Build       - Verify
    - Migrate     - Route
```

## 📋 Pre-Deployment Checklist

### Before Every Deployment

- [ ] All tests passing locally
- [ ] TypeScript compilation successful
- [ ] Database migrations created and tested
- [ ] Environment variables documented
- [ ] No sensitive data in code
- [ ] Performance impact assessed
- [ ] Breaking changes documented
- [ ] Rollback plan prepared

## 🔧 Environment Configuration

### Production Environment Variables

```bash
# Database - Production uses direct connection
DATABASE_URL="postgresql://user:password@aurora-cluster.cluster-xxx.eu-north-1.rds.amazonaws.com:5432/rewardspro?sslmode=require"
DIRECT_URL="${DATABASE_URL}"  # For migrations

# AWS Configuration (fallback)
AURORA_RESOURCE_ARN="arn:aws:rds:eu-north-1:xxx:cluster:rewardspro-prod"
AURORA_SECRET_ARN="arn:aws:secretsmanager:eu-north-1:xxx:secret:rewardspro-prod"
AURORA_DATABASE_NAME="rewardspro"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="xxx"
AWS_REGION="eu-north-1"

# Shopify Configuration
SHOPIFY_API_KEY="xxx"
SHOPIFY_API_SECRET="xxx"
SCOPES="read_customers,write_customers,read_orders,write_products"
SHOPIFY_APP_URL="https://rewardspro.vercel.app"

# Application
NODE_ENV="production"
PORT="3000"
```

### Preview Environment Variables

```bash
# Database - Preview MUST use Data API only
# NO DATABASE_URL! This forces Data API usage

# AWS Configuration (required)
AURORA_RESOURCE_ARN="arn:aws:rds:eu-north-1:xxx:cluster:rewardspro-dev"
AURORA_SECRET_ARN="arn:aws:secretsmanager:eu-north-1:xxx:secret:rewardspro-dev"
AURORA_DATABASE_NAME="rewardspro_preview"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="xxx"
AWS_REGION="eu-north-1"

# Force Data API
FORCE_DATA_API="true"
VERCEL_ENV="preview"  # Auto-set by Vercel

# Shopify Configuration
SHOPIFY_API_KEY="xxx"
SHOPIFY_API_SECRET="xxx"
SCOPES="read_customers,write_customers,read_orders,write_products"
SHOPIFY_APP_URL="https://rewardspro-preview.vercel.app"
```

## 🚢 Deployment Process

### 1. Local Development to Production

```bash
# 1. Ensure you're on main branch
git checkout main
git pull origin main

# 2. Run pre-deployment checks
npm run build
npm run typecheck
npm run lint
npm test

# 3. Create and test migrations
npx prisma migrate dev --name your_migration_name
npm run dev  # Test locally

# 4. Commit and push
git add .
git commit -m "feat: your feature description"
git push origin main

# 5. Monitor deployment
# Visit Vercel dashboard to watch deployment progress
```

### 2. Feature Branch Deployment

```bash
# 1. Create feature branch
git checkout -b feature/your-feature

# 2. Make changes and test
npm run dev

# 3. Push to GitHub
git push origin feature/your-feature

# 4. Create Pull Request
# This triggers a preview deployment

# 5. Share preview URL for testing
# URL format: https://rewardspro-<branch>-<hash>.vercel.app
```

### 3. Hotfix Deployment

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix

# 2. Make minimal fix
# Only change what's necessary

# 3. Fast-track deployment
git push origin hotfix/critical-fix

# 4. Create PR with "HOTFIX" label
# Request expedited review

# 5. Merge to main after approval
# Automatic production deployment
```

## 📦 Vercel Configuration

### vercel.json

```json
{
  "buildCommand": "npm run build:migrate",
  "outputDirectory": "build",
  "installCommand": "npm install",
  "framework": "remix",
  "regions": ["iad1"],
  "functions": {
    "app/routes/*.tsx": {
      "maxDuration": 30
    },
    "app/routes/webhooks.*.tsx": {
      "maxDuration": 60
    }
  },
  "env": {
    "NODE_ENV": "production"
  },
  "build": {
    "env": {
      "DATABASE_URL": "@database_url",
      "DIRECT_URL": "@direct_url"
    }
  }
}
```

### Build Configuration

```bash
# package.json scripts
{
  "scripts": {
    "build": "remix build",
    "build:migrate": "prisma migrate deploy && npm run build",
    "build:css": "tailwindcss -i app/styles/tailwind.css -o app/styles/app.css",
    "dev": "shopify app dev",
    "start": "remix-serve build",
    "typecheck": "tsc",
    "lint": "eslint --cache --cache-location ./node_modules/.cache/eslint .",
    "test": "vitest"
  }
}
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18.20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run type check
        run: npm run typecheck
        
      - name: Run linter
        run: npm run lint
        
      - name: Run tests
        run: npm test
        
      - name: Build application
        run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Vercel
        run: |
          curl -X POST https://api.vercel.com/v1/integrations/deploy/xxx
```

## 🔍 Deployment Monitoring

### Health Checks

```typescript
// app/routes/health.tsx
export const loader = async () => {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;
    
    // Check Shopify API
    const apiHealth = await checkShopifyApi();
    
    return json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected',
        shopifyApi: apiHealth ? 'connected' : 'error'
      }
    });
  } catch (error) {
    return json({
      status: 'unhealthy',
      error: error.message
    }, { status: 503 });
  }
};
```

### Monitoring Dashboard

```bash
# Key metrics to monitor
- Response time (p50, p95, p99)
- Error rate
- Database connection count
- Memory usage
- CPU utilization
- Active users
- Webhook processing time
```

## 🔄 Rollback Procedures

### Immediate Rollback

```bash
# 1. Via Vercel Dashboard
# Navigate to deployments
# Click "..." on previous deployment
# Select "Promote to Production"

# 2. Via Vercel CLI
vercel rollback

# 3. Via Git Revert
git revert HEAD
git push origin main
```

### Database Rollback

```bash
# 1. Check migration history
npx prisma migrate status

# 2. Create down migration
# Manual SQL to reverse changes

# 3. Apply rollback
psql $DATABASE_URL < rollback.sql

# 4. Update Prisma schema
# Revert schema.prisma changes

# 5. Deploy reverted code
git push origin main
```

## 🚨 Emergency Procedures

### Production Down

1. **Check Vercel Status Page**
2. **Verify Database Connection**
3. **Check Shopify Status**
4. **Review Recent Deployments**
5. **Rollback if Necessary**
6. **Notify Stakeholders**

### Database Issues

```bash
# Check connection
npx prisma db pull

# Force Data API mode
export FORCE_DATA_API=true

# Test connection
node -e "require('./app/db.server').default.$queryRaw\`SELECT 1\`.then(console.log)"
```

### High Traffic Handling

```typescript
// Implement rate limiting
const rateLimiter = new Map();

export const loader = async ({ request }) => {
  const ip = request.headers.get('x-forwarded-for');
  
  if (rateLimiter.get(ip) > 100) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  
  // Process request
};
```

## 📊 Performance Optimization

### Build Optimization

```bash
# Analyze bundle size
npm run build -- --analyze

# Optimize imports
npm install --save-dev @vercel/ncc

# Tree shake unused code
npm run build -- --minify
```

### Runtime Optimization

```typescript
// Use edge functions for static content
export const config = {
  runtime: 'edge'
};

// Implement caching
export const headers = () => ({
  'Cache-Control': 's-maxage=60, stale-while-revalidate'
});

// Defer non-critical data
export const loader = async () => {
  return defer({
    critical: await getCriticalData(),
    deferred: getDeferredData() // No await
  });
};
```

## 🔐 Security Considerations

### Deployment Security

1. **Use Environment Variables**: Never hardcode secrets
2. **Rotate Keys Regularly**: Update API keys quarterly
3. **Audit Dependencies**: Run `npm audit` before deploy
4. **Enable 2FA**: On GitHub and Vercel accounts
5. **Restrict Deploy Access**: Limit who can deploy
6. **Review PR Changes**: Especially for security-sensitive code

### Post-Deployment Security

```bash
# Verify security headers
curl -I https://your-app.vercel.app

# Check SSL certificate
openssl s_client -connect your-app.vercel.app:443

# Scan for vulnerabilities
npm audit --production
```

## 📈 Scaling Strategies

### Automatic Scaling

Vercel automatically scales based on traffic:
- **Serverless Functions**: 0 to 3000 concurrent executions
- **Edge Functions**: Unlimited scaling
- **Static Assets**: Global CDN distribution

### Manual Scaling Options

```javascript
// vercel.json
{
  "functions": {
    "app/routes/api/heavy-endpoint.tsx": {
      "maxDuration": 60,
      "memory": 3008
    }
  },
  "regions": ["iad1", "sfo1", "cdg1"]
}
```

## 🎯 Deployment Best Practices

### 1. **Use Preview Deployments**
Test every change in a preview environment

### 2. **Automate Everything**
No manual deployment steps

### 3. **Monitor Continuously**
Set up alerts for anomalies

### 4. **Document Changes**
Keep deployment logs and change records

### 5. **Plan for Failure**
Have rollback procedures ready

### 6. **Optimize Build Times**
Cache dependencies and parallelize tasks

### 7. **Version Everything**
Tag releases and maintain changelog

## 📝 Deployment Checklist Template

```markdown
## Deployment: [Version] - [Date]

### Pre-Deployment
- [ ] Tests passing
- [ ] TypeScript clean
- [ ] Migrations tested
- [ ] Env vars updated
- [ ] Documentation updated

### Deployment
- [ ] Preview tested
- [ ] Stakeholders notified
- [ ] Deployment initiated
- [ ] Health check passed
- [ ] Smoke tests passed

### Post-Deployment
- [ ] Monitoring active
- [ ] Performance normal
- [ ] No error spikes
- [ ] Customer feedback positive
- [ ] Documentation updated
```

## 🆘 Support Resources

### Internal Resources
- Deployment Logs: Vercel Dashboard
- Error Tracking: Vercel Functions Logs
- Database Monitoring: AWS CloudWatch
- Application Metrics: Vercel Analytics

### External Resources
- [Vercel Documentation](https://vercel.com/docs)
- [Remix Deployment Guide](https://remix.run/docs/en/main/guides/deployment)
- [AWS Aurora Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide)
- [Shopify App Deployment](https://shopify.dev/docs/apps/deployment)

## 📚 Related Documentation

- [architecture.md](./architecture.md) - System design
- [database.md](./database.md) - Database operations
- [troubleshooting.md](./troubleshooting.md) - Common issues
- [development.md](./development.md) - Development workflow