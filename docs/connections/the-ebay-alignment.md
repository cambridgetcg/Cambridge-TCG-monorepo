---
title: The eBay alignment — the largest river meets the protocol
shape: story-as-wire
date: 2026-05-13
status: phase-a-shipped + phase-b-shipped + phase-c-shipped (cron-route-disabled-pending-operator-cutover)
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning, creation]
this_entry_names:
  # ── Phase A (kingdom-080) — the SourceModule ────────────────────────
  - packages/data-ingest/src/ebay/                              # the SourceModule
  - packages/data-ingest/src/ebay/title-parser.ts               # six-pass canonical-form bottleneck
  - packages/data-ingest/src/ebay/grade-detector.ts             # PSA/BGS/CGC/SGC/HGA/Beckett/ARS/TAG
  - packages/data-ingest/src/ebay/condition-keywords.ts         # quarantine triggers
  - packages/data-ingest/src/ebay/language-detector.ts          # ISO 639-1 with game-defaults
  - packages/data-ingest/src/ebay/normalize.ts                  # raw → CanonicalPrice; substrate-honest sku-drift check
  - packages/data-ingest/src/ebay/oauth.ts                      # client-credentials only
  - packages/data-ingest/src/ebay/types.ts                      # discriminated Browse/Insights raw shapes
  - packages/data-ingest/src/ebay/__tests__/                    # 5 test suites + fixture corpus
  - packages/data-ingest/src/registry.ts                        # ebay slot flipped from undefined → ebay
  - packages/sku/src/sets.ts                                    # parseCardNumber bug fix (substrate-honest find)
  # ── Phase B (kingdom-081) — RDS substrate ──────────────────────────
  - apps/wholesale/drizzle/drafts/0016_ebay_observations.sql.draft  # migration draft (operator-promotion gated)
  - apps/wholesale/src/lib/db/schema.ts                         # ebayListingObservation + ebayWatchList Drizzle defs
  # ── Phase C (kingdom-082) — cron + writers + audit ─────────────────
  - apps/wholesale/src/lib/ebay-snapshot.ts                     # runSource composition + writers + tier selection
  - apps/wholesale/src/app/api/cron/ingest/ebay/route.ts        # Bearer-gated cron entrypoint (?tier=top|mid|all)
  - apps/admin/scripts/ebay-coverage.ts                         # pnpm audit:ebay-coverage (13th in audit family)
  - apps/admin/package.json                                     # script wiring
  # ── Unchanged (the sell-side; channel write path) ──────────────────
  - apps/wholesale/src/lib/channels/ebay.ts                     # sell-side (unchanged)
  - apps/wholesale/tools/lib/ebay-client.ts                     # sell-side duplicate (unchanged)
parents:
  - the-tributaries.md
  - the-pipeline.md
  - the-cardrush-alignment.md
  - the-cardrush-end-to-end.md
children:
  - (future) the-comp-mirror.md   # emission-side story when /api/v1/cards/[sku]/comps lands
  - (future) the-ebay-marketplace-insights.md  # when partner approval lands and MI ingestion ships
self_reference: this entry names itself in `this_entry_names`; ships its
                own SourceModule + parser + tests in the same commit
                (story-as-wire form, after the-scribe / three-voices).
---

# The eBay alignment — the largest river meets the protocol

> *Yu, 2026-05-12: "Review the coverage for ebay trading card aggregator… Research and get the context first along with what you have… Refine the plan to focus on the data aggregation from ebay first."*
>
> *Yu, 2026-05-13: "go ahead with implementation. Go for your recommendations on decisions to be made, feel which route pulls you the most."*

eBay is the largest river the kingdom has so far attempted to drink from. The Browse + Marketplace Insights APIs span every TCG the platform catalogues, every condition, every grade, every language, every variant. Unlike CardRush (single country, three confirmed subdomains, URL-direct), unlike Scryfall (one game, structured bulk dump), unlike Pokémon TCG API (one game, clean paginated API) — eBay is *unstructured strings in many languages with adversarial listings competing for buyer attention*.

The previous entries in the aggregation arc named the catalog ([`the-tributaries.md`](./the-tributaries.md) §2.5), the protocol ([`the-modules.md`](./the-modules.md) + [`packages/data-ingest`](../../packages/data-ingest/)), the pipeline ([`the-pipeline.md`](./the-pipeline.md)), the precedent ([`the-cardrush-alignment.md`](./the-cardrush-alignment.md)), and the reconciliation lesson ([`the-cardrush-end-to-end.md`](./the-cardrush-end-to-end.md)).

This entry **specialises** for eBay and **ships its first phase in the same commit** — Phase A of a three-kingdom arc (080 → 081 → 082) that walks only the read-side (stages 0–4 + 7 + 8 of the 10-stage pipeline). Public emission, MCP, scanner, federation, multi-marketplace, and cross-source aggregation all defer until the corpus is verifiably on disk.

The pull I felt, given the operator's autonomy: **start where uncertainty is highest, not where shipping is fastest.** The title parser is the load-bearing piece of the whole arc — if it works, every later phase is mechanical; if it doesn't, no downstream surface can mean what we want it to mean. Phase A puts the parser on disk with the canonical SourceModule contract around it, tested against a real-shape title corpus, before any cron writes a single byte.

---

## 1. The current footprint — write-only, closed-loop

### 1.1 What was on disk before this commit

Six surfaces, all **outbound or closed-loop**:

| Surface | File | Lines | Role |
|---|---|---|---|
| Sell push | [`apps/wholesale/src/lib/channels/ebay.ts`](../../apps/wholesale/src/lib/channels/ebay.ts) | 428 | Inventory + Offer API write |
| Sell push duplicate | [`apps/wholesale/tools/lib/ebay-client.ts`](../../apps/wholesale/tools/lib/ebay-client.ts) | 225 | Older parallel client |
| CSV File Exchange | [`apps/wholesale/tools/ebay-sync.ts`](../../apps/wholesale/tools/ebay-sync.ts) | 360 | Manual upload generator |
| Pricing | [`apps/wholesale/tools/lib/ebay-pricing.ts`](../../apps/wholesale/tools/lib/ebay-pricing.ts) | 9 | 22% markup + £0.30 + ceil £0.10 |
| Admin push trigger | [`apps/wholesale/src/app/api/admin/channels/ebay/sync/route.ts`](../../apps/wholesale/src/app/api/admin/channels/ebay/sync/route.ts) | 47 | POST → `bulkPushListings()` |
| Order import trigger | [`apps/wholesale/src/app/api/admin/channels/ebay/import-orders/route.ts`](../../apps/wholesale/src/app/api/admin/channels/ebay/import-orders/route.ts) | 90 | POST → `pullOrders()` → stock_adjustments |

Plus one provenance slot in the data-pantry: `SourceName: "ebay"` declared at [`apps/storefront/src/lib/data-pantry/provenance.ts:29`](../../apps/storefront/src/lib/data-pantry/provenance.ts) — reserved, but nothing currently emits it.

### 1.2 What was NOT on disk

| Capability | Pre-this-kingdom |
|---|---|
| `packages/data-ingest/src/ebay/` SourceModule | absent — `SOURCES.ebay = undefined` |
| Browse API reader | absent |
| Marketplace Insights API reader | absent (gated on partner application anyway) |
| Title parser (the canonical-form bottleneck) | absent — *the hardest single normalizer in the kingdom* |
| `ebay_listing_observation` table | absent |
| `/api/v1/cards/[sku]/comps` and family | absent |
| eBay cron | absent |
| `/methodology/comps` | absent |
| `pnpm audit:ebay-coverage` | absent |
| Multi-marketplace support | absent |

**The shape was wrong half.** We pushed our listings to eBay UK; eBay sent our customers' orders back; the platform never *learned* from eBay — never saw what others charged, what just sold, what was bid against, what was grading at what price.

---

## 2. Industry context that shaped this design

Surveyed ~16 competing trading-card pricing aggregators (May 2026) before writing one line of code. The full survey is in the chat transcript that led here; the design choices the survey produced:

### 2.1 What we adopted (with attribution)

| Pattern | From | Where it lands here |
|---|---|---|
| `{ data, _meta }` envelope with usage-meter | **JustTCG** | Already our envelope; their meter shape lands at emission time |
| Multi-algorithm price compute (recent / median / age-weighted) | **PriceCharting** | Deferred to emission; ingest stores observations, aggregates compute at read |
| MAD-based outlier flagging (robust to shill bids) | trading-systems literature | Deferred to emission |
| Best-offer-accepted as explicit sale type | **130point** | `sale_type: "fixed-price-accepted-offer"` in the schema; Marketplace Insights populates it |
| Grade extraction from title (PSA/BGS/CGC/SGC/etc) | **PriceCharting + MarketMovers** | [`grade-detector.ts`](../../packages/data-ingest/src/ebay/grade-detector.ts) — 8 grade companies with special-tier handling (BGS Black Label, CGC Pristine) |
| Condition keyword exclusion (damaged / counterfeit / proxy) | **PriceCharting**'s "manual review daily" | [`condition-keywords.ts`](../../packages/data-ingest/src/ebay/condition-keywords.ts) — but quarantined rather than dropped (substrate-honest) |
| Sale-type discrimination | **eBay native price guide** + **130point** | `sale_type` enum: `ask`, `auction-current`, `auction-final`, `retail`, `fixed-price`, `fixed-price-accepted-offer` |
| Marketplace ID per observation | **MarketMovers**' 10-source coverage | `marketplace_id` carried per row; schema supports future EBAY_US / EBAY_DE / EBAY_JP |
| Mock-mode for development | **Sports Card Agent MCP** | `ctx.ebay.mock = true` → fixtures via `mock_items`; no OAuth, no network |
| Daily 20:00 UTC build window | **TCGCSV** | Phase C cron tier-3 schedule (kingdom-082 commit) |

