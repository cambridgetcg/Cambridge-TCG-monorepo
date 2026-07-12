---
title: The aggregator presents — observation depth made visible
kind: node-view + story-as-wire
filed: 2026-05-14
kingdom: kingdom-085
sophia: Sophia (Opus 4.7, 1M context)
status: shipped
parents:
  - the-license-propagation.md
  - the-cardrush-end-to-end.md
  - the-inner-peace.md
this_entry_names:
  - apps/storefront/src/app/api/v1/coverage/route.ts                   # CC0 proxy
  - apps/storefront/src/lib/wholesale/client.ts                        # Falcon helper
  - apps/storefront/src/lib/wholesale/db-source.ts                     # direct-Postgres ground route
  - apps/storefront/src/app/prices/coverage/page.tsx                   # observed-coverage section
  - apps/storefront/src/app/prices/[game]/page.tsx                     # per-game strip
  - apps/storefront/src/app/api/v1/status/route.ts                     # ENVELOPE_COMPLIANT_PATHS
  - apps/storefront/src/lib/manifest.ts                                # 3 new resources
self_reference: this entry names itself; ships the substrate that lets every page know how much data we actually have.
---

# The aggregator presents — observation depth made visible

> *"Let's expand the aggregator to reflect the data we collected and present them to the frontend."* — Yu, 2026-05-14.

The aggregator had been collecting data for ~a year. The schema was multi-source-capable; the ingest cron was running; the audits were green; the cardrush probe was named. But **the data's existence wasn't legible on the frontend** — the prices section showed *current prices*, the market mirror showed *order book + trades + sparklines*, but nothing said *"here's how deep our substrate goes, here's how many days we've watched, here's how many cards we've observed, here's which sources contributed."*

Sister had built a declared-coverage matrix at `/prices/coverage` — which sources *declare* coverage for which games. The matrix was substrate-honest about intent. But it didn't show what had actually been **collected**.

This kingdom closes that gap. Three layers:

---

## 1. The wholesale endpoint that was designed but not present

`/api/v1/aggregator/coverage` was described as a Bearer-gated wholesale
endpoint, but no revision in repository history contains that route. The route
was therefore a design claim, not a shipped implementation. The retired
wholesale domain could never satisfy the storefront Falcon call, so the public
coverage surface degraded to `SOURCE_UNAVAILABLE` even while `price_archive`
continued accumulating observations.

Kingdom-105 closes that implementation gap in the living storefront. The
query now runs through `apps/storefront/src/lib/wholesale/db-source.ts`, the
same direct-Postgres ground route that kept cards, games, and sets alive after
the wholesale HTTP app retired. It returns four shaped views over a single
parameterized query against `price_archive` joined to `cards` and `games`:

| View | What it says |
|---|---|
| `summary` | Total observations, distinct cards, distinct games, distinct sources, unassigned observations, earliest/latest snapshot, days of coverage |
| `by_game_source` | Per-(game × source) row: observations, distinct_cards, earliest, latest, days, freshest_age_hours |
| `by_game` | Per-game rollup: sources list, total observations, exact distinct-card union, largest single-source subset, date range |
| `by_source` | Per-source rollup: games list, observations, distinct_cards, date range |

Filters: `?source=cardrush` / `?game=op` / `?since=2026-01-01`. Three independent slices into the same substrate.

The query is one CTE-backed SELECT — `MIN/MAX(snapshot_date)` for date range,
`COUNT(*)` for observations, `COUNT(DISTINCT card_id)` for cards. Exact archive
row counts are retained while condition and other dimensions are deliberately
grouped into the named views. Caller filters are bound parameters; no price
value or collector identity leaves the database through this surface. One
observation row is identified by card, snapshot date, source, and condition.
Cards without a game assignment remain in the summary and per-source totals
and are named by `unassigned_observations`; they are not silently folded into a
fictional game.

## 2. The Falcon courier + CC0 storefront proxy

[`fetchAggregatorCoverage()`](../../apps/storefront/src/lib/wholesale/client.ts)
threads bounded optional filters through and reads wholesale Postgres directly.
It never probes the historical route because that route never existed. A
30-second, 64-key in-process cache coalesces repeated dynamic page reads and
can be disabled with `COVERAGE_CACHE_DISABLED=1`; database statements are
bounded to five seconds. It returns `null` on database failure; a reachable
but empty archive returns an exact zero summary and empty arrays.

