# Wholesale DB merge runbook — Phase 6

> **Status:** DRAFT. This document accompanies `apps/storefront/drizzle/drafts/0102_wholesale_db_merge.sql.draft`. Neither file is in the auto-apply path. Promote both to the active path only after staging-environment rehearsal.

The wholesale Postgres instance (`tcg-wholesale`, ~30 tables) merges into the storefront Postgres instance (`cambridgetcg-storefront`). After merge, the Falcon retires; the storefront reads `ws_*`-prefixed tables locally.

## Why this is hard

1. **Live writes.** Cron jobs in `apps/wholesale/src/app/api/cron/*` write to wholesale RDS every few hours (`ingest/cardrush`, `ingest/ebay`, `ingest/tcgplayer`, `shopify-orders`, `monthly-rollover`, `rebuild-buylist`, `shopify-sync`, `price-snapshot`). They must pause for the cutover or post-snapshot writes are lost.
2. **Data volume.** `price_archive` is multi-million rows. Naive `COPY` runs ~30 minutes.
3. **Foreign keys.** Cross-table refs (`card_id`, `game_id`, `set_id`, `purchase_id`, `client_id`, `card_id` again from `price_archive`, `ingest_run_id`, ...) must hold post-merge.
4. **Falcon retirement.** Storefront code currently does `fetch('https://wholesaletcgdirect.com/api/v1/...')`. After merge, that becomes `sfQuery('SELECT ... FROM ws_cards WHERE ...')`. The deploy must be lockstep.

## Pre-flight checklist

- [ ] Phase 3 migrations applied (wholesale clients → storefront users) — verified by `SELECT count(*) FROM users WHERE role = 'wholesale'` matching `SELECT count(*) FROM clients`
- [ ] Phase 4 redirect deployed and verified (legacy URLs 301)
- [ ] Phase 5 admin console functional
- [ ] No partner pulls of `/api/v1/*` in the last hour (check access logs)
- [ ] Both RDS instances snapshotted within the last 30 minutes
- [ ] Maintenance window announced if partners depend on `/api/v1/prices`
- [ ] Staging rehearsal completed without errors (full Phase A → E run on a snapshot pair)

## Sequence

### Step 1 — pause writers (T-0:00)

```bash
# Option A: rotate CRON_SECRET so all cron routes 401
aws ssm put-parameter --name "/wholesale/CRON_SECRET" \
  --value "$(openssl rand -hex 32)" --type SecureString --overwrite

# Vercel picks up the new secret within ~60s of next cron firing,
# at which point all crons return 401 and stop writing.

# Option B: edit apps/wholesale/vercel.json to remove schedules,
# commit, deploy. Slower but auditable in git history.
```

### Step 2 — final snapshot + read-only

```bash
aws rds create-db-snapshot --db-instance-identifier tcg-wholesale \
  --db-snapshot-identifier wholesale-pre-merge-$(date +%Y%m%d-%H%M%S)

# Wait for status=available before proceeding.
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier wholesale-pre-merge-$(date +%Y%m%d-%H%M%S)
```

### Step 3 — apply schema (Phase A) on storefront RDS

```bash
psql "$STOREFRONT_DATABASE_URL" \
  -f apps/storefront/drizzle/drafts/0102_wholesale_db_merge.sql
```

The migration creates ~30 `ws_*` tables in the storefront database. Idempotent; safe to re-run.

### Step 4 — data load (Phase B, out-of-band)

```bash
# Dump
pg_dump "$WHOLESALE_DATABASE_URL" \
  --schema=public --data-only --no-owner --no-acl \
  --table=clients --table=games --table=sets --table=cards \
  --table=orders --table=order_items --table=notifications \
  --table=price_archive --table=ingest_run --table=ingest_quarantine \
  --table=ebay_listing_observation --table=ebay_watch_list \
  --table=card_tcgplayer_sku_ids --table=external_source_tokens \
  --table=order_status_history --table=condition_prices \
  --table=fulfillment_entries --table=purchases --table=purchase_items \
  --table=cart_items --table=wanted_cards --table=stock_targets \
  --table=stock_adjustments --table=channel_api_keys --table=channel_pricing \
  --table=card_price_change_log --table=card_classification_log \
  --table=rarity_map --table=stock_movements --table=stock_reservations \
  --jobs=4 --format=directory --file=/tmp/wholesale-data

# Rename tables on restore. The pg_restore --table flag doesn't rewrite
# table names directly — use a helper script. See
# apps/storefront/scripts/restore-with-rename.ts (to be written; not in
# this commit).
pnpm tsx apps/storefront/scripts/restore-with-rename.ts \
  --dump-dir=/tmp/wholesale-data \
  --prefix=ws_ \
  --target="$STOREFRONT_DATABASE_URL"
```