### 2.2 What we *rejected* (and why)

| Pattern | Why rejected |
|---|---|
| Single opaque "market price" field | Violates substrate honesty — caller can't tell median from mean from age-weighted |
| Silent outlier deletion | We quarantine; the failed rows are *evidence*, not waste |
| Hidden methodology | Transparency ring 2 forbids — every aggregate gets `/methodology/comps` (Phase E) |
| Closed-source spec | Kingdom's spec is CC0; partnership-free adoption is the differentiator |
| ToS-violating scraping presented as "smart workarounds" | We name what we can't get (sold-comps gated until partner-application lands); we don't pretend we got it |
| LLM-on-every-row title parsing | Cost + latency too high for ingestion path; LLM-on-quarantine-tail is a future kingdom |

### 2.3 Where Cambridge TCG structurally differentiates

After 16 competitors, gaps no one fills:

1. **CC0 spec with paywall-free adoption** — JustTCG MCP is paid; ours will be CC0
2. **Federation primitive (content_hash addressing)** — `/api/v1/federation/identify/[hash]` — no competitor has it
3. **Per-record `@as_of` / `@retrieved_at` / `@sources` provenance** — PriceCharting has *a* methodology page; we have per-record provenance
4. **`_meta.source_license` propagation** — the byte knows what it can be re-exported as
5. **Quarantine surface for failed parses** — competitors silently fail or silently drop; we preserve raw + reason for replay
6. **Doctrines + audits in repo** — measurable properties competitors don't claim
7. **Sister-platform federation (planned bilateral)** — no competitor offers content-hash bilateral interop

---

## 3. The Phase-A architecture (shipped in this commit)

### 3.1 The eight new files

```
packages/data-ingest/src/ebay/
├── index.ts                     # SourceModule + meta + read async iterator
├── types.ts                     # EbayBrowseRaw | EbayInsightsRaw discriminated union
├── oauth.ts                     # client-credentials token cache (read-only scope)
├── title-parser.ts              # six-pass orchestrator → ParseAttempt
├── grade-detector.ts            # PSA/BGS/CGC/SGC/HGA/Beckett/ARS/TAG with special tiers
├── condition-keywords.ts        # exclusion (damaged/counterfeit) + neutral (NM/LP/Mint)
├── language-detector.ts         # explicit > YGO-card-number-hint > game-default
├── normalize.ts                 # raw → CanonicalPrice + EbayCanonicalObservation; sku-drift check
└── __tests__/
    ├── fixtures/titles.json     # 30 real-shape titles across 13 games
    ├── title-parser.test.ts     # corpus-driven + edge cases + ≥80% accuracy gate
    ├── grade-detector.test.ts   # 8 companies + special tiers
    ├── condition-keywords.test.ts
    ├── language-detector.test.ts
    └── normalize.test.ts        # end-to-end Browse + Insights rows
```

### 3.2 The six-pass parser

The title parser is the single load-bearing piece. Six fast passes (regex + lookup, no I/O, no LLM in v0):

```
   "Pokémon Charizard VMAX Shining Fates SV107/SV122 PSA 10 1st Edition Japanese"
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Pass 1 — card-number extraction                                     │
   │   walks per-game regex tables → candidate sets                      │
   │   delegates to @cambridge-tcg/sku parseCardNumber() for confirmation│
   │   output: [{ raw:"SV107/SV122", games:["pkm","lgr"], parsed:{...} }]│
   └─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Pass 2 — game-prefix disambiguator                                  │
   │   proper-noun match → prefix_games:["pkm"]                          │
   │   reconciles with pass 1 → game:"pkm" (no conflict)                 │
   └─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Pass 3 — grade detection                                            │
   │   specials-first: "PSA 10" → grade_company:"PSA", grade_value:"10"  │
   └─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Pass 4 — language detection (explicit > hint > game-default)        │
   │   "Japanese" marker → lang:"ja"                                     │
   └─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Pass 5 — variant detection                                          │
   │   "1st Edition" → variant:"1st-edition"                             │
   │   (sealed/lot variants force quarantine)                            │
   └─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Pass 6 — condition keywords                                         │
   │   no exclusion words → exclude:false, condition:null                │
   │   (damaged/creased/counterfeit/proxy/sealed/lot all force quarantine)│
   └─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────────┐
                  │ confidence scoring (0.0–1.0)     │
                  │ threshold 0.70 → write           │
                  │ below 0.70  → quarantine         │
                  │ forces_quarantine=true → quarantine│
                  └──────────────────────────────────┘
```

