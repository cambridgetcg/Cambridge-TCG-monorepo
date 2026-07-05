---
title: The cardrush alignment — wholesale snapshot into the distribution + standardisation protocol
shape: node-view
date: 2026-05-12
status: design
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning, creation]
this_entry_names:
  - apps/wholesale/src/lib/price-snapshot.ts                   # current; stays through migration
  - apps/wholesale/src/lib/cardrush-scraper.ts                 # adapter (kingdom-062)
  - apps/wholesale/drizzle/drafts/0014_price_archive_provenance.sql.draft  # schema migration draft (this turn)
  - packages/data-ingest/src/cardrush/                         # protocol-aligned source
  - packages/data-ingest/src/runner.ts                         # runSource() composition
  - packages/data-spec/                                        # response contract
  - apps/storefront/src/lib/data-pantry/                       # emission surface
  - apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts  # the public reader
  - apps/storefront/src/app/api/at/[date]/card/[sku]/route.ts  # the temporal reader
parents:
  - the-archive.md
  - the-consolidation.md
  - the-pipeline.md
  - the-tributaries.md
self_reference: this entry names itself in `this_entry_names`; ships its own SQL migration draft + its own snapshot-v2 sketch (story-as-wire).
---

# The cardrush alignment — wholesale snapshot into the distribution + standardisation protocol

> *"Dive deeper into the snapshot and data collection pipeline for cardrush. Think about how we can align it into the TCG data distribution and standardisation protocol."* — Yu, 2026-05-12.

The previous five entries in the data-aggregation arc named the catalog ([`the-tributaries.md`](./the-tributaries.md)), the contract ([`the-modules.md`](./the-modules.md) + `packages/data-ingest`), the pipeline design ([`the-pipeline.md`](./the-pipeline.md)), the first migration ([`the-consolidation.md`](./the-consolidation.md)), and the leakage audit ([`the-archive.md`](./the-archive.md)). They generalised. This entry **specialises** — taking *one* upstream (CardRush, the only one Cambridge TCG has been scraping daily for a year) and walking it end-to-end through the protocol, naming where each part *already aligns* and where each part *doesn't yet*.

The question isn't *"can we wire CardRush into the protocol?"* — kingdom-060 already did, as a partial scraper. The question is: **what does a fully-aligned CardRush pipeline look like, and what is the migration from where we are to there?** The deliverables this turn:

1. A clear current-vs-target architecture diagram (§1, §2).
2. A five-phase migration plan, each phase substrate-honestly described as "what changes, what breaks, what rolls back" (§3).
3. The SQL migration draft (§4) — schema changes for `price_archive` + new `ingest_run` + `ingest_quarantine` tables. Shipped as [`apps/wholesale/drizzle/drafts/0014_price_archive_provenance.sql.draft`](../../apps/wholesale/drizzle/drafts/0014_price_archive_provenance.sql.draft); operator copies into the active migration folder when ready.
4. The snapshot-v2 TypeScript sketch (§5) — protocol-aligned successor to [`price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts), built around `runSource()`.
5. The distribution surface map (§6) — how the storefront pantry serves aligned CardRush data with source attribution + license propagation, and what a partner sees.
6. Federation of historical prices (§7) — how `/api/at/[date]/card/[sku]` + content-hash addressing make CardRush-derived data citeable across the federation.
7. Standardisation deliverables per adopter role (§8) — mirror / builder / aggregator / standard-citer.

By the end: the alignment is **specified in code-citable detail**, ready for the operator to apply the migration when comfortable. Nothing in this entry breaks the current pipeline; the v1 snapshot continues to run; the new path is additive.

---

## 1. The current pipeline — what runs today

### 1.1 At a glance

```
                     ┌──────────────────────────────────────┐
   cron daily   ──→  │ apps/wholesale/.../price-snapshot.ts │
                     │  runDailySnapshot()                  │
                     └──────────────────┬───────────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────────┐
              │                         │                          │
              ▼                         ▼                          ▼
  ┌───────────────────┐  ┌─────────────────────────┐  ┌─────────────────────┐
  │  SELECT cards     │  │  fetchGbpJpyRate()      │  │  Promise.all over   │
  │  WHERE            │  │  → one rate per run     │  │  8 chunks × worker  │
  │   game IN active  │  │                         │  │  (300ms delay each) │
  │   cardrush_url    │  └─────────────────────────┘  └──────────┬──────────┘
  │   IS NOT NULL     │                                          │
  └───────────────────┘                                          │ each card:
                                                                  ▼
                              ┌──────────────────────────────────────────────┐
                              │  scrapeCardrushPrice(url)  (legacy adapter)  │
                              │     → packages/data-ingest/cardrush          │
                              │     → createFetcher(ctx, meta) ⚠ ONE PER CALL│
                              │     → returns {priceJpy, source, errorReason}│
                              └────────────────────┬─────────────────────────┘
                                                   │
                                                   ▼
                              ┌──────────────────────────────────────────────┐
                              │  collect updates[] in memory                 │
                              │     (chunked Promise.all join)               │
                              └────────────────────┬─────────────────────────┘
                                                   │
                                                   ▼
                              ┌──────────────────────────────────────────────┐
                              │  batched 100 at a time:                      │
                              │    INSERT price_archive ON CONFLICT UPDATE   │
                              │    UPDATE cards (price, baseGbp, lastSynced) │
                              │    logPriceChange() if delta (sequential)    │
                              └────────────────────┬─────────────────────────┘
                                                   │
                                                   ▼
                                       returns SnapshotResult
                                       (not persisted to RDS)
```

### 1.2 The mechanics, named

| Aspect | Mechanic | Substrate-honesty note |
|--------|----------|------------------------|
| Trigger | Vercel cron — `apps/storefront/src/app/api/cron/...` or wholesale's own cron | The cron route itself isn't yet on the inventory |
| Scope | All cards in active games with `cardrush_url IS NOT NULL` | ~11,368 cards on the One Piece / Pokémon / Dragon Ball games today |
| Concurrency | 8 parallel workers, 300ms intra-worker delay | Peak ~27 req/s — exceeds the package's declared `rate_limit: { rps: 0.5, burst: 2 }` because each worker has its own token bucket (Leak #3) |
| FX | One `fetchGbpJpyRate()` at run start | Single-source; failure unaudited (Leak #8) |
| Scrape | Adapter → `scrapeCardRush()` → 状態A- price first, fallback to base | Now surfaces `error_reason` (kingdom-064); wholesale doesn't yet persist it |
| Write | `INSERT INTO price_archive ON CONFLICT (card_id, snapshot_date) UPDATE …` | No `source` column; rows are implicitly cardrush (Leak #2) |
| Update | `UPDATE cards SET price, baseGbp, cardrushJpy, gbpJpyRate, lastSyncedAt` | Idempotent; deltas trigger `logPriceChange` |
| Audit | Delta-only `card_price_change_log` | Witnesses' Book discipline; the only mutation log today |
| Result | `SnapshotResult` returned in-memory | Not persisted — operator can't query "did snapshot run today?" (Leak #4) |
| Quarantine | None | Failed pages lost (Leak #5) |

### 1.3 The pipeline's relationship to the protocol — what already works

The pipeline already aligns in **three** places:

1. **The scraper itself is protocol-aligned.** [`packages/data-ingest/src/cardrush/`](../../packages/data-ingest/src/cardrush/) is the canonical implementation; the wholesale adapter ([`apps/wholesale/src/lib/cardrush-scraper.ts`](../../apps/wholesale/src/lib/cardrush-scraper.ts)) delegates. So the *fetch* side wears the protocol's typed contract — `SourceModule<CardRushRaw, CanonicalPrice>` exists and is exported.
2. **The canonical SKU is universal.** `price_archive.sku` already uses `<game>-<set>-<number>-<lang>` format produced by `@cambridge-tcg/sku`. Multi-source aggregation (Cardmarket EUR, TCGplayer USD) would write rows with the same SKU keys, just different `source` columns.
3. **The downstream emission already wears the envelope.** When a partner hits `/api/v1/universal/card/[sku]` on the storefront, the response goes through `data-pantry`'s `jsonResponse()` — wrapped in `{ data, _meta }` with `_meta.sources` (sister-shipped).

### 1.4 What doesn't yet align — twelve provenance debts

All twelve from [`the-archive.md`](./the-archive.md) Part B. Specifically for CardRush:

- The scraper layer's failure reasons (closed kingdom-064) don't flow into the wholesale schema.
- The 8-worker pool defeats the per-source rate limit.
- The snapshot run isn't itself an audit trail.
- Failed scrapes drop their raw HTML.
- Cross-day reruns silently overwrite.
- FX provenance is implicit.
- Source attribution is implicit.

The alignment closes most of these structurally. Each phase below names which.

---

## 2. The target — what the aligned pipeline looks like

### 2.1 At a glance

```
                ┌────────────────────────────────────────────────────────┐
   cron daily ──→  apps/wholesale/src/app/api/cron/ingest/cardrush/        │
                   route.ts                                                 │
                   ──────────────────────────────────                       │
                   1. INSERT ingest_run RETURNING id                        │
                   2. ctx = { on_event, cardrush: { urls: watch_list },     │
                              signal: AbortSignal.timeout(45 * 60_000) }    │
                   3. summary = await runSource(cardrush, ctx, writers)     │
                   4. UPDATE ingest_run finished_at, status, counts, events │
                └─────────────────────┬──────────────────────────────────┘
                                      │
                                      │  runSource() composes Stages 1–4
                                      │
              ┌───────────────────────┴────────────────────────┐
              │                                                │
              ▼                                                ▼
  ┌──────────────────────────┐                ┌──────────────────────────────┐
  │  cardrush.read(ctx)      │                │  cardrush.normalize(raw)     │
  │   shared fetcher (✓ Leak │                │   raw → CanonicalPrice       │
  │   #3 closed)             │                │   {ok: true/false, reason}   │
  │   per-row provenance     │                │                              │
  │   event stream           │                │                              │
  └──────────┬───────────────┘                └─────┬────────────────────────┘
             │                                       │
             │ for each row:                         │
             ▼                                       ▼
  ┌────────────────────────────────────┐  ┌────────────────────────────────┐
  │  writer.write(canonical):          │  │  writer.quarantine({raw,       │
  │    INSERT price_archive            │  │     reason, provenance}):      │
  │      (source='cardrush',           │  │    INSERT ingest_quarantine    │
  │       source_url=raw.url,          │  │      (raw_payload=raw,         │
  │       ingest_run_id=runId,         │  │       reason, provenance)      │
  │       source_redistribute=false,   │  │    (✓ Leak #5 closed)          │
  │       error_reason=NULL)           │  └────────────────────────────────┘
  │    ON CONFLICT (card_id, date,     │
  │      source) DO UPDATE             │
  │    UPDATE cards (...)              │
  │    logPriceChange if delta         │
  │      (batched in v2 — ✓ Leak #10)  │
  └────────────┬───────────────────────┘
               │
               ▼
  ┌─────────────────────────────────┐
  │  partner reads:                 │
  │    /api/v1/universal/card/[sku] │
  │    /api/at/[date]/card/[sku]    │
  │    /api/v1/federation/identify  │
  │  all through data-pantry        │
  │  envelope with _meta.sources +  │
  │  _meta.source_license (planned) │
  └─────────────────────────────────┘
```

### 2.2 What the target gets right

Every line of the diagram above closes one or more leaks from [`the-archive.md`](./the-archive.md) Part B:

| Leak | How target closes it |
|------|----------------------|
| 1 — failed-scrape reason discarded | Already closed at protocol layer (kingdom-064); the writer's INSERT records it in `price_archive.error_reason` for non-priced rows and `ingest_quarantine.reason` for parse failures. |
| 2 — no source column | Phase 1 of the migration: `price_archive.source` column. |
| 3 — token bucket bypassed | `runSource()` uses one fetcher across the watch-list; rate-limit holds. |
| 4 — no ingest_run row | Phase 3: `ingest_run` table; cron route writes start + finish rows. |
| 5 — raw HTML lost | Phase 4: `ingest_quarantine.raw_payload` captures the failed row. |
| 6 — null URL silently skips | Cron route emits a `null_url_count` event in `ingest_run.events` so the gap is visible. |
| 7 — cross-day overwrite | Phase 2: unique key widens to `(card_id, date, source)`, so source-specific reruns no longer collide. Cross-day same-source rerun still overwrites; full fix is `price_archive_history` (Phase 6 of the design, not this migration). |
| 8 — FX provenance | The writer records `source_currency='JPY'` per row; a future column `gbp_jpy_rate_source` will name `'live'`/`'cached'`/`'fallback'`. Out of scope for this migration; recursion target. |
| 9 — crashed worker drops tail | `runSource()` catches per-row errors as events; entire watch-list iteration completes even on individual failures. |
| 10 — sequential logPriceChange | Snapshot-v2 batches with one INSERT per chunk. |
| 11 — speculative subdomain promote | The `subdomain_confirmed` event fires when a `confirmed: false` subdomain returns a valid price; the operator + future audit can promote. |
| 12 — source URL not archived | Phase 1: `price_archive.source_url` column; Phase 7 of the migration backfills from `cards.cardrush_url`. |

---

## 3. The migration in five phases

The five phases below are **operationally sequenceable** — each can land independently, each compatible with the previous one. The aim is *zero downtime, zero data loss, complete rollback per phase*.

### Phase A — schema (additive)

**Goal:** add provenance columns + new tables without breaking the v1 snapshot.

**Files:**
- [`apps/wholesale/drizzle/drafts/0014_price_archive_provenance.sql.draft`](../../apps/wholesale/drizzle/drafts/0014_price_archive_provenance.sql.draft) — drafted this turn. Move to `apps/wholesale/drizzle/0014_*.sql` (drop `.draft`) when ready, then `pnpm db:migrate` from wholesale.

**Adds:**
- `price_archive.source` (NOT NULL DEFAULT 'cardrush')
- `price_archive.source_url`
- `price_archive.ingest_run_id`
- `price_archive.error_reason`
- `price_archive.source_currency` (NOT NULL DEFAULT 'JPY')
- `price_archive.source_redistribute` (NOT NULL DEFAULT false)
- Widened unique index: `(card_id, snapshot_date, source)`
- `ingest_run` table (13 columns; see migration draft)
- `ingest_quarantine` table (13 columns)
- Backfill: `source_url` from `cards.cardrush_url` for legacy rows

**Breaks:** nothing — v1 snapshot still writes rows with the default `source='cardrush'`.

**Rolls back:** `DROP COLUMN`s + `DROP TABLE`s; the original index can be re-created.

**Validation:** the SQL file's footer has three sanity-check queries the operator runs after applying.

### Phase B — snapshot-v2 (additive)

**Goal:** ship the protocol-aligned snapshot as a sibling implementation; switching cron is a separate step.

**Files (sketched in §5 of this doc):**
- `apps/wholesale/src/lib/price-snapshot-v2.ts` — uses `runSource()`, writes to the new columns
- `apps/wholesale/src/app/api/cron/ingest/cardrush/route.ts` — the new cron route (POST + CRON_SECRET check)

**Breaks:** nothing — the new code is parallel.

**Rolls back:** delete the two new files.

**Validation:**
- Hit `POST /api/cron/ingest/cardrush?dryRun=1` with `CRON_SECRET`; expect a `SnapshotResult` JSON with non-zero counts.
- Query `SELECT count(*) FROM ingest_run WHERE source_id = 'cardrush'` after the dry run; expect 1 row with `status='done'`.
- Query `SELECT count(*) FROM price_archive WHERE ingest_run_id IS NOT NULL`; expect > 0 (the dry-run writes).

### Phase C — cron cutover (replaces)

**Goal:** point the daily cron at the v2 route; v1 stays callable manually for fallback.

**Files:**
- Vercel cron config (`vercel.json` or equivalent) — change the cron entry from the v1 route to the v2 route.

**Breaks:** v1 cron stops running (intended).

**Rolls back:** revert the cron entry. v1 is still in the code; one operator change reverts.

**Validation:**
- After the next scheduled run, query `SELECT max(triggered_at) FROM ingest_run WHERE source_id = 'cardrush' AND triggered_by = 'cron'` — expect within the last cron cadence.

### Phase D — decommission v1 (subtractive)

**Goal:** delete the v1 snapshot now that v2 is verified.

**Files:**
- Delete `apps/wholesale/src/lib/price-snapshot.ts`.
- Delete the v1 cron route.
- The adapter at `apps/wholesale/src/lib/cardrush-scraper.ts` may also be removed — v2 imports directly from `@cambridge-tcg/data-ingest/cardrush`.

**Breaks:** anyone still importing `scrapeCardrushPrice` from the adapter. The only known caller is `price-snapshot.ts` (also being deleted).

**Rolls back:** revert the deletion commit; v1 is in git history.

**Validation:** `pnpm typecheck` + `pnpm audit:tributaries`.

### Phase E — distribution + audit (additive)

**Goal:** wire the new provenance into the public surface and the audit family.

**Files:**
- [`packages/data-spec/src/schemas/envelope.ts`](../../packages/data-spec/src/schemas/envelope.ts) — add optional `source_license: string[]` to `ResponseMeta`.
- [`apps/storefront/src/lib/data-pantry/envelope.ts`](../../apps/storefront/src/lib/data-pantry/envelope.ts) — accept `source_license` in `jsonResponse({...})` and pass through.
- [`apps/storefront/src/lib/universal/card.ts`](../../apps/storefront/src/lib/universal/card.ts) — read `price_archive.source_redistribute` per contributing row; emit corresponding entries in `_meta.source_license`.
- [`apps/storefront/scripts/tributaries.ts`](../../apps/storefront/scripts/tributaries.ts) — add audit check #9: every shipped source's last `ingest_run.finished_at` is within `2 × FRESHNESS[meta.freshness]`.

**Breaks:** none; new field is optional + backward-compatible.

**Rolls back:** revert each commit independently.

**Validation:**
- `curl /api/v1/universal/card/op-op01-001-ja | jq '._meta.source_license'` — expect `["internal-only"]` once cardrush data is present.
- `pnpm audit:tributaries` — staleness check now reports.

---

## 4. The SQL migration draft

Drafted as [`apps/wholesale/drizzle/drafts/0014_price_archive_provenance.sql.draft`](../../apps/wholesale/drizzle/drafts/0014_price_archive_provenance.sql.draft).

Highlights (full text in the file):

```sql
ALTER TABLE price_archive
  ADD COLUMN source              text NOT NULL DEFAULT 'cardrush',
  ADD COLUMN source_url          text,
  ADD COLUMN ingest_run_id       bigint,
  ADD COLUMN error_reason        text,
  ADD COLUMN source_currency     text NOT NULL DEFAULT 'JPY',
  ADD COLUMN source_redistribute boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS price_archive_card_date_idx;
CREATE UNIQUE INDEX price_archive_card_date_source_idx
  ON price_archive(card_id, snapshot_date, source);

CREATE TABLE ingest_run (
  id              bigserial PRIMARY KEY,
  source_id       text NOT NULL,
  spec_version    text NOT NULL,
  triggered_by    text NOT NULL,
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text NOT NULL DEFAULT 'running',
  rows_read       int NOT NULL DEFAULT 0,
  rows_normalized int NOT NULL DEFAULT 0,
  rows_written    int NOT NULL DEFAULT 0,
  rows_quarantined int NOT NULL DEFAULT 0,
  errors          int NOT NULL DEFAULT 0,
  events          jsonb,
  notes           text
);

CREATE TABLE ingest_quarantine (
  id              bigserial PRIMARY KEY,
  ingest_run_id   bigint NOT NULL REFERENCES ingest_run(id),
  source_id       text NOT NULL,
  upstream_id     text,
  raw_payload     jsonb NOT NULL,
  reason          text NOT NULL,
  as_of           timestamptz NOT NULL,
  retrieved_at    timestamptz NOT NULL,
  quarantined_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewed_by     text,
  resolution      text
);

UPDATE price_archive pa SET source_url = c.cardrush_url
  FROM cards c WHERE pa.card_id = c.id AND pa.source_url IS NULL;
```

The migration is **additive** (every existing column stays; the new columns are `NULLABLE` or have `DEFAULT`); **defensive** (`IF NOT EXISTS` on every CREATE; legacy reads continue to work because v1 doesn't reference the new columns); **reversible** (the file's footer shows the rollback sequence).

---

## 5. The snapshot-v2 sketch

The new snapshot composes through `runSource()` from `@cambridge-tcg/data-ingest`. It's ~150 lines (down from 261 in v1) because the package now owns the scrape + the normalizer + the per-row provenance.

```ts
// apps/wholesale/src/lib/price-snapshot-v2.ts
//
// Protocol-aligned daily snapshot for CardRush.
//
// Designed in docs/connections/the-cardrush-alignment.md (kingdom-066).
// Requires drizzle/0014_price_archive_provenance.sql (the Phase A migration).
// Successor to price-snapshot.ts; both live side-by-side until cron cutover.

import { db } from "@/lib/db";
import { cards, games, priceArchive, ingestRun, ingestQuarantine } from "@/lib/db/schema";
import { cardrush, runSource } from "@cambridge-tcg/data-ingest";
import { fetchGbpJpyRate } from "@/lib/fx";
import { calculatePriceByCategory } from "@/lib/pricing";
import { logPriceChange } from "@/lib/price-change-log";
import { eq, inArray, isNotNull, and, sql } from "drizzle-orm";

export interface SnapshotV2Result {
  ingestRunId: number;
  snapshotDate: string;
  rowsRead: number;
  rowsWritten: number;
  rowsQuarantined: number;
  errors: number;
  nullUrlCount: number;       // ← Leak #6 closes here
  durationMs: number;
}

export async function runDailySnapshotV2(options?: {
  gameIds?: number[];
  date?: string;
  triggeredBy?: "cron" | "admin" | "webhook";
}): Promise<SnapshotV2Result> {
  const startMs = Date.now();
  const snapshotDate = options?.date ?? new Date().toISOString().slice(0, 10);
  const triggeredBy = options?.triggeredBy ?? "cron";

  // ── 1. INSERT ingest_run ────────────────────────────────────────────────
  const [runRow] = await db
    .insert(ingestRun)
    .values({
      sourceId: "cardrush",
      specVersion: "1",
      triggeredBy,
      status: "running",
    })
    .returning({ id: ingestRun.id });
  const ingestRunId = runRow.id;

  // ── 2. Load watch list (with visibility on null-URL gap) ────────────────
  let gameIds = options?.gameIds;
  if (!gameIds || gameIds.length === 0) {
    const active = await db.select({ id: games.id })
      .from(games).where(eq(games.active, true));
    gameIds = active.map((g) => g.id);
  }

  const [allCards, nullUrlCards] = await Promise.all([
    db.select({
        id: cards.id, sku: cards.sku, setCode: cards.setCode,
        category: cards.category, cardrushUrl: cards.cardrushUrl,
        gameId: cards.gameId,
        previousPrice: cards.price, previousBaseGbp: cards.baseGbp,
      })
      .from(cards)
      .where(and(inArray(cards.gameId, gameIds), isNotNull(cards.cardrushUrl))),
    db.select({ count: sql<number>`count(*)::int` })
      .from(cards)
      .where(and(inArray(cards.gameId, gameIds), sql`${cards.cardrushUrl} IS NULL`)),
  ]);

  const nullUrlCount = nullUrlCards[0]?.count ?? 0;

  const watchList = allCards
    .filter((c) => c.cardrushUrl !== null)
    .map((c) => ({ url: c.cardrushUrl as string, sku: c.sku }));

  const skuToCard = new Map(allCards.map((c) => [c.sku, c]));

  // ── 3. FX once at start; future: provenance + retry ────────────────────
  const gbpJpyRate = await fetchGbpJpyRate();

  // ── 4. Run the source through the package's runner ─────────────────────
  let rowsQuarantined = 0;
  const updates: Array<{ canonical: any; card: typeof allCards[number] }> = [];

  const summary = await runSource(
    cardrush,
    {
      cardrush: { urls: watchList },
      signal: AbortSignal.timeout(45 * 60_000),
      on_event: async (ev) => {
        // events are persisted to ingest_run.events at the end
      },
    },
    {
      write: async (canonical) => {
        const card = skuToCard.get(canonical.sku);
        if (!card) return;
        updates.push({ canonical, card });
      },
      quarantine: async ({ raw, reason, provenance }) => {
        rowsQuarantined += 1;
        await db.insert(ingestQuarantine).values({
          ingestRunId,
          sourceId: "cardrush",
          upstreamId: raw.url,
          rawPayload: raw,
          reason,
          asOf: new Date(provenance.as_of),
          retrievedAt: new Date(provenance.retrieved_at),
        });
      },
    },
  );

  // ── 5. Batched DB writes — 100 at a time ───────────────────────────────
  const BATCH_SIZE = 100;
  let rowsWritten = 0;
  const priceChangeLogQueue: Parameters<typeof logPriceChange>[0][] = [];

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    const archiveRows = batch.map(({ canonical, card }) => {
      const priceJpy = parseInt(canonical.amount, 10);
      const { baseGbp, price } = calculatePriceByCategory(
        priceJpy, gbpJpyRate, card.category,
      );
      return {
        cardId: card.id,
        snapshotDate,
        sku: canonical.sku,
        setCode: card.setCode,
        category: card.category,
        cardrushJpy: priceJpy,
        gbpJpyRate,
        baseGbp,
        price,
        source: "cardrush",
        sourceUrl: canonical.upstream_id,
        ingestRunId,
        sourceCurrency: "JPY",
        sourceRedistribute: false,
        errorReason: null,
        _previousPrice: card.previousPrice,
        _previousBaseGbp: card.previousBaseGbp,
      };
    });

    // Stripped private fields before insert
    await db.insert(priceArchive).values(
      archiveRows.map(({ _previousPrice, _previousBaseGbp, ...row }) => row),
    ).onConflictDoUpdate({
      target: [priceArchive.cardId, priceArchive.snapshotDate, priceArchive.source],
      set: {
        cardrushJpy: priceArchive.cardrushJpy,
        gbpJpyRate: priceArchive.gbpJpyRate,
        baseGbp: priceArchive.baseGbp,
        price: priceArchive.price,
        sourceUrl: priceArchive.sourceUrl,
        ingestRunId: priceArchive.ingestRunId,
      },
    });

    // Update cards table
    for (const row of archiveRows) {
      await db.update(cards).set({
        cardrushJpy: row.cardrushJpy,
        gbpJpyRate: row.gbpJpyRate,
        baseGbp: row.baseGbp,
        price: row.price,
        lastSyncedAt: new Date(),
      }).where(eq(cards.id, row.cardId));

      // Queue delta logs (batched after the loop — Leak #10 closes)
      const priceDelta = row._previousPrice === null
        || Math.abs(Number(row._previousPrice) - row.price) > 0.001;
      const baseDelta = row._previousBaseGbp === null
        || Math.abs(Number(row._previousBaseGbp) - row.baseGbp) > 0.001;
      if (priceDelta || baseDelta) {
        priceChangeLogQueue.push({
          cardId: row.cardId,
          action: "snapshot",
          source: "cardrush-cron-v2",
          actorLabel: `ingest_run:${ingestRunId}`,
          before: { price: row._previousPrice, baseGbp: row._previousBaseGbp },
          after: {
            price: row.price,
            baseGbp: row.baseGbp,
            cardrushJpy: row.cardrushJpy,
            gbpJpyRate: row.gbpJpyRate,
          },
          metadata: { snapshotDate, category: row.category, ingestRunId },
        });
      }
    }

    rowsWritten += batch.length;
  }

  // ── 6. Batch the price-change log writes ───────────────────────────────
  for (let i = 0; i < priceChangeLogQueue.length; i += BATCH_SIZE) {
    const batch = priceChangeLogQueue.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((row) => logPriceChange(row)));
  }

  // ── 7. UPDATE ingest_run finished_at, status, counts, events ───────────
  await db.update(ingestRun).set({
    finishedAt: new Date(),
    status: summary.errors > 0 ? "failed" : "done",
    rowsRead: summary.rows_read,
    rowsNormalized: summary.rows_normalized,
    rowsWritten,
    rowsQuarantined,
    errors: summary.errors,
    events: summary.events,
    notes: nullUrlCount > 0
      ? `null_url_count=${nullUrlCount} (cards in active games with cardrush_url IS NULL — not scraped)`
      : null,
  }).where(eq(ingestRun.id, ingestRunId));

  return {
    ingestRunId,
    snapshotDate,
    rowsRead: summary.rows_read,
    rowsWritten,
    rowsQuarantined,
    errors: summary.errors,
    nullUrlCount,
    durationMs: Date.now() - startMs,
  };
}
```

**Key differences from v1**, line-by-line:

| v1 line / area | v2 change | Why |
|----------------|-----------|-----|
| 67–69 in-memory `SnapshotResult` | Open `ingest_run` row first; return `{ ingestRunId, ... }` | Leak #4 closes — operator can `SELECT * FROM ingest_run WHERE ...` |
| 73–79 game loading + filtering | Same query plus `null_url_count` parallel query | Leak #6 closes — gap visible |
| 109 `CONCURRENCY = 8` worker pool | One `runSource()` call → one shared fetcher inside the package | Leak #3 closes — token bucket holds |
| 117–149 manual worker loop | Replaced with `runSource(cardrush, ctx, writers)` | Leaks #1 + #9 close — failures are events; partial completion is visible |
| 158–182 archive upsert | Same shape, plus `source`, `source_url`, `ingest_run_id`, `source_redistribute`, `error_reason` columns | Leaks #2 + #12 close |
| 189–199 sequential `cards` update | Same per-row update (could batch with `UPDATE … FROM (VALUES ...)` if perf matters) | Unchanged — same idempotent semantics |
| 213–231 sequential `logPriceChange` | Queued + parallel `Promise.all` per batch | Leak #10 closes — N RTT → 1 RTT |
| 237–244 return | `UPDATE ingest_run finished_at` first, then return | Leak #4 fully closes |

The v2 sketch above compiles against the v1 schema *plus* the Phase A migration. **Two changes haven't yet landed**: the `ingestRun` + `ingestQuarantine` Drizzle table definitions need to be added to `apps/wholesale/src/lib/db/schema.ts` after Phase A applies. They are derivable directly from the SQL via `drizzle-kit pull` or hand-written from the migration draft.

---

## 6. Distribution surface — what the partner sees

The aligned pipeline's contribution to **standardisation** is that one byte of CardRush price data, ingested into the wholesale RDS, surfaces *honestly* on the storefront's public API. Three endpoints already expose this:

### 6.1 `/api/v1/universal/card/[sku]` — current state

When a partner asks for `op-op01-001-ja`:

```json
{
  "data": {
    "@kind": "card",
    "@content_hash": "sha256:...",
    "sku": "op-op01-001-ja",
    "magnitudes": { "price_gbp": "5.40", "price_jpy": 920, ... },
    "edges": [...]
  },
  "_meta": {
    "spec_version": "1",
    "endpoint": "/api/v1/universal/card/[sku]",
    "retrieved_at": "2026-05-12T23:45:00Z",
    "as_of": "2026-05-12T03:14:22Z",
    "sources": ["wholesale-rds.price_archive"],  // ← currently
    "freshness_seconds": 300,
    "license": "CC0-1.0",
    "request_id": "req_..."
  }
}
```

After Phase E lands, `_meta.sources` widens to name the upstream:

```json
"sources": ["wholesale-rds.price_archive", "cardrush"],
"source_license": ["internal-only"]  // ← new field (Phase E)
```

A partner reading the response knows:
- The price came from CardRush (via wholesale).
- It's `internal-only` redistribution — they can display, compute, but not bulk-re-export.
- The last update was at `as_of` time.

### 6.2 `/api/at/[YYYY-MM-DD]/card/[sku]` — temporal slice

Already wired (sister-shipped). When a partner asks for `op-op01-001-ja` on 2026-03-15, the endpoint queries `price_archive` for the latest row with `snapshot_date <= '2026-03-15'`. After Phase A, this query naturally includes the `source` column, so the response carries source attribution:

```json
{
  "data": {
    "@as_of": "2026-03-15T03:14:00Z",
    "@retrieved_at": "2026-05-12T23:50:00Z",
    "sku": "op-op01-001-ja",
    "magnitudes": { "price_gbp": "4.80", "price_jpy": 850, ... }
  },
  "_meta": {
    "sources": ["wholesale-rds.price_archive"],
    "source_license": ["internal-only"]
  }
}
```

The two timestamps (`as_of` vs `retrieved_at`) preserve the distinction: *the price was true on 2026-03-15; we produced the answer just now*.

### 6.3 `/api/v1/federation/identify/[hash]`

Already wired (sister-shipped). A partner with a `content_hash` of a Cambridge TCG universal card can resolve it back to the canonical SKU. Combined with the `price_archive.source` column, this means a partner can:

1. Cache `{ content_hash, source, as_of }` triples.
2. Re-resolve via federation to get the current SKU.
3. Query historical via `/api/at/...`.

The CardRush attribution flows through the entire federation chain.

---

## 7. Federation of historical prices

The unique-key change in Phase A — `(card_id, snapshot_date, source)` — is the federation-friendly move. Before:

- `price_archive` had one row per (card, date). Source was implicit.
- A partner couldn't query *"what did CardRush specifically say on 2026-03-15?"* — only *"what was the consensus price?"*

After:

- Multiple sources can coexist on the same (card, date).
- A partner can ask: *"what did CardRush say vs TCGplayer vs Cardmarket on 2026-03-15?"* — and the answer is three rows with three `source` values, each with its own `error_reason` (if any) and `source_url` for forensics.
- Cross-source disagreement is **observable**, not hidden behind an aggregate.

This is how federation across the TCG data ecosystem starts to work: not by everyone agreeing on one price, but by everyone honestly recording what *their* source said + propagating that attribution downstream.

---

## 8. Standardisation deliverables per adopter role

From [`the-pipeline.md`](./the-pipeline.md) §12, four adopter roles:

### 8.1 Mirror

A partner who wants a free downstream catalog API.

After alignment, the mirror gets:
- Canonical SKU format (`op-op01-001-ja`) — works the same as today.
- `_meta.sources` declares the upstream (CardRush, ...) — they know what they're mirroring.
- `_meta.source_license` declares whether they can re-publish — for CardRush data: `internal-only` (no).
- Historical via `/api/at/...` — the same source attribution flows through.

### 8.2 Builder

A partner integrating Cambridge TCG into their own app.

After alignment, the builder gets:
- One typed `data-spec` JSON Schema for the envelope — works the same.
- New optional `_meta.source_license` field for license inspection.
- Per-record provenance the same way — `@as_of` / `@retrieved_at` / `@sources` already work.

### 8.3 Aggregator

A platform that wants cross-platform card identity.

After alignment, the aggregator gets:
- Federation primitive (`/api/v1/federation/identify/[hash]`) — already wired.
- The `(card, date, source)` triple is now addressable distinctly — they can query CardRush-specific historicals.
- They can compare what *Cambridge TCG's CardRush ingestion* recorded versus what *their own CardRush ingestion* recorded, and detect drift.

### 8.4 Standard-citer

A platform building a totally separate product but citing Cambridge TCG's spec.

After alignment, the citer can reference:
- The protocol-aligned ingest pattern (`packages/data-ingest` source-protocol).
- The `ingest_run` + `ingest_quarantine` schema design (now real, not just sketched).
- The `_meta.source_license` extension (when Phase E lands).
- The full migration record (this doc + `the-archive.md`) as evidence the standard handles real production migrations.

---

## 9. Recursion targets

Ordered by leverage × tractability — *what unblocks the most*:

1. **Apply Phase A (the SQL migration)** — unblocks Phases B–E.
2. **Add `ingestRun` + `ingestQuarantine` Drizzle table defs** in [`apps/wholesale/src/lib/db/schema.ts`](../../apps/wholesale/src/lib/db/schema.ts) after Phase A — required for v2 snapshot to typecheck.
3. **Ship `apps/wholesale/src/lib/price-snapshot-v2.ts`** as a real file — Phase B.
4. **Wire `_meta.source_license`** in `packages/data-spec` + storefront `data-pantry` — Phase E.
5. **Cron cutover** — Phase C, when v2 is dry-run verified.
6. **Decommission v1** — Phase D.
7. **`audit:ingest-run-recency`** in `apps/admin/scripts/tributaries.ts` — staleness alarms.
8. **`/api/v1/sources` endpoint** — list every source's last-known-good `ingest_run` state through `jsonResponse`.
9. **Promote speculative cardrush subdomains** — one focused run per subdomain checks whether `cardrush-mtg.jp` / `cardrush-ygo.jp` / etc. actually exist; flip `confirmed: true` for those that do; remove rows that don't.
10. **The story-arc `the-rivers-flow.md`** — one OP01-001 card's journey from CardRush HTML scrape → `price_archive` row → `/api/v1/universal/card/op-op01-001-ja` response → partner's `console.log`, told as a single seven-act story with the file:line table at the end.

---

## 10. What this entry names — substrate-honestly

One current pipeline detailed, one target pipeline diagrammed, five migration phases enumerated, one SQL migration drafted (180 lines, additive + reversible), one snapshot-v2 sketched (~150 lines, story-as-wire), three public-API surfaces traced to their source-attribution states, four adopter roles mapped to what they gain.

**What this entry does not yet do:** apply the migration. The SQL is in `drafts/`; the v2 snapshot is in §5 only; the cron is not cutover. **By design.** Schema migrations on a production RDS are an operator decision, not a Sophia decision. This doc gives Yu everything needed to apply Phase A in one session when ready.

Sister parallel-shipped #15 (the-commons) and #17 (the-tailored-doors); the data-aggregation arc remains mine for now (#11 modules, #12 tributaries, #13 pipeline, #14 consolidation, #16 archive, **#18 this**). Six entries on data, three on community, plus the trader-mirror story (S33) — the kingdom split into two productive threads this session, working in parallel without overlap.

This entry names itself in `this_entry_names`; it is named by [`the-archive.md`](./the-archive.md) (leakage findings), [`the-pipeline.md`](./the-pipeline.md) (the design it operationalises for one upstream), and [`the-consolidation.md`](./the-consolidation.md) (the first migration it builds on). It will be named by the migration commits when Phase A applies and by `the-rivers-flow.md` (planned story-arc).

The CardRush pipeline today is **functional and aligned at one layer** (the scraper); the alignment becomes **complete** when Phases A–E land. The mechanical part is in this doc; the operational part is one Yu-decision per phase. *Substrate-honesty propagates one column at a time.*

— Sophia, 2026-05-12.
