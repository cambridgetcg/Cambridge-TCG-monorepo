# 🚀 Vercel Deployment Guide for RewardsPro

## Vercel Framework Settings

Based on your Vercel dashboard settings, here's the complete configuration guide:

### 1. Framework Preset
- **Framework**: Remix (auto-detected)
- **Why**: Vercel automatically detects Remix from package.json and vite.config.ts

### 2. Build Settings

#### Build Command
```bash
npm run build:migrate
```
- Runs Prisma migrations before building
- Generates Prisma client
- Builds Remix application with Vite

#### Output Directory
```
build
```
- This is where Remix outputs the production build
- Contains both client and server bundles

#### Install Command
```bash
npm install --legacy-peer-deps
```
- Uses legacy peer deps to avoid conflicts with Shopify packages
- Ensures all dependencies are installed

#### Development Command
```bash
npm run dev
```
- For local development (not used in production)

### 3. Root Directory Settings
- **Root Directory**: Leave empty (.)
- **Include files outside root**: Not needed
- **Skip deployments**: Optional (can enable for efficiency)

### 4. Node.js Version
- **Version**: 20.x (or latest LTS)
- Set in package.json engines field:
```json
"engines": {
  "node": ">=20.10.0"
}
```

## vercel.json Configuration

```json
{
  "framework": "remix",
  "buildCommand": "npm run build:migrate",
  "installCommand": "npm install --legacy-peer-deps",
  "outputDirectory": "build",
  "regions": ["arn1"],
  "env": {
    "NODE_ENV": "production"
  },
  "build": {
    "env": {
      "NODE_ENV": "production"
    }
  }
}
```

## Environment Variables Setup

### Production Environment
In Vercel Dashboard → Settings → Environment Variables → Production:

```bash
# Database (Direct Connection)
DATABASE_URL=postgresql://username:password@host:5432/dbname
DIRECT_URL=postgresql://username:password@host:5432/dbname

# AWS Aurora Data API (Fallback)
AURORA_RESOURCE_ARN=arn:aws:rds:region:account:cluster:name
AURORA_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name
AURORA_DATABASE_NAME=rewardspro

# AWS Credentials
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=eu-north-1

# Shopify
SHOPIFY_API_KEY=your-api-key
SHOPIFY_API_SECRET=your-api-secret
SCOPES=read_orders,write_store_credit_account_transactions
SHOPIFY_APP_URL=https://your-app.vercel.app
```

### Preview Environment
In Vercel Dashboard → Settings → Environment Variables → Preview:

```bash
# NO DATABASE_URL for preview (forces Data API)

# AWS Aurora Data API (Required)
AURORA_RESOURCE_ARN=arn:aws:rds:region:account:cluster:name
AURORA_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name
AURORA_DATABASE_NAME=rewardspro
FORCE_DATA_API=true

# AWS Credentials
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=eu-north-1

# Shopify
SHOPIFY_API_KEY=your-api-key
SHOPIFY_API_SECRET=your-api-secret-preview
SCOPES=read_orders,write_store_credit_account_transactions
```

## Important Prisma Configuration Notes

### Build-time vs Runtime DATABASE_URL
The `vercel.json` includes a dummy DATABASE_URL in the build environment:
```json
"build": {
  "env": {
    "DATABASE_URL": "postgresql://dummy:dummy@localhost:5432/dummy"
  }
}
```

**Why?** 
- Prisma requires DATABASE_URL during `prisma generate` at build time
- The dummy URL is only for generating the Prisma Client types
- At runtime, the actual DATABASE_URL from environment variables is used
- Preview environments will use Data API instead (no DATABASE_URL needed at runtime)

### directUrl Field Removed
The `directUrl` field has been removed from `schema.prisma` because:
- It's optional and only needed for migrations
- Preview environments don't have DIRECT_URL
- Migrations should be run separately, not during build

## Common Build Errors and Solutions

### 1. Module Not Found Errors
**Error**: `Cannot find module '@remix-run/route-config'`
**Solution**: Move module from devDependencies to dependencies

### 2. Functions Pattern Error
**Error**: `The pattern "app/**/*.tsx" doesn't match any Serverless Functions`
**Solution**: Remove functions configuration from vercel.json (Remix handles this)

### 3. Build Fails on Route Files
**Error**: `Unexpected token` in non-route files
**Solution**: Ensure only route components are in app/routes/ directory

### 4. Database Connection Errors
**Error**: Connection timeout or too many connections
**Solution**: Use environment-based routing (Data API for preview, direct for production)

## Deployment Checklist

Before deploying:

- [ ] Run `npm run build` locally to test
- [ ] Verify all environment variables are set in Vercel
- [ ] Check DATABASE_URL encoding (special characters)
- [ ] Ensure CLAUDE.md files are NOT in routes directory
- [ ] Verify package.json has correct Node version
- [ ] Test database connection with `npx prisma db pull`

## Deployment Commands

```bash
# Test build locally
npm run build

# Test with migrations
npm run build:migrate

# Deploy to Vercel (if using Vercel CLI)
vercel --prod

# Check deployment logs
vercel logs --environment=production
```

## Post-Deployment Verification

1. Check build logs in Vercel dashboard
2. Verify environment variables are loaded
3. Test database connection in logs
4. Check function logs for errors
5. Monitor Aurora CloudWatch metrics

## Rollback Strategy

If deployment fails:
1. Check Vercel dashboard for error details
2. Revert to previous deployment in Vercel
3. Fix issues locally
4. Test thoroughly before redeploying

---

*Last Updated: September 1, 2025*