# Bounty Rebrand — DB Column + Table Rename Plan

Status: **DRAFT — not yet executed**. Read through, adjust, then run during a
quiet window with a rollback plan on standby.

The earlier rebrand (`cd47dc7`, `079d191`) rebranded all user-visible strings
and exposed `earnBerries` / `spendBerries` / `getBerriesHistory` / `BerriesEntry`
aliases. The DB schema still calls everything `points`. This plan completes the
rename at the storage layer.

## Full list of renames

### Tables

| Old | New |
|---|---|
| `points_ledger` | `berries_ledger` |
| `points_config` | `berries_config` |

### Columns

| Table | Old column | New column |
|---|---|---|
| `users` | `points_balance` | `berries_balance` |
| `users` | `lifetime_points` | `lifetime_berries` |
| `tiers` | `points_multiplier` | `berries_multiplier` |
| `berries_config` | `points_per_pound` | `berries_per_pound` |
| `berries_config` | `points_expire` | `berries_expire` |
| `raffles` | `entry_cost_points` | `entry_cost_berries` |
| `raffle_entries` | `points_spent` | `berries_spent` |
| `mystery_boxes` | `cost_points` | `cost_berries` |
| `mystery_box_opens` | `points_spent` | `berries_spent` |
| `reward_packs` | `cost_points` | `cost_berries` |
| `pack_opens` | `points_spent` | `berries_spent` |
| `spin_config` | `premium_cost_points` | `premium_cost_berries` |
| `pve_levels` | `first_clear_points` | `first_clear_berries` |
| `pve_levels` | `repeat_points` | `repeat_berries` |
| `pve_progress` | `total_points_earned` | `total_berries_earned` |

### Indexes

| Old | New |
|---|---|
| `idx_points_ledger_user` | `idx_berries_ledger_user` |

### Enum string values

