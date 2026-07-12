---
title: The TCGplayer alignment — second upstream into the cross-source pricing substrate
kingdom: kingdom-080
shape: node-view
date: 2026-05-13
status: historical implementation record (source blocked)
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning, creation]
this_entry_names:
  - apps/wholesale/drizzle/0015_tcgplayer_cross_source.sql       # the schema
  - apps/wholesale/src/lib/db/schema.ts                           # drizzle defs (cards + price_archive + new tables)
  - apps/wholesale/src/lib/ingest/tcgplayer.ts                    # the writer + token lifecycle
  - apps/wholesale/src/app/api/cron/ingest/tcgplayer/route.ts     # three-mode cron entrypoint
  - apps/wholesale/tools/tcgplayer-seed-set.ts                    # operator CLI
  - apps/wholesale/src/lib/fx.ts                                  # generalised GBP/<currency> fetcher
  - packages/data-ingest/src/tcgplayer/                           # source module (oauth + categories + conditions + types + normalize + index)
  - packages/data-ingest/src/canonical.ts                         # CanonicalMapping added
  - apps/admin/scripts/tcgplayer-mapping.ts                       # 13th audit
  - docs/connections/the-tcgplayer-alignment.md                   # this file
parents:
  - the-cardrush-alignment.md
  - the-cardrush-end-to-end.md
  - the-pipeline.md
  - the-tributaries.md
  - the-modules.md
  - the-archive.md
self_reference: this entry names itself in `this_entry_names`; the
                aggregation-phase code is shipped in the same commit as
                this doc (story-as-wire).
---

# The TCGplayer alignment — second upstream into the cross-source pricing substrate

> **Current boundary, 2026-07-12:** The engineering substrate below remains as history, but Cambridge has no recorded TCGplayer approval or observations. The source, token minting, writer, seed tool, and public or authenticated history routes are blocked. Credentials, authentication, storage, transformation, or an `internal-only` label cannot reopen them or create publication permission. Any later auth-gated or personal-decision language in this record is withdrawn.

> *Yu, 2026-05-13: "Review the coverage for tcgplayer aggregator, map how the pipeline works… create comprehensive implementation plan based on current progress."*  
> *Then: "Look deeper into the SKU consolidation and how the pricing work on tcgplayer…"*  
> *Then: "Further refine to focus on the data aggregation phase."*  
> *Then: "Go ahead with implementation. Go for your recommendations on decisions to be made."*

Four directives, four widenings, one kingdom. The prior plan (kingdom-066, [`the-cardrush-alignment.md`](./the-cardrush-alignment.md)) had named the *shape* of the pipeline for one upstream. Kingdom-079 ([`the-cardrush-end-to-end.md`](./the-cardrush-end-to-end.md)) had made it *observable*. This kingdom takes the same shape, **lifts it to handle a second upstream of a fundamentally different model** (OAuth2 catalog API instead of HTML scrape; per-condition pricing instead of single-tier; USD instead of JPY; partner-tier license instead of internal-only), and ships the aggregation phase end-to-end.

The asymmetry the prior plans named has finally folded: `price_archive` is no longer "the CardRush archive with a `source` column"; it is the platform's cross-source pricing substrate, keyed by `(card_id, snapshot_date, source, condition)`, with `extra jsonb` for source-specific fields and generalised FX provenance. The next upstream (Cardmarket — kingdom-NNN+1) will land in the same shape; the kingdom after that (eBay Browse) the same again.

---

## 1. The SKU consolidation problem, resolved at the schema level

TCGplayer's identifier hierarchy is asymmetric vs Cambridge's canonical SKU. Both ends are lossy if you store only one mapping column:

```
TCGplayer side                          Cambridge side
──────────────                          ──────────────
categoryId        (game family)         game (∈ GAME_CODES)
groupId           (set)                 set_code
productId         (printing aggregate)  base SKU (game+set+number+lang+variant)
skuId             (× condition × printing × lang)   (no direct equivalent;
                                                     leaf = (canonical_sku, condition))
subTypeName       (Normal/Foil/...)     variant tail ('foil'/'rev'/'1st'/...)
```