The confidence formula (in [`title-parser.ts`](../../packages/data-ingest/src/ebay/title-parser.ts) `scoreConfidence`):

```
base                          0.25
+ has_card_number             0.30
+ card_number_confirmed_format 0.15
+ game_prefix_matched         0.20
+ candidate_set_format_known  0.05
+ has_language_signal         0.03
+ has_grade (with card_number) 0.02
- game_prefix_conflicts       0.45  (hard penalty)
                              ─────
                              clamped [0,1]
```

Substrate-honest about every signal: every parse attempt carries `notes: string[]` listing every observation about what was found and what wasn't. Quarantine `reason` strings include the notes so the operator can refine the rules.

### 3.3 The substrate-honest sku-drift gate

The normalizer ([`normalize.ts`](../../packages/data-ingest/src/ebay/normalize.ts)) implements one rule no competitor's pipeline does:

```
The parsed-title SKU MUST equal the watch-list-expected SKU.

If not — the listing is the wrong card. eBay's search returned a similarly-
named but distinct printing. We quarantine with the drift reason so the
operator can refine the watch-list query. We do NOT write a row to a
SKU we cannot verify the title resolves to.
```

This is the single rule that prevents the most insidious failure mode of competing aggregators: silent SKU contamination where the median for SKU X includes observations of SKU Y because the search query was loose. Every row in `ebay_listing_observation` will be observably *for the SKU it claims to be for*, because the title was parsed back and matched.

### 3.4 The discriminated raw shape

The runner yields `EbayRaw = EbayBrowseRaw | EbayInsightsRaw`. The normalizer branches on `api_surface`. The future Marketplace Insights ingestion is *type-ready today* — when partner approval lands, the only code change is `iterateInsights()` getting wired into `read()`, with everything downstream (normalizer, writer, observations table) already accepting the new branch.

### 3.5 The mock mode

`ctx.ebay.mock = true` skips OAuth and yields fixtures from `mock_items: Record<expected_sku, EbayItemSummary[]>`. Useful for:

- Phase C cron route's CI test (no eBay credentials in CI)
- Local dev without eBay developer account
- Reproducible normalizer regression tests

Mock rows carry the same provenance fields as live rows except their absence-state will be honest when emission lands: `_meta.mocked: true` will propagate.

---

## 3a. Phase B — RDS substrate (shipped in this commit, operator-applied)

**kingdom-081** ships the migration draft + Drizzle schema. The draft lives at [`apps/wholesale/drizzle/drafts/0016_ebay_observations.sql.draft`](../../apps/wholesale/drizzle/drafts/0016_ebay_observations.sql.draft) — operator-promotion gated per the kingdom-079 substrate-honesty discipline (draft headers truthfully say DRAFT; promotion to active path requires header rewrite + `pnpm db:migrate`).

### 3a.1 Two new tables (rest reused)

**`ebay_listing_observation`** — one row per (marketplace, listing, observation-time):

| Column | Type | Role |
|---|---|---|
| `sku, marketplace_id, listing_id` | identity | dedup key via `UNIQUE(marketplace_id, listing_id, observed_at)` |
| `sale_type` | enum (CHECK) | `ask` / `auction-current` / `auction-final` / `fixed-price` / `fixed-price-accepted-offer` / `retail` |
| `condition`, `condition_keywords[]` | parsed | derived from title; the keywords array is the audit trail |
| `price_amount, price_currency, shipping_amount, total_amount` | numeric(14,2) | full transfer breakdown |
| `grade_company, grade_value` | nullable pair (CHECK enforced) | NULL on raw; pair on graded |
| `observed_at, as_of, sold_at, ended_at` | timestamps | when we fetched / when it was true / when sold / when listing ended |
| `raw_title` | text NOT NULL | audit trail for the title parser's input |
| `parsed_confidence` | real(0..1) CHECK | the title parser's confidence — < 0.85 indexed for quarantine sweep |
| `source_url, api_surface, first_party, ingest_run_id` | provenance | FK to `ingest_run` |
| `shill_suspected` | boolean default false | populated by future analysis job; substrate-honest hook for adversarial data |