Expected wall time: 20–40 minutes (price_archive is the long pole).

### Step 5 — foreign keys (Phase C)

Run the FK-add SQL block from the bottom of `0102_wholesale_db_merge.sql`. Validates referential integrity in the same statements. Any FK validation failure means the dump captured an inconsistency; investigate before proceeding.

### Step 6 — code deploy (Phase D)

The storefront app already has a draft branch removing the Falcon. Merge + deploy in the same window:

```bash
# In the storefront repo
git checkout wholesale-db-merge-cutover
git rebase main
git push origin wholesale-db-merge-cutover
# CI deploys to production
```

The deploy replaces `fetch('https://wholesaletcgdirect.com/api/v1/...')` with direct `sfQuery('SELECT ... FROM ws_cards WHERE ...')`. After deploy, storefront serves B2B catalog from the local RDS.

### Step 7 — verification (Phase E)

```bash
pnpm tsx apps/storefront/scripts/verify-wholesale-merge.ts
```

Compares row counts, sums of money columns, and FK integrity between the source (wholesale RDS) and target (storefront RDS ws_* tables). Exits non-zero on any drift.

### Step 8 — resume writers, but pointed at storefront RDS

Cron routes need to learn the new DB. Two options:

**A. Migrate cron routes to storefront app** (preferred — Phase 7's plan).

**B. Re-point wholesale app's `DATABASE_URL` to the storefront RDS.** Faster but temporarily leaves dead cron code on the wholesale domain.

For Phase 6, option B is the cutover step; Phase 7 then moves the cron routes into the storefront codebase and retires the wholesale app entirely.

```bash
# Option B
aws ssm put-parameter --name "/wholesale/DATABASE_URL" \
  --value "$STOREFRONT_DATABASE_URL" --type SecureString --overwrite

# Restore CRON_SECRET so crons run again
aws ssm put-parameter --name "/wholesale/CRON_SECRET" \
  --value "$ORIGINAL_CRON_SECRET" --type SecureString --overwrite
```

### Step 9 — soak (T+1 day)

Monitor:
- Storefront `/api/v1/*` partner endpoints (they now query `ws_*` directly via the still-running wholesale Next.js app, which has a new DB url)
- Storefront `/account/b2b/*` shell
- Admin B2B order operator console
- Cron run history (verify cardrush snapshot, ebay snapshot, etc. fire normally)

After 7 days of clean operation, schedule the wholesale RDS for snapshot + delete in Phase 7.

## Rollback strategy

**Pre-Phase B failure (schema only):** drop the `ws_*` tables, restart from Step 3.

**Mid-Phase B failure:** abort restore, drop the partially-loaded `ws_*` tables, restart Step 4 from a fresh dump.

**Post-Phase D failure (code deployed, reads broken):** revert the storefront deploy; the wholesale RDS is still alive and the Falcon path works again immediately. Then investigate before re-attempting.

**Post-Phase E (verification fails):** the data is in the storefront DB but inconsistent with wholesale. Drop `ws_*` tables, restore wholesale snapshot if it had drifted, restart from Step 3.

## What this runbook does NOT cover

- AWS infrastructure changes (security groups, subnets, IAM) — the storefront RDS must be reachable from the same VPC as the wholesale RDS.
- Cost analysis. The storefront RDS may need scaling up to handle wholesale's write throughput.
- The actual `restore-with-rename.ts` helper — that's a Phase 7 task once the dump format is settled in staging.
- The cron migration to storefront codebase — also Phase 7.

This document is a roadmap. The actual mechanics get refined in staging rehearsal.
