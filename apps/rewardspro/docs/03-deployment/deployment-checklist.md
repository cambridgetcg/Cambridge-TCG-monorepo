# 🚀 Deployment Checklist for Connection Management

## Pre-Deployment Verification

### 1. Local Testing ✅
- [x] Run `npx tsx test-connection-strategy.ts`
- [x] Verify all strategies work correctly
- [x] Check Data API adapter functions

### 2. Environment Variables Setup

#### Production Environment
```bash
# Required Variables
- [ ] SHOPIFY_API_KEY
- [ ] SHOPIFY_API_SECRET  
- [ ] SCOPES
- [ ] SHOPIFY_APP_URL
- [ ] DATABASE_URL (with encoded password)
- [ ] DIRECT_URL (same as DATABASE_URL)
- [ ] AURORA_RESOURCE_ARN
- [ ] AURORA_SECRET_ARN
- [ ] AURORA_DATABASE_NAME
- [ ] AWS_ACCESS_KEY_ID
- [ ] AWS_SECRET_ACCESS_KEY
- [ ] AWS_REGION

# Optional
- [ ] FORCE_DATA_API=false (or omit)
```

#### Preview Environment  
```bash
# Required Variables
- [ ] SHOPIFY_API_KEY
- [ ] SHOPIFY_API_SECRET
- [ ] SCOPES
- [ ] AURORA_RESOURCE_ARN
- [ ] AURORA_SECRET_ARN
- [ ] AURORA_DATABASE_NAME
- [ ] AWS_ACCESS_KEY_ID
- [ ] AWS_SECRET_ACCESS_KEY
- [ ] AWS_REGION
- [ ] FORCE_DATA_API=true

# MUST NOT HAVE
- [ ] DATABASE_URL (ensure this is NOT set)
- [ ] DIRECT_URL (ensure this is NOT set)
```

## Deployment Steps

### Step 1: Configure Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to Settings → Environment Variables
4. Add variables for each environment separately:
   - Click "Add New"
   - Enter variable name and value
   - **Select correct environment checkboxes**
   - Save

### Step 2: Verify Configuration

Run locally with simulated environments:
```bash
# Test production config
VERCEL_ENV=production npx tsx verify-vercel-env.ts

# Test preview config  
VERCEL_ENV=preview npx tsx verify-vercel-env.ts
```

### Step 3: Deploy to Preview

1. Create a new branch:
```bash
git checkout -b test-connection-strategy
git add .
git commit -m "Add connection management for Vercel deployments"
git push origin test-connection-strategy
```

2. Create Pull Request
3. Wait for preview deployment
4. Check Vercel logs for connection strategy:
```bash
vercel logs --environment=preview | grep "Database connection"
```

Expected output:
```
🔌 Database Connection Strategy: {
  environment: 'preview',
  strategy: 'data-api',
  description: 'Preview deployment using Data API',
  maxConnections: 0,
  useDataAPI: true
}
```

### Step 4: Monitor Preview Deployment

1. **Check Function Logs**:
   - Go to Vercel Dashboard → Functions tab
   - Look for any connection errors
   - Verify Data API is being used

2. **Test Application**:
   - Visit preview URL
   - Test database operations
   - Verify no connection timeouts

3. **Check AWS CloudWatch**:
   - Aurora cluster metrics
   - DatabaseConnections should remain at 0
   - DataAPIRequests should increase

### Step 5: Deploy to Production

1. Merge PR to main branch
2. Monitor production deployment
3. Check logs for connection strategy:
```bash
vercel logs --environment=production | grep "Database connection"
```

Expected output:
```
🔌 Database Connection Strategy: {
  environment: 'production',
  strategy: 'direct',
  description: 'Production deployment using direct connection',
  maxConnections: 5,
  useDataAPI: false
}
```

## Post-Deployment Monitoring

### Success Indicators ✅

- **Preview Deployments**:
  - Aurora shows 0 active connections
  - Logs show "Using Aurora Data API"
  - No connection timeout errors
  - App functions normally

- **Production Deployment**:
  - Aurora shows ≤5 connections
  - Logs show "direct connection"
  - Fast query performance
  - No connection exhaustion

### Warning Signs ⚠️

- Multiple preview deployments showing connection counts > 0
- "Too many connections" errors in logs
- Aurora not auto-pausing (high costs)
- Slow query performance in production

## Troubleshooting

### Issue: Preview still using connections
**Solution**: 
1. Verify DATABASE_URL is NOT set in preview
2. Check FORCE_DATA_API=true is set
3. Redeploy

### Issue: Production using Data API (slow)
**Solution**:
1. Verify DATABASE_URL is set in production
2. Remove or set FORCE_DATA_API=false
3. Check password encoding in DATABASE_URL

### Issue: Connection errors in production
**Solution**:
1. Verify DATABASE_URL password is URL-encoded
2. Check Aurora cluster is running
3. Consider implementing RDS Proxy

## Rollback Plan

If issues occur after deployment:

### Quick Fix (Force all to Data API):
1. Set FORCE_DATA_API=true for all environments
2. Redeploy
3. This ensures zero connections but slower performance

### Full Rollback:
1. Revert git commit
2. Set DATABASE_URL for all environments
3. Remove FORCE_DATA_API
4. Redeploy

## Cost Monitoring

Track these metrics weekly:
- Aurora compute hours (should decrease with auto-pause)
- Data API request count
- Total AWS bill reduction (target: $28/month savings)

## Security Checklist

- [ ] AWS credentials are unique per environment
- [ ] Database passwords are properly encoded
- [ ] Secrets are marked as sensitive in Vercel
- [ ] No credentials in code or git history
- [ ] IAM permissions follow least privilege

---

**Last Updated**: September 1, 2025
**Next Review**: After first production deployment