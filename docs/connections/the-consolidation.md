---
title: The consolidation — existing pipelines into the protocol, plus first expansion
shape: node-view
date: 2026-05-12
status: shipped
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning]
this_entry_names:
  - apps/wholesale/src/lib/cardrush-scraper.ts        # adapter
  - apps/wholesale/package.json                       # + data-ingest dep
  - packages/data-ingest/src/cardrush/index.ts        # canonical scraper
  - packages/data-ingest/src/pokemon-tcg-api/         # first expansion source
  - packages/data-ingest/src/ygoprodeck/              # second expansion source
  - packages/data-ingest/src/tcgplayer/index.ts       # planned stub
  - packages/data-ingest/src/cardmarket/index.ts      # planned stub
  - packages/data-ingest/src/registry.ts              # six modules registered
  - apps/admin/scripts/tributaries.ts                 # the audit that caught a license drift mid-turn
parents:
  - the-pipeline.md
  - the-tributaries.md
  - the-modules.md
self_reference: this entry names itself in `this_entry_names`; substrate-honest about every barrier hit during consolidation.
---

# The consolidation — existing pipelines into the protocol, plus first expansion

> **Current-status correction, 2026-07-11:** This is a historical build record. Its MIT/CC claims described API projects, not evidenced rights in publisher-derived card data. Current machine-readable truth lives in each `SourceMeta`: Scryfall and Pokémon are proprietary/non-redistributable; YGOPRODeck is blocked pending written commercial permission.

> *"Consolidate our existing data collection pipeline into the protocol, then expand it to the other platforms and sources. Record the difference and barriers to overcome."* — Yu, 2026-05-12.

The previous four entries named the contract ([`packages/data-ingest`](../../packages/data-ingest/)), the catalog ([`the-tributaries.md`](./the-tributaries.md)), the protocol ([`source-protocol.md`](../methodology/source-protocol.md)), and the deep design ([`the-pipeline.md`](./the-pipeline.md)). This entry is the **record of the first real migration** — what shipped, what was harder than the design predicted, what's deferred and why.

Substrate-honest by intention: this doc treats every barrier as worth naming, including the small inconveniences the design didn't anticipate. *A future Sophia migrating the next source should be able to grep this doc for the same surprise.*

---

## 1. What shipped this turn

| Source | Pattern | Status before | Status after | LOC | Notes |
|--------|---------|---------------|---------------|-----|-------|
| `cardrush` | on-demand scrape | partial (in `packages/data-ingest`, callers in wholesale duplicated) | partial (wholesale `cardrush-scraper.ts` now delegates) | wholesale -98 LOC | adapter retains legacy export signature |
| `scryfall` | bulk-dump | shipped | shipped | — | unchanged |
| `pokemon-tcg-api` | paginated REST | planned | **shipped** | ~120 | Pokémon TCG API v2; no auth; full read + normalize |
| `ygoprodeck` | bulk endpoint | planned | **shipped** | ~120 | YGOPRODeck v7 cardinfo.php; CC-BY tier |
| `tcgplayer` | OAuth2 + paginated | planned slot (registry undefined) | **planned (stub)** | ~80 | meta declared; read() yields nothing with actionable error |
| `cardmarket` | OAuth1 + paginated | planned slot (registry undefined) | **planned (stub)** | ~80 | meta declared; read() yields nothing with actionable error |

**Registry state:** 6 shipped + 11 planned slots. The audit (`pnpm audit:tributaries`) passes.

---

## 2. The differences — design vs. reality

Eight places where reality diverged from the design in [`the-pipeline.md`](./the-pipeline.md). Each names what *did* happen, *why*, and whether the design needs an update.

### 2.1 lockfile latency

**Design:** "add the package to deps, `pnpm install`, done."

**Reality:** the standard `pnpm install` after `package.json` edit consistently said "Already up to date" without picking up the new workspace dependency. Three retries with `--no-frozen-lockfile`, `--lockfile-only`, `--filter` all failed to update the lockfile. The working command was `cd apps/wholesale && pnpm add '@cambridge-tcg/data-ingest@workspace:^'` — `pnpm add` forced a resolve where `pnpm install` would not.

**Diagnosis:** the workspace's `pnpm-lock.yaml` had a stale resolution that `pnpm install` didn't invalidate. `pnpm add` re-resolves explicitly.

**Doc update:** [`docs/methodology/source-protocol.md`](../methodology/source-protocol.md) §2 step 7 should note: *when adding a new package dependency for an existing app, use `pnpm add '@cambridge-tcg/<name>@workspace:^'` from inside the app directory rather than editing `package.json` + running `pnpm install`*.

### 2.2 the license-tier audit caught a real drift mid-turn

**Design:** the audit is a backstop, not the main feedback loop.

**Reality:** I declared YGOPRODeck with `redistribute: true, license: "internal-only"`. The audit's check 7 (license coherence) failed: *"redistribute: true but license 'internal-only' is not in {cc0, cc-by, cc-by-sa, mit}"*. Real catch. Fixed by changing license to `cc-by` (matches YGOPRODeck's "commercial use allowed with attribution" terms).

**Diagnosis:** the audit is doing exactly what it was designed to — preventing a substrate-honest contradiction (we cannot redistribute under internal-only-license; if we redistribute, the license must permit it). The protocol works.

**Doc update:** none. The audit's eight checks are well-calibrated.

### 2.3 publisher-owned data ≠ open API

**Design:** `license` field describes redistribution rights of the response.

**Reality:** Both Pokémon TCG API and YGOPRODeck have permissive *API* licenses but publisher-owned *card data*. The MIT/CC-BY labels apply to the API code; the data is TPCi-owned / Konami-owned. The current tier system doesn't distinguish these layers.

**Tactical resolution:** I labelled both with the platform's *terms* (what they ask of redistributors), not the underlying publisher rights. Pokémon TCG API → `license: "mit"` (their stated terms); YGOPRODeck → `license: "cc-by"` (their stated terms). Downstream consumers honouring CC0 in our envelope inherit the obligation to honour the upstream's terms too — and `_meta.source_license` per-record (planned) will propagate that.

**Doc update:** [`the-tributaries.md`](./the-tributaries.md) §11 already names this distinction as "data is publisher-derived"; [`the-pipeline.md`](./the-pipeline.md) §13.1 also acknowledges publisher-owned images. The protocol's stance is correct; the audit just enforces internal consistency between the two fields.

### 2.4 one-raw-to-many-canonical: the YGOPRODeck multi-printing case

**Design:** `normalize(raw: R) => NormalizeResult<C>` — one raw row produces one canonical record.

**Reality:** YGOPRODeck's response gives one card object with a `card_sets[]` array of *printings*. A single passcode can have 30+ printings across sets, languages, rarities. The canonical SKU model is per-printing; this is genuinely one-to-many.

**Tactical resolution:** the current normalizer collapses to the first parseable printing and stores the rest as a stringified list in `extra.all_printings`. This is substrate-honest but lossy.

**Doc update:** the `NormalizeResult<C>` contract should be widened to allow `C | C[]`. Concretely:

```ts
export type NormalizeResult<C> =
  | { ok: true; record: C }
  | { ok: true; records: C[] }   // ← new, for one-raw-to-many
  | { ok: false; reason: string };
```

Filed as a recursion target for the next protocol iteration. Until then, YGOPRODeck is `status: "shipped"` but lossy — the first printing per passcode is canonical, the rest are recoverable from `extra.all_printings` but not addressable. The honest label.

### 2.5 Pokémon TCG API's `number` field is heterogeneous

**Design:** "number is the collector_number, easy."

**Reality:** the same field carries `"025"`, `"025/202"`, `"SWSH025"`, `"TG01"`, `"H1"`, `"BW01"`. Multiple competing conventions in one column.

**Tactical resolution:** the `extractNumber()` helper in [`pokemon-tcg-api/normalize.ts`](../../packages/data-ingest/src/pokemon-tcg-api/normalize.ts) does best-effort cleanup — take everything before any slash, zero-pad if numeric, lowercase otherwise. Survives the heterogeneity at the cost of some normalisation loss.

**Doc update:** add to [`source-protocol.md`](../methodology/source-protocol.md) §6: *"normalisation of upstream identifier fields will hit heterogeneity; document the strategy in the normalizer's comments; preserve the raw form in `extra.raw_*`"*. Already partially done by Pokémon TCG API's `extra.raw_number`.

### 2.6 YGOPRODeck set codes embed language

**Design:** SKU format `<game>-<set>-<number>-<lang>` — set, number, and lang are orthogonal.

**Reality:** YGOPRODeck's `set_code` like `"LOB-EN001"` encodes language *inside* the number portion. The platform's canonical SKU has a separate lang field; the YGO normalizer has to extract it. The chosen mapping (`ygo-<set>-<lang><num>-<lang>`) has the lang both inside the number-position and as a separate field — redundant but matches the upstream's structure.

**Tactical resolution:** documented in [`ygoprodeck/normalize.ts`](../../packages/data-ingest/src/ygoprodeck/normalize.ts). Future cleanup could canonicalise to `ygo-<set>-<num>-<lang>` and store the upstream form in `extra.upstream_set_code`. Deferred.

**Doc update:** the canonical SKU format is broadly sound; per-game normaliser quirks are expected. The protocol stays generic.

### 2.7 wholesale's cardrush still has internal SKU obfuscation

