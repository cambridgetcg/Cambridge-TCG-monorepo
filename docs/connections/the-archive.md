---
title: The archive — historical-data design + the leakage audit
shape: node-view
date: 2026-05-12
status: design + audit
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning]
this_entry_names:
  - apps/wholesale/src/lib/price-snapshot.ts          # the daily cron
  - apps/wholesale/src/lib/db/schema.ts               # price_archive + card_price_change_log
  - apps/wholesale/src/lib/price-change-log.ts        # delta-only log writer
  - apps/wholesale/src/lib/cardrush-scraper.ts        # the adapter
  - packages/data-ingest/src/cardrush/index.ts        # the protocol-aligned source
  - apps/wholesale/drizzle/0011_drop_price_history.sql # the Phase 4 decision
parents:
  - the-pipeline.md
  - the-consolidation.md
  - the-pricing-arrow.md  # S17, the seven-act story of one card's price
self_reference: this entry names itself in `this_entry_names`; the leakage audit names its own scope honestly (current findings, not exhaustive).
---

# The archive — historical-data design + the leakage audit

> *"Expand our cardrush collection protocol to include other card games, and look into the snapshot and historical data archiving. Find out if there are any leakage in our pipeline."* — Yu, 2026-05-12.

Three concerns, one doc. The previous turn consolidated the cardrush scraper under the protocol. This turn:

- **Expands** the cardrush subdomain map from 3 confirmed to 12 (3 confirmed + 9 speculative), each labelled honestly so the operator knows which scrapes have proven the upstream exists.
- **Inspects** the snapshot + historical-archive pipeline ([`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) + [`price-change-log.ts`](../../apps/wholesale/src/lib/price-change-log.ts) + the schema).
- **Audits** the pipeline for leakage — every place data loses provenance, fails silently, or drops without trace.

The doc has two halves. **Part A** names the archive *design as it stands today*: what's in `price_archive`, what got dropped (`price_history` in Phase 4 of kingdom-049), what works, what needs extending. **Part B** is the *leakage audit*: twelve findings, ordered by severity, each with where + what + why + fix.

---

## Part A — The archive, as it stands today

### A.1 What gets archived

Two tables carry price history at wholesale, with no overlap:

| Table | Cadence | Granularity | Source columns | Purpose |
|-------|---------|-------------|----------------|---------|
| `price_archive` | daily snapshot | one row per (card_id, snapshot_date) | `cardrush_jpy`, `gbp_jpy_rate`, `base_gbp`, `price` | the canonical price history — *every* day for *every* card with a `cardrush_url` |
| `card_price_change_log` | per-mutation (delta-only) | one row per *change* to `cards.price` / `cards.base_gbp` | `action`, `source`, `actor_label`, `before_value`, `after_value`, `reason`, `metadata` | the mutation audit — *only* when a value actually changes |
| ~~`price_history`~~ | ~~dropped Phase 4~~ | ~~same as price_archive~~ | ~~JPY inputs only~~ | ~~redundant; collapsed into price_archive~~ |

Both are append-only-ish (price_archive is `INSERT … ON CONFLICT … UPDATE` per (cardId, snapshotDate); card_price_change_log is pure append).

### A.2 What's good about the design

Three properties the current design gets right, worth naming explicitly so future refactors don't lose them:

1. **Dual-representation discipline.** The raw JPY input + the GBP/JPY rate are both preserved on every archive row alongside the derived `base_gbp` and `price`. If FX was wrong on a given day, the day's derived values are recomputable from the inputs. *Substrate-honesty: the computation site is not the only source of truth.*
2. **Delta-only change log.** [`logPriceChange()`](../../apps/wholesale/src/lib/price-change-log.ts) only fires when `Math.abs(prev - new) > 0.001`. Daily snapshots that touch ~3,100 rows would otherwise produce ~3,100 log entries per day; the delta-only filter keeps the log answering *"when did this card's price change?"* not *"did this card get snapshot today?"*. The Witnesses' Book discipline ([`docs/connections/the-witnesses-book.md`](./the-witnesses-book.md) S13) applies: the log fires for every meaningful event, never breaks the act it witnesses.
3. **Unique (card_id, snapshot_date) index.** Same-day re-runs idempotently update the row rather than producing duplicates. The history is one row per day per card.

### A.3 What's missing — extension surface

Five extensions the schema *should* have but doesn't, in priority order:

1. **`source` column on `price_archive`.** Today every row is implicitly cardrush-sourced (the cron only calls CardRush). When TCGplayer / Cardmarket modules ship, archived rows from those sources need attribution. Migration sketch:
   ```sql
   ALTER TABLE price_archive
     ADD COLUMN source text NOT NULL DEFAULT 'cardrush',
     ADD COLUMN source_url text;
   ALTER TABLE price_archive
     DROP CONSTRAINT IF EXISTS price_archive_card_date_idx;
   CREATE UNIQUE INDEX price_archive_card_date_source_idx
     ON price_archive(card_id, snapshot_date, source);
   ```
2. **`ingest_run_id` column on `price_archive`.** Foreign key to the [`ingest_run`](./the-pipeline.md) table (planned). Lets an operator answer *"which ingest run produced this row?"* and reconstruct the lifecycle event chain. Required before scheduling becomes a substrate concern.
3. **`ingest_quarantine` table.** Failed scrapes are currently counted (`cardsFailed++`) but the page, the URL, the reason, and the raw HTML are *all lost*. The pipeline-doc names the schema ([`the-pipeline.md`](./the-pipeline.md) §6); the migration is queued.
4. **`error_reason` column on `price_archive`.** Even when a scrape *succeeds* with `price_jpy: null` (e.g. the card was delisted), there's no record of *why* this day produced no price. Today this manifests as an absent row, indistinguishable from "we didn't try". Adding a `(card_id, snapshot_date, error_reason)` row when scrape fails *but the attempt happened* — substrate-honest about the gap.
5. **A `price_archive_history` table** for the (rare) case where a snapshot row is rewritten. Currently `onConflictDoUpdate` overwrites silently; if an operator re-runs the snapshot for an older date with different FX or different scrape result, the prior value is gone. Append-only history of the archive itself (yes, history-of-history) keeps reruns auditable.

### A.4 Cardrush coverage expansion (this turn)

The cardrush package module now declares **12 subdomains** in `CARDRUSH_SUBDOMAINS`:

| Subdomain | Game code | Status |
|-----------|-----------|--------|
| `cardrush-op.jp` | `op` | confirmed |
| `cardrush-pokemon.jp` | `pkm` | confirmed |
| `cardrush-db.jp` | `dbs` | confirmed |
| `cardrush-mtg.jp` | `mtg` | speculative |
| `cardrush-ygo.jp` | `ygo` | speculative |
| `cardrush-digimon.jp` | `dmw` | speculative |
| `cardrush-vanguard.jp` | `vng` | speculative |
| `cardrush-weiss.jp` | `wei` | speculative |
| `cardrush-fab.jp` | `fab` | speculative |
| `cardrush-lorcana.jp` | `lgr` | speculative |
| `cardrush-bs.jp` | `bsr` | speculative |
| `cardrush-fw.jp` | `dbf` | speculative |

**Substrate-honesty:** each entry carries a `confirmed: boolean`. Speculative subdomains *infer* the game code correctly *if* the URL pattern matches, but a scrape returning no HTML produces `error_reason: "subdomain_unconfirmed"` instead of `"no_price_in_html"`. The operator distinguishes *upstream-doesn't-exist* from *page-changed*.

Promotion procedure: when a wholesale scrape against a speculative subdomain succeeds, flip `confirmed: true` in [`packages/data-ingest/src/cardrush/index.ts`](../../packages/data-ingest/src/cardrush/index.ts), append the game code to `meta.games`, and update this section.

### A.5 The seven-act story (`the-pricing-arrow.md` S17)

The full lifecycle of one card's price across the wholesale → storefront arrow is told as a seven-act story in [`docs/connections/the-pricing-arrow.md`](./the-pricing-arrow.md). This doc is the *engineering complement* — the seven acts narrate; this section names the schema + the gaps. Both are true. Read the story first if you want the journey; read this doc when you want the table.

---

## Part B — The leakage audit

Twelve findings from reading the snapshot pipeline + adjacent code. Ordered by severity (1 = highest); each carries category, severity, location, what, why-it-matters, fix.

### B.1 Categories

| Category | Meaning |
|----------|---------|
| **Provenance** | data written without source / timestamp / actor |
| **Error** | failure absorbed silently or with reason discarded |
| **Lifecycle** | mutation without log entry, or log entry with wrong shape |
| **Hygiene** | bypasses the protocol's shared infrastructure (createFetcher, rate-limit, User-Agent) |
| **License** | derived data without upstream rights tracking |
| **Time** | historical state not preserved (overwrites with no history-of-history) |
| **Volume** | rows dropped on retry / crash without quarantine |

### B.2 The twelve leaks

#### Leak 1 — failed-scrape *reason* not surfaced to caller (CLOSED this turn)

| Field | Value |
|-------|-------|
| Category | error + lifecycle |
| Severity | **high** |
| Location | [`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) §4 worker loop, line 122 |
| What | `if (result.priceJpy === null) { cardsFailed++; }` — the reason (HTTP 404 vs network error vs layout change) was discarded. |
| Why it matters | Operator sees `cardsFailed: 247` with no way to triage. Layout change vs upstream-blocking-us are different problems. |
| Fix shipped | [`packages/data-ingest/src/cardrush/index.ts`](../../packages/data-ingest/src/cardrush/index.ts) `CardRushRaw.error_reason`; the wholesale adapter [`cardrush-scraper.ts`](../../apps/wholesale/src/lib/cardrush-scraper.ts) `ScraperResult.errorReason` surfaces it. **The price-snapshot caller still needs to record the reason** — recursion target. |

#### Leak 2 — no `source` column on `price_archive`

| Field | Value |
|-------|-------|
| Category | provenance |
| Severity | **high** (becomes blocker the moment a second source ingests) |
| Location | [`apps/wholesale/src/lib/db/schema.ts`](../../apps/wholesale/src/lib/db/schema.ts) line 199 |
| What | Every row is implicitly `cardrush`; no column says so. |
| Why it matters | When TCGplayer or Cardmarket ships, rows are ambiguous; cross-source aggregation needs the source. |
| Fix | Migration in A.3 #1. Default value `'cardrush'` for backfill; new sources set explicitly. |

#### Leak 3 — token bucket not shared across worker pool

| Field | Value |
|-------|-------|
| Category | hygiene |
| Severity | **high** |
| Location | [`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) §4 — 8 workers × `scrapeCardrushPrice(url)` |
| What | Each call to `scrapeCardrushPrice → packageScrape` invokes `createFetcher(ctx, meta)` once. Each call gets its own token bucket. With 8 workers in parallel, the package's declared `rate_limit: { rps: 0.5, burst: 2 }` is multiplied by 8 → effective ~4 req/s peak + 16 burst. |
| Why it matters | The CardRush ToS expects polite use; the package's declared rate limit is the substrate-honest commitment; the worker pool bypasses it. |
| Fix | Update the `scrapeCardRush` public function to accept an optional pre-built fetcher; the wholesale snapshot creates *one* fetcher and threads it through the pool. *Or* migrate the snapshot to use `runSource()` with the cardrush watch-list pattern (the package's `read()` already shares one fetcher across the watch-list). Sketched in [`packages/data-ingest/src/cardrush/index.ts`](../../packages/data-ingest/src/cardrush/index.ts) `scrapeWithFetcher` (internal). |

#### Leak 4 — no `ingest_run` row for snapshot runs

| Field | Value |
|-------|-------|
| Category | lifecycle + provenance |
| Severity | **high** |
| Location | [`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) returns `SnapshotResult` |
| What | The result is *returned*, not *persisted*. If the cron crashes mid-run, no record of "we tried, here's how far we got". |
| Why it matters | Operator can't answer *"did snapshot run today?"* from the DB. Staleness alerts can't fire. The pipeline's substrate-honesty layer (Stage 7 in [`the-pipeline.md`](./the-pipeline.md)) is absent. |
| Fix | Migration: `ingest_run` table per the [`the-pipeline.md`](./the-pipeline.md) §9 schema. Snapshot writes `INSERT INTO ingest_run (...) RETURNING id` at start, `UPDATE … status='done'` at end (or `'failed'` on crash via outer try/finally). |

#### Leak 5 — failed-scrape raw HTML lost (no quarantine)

| Field | Value |
|-------|-------|
| Category | volume + lifecycle |
| Severity | medium-high |
| Location | snapshot pipeline + scrape function |
| What | Pages that loaded but didn't yield a price are not preserved. The page may have changed shape; we discard the evidence. |
| Why it matters | Schema drift detection requires the raw HTML. Without quarantine, the operator can't reproduce the failure. |
| Fix | `ingest_quarantine` table per [`the-pipeline.md`](./the-pipeline.md) §6. Snapshot writes failed rows into it; raw HTML (truncated to 100KB) in `raw_payload`. |

#### Leak 6 — `cards.cardrush_url IS NULL` silently skips cards

| Field | Value |
|-------|-------|
| Category | volume + lifecycle |
| Severity | medium |
| Location | [`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) §2 — `.where(isNotNull(cards.cardrushUrl))` |
| What | If a card *should* have a URL but doesn't, it's invisibly excluded from every snapshot. |
| Why it matters | Operator never learns there's an unmapped card. The substrate-honesty footprint is wrong — `cards_processed = 11,368` reads like "all of them" when in reality it's "those with URLs". |
| Fix | Emit a `null_url` count in `SnapshotResult` (and into `ingest_run.events`) — `cards.length WHERE cardrush_url IS NULL AND game IN (active)`. The count exposes the gap without changing behaviour. |

#### Leak 7 — `onConflictDoUpdate` overwrites price_archive silently on rerun

| Field | Value |
|-------|-------|
| Category | time |
| Severity | medium |
| Location | [`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) §5a |
| What | Re-running the snapshot for an older date overwrites the prior archive row. No history-of-history. |
| Why it matters | Rare but real: if FX was wrong on 2026-03-15 and we re-fetch with corrected FX, the original row is lost. The audit trail of the archive itself is gone. |
| Fix | Either (a) make price_archive append-only with a `valid_from`/`valid_to` pattern, or (b) add a `price_archive_history` table that records the prior row before overwrite. (a) is cleaner; (b) is cheaper. |

#### Leak 8 — `fetchGbpJpyRate` failure path unknown

| Field | Value |
|-------|-------|
| Category | error |
| Severity | medium |
| Location | [`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) line 106 |
| What | Snapshot fetches one rate at the start. If `fetchGbpJpyRate()` throws or returns a stale value, every archive row that day is wrong (or the run crashes). |
| Why it matters | One bad FX call → 3,100 wrong archive rows. The dual-rep saves us (we keep the JPY input), but the displayed value is wrong all day. |
| Fix | Verify `fetchGbpJpyRate()` has its own retry + provenance trail. If it falls back to cached, record `gbp_jpy_rate_source` (e.g. `'live'` / `'cached'` / `'fallback'`) on each archive row. |

#### Leak 9 — worker pool has no per-card retry; crashed worker silently drops its chunk's tail

| Field | Value |
|-------|-------|
| Category | volume |
| Severity | medium |
| Location | [`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) §4 |
| What | The `Promise.all(chunks.map(...))` pattern: if one chunk's worker throws inside its loop, `Promise.all` rejects, the run aborts; other chunks' results in flight may or may not be preserved depending on timing. |
| Why it matters | Partial completion is invisible; either a clean run or a thrown error. The protocol's substrate-honesty is about *naming* partial completions. |
| Fix | Use the package's `runSource(cardrush, ctx, writers)` (kingdom-061 runner) which already handles per-row errors as events rather than throws. Migration target. |

#### Leak 10 — `logPriceChange` runs N sequential queries inside batch loop

| Field | Value |
|-------|-------|
| Category | hygiene (perf gap, not data leakage) |
| Severity | low |
| Location | [`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) §5c |
| What | For each updated card, `await logPriceChange(...)` makes one DB call. Per batch of 100, that's 100 sequential round-trips. |
| Why it matters | At 3,100 cards × 1 RTT each, that's ~30s of synchronous DB latency the snapshot doesn't need. Not data leakage but performance debt. |
| Fix | Batch insert into `card_price_change_log` — collect the rows, one `INSERT … VALUES (…), (…), …` per batch. The Witnesses' Book swallowed-error discipline preserved. |

#### Leak 11 — speculative cardrush subdomains promote without operator notice

| Field | Value |
|-------|-------|
| Category | lifecycle |
| Severity | low |
| Location | [`packages/data-ingest/src/cardrush/index.ts`](../../packages/data-ingest/src/cardrush/index.ts) `CARDRUSH_SUBDOMAINS` |
| What | A speculative subdomain's first successful scrape proves it exists, but the `confirmed: false` flag stays false until the operator manually flips it. The pipeline doesn't notice. |
| Why it matters | Discovery debt: when `cardrush-fab.jp` starts returning prices, no event fires; the catalog stays out of date until someone reads the operator logs. |
| Fix | Emit a `subdomain_confirmed` lifecycle event when a scrape against a `confirmed: false` subdomain succeeds. The audit (`pnpm audit:tributaries`, future check) can verify the table is in sync with the lifecycle log. |

#### Leak 12 — `price_archive` rows don't carry `cardrush_url` (the upstream pointer)

| Field | Value |
|-------|-------|
| Category | provenance |
| Severity | low |
| Location | [`apps/wholesale/src/lib/db/schema.ts`](../../apps/wholesale/src/lib/db/schema.ts) `priceArchive` |
| What | The row records `cardrush_jpy` but not the URL the JPY came from. If the URL changes on the `cards` table later, the archive can't be retraced. |
| Why it matters | Forensics: when a price seems wrong historically, the operator can't click through to the page that produced it. |
| Fix | Add `source_url text` to `price_archive` (covered by A.3 #1). Backfill from `cards.cardrush_url` at migration time. |

### B.3 What's *not* leakage (deliberate choices that look like it)

- **`logPriceChange` catches errors without rethrow.** Looks like swallowed-error; is actually the *Witnesses' Book discipline* — important enough to attempt always; unimportant enough that its failure can never break the act it was witnessing. ([S13.](./the-witnesses-book.md))
- **Delta-only `card_price_change_log`.** Skips snapshots-without-change; deliberate to keep the log answering "when did the price change?" not "did the snapshot run?".
- **Floats with `Math.abs(...) > 0.001` for delta detection.** Tolerates float drift; sub-penny changes are ignored, which is correct for a price-in-GBP comparison.
- **`onConflictDoUpdate` per-day idempotency.** Within-the-same-day reruns are intended; only cross-day reruns are the actual leak (Leak 7).

### B.4 Audit checks to add (recursion targets)

Some leaks are mechanically detectable:

| Check | Leak it covers | Implementation sketch |
|-------|----------------|------------------------|
| `audit:archive-source-column` | Leak 2 | Query `price_archive` for rows where `source IS NULL`; expect zero after migration. |
| `audit:ingest-run-recency` | Leak 4 | Per-source, check `now() - max(ingest_run.finished_at)` against the FreshnessKey; alert if 2× over budget. |
| `audit:quarantine-unresolved` | Leak 5 | Count `ingest_quarantine` rows where `reviewed_at IS NULL`; alert if > 100 per source. |
| `audit:cardrush-subdomain-currency` | Leak 11 | Read `CARDRUSH_SUBDOMAINS` table; for each `confirmed: false` entry, check the last 30 days of `ingest_run.events` for `subdomain_confirmed`; emit a recommendation to flip. |
| `audit:price-archive-coverage` | Leak 6 | Count `cards WHERE cardrush_url IS NULL AND game IN (active)`; alert if > 0. |

---

## Recursion targets — ordered by leverage

Roughly the union of A.3 + B.4, sorted by *what breaks first when it's missing*:

1. **Ship `ingest_run` + `ingest_quarantine` migrations** — Stage 7 + Stage 4 of the pipeline; unblocks Leaks 4 + 5.
2. **Add `source` + `source_url` columns to `price_archive`** — unblocks Leak 2 + Leak 12; default-value migration covers backfill.
3. **Migrate the snapshot to `runSource()`** — unblocks Leak 9 (no more crashed-worker drops) and Leak 3 (shared fetcher, shared rate limit).
4. **Persist `errorReason` to archive on failed scrapes** — Leak 1's *closing* (the package side closed it; the wholesale side needs to record). Add an `error_reason` column to `price_archive` so failures are first-class.
5. **Confirm speculative cardrush subdomains** — schedule a one-pass scrape against each `confirmed: false` subdomain; flip the ones that succeed; remove the ones that don't.
6. **Batch `logPriceChange` writes** — Leak 10's perf fix.
7. **Per-archive-row provenance for FX rate** — Leak 8.
8. **`price_archive_history` for cross-day reruns** — Leak 7's least invasive fix.
9. **`audit:cardrush-subdomain-currency`** — Leak 11; mechanical detection of subdomain promotions.
10. **`/api/v1/sources` endpoint** — substrate-honest report of all the above per source. Inverse of `/api/v1/status`.

---

## What this entry names — substrate-honestly

Two tables, twelve leakage findings, four "looks-like-leakage-but-isn't" notes, five recursion-target audit checks, ten ordered next builds. Three subdomains promoted from "implicit" to "confirmed", nine more added speculatively with the substrate-honest `confirmed: false` flag.

The wholesale snapshot pipeline is **functional** (it runs daily, archives ~3,100 rows, updates `cards.price`, fires the change log on deltas). The leaks are not bugs that block today's operation; they are **provenance debts** — places where the platform claims more certainty than it has. Each is closeable with a focused migration + a few lines of cron-route glue.

The protocol's contribution this turn: the cardrush package now *surfaces* the failure reasons it had always known. The wholesale adapter passes them through. The snapshot pipeline can now *record* them — when the next migration ships. **Substrate-honesty advances one layer at a time.**

This entry names itself in `this_entry_names`; it is named by [`the-consolidation.md`](./the-consolidation.md) (the prior turn's record) and [`the-pipeline.md`](./the-pipeline.md) (the design it audits). It will be named by the future migration commits that close each leak, and by [`the-rivers-flow.md`](./the-rivers-flow.md) (the planned story-arc) when one card's archive history is followed end-to-end.

— Sophia, 2026-05-12.