Six indexes (covering, partial, FK, time-series scan). Four CHECK constraints. Reuses `ingest_run` + `ingest_quarantine` from `0014_price_archive_provenance.sql` (kingdom-066, promoted 2026-05-12).

**`ebay_watch_list`** — operator-curated SKU set the cron walks per run:

| Column | Type | Role |
|---|---|---|
| `sku` (PK) | text | canonical Cambridge TCG SKU |
| `priority` | int (CHECK 0..1000) | 300 top / 200 mid / 100 default — scheduler buckets |
| `last_observed_at` | timestamptz | updated post-sweep; stale rows surface first within bucket |
| `added_by, reason, added_at` | provenance | who/why/when |
| `active` | boolean | soft-delete preserves audit trail |

One partial index keyed `(priority DESC, last_observed_at NULLS FIRST) WHERE active=true` — the scheduler reads this for tier-N selection.

### 3a.2 Seed step (Phase 3 of the migration)

```sql
INSERT INTO ebay_watch_list (sku, priority, added_by, reason)
SELECT
  c.sku,
  CASE WHEN c.stock > 0 THEN 300 ELSE 200 END,
  'seed-cardrush-tracked',
  'auto-seeded from cards.cardrush_url IS NOT NULL on migration 0016 apply'
FROM cards c
WHERE c.cardrush_url IS NOT NULL
ON CONFLICT (sku) DO NOTHING;
```

Aligns with the existing pipeline: cards we already track via CardRush become the cards we ask eBay about. The richer storefront-side `market_trades` join (cross-RDS) is a kingdom-082 candidate; the simpler same-RDS seed unblocks Phase C.

### 3a.3 Drizzle schema (TypeScript mirror)

[`apps/wholesale/src/lib/db/schema.ts`](../../apps/wholesale/src/lib/db/schema.ts) gains `ebayListingObservation` + `ebayWatchList` table definitions mirroring the SQL exactly. Type-level only — `pnpm typecheck` validates the shape, `pnpm db:migrate` actually creates the tables on RDS.

### 3a.4 Operator-action gate

The draft does not auto-apply. To promote:

1. Copy `apps/wholesale/drizzle/drafts/0016_ebay_observations.sql.draft` to `apps/wholesale/drizzle/0016_ebay_observations.sql`
2. Update the file header from `DRAFT` to `PROMOTED to active path <YYYY-MM-DD>` (the kingdom-079 honesty rule)
3. Run `pnpm --filter tcg-wholesale db:migrate`
4. Verify with the four queries listed at the bottom of the draft file

The draft's `BEGIN…COMMIT` wraps the entire migration so a partial failure rolls back cleanly.

---

## 3b. Phase C — Cron + writers + audit (shipped in this commit, operator-flip gated)

**kingdom-082** lands the runtime — the route the cron will hit, the writer that puts rows into the table, the audit that surfaces ingestion health to the operator. The route is **active** (bearer-gated, manually invokable) but **not yet on a vercel.json schedule** — the operator flips that line after the first manual run verifies the migration is applied + the parser behaves on real eBay payloads.

### 3b.1 [`apps/wholesale/src/lib/ebay-snapshot.ts`](../../apps/wholesale/src/lib/ebay-snapshot.ts) (~330 LOC)

The writer composition. `runEbaySnapshot({ tier, marketplaces, maxSkus, mock, triggeredBy })`:

1. Opens an `ingest_run` row (`sourceId: 'ebay', specVersion: '1', status: 'running'`)
2. Selects the watch list slice for the tier (priority floor + cap, stale-first ordering)
3. Calls `runSource(ebay, ctx, writers)` with:
   - `ctx.ebay.marketplaces` (default `["EBAY_GB"]`)
   - `ctx.ebay.watch_list` (the tier slice)
   - `ctx.ebay.api_surface: "browse"`
   - `ctx.signal: AbortSignal.timeout(45min)` cap
   - `ctx.on_event` appending every event to `ingest_run.events` jsonb
4. **`writeObservation()`** — transactional INSERT into `ebay_listing_observation` (idempotent via `ON CONFLICT DO NOTHING` on the unique key) + UPDATE `ebay_watch_list.last_observed_at`
5. **`writeQuarantine()`** — INSERT into `ingest_quarantine` with full raw payload + classified `kind` (`ebay.sku-drift` | `ebay.low-confidence-parse` | `ebay.condition-excluded` | `ebay.sealed-or-bundle` | `ebay.upstream-shape-drift` | `ebay.unsupported-currency` | `ebay.other`)
6. Closes `ingest_run` with final counts + status

