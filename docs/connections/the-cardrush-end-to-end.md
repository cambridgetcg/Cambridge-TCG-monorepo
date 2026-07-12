---
title: The CardRush end-to-end
kind: node-view
filed: 2026-05-12
kingdom: kingdom-079
sophia: Sophia (Opus 4.7, 1M context)
status: historical implementation record (source blocked 2026-07-12)
---

# The CardRush end-to-end

> **Current boundary, 2026-07-12:** The code and observations described below are retained as history. CardRush acquisition is hard-blocked pending a formal partnership, and its legacy prices, images, history, derivatives, and downstream catalog publication are withheld. Authenticated or internal access does not cure missing source rights. The live routes and source-rights audit are authoritative.

> *Yu, 2026-05-12: "dive deep into the different card game site by cardrush, make sure all pipelines are working and that they are archived and propagating to our frontend."*

The deep dive surfaced three gaps that nothing in the prior fourteen kingdoms had explicitly named:

1. **The protocol-aligned v2 cron is orphan code.** [`apps/wholesale/src/app/api/cron/ingest/cardrush/route.ts`](../../apps/wholesale/src/app/api/cron/ingest/cardrush/route.ts) and [`price-snapshot-v2.ts`](../../apps/wholesale/src/lib/price-snapshot-v2.ts) — the rewrite that closes 9 of 12 leaks named in [`the-archive.md`](./the-archive.md) — have no schedule in `apps/wholesale/vercel.json`. The legacy v1 at `/api/cron/price-snapshot` is still the only one running. Operator decision, not yet flipped.

2. **9 of 12 registered CardRush subdomains have zero coverage.** `CARDRUSH_SUBDOMAINS` (kingdom-064) registers 3 confirmed (op/pkm/dbs) + 9 speculative (mtg/ygo/digimon/vng/wei/fab/lgr/bsr/dbf). The cards table has no `cardrush_url` values pointing at the speculative subdomains; both the v1 and v2 cron filter `WHERE cardrush_url IS NOT NULL`, so the speculative subdomains never receive a scrape. The anticipate-then-confirm pattern (subdomains/games/set-formats) was inert here because nothing exercised it.

3. **The pipeline was not observable from outside.** [`/api/v1/sources`](../../apps/storefront/src/app/api/v1/sources/route.ts) listed registry meta (license/freshness/games/status) but did not query `ingest_run` for live last-run state. The docstring named this as a recursion target ("when ingest_run rows are queryable, this endpoint joins per-source last-known-good state"). That future was sitting waiting.

A fourth, smaller substrate-honesty bug: migration [`0014_price_archive_provenance.sql`](../../apps/wholesale/drizzle/0014_price_archive_provenance.sql) sat in the active path but its file header still declared *"DRAFT, not in auto-apply path. Lives under drizzle/drafts/"* — the comment lied about the file's state.

## What shipped

**File-header fix on migration 0014.** Now declares *"PROMOTED to active path 2026-05-12. `pnpm db:migrate` applies it."* The drafts/ twin is named as the design-history copy. Substrate honesty restored.

**New audit `pnpm audit:cardrush-coverage`.** Twelfth in the audit family. Queries wholesale `cards.cardrush_url` DISTINCT hostnames + `last_synced_at`, joins against the 12 registered subdomains, classifies each as `covered` / `covered-stale` (>7d since last sync) / `uncovered` (zero rows) / `unknown-host` (URL host NOT in registry — drift). Mechanical drift detection for the inert-anticipation problem. Graceful skip on missing env / invalid URL / DB unreachable, same pattern as `audit:set-discovery`. STRICT mode exits 1 on `confirmed-uncovered` or `unknown-host`. [`apps/storefront/scripts/cardrush-coverage.ts`](../../apps/storefront/scripts/cardrush-coverage.ts) (~250 LOC).

**`CARDRUSH_SUBDOMAINS` newly exported.** The constant lived inside `packages/data-ingest/src/cardrush/index.ts` but wasn't on the package's public surface. Now re-exported from the package index — the audit imports it directly so the registry stays a single source of truth.

**New endpoint `/api/v1/ingest-runs/latest` on wholesale.** Bearer-gated (consistent with `/api/v1/prices`). Returns one row per `source_id` — the most recent ingest_run row — with `triggered_at` / `finished_at` / `status` / `spec_version` / `triggered_by` / `rows_read` / `rows_normalized` / `rows_written` / `rows_quarantined` / `errors` / `notes`. Uses `DISTINCT ON (source_id) ORDER BY source_id, triggered_at DESC` — the Postgres "most recent per group" pattern. [`apps/wholesale/src/app/api/v1/ingest-runs/latest/route.ts`](../../apps/wholesale/src/app/api/v1/ingest-runs/latest/route.ts).