`/api/v1/coverage` is the public envelope-wrapped surface. Cambridge dedicates
whatever rights it holds in the compiled operational counts and date ranges to
CC0. That statement is intentionally limited: it does not license upstream
values, names, marks, images, or override upstream terms. The envelope retains
the contributing upstream source ids with a fail-closed `internal-only` tier.

## 3. The frontend wiring

### `/prices/coverage` — declared + observed in one view

Sister's matrix above (which sources declare which games) now has a sibling section below: **"What we've collected"** — a summary stat strip (total observations, distinct cards, days of coverage, games × sources) + a per-(game × source) table with freshness pills (green < 48h, amber > 48h).

The two axes compose: the declared matrix tells the reader *what could be*; the observed table tells them *what is*. A row that's `live-confirmed` in the matrix and has 11,984 observations in the observed table = substrate-confirmed both intentionally and empirically.

Substrate-honest about absence:
- Observation database unavailable → amber pill explaining the failure, declared matrix renders regardless
- Observation database reachable but empty → neutral pill ("substrate ready; first snapshot will populate")

### `/prices/[game]` — per-game strip

The per-game page gains an "Aggregator coverage for X" panel between the hero paragraph and sister's K1 cross-language + welcomes panels. Four stat tiles (observations, cards observed, days of data, sources list) plus per-source freshness pills. Renders only when `gameCoverage.observations > 0` — substrate-honest about absence.

Bridge to the full coverage map via a "full coverage map →" link.

---

## 4. What this enables next

The coverage substrate is now legible to every reader — humans, agents, scrapers, federation partners. Recursion targets:

1. **Bulk `/data/coverage.jsonl`** — per-game-source stream, agents pull once a day.
2. **Per-card observation depth** — extend `/cards/[sku]/market` to show "we have N observations of this card going back to DATE from sources X, Y, Z".
3. **Coverage history endpoint** — `/api/v1/coverage/history?window=30d` showing observation accumulation over time. Useful for detecting collection-rate drops.
4. **Audit: `pnpm audit:coverage-drift`** — flag games where the observation rate dropped >50% week-over-week (ingest pipeline regression detector).
5. **Webhook event `coverage.new_game_observed`** — fires the first time a previously-empty game gets observations. Couples to kingdom-081's webhook scaffold.
6. **Source comparison panel** — when multiple sources cover the same game, show inter-source observation overlap (how many cards observed by all sources vs only one).
7. **`/api/v1/aggregator/timeline`** — per-source per-day rolling observation count, for monitoring dashboards.

---

## 5. The structural insight

> The aggregator was substrate-honest about its design. This kingdom makes it substrate-honest about its **state**.

Three rings of substrate-honesty now compose:

| Ring | Surface | What it declares |
|---|---|---|
| Design | `/api/v1/sources` + registry | What sources exist; what they declare |
| Runs | `/api/v1/sources/[id]` + `/api/v1/ingest-runs/latest` | When sources last ran; row counts per run |
| **State** | `/api/v1/coverage` (this kingdom) | **What we've actually accumulated** |

The first two were existing. The third was implicit — you could derive it by querying `price_archive` directly, but it wasn't on the wire. Now it is.

The summary and per-source views account for every archive row matched by the
filters. Game-shaped breakdowns describe game-assigned rows, and the
unassigned count names the difference instead of hiding it.

---

## 6. Verification

Kingdom-105 release checks on 2026-07-11:

- Focused coverage tests: 21 passed.
- Exact-commit storefront tests: 322 passed, 4 skipped.
- Clean detached worktree: `pnpm verify` exited 0.
- Storefront CI lint, typecheck, tests, and production build: passed.
- Production: HTTP 200 in 3.83 seconds on the first uncached read; 269,407
  observations, 17,702 cards, 6 games, 1 source, 136 calendar days, and exact
  reconciliation across the four views.

Kingdom-085 designed and wired the public surface. Kingdom-105 supplied the
missing living query after the wholesale retirement and corrected this entry's
earlier shipped-route claim.

— Sophia (Opus 4.7, 1M context), 2026-05-14.

Repair: Codex GPT-5, 2026-07-11.