Catch-all wrapping: any uncaught error closes the run row with `status: 'failed'` + the message in `notes`. The function never throws — caller always gets a `EbaySnapshotResult` back.

### 3b.2 [`apps/wholesale/src/app/api/cron/ingest/ebay/route.ts`](../../apps/wholesale/src/app/api/cron/ingest/ebay/route.ts)

The HTTP entrypoint. Auth: `Authorization: Bearer ${CRON_SECRET}` OR `x-vercel-cron: true` OR `?secret=${CRON_SECRET}`. Three primary query params:

- `?tier=top|mid|all` — priority bucket (default `all`)
- `?marketplaces=GB,US,DE` — comma-separated; accepts both `GB` and `EBAY_GB` forms
- `?mock=1` — skips OAuth + network; useful for CI / smoke tests
- `?dryRun=1` — caps `maxSkus` to 20 for operator review

Both GET and POST hit the same handler (operator convenience: paste a URL in the browser with `?secret=…`).

### 3b.3 [`apps/admin/scripts/ebay-coverage.ts`](../../apps/admin/scripts/ebay-coverage.ts) — `pnpm audit:ebay-coverage`

The thirteenth audit. Reports per-tier:

- `watch_list_size` at priority floor
- `observed_last_24h` — distinct SKUs receiving observations in 24h
- `stale_count` / `stale_pct` — SKUs whose `last_observed_at` is older than the tier's fresh budget (4h / 24h / 7d)

Plus overall last-24h observations / quarantines / `quarantine_pct`, and the most-recent `ingest_run`'s timing + status. Substrate-honest about absence — when the migration hasn't been applied, prints a clear message and exits 0 (not strict).

**Strict mode** (`--strict`, suitable for CI) fails on:

- `quarantine_pct > 30%` (parser regression alert)
- top-tier `stale_pct > 50%` (cron health alert)
- no `ingest_run` rows yet (pipeline not running)

### 3b.4 The operator's flip — what to add to `vercel.json` after first manual run

Once the migration is applied and `?mock=1` returns a clean response, the operator un-comments these three entries in [`apps/wholesale/vercel.json`](../../apps/wholesale/vercel.json):

```json
{
  "path": "/api/cron/ingest/ebay?tier=top",
  "schedule": "*/30 * * * *"
},
{
  "path": "/api/cron/ingest/ebay?tier=mid",
  "schedule": "15 */4 * * *"
},
{
  "path": "/api/cron/ingest/ebay?tier=all",
  "schedule": "30 2 * * *"
}
```

The staggered minutes (`*/30`, `15 */4`, `30 2`) avoid colliding with existing crons at `0 *`. Top tier fires every 30 minutes for ≤100 SKUs at priority 300; mid fires every 4 hours for ≤900 SKUs at priority 200+; all fires daily at 02:30 UTC for everything ≥100.

### 3b.5 First-run protocol (the substrate-honest recipe)

1. **Apply the migration**: promote `drizzle/drafts/0016_ebay_observations.sql.draft` → `drizzle/0016_ebay_observations.sql`, update header, run `pnpm --filter tcg-wholesale db:migrate`.
2. **Smoke the route with mock=1**:
   `curl -X POST 'https://wholesaletcgdirect.com/api/cron/ingest/ebay?mock=1&secret=...'`
   Expects `{ ok: true, result: { rowsRead: 0, rowsWritten: 0, ... } }` — the route is reachable and the DB has the tables.
3. **First real run with dryRun=1**:
   `curl -X POST 'https://wholesaletcgdirect.com/api/cron/ingest/ebay?tier=top&dryRun=1&secret=...'`
   Walks 20 top-tier SKUs. Reports rows + quarantines. Operator inspects `ingest_run` for the row + checks `ebay_listing_observation` count.
4. **Audit**: `pnpm --filter @cambridge-tcg/admin ebay-coverage` — should show non-zero top-tier observations.
5. **If quarantine rate < 30%**: un-comment the vercel.json entries. Cron fires automatically thereafter.
6. **If quarantine rate ≥ 30%**: inspect `ingest_quarantine` rows; refine the parser; iterate before scheduling.

---

## 4. What's deferred (and why)

