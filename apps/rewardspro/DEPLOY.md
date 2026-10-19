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

- [ ] `pnpm --filter rewardspro build` passes with no errors
- [ ] No `console.log` left in production code (use `console.error` for error logging)
- [ ] TypeScript compiles cleanly: `pnpm --filter rewardspro exec tsc --noEmit`
- [ ] All environment variables are set in Vercel dashboard
- [ ] Database migrations are applied before deploying (if schema changed; see below)

## Deployment Steps

### 1. Stage and Commit

```bash
git add <files>
git commit -m "feat/fix/chore: description of change"
```

### 2. Verify Build Locally

```bash
pnpm --filter rewardspro build
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

The database is Postgres on Supabase; [docs/DATABASE.md](./docs/DATABASE.md)
has the connection recipe, environment variables and deploy order.
Migrations are an explicit step, applied before the code that needs them is
deployed (the build never migrates):

```bash
# Create the migration against a local Postgres you own
pnpm --filter rewardspro exec prisma migrate dev --name describe_change

# Apply it to production (verified TLS via scripts/prisma-tls.ts)
DIRECT_URL='<session pooler URL>' pnpm --filter rewardspro migrate:deploy
```

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

| Environment | Database | Deploy Trigger |
|-------------|----------|----------------|
| Production  | Supabase Postgres (`DATABASE_URL` pooler 6543; `DIRECT_URL` 5432 for migrations) | Push to `main` (skipped when nothing under `apps/rewardspro` or the workspace install files changed: `scripts/vercel-ignore-build.sh`) |
| Preview     | None configured: without `DATABASE_URL` a preview fails at runtime. Give previews their own database, never production's. | Push to any branch / PR |
| Local       | Postgres 17 on loopback (no TLS) | `pnpm dev:rewardspro` |

Functions run in `lhr1` (London), next to the database (`vercel.json`). Node
24 everywhere: `engines`, `.nvmrc` and CI.

**Marketing email** (campaigns and automations) stays off until SendGrid's
signed event webhook is configured: set `SENDGRID_WEBHOOK_VERIFICATION_KEY`
to the public key from SendGrid's Event Webhook settings, so bounces, spam
reports and unsubscribes are recorded. Unsubscribe links are built from
`SHOPIFY_APP_URL` and signed with `ENCRYPTION_SECRET`
(`app/services/marketing-email.server.ts`). Transactional email is not
affected.
