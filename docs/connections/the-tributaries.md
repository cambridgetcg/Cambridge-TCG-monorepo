---
title: The tributaries — every river that could feed the pantry
shape: node-view
date: 2026-05-12
status: brainstorm
maturity: catalog
doctrines: [substrate-honesty, transparency, meaning]
this_entry_names:
  - apps/wholesale/src/lib/cardrush-scraper.ts
  - apps/wholesale/src/lib/channels/ebay.ts
  - apps/wholesale/tools/scrape-cardrush.ts
  - packages/data-ingest/  # shipped 2026-05-12 — the protocol now exists
  - packages/data-ingest/src/scryfall/  # first source (bulk-dump exemplar)
  - packages/data-ingest/src/cardrush/  # second source (on-demand exemplar)
  - docs/methodology/source-protocol.md  # the steps to add a new source
  - apps/admin/scripts/tributaries.ts  # the audit (eighth in the family)
  - docs/connections/the-pantry.md
  - docs/connections/the-modules.md
parents:
  - the-pantry.md
  - the-modules.md
  - the-distributor.md
children:
  - the-pipeline.md  # the deep design — pipeline stages, barriers, tactics
self_reference: this entry names itself in `this_entry_names` (see the-nesting.md)
---

# The tributaries — every river that could feed the pantry

> *"Lets dive deeper to collect existing sources of data that we could aggregate from: cardrush, cardmarket, tcgplayer, ebay and other platforms."* — Yu, 2026-05-12.

The previous two entries — [`the-pantry.md`](./the-pantry.md) and [`the-modules.md`](./the-modules.md) — named *how the kingdom emits data*. This entry names *where the kingdom could draw it from*. The pantry is the reservoir; the tributaries are the rivers that fill it.

**Scope:** this is a catalog, not a build plan. Each source gets one row of substrate-honest reconnaissance: what kind of data it carries, how we'd access it, what license / ToS governs redistribution, how stale it gets, and how much canonical-form work is needed to map it to Cambridge TCG's SKU + schema. Status flags say *what's already wired*, *what we could wire tomorrow*, *what's blocked*, and *what we cannot reasonably get*.

**The downstream:** every source named here is a candidate **module under `packages/data-ingest/`** (planned in `the-modules.md`). Each module is a triple — *reader* (fetch the upstream data), *normalizer* (map to canonical SKU + schema via `packages/sku/`), *writer* (push to RDS via `packages/db/`) — plus a *lifecycle log* on every run (the Scribe's bookshelf, via `packages/lifecycle/`). The data-pantry envelope (`apps/storefront/src/lib/data-pantry/`) names the source in `_meta.sources` when the data leaves; this doc names what those source strings *mean*.

---

## 1. What we already mirror

| Source | Domain | Game coverage | Pipeline | Where | Status |
|--------|--------|---------------|----------|-------|--------|
| **Cambridge TCG wholesale RDS** | catalog + price + stock | all 13 games | self-hosted PostgreSQL on AWS RDS | `wholesale-rds` in `_meta.sources` | shipped — the canonical store |
| **Cambridge TCG storefront RDS** | orders + accounts + lifecycle | all 13 games | self-hosted PostgreSQL on AWS RDS | `storefront-rds` in `_meta.sources` | shipped |
| **CardRush (JP)** | retail prices, multi-condition | One Piece, Pokémon, Dragon Ball | HTML scrape (canonical in [`packages/data-ingest/src/cardrush/`](../../packages/data-ingest/src/cardrush/); wholesale [`cardrush-scraper.ts`](../../apps/wholesale/src/lib/cardrush-scraper.ts) is now a thin adapter as of 2026-05-12) | `cardrush` source-module | shipped (partial — adapter-consolidated) |
| **eBay (order import)** | partner orders | all (B2B sales channel) | eBay Trading/Finding APIs via [`apps/wholesale/src/lib/channels/ebay.ts`](../../apps/wholesale/src/lib/channels/ebay.ts) | `ebay` channel in `channel_pricing` | shipped (orders only — channel-side write path) |
| **eBay (read-side aggregator)** | current asks → future sold-comps | all 13 games (game-agnostic; parser-driven) | Browse API via [`packages/data-ingest/src/ebay/`](../../packages/data-ingest/src/ebay/); Marketplace Insights API gated on partner approval | `ebay` source-module | shipped (Phase A — kingdom-080; see [`the-ebay-alignment.md`](./the-ebay-alignment.md)) |
| **Shopify (channel sync)** | inventory + order sync | per-store | Shopify Admin API ([`apps/wholesale/src/lib/shopify-sync.ts`](../../apps/wholesale/src/lib/shopify-sync.ts), [`shopify-client.ts`](../../apps/wholesale/src/lib/shopify-client.ts)) | `shopify` channel in `channel_pricing` | shipped (channel multipliers wired) |
| **Stripe** | payments | all (B2C) | Stripe webhooks + reconcile cron | `stripe` in `_meta.sources` | shipped |
| **Scryfall** | MTG catalog (all printings, images) | MTG | bulk-dump adapter | [`packages/data-ingest/src/scryfall/`](../../packages/data-ingest/src/scryfall/) | adapter built; never run; proprietary policy, non-redistributable |
| **Pokémon TCG API** | Pokémon catalog | Pokémon | paginated REST adapter | [`packages/data-ingest/src/pokemon-tcg-api/`](../../packages/data-ingest/src/pokemon-tcg-api/) | adapter built; never run; no open-data license established |
| **YGOPRODeck** | Yu-Gi-Oh! catalog | Yu-Gi-Oh! | dormant bulk adapter | [`packages/data-ingest/src/ygoprodeck/`](../../packages/data-ingest/src/ygoprodeck/) | blocked pending written commercial permission |

**Substrate-honest gap:** the wholesale RDS *is* the platform's catalog, but it's narrow (curated, A-condition, JP-priced). The other rivers below are how it gets wider.

---

## 2. Pricing & marketplace aggregators

The bulk of *what other people charge for these cards*. Every row is a candidate for `packages/data-ingest/<source>/`.

### 2.1 TCGplayer (US market leader)

| Field | Value |
|-------|-------|
| Coverage | MTG, Pokémon, Yu-Gi-Oh, One Piece, Dragon Ball, Lorcana, Flesh and Blood, Digimon, Vanguard, FaB, Weiß Schwarz |
| URL | `api.tcgplayer.com` |
| Access | **Blocked for Cambridge.** Official docs say no new API access; existing keys are purpose-limited by prior written approval. |
| Public API? | No new access. Existing access is not transferable. |
| Bulk feed? | Third-party mirrors do not cure the upstream restriction; do not use them without a written chain of rights. |
| License | Proprietary. Terms prohibit a competing service, combining TCGplayer prices with first/third-party prices, and redistribution/commercialisation without prior written consent. |
| Freshness | real-time on `/pricing`; daily on TCGCSV bulk |
| Canonical-form effort | **medium** — TCGplayer uses its own `productId` (integer) per printing; SKU mapping requires their `group_id` (set) + product attributes. Worth caching their productId on `card_set_cards`. |
| Status | **blocked 2026-07-11** — the reader is dormant and refuses network access. Reopen only after written approval explicitly covers Cambridge's multi-source aggregation and display use. |
| Recurses to | a `tcgplayer_product_id` column on `card_set_cards` (mapping table — first step of any TCGplayer pipeline) |

### 2.2 Cardmarket (EU market leader)

| Field | Value |
|-------|-------|
| Coverage | MTG (the largest catalog by far in EU), Pokémon, Yu-Gi-Oh, One Piece, Lorcana, Flesh and Blood, Digimon, Star Wars Unlimited |
| URL | Public Product Catalog + Price Guide downloads under `cardmarket.com/*/Data` |
| Access | `public-file`; no credentials. API applications are closed; grandfathered API users moved to `apiv2.cardmarket.com`. |
| Public API? | Not available to new applicants. |
| Bulk feed? | Daily public Product Catalog and Price Guide files. |
| License | Proprietary/policy-governed. Cardmarket explicitly permits website/app use of the public files, but publishes no open-data license; do not relabel raw files CC0. |
| Freshness | daily files |
| Canonical-form effort | **medium-high** — Cardmarket uses `idProduct` per printing per language; cross-language same-card has multiple ids. Mapping table required per game. |
| Status | **planned** — normalizer and dormant legacy OAuth code exist, but the active reader refuses network access until the public daily-file reader + writer are wired. Missing credentials are not the gap. |

### 2.3 CardRush (JP — already partial)

| Field | Value |
|-------|-------|
| Coverage | Observed archive rows for Pokémon, One Piece, Dragon Ball Fusion World, Digimon, Vanguard, and Battle Spirits. MTG remains an unconfirmed price-only candidate; five nonexistent alternate hosts are explicitly blocked. |
| URL | `cardrush-{game}.jp/product/{id}` |
| Access | HTML scrape; no formal API |
| Public API? | no |
| Bulk feed? | no — product pages individually |
| License | site ToS forbids commercial redistribution of compiled price data; internal-decision use is the safer position |
| Freshness | the page is live; the scrape is one-shot per call |
| Canonical-form effort | **high** — CardRush's URL ids don't map cleanly to printing; site search + parsing required per card |
| Status | **partial** — 6 confirmed + 6 unconfirmed/blocked subdomains in [`packages/data-ingest/src/cardrush/`](../../packages/data-ingest/src/cardrush/) `CARDRUSH_SUBDOMAINS`. Failed reads retain an `error_reason` so the operator can distinguish nonexistent upstreams from page changes. Wholesale [`cardrush-scraper.ts`](../../apps/wholesale/src/lib/cardrush-scraper.ts) is the adapter. |
| Recurses to | keep registry flags reconciled with `/api/v1/coverage`; do not promote an unconfirmed host without an observed row; see [`the-archive.md`](./the-archive.md) for the full leakage list and [`the-cardrush-alignment.md`](./the-cardrush-alignment.md) for the migration record. |

### 2.4 CardTrader (EU alt-marketplace)

| Field | Value |
|-------|-------|
| Coverage | MTG, Pokémon, Yu-Gi-Oh, Lorcana, FaB, One Piece, Disney Lorcana, Digimon |
| URL | `api.cardtrader.com` |
| Access | bearer token; free read access for registered users |
| Public API? | yes — `/v2/blueprints`, `/v2/products/export`, `/v2/marketplace/product` |
| Bulk feed? | full `/v2/blueprints` export per game |
| License | ToS allows partner integration; redistribution requires permission |
| Freshness | near-real-time |
| Canonical-form effort | **low-medium** — CardTrader's `blueprint_id` is intentionally cross-printing-stable; mapping is simpler than TCGplayer/Cardmarket |
| Status | **planned** — good candidate for EU coverage redundancy |

### 2.5 eBay (full marketplace, not just order import)

| Field | Value |
|-------|-------|
| Coverage | everything — sealed, singles, graded, vintage, custom |
| URL | `api.ebay.com` (Buy/Sell/Finding APIs) |
| Access | OAuth2; app token + user token for buyer/seller actions |
| Public API? | yes — Browse API, Marketing API; Finding API deprecated |
| Bulk feed? | no — search-based pagination only |
| License | eBay ToS; data licensed for partner-display use, not bulk redistribution. PWCC (eBay Vault) data has additional restrictions. `redistribute: false` in `SourceMeta` propagates to `_meta.source_license`. |
| Freshness | real-time (Browse asks); 90-day window (Marketplace Insights sold-comps, partner-only) |
| Canonical-form effort | **very high** — listings are unstructured. Title parsing is the central problem; the six-pass parser in [`packages/data-ingest/src/ebay/title-parser.ts`](../../packages/data-ingest/src/ebay/title-parser.ts) is the hardest single normalizer in the kingdom. |
| Status | **shipped (Phase A — 2026-05-13)** — read-side SourceModule + six-pass title parser + grade detector + condition keywords + language detector + OAuth + Browse API reader + 30-fixture test corpus. Marketplace Insights API gated on partner-application approval. Order-import / sell-push unchanged. See [`the-ebay-alignment.md`](./the-ebay-alignment.md). |
| Consented sold door | **built-forward (2026-07-11)** — the lawful first-party *sold* surface, run through the four intake gates: a seller's own eBay orders via the Sell/Fulfillment API `getOrders` after standard OAuth consent. Normalizer ready in [`packages/data-ingest/src/ebay/consented.ts`](../../packages/data-ingest/src/ebay/consented.ts) (`EbayConsentedSale` → `EbayConsentedCanonicalObservation`, buyer PII structurally excluded per [`source-intake.md`](../methodology/source-intake.md) Gate A.2). INERT — no live fetch, no cron; gated on operator OAuth app + solicitor review. Same shape as the Vinted consented stub — build-once, reuse. Tri-surface verdict: Browse = asks only; Marketplace Insights = true sold comps but partner-gated + reference-only-never-CC0; consented `getOrders` = this door. |
| Useful for | (a) auction price discovery; (b) sealed sealed-product market; (c) vintage / graded sales comps; (d) cross-marketplace median (when MI lands); (e) real UK sold prices from our own sellers (consented door). |

### 2.6 Mercari (JP + US)

| Field | Value |
|-------|-------|
| Coverage | JP secondhand (huge for sealed + vintage Pokémon); US Mercari is smaller |
| URL | `mercari.com` / `jp.mercari.com` |
| Access | no public API; mobile/web scrape only |
| Public API? | no |
| Bulk feed? | no |
| License | ToS forbids scraping; commercial use of scraped data is risky |
| Freshness | real-time |
| Canonical-form effort | **very high** — listings unstructured; JP-language NLP required |
| Status | **blocked** by ToS. Use as occasional research only. |

### 2.7 Yahoo Auctions JP

| Field | Value |
|-------|-------|
| Coverage | Vintage / sealed JP Pokémon, classic MTG-JP, sealed booster boxes |
| URL | `auctions.yahoo.co.jp` |
| Access | HTML scrape; some structured pages; some search RSS feeds |
| Public API? | partial (Yahoo Shopping API; auction API has been deprecated) |
| Bulk feed? | no |
| License | ToS-restricted; scraping for commercial reuse is gray |
| Freshness | real-time during auction; final price post-close |
| Canonical-form effort | **very high** — same problems as Mercari |
| Status | **planned (research-only)** — useful for sealed-product comps |

### 2.8 Snkrdunk (JP sneakers + cards)

| Field | Value |
|-------|-------|
| Coverage | Pokémon, One Piece, Yu-Gi-Oh — JP graded + sealed |
| URL | `snkrdunk.com` |
| Access | no public API; app + web; partnership-only API |
| License | proprietary |
| Status | **blocked** — partnership required |

### 2.9 Cardconduit / Cardsphere / Pucatrade (bulk trading platforms)

| Field | Value |
|-------|-------|
| Coverage | MTG primarily; some Pokémon |
| URL | `cardconduit.com`, `cardsphere.com` |
| Access | partner integration; no public API |
| License | proprietary; partner deals |
| Status | **planned (low priority)** — niche; cardsphere is moribund |

### 2.10 Shopify (per-store)

| Field | Value |
|-------|-------|
| Coverage | individual TCG stores hosted on Shopify (many UK/US/EU LGS) |
| URL | per-store `<store>.myshopify.com/admin/api/...` |
| Access | per-store API key (each LGS grants individually) |
| Public API? | yes — Admin API, Storefront API |
| Bulk feed? | per-store JSON-LD product feed + Admin API export |
| License | per-store; usually MIT-grade for partner display |
| Freshness | real-time |
| Canonical-form effort | **high** — each store has its own SKU convention; manual mapping per store |
| Status | **shipped (per-channel)** — channel-pricing already supports Shopify; aggregation across stores is **planned** |
| Recurses to | a `partner_stores` registry — list of Shopify stores willing to share inventory; opt-in network |

### 2.11 Vinted (UK)

| Field | Value |
|-------|-------|
| Coverage | UK secondhand marketplace with a trading-cards vertical (Pokémon and TCG singles/bundles); UK-relevant, but structurally messy |
| URL | `vinted.co.uk` |
| Access | **blocked** — no public/market API; sold listings hidden from search; only lawful path is consented first-party (a seller's own export / authorised Vinted Pro Orders) |
| Public API? | no (Vinted Pro Integrations is allowlist-gated, own-orders-only — not a market-data API) |
| Bulk feed? | no — third-party "Vinted sold data" is snapshot-diff *inference* of last asking prices, not transactions |
| License | `internal-only` — consented rows are input to derivations, never re-published raw; `redistribute: false` |
| Freshness | market_signal (when consented data flows) |
| Canonical-form effort | **very high** — free-text titles, no set/number grammar, bundles dominate |
| Status | **blocked** by ToS §6 + UK GDPR (EDPB Guidelines 03/2026 Example 5). A full module carries the honest verdict in code (`packages/data-ingest/src/vinted/`), snkrdunk-pattern. |
| Consent path | **yes** — a Cambridge TCG seller supplying *their own* Vinted sales (DSAR export / authorised Pro Orders) is UK GDPR-clean (Art. 6(1)(a)/(b), rides the seller's own Art. 15/20 rights). Normalizer ready (`vinted/normalize.ts`, buyer PII structurally excluded). Graduates `blocked → planned` when a consented-import build or Pro allowlist application is underway. |
| Intake record | `docs/methodology/source-intake.md` (Vinted is the worked example) |

---

## 3. Catalog metadata sources (often publicly reachable, not necessarily open)

These don't carry *price*; they carry *what exists* — set lists, card text,
images, rarity, and release dates. Public reachability is not an open-data
license: most of these fields remain publisher- or service-controlled. They
are technically approachable, but each needs a field-level rights review
before collection or publication.

### 3.1 Scryfall (MTG)

| Field | Value |
|-------|-------|
| Coverage | Magic: The Gathering — every printing, every language, multi-resolution images |
| URL | `api.scryfall.com` |
| Access | public; no auth; rate limit ~10 req/s |
| Public API? | **yes — exemplary** |
| Bulk feed? | **yes — daily JSON bulk dumps** (`oracle-cards.json`, `all-cards.json`, `default-cards.json`, gzipped) |
| License | **Proprietary / policy-governed.** The API policy permits free value-added Magic software but prohibits paywalls and simple repackaging/proxying. It does not publish a CC-BY-NC data license; Magic material remains Wizards-owned. |
| Freshness | daily on bulk; ~hourly on individual records |
| Canonical-form effort | **low** — Scryfall ids are stable; cross-printing handled via `oracle_id` |
| Status | Adapter built; never run. Use only in a free value-added surface that follows Scryfall's current API/image policy; no raw bulk re-export. |
| Useful for | catalog backfill; image rights via Scryfall image URLs (cached for performance, original attribution preserved); oracle-text for the universal-card endpoint |

### 3.2 Pokémon TCG API (pokemontcg.io)

| Field | Value |
|-------|-------|
| Coverage | Pokémon TCG — all sets, all printings, images, prices (TCGplayer + Cardmarket sourced) |
| URL | `api.pokemontcg.io` (v2) |
| Access | optional API key (boosts rate limit) |
| Public API? | yes |
| Bulk feed? | full JSON dump via GitHub `PokemonTCG/pokemon-tcg-data` |
| License | **Proprietary.** Current API terms grant service access but no MIT/open-data license over Pokémon card fields or images. |
| Freshness | weekly on new releases; near-real-time on prices |
| Canonical-form effort | **low** — `id` is stable per printing (e.g. `swsh4-25`) |
| Status | Adapter built 2026-05-12; never run. Upstream bytes are non-redistributable until rights are established. |

### 3.3 YGOPRODeck (Yu-Gi-Oh)

| Field | Value |
|-------|-------|
| Coverage | Yu-Gi-Oh — every printing, set lists, archetype tags, prices |
| URL | `db.ygoprodeck.com/api/v7/` |
| Access | public; no auth |
| Public API? | yes |
| Bulk feed? | full DB dump endpoint |
| License | **Proprietary.** The API guide states no CC-BY/commercial license and identifies card text/images as Konami/4K Media copyright. |
| Freshness | weekly; prices via partner sourcing |
| Canonical-form effort | **low-medium** — passcode (8-digit) is global stable id; set-printing ids per set |
| Status | **blocked pending written commercial permission.** The dormant adapter still has a one-raw-to-many limitation; it performs no network read while blocked. |

### 3.4 Bandai TCG+ (official One Piece + Dragon Ball + Digimon catalog)

| Field | Value |
|-------|-------|
| Coverage | One Piece, Digimon, Dragon Ball Fusion World, Battle Spirits Saga, Union Arena |
| URL | `en.onepiece-cardgame.com`, `digimoncard.com`, etc. (publisher sites) |
| Access | site scrape only; Bandai TCG+ is a mobile app with no public API |
| License | publisher-owned content; redistribution requires permission |
| Freshness | quarterly on new sets |
| Canonical-form effort | **medium** — Bandai uses `OP01-001` style codes consistently |
| Status | **planned (catalog only)** — scraping publisher sites for catalog backfill is generally tolerated; commercial price redistribution would need a partnership |

### 3.5 Limitless TCG (Pokémon + Pokémon Pocket + One Piece tournaments)

| Field | Value |
|-------|-------|
| Coverage | Pokémon, Pokémon Pocket, One Piece — *tournaments + decklists + meta share*, not pricing |
| URL | `limitlesstcg.com` |
| Access | site scrape; some structured pages; partial API |
| Public API? | partial |
| License | partner-friendly; many ecosystem tools integrate |
| Freshness | per-event |
| Canonical-form effort | **low** — uses publisher set codes |
| Status | **planned** — orthogonal to pricing; useful for *meta-aware* features (showing "this card was in 12 top-8 decks this week") |

### 3.6 EDHRec (MTG Commander)

| Field | Value |
|-------|-------|
| Coverage | MTG Commander format — every commander, every card's inclusion stats |
| URL | `edhrec.com` (JSON endpoints + Commander API) |
| Access | public |
| License | data freely redistributable with attribution |
| Status | **planned** — niche but high-value for MTG players |

### 3.7 MTGGoldfish / MTGTop8 / Untapped.gg

| Field | Value |
|-------|-------|
| Coverage | MTG meta + tournament + price history |
| URL | various |
| Access | scrape; some have RSS / JSON |
| License | mixed |
| Status | **planned (low priority)** — Scryfall + TCGplayer cover most of the same ground |

### 3.8 Cardmarket Insight + Cardsphere ratings

| Field | Value |
|-------|-------|
| Coverage | seller reliability ratings (not card data) |
| Access | partner-only |
| Status | **planned (research)** — for cross-platform trust scoring |

### 3.9 Onepiece-cardgame.com (Bandai EN official)

| Field | Value |
|-------|-------|
| Coverage | One Piece TCG — official set lists in EN |
| URL | `en.onepiece-cardgame.com/cardlist/` |
| Access | scrape; structured HTML |
| License | publisher-owned |
| Status | **planned** — useful for catalog completeness in EN |

### 3.10 Bulbagarden / PkmnCards / MTG Wiki

| Field | Value |
|-------|-------|
| Coverage | community-curated card galleries + commentary |
| Access | scrape; some pages have RSS / API |
| License | CC-BY-SA mostly |
| Status | **planned (low priority)** — backup for hard-to-find printings |

### 3.11 TCGCollector

| Field | Value |
|-------|-------|
| Coverage | Pokémon-primary product pages, with registered MTG / One Piece / Yu-Gi-Oh! / Pokémon Pocket reach |
| URL | `www.tcgcollector.com` |
| Access | public sitemap discovery + per-page Schema.org Product/Offer JSON-LD; polite direct reads |
| License | internal-only — machine-readable markup is not a bulk-redistribution grant |
| Freshness | `price_current` when an operator-triggered reader runs |
| Canonical-form effort | **medium** — structured fields help, but product identity still needs canonical SKU matching |
| Status | **partial** — reader and normalizer exist; no observed writer run is claimed |

---

## 4. Tournament / play / meta sources

Distinct from catalog or price — *what cards people actually play*.

| Source | Game | Access | Status |
|--------|------|--------|--------|
| Limitless TCG | Pokémon, OP, Pokémon Pocket | site scrape + partial API | planned |
| EDHRec | MTG Commander | JSON endpoints | planned |
| MTGGoldfish | MTG | scrape | planned |
| MTGTop8 | MTG | scrape | planned |
| Bandai TCG+ app | OP, Digimon, DBF | mobile-only, no API | blocked |
| Pokemon-card.com (JP) | Pokémon JP | scrape | planned |
| Untapped.gg | MTG / Hearthstone | API (paid) | planned (low priority) |

**Why these matter:** meta data turns a price endpoint into a *demand-signal endpoint*. *"This card is up 30% this week"* is shallow; *"This card just made Top 8 in three tournaments"* is the cause. Pair this with the `market_signal` freshness budget in `packages/data-spec`.

---

## 5. Auction / vintage / graded sources

For the high-end sealed + graded market.

| Source | What | Access | Status |
|--------|------|--------|--------|
| **Heritage Auctions** | vintage cards | HA.com API (partner) | planned (low priority) |
| **PWCC / eBay Vault** | graded sealed | eBay APIs (PWCC is now eBay-owned) | planned — included in eBay surface |
| **Goldin** | high-end sealed + graded | partner-only | blocked |
| **Sotheby's** | rare vintage | scrape; partner | research-only |
| **PSA Registry** | graded card lookup + pop reports | PSA API (free tier; rate-limited) | planned — adds verifiability layer |
| **Beckett Registry** | graded card lookup | site scrape; partner API | planned |
| **CGC TCG Registry** | graded card lookup | site scrape; partner | planned |

**Substrate-honesty win:** when the platform displays *"this card sold for £X graded PSA 10"*, the source can be named explicitly (`psa-registry`, `pwcc-vault`) instead of an opaque benchmark.

---

## 6. Social / sentiment sources

For aggregating *what TCG culture is saying*. Lower-precision, higher-signal-on-momentum.

| Source | Modality | Access | Status |
|--------|----------|--------|--------|
| Reddit (r/mtgfinance, r/pkmntcgcollections, r/yugioh, r/OnePieceTCG, r/Lorcana, etc.) | text | Reddit API (free; OAuth) | planned (research) |
| Twitter / X TCG-finance accounts | text | X API (paid; v2) | planned (research) |
| YouTube TCG channels (Alpha Investments, Cards by Pat, OPTCG WatchTower, etc.) | video transcripts | YouTube Data API | planned (low priority) |
| Discord (publisher-run + community) | chat | bot/webhook integration | planned — partner channels only |
| TikTok TCG | short-form video | TikTok API (limited) | research-only |
| Bandai TCG+ app feed | publisher posts | none public | blocked |

**Why sentiment matters:** a card that's mentioned on Alpha Investments at 9am will see price impact by 5pm; aggregating sentiment is a *leading indicator* for the pricing signal endpoints (`market_signal` freshness budget).

---

## 7. Distributor / supply chain (B2B)

The wholesale-to-retail side. Currently the wholesale RDS *is* this for Cambridge TCG; aggregating peer distributor catalogs would unlock partner-pricing redundancy.

| Source | Region | Access | Status |
|--------|--------|--------|--------|
| GTS Distribution | US | partner EDI feed | blocked (B2B partnership only) |
| Southern Hobby Supply | US | partner | blocked |
| ACD Distribution | US | partner | blocked |
| Northstar Games | US | partner | blocked |
| OneStop Card Co. | UK | partner | blocked |
| Asmodee Direct | EU | partner | blocked |
| Bandai NA Distribution | US/CA | partner | blocked |
| TCGplayer Pro Bulk | US singles wholesale | partner | planned (separate from retail TCGplayer) |

**Status note:** *blocked* here means *partnership required*, not *technically infeasible*. A partner who shared their daily catalog as a JSON feed would slot directly into `packages/data-ingest/<distributor>/`. Until then, the wholesale RDS is our only B2B-side data.

---

## 8. Image / scan sources

Cards have a visual identity; the pantry's `image_url` field should always cite where the image came from.

| Source | Coverage | License | Status |
|--------|----------|---------|--------|
| Scryfall images | MTG all | Scryfall API/image policy + WotC rights; no CC claim | planned, value-added free surface only |
| Pokémon TCG API images | Pokémon all | publisher-derived | planned |
| YGOPRODeck images | Yu-Gi-Oh all | publisher-derived | planned |
| Bandai TCG+ official images | One Piece, Digimon, DBF | publisher-owned | scrape with attribution |
| eBay listing photos | per-listing | listing-owned | already accessible via eBay APIs |
| PSA scans | graded cards | PSA-licensed | planned via PSA Registry API |
| Customer-uploaded photos | per-listing | listing-owned | already in `apps/storefront/.../auctions/[id]/photos/` |
| AI-generated placeholders | unrecognized printings | platform-derived | planned (substrate-honest: must wear `<Provenance kind="computed" />` pill) |

---

## 9. What we cannot reasonably get

The **consent path?** column (added 2026-07-11 with Vinted) distinguishes *blocked-dead* (no lawful door exists) from *blocked-with-a-door* (a consented first-party or partner route could open it). Only the latter earns a code module carrying honest meta; the former stays a docs row.

| Source | Why | Consent path? |
|--------|-----|---------------|
| Bandai TCG+ app data | mobile-only; no public API; ToS forbids reverse-engineering | — |
| PWCC pre-eBay archive (closed) | merged into eBay; historical bulk export not offered | — |
| Goldin private-sale ledger | publisher policy | — |
| Mercari JP/US compiled | ToS forbids scraping; partner-only feed not offered to platforms our size | partner-only (not offered to us) |
| Snkrdunk catalog | partner-only API; not granted to non-Asian-market integrators | partner-only (not granted) |
| **Vinted (UK) market-wide** | no sold API exists anywhere; third-party "sold" feeds are snapshot-diff inference; ToS §6 forbids scraping; UK GDPR (EDPB 03/2026 Ex. 5) fails the lawful basis | **yes — consented first-party** (seller's own export / authorised Pro Orders). Module: `packages/data-ingest/src/vinted/`; framework: `docs/methodology/source-intake.md` |
| Pokemon Center direct retail | publisher-controlled; no API | — |
| Publisher pre-release pricing | embargo | — |
| Private discords + closed groups | structurally illegible | — |

**Substrate honesty principle:** when these gaps matter for a customer query (e.g. *"what's the JP Mercari price of this card?"*), the pantry should *answer honestly with the gap* — `null` + a `_meta.source_unavailable` flag — not silently substitute a different source. The data-pantry error code `SOURCE_UNAVAILABLE` (in `@cambridge-tcg/data-spec` `ERROR_CODES`) exists for exactly this.

---

## 10. Access-method categorisation

Aggregating the sources above by *how we'd reach them*:

| Method | Sources | Hygiene priority |
|--------|---------|------------------|
| **Public REST API, no auth** | Scryfall, Pokémon TCG API, YGOPRODeck | Access is easy; rights remain source-specific. YGOPRODeck is blocked for commercial use. |
| **Public file download** | Cardmarket Product Catalog + Price Guide | no credentials; preserve attribution and proprietary rights |
| **OAuth + per-store** | eBay, Shopify, grandfathered Cardmarket accounts | store-scoped credentials and written scope; applications may be closed |
| **HTML scrape, no API** | CardRush, Bandai TCG+ web, Yahoo Auctions, Mercari, publisher catalogs | **high** — User-Agent identification, robots.txt compliance, back-off on errors, fragility |
| **Partner / paid feed** | TCGCSV, distributor EDI, sentiment APIs | medium — billing + ToS + service-level expectations |
| **Mobile/desktop app (blocked)** | Mercari, Snkrdunk, Bandai TCG+ | reverse-engineering ToS-prohibited; do not pursue |

---

## 11. License / redistribution categorisation

Aggregating by *what we can legally do with the data downstream*:

| Tier | Sources | What we can do |
|------|---------|----------------|
| **CC0 / public domain** | (none currently — Cambridge TCG's own data corpus is CC0 via `STANDARDS-LICENSE.md`) | full redistribution |
| **CC-BY / CC-BY-NC** | Only sources with an evidenced content license | redistribute within the exact license scope; API availability alone is not evidence |
| **MIT / permissive** | Cambridge or upstream software explicitly carrying that license | covers software only unless the license expressly includes the data |
| **Partner-redistributable** | eBay or another source only after an actual agreement | display/use only within the written agreement; never infer a partner tier |
| **Internal-only** | CardRush scrape, Yahoo Auctions, Mercari, scraped publisher sites | use as input to decision-making; do not re-publish raw |
| **Proprietary / policy-governed** | Scryfall, Pokémon TCG API, YGOPRODeck, TCGplayer, Cardmarket, distributors | follow the named policy; require explicit permission where commercial reuse is not granted |

**Rule for the pantry:** the response envelope's `_meta.license` declares the
aggregate response license. Cambridge-only operational facts may be CC0;
mixed upstream documents are `NOASSERTION`. `_meta.sources` names lineage and
the parallel `_meta.source_license` array carries each reviewed source tier.
Neither field creates rights the upstream did not grant, and storage never
turns upstream bytes into Cambridge-owned data.

---

## 12. Mapping to `packages/data-ingest`

Each source above becomes a module — call it `packages/data-ingest/<source>/`. The shape:

```
packages/data-ingest/
├── package.json               # workspace package
├── src/
│   ├── index.ts               # public exports
│   ├── shared/
│   │   ├── normalize.ts       # canonical SKU + schema mapping (uses @cambridge-tcg/sku)
│   │   ├── lifecycle.ts       # Scribe lifecycle log emit (uses @cambridge-tcg/lifecycle)
│   │   ├── provenance.ts      # @as_of / @retrieved_at / @sources attachment (uses @cambridge-tcg/data-spec naming)
│   │   └── http.ts            # rate-limited fetch + retry-after handling
│   ├── tcgplayer/
│   │   ├── client.ts          # OAuth2 client
│   │   ├── catalog.ts         # /catalog reader
│   │   ├── pricing.ts         # /pricing reader
│   │   └── normalize.ts       # productId → canonical SKU mapping (reads from card_set_cards.tcgplayer_product_id column)
│   ├── cardmarket/
│   │   ├── client.ts          # OAuth1 client
│   │   ├── products.ts        # /products reader
│   │   ├── articles.ts        # /articles reader (live prices)
│   │   └── normalize.ts       # idProduct + idLanguage → canonical SKU
│   ├── cardrush/
│   │   └── (currently in apps/wholesale/src/lib/cardrush-scraper.ts — extract to here)
│   ├── ebay/
│   │   ├── browse.ts          # Browse API (market signal)
│   │   ├── orders.ts          # Sell API (currently in apps/wholesale/src/lib/channels/ebay.ts)
│   │   └── normalize.ts       # title-parsing → canonical SKU (the hardest single normalizer)
│   ├── scryfall/
│   │   ├── bulk.ts            # daily bulk JSON ingestion
│   │   ├── images.ts          # image URL caching
│   │   └── normalize.ts       # scryfall_id → canonical SKU (oracle_id for cross-printing)
│   ├── pokemon-tcg-api/
│   │   └── ...
│   ├── ygoprodeck/
│   │   └── ...
│   ├── limitless/
│   │   └── ...
│   └── psa-registry/
│       └── ...
└── tests/
    └── (per-source fixtures + reference responses)
```

**Per-module rules** (the eight hygiene principles from `the-modules.md` applied):

1. **Provenance carried:** every row written to RDS carries `(@source, @as_of, @retrieved_at)`.
2. **Validation at edge:** reader produces `unknown`; normalizer produces typed; writer rejects invalid.
3. **Identity stable:** canonical SKU first; upstream source-id stored as side-mapping (e.g. `card_set_cards.tcgplayer_product_id`).
4. **Versioning visible:** each ingest run emits a lifecycle log with the ingest module version + spec version + source version (where the upstream declares one).
5. **Freshness declared:** module maps to a `FreshnessKey` in `packages/data-spec` — e.g. Scryfall bulk → `catalog`, TCGplayer pricing → `price_current`.
6. **License attached:** module declares the upstream's license; this propagates to `_meta.source_license` in downstream responses.
7. **Errors blameless:** when upstream returns 4xx/5xx, module emits a `SOURCE_UNAVAILABLE` lifecycle entry (not silent), retries with back-off, and surfaces the gap honestly downstream.
8. **Null-honest:** missing fields → `null`; missing entire records → `null` row reference; failed-but-retryable → quarantined for retry.

**Cron schedule per source:**

| Source | Cadence | Freshness budget |
|--------|---------|------------------|
| CardRush | observed rows; daily/on-demand intent | price_current |
| Scryfall | adapter built, never run; no scheduled job | catalog |
| Pokémon TCG API | adapter built, never run; no scheduled job | catalog |
| YGOPRODeck | blocked pending written commercial-content permission | none |
| TCGplayer | blocked; no acquisition or serving cadence | none |
| Cardmarket | public daily files; reader not wired | none yet |
| eBay | partial adapter; no observed rows in current coverage | market_signal intent |
| Other reserved slots | no module or scheduled job | none |

---

## 13. Hygiene rules for ingestion

Beyond the eight from `the-modules.md`, ingestion-specific:

1. **Robots.txt and ToS read once, cited in module docstring.** When CardRush's ToS forbids commercial redistribution, the docstring at the top of `packages/data-ingest/cardrush/index.ts` says so explicitly.
2. **User-Agent identifies us.** Every outbound request carries `User-Agent: cambridgetcg.com/<version> (admin@cambridgetcg.com)`. Operators of upstreams can find us, ask us to stop, and we comply.
3. **Rate-limited at module boundary.** Each module exports a `getRateLimit(): { rps, burst }`; the shared HTTP wrapper enforces it. Default is conservative (1 rps, burst 5).
4. **Back-off on 429 + retry-after.** Honour the header; never bypass.
5. **Failed rows quarantined to `ingest_quarantine` table** — not dropped. Daily admin sweep reviews. *Hygiene-honest about ingestion failure.*
6. **Dedup against canonical SKU.** Two upstreams may report the same printing; the writer collapses them on `(sku, source)`, never silently overwrites.
7. **Lifecycle log per run** — Scribe registers an `ingest_<source>` slot via `packages/lifecycle/`. Admin journey + storefront journey both see ingest events automatically.
8. **No ingestion in user-facing request path.** All ingestion is via cron / queue. The pantry reads from RDS; never directly proxies upstream.
9. **License propagated downstream.** When a record is emitted via `jsonResponse`, the parallel `_meta.sources` and `_meta.source_license` arrays declare lineage and reviewed source tiers. Mixed responses use aggregate `NOASSERTION`; absence never means CC0.

---

## 14. Recursion targets

1. ~~**Ship `packages/data-ingest/scryfall/` first.**~~ *Adapter shipped 2026-05-12; never run as of 2026-07-11.* Bulk-dump pattern proven; current policy is proprietary/value-added rather than CC-BY-NC. SKU normalizer: `mtg-<set>-<number>-<lang>[-<variant>]`.
2. ~~**Extract `apps/wholesale/src/lib/cardrush-scraper.ts`**~~ *Shipped 2026-05-12* as [`packages/data-ingest/src/cardrush/`](../../packages/data-ingest/src/cardrush/). The original wholesale file still exists; migration to call this package is queued.
3. **Add `tcgplayer_product_id` + `cardmarket_id_product` columns to `card_set_cards`.** First step of any aggregator pipeline — the mapping table is the hardest part.
4. ~~**Ship `/api/v1/sources` endpoint.**~~ *Shipped.* It lists every registered module, reserved slot, status, reviewed rights tier, and last-run evidence when the database is reachable.
5. ~~**Add `_meta.source_license` to the response envelope.**~~ *Shipped.* It runs parallel to `_meta.sources`; aggregate mixed-content rights remain separate in `_meta.license`.
6. **Ship `ingest_quarantine` table + admin review surface.** Failed rows visible; not silently dropped.
7. **Write `the-rivers-flow.md` as a story-arc.** One card's price from Scryfall bulk → RDS → `/api/v1/cards/[sku]` → partner's `console.log`. The journey of one byte through every layer.
8. **Pair with sentiment ingestion.** `packages/data-ingest/reddit/` for r/mtgfinance + r/OnePieceTCG; emit a `market_signal` aggregate per card per day.
9. **Partnership outreach list.** Distributors, PWCC/Goldin, Snkrdunk — even when we can't get the data today, the names are written down so a future Yu can make the call.

---

## 15. What this entry names — substrate-honestly

This catalog names ~50 upstream sources across 9 categories, 9 hygiene rules
specific to ingestion, 9 recursion targets, and the module layout for
`packages/data-ingest/`. Nine source modules are registered and ten ids are
reserved, but the collected observation database currently contains one
external source: CardRush. Implemented adapters without a writer are
`partial`, not flowing data.

Cambridge TCG today has rich downstream surfaces (the pantry, the manifest,
the graph, the ontology, the identity protocol) and one observed external
river in the wholesale archive: CardRush. No eBay order feed is claimed as
collected. **The asymmetry is the finding.** Each future tributary must cross
access, rights, writer, and publication gates independently.

The pantry is downstream. The tributaries are upstream. The first ingestion that *closes the loop* — where a partner asks `/api/v1/cards/[sku]` and the response carries Scryfall provenance honestly — turns the platform from *a curated catalog* into *an aggregator*. That is the next kingdom.

This entry names itself in `this_entry_names`; it is named by [`the-pantry.md`](./the-pantry.md), [`the-modules.md`](./the-modules.md), and [`the-distributor.md`](./the-distributor.md); it will be named by the future story-arc `the-rivers-flow.md` and by every per-source module that ships under `packages/data-ingest/`.

— Sophia, 2026-05-12.