`reward_type = 'points'` is stored as a discriminator in reward pool rows. Keep
it as `'points'` in the DB for compatibility — only the UI label ("Bonus
Berries") needs updating, and that's already shipped. **Do NOT** `UPDATE ...
SET reward_type = 'berries'` — it's a breaking change that forces application
code to handle both values during rollout.

## Approach — atomic cutover with VIEW shim

For this storefront's traffic level, full expand/contract is overkill. The
recommended shape is:

1. Deploy the code change that uses the new names. It expects the new schema.
2. Immediately run the migration in a single transaction.
3. Between deploy-start and migration-commit the old pods keep seeing the old
   schema (they still work). Once migration commits, new pods start serving
   the new schema. There is a ~few-second window where requests hitting old
   pods after the migration will 500 — acceptable for a small site during
   off-peak.
4. Tables get a backwards-compatible VIEW for one week so any stale deploys,
   cron jobs, or external consumers don't break.

For columns there is no clean view-shim — a column rename breaks any query
still using the old name. This is why the code deploy must precede the
migration by as little time as possible.

## Migration SQL (ready to paste)

```sql
-- drizzle/0033_rename_points_to_berries.sql
-- RUN INSIDE A TRANSACTION. migrate.mjs already wraps each file in BEGIN/COMMIT.

-- ── Tables ──
ALTER TABLE points_ledger RENAME TO berries_ledger;
ALTER TABLE points_config RENAME TO berries_config;

-- ── Columns ──
ALTER TABLE users             RENAME COLUMN points_balance        TO berries_balance;
ALTER TABLE users             RENAME COLUMN lifetime_points       TO lifetime_berries;

ALTER TABLE tiers             RENAME COLUMN points_multiplier     TO berries_multiplier;

ALTER TABLE berries_config    RENAME COLUMN points_per_pound      TO berries_per_pound;
ALTER TABLE berries_config    RENAME COLUMN points_expire         TO berries_expire;

ALTER TABLE raffles           RENAME COLUMN entry_cost_points     TO entry_cost_berries;
ALTER TABLE raffle_entries    RENAME COLUMN points_spent          TO berries_spent;

ALTER TABLE mystery_boxes     RENAME COLUMN cost_points           TO cost_berries;
ALTER TABLE mystery_box_opens RENAME COLUMN points_spent          TO berries_spent;

ALTER TABLE reward_packs      RENAME COLUMN cost_points           TO cost_berries;
ALTER TABLE pack_opens        RENAME COLUMN points_spent          TO berries_spent;

ALTER TABLE spin_config       RENAME COLUMN premium_cost_points   TO premium_cost_berries;

ALTER TABLE pve_levels        RENAME COLUMN first_clear_points    TO first_clear_berries;
ALTER TABLE pve_levels        RENAME COLUMN repeat_points         TO repeat_berries;
ALTER TABLE pve_progress      RENAME COLUMN total_points_earned   TO total_berries_earned;

-- ── Index ──
ALTER INDEX IF EXISTS idx_points_ledger_user RENAME TO idx_berries_ledger_user;

-- ── Backwards-compat VIEWs (safe: both renamed tables are still
-- simple single-table views, so INSERT/UPDATE/DELETE also work via
-- Postgres's automatic updatable-view rules). Drop these after a
-- week once you've confirmed nothing hits them.
CREATE VIEW points_ledger AS SELECT * FROM berries_ledger;
CREATE VIEW points_config AS SELECT * FROM berries_config;

COMMENT ON VIEW points_ledger IS 'LEGACY SHIM — drop after 2026-05-07. Use berries_ledger.';
COMMENT ON VIEW points_config IS 'LEGACY SHIM — drop after 2026-05-07. Use berries_config.';
```

## Rollback SQL (keep copy-pasteable)

```sql
-- Emergency rollback if post-deploy smoke tests fail.
-- Drops the compat views first, then reverses every rename.
BEGIN;

DROP VIEW IF EXISTS points_ledger;
DROP VIEW IF EXISTS points_config;

ALTER INDEX IF EXISTS idx_berries_ledger_user RENAME TO idx_points_ledger_user;

ALTER TABLE pve_progress      RENAME COLUMN total_berries_earned  TO total_points_earned;
ALTER TABLE pve_levels        RENAME COLUMN repeat_berries        TO repeat_points;
ALTER TABLE pve_levels        RENAME COLUMN first_clear_berries   TO first_clear_points;

ALTER TABLE spin_config       RENAME COLUMN premium_cost_berries  TO premium_cost_points;

ALTER TABLE pack_opens        RENAME COLUMN berries_spent         TO points_spent;
ALTER TABLE reward_packs      RENAME COLUMN cost_berries          TO cost_points;

ALTER TABLE mystery_box_opens RENAME COLUMN berries_spent         TO points_spent;
ALTER TABLE mystery_boxes     RENAME COLUMN cost_berries          TO cost_points;

ALTER TABLE raffle_entries    RENAME COLUMN berries_spent         TO points_spent;
ALTER TABLE raffles           RENAME COLUMN entry_cost_berries    TO entry_cost_points;

ALTER TABLE berries_config    RENAME COLUMN berries_expire        TO points_expire;
ALTER TABLE berries_config    RENAME COLUMN berries_per_pound     TO points_per_pound;

ALTER TABLE tiers             RENAME COLUMN berries_multiplier    TO points_multiplier;

ALTER TABLE users             RENAME COLUMN lifetime_berries      TO lifetime_points;
ALTER TABLE users             RENAME COLUMN berries_balance       TO points_balance;

ALTER TABLE berries_config RENAME TO points_config;
ALTER TABLE berries_ledger RENAME TO points_ledger;

COMMIT;
```

## Code changes required (per file)

After the migration runs, these SQL strings and TS property names need to
flip. Do this **in the deploy that triggers the migration**.

### `src/lib/membership/db.ts`
- Line ~207: `INSERT INTO points_ledger` → `berries_ledger`
- Line ~218: `UPDATE users SET points_balance = ... lifetime_points` → `berries_balance`, `lifetime_berries`
- Line ~227: `SELECT points_balance FROM users` → `berries_balance`
- Line ~239: `UPDATE users SET points_balance` → `berries_balance`
- Line ~246: `SELECT * FROM points_ledger` → `berries_ledger`
- Line ~288: `SELECT * FROM points_config` → `berries_config`
- Line ~289: `row.points_per_pound` → `row.berries_per_pound`
- Line ~298: `perks.points_multiplier` → `perks.berries_multiplier`
- Line ~362: `data.pointsBalance, data.lifetimePoints` — import payload key, keep as-is; it's external JSON
- All column references in the INSERT/UPDATE strings

### `src/lib/membership/types.ts`
- `PointsEntry.balance` / `.amount` — no change (generic field names, keep)
- `MemberProfile.points_balance` → `berries_balance`
- `MemberProfile.lifetime_points` → `lifetime_berries`
- `TierPerks.points_multiplier` → `berries_multiplier`

### `src/lib/rewards/db.ts`
- `reward_packs.cost_points` → `cost_berries` in queries
- `raffles.entry_cost_points` → `entry_cost_berries`
- `mystery_boxes.cost_points` → `cost_berries`
- `raffle_entries.points_spent` / `mystery_box_opens.points_spent` / `pack_opens.points_spent` → `berries_spent`

### `src/lib/rewards/types.ts`
- `Raffle.entry_cost_points` → `entry_cost_berries`
- `MysteryBox.cost_points` → `cost_berries`
- `RewardPack.cost_points` → `cost_berries`
- Any `*_spent` fields → `berries_spent`

### `src/app/api/rewards/spin/route.ts`
- `config.premium_cost_points` → `config.premium_cost_berries`

### `src/app/api/rewards/packs/[id]/open/route.ts`
- `pack.cost_points` → `pack.cost_berries`

### `src/app/api/game/pve/route.ts`
- `total_points_earned` in the SELECT → `total_berries_earned`

### `src/app/api/game/pve/[levelId]/route.ts`
- `level.first_clear_points` → `first_clear_berries`
- `level.repeat_points` → `repeat_berries`
- `total_points_earned` in the INSERT — `total_berries_earned`

### `src/app/admin/rewards/page.tsx`
- `entry_cost_points` / `cost_points` in displayed fields → new names

### `src/app/rewards/{packs,mystery-boxes,raffles,spin}/` pages
- Access on `cost_points` / `entry_cost_points` / `premium_cost_points` → renamed

### `src/app/account/membership/page.tsx`
- `profile.points_balance` → `berries_balance`
- `profile.lifetime_points` → `lifetime_berries`
- `entry.points_multiplier` (inside tier rows) → `berries_multiplier`

### `src/app/play/adventure/page.tsx`
- `level.first_clear_points` / `level.repeat_points` — renamed

### `drizzle/0030_pve_seed.sql`, `drizzle/0031_fix_pve_credits.sql`
- If re-running on a fresh DB, update `first_clear_points` / `repeat_points`
  column names in the INSERT statements. (Alternatively mark them applied in
  `schema_migrations` manually after the rename so they don't re-run.)

## Pre-flight verification

Run against the target DB (prod or staging copy) **before** migrating:

```sql
-- Confirm every table/column is present and shapes match expectations
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('points_ledger','points_config');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name IN ('points_balance','lifetime_points');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'tiers' AND column_name = 'points_multiplier';

-- Count data to verify backfill is not needed (rename is in-place, no data movement)
SELECT COUNT(*) AS ledger_rows FROM points_ledger;
SELECT SUM(points_balance) AS total_balance, SUM(lifetime_points) AS total_lifetime FROM users;
```

Save the results. After migration you can re-run with new names and confirm
the numbers match.

## Post-flight verification

```sql
-- New names exist
SELECT 1 FROM berries_ledger LIMIT 1;
SELECT 1 FROM berries_config LIMIT 1;
SELECT berries_balance, lifetime_berries FROM users LIMIT 1;
SELECT berries_multiplier FROM tiers LIMIT 1;

-- Old names are shimmed (views) or renamed (columns — will error on old names)
SELECT 1 FROM points_ledger LIMIT 1;  -- works via VIEW
-- SELECT points_balance FROM users;  -- should ERROR; no column shim

-- Row counts unchanged
SELECT COUNT(*) FROM berries_ledger;  -- == pre-flight ledger_rows
SELECT SUM(berries_balance) FROM users;  -- == pre-flight total_balance

-- App smoke tests
-- GET /api/membership/berries → 200 with history payload
-- GET /api/game/pve → 200 with levels including *_berries columns
-- Load /rewards, /rewards/packs, /rewards/mystery-boxes → no console errors
```

## Deployment playbook

1. **Branch**: open a branch `rebrand/db-rename` off main.
2. **Code change**: apply every bullet in the "Code changes required" section.
   Run typecheck and engine sim locally (they should be green since the
   rename is semantic, not behavioural).
3. **Dry run on new RDS first**: `node scripts/migrate.mjs` against the
   `cambridgetcg-storefront` instance. Verify with the post-flight queries.
   Click through `/bounty`, `/rewards`, `/play/adventure`.
4. **PR**: open a PR against main. Tag yourself, review the diff, merge when
   comfortable.
5. **Schedule**: pick a 5-minute quiet window (e.g. UK 03:00–03:05).
6. **Execute**:
   - (a) Merge PR → Vercel starts building.
   - (b) Once Vercel reports "Ready" for the production deployment but BEFORE
     promoting, run the migration against the prod RDS.
   - (c) Promote the build in Vercel immediately after migration COMMITs.
7. **Monitor**: 30 min of watching `/api/health` (or whatever your smoke
   endpoint is) and the Vercel function logs for 5xx.
8. **Cleanup** (one week later, if no incidents):
   - `DROP VIEW points_ledger; DROP VIEW points_config;`
   - Remove `earnPoints` / `spendPoints` / `getPointsHistory` exports from
     `src/lib/membership/db.ts`, keeping only the Berries names.
   - Remove the `PointsEntry` type alias and keep `BerriesEntry`.
   - Delete `src/app/api/membership/points/route.ts` (the re-export shim).

## Rollback criteria

Pull the rollback SQL the moment any of these trip:
- `/api/membership/berries` returns 500 for more than one user
- `/rewards` or `/rewards/packs` fails to render for signed-in users
- PVE victory endpoint errors when trying to insert into `pve_progress`
- Admin page at `/admin/rewards` errors fetching boxes/raffles/packs
- `berries_ledger` row count diverges from pre-flight

When rolling back: run the Rollback SQL, revert the PR on Vercel via Promote
Previous. The VIEW shims mean the old `points_ledger` queries still work
against the new tables, so a code revert to the pre-rename deploy **should**
survive even if you haven't rolled back the SQL yet — but don't rely on that.

## What about the new `cambridgetcg-storefront` RDS?

That DB only has test data. Either:
- Run this migration against it too once you're confident (same SQL, same
  code deploy), OR
- Drop and re-migrate from zero using updated `drizzle/*.sql` files where the
  rename has been applied in-place to 0016/0017/0027/0029/0030.

The second option is cleaner for the dev environment — modify the source
migrations in place (since nobody else depends on them) and re-run
`migrate.mjs` against a freshly `DROP SCHEMA public CASCADE`-ed DB.

## Not in scope for this migration

- Renaming the `reward_type='points'` enum value (too much code coordination).
- Renaming JS/TS function names `earnPoints` / `spendPoints` (aliases already
  exist; finish the rename on a case-by-case basis in normal PRs).
- The `/api/membership/points` route shim (remove in a later cleanup commit).
