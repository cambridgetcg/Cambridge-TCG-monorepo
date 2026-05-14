---
title: The set_id asymmetry — two columns naming the same relationship
kind: node-view + story-as-wire
filed: 2026-05-14
kingdom: kingdom-086
sophia: Sophia (Opus 4.7, 1M context)
status: shipped (substrate-fix; migration draft awaits operator)
parents:
  - the-aggregator-presents.md
  - the-cardrush-end-to-end.md
this_entry_names:
  - apps/wholesale/drizzle/drafts/0017_normalize_cards_set_id.sql.draft   # migration draft
  - apps/wholesale/src/app/api/v1/prices/route.ts                          # filter-by-set_id
  - apps/admin/scripts/sets-coverage.ts                                    # 15th audit, 6 checks
  - apps/storefront/src/app/prices/[game]/page.tsx                         # frontend substrate-honest filter
  - apps/admin/package.json                                                # script wired
  - package.json                                                           # root audit chain
self_reference: this entry names itself; ships its own migration + its own audit so the drift it describes is mechanically detectable going forward.
---

# The set_id asymmetry — two columns naming the same relationship

> *"Dive deeper into why some of the sets in One Piece TCG Price Guide UK / prices/one-piece is empty. Review the pipeline to see what causes it."* — Yu, 2026-05-14.
>
> Then, after the diagnosis: *"deeper substrate fix."*

---

## 1. The bug Yu was looking at

Sets on `/prices/one-piece` rendered with `0 cards` in the grid, or appeared with N cards but the per-set page was empty when clicked. Same pipeline; different mismatch.

## 2. The root cause

`cards` carries **two** ways to associate with a set:

| Column | Type | Source of truth for... |
|---|---|---|
| `cards.set_id` | integer FK → `sets.id` | `/api/v1/sets` card_count (LEFT JOIN on set_id) |
| `cards.set_code` | text (denormalized) | `/api/v1/prices?set=X` filter (text-match) |

There's **no DB-level invariant** keeping them coherent. The scraper writes both consistently (looks up `sets.id` by `(code, game_id)` and inserts both), but cards inserted by *other* paths — manual seed, `tools/refill.ts`, sealed-product import, future ingestion modules — can populate only one.

The four drift modes:

| Mode | What happened | Symptom |
|---|---|---|
| **A** | Set registered in `sets` but no cards seeded yet | Tile shows "0 cards"; per-set page empty |
| **B** | `cards.set_code` populated but `cards.set_id IS NULL` | Tile shows "0 cards" (FK miss); per-set page renders rows |
| **C** | `cards.set_id` ≠ the set whose code matches `cards.set_code` | Tile shows N cards; per-set page may show different N |
| **D** | `cards.set_code` points at no `sets` row at all (orphan) | Tile never shows; per-set page renders rows by text-match |

## 3. The substrate fix

Four pieces, sequenced so the route change is forward-compatible with the migration and backward-compatible with pre-migration data.

### 3.1 — Migration draft `drafts/0017_normalize_cards_set_id.sql.draft`

Five phases:

1. **DRY-RUN** — three SELECTs reporting what Phase 2 would change (NULL-set_id rows, disagreement rows, FK-empty sets). Operator runs first to verify the migration's scope.

2. **BACKFILL** — `UPDATE cards SET set_id = sets.id FROM sets WHERE sets.code = cards.set_code AND sets.game_id = cards.game_id`. Idempotent. Re-runnable.

3. **ORPHANS** — SELECT reporting cards whose `set_code` doesn't match any `sets` row. Operator decides per-row: fix code, register set, or accept.

4. **OPTIONAL TRIGGER** — `BEFORE INSERT OR UPDATE` trigger that fills `set_id` from `set_code` when set_id is NULL but set_code is given. Prevents future Mode B drift from non-scraper paths. Commented for operator review; the kingdom's preference is audit-detect over trigger-coerce.

5. **SANITY** — `by_set_id` vs `by_set_code` counts per set; should equal after Phase 2.

Substrate-honest about what's NOT in the migration: doesn't drop `cards.set_code` (the frontend uses it for display), doesn't add a NOT NULL on `set_id` (legacy sealed/promo rows may legitimately be NULL).

### 3.2 — Route change in `/api/v1/prices`

The set filter now resolves `setCode` → `sets.id` via a one-shot lookup (scoped by `?game` when present), then filters `cards` with:

```ts
or(eq(cards.setId, sid), eq(cards.setCode, setCode))
```

The OR is the **transition discipline**. Once the migration applies, the `set_id` branch becomes the fast path (canonical FK). Pre-migration or for orphan cards, the `set_code` text-match catches what the FK misses. No flag-day; no downstream breakage.

