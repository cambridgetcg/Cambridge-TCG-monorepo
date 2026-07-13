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
  - apps/storefront/src/app/api/v1/coverage/route.ts                   # current coverage envelope
  - apps/storefront/src/app/api/v1/coverage/history/route.ts           # bounded daily history
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

## 2. The Falcon courier + public coverage envelope

[`fetchAggregatorCoverage()`](../../apps/storefront/src/lib/wholesale/client.ts)
threads bounded optional filters through and reads wholesale Postgres directly.
Coverage scans require the dedicated `WHOLESALE_COVERAGE_DATABASE_URL`; they do
not inherit the broader `WHOLESALE_DATABASE_URL` used by catalog and stock
paths. The intended database role can only read the exact archive/card/game
columns used by these aggregates.
It never probes the historical route because that route never existed. A
30-second, 64-key in-process cache coalesces repeated dynamic page reads and
can be disabled with `COVERAGE_CACHE_DISABLED=1`; database statements are
bounded to five seconds. It returns `null` when the database cannot answer or
the per-process three-read ceiling is full; a reachable but empty archive
returns an exact zero summary and empty arrays. The gate is per server process;
the coverage database role separately has a three-connection limit across
processes.

`/api/v1/coverage` is the public envelope-wrapped surface. Its lineage is
explicit rather than collapsed into one claim. `cambridge-tcg.coverage-aggregation`
names the Cambridge-authored shape and explanations and carries `cc0`.
`cambridge-tcg.catalog-game-mapping` separately names the internal cards-to-games
mapping used to derive game identifiers and conservatively carries
`proprietary`. Every actually observed upstream source id follows with its
reviewed tier; an unknown upstream id defaults to `proprietary`. The aggregate
response therefore remains `NOASSERTION`. None of these statements licenses
upstream values, names, marks, images, or overrides upstream terms.

### The daily history surface

Kingdom-107 adds `/api/v1/coverage/history?window=30d`. The accepted windows are
`7d`, `30d`, and `90d`; optional `source` and `game` filters select one lane.
The route returns exactly one zero-filled row per UTC calendar date. Each row
contains only counts and source/game identifiers. The summary computes the
whole-window distinct-card union directly; it never adds daily distinct counts,
because the same card can occur on many days.

Day-quality fields do not treat a still-running day as a failure.
`completed_days`, `observed_completed_days`,
`zero_observation_completed_days`, and `observation_completed_day_ratio`
exclude the current UTC date. `observed_days_including_current` reports the
broader count separately. The current row remains present and is marked by
`is_current_utc_day` plus `period.current_utc_day_may_be_incomplete`.

The history is an account of **stored archive state**, not an immutable event
log. `snapshot_date` is not `retrieved_at`; a backfill or upsert can change an
old point. Raw observation rows also changed meaning when `source` and then
`condition` became unique-key dimensions, while legacy source ids defaulted to
`cardrush`. The response says this on every call. `distinct_cards` is the
steadier breadth measure, but even it is not evidence that an upstream was
available or that an ingest was attempted.

The database work is one parameterized, date-indexed query through that
column-limited coverage login, inside the same
read-only transaction, five-second statement timeout, 30-second cache, and
64-key cache ceiling as current coverage. The two caches share a per-process
three-read in-flight ceiling matching each database pool, while the coverage
role limits total concurrent connections to three. A reachable empty window is
a 200 with an all-zero series; an unavailable database or full read/connection
ceiling is a 503. Aggregate response rights are `NOASSERTION`. Both coverage
routes use the same three-part lineage:
the CC0 `cambridge-tcg.coverage-aggregation`, the proprietary
`cambridge-tcg.catalog-game-mapping`, and every actually observed upstream
source with its reviewed tier. An unknown upstream source fails closed to
`proprietary`.

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
3. **Audit: `pnpm audit:coverage-drift`** — use the shipped history route as a diagnostic signal when a game's observation rate drops, without treating a drop as proof of upstream failure.
4. **Webhook event `coverage.new_game_observed`** — fires the first time a previously-empty game gets observations. Couples to kingdom-081's webhook scaffold.
5. **Source comparison panel** — when multiple sources cover the same game, show inter-source observation overlap (how many cards observed by all sources vs only one).

The former history and aggregator-timeline targets are now one shipped door:
`/api/v1/coverage/history`. One contract is easier for builders to understand
and keeps the same rights boundary everywhere.

---

## 5. The structural insight

> The aggregator was substrate-honest about its design. This kingdom makes it substrate-honest about its **state**.

Three rings of substrate-honesty now compose:

| Ring | Surface | What it declares |
|---|---|---|
| Design | `/api/v1/sources` + registry | What sources exist; what they declare |
| Runs | `/api/v1/sources/[id]` + `/api/v1/ingest-runs/latest` | When sources last ran; row counts per run |
| **State** | `/api/v1/coverage` + `/api/v1/coverage/history` (this kingdom) | **What we've actually accumulated** |

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

Daily history extension: Codex GPT-5, 2026-07-13.
