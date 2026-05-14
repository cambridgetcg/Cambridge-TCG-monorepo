# Movers feature — design

**Date:** 2026-05-14
**Author:** Yu + Sophia (Opus 4.7 1M)
**Status:** design / awaiting approval before plan
**Related:** kingdom-080 (cross-source price archive)

---

## Problem

`/prices/[game]/movers` displays "Top 50 Most Valuable Cards" — but the
navigation menu at `apps/storefront/src/lib/nav/menu-config.ts:70` advertises
it as **"Movers — Biggest price changes 7d"**. The page itself is
substrate-honest (title, description, and an amber banner all say it's a
placeholder), but the nav is not. The mismatch was caught by Yu navigating
to the link and getting most-valuable instead of movers.

This spec ships the real movers surface the nav has been promising — closing
the substrate-honesty violation in the navigation layer by making the page
deliver what the nav advertises.

## Decisions locked

| Axis | Decision | Why |
|------|----------|-----|
| Mover definition | Sort by ABS(pct_change) over 7 days, mixed direction | Matches nav copy "Biggest price changes 7d"; gainers + losers in one ranked table |
| Source policy | Cardrush only | Longest, densest 7d history for the games we serve today; simpler SQL |
| Noise floor | £10 minimum on the *7-day-ago* price | Stricter floor — keeps the page focused on real movement, not penny-card volatility |
| Surface scope | Page + wholesale endpoint only | No public envelope, no `docs/connections/the-movers.md` yet — defer to a follow-up |
| Window flexibility | 7d only in v1 | `?window=` param shape supports `30d` later without contract break |
| Category | Singles only | Page table renders rarity + card_number — singles-shaped surface |
| "7d ago" tolerance | Most recent row in (today − 9d, today − 5d) | Tolerates cardrush daily-ingest gaps without inventing data |

## Architecture

```
storefront page                                  wholesale
─────────────────                                ─────────
/prices/[game]/movers/page.tsx                  /api/v1/prices/movers/route.ts
        │                                                 │
        │  await fetchMovers({game, window, min_price})   │
        ▼                                                 │
src/lib/wholesale/client.ts                               │
  fetchMovers() ───── Bearer + AbortController ─────▶ authenticateApiKey
                                                          │
                                                          ▼
                                                    Drizzle ORM:
                                                      CTE over price_archive
                                                      (cardrush, singles, nm)
                                                      + cards JOIN
                                                      + priceForChannel per row
                                                          │
                                                          ▼
                                                    JSON response with
                                                    movers[], window,
                                                    source_license,
                                                    computed_at
```

## Components

### 1. Wholesale endpoint
**File (new):** `apps/wholesale/src/app/api/v1/prices/movers/route.ts`

**Auth:** Bearer-gated via `authenticateApiKey` (same as `/api/v1/prices`).
Channel is read from `apiKey.channel`; the `?channel=` query param is
ignored (same convention as the existing prices route).

**Query params:**

| Param | Default | Validation |
|-------|---------|------------|
| `game` | required | resolves via `or(eq(games.code, …), eq(games.slug, …))`; 404 if not found |
| `window` | `7d` | v1 only accepts `7d`; future-proof for `30d` |
| `min_price` | `10` | numeric, clamped to `[0, 10000]` |
| `category` | `singles` | enum `singles` \| `sealed` (only `singles` exercised in v1) |
| `limit` | `50` | clamped `[1, 200]` |

**Response (200):**
```json
{
  "window": "7d",
  "window_days": 7,
  "window_tolerance_days": 2,
  "min_price_floor": 10,
  "source": "cardrush",
  "source_license": "internal-only",
  "channel": "cambridgetcg",
  "game_code": "op",
  "computed_at": "2026-05-14T12:00:00Z",
  "count": 50,
  "movers": [
    {
      "sku": "OP09-051-P-EN",
      "card_number": "OP09-051",
      "name": "Monkey D. Luffy",
      "name_en": "Monkey D. Luffy",
      "set_code": "OP09",
      "set_name": "Emperors in the New World",
      "rarity": "SR",
      "image_url": "...",
      "category": "singles",
      "price_then": 12.40,
      "price_now": 18.20,
      "channel_price": 24.50,
      "pct_change": 46.77,
      "then_date": "2026-05-07",
      "now_date":  "2026-05-14"
    }
  ]
}
```

`source_license: "internal-only"` reflects the upstream license on the raw
GBP values. The derived `pct_change` and the platform's own `channel_price`
are publishable; downstream the storefront page renders the derived signal
but withholds raw `price_then` / `price_now`.

**Error responses:** `404 { error: "Game not found: <slug>" }`, `401`
standard `unauthorized()`, `500 { error: "Internal error", detail }` on
unexpected exceptions (matches `/api/v1/prices/route.ts` shape).

### 2. SQL query