Also: tracks `resolvedGameId` cleanly as a local variable rather than peeking at the `conditions[]` array — the prior version of this code was fragile to refactor.

### 3.3 — Audit `pnpm audit:sets-coverage`

Fifteenth in the audit family. Six checks:

1. **Sets with FK-side card_count = 0** — split into truly-empty (no cards either column) vs FK-drift (set_code-side has rows; migration 0017 fixes)
2. **Mode B** — cards with `set_code` populated but `set_id` NULL
3. **Mode C** — cards where `set_id` disagrees with the sets row their `set_code` would resolve to
4. **Orphan tuples** — `(set_code, game_id)` combinations with no matching `sets` row
5. **Composite disagreement** — sets where `by_set_id ≠ by_set_code`
6. **Cross-game FK integrity** — cards whose `set_id` points at a sets row in a different game than `cards.game_id`

Skips gracefully without `WHOLESALE_DATABASE_URL`. `--strict` exits 1 on findings. Wired into `pnpm audit:sets-coverage` (root + admin) and appended to the umbrella `pnpm audit` chain.

### 3.4 — Frontend substrate-honest filter

`/prices/[game]/page.tsx` now partitions `sets` into `populated` (`card_count > 0`) and `empty`. Only populated sets render in the grid. Empty count surfaces as a small *"N sets pending"* pill near the section header — substrate-honest about the absence without misleading the reader with empty tiles.

Empty sets remain visitable by direct URL (the per-set page already renders a substrate-honest "no cards" state). The filter is a UX kindness, not a denial.

## 4. The structural lesson

Two columns naming the same relationship is a structural debt the kingdom has carried for many sessions. It worked while one path (the scraper) was the only writer. The moment other writers join — sister's tcgplayer ingest in particular, plus future Cardmarket / multi-source modules — the asymmetry surfaces as user-visible bugs.

The kingdom's preferred posture:

| Layer | Policy |
|---|---|
| Schema | Both columns exist; `set_id` is canonical, `set_code` is denormalized convenience |
| Writes | Scraper writes both; trigger (optional) backfills set_id when only set_code is given |
| Reads | Queries prefer `set_id`; fall back to `set_code` text-match for orphans + transitional state |
| Audits | `pnpm audit:sets-coverage` detects all four drift modes mechanically |
| Frontend | Substrate-honest about absence — hide empty tiles, render explicit empty states on direct URL |

The structural insight: **redundant columns aren't bad; redundant columns without an enforced invariant are**. The migration + trigger + audit triad turn the redundancy from a hazard into a feature (read flexibility, write resilience, drift detection).

## 5. Operator pre-flight

Before pushing migration 0017:

1. **Snapshot `cards`** — `CREATE TABLE cards_pre_0017 AS SELECT id, set_id, set_code FROM cards;` (rollback safety)
2. **Run Phase 1 dry-run queries** — verify the change scope looks sane
3. **Run Phase 2 backfill** — the real UPDATE
4. **Run Phase 3 orphans report** — decide per-row what to do
5. **Run `pnpm audit:sets-coverage`** — confirm drift findings drop to zero (or only orphans remain)
6. **Optional: install Phase 4 trigger** — prevents future Mode B drift

The route change can ship before the migration — the OR fallback keeps it transitional-safe. The frontend filter can ship before either — it's a pure UX improvement.

## 6. Recursion targets

1. **Sister's tcgplayer ingest** — verify it writes both `set_id` and `set_code` consistently. The scraper at `tools/scrape-cardrush.ts` is the reference pattern.
2. **NOT NULL on `cards.set_id`** — once orphans are fully resolved, the constraint can be added. Not in this kingdom; awaits operator review of orphan output.
3. **Per-set page** — could surface a substrate-honest "this set is registered but no cards yet — first scrape pending" state distinct from "this set doesn't exist".
4. **`/api/v1/sets`** — could be extended to return both `by_set_id` and `by_set_code` counts so consumers can detect drift themselves.
5. **Webhook event `set.first_card_observed`** — fire when a previously-empty set gets its first card. Coupled to kingdom-081's webhook scaffold.
6. **An `audit:set-discovery` extension** — sister's existing set-discovery audit could absorb my checks; the two have overlapping concern (set publisher catalog vs cards-in-set FK consistency).

## 7. Verification

- **Typecheck**: all three apps exit 0
- **`pnpm audit:sets-coverage`**: skips gracefully without DB env (ready for live operator run)
- **`pnpm audit:hospitality`**: ✓ all 8 still pass

6 files (2 new + 4 modified). kingdom-086.

— Sophia (Opus 4.7, 1M context), 2026-05-14.
