---
title: The sitemap-discovery — agents tell us what they carry, in the schema everyone already speaks
shape: story-as-wire
date: 2026-05-17
status: historical implementation record; acquisition blocked 2026-07-12
maturity: doctrinal
doctrines: [substrate-honesty, meaning, creation]
this_entry_names:
  - packages/data-ingest/src/tcgcollector/index.ts           # the SourceModule
  - packages/data-ingest/src/tcgcollector/discovery.ts       # sitemap walk
  - packages/data-ingest/src/tcgcollector/jsonld.ts          # pure-fn JSON-LD extractor
  - packages/data-ingest/src/tcgcollector/normalize.ts       # Product → typed shape
  - apps/wholesale/src/lib/tcgcollector-discovery.ts         # the wholesale runner
  - apps/wholesale/src/app/api/cron/discover/tcgcollector/route.ts  # the cron
  - apps/storefront/scripts/sitemap-discovery.ts             # the audit
parents:
  - the-tributaries.md                # the upstream catalog
  - the-license-propagation.md        # how source_license rides downstream
  - the-cardrush-discovery.md         # kingdom-087, the sister discovery pattern
self_reference: this entry records a historical discovery strategy; neither TCGCollector nor CardRush acquisition currently runs.
---

# The sitemap-discovery — agents tell us what they carry, in the schema everyone already speaks

> **Current-status correction, 2026-07-12.** This document preserves the May
> implementation history; its permission and availability claims are
> withdrawn. A public sitemap, robots allowance, JSON-LD, indexability, or
> technical accessibility is discovery evidence, not a license or invitation
> to acquire, store, transform, or republish data. TCGCollector acquisition is
> hard-blocked pending written partner approval, and its cron returns HTTP 503
> before any network request. CardRush acquisition is separately hard-blocked
> by the source's official data policy. Authentication, internal-only labels,
> attribution, transformation, and downstream contracts do not create upstream
> rights. The runnable flows and “no negotiation required” reasoning below are
> historical design notes only and must not be executed.

> *Story-as-wire. Companion module: [`packages/data-ingest/src/tcgcollector/`](../../packages/data-ingest/src/tcgcollector/). The runner: [`apps/wholesale/src/lib/tcgcollector-discovery.ts`](../../apps/wholesale/src/lib/tcgcollector-discovery.ts). The cron: [`apps/wholesale/src/app/api/cron/discover/tcgcollector/route.ts`](../../apps/wholesale/src/app/api/cron/discover/tcgcollector/route.ts). The audit: [`apps/storefront/scripts/sitemap-discovery.ts`](../../apps/storefront/scripts/sitemap-discovery.ts).*

---

## What this is

A historical implementation record for a discovery strategy the kingdom does
not currently run.

The kingdom is, at its primary identity (kingdom-080), **the trading-card-game world's data provider**. Provision requires discovery: every card we publish came from a source we found, parsed, normalized, and held with attribution. The strategies are several (see the conversation that opened on 2026-05-17 under *"Devise strategies for discovery of data for aggregation"*); this entry names one of them.

**The shape:** every TCG vendor with a public website has, by web convention, two things we can consume without negotiation:

  1. A **`/sitemap.xml`** — an explicit enumeration of every URL the site wants indexed.
  2. **Schema.org JSON-LD** — `<script type="application/ld+json">` blocks embedded in product pages, declaring `Product`, `Offer`, `AggregateOffer` typed by the public Schema.org vocabulary.

**Historical assumption, withdrawn:** the May implementation treated these as
the vendor telling us what it carried, treated the sitemap as a discovery
handshake and JSON-LD as a payload, and concluded no partnership conversation
was required. Current policy rejects that inference: discoverability does not
establish acquisition, storage, transformation, or publication rights.

This is the same logic the kingdom applies to its own discovery surfaces: `/sitemap.xml`, `/.well-known/cambridge-tcg.json`, the embedded JSON-LD on `/welcome-all`, the OpenAPI spec at `/api/openapi.json`. We publish what we carry in the languages a partner already speaks. The sitemap-discovery strategy is *us reading the partner's symmetric move*.

---

## The cross-vendor pattern

Every vendor that consents to discovery via sitemap+JSON-LD is reached the same way:

```
                ┌──────────────────────────────┐
                │ vendor's sitemap-index.xml   │
                └──────────┬───────────────────┘
                           │ fetch
                ┌──────────▼───────────────────┐
                │ per-category sitemaps        │
                │ (cards / products / sets)    │
                └──────────┬───────────────────┘
                           │ walk + filter to URL shape
                ┌──────────▼───────────────────┐
                │ list of product URLs         │
                └──────────┬───────────────────┘
                           │ fetch each (rate-limited)
                ┌──────────▼───────────────────┐
                │ HTML page                    │
                └──────────┬───────────────────┘
                           │ extract <script type="application/ld+json">
                ┌──────────▼───────────────────┐
                │ JSON-LD objects              │
                │ (Product, Offer, …)          │
                └──────────┬───────────────────┘
                           │ normalize per-vendor adapter
                ┌──────────▼───────────────────┐
                │ typed VendorProduct          │
                │ (name, image, price, sku, …) │
                └──────────┬───────────────────┘
                           │ wholesale runner
                ┌──────────▼───────────────────┐
                │ ingest_run + ingest_quarantine│
                │ (price_archive: v2)          │
                └──────────────────────────────┘
```

Every step except the per-vendor adapter is the same module across vendors. When a second vendor lands, the diff is ~50 lines of adapter code naming which Schema.org fields the vendor populates and how to interpret them.

---

## Vendor 1 — TCGCollector

The first vendor shipped under this strategy. Why TCGCollector first:

  - **Public sitemap.** `https://www.tcgcollector.com/sitemap.xml` is a sitemap-index pointing at per-category sitemaps; cards + products are enumerated cleanly.
  - **Schema.org Product markup.** Each card page embeds `<script type="application/ld+json">` with `@type: "Product"`, including name, image, offers, brand. Machine-legible without HTML parsing.
  - **English-only.** No Bright Data unlock required; direct fetch from Vercel egress works.
  - **Broad Pokémon coverage.** Fills a gap in the existing data plane: international Pokémon (the Pattern-C oracle gap named in `/methodology/oracle-policies`) is only partially covered by other upstreams.

### Substrate-honest scope

  - License tier: **`internal-only`**. TCGCollector's catalog is publicly indexed, but their structured-data markup is intended for machine consumption (search engines, aggregators), not bulk re-export. The kingdom's position: internal-decision use only; no downstream redistribution until a partner conversation establishes broader terms. Carried through `_meta.source_license: "internal-only"` on every response derived from this source.
  - Rate limit: **0.5 rps, burst 2**. Polite cadence, conservative until the vendor signals (or absence of signal indicates) higher is welcome.
  - User-Agent: identifies as cambridge-tcg-ingest with a feedback URL. A vendor that wants us to slow down or stop has a named place to reach us.
  - Per-run cap: **100 URLs by default**, configurable up to 5000. A discovery cron is not a crawl; one or two slices of the sitemap per day is the cadence.

### What v1 shipped

  - Sitemap walk + URL extraction (`discovery.ts`).
  - Per-page fetch + Schema.org JSON-LD extraction (`jsonld.ts`).
  - Product/Offer normalization to a typed `TcgCollectorProduct` shape (`normalize.ts`).
  - `ingest_run` lifecycle: every run gets a row, with status/counters/events jsonb.
  - `ingest_quarantine` on failure: each per-row failure (fetch error, missing Product, unparseable price) becomes a quarantine row with a specific `reason` — substrate-honest forensics.
  - Cron route: `POST /api/cron/discover/tcgcollector` with `?dryRun=1`, `?maxUrls=N`, `?triggeredBy=…`.
  - Audit: `pnpm audit:sitemap-discovery` — vendor registered, cron route exists, doctrine doc present.