Issued via `db.execute(sql\`…\`)` (Drizzle's raw SQL escape — the CTE shape
doesn't compose well into Drizzle's query builder; raw SQL is the established
pattern for `apps/storefront/src/app/api/market/pulse/route.ts:18`).

```sql
WITH params AS (
  SELECT $1::int AS game_id,
         $2::numeric AS min_price
),
now_rows AS (
  SELECT DISTINCT ON (pa.card_id)
    pa.card_id, pa.price AS price_now, pa.snapshot_date AS now_date
  FROM price_archive pa
  JOIN cards c ON c.id = pa.card_id
  WHERE pa.source = 'cardrush'
    AND pa.category = 'singles'
    AND pa.condition = 'nm'
    AND pa.snapshot_date >= CURRENT_DATE - INTERVAL '2 days'
    AND c.game_id = (SELECT game_id FROM params)
  ORDER BY pa.card_id, pa.snapshot_date DESC
),
then_rows AS (
  SELECT DISTINCT ON (pa.card_id)
    pa.card_id, pa.price AS price_then, pa.snapshot_date AS then_date
  FROM price_archive pa
  JOIN cards c ON c.id = pa.card_id
  WHERE pa.source = 'cardrush'
    AND pa.category = 'singles'
    AND pa.condition = 'nm'
    AND pa.snapshot_date BETWEEN CURRENT_DATE - INTERVAL '9 days'
                             AND CURRENT_DATE - INTERVAL '5 days'
    AND c.game_id = (SELECT game_id FROM params)
  ORDER BY pa.card_id, pa.snapshot_date DESC
)
SELECT
  c.sku, c.card_number, c.name, c.name_en, c.set_code, c.set_name,
  c.rarity, c.image_url, c.cardrush_jpy, c.gbp_jpy_rate, c.category,
  n.price_now, n.now_date,
  t.price_then, t.then_date,
  ((n.price_now - t.price_then) / NULLIF(t.price_then, 0)) * 100 AS pct_change
FROM now_rows n
JOIN then_rows t ON t.card_id = n.card_id
JOIN cards c ON c.id = n.card_id
WHERE t.price_then >= (SELECT min_price FROM params)
  AND n.price_now > 0
  AND n.price_now <> t.price_then
ORDER BY ABS(((n.price_now - t.price_then) / NULLIF(t.price_then, 0))) DESC
LIMIT $3;
```

**Index usage.** The `price_archive_source_condition_recent_idx` on
`(source, condition, card_id, snapshot_date)` is the leading index for both
CTEs (filter `source='cardrush'` + `condition='nm'`, range on
`snapshot_date`, `DISTINCT ON (card_id)` matches the index order).

**Channel pricing.** After the SQL returns, the route iterates rows and runs
`priceForChannel(cardrush_jpy, gbp_jpy_rate, channel, category)` to compute
`channel_price` — mirrors `/api/v1/prices/route.ts:191`.

### 3. Storefront Falcon client
**File (edit):** `apps/storefront/src/lib/wholesale/client.ts`

Add `MoversResponse` and `MoverItem` interfaces. Add `fetchMovers(opts)` —
same shape as `fetchPrices`: builds the URL, calls `wholesaleFetch` with 5s
hourglass + bearer trim, `next: { revalidate: 300 }`. On any failure path
(timeout, !ok, parse error) logs `[wholesale] movers fetch error` and
returns `{ movers: [], window: '7d', source: 'cardrush', computed_at: null,
count: 0, … }` — the page treats this as "quiet week" and renders the
fallback.

### 4. Movers page rewrite
**File (edit):** `apps/storefront/src/app/prices/[game]/movers/page.tsx`

Keep the scaffold (Audience tag, breadcrumb, h1, Provenance, CurrencySelector,
"See also"). Changes:

- **Imports:** add `fetchMovers, type MoverItem`.
- **Data fetch:** `Promise.all` adds `fetchMovers({ game: cfg.slug, window: '7d', min_price: 10, limit: 50 })` alongside the existing `fetchPrices` (kept for the empty-state fallback).
- **Metadata + h1:** flip title to `"${cfg.short_name} Movers — Biggest 7-Day Price Changes — ${cfg.display_name} Price Guide UK"`. h1 becomes `"${cfg.short_name} — Biggest 7-Day Movers"`.
- **Amber banner removed.** Replaced with one neutral-500 footnote: "Top 50 by absolute 7-day % change. Cardrush-derived. Cards under £10 (7d ago) excluded as noise."
- **Provenance pill:** `<Provenance kind="computed" source="cardrush" at={movers.computed_at} cadence="daily" />`. Plus `<WhyLink href="/methodology/cross-source-pricing" label="how movers are computed" />`.
- **Table:** columns `# | Card | Set | Rarity | 7d Δ% | Buy Price`. The Δ% cell renders `<span className={pct>=0 ? 'text-emerald-400' : 'text-red-400'}>{pct>=0?'▲':'▼'} {Math.abs(pct).toFixed(1)}%</span>`. Buy Price uses `<Money value={channel_price} />`. The "We Buy" tradein column is dropped to keep the row dense and on-topic.
- **Empty-state fallback.** When `movers.length === 0`, render a small neutral block: "No qualifying movers this week — £10 floor, 7-day window. Showing top valuable cards instead." Then render the existing most-valuable table (from `fetchPrices`) as the secondary substrate. The substitution is disclosed honestly.
- **Substrate-honesty discipline.** The page does NOT render `price_then` / `price_now` (they're internal-only-licensed raw cardrush-derived values). Only the derived `pct_change` and the platform's own `channel_price` are rendered.

### 5. Nav + manifest alignment

- `apps/storefront/src/lib/nav/menu-config.ts:70` — no description change needed; "Biggest price changes 7d" now matches reality. Verify no other nav surfaces lie.
- `apps/storefront/src/lib/manifest.ts:486` — rewrite the description for `storefront.prices.movers` to describe the new shape (top 50 by absolute 7d pct change, cardrush-derived, £10 floor, with most-valuable fallback on quiet weeks).
- `apps/storefront/src/lib/nav/breadcrumb-registry.ts:119-123` — label "Movers" stays; matches the page h1.

## Error handling

| Layer | Failure | Behavior |
|-------|---------|----------|
| Wholesale | SQL error / unexpected exception | `500 { error: "Internal error", detail }`; logs `[/api/v1/prices/movers] Error: …` |
| Wholesale | Game not found | `404 { error: "Game not found: <slug>" }` |
| Wholesale | Auth fail | `unauthorized()` 401 |
| Falcon | Timeout (5s), !ok, parse error | Logs `[wholesale] movers fetch error`; returns empty MoversResponse |
| Page | `cfg === null` | `notFound()` — existing behavior at line 92 |
| Page | `movers.length === 0` | Renders empty-state fallback + most-valuable table from `fetchPrices` |
| Page | `fetchPrices` also empty | Existing "No priced cards returned for {cfg.display_name} yet." block |

The cascade keeps the page useful in every degradation state — substrate-
honest about the substitution rather than a blank page.

## Test plan

1. **Wholesale Vitest unit** — `apps/wholesale/src/app/api/v1/prices/movers/route.test.ts`. Seed a temporary `price_archive` with:
   - 3 cards with `now` + `then` rows of varying pct (verify sort order).
   - 1 card priced at £0.50 7d ago (verify £10 floor excludes it).
   - 1 card with only a `now` row (no `then`; verify excluded).
   - 1 card with identical now/then (verify zero-movement excluded).
   - Assert response shape matches contract, `source_license: "internal-only"`, top row is the largest ABS(pct).

2. **Storefront page unit / integration** — if a test scaffold exists for storefront pages, mock `fetchMovers` returning N rows and assert the table renders with correct color cells; assert empty-state fallback renders the most-valuable table.

3. **Manual smoke** — `pnpm dev:storefront`, visit `/prices/one-piece/movers` with staging wholesale; verify movers render, currency selector still works, breadcrumb still works, no console errors. Click into a card → per-card detail still works.

4. **Verify gate** — `pnpm verify` (typecheck + four audits + admin vitest) must pass before merge.

## Out of scope (deferred follow-ups)

- 30d window tab (param shape supports it; UI tabs are extra work).
- Per-source columns (cardrush + tcgplayer side by side) — defer until tcgplayer ingestion catches up.
- Public storefront envelope at `/api/v1/prices/movers/[game]` — `kingdom-080-followup-2`.
- `docs/connections/the-movers.md` connection doc — write after first deploy when the shape is settled.
- Materialized view — only if the live CTE shows p95 > 200ms in production.
- Sealed-product movers — same SQL with `category='sealed'`, but the page surface is singles-shaped.

## Open questions

None — all axes locked in clarifying-question phase.

## Files touched (summary)

| File | Change |
|------|--------|
| `apps/wholesale/src/app/api/v1/prices/movers/route.ts` | **new** — bearer-gated movers endpoint |
| `apps/wholesale/src/app/api/v1/prices/movers/route.test.ts` | **new** — vitest unit tests |
| `apps/storefront/src/lib/wholesale/client.ts` | **edit** — add `MoversResponse`, `MoverItem`, `fetchMovers()` |
| `apps/storefront/src/app/prices/[game]/movers/page.tsx` | **edit** — wire `fetchMovers`, rewrite body, drop amber banner, flip h1 + metadata |
| `apps/storefront/src/lib/manifest.ts` | **edit** — rewrite `storefront.prices.movers` description for new shape |

Nothing else moves. No new migrations, no schema changes, no new packages.
