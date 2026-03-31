# Vercel Environment Variables Setup

## Overview

This guide explains how to configure environment variables in Vercel for optimal database connection management.

## Environment Variables by Deployment Type

### Production Environment

Add these in Vercel Dashboard → Settings → Environment Variables → Production:

```bash
# Shopify Configuration
SHOPIFY_API_KEY=<from Shopify Partner Dashboard>
SHOPIFY_API_SECRET=<from Shopify Partner Dashboard>
SCOPES=read_orders,write_store_credit_account_transactions,read_store_credit_accounts
SHOPIFY_APP_URL=https://your-app.vercel.app

# Aurora Direct Connection (for Prisma migrations and production)
DATABASE_URL=<Aurora connection string from AWS Console>
DIRECT_URL=<same as DATABASE_URL>

# RDS Proxy (when available - recommended)
# DATABASE_URL_PROXY=postgresql://username:password@proxy-endpoint.proxy-xyz.eu-north-1.rds.amazonaws.com:5432/rewardspro

# Aurora Data API (fallback)
AURORA_RESOURCE_ARN=<from AWS RDS Console>
AURORA_SECRET_ARN=<from AWS Secrets Manager>
AURORA_DATABASE_NAME=rewardspro

# AWS Credentials — get from: credentials.py get aws-access-key / aws-secret-key
AWS_ACCESS_KEY_ID=<from credentials.py or AWS IAM>
AWS_SECRET_ACCESS_KEY=<from credentials.py or AWS IAM>
AWS_REGION=eu-north-1

# Connection Strategy Override (optional)
# FORCE_DATA_API=false  # Set to true to force Data API even in production
```

### Preview Environment

Add these in Vercel Dashboard → Settings → Environment Variables → Preview:

```bash
# Shopify Configuration (same as production)
SHOPIFY_API_KEY=<from Shopify Partner Dashboard>
SHOPIFY_API_SECRET=<from Shopify Partner Dashboard>
SCOPES=read_orders,write_store_credit_account_transactions,read_store_credit_accounts

# NO DATABASE_URL for preview! This forces Data API usage
# DATABASE_URL is intentionally omitted

# Aurora Data API (required for preview)
AURORA_RESOURCE_ARN=<from AWS RDS Console>
AURORA_SECRET_ARN=<from AWS Secrets Manager>
AURORA_DATABASE_NAME=rewardspro

# AWS Credentials (same as production)
AWS_ACCESS_KEY_ID=<from credentials.py or AWS IAM>
AWS_SECRET_ACCESS_KEY=<from credentials.py or AWS IAM>
AWS_REGION=eu-north-1

# Force Data API for all preview deployments
FORCE_DATA_API=true
```

### Development Environment

Add these in Vercel Dashboard → Settings → Environment Variables → Development:

```bash
# Same as Preview environment
# Uses Data API to prevent connection exhaustion
```

## Setting Up in Vercel Dashboard

### Step 1: Navigate to Environment Variables
1. Go to your Vercel project
2. Click "Settings" tab
3. Click "Environment Variables" in sidebar

### Step 2: Add Variables by Environment
1. Click "Add New"
2. Enter variable name (e.g., `DATABASE_URL`)
3. Enter value
4. **IMPORTANT**: Select which environments should have this variable:
   - Production only for `DATABASE_URL`
   - All environments for Aurora Data API variables
   - Preview only for `FORCE_DATA_API=true`

### Step 3: Verify Configuration
```bash
# Check production
vercel env pull .env.production --environment=production

# Check preview
vercel env pull .env.preview --environment=preview

# Verify Data API is forced for preview
grep FORCE_DATA_API .env.preview  # Should show: FORCE_DATA_API=true
grep DATABASE_URL .env.preview     # Should be empty or missing
```

## Environment Detection

The application automatically detects the environment using:

```typescript
process.env.VERCEL_ENV  // "production" | "preview" | "development"
```

### Connection Strategy by Environment:
- **Production**: Direct connection (5 connections max)
- **Preview**: Data API (0 connections)
- **Development**: Data API (0 connections)

## Important Notes

### DO NOT:
- Add `DATABASE_URL` to preview environments
- Remove `FORCE_DATA_API` from preview environments
- Commit real credentials to this file or any file in git
- Use the same credentials for dev/prod

### DO:
- Keep production and preview variables separate
- Use Data API for all non-production deployments
- Monitor CloudWatch for connection metrics
- Rotate AWS credentials regularly
- Store credentials in macOS Keychain via `credentials.py`

## Monitoring

### CloudWatch Metrics to Track:
1. **DatabaseConnections** - Should be <=5 for production, 0 for preview
2. **DataAPIRequests** - Should be high for preview, low for production
3. **ConnectionErrors** - Should be 0

## Verification Checklist

- [ ] Production has `DATABASE_URL`
- [ ] Preview does NOT have `DATABASE_URL`
- [ ] Preview has `FORCE_DATA_API=true`
- [ ] All environments have Aurora ARNs
- [ ] All environments have AWS credentials
- [ ] Connection logs show correct strategy
- [ ] No connection errors in logs
- [ ] Aurora metrics show expected pattern

---

*Last Updated: 2026-03-31*
*SECURITY: All credential values removed. Get values from Keychain via credentials.py.*