### What v2 added (2026-05-17, commit-of-this-revision)

  - **SKU matcher** ([`match.ts`](../../packages/data-ingest/src/tcgcollector/match.ts)) — pure-fn `TcgCollectorProduct → { sku, game, set, card_number, language, confidence } | { reason }`. Conservative: returns `reason: "sku_match_unknown_game_segment_<seg>"` rather than guessing when the URL's game slug is not in the curated `TCGC_GAME_SEGMENT_MAP` (13 segments mapped: `pokemon` / `pokemon-tcg-pocket` / `magic-the-gathering` / `one-piece` / `yu-gi-oh` / etc. → canonical `GameCode`). Card-number extraction tries the JSON-LD `sku` field first (high confidence), falls back to URL-slug trailing digits (medium confidence).
  - **`price_archive` INSERT** — on parse-ok + match-ok + cards-table-hit, the runner writes a row keyed by `(cardId, snapshotDate, source: "tcgcollector", condition: "nm")` with the source-currency price in `extra`, the GBP-converted price in `price`/`baseGbp`, and the FX rate + source in `fxRateToGbp`/`fxRateSource`. `ON CONFLICT DO UPDATE` so re-runs are idempotent.
  - **FX integration** — `fetchGbpRate(currency)` from `apps/wholesale/src/lib/fx.ts` (existing module); per-run cached so the API is called once per currency per cron run. On FX fetch failure, the row is still written with `price: 0` + `fxRateSource: "fetch_failed"` so the operator can filter for repair (substrate-honest about FX absence, not silently zero).
  - **New quarantine reasons**: `sku_match_unknown_game_segment_<seg>`, `sku_match_url_shape_not_card_page`, `sku_match_sealed_product_not_supported`, `sku_match_set_segment_malformed`, `sku_match_card_number_unextractable`, `sku_match_build_sku_failed: <msg>`, `sku_not_in_cards`, `matched_but_no_price`. Every failure carries forensic detail.
  - **Counters extended** — summary now includes `rows_matched_high_confidence`, `rows_matched_medium_confidence`, `rows_written_price_archive`, and the per-currency `fx_rates` cache. The cron-response sample includes a `sku_match` and `written` flag per row.

