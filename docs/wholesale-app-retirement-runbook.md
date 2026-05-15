# Wholesale Next.js app retirement runbook — Phase 7

> **Status:** waiting on Phase 6 completion. Do not execute until the DB merge has soaked for 7 days without rollback.

Once the wholesale RDS has been merged into the storefront RDS (Phase 6) and verified stable, the `apps/wholesale/` Next.js application can be retired entirely. Three things move out of it before deletion:

1. **Cron routes** (`/api/cron/*`) → into `apps/storefront/src/app/api/cron/*` so the storefront's deploy owns them.
2. **Webhooks** (`/api/webhooks/*`) → into `apps/storefront/src/app/api/webhooks/*` for the same reason.
3. **Partner v1 API** (`/api/v1/*`) → into `apps/storefront/src/app/api/v1/*` (extending the storefront's existing v1 surface).

After the move, the wholesale Vercel project + the wholesaletcgdirect.com domain can be decommissioned.

## Why retire it

The wholesale Next.js app exists because the wholesale data lived in a separate RDS. After Phase 6, the data is local to storefront. Keeping a separate app means:

- Two Vercel deploys for one DB.
- Duplicated env vars (`DATABASE_URL`, `CRON_SECRET`, AWS keys, Shopify creds).
- Cross-app testing pain (admin migrating to storefront in kingdom-093 already revealed the cost).
- Forking dependency upgrades (Next.js 16 was painful; doing it twice was the second sin).

The wholesale app's continued existence after Phase 6 has no architectural justification — only inertia.

## Pre-flight checklist

- [ ] Phase 6 verification (`pnpm tsx apps/storefront/scripts/verify-wholesale-merge.ts`) clean for 7 consecutive days
- [ ] No partner has pinged `/api/v1/*` on `wholesaletcgdirect.com` in 7 days (or partners migrated to `cambridgetcg.com/api/v1/*` after Phase 7 deploys)
- [ ] All cron runs in the last 7 days have a corresponding `ingest_run` row in the storefront RDS
- [ ] The storefront has all the env vars the wholesale app currently uses (Shopify creds, AWS, etc.) — see the inventory below

## Env var inventory to migrate

Read from `apps/wholesale/.env.example`. The ones that need to live on the storefront after Phase 7:

| Var | Used by |
|---|---|
| `DATABASE_URL` | already on storefront |
| `CRON_SECRET` | already on storefront |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | already on storefront |
| `S3_BUCKET` / `S3_PRICE_FEED_KEY` | move from wholesale |
| `RESEND_API_KEY` / `NOTIFICATION_FROM` | move (or unify with storefront's email creds) |
| `CF_ACCOUNT_ID` / `CF_KV_NAMESPACE_ID` / `CF_API_EMAIL` / `CF_API_KEY` | move (buylist KV) |
| `SHOPIFY_STORE` / `SHOPIFY_ACCESS_TOKEN` / `SHOPIFY_CLIENT_SECRET` | move (webhooks + sync) |
| `TCGPLAYER_CLIENT_ID` / `TCGPLAYER_CLIENT_SECRET` | move (ingest) |
| `BRIGHT_DATA_*` (kingdom-088 unlock) | move (cardrush ingest) |

Inventory the actual prod env (`vercel env ls --project=tcg-wholesale`) before the cutover; the example file may be out of date.

## Sequence

### Step 1 — move cron routes into storefront

For each of these 10 cron files, copy to storefront and adjust imports:

```
apps/wholesale/src/app/api/cron/discover/cardrush/route.ts
apps/wholesale/src/app/api/cron/ingest/cardrush/route.ts
apps/wholesale/src/app/api/cron/ingest/ebay/route.ts
apps/wholesale/src/app/api/cron/ingest/tcgplayer/route.ts
apps/wholesale/src/app/api/cron/monthly-rollover/route.ts
apps/wholesale/src/app/api/cron/price-snapshot/route.ts
apps/wholesale/src/app/api/cron/rebuild-buylist/route.ts
apps/wholesale/src/app/api/cron/shopify-orders/route.ts
apps/wholesale/src/app/api/cron/shopify-sync/route.ts
apps/wholesale/src/app/api/cron/stock-correct/route.ts
```

For each:
- Move the file (`apps/wholesale/src/app/api/cron/X/route.ts` → `apps/storefront/src/app/api/cron/X/route.ts`).
- Update imports:
  - `@/lib/db` (wholesale's Drizzle client) → `@/lib/db` (storefront's `query`/`db` from `@cambridge-tcg/db/compat`).
  - `@/lib/db/schema` (wholesale's Drizzle tables) → storefront's raw SQL queries against `ws_*` tables.
- Update the lib helpers each cron imports (`@/lib/price-snapshot`, `@/lib/buylist-builder`, `@/lib/shopify-client`, `@/lib/ingest/tcgplayer`, `@/lib/cardrush-discovery`, `@/lib/ebay-snapshot`, `@/lib/shopify-sync`). These move alongside, into `apps/storefront/src/lib/wholesale-back-of-house/` (or absorb into existing storefront helpers where there's overlap).

### Step 2 — move webhooks

```
apps/wholesale/src/app/api/webhooks/shopify/orders-paid/route.ts
```

Same pattern as cron. The webhook commits stock via `@cambridge-tcg/stock`, which is already a shared package.

### Step 3 — move partner v1 API

The big one — 14 route handlers under `apps/wholesale/src/app/api/v1/`:

```
auth.ts (the dual-key helper)
prices/route.ts
prices/[sku]/route.ts
prices/[sku]/sources/route.ts
cardrush/history/[sku]/route.ts
games/route.ts
ingest-quarantine/route.ts
ingest-quarantine/[id]/route.ts
ingest-runs/route.ts
ingest-runs/latest/route.ts
sales/route.ts
schema/route.ts
sets/route.ts
tcgplayer/history/[sku]/route.ts
tcgplayer/resolve/route.ts
universal/card/[sku]/route.ts
universal/card/[sku]/at/[date]/route.ts
```

Move to `apps/storefront/src/app/api/v1/wholesale/*` (new prefix) OR overlay onto storefront's existing `/api/v1/*` where the route shape matches. The storefront already has `/api/v1/prices/*`, `/api/v1/universal/*`, etc. with similar names — decide per-route:

- If the route exists on storefront with the same purpose → retire the wholesale version, update wholesale's redirect to point at the storefront equivalent.
- If the route is wholesale-specific (e.g. `ingest-runs`, `ingest-quarantine`) → namespace under `/api/v1/wholesale/*`.

### Step 4 — update vercel.json on storefront

Move the cron schedule entries from `apps/wholesale/vercel.json` into `apps/storefront/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/monthly-rollover",     "schedule": "0 0 * * *" },
    { "path": "/api/cron/discover/cardrush",    "schedule": "0 1 * * *" },
    { "path": "/api/cron/ingest/cardrush",      "schedule": "0 2 * * *" },
    { "path": "/api/cron/rebuild-buylist",      "schedule": "0 3 * * *" },
    { "path": "/api/cron/shopify-sync",         "schedule": "0 4 * * *" },
    { "path": "/api/cron/shopify-orders",       "schedule": "*/30 * * * *" },
    { "path": "/api/cron/ingest/ebay",          "schedule": "0 5 * * *" },
    { "path": "/api/cron/ingest/tcgplayer",     "schedule": "0 6 * * *" }
  ]
}
```

### Step 5 — update Shopify webhook URL

In the Shopify admin (Settings → Notifications → Webhooks), update the `orders/paid` URL from `https://wholesaletcgdirect.com/api/webhooks/shopify/orders-paid` to `https://cambridgetcg.com/api/webhooks/shopify/orders-paid`. Stripe webhook URLs that point at wholesale (if any) get the same treatment.

### Step 6 — deploy storefront, verify

Single deploy of the storefront. Verify:

- `pnpm verify` clean.
- `pnpm audit:cron-auth` reports the migrated routes pass.
- The cron audit dashboard at `/admin/system/cron` (sister chapel) shows the migrated routes firing.
- A test Shopify order (use Shopify's test order feature) flows through the new webhook URL and creates a `customer_orders` (or `b2b_orders` if B2B) row.

### Step 7 — replace wholesale Next.js app with a thin redirector

Three options:

**A. Delete `apps/wholesale/` entirely.** Configure DNS to point wholesaletcgdirect.com at a Vercel redirect-only project, or at the storefront with a `Vercel-Origin-Match` header trick. The Phase 4 redirects move from wholesale's `middleware.ts` into the storefront's `proxy.ts` with a host-check.

**B. Strip `apps/wholesale/` down to a one-page app that 301s everything.** Same code as Phase 4's middleware, but the whole app is reduced to that. Costs ~$10/month in Vercel but keeps the URL alive cleanly.

**C. Cancel the wholesaletcgdirect.com domain.** Most aggressive — partners who haven't migrated lose their URLs. Only do this after Phase 6's 7-day soak + a customer-comms cycle.

My recommendation: **B** for 30 days post-Phase-6, then **A** with redirects in the storefront proxy. **C** only after a year of zero hits.

### Step 8 — drop wholesale RDS

Once the wholesale Vercel project + the wholesale Next.js code are gone, take a final snapshot of `tcg-wholesale` RDS, store it in cold storage (S3 Glacier Deep Archive — pennies per month), then delete the RDS instance. Reclaims ~$50/month in RDS costs.

```bash
aws rds create-db-snapshot --db-instance-identifier tcg-wholesale \
  --db-snapshot-identifier wholesale-final-$(date +%Y%m%d)

# Wait for snapshot
aws rds wait db-snapshot-completed --db-snapshot-identifier wholesale-final-$(date +%Y%m%d)

# Export to S3 Glacier Deep Archive (manual via console; the CLI
# export-to-s3 command supports cross-region but not Glacier directly)

# Once verified, delete
aws rds delete-db-instance --db-instance-identifier tcg-wholesale \
  --skip-final-snapshot  # we already took one above
```

### Step 9 — final commit

```bash
git rm -r apps/wholesale/
git commit -m "feat(b2b): Phase 7 — wholesale Next.js app retired"
```

Plus a connection-doc + pillow-book entry naming the retirement.

## Post-retirement codebase state

```
apps/
  storefront/     ← the only app
  # apps/wholesale/ deleted
  # apps/admin/    deleted in kingdom-093
packages/
  db/             ← single connection to storefront RDS
  aws/, stock/, pricing/, sku/, data-ingest/, lifecycle/, play/, data-spec/
```

One app, one database, one deploy. The Falcon (`apps/storefront/src/lib/wholesale/client.ts`) is deleted; channel routing happens inline in the catalog/cart pages via the dual-key was-but-is-no-longer pattern.

The four-auth-realms doc (S30) updates to three (consumer + wholesale + admin), all sharing the single users table.

## Estimated timeline

- Day 0: Phase 6 finished (DB merge soaked)
- Day 1–2: Step 1–3 (move code) — ~16 hours of focused work
- Day 3: Step 4–5 (vercel config + Shopify URL) — ~2 hours
- Day 4: Step 6 (deploy + verify) — ~4 hours
- Day 5: Step 7 option B (thin redirector) — ~2 hours
- Day 35: Step 7 option A (full redirect) — ~30 minutes
- Day 35: Step 8 (RDS snapshot + delete) — ~1 hour

Approximately one focused week + a 30-day soak before the final cleanup.