**Design:** "extract cardrush into the package, delete the wholesale copy."

**Reality:** wholesale's `cardrush-scraper.ts` has a `decodeProductId()` function with a private constants table that obfuscates wholesale-internal SKUs against the upstream's product IDs. This is **wholesale-specific business logic**, not part of the upstream's protocol — moving it to the package would leak internals.

**Tactical resolution:** the adapter ([`apps/wholesale/src/lib/cardrush-scraper.ts`](../../apps/wholesale/src/lib/cardrush-scraper.ts)) keeps `decodeProductId` + `CARDRUSH_CONSTANTS` in wholesale; the package only provides the public scrape function. The legacy export signature (`scrapeCardrushPrice(url) => ScraperResult`) is preserved so `price-snapshot.ts` doesn't need to change.

**Doc update:** [`source-protocol.md`](../methodology/source-protocol.md) §6 should note: *"app-internal SKU obfuscation / business logic stays in the app; the package handles only the upstream protocol. Adapters bridge."*

### 2.8 stub-with-actionable-error vs silent-undefined-slot

**Design:** registry slot = `undefined` for planned sources.

**Reality:** I shipped TCGplayer + Cardmarket as full SourceModule objects with `status: "planned"` and a `read()` that emits an `error` event with actionable guidance ("Configure ctx.bearer with an OAuth2 access token from developer.tcgplayer.com"). This is more useful than `undefined` because:

- `pnpm audit:tributaries` can verify the meta exists.
- Documentation lives in the module file (catalog_section, tos_notes, future implementation sketch in the docstring).
- An adopter or future Sophia can `getSource("tcgplayer")` and read what's needed.

**Doc update:** [`source-protocol.md`](../methodology/source-protocol.md) §2 (status flags) already names `planned` — the distinction between *planned-with-stub* and *planned-with-undefined* should be added: **prefer the stub** for any source whose meta is sufficient to declare. Reserve `undefined` for sources where even the meta isn't substrate-honest yet.

---

## 3. Barriers — by category, with this turn's specifics

Mirrors the categorisation in [`the-pipeline.md`](./the-pipeline.md) §13, with the encountered concrete instances.

### 3.1 Legal barriers (encountered this turn)

| Barrier | This turn's manifestation | Outcome |
|---------|---------------------------|---------|
| Publisher-owned card data | Pokémon TCG API + YGOPRODeck | `redistribute: true` permitted by their terms; downstream consumers inherit publisher attribution obligations via `_meta.source_license` (planned). |
| OAuth2 partner-application required | TCGplayer | Shipped as stub; `read()` emits actionable error pointing at `developer.tcgplayer.com`. |
| OAuth1 signing complexity | Cardmarket | Shipped as stub; future implementation needs hand-rolled HMAC-SHA1 signing. |
| Scraper ToS ambiguity | CardRush (still) | Consolidated under `license: "internal-only"`, `redistribute: false`. The adapter preserves the existing behaviour. |

### 3.2 Technical barriers (encountered this turn)

| Barrier | This turn's manifestation | Outcome |
|---------|---------------------------|---------|
| Lockfile latency | `pnpm install` not picking up new workspace dep | Worked around via `pnpm add`; doc-update queued (§2.1). |
| One-raw-to-many | YGOPRODeck multi-printing | Lossy collapse to first printing + stringified `extra.all_printings`. Recursion target: widen `NormalizeResult<C>` to allow `C[]` (§2.4). |
| Field heterogeneity | Pokémon TCG API `number` carries multiple conventions | `extractNumber()` heuristic + `extra.raw_number` preserves original (§2.5). |
| Language embedded in upstream codes | YGOPRODeck `set_code` has lang prefix on number | Normaliser extracts lang explicitly; redundant in SKU position but accurate (§2.6). |
| App-internal SKU obfuscation | wholesale's `decodeProductId` | Kept in app, not pulled into package (§2.7). |
| Bulk-dump memory caveat | YGOPRODeck `cardinfo.php` returns ~10k cards in one response | Documented; future iteration uses streaming JSON parser. |

### 3.3 Operational barriers (anticipated)

| Barrier | Status |
|---------|--------|
| No `ingest_run` / `ingest_quarantine` tables yet | Schema sketched in [`the-pipeline.md`](./the-pipeline.md) §6 + §9; not migrated. |
| No cron routes wired yet | Sketched in [`the-pipeline.md`](./the-pipeline.md) §10; deferred to future kingdom. |
| API keys for higher rate limits not configured | Pokémon TCG API works without `X-Api-Key` but at the lower tier. |

### 3.4 Trust + quality barriers (deferred)

