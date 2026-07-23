# RewardsPro Deployment Guide

## Marketing site (`rewardspro.io`)

The public marketing site is a separate Cloudflare Pages project named
`rewardspro-landing`. Its source now lives at `landing/public`; it is not built
from the Remix/Vercel application.

Preview locally from `apps/rewardspro/landing`:

```bash
wrangler pages dev public
```

Deploy only after an explicit production release decision:

```bash
wrangler pages deploy public \
  --project-name rewardspro-landing \
  --branch main \
  --skip-caching
```

`--skip-caching` is deliberate. A cached direct upload produced an empty
deployment on 23 July 2026; forcing the three public assets plus `_headers`
produced a byte-identical, healthy deployment.

Verify the immutable `*.pages.dev` URL before checking the custom domain. Then
verify `https://rewardspro.io`, `/privacy-policy`, `robots.txt`, `sitemap.xml`,
external links, responsive layout, and the visible integration status labels.
Cloudflare Pages retains earlier deployments for rollback.

## Embedded Shopify application

## Pre-Push Checklist

- [ ] `npm run build` passes with no errors
- [ ] No `console.log` left in production code (use `console.error` for error logging)
- [ ] TypeScript compiles cleanly: `npx tsc --noEmit`
- [ ] All environment variables are set in Vercel dashboard
- [ ] Database migrations are applied (if schema changed)

## Deployment Steps

### 1. Stage and Commit

```bash
git add <files>
git commit -m "feat/fix/chore: description of change"
```

### 2. Verify Build Locally

```bash
npm run build
```

Fix any build errors before pushing.

### 3. Push to Deploy

```bash
git push origin main
```

This triggers Vercel auto-deploy for production.

### 4. Verify on Vercel

1. Open [Vercel Dashboard](https://vercel.com) and check the deployment status
2. Wait for the build to complete (typically 2-3 minutes)
3. Check the deployment logs for any runtime errors
4. Verify the preview URL works before promoting (if using preview branches)

### 5. Post-Deploy Verification

- [ ] App loads in Shopify admin (`/app`)
- [ ] Members page loads without errors
- [ ] Webhook endpoints respond (check Shopify webhook logs)
- [ ] Storefront widget renders for logged-in customers

## Database Migrations

If `prisma/schema.prisma` was changed:

```bash
# Generate migration SQL
npx prisma migrate dev --name describe_change

# Apply via Data API (for Aurora Serverless)
node scripts/migrate-via-data-api.js
```

Never use `prisma migrate deploy` directly — Aurora Serverless requires the Data API adapter.

## Rollback

### Quick Rollback (Vercel)

1. Open Vercel Dashboard > Deployments
2. Find the last known-good deployment
3. Click the three-dot menu > "Promote to Production"

### Git Rollback

```bash
# Revert the last commit
git revert HEAD
git push origin main

# Or reset to a specific commit (destructive — confirm first)
git log --oneline -10  # find the target commit
git revert <commit-hash>
git push origin main
```

## Environment Notes

| Environment | DB Connection | Deploy Trigger |
|-------------|--------------|----------------|
| Production  | Direct (DATABASE_URL) | Push to `main` |
| Preview     | Aurora Data API (AURORA_*) | Push to any branch / PR |
| Local       | Direct (DATABASE_URL) | `npm run dev` |
