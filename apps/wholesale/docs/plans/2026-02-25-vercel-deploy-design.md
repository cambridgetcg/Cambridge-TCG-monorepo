# P14 — Vercel Deployment with Neon PostgreSQL

**Date:** 2026-02-25
**Status:** Design

## Summary

Migrate from SQLite/libsql to Neon PostgreSQL and deploy to Vercel. Full Postgres switch (no dual DB support). Uses `postgres.js` driver with proper timestamp columns and `numeric` for money.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DB strategy | Full PostgreSQL | Single schema, no conditional logic, simpler code |
| PG driver | postgres (postgres.js) | Pure JS, no native deps, serverless-friendly |
| Timestamps | `timestamp` columns | Proper types, date range queries, Postgres standard |
| Money columns | `numeric(10,2)` | Exact decimal, no floating point rounding on GBP |
| Exchange rates | `numeric(10,6)` | Higher precision for JPY/GBP conversion rates |

## Schema Changes

### Column Type Mapping

| SQLite | PostgreSQL | Affected columns |
|--------|-----------|-----------------|
| `sqliteTable` | `pgTable` | All 7 tables |
| `integer("id").primaryKey({ autoIncrement: true })` | `serial("id").primaryKey()` | All PKs |
| `integer("...", { mode: "boolean" })` | `boolean("...")` | games.active, sets.active |
| `text("created_at").default(sql\`(datetime('now'))\`)` | `timestamp("created_at").defaultNow()` | orders.created_at, clients.created_at |
| `text("updated_at").default(sql\`(datetime('now'))\`)` | `timestamp("updated_at").defaultNow()` | orders.updated_at |
| `text` (date/time fields) | `timestamp` (nullable where appropriate) | quoted_at, quoted_expires_at, last_synced_at, stock_checked_at |
| `text("release_date")` | `text("release_date")` | sets.release_date (keep text — it's a display string, not queried as date) |
| `text("date")` | `text("date")` | price_history.date (YYYY-MM-DD string used as composite unique key) |
| `real` (money) | `numeric("...", { precision: 10, scale: 2 })` | base_gbp, price_ex_vat, total_ex_vat, volume_discount, unit_price_ex_vat, original_unit_price, line_total, current_month_spend, prior_month_spend |
| `real` (rates) | `numeric("...", { precision: 10, scale: 6 })` | gbp_jpy_rate (cards + price_history), volume_discount_pct |
| `integer` (JPY amounts) | `integer` | cardrush_jpy, checked_price_jpy (whole yen, no decimals) |
| `integer` (FKs, counts) | `integer` | All foreign keys, quantity, sort_order |

### Numeric Return Type Note

Drizzle returns `numeric` columns as **strings** by default (Postgres `numeric` → JS `string`). All code that reads money/rate values will need `parseFloat()` or `Number()` at the query boundary, OR we use `{ mode: "number" }` on numeric columns if Drizzle supports it for pg-core (needs verification — if not, we handle at query sites).

**Update:** Drizzle pg-core does NOT support `mode: "number"` on `numeric`. We'll use a `mapWith` custom type or handle parsing at query boundaries. Simplest approach: keep `real` for columns where exact decimal doesn't matter in queries (rates, percentages) and use `numeric` only for money that gets summed/compared.

**Final approach:** Use `real` for exchange rates and discount percentages (already floating point in business logic). Use `numeric(10,2)` for money columns only. For money columns, parse at the few sites where they're used in arithmetic.

## Package Changes

| Remove | Add |
|--------|-----|
| `@libsql/client` | `postgres` |
| | (drizzle-orm/postgres-js already included in drizzle-orm) |

## File Changes

### Core (3 files)
1. **`src/lib/db/schema.ts`** — Full rewrite: pgTable, serial PKs, boolean, timestamp, numeric
2. **`src/lib/db/index.ts`** — Replace libsql client with postgres.js, read DATABASE_URL as postgres connection string
3. **`drizzle.config.ts`** — dialect: "postgresql", url from DATABASE_URL

### Seed (1 file)
4. **`src/lib/db/seed.ts`** — Rewrite: use postgres.js client, Drizzle ORM inserts (no raw DDL), remove executeMultiple

### Query Fixes (files using `.get()` or `.run()`)
5. **`src/app/api/sync/route.ts`** — Replace `.get()` with `.limit(1)` queries, `.run()` with standard execute
6. **`src/app/api/prices/upload/route.ts`** — Replace `.run()` with standard execute

### Numeric Parsing (files doing arithmetic on money columns)
7. **Various API routes** — Add `Number()` where money values from DB are used in calculations (order totals, spend updates). Audit all 22 DB-importing files.

### Config
8. **`.env.example`** — Update DATABASE_URL format to postgres connection string
9. **`.env.local`** — User updates with real Neon connection string
10. **`package.json`** — Swap deps

### Vercel
11. **`next.config.ts`** — No changes needed (postgres.js is pure JS)
12. **Vercel env vars** — Set via CLI or dashboard (DATABASE_URL, NEXTAUTH_SECRET, AWS creds, etc.)

## Deployment Steps

1. Code changes (schema, connection, queries)
2. `pnpm install` (swap deps)
3. User sets DATABASE_URL in .env.local to Neon connection string
4. `pnpm db:push` (push schema to Neon)
5. `pnpm db:seed` (seed admin user)
6. `pnpm dev` — verify locally against Neon
7. `vercel deploy --prod` (after setting env vars on Vercel)

## Risk

- **Numeric string parsing**: Main complexity. Need to audit all arithmetic on money columns.
- **Timestamp format**: Code that formats dates may expect ISO strings; `timestamp` returns JS `Date` objects. Need to verify all date formatting sites.
- **Composite unique indexes**: Should work identically in Postgres but verify with `db:push`.