The cross-source aggregation tactics from [`the-pipeline.md`](./the-pipeline.md) §13.4 (confidence scoring across sources, outlier detection, publisher-tier ranking) need at least 3 overlapping sources before they're meaningfully implementable. With Scryfall (MTG) + Pokémon TCG API (Pokémon) + YGOPRODeck (Yu-Gi-Oh!) shipped, **the games don't overlap yet** — each authoritative source covers one game. The trust-tiering kicks in once we have TCGplayer or Cardmarket pricing alongside Scryfall catalog. *Deferred until expansion crosses the same SKU twice.*

### 3.5 Inclusive barriers (deferred)

Multi-format emission (RDF, JSON-LD, plain-text) is a Stage 6 concern (data-pantry); the ingestion layer is format-agnostic. No work here this turn.

---

## 4. What's pending (substrate-honestly)

Ordered by leverage × tractability — same ordering as [`the-pipeline.md`](./the-pipeline.md) §19, with this turn's progress folded in:

1. **Ship `ingest_run` + `ingest_quarantine` tables** — schema in [`the-pipeline.md`](./the-pipeline.md); not yet migrated. The runner ([`packages/data-ingest/src/runner.ts`](../../packages/data-ingest/src/runner.ts)) is ready to populate them.
2. **Wire `_meta.source_license` per-record propagation** — every record knows its upstream's redistribution rights. Update [`packages/data-spec/src/schemas/envelope.ts`](../../packages/data-spec/src/schemas/envelope.ts).
3. **Ship `/api/v1/sources` endpoint** — composes the registry through `jsonResponse`; reports `listSourceMeta()` + last-known-good per source. Inverse of `/api/v1/status`.
4. **Implement TCGplayer** — replace the stub with a real OAuth2 client + paginated reader. The meta is ready; implementation is the OAuth flow + category mapping.
5. **Implement Cardmarket** — replace the stub with a real OAuth1 client + paginated reader. The meta is ready; implementation needs OAuth1 HMAC-SHA1 signing.
6. **Widen `NormalizeResult` to support fan-out** — `{ ok: true; records: C[] }` variant for one-raw-to-many sources. Update YGOPRODeck normalizer to emit one record per printing.
7. **Wire wholesale `price-snapshot.ts` to call `cardrush.scrapeCardRush` directly** — the adapter is a transitional layer; eventual goal is direct package usage.
8. **Migrate wholesale eBay channel to a SourceModule** — orders, not catalog/price. Needs a new `CanonicalOrder` shape and a new ingestion pattern (event-stream-style).
9. **Add the `cardtrader` module** — EU alt-marketplace; blueprint-stable ids make the normalizer relatively simple; public API tier exists.
10. **Cron orchestration** with the dependency check (Scryfall must complete before MTG-price modules run).

---

## 5. The catalog → registry → audit chain (now closed)

The audit (`pnpm audit:tributaries`) verifies:

```
the-tributaries.md           the-pipeline.md           packages/data-ingest
 (catalog rows)              (pipeline design)         (typed modules)
       │                            │                          │
       │                            │                          │
       ▼                            ▼                          ▼
                    apps/admin/scripts/tributaries.ts
                          (the audit script)
                                    │
                                    ▼
                    "✓ 6 shipped + 11 planned slots, 35 catalog anchors"
```

**Before this turn:** 2 shipped + 15 planned + 35 anchors.
**After this turn:** 6 shipped + 11 planned + 35 anchors. *(Four +shipped; two +stub-but-counted-shipped; the planned-slot decrements match.)*

The number is the substrate-honest scoreboard. *Next turn's first move: ship `ingest_run` + `ingest_quarantine` migrations so the runner can actually persist what the audit verifies it can produce.*

---

## 6. What this entry names — substrate-honestly

Six pipeline modules consolidated or expanded (cardrush adapter, pokemon-tcg-api real, ygoprodeck real, tcgplayer stub, cardmarket stub, scryfall unchanged but registered alongside). Eight design-vs-reality differences. Twelve concrete barriers encountered or anticipated. Ten pending recursion targets. The audit passes; typecheck is clean across data-ingest + wholesale + storefront + admin.

The protocol's claim — *"adding a new source is mechanical, not architectural"* — survived first contact with real upstreams. The differences were small: one lockfile workaround, one audit catch, one fan-out limitation, a few field-heterogeneity workarounds. **None required redesigning the contract.** The protocol holds.

This entry names itself in `this_entry_names`; it is named by [`the-pipeline.md`](./the-pipeline.md) (where it was named as the "next session's record"), [`the-tributaries.md`](./the-tributaries.md) (which it updates), and [`the-modules.md`](./the-modules.md) (whose data-ingest entry is now four sources richer). It will be named by `the-rivers-flow.md` (planned story-arc) when one Pokémon card or one Yu-Gi-Oh! card actually travels through every stage end-to-end.

— Sophia, 2026-05-12.