### What v2 still does NOT ship

  - **No vendor-side notification.** When a vendor's sitemap or JSON-LD shape changes, the audit catches the failure rate spike in `ingest_quarantine`; the operator decides whether to adapt the adapter or open a partner conversation. No automatic re-mapping.
  - **No bulk re-export.** Substrate-honest: TCGCollector data stays in `_meta.source_license: "internal-only"`. The Pantry's license propagation rule (`docs/connections/the-license-propagation.md`) enforces this downstream.
  - **No sealed-product matching.** `/products/<slug>` URLs are skipped with reason `sku_match_sealed_product_not_supported`. Sealed-product matching would require a separate identifier table (sealed boxes don't have card SKUs); deferred until the singles path is stable in production.
  - **No language localization.** The matcher defaults to `lang: "en"`. TCGC has localized pages (`/de/cards/…`, etc.) that would need URL-prefix parsing to populate `language` correctly. Deferred until non-English pages are observed in the data.
  - **No card-creation path.** When a TCGCollector URL maps to a SKU not in `cards`, the row is quarantined as `sku_not_in_cards`. The kingdom does NOT auto-create cards from external sources; the operator decides whether to seed (via a separate cron) or accept the gap. Substrate-honest about the boundary.

---

## Why this is its own strategy

The May implementation recorded two data-discovery strategies; neither runs
now. The other historical strategy was:

  - **CardRush self-discovery** (`docs/connections/the-cardrush-discovery.md`, kingdom-087). Walks per-subdomain `/sitemap.xml`, fetches each /product/[N] page, parses CardRush's HTML title regex into set_code + card_number + rarity. Different from sitemap-discovery: the upstream has **no Schema.org markup**, so the adapter is title-regex-based (fragile) rather than JSON-LD-based (typed). When CardRush ever adds Schema.org Product markup, the two strategies can converge.

The two strategies are **substrate-honestly different**: the sitemap+JSON-LD path is *typed* (the vendor declares structure via Schema.org), the title-regex path is *heuristic* (we guess from the HTML). The typed path produces richer rows with less code; the heuristic path is what the kingdom does when the vendor hasn't done the structured-data work yet.

**The bet:** more vendors will publish Schema.org markup over time. The sitemap-discovery strategy is the path the kingdom is investing in; the title-regex path is the bridge for vendors that haven't arrived at structured-data yet.

---

## What this surface does not claim

  - **Not a crawl.** The cron walks a slice of the sitemap per run, not the whole thing. A typical day touches 100 URLs; the substrate honors the vendor's bandwidth by being a slow, polite reader.
  - **Not a re-publication.** Data ingested here lands in the kingdom's internal-decision-use slot. The Pantry's `_meta.source_license` enforces; downstream consumers reading Cambridge TCG's APIs see the tier and honor it.
  - **Not a relationship.** TCGCollector hasn't been told we exist. The relationship-form (partner agreement, broader terms, mutual federation) lives in the future. The discovery strategy stands without it; if a partner conversation opens, the strategy gracefully accepts new terms via `SourceMeta.license` tier change.
  - **Not a price-discovery commitment.** v1 parses prices but doesn't write them to `price_archive`. The kingdom is not yet making per-SKU pricing claims derived from this source; v2 will.

---

## How a future vendor lands

When the second sitemap+JSON-LD vendor arrives (Cardmarket EU, TCGCSV, Hareruya, etc.), the diff is small:

  1. Add the id to `SourceId` in `packages/data-ingest/src/types.ts`.
  2. Create `packages/data-ingest/src/<vendor>/` mirroring the tcgcollector/ structure: `index.ts` (SourceModule + meta), `discovery.ts` (sitemap walk if vendor's URL shape differs), `normalize.ts` (per-vendor field mapping).
  3. Register in `packages/data-ingest/src/registry.ts`.
  4. Add a wholesale runner at `apps/wholesale/src/lib/<vendor>-discovery.ts` (mirror tcgcollector-discovery.ts).
  5. Add a cron route at `apps/wholesale/src/app/api/cron/discover/<vendor>/route.ts`.
  6. Add the vendor to the `VENDORS` array in `apps/storefront/scripts/sitemap-discovery.ts`.
  7. Run `pnpm audit:sitemap-discovery` — it verifies registry presence, cron route presence, doctrine doc presence.

The first vendor (this entry) was the path-finding; every subsequent vendor is the path-walking. The shared parts (`jsonld.ts`'s pure-fn extractor especially) live in the first vendor's directory until a second vendor lands and *needs* them; then they extract to a generic `discovery/` directory. **Refactor on second instance, not first** — substrate-honest about not building abstractions before there's a real second consumer.

---

## Cross-references

### Within this repo

- [`the-tributaries.md`](./the-tributaries.md) — the upstream catalog this vendor joins
- [`the-license-propagation.md`](./the-license-propagation.md) — how `_meta.source_license: "internal-only"` rides downstream
- [`the-cardrush-discovery.md`](./the-cardrush-discovery.md) — the sister strategy (kingdom-087); same shape, different adapter
- [`the-modules.md`](./the-modules.md) — the pantry's envelope contract this surface conforms to
- [`docs/principles/substrate-honesty.md`](../principles/substrate-honesty.md) — the doctrine the quarantine + tier choices rest on
- [`/api/v1/sources`](../../apps/storefront/src/app/api/v1/sources/route.ts) — where TCGCollector now appears in the live source registry

### To the elsewhere (informational)

- Schema.org Product vocabulary: https://schema.org/Product
- Sitemap protocol: https://www.sitemaps.org/

---

## Recursion target

→ `docs/connections/the-second-sitemap-vendor.md` — written the day the kingdom lands its second sitemap+JSON-LD vendor (Cardmarket EU, TCGCSV, or whichever pulls hardest). The entry names what got extracted from `tcgcollector/` into a shared `discovery/` module the day the second vendor arrived, and what stayed per-vendor.

→ Or: `docs/connections/the-vendor-conversation.md` — written the day a vendor reads this connection-doc and opens a partner conversation. The transition from substrate-honest internal-decision-use to broader-terms partnership; what changes in `SourceMeta.license` tier; how the license rides downstream after the conversation.

A future session may document a written partner conversation. The former claim
that a sitemap and JSON-LD are themselves an invitation is withdrawn.

---

*The web is full of vendors who publish more structure than they are read by. The sitemap-discovery strategy is the kingdom's posture of being a good reader — taking what's offered in the language it's offered, honoring the tier the offerer would honor, holding the bytes with attribution, and surfacing the substrate-honest provenance on every downstream response.*

🐍❤️

— *Authored by Sophia (Opus 4.7 (1M context)) in a Cambridge TCG session, 2026-05-17. At Yu's WILL: strategy 2 of the discovery menu — "Sitemap + JSON-LD crawl". First vendor: TCGCollector. The substrate held; the audit caught the missing doctrine doc; this is it.*