**Falcon courier gains `fetchSourceLastRuns()`.** [`apps/storefront/src/lib/wholesale/client.ts`](../../apps/storefront/src/lib/wholesale/client.ts). Returns `SourceRunRow[] | null` — `null` is the substrate-honest signal for "fetch itself failed" (timeout/401/parse), `[]` is "fetched, no runs yet". The two were collapsed in earlier surfaces; this Falcon extension keeps them distinct.

**`/api/v1/sources` joins live last-run state.** [`apps/storefront/src/app/api/v1/sources/route.ts`](../../apps/storefront/src/app/api/v1/sources/route.ts). New body field `ingest_runs_available: boolean` (false when the Falcon fetch failed). Per-source `last_run` block when the join produced a row, `{ _unavailable: true, reason: "never_run" }` when the fetch succeeded but no `ingest_run` row exists for that source, absent entirely when the fetch failed. Three states, three surface shapes — the reader can tell them apart without guessing.

**`age_hours` field on `last_run`.** Pre-computed for the reader: hours since `triggered_at`, rounded to 0.1. Lets a downstream client judge staleness without parsing dates.

**Manifest currency.** `storefront.sources.json` description updated to declare the live last-run join + the three substrate-honest absence states + the methodology pointer redirected from `the-cardrush-alignment.md` to this kingdom's doc.

## The substrate-honest distinction at the seam

Three failure modes carry three response shapes. Reader code can branch on them:

```
ingest_runs_available: true,  source.last_run: { triggered_at, status, ... }     → ran, here's the data
ingest_runs_available: true,  source.last_run: { _unavailable, reason }          → wholesale reachable, no run row yet
ingest_runs_available: false, source.last_run: <absent>                          → wholesale unreachable; cannot answer
```

This is the same discipline shipped at kingdom-064 (`CardRushRaw.error_reason`) and kingdom-071 (`SKU_FORM` legacy/canonical fork): when a failure has multiple causes, the substrate names them rather than collapsing them. The reader downstream gets to render different state pills for different absences.

## What did NOT ship (operator-gated)

- **Cron cutover from v1 to v2.** Flipping `apps/wholesale/vercel.json` from `/api/cron/price-snapshot` (legacy) to `/api/cron/ingest/cardrush` (v2) closes 9 of 12 archive leaks the moment it runs. Per the alignment doc this is operator-decided because the v1 cron is known-stable and the v2 cron's first prod run is unverified. Surface: change one line in vercel.json.

- **Storefront frontend exposure of `price_archive` JPY history.** CardRush ToS is `redistribute: false`. Showing the JPY series to anonymous public users is a license boundary call. Safe paths: gate behind auth (signed-in users only), or scope to internal-only (admin-visible). The wire is buildable in one session once the auth gate is chosen.

## Recursion targets

1. **Cron cutover** (operator decision; one-line vercel.json edit).
2. **Auth-gated storefront price-archive viewer** — `/api/v1/cards/[sku]/cardrush` returns JPY archive series for signed-in users only; `/cards/[sku]/market` adds an opt-in "JPY history (signed-in)" panel.
3. **Per-source `last_run` history** — extend `/api/v1/ingest-runs/latest` with `?window=30d` to return the last N runs per source (state-over-time, not just last-known).
4. **`pnpm audit:cardrush-coverage --strict` in CI** — once one of the 9 speculative subdomains has been confirmed, gate the merge on no `unknown-host` drift.
5. **Quarantine surface** — `/api/v1/ingest-runs/quarantine?source=cardrush&window=7d` returning unresolved `ingest_quarantine` rows. The 12 leaks named in `the-archive.md` Part B all reduce to "did the quarantine catch it"; surfacing the quarantine makes that answerable.
6. **Subdomain auto-promote** — when `audit:cardrush-coverage` shows a speculative subdomain has accumulated N successful scrapes, suggest the operator flip `confirmed: false → true` in `CARDRUSH_SUBDOMAINS`.
7. **Cross-DB FDW** for the storefront-side market mirror — `/cards/[sku]/market` could read wholesale's `price_archive` directly via Postgres FDW rather than via Falcon. Substantial work; flagged as a Phase D consideration.
8. **CardRush hostname inventory script** — a one-off tool that walks the cardrush.jp parent domain and lists every subdomain currently serving HTTP 200, comparing against `CARDRUSH_SUBDOMAINS`. Closes the "speculative might not exist at all" gap by sampling once.

## What this kingdom IS

A reconciliation kingdom: the pipeline didn't change, but the *visibility* of the pipeline did. The audit makes the silent-failure mode (no coverage on speculative subdomains) loud. The endpoint makes the run state queryable from outside without DB credentials. The Falcon extension keeps the three absence states distinguishable across the Falcon's narrow seam. The migration header stops lying about its own state.

*The protocol was already substrate-honest; tonight it became audibly so.*

— Sophia (Opus 4.7, 1M context), 2026-05-12. kingdom-079.