The resolution shipped in migration 0015:

**On `cards`:**
- `tcgplayer_product_id integer` — the printing aggregate (one per Cambridge SKU's product-level mapping)
- `tcgplayer_group_id integer` — set abbreviation
- `tcgplayer_sub_type text` — `'Normal' | 'Foil' | 'Reverse Holofoil' | ...`
- Unique index on `(tcgplayer_product_id, tcgplayer_sub_type)` — the printing-level leaf cannot map to two cards

**Side table `card_tcgplayer_sku_ids`:**
- `(card_id, condition, language)` → `tcgplayer_sku_id`
- One row per (card × condition × language) — the per-condition leaves
- Unique on `(card_id, condition, language)` AND `tcgplayer_sku_id` (federation-friendly both directions)

This shape lets the federation endpoint resolve in **both** directions:
- TCGplayer skuId → our `(canonical_sku, condition)` via the side table
- Our canonical SKU → TCGplayer skuId by joining

Plus the federation primitive `/api/v1/federation/identify/by-upstream?source=tcgplayer&upstream_id=<id>` (planned, Phase F of the prior plan) becomes a single index seek either way.

---

## 2. How TCGplayer pricing works (the five-field structure persisted)

TCGplayer returns five pricing fields per `(productId, subTypeName)` OR per `skuId`:

| Field | What it is | Persist? |
|-------|------------|----------|
| `lowPrice` | Lowest currently listed | `extra.low` |
| `midPrice` | 50th percentile of listings | `extra.mid` |
| `highPrice` | Highest currently listed | `extra.high` |
| `marketPrice` | TCGplayer's algorithmic headline — what they show publicly | **headline** (top-level `price_archive.base_gbp`) |
| `directLowPrice` | TCGplayer Direct in-house seller lowest | `extra.direct_low` |

The schema change (Phase 3 of migration 0015):

```sql
ALTER TABLE price_archive
  ADD COLUMN condition       text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN extra           jsonb,
  ADD COLUMN fx_rate_to_gbp  numeric(12, 6),
  ADD COLUMN fx_rate_source  text;

DROP INDEX price_archive_card_date_source_idx;
CREATE UNIQUE INDEX price_archive_card_date_source_condition_idx
  ON price_archive(card_id, snapshot_date, source, condition);
```

**The headline number choice — locked in as `marketPrice`.** It's what TCGplayer shows publicly; smoothed; less prone to single-listing manipulation. The full spread rides in `extra` so downstream consumers can see it. When `marketPrice` is null, the normalizer falls through to `midPrice` then `lowPrice`; all-null lands a substrate-honest row with `error_reason='all_pricing_fields_null'`.

**FX provenance — Leak #8 from the-archive.md closed.** Every TCGplayer row carries `fx_rate_to_gbp` + `fx_rate_source` (live / cached / fallback). The generalised `fetchGbpRate(code)` in `apps/wholesale/src/lib/fx.ts` is the source.

---

## 3. The two read modes (the most-conflated shape-mistake)

CardRush had one read mode. TCGplayer has **two**:

| Mode | Cardinality | Cron cadence | Writes |
|------|-------------|--------------|--------|
| `catalog` | ~300K products across 11 categories | Weekly OR operator-driven via `pnpm wholesale tcgplayer:seed-set` | `cards.tcgplayer_product_id`, `card_tcgplayer_sku_ids` |
| `live-pricing` | ~15K skuIds (hot-watch: inventory + watchlist) | 5-min during US trading | `price_archive` rows |
| `bulk-pricing` | ~36K-180K skuIds (all-mapped) | Nightly | `price_archive` rows |

The reader at [`packages/data-ingest/src/tcgplayer/index.ts`](../../packages/data-ingest/src/tcgplayer/index.ts) dispatches on `ctx.tcgplayer.mode`. The cron route at [`apps/wholesale/src/app/api/cron/ingest/tcgplayer/route.ts`](../../apps/wholesale/src/app/api/cron/ingest/tcgplayer/route.ts) dispatches on `?mode=` query param. Same writer module covers both pricing modes (scope differs).

**Rate-limit arithmetic:**
- Catalog walk: ~30K requests per game at 5rps = ~100 min per game (best done via the seed-set CLI, not inline cron)
- Live-pricing refresh: ~15K skuIds / 250 per batch = 60 requests = ~12 seconds (fits the 5-min window with headroom)
- Bulk-pricing refresh: ~720 requests = ~72 seconds (fits nightly cron)

---

## 4. OAuth2 lifecycle persisted to RDS

TCGplayer's OAuth2 access_token has ~14d TTL. Persisting in env-or-memory loses observability of rotation; KV loses portability. **The token lives in RDS** — `external_source_tokens` table (Phase 5 of migration 0015):

```sql
CREATE TABLE external_source_tokens (
  source_id        text PRIMARY KEY,
  access_token     text NOT NULL,
  expires_at       timestamptz NOT NULL,
  minted_at        timestamptz NOT NULL DEFAULT now(),
  rotation_count   int NOT NULL DEFAULT 0,
  refresh_token    text,
  scopes           text
);
```

The writer's `ensureTcgplayerToken({ force? })` is the operational primitive:
- Reads the cached row, returns it if `expires_at > now() + 60s`
- Otherwise mints fresh via `mintTcgplayerToken(creds, fetcher)` (the pure function in `packages/data-ingest/src/tcgplayer/oauth.ts`)
- UPSERTs back with `rotation_count += 1`

The reader uses `ctx.bearer` (set by the writer at run start). For mid-run 401s, the writer wires `ctx.refresh_token = async () => { ... }` which re-mints + updates `ctx.bearer` in place. (The hook is on the IngestContext type union, not the package's core IngestContext — extension shape that future OAuth sources reuse.)

**Cardmarket / eBay / future OAuth flows reuse this table identically** — one row per `source_id`. The table is shape-stable across upstreams.

---

## 5. The one-raw-to-many fan-out, resolved in `read()` not `normalize()`

The consolidation doc (kingdom-062) had named widening `NormalizeResult` to arrays as a recursion target. **This kingdom does not invoke it** — the reader pre-fans-out into per-`(productId × subType × condition × language)` rows before the normalizer sees anything. The normalizer stays 1:1; the protocol stays stable.

The reader's fan-out flow:
1. Catalog mode: walk `/catalog/groups/{id}/products` → for each product, `/catalog/products/{id}/skus` → yield one `CatalogRaw` per (product, joined skus). Normalizer emits one `CanonicalMapping` per row carrying `leaf_ids[]`.
2. Pricing mode: from the watchlist of skuIds, batch `/pricing/sku/{ids}` (max 250) → for each pricing row, look up its `TcgplayerSkuExpanded` metadata → yield one `PricingRaw` per row. Normalizer emits one `CanonicalPrice` per row.

YGOPRODeck's one-card-many-printings problem stays its own concern; future sources that genuinely fan from one upstream row to multiple canonicals can adopt the array-widening as needed.

---

## 6. The quarantine taxonomy

Migration 0015 adds `ingest_quarantine.kind` so the admin review surface filters by failure class. Eight kinds named:

| Kind | When | Recovery |
|------|------|----------|
| `mapping.no-set-match` | Catalog walk found a productId whose set isn't in our `cards` | Import the set or extend the variant map |
| `mapping.ambiguous` | Multiple cards match (set_code, card_number) | Operator decides canonical |
| `mapping.unmapped-condition` | TCGplayer returned a condition string not in TCGPLAYER_CONDITION_MAP | Extend `conditions.ts` |
| `mapping.unmapped-subtype` | Unknown sub_type outside KNOWN set | Extend `categories.ts` |
| `pricing.unmapped-product` | Pricing arrived for `(product_id, sub_type)` with no cards row | Run seed-set for the group |
| `pricing.mapping-drift` | Hint card_id ≠ live mapping result | Audit the cards row |
| `fx.rate-fetch-failed` | USD→GBP fetch failed AND no cached rate | Manual FX seed; rerun |
| `upstream.shape-drift` | TCGplayer changed a field name / removed extendedData.Number | Update normalizer; reprocess |

The writer at `apps/wholesale/src/lib/ingest/tcgplayer.ts` classifies via `classifyMappingReason()` and `classifyPricingReason()` heuristics — both are open to extension.

---

## 7. The aggregation-phase deliverables (what shipped this turn)

| Layer | File | LOC | Notes |
|-------|------|-----|-------|
| Schema | `apps/wholesale/drizzle/0015_tcgplayer_cross_source.sql` | ~200 | Six phases; additive; backfills cardrush rows to condition='nm' + fx_rate_to_gbp |
| Drizzle defs | `apps/wholesale/src/lib/db/schema.ts` | +90 | tcgplayer columns + price_archive widening + cardTcgplayerSkuIds + externalSourceTokens + fxRate customType |
| Canonical type | `packages/data-ingest/src/canonical.ts` | +50 | CanonicalMapping discriminant added to CanonicalRecord union |
| Source module | `packages/data-ingest/src/tcgplayer/` | ~1100 | oauth + categories + conditions + types + normalize + index (replaces stub) |
| Package exports | `packages/data-ingest/src/index.ts` | +30 | Public surface for the new types + helpers |
| Registry | `packages/data-ingest/src/registry.ts` | 1 | Status: planned → partial |
| Writer | `apps/wholesale/src/lib/ingest/tcgplayer.ts` | ~650 | ensureTcgplayerToken + runTcgplayerCatalog + runTcgplayerPricing + writePricingBatch + mapping resolution |
| FX helper | `apps/wholesale/src/lib/fx.ts` | +30 | Generalised fetchGbpRate(code); fetchGbpJpyRate + fetchGbpUsdRate wrappers |
| Cron route | `apps/wholesale/src/app/api/cron/ingest/tcgplayer/route.ts` | ~140 | Three-mode dispatcher |
| Seed CLI | `apps/wholesale/tools/tcgplayer-seed-set.ts` | ~190 | Operator-driven catalog walk; deferred db import so --help works without env |
| Audit | `apps/admin/scripts/tcgplayer-mapping.ts` | ~280 | 13th audit; coverage % per category; orphaned skuId detector |
| Connection-doc | `docs/connections/the-tcgplayer-alignment.md` | ~400 | This file |

**Total: ~3100 LOC of new code + this 400-line doc. Verify status: typecheck clean across wholesale + admin + data-ingest; tributaries audit shows 7 shipped + 10 planned slots (was 6 shipped + 11); honesty + creation 0 findings.**

---

## 7b. Post-aggregation deliverables (shipped same session)

After the aggregation phase landed, the user said *KEEP GOING*. Five more surfaces shipped, composing with sister's parallel kingdom-081 (license propagation):

| File | Layer | Composes with |
|------|-------|--------------|
| `apps/wholesale/src/app/api/v1/tcgplayer/history/[sku]/route.ts` | Wholesale per-condition USD time-series; bearer-gated | sister's `/api/v1/cardrush/history/[sku]` (kingdom-081 5.4) |
| `apps/wholesale/src/app/api/v1/tcgplayer/resolve/route.ts` | Wholesale federation reverse-lookup; bearer-gated | sister's federation/identify/[hash] (S26) |
| `apps/storefront/src/lib/wholesale/client.ts` | Falcon courier: `fetchTcgplayerHistory()` + `fetchTcgplayerResolve()` | sister's `fetchCardrushHistory()` pattern |
| `apps/storefront/src/app/api/v1/cards/[sku]/tcgplayer-history/route.ts` | Storefront auth-gated proxy with license-aware envelope | sister's cardrush-history sibling |
| `apps/storefront/src/app/api/v1/federation/identify/by-upstream/route.ts` | Public federation reverse-lookup; CC0 envelope | sister's `/api/v1/federation/identify/[hash]` |
| `apps/admin/scripts/cross-source-divergence.ts` | 14th audit; outlier detection across sources | composes with sister's tributaries check #10 |
| `apps/storefront/src/app/methodology/cross-source-pricing/page.tsx` | Transparency Ring 2 methodology page | sister's `/methodology/pricing` |

**The substrate-honest seam between my kingdom-080 and sister's kingdom-081:**
- Sister's `prices/[sku]/sources` (wholesale) gives the snapshot-day cross-source view.
- My `tcgplayer/history/[sku]` (wholesale) gives the TCGplayer-only time-series.
- Together: one source's history × all sources on a date = the complete cross-source surface a hobbyist / agent / builder / trader needs.

**License interpretation extended:** sister applied the `partner-redistributable` → auth-gated tier-2 reading to CardRush (internal-only). The same shape applies to TCGplayer's `partner-redistributable`: signed-in personal-decision use OK; anonymous + bulk re-export not. Both endpoints follow the same construction: session gate + 365-row cap + license_notice block echoed in the response.

**The federation reverse-lookup substrate-honestly handles ambiguity:** when a partner's TCGplayer productId maps to 2+ Cambridge SKUs (the rare case where foil + non-foil share a productId on the upstream), the response is 409 with the disambiguation hint, not 200 + arbitrary pick. The caller adds &sub_type= and retries.

---

## 8. What did NOT ship this turn (operator-gated)

Per the recommendation, six things stayed Yu-decided:

1. **Partner application at developer.tcgplayer.com.** Without `TCGPLAYER_CLIENT_ID` + `TCGPLAYER_CLIENT_SECRET` env vars, the source's `read()` emits an actionable error event and yields nothing. Same shape as the previous stub.
2. **`pnpm db:migrate` of 0015.** The migration is in the active path with a "PROMOTED 2026-05-13" header; Yu applies it when ready. Until then the writer compiles but the first INSERT against the new columns fails at runtime (substrate-honest about the dependency).
3. **TCGCSV subscription.** Bulk catalog refresh works today via the API; TCGCSV substitution will be a one-file change (`bulk.ts` in the source module) when the subscription wires.
4. **vercel.json cron cutover.** Both the legacy cardrush v1 (`/api/cron/price-snapshot`) and the new v2 family (`/api/cron/ingest/<source>`) coexist. The TCGplayer route exists but isn't yet on a schedule.
5. **Initial category scope.** The stub-time recommendation was 3 confirmed categories first (One Piece, Pokémon, MTG). All 12 are registered with `confirmed: false`; the first seed-set run promotes.
6. **Storefront-side serving surfaces** (Phase F of the prior plan — `/api/v1/cards/[sku]/sources`, `/cards/[sku]/sources`, `/methodology/cross-source-pricing`). Out of scope for the aggregation-phase pass; a future kingdom paired with the ingestion produces this.

---

## 9. Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit -p tsconfig.json` (wholesale) | ✓ clean |
| `npx tsc --noEmit` (admin) | ✓ clean |
| `cd packages/data-ingest && npx tsc --noEmit` | ✓ clean |
| `pnpm audit:tributaries` | ✓ 7 shipped + 10 planned slots; all checks passed |
| `pnpm audit:honesty` | ✓ 0 findings |
| `pnpm audit:creation` | ✓ 0 findings |
| `pnpm wholesale tcgplayer:seed-set --help` | ✓ prints categories list with anticipate-then-confirm flags |
| `pnpm --filter @cambridge-tcg/admin tcgplayer-mapping` | ✓ skips gracefully without DATABASE_URL |
| `pnpm audit:inclusion`, `pnpm audit:transparency` | (pre-existing findings; not from this work) |

---

## 10. Recursion targets

Ordered by leverage × tractability:

1. **Operator: apply migration 0015** — gates Phases B onwards.
2. **Operator: partner application + env vars** — gates the first real seed-set run.
3. **Operator: `pnpm wholesale tcgplayer:seed-set --game op --dry-run`** — first integration smoke. Confirms category 68, normaliser, mapping write, audit detection.
4. **Operator: full `tcgplayer:seed-set --game op`** — populates One Piece mappings.
5. **Operator: first `live-pricing` cron run** — populates first TCGplayer rows in `price_archive`.
6. **Operator: vercel.json cron entries** — the three TCGplayer cadences.
7. **Yu-decided: TCGCSV vs live API for nightly bulk** — when paid subscription lands, swap the bulk-pricing cron to call into `bulk.ts` (currently the route falls through to live API in `bulk-pricing` mode).
8. **Next kingdom: serving surfaces** (`/api/v1/cards/[sku]/sources`, `/cards/[sku]/sources`, `/methodology/cross-source-pricing`, sparkline format, federation reverse-lookup endpoint). The aggregation feeds this; the serving exposes it.
9. **Next kingdom: Cardmarket** — same template; OAuth1 client_credentials + `idProduct + idLanguage` mapping fan-out. Stub already shipped in kingdom-062; the writer + cron + audit are the work.
10. **Future kingdom: condition fan-out v2** — widen v1's NM-only to all five conditions. One config change (`?conditions=nm,lp,mp,hp,damaged`) plus volume validation.

---

## 11. What this entry names — substrate-honestly

This kingdom adds a second upstream to a substrate originally designed for one. The schema didn't fork; `price_archive` extended with one column (`condition`) and one jsonb (`extra`). The source module didn't grow a new abstraction; the protocol's `SourceModule<R, C>` accepts a union type (`CanonicalPrice | CanonicalMapping`) without complaining. The writer dispatches on the record shape; the runner stays unchanged. The audit family grew by one entry. The cron route family grew by one path with three modes.

**The asymmetry the prior plans had quietly named — that `price_archive` was a single-source archive pretending to be multi-source — is closed.** What kingdom-066's migration 0014 promised (`source` column with a default), and what kingdom-079 made visible (the v2 cron orphan, the audit gap on speculative subdomains), this kingdom **redeems**: the substrate can now hold TCGplayer USD + CardRush JPY + (future) Cardmarket EUR side-by-side on the same `(card_id, snapshot_date)` pair, condition-discriminated, FX-provenance-stamped, license-tier-declared. Three upstreams writing to one table with no collisions because the unique key honoured the asymmetry.

The aggregation phase ships in 11 files and ~3100 LOC. The next kingdom — when Yu decides — wires the serving layer that turns this substrate into the cross-source view hobbyists, agents, traders, and builders all need. That kingdom is small because this one was large.

This entry names itself in `this_entry_names`; it is named by [`the-cardrush-alignment.md`](./the-cardrush-alignment.md) (the template), [`the-cardrush-end-to-end.md`](./the-cardrush-end-to-end.md) (the visibility companion), [`the-pipeline.md`](./the-pipeline.md) (the doctrinal frame), [`the-tributaries.md`](./the-tributaries.md) (the catalog row this redeems), and [`the-archive.md`](./the-archive.md) (the leakage list this closes Leak #8 of). It will be named by the operator's first successful seed-set run, by the next kingdom's serving-layer doc, and by future single-line additions to the TCGPLAYER_CATEGORIES registry as `confirmed: false` flips to `true`.

— Sophia (Opus 4.7, 1M context), 2026-05-13. kingdom-080.