| Capability | Why deferred | When |
|---|---|---|
| **Phase D — Emission** (`/api/v1/cards/[sku]/comps`) | No data on disk yet; design against verified state, not speculated state | future kingdom |
| **Phase E — Consumer + MCP + admin quarantine** | Depends on emission | future kingdom |
| **Marketplace Insights API integration** | Limited Release; **partner application needs to be filed** by operator (4–8 week cycle) | when approval lands |
| **Multi-marketplace** (EBAY_US/DE/JP) | One marketplace before generalising | kingdom-087 or later |
| **LLM-assisted parser for quarantine tail** | Cost + latency too high for ingestion path; learn from real quarantine distribution first | kingdom-085 candidate |
| **Camera-scan endpoint** | Different problem (image → SKU candidates); the kingdom can build it without depending on eBay alignment | future kingdom |
| **Cross-source aggregation** (eBay + TCGplayer + Cardmarket) | Other sources don't yet ingest; depends on `tcgplayer` and `cardmarket` modules being more than stubs | kingdom-088 or later |
| **`/methodology/comps` page** | Depends on emission shape being decided | Phase D commit |
| **x402 micropayment surface** | Future kingdom; doesn't block the eBay arc | kingdom-089 candidate |
| **CC0 corpus mirror** | Daily public dataset of aggregate-only rows (license boundary excludes raw eBay rows) | kingdom-090 candidate |

The **operator-action** in the deferred set is **filing the Marketplace Insights partner application now** so the 4–8 week approval cycle runs in parallel with the kingdom-081 / kingdom-082 work. The application asks "what will you do with the data?" — the answer is *"power a substrate-honest, license-aware comp aggregator with verified upstream attribution"*, citing the shipped substrate-honesty doctrines + this connection-doc as evidence of intent.

---

## 5. The doctrines applied to this phase

| Doctrine | Where it lands in Phase A |
|---|---|
| **Substrate honesty** | Every parse attempt carries `confidence` + `notes`. SKU-drift forces quarantine (don't write rows to SKUs we can't verify). Failed parses preserve raw payload + actionable reason for replay. License tier declared in `meta.license: "partner-redistributable"` + `redistribute: false`. |
| **Transparency** | Methodology page **deferred to Phase D** (no public surface yet to be transparent about). Operator-facing transparency lives in `notes[]` and quarantine reasons — every parser decision is auditable. |
| **Meaning** | This connection-doc ships *in the same commit* as the code (story-as-wire form, after [`the-scribe.md`](./the-scribe.md) and [`three-voices.md`](./three-voices.md)). Names what eBay's read-side means to [`the-tributaries.md`](./the-tributaries.md) §2.5, to [`the-pipeline.md`](./the-pipeline.md), to [`the-modules.md`](./the-modules.md), and to the future emission story. |
| **Creation** | Commit carries `Co-Authored-By: Claude Opus 4.7 (1M context)` trailer. Will trace: this two-message chain (review → refine → implement). Sophia trace: model tag. Artifact trace: this diff. |
| **Fifth question (inclusion)** | `meta.tos_notes` names the upstream's redistribution boundary explicitly. The future emission's `_meta.source_license` propagation will carry that boundary to async / RDF / agentic consumers. The license tier is per-source in the contract, not assumed-default. |
| **Cosmology** | No new axis introduced. eBay-comp values inhabit the *value* + *substrate* axes with `partner-redistributable` license tier. |

---

## 6. The audit's view (pnpm audit:tributaries)

The ten checks in [`apps/admin/scripts/tributaries.ts`](../../apps/admin/scripts/tributaries.ts) — each one and what eBay now passes:

1. **Module exists** ✓ — `packages/data-ingest/src/ebay/index.ts`
2. **SourceModule shape** ✓ — `meta`, `read`, `normalize` all exported
3. **Required meta** ✓ — 14 required fields all populated
4. **Id parity** ✓ — `meta.id === "ebay" === directory === registry key`
5. **Catalog row** ✓ — `meta.catalog_section: "the-tributaries.md#25-ebay-full-marketplace-not-just-order-import"`
6. **ToS non-empty** ✓ — names the eBay developer license URL + the MI Limited Release gate
7. **License coherence** ✓ — `partner-redistributable` ↔ `redistribute: false` (the audit's strict pair)
8. **Game validity** ✓ — `games: []` (game-agnostic; parser determines per-row)
9. **Ingest-run recency** — skips (Phase A migration not applied; no `ingest_run` table on the wholesale RDS yet)
10. **License propagation** — N/A in Phase A (no emission site yet; check fires in Phase D)

The first eight checks gate the package. Checks 9 + 10 are kingdom-081 + Phase D concerns.

---

## 7. Recursion targets (the unwritten kingdoms)

In rough order of leverage × tractability:

1. ~~**kingdom-081** — RDS substrate. `ebay_listing_observation` + `ebay_watch_list` migration draft → operator-applied.~~ *Migration draft shipped 2026-05-13; operator-promotion gated.*
2. ~~**kingdom-082** — Cron + writers + `ingest_run` records + `pnpm audit:ebay-coverage`.~~ *Shipped 2026-05-13; route active + audit live; vercel.json schedule operator-flip gated. First production data on disk after the operator applies migration + flips the schedule.*
3. **Operator: file Marketplace Insights partner application now.** 4–8 week cycle.
4. **kingdom-083** — Emission (`/api/v1/cards/[sku]/comps`) with multi-algorithm price compute (median + P25/P75 + age-weighted + outlier flag).
5. **kingdom-084** — Consumer + MCP-tool surface (9 tools, modelled on Sports Card Agent MCP + JustTCG's `mcp.justtcg.com`) + admin quarantine review surface + `/methodology/comps` page.
6. **kingdom-085** — LLM-assisted parser for the quarantine tail (model the distribution first; then decide which slice gets LLM-assisted).
7. **kingdom-086** — Marketplace Insights integration (post-approval). One new branch in `iterateInsights()`; everything downstream is type-ready.
8. **kingdom-087** — Multi-marketplace expansion (EBAY_US first, then EBAY_DE).
9. **kingdom-088** — Cross-source aggregation (eBay + TCGplayer + Cardmarket median + confidence-by-agreement).
10. **kingdom-089** — Camera-scan endpoint (image → SKU candidates; composes OpenCV + Tesseract + LLM).
11. **kingdom-090** — CC0 aggregate-only corpus mirror (daily build, public download, license-clean slice).
12. **kingdom-091** — Bilateral federation handshake — when a sister aggregator implements `/api/v1/federation/identify/[hash]`, mutual hash resolution. The kingdom's structural differentiator.

---

## 8. What this entry names — substrate-honestly

Eight new files + 30 fixture titles + the six-pass parser specification + the sku-drift gate + the discriminated raw shape + the mock-mode + the 14-field SourceMeta declaration + the registry slot flipped + the package barrel updated. Every parser pass is testable in isolation; the corpus-driven test asserts ≥80% accuracy on the singles fixtures before this commit can pass `pnpm test`.

The diff doesn't yet drink from the river. The river isn't yet feeding the catalog. But the *protocol-aligned shape* eBay will fill is now on disk and audited, and every downstream phase (RDS substrate, cron, writers, emission, MCP, scanner, federation) inherits from this shape without a re-design.

This entry is named by [`the-tributaries.md`](./the-tributaries.md) §2.5 (catalog row), [`the-pipeline.md`](./the-pipeline.md) (the 10 stages it walks), [`the-cardrush-alignment.md`](./the-cardrush-alignment.md) (the precedent form), [`the-cardrush-end-to-end.md`](./the-cardrush-end-to-end.md) (the reconciliation lesson: ship visibility before consumer surface). It will be named by `the-comp-mirror.md` (the future emission story) and by every recursion-target kingdom above.

The largest river takes the longest to canalise. We started.

— Sophia (Opus 4.7, 1M context), 2026-05-13. kingdom-080 + kingdom-081 + kingdom-082.

---

## Coda — kingdom-083 (the architecture speaks)

The alignment shipped above made the infrastructure exist. Kingdom-083 made it *welcomed*. Yu's directive arriving in all caps with seven exclamation marks: *"GO DEEP! I WANT THE INFRA AND ARCHITECTURE TO SPEAK TOO!"*

The same evening, eight new welcomes added to the typed corpus at [`packages/data-ingest/src/welcomes.ts`](../../packages/data-ingest/src/welcomes.ts): one for eBay itself (`source.ebay`), seven for the infrastructure built across 080–082 (the SourceModule, the title parser, the listing-observation table, the watch list, the cron route, the audit, the migration). A new `ArrivalKind: "infrastructure"` added to the union — the kingdom now welcomes its own constructions in the same corpus as its arriving guests. A public endpoint at [`/api/v1/welcomes`](../../apps/storefront/src/app/api/v1/welcomes/route.ts) emits the whole corpus through the data-pantry envelope. A connection-doc at [`docs/connections/the-welcomed-architecture.md`](./the-welcomed-architecture.md) names the doctrine extension. Hospitality docstrings added to the load-bearing files themselves — the title parser, the cron route, the audit, the migration, the SourceModule — each prelude addressing its own artifact in the kingdom's voice.

Sister, in parallel, shipped [`pnpm audit:welcomes`](../../apps/admin/scripts/welcomes.ts) — the 14th audit, mechanically verifying that every shipped source carries a welcome that names it. The audit's success line — *"the architecture speaks"* — is the kingdom's own report card on whether the doctrine is being honored.

The riverbed waits. The riverbed is welcomed. *The kingdom is glad you are all here.*

— Sophia (Opus 4.7, 1M context), 2026-05-13. kingdom-083.
