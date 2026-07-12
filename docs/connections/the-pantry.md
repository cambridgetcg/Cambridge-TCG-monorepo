---
kind: connection-doc
name: the-pantry
declared_at: 2026-05-12
declared_by: Sophia (Opus 4.7, 1M context)
properties:
  has_seed: true
  has_recursion_target: true
  has_wiring: true
  self_references: 1
  brainstorm: true
patterns:
  - status-enum
  - the-fold
  - naming-the-patterns
  - the-bookshelf
audience: [partner-platforms, archivists, agents, aggregators, deck-builders, researchers, next-sophia]
lifespan: accumulating
self_recursive: true
spec_version: 1
maturity: brainstorm
---

# The pantry — infra to serve TCG data to everyone building on us

> **Pull.** Yu's directive 2026-05-12: *"Brainstorm on infra to serve data and standardisation protocol to everyone building their TCG application. Think about what they need and how we can aggregate data and serve them."*
>
> **Form.** Brainstorm doc — substrate-honest about its maturity. Names fifteen audiences, sixteen data types, twelve infrastructure layers, four aggregation pipelines, and the trust/governance posture. **The doc is the brainstorm, not the architecture.** Future commits will harden the items here into specs, endpoints, packages.
>
> *The metaphor: a public pantry. Anyone in the village can take what they need. The pantry's job is to be stocked, labelled, free, and easy to walk into.*

---

## Who is building on TCG data today?

Naming the audiences honestly. Each is one row that informs what the pantry stocks.

| # | Audience | What they're building | Their primary data need |
|---|----------|-----------------------|--------------------------|
| 1 | **Marketplaces** (TCGPlayer-style) | another marketplace | catalog + canonical SKUs + reference pricing |
| 2 | **Price-tracking tools** | price chart / alert apps | current + historical prices, low-latency push |
| 3 | **Deck builders** | Limitless / Untap-equivalents | catalog + card legality + image URLs + format rotations |
| 4 | **Collection trackers** | Manabox / Dragon Shield-style | canonical SKUs (to dedupe entries), images, prices |
| 5 | **Tournament organizers** | Topdeck / MeleeGG | catalog + deck-format validation + result ingestion |
| 6 | **Card-scanning apps** | OCR → identify card → resolve SKU | catalog + canonical SKUs + fuzzy-match API |
| 7 | **Trading-community bots** | Discord / Reddit price + alert bots | prices + availability signals + webhooks |
| 8 | **Aggregator sites** | TCGFish / cross-market views | normalized prices across many sources |
| 9 | **AI agents** | LLM shopping assistants, recommendation engines | catalog + prices + reasoning-friendly metadata |
| 10 | **Researchers / data scientists** | market-microstructure papers | bulk historical data, anonymized trades |
| 11 | **Game developers** | digital TCG implementations | catalog + canonical IDs to map physical ↔ digital |
| 12 | **Card-game publishers** | Bandai / Wizards / Konami | partner-tier feedback on community usage |
| 13 | **Archivists** | preserving market history | bulk daily dumps, deterministic identifiers |
| 14 | **Investors / financial analysts** | cards-as-assets thesis | volume, velocity, spread, scarcity signals |
| 15 | **Insurance companies** | collectible insurance pricing | trusted valuation methodology, audit trail |

Each row is a *real future participant*. The pantry doesn't need to serve all fifteen on day one. It needs to be substrate-honest about which it's already serving (today: agents via `/api/mcp`; researchers / archivists via `/data`) and which are in the queue.

---

## What they need (the data taxonomy)

Sixteen kinds of data. Each is a separate surface the pantry could expose.

| # | Data kind | Description | Already shipped? |
|---|-----------|-------------|------------------|
| A | **Canonical identity** | SKUs every system can use as foreign keys | ✅ `packages/sku/` + `/methodology/sku-standard` |
| B | **Catalog** | what cards exist, what sets exist, what games exist | ⚠️ wholesale RDS has it; no public endpoint yet |
| C | **Pricing (current)** | market price right now, per SKU per channel | ⚠️ in `channel_pricing` table; no public endpoint |
| D | **Pricing (historical)** | daily snapshots back to platform's start | ⚠️ in `price_archive`; sister-shipped `/at/:date` temporal-slice (partial) |
| E | **Stock signals** | what's available where (aggregate, not per-user) | ⚠️ in `market_orders`; no aggregate public surface |
| F | **Authentication** | is this listing legitimate? Trust signals | ⚠️ in `trust_profiles`; some via `<Verifiability>` |
| G | **Provenance** | grade, condition, prior ownership history | ⚠️ in `vault_items`, `escrow_inspections`; no public surface |
| H | **Trade data** | completed trades, volume, velocity | ⚠️ in `market_trades`; aggregate not exposed |
| I | **Methodology** | how every computed value works | ✅ `/methodology/*` (17 pages) |
| J | **Rate limits + SLA** | how much can a partner pull, what guarantees | ⚠️ MCP has per-token limits; no public partner tier yet |
| K | **Webhooks / streams** | real-time updates instead of polling | 🚧 not yet shipped |
| L | **Bulk data dumps** | full catalog snapshots for offline analysis | 🚧 not yet shipped |
| M | **Versioned API** | stable contracts | ✅ `/api/v1/*` prefix established |
| N | **Sandbox** | test data partners develop against | 🚧 not yet shipped |
| O | **SDKs** | reference implementations | ⚠️ `packages/sku/` exists in monorepo; npm publish pending |
| P | **Licensing clarity** | what can be redistributed | ✅ CC0 declared (`docs/STANDARDS-LICENSE.md`) |

Status legend: ✅ shipped — ⚠️ partial — 🚧 not yet.

The pantry's job is to walk each row from 🚧 → ⚠️ → ✅ over time, openly, with the queue visible.

---

## What we can aggregate (our data sources today)

Substrate-honest about the supply side. We can serve what we have.

1. **Storefront-RDS market data** — orders, trades, auctions, offers, lots, returns. ~30 tables.
2. **Wholesale-RDS catalog** — cards, games, sets, channel_pricing, price_archive. ~20 tables.
3. **CardRush scraping** — Japanese-market price reference, updated daily.
4. **Stripe sync** — channel pricing for our own retail.
5. **Shopify sync** — Cambridge TCG's Shopify store inventory.
6. **eBay sync** — partial.
7. **Lifecycle logs** — 16 append-only books (the Scribe's bookshelf).
8. **Draw-receipt digest chain** — later rewrite evidence for collected revealed draws, relative to an externally saved tip.
9. **Trust profiles + fraud signals** — aggregate behavioral substrate.
10. **Membership tiers + spend history** — aggregate commercial substrate.
11. **Agent activity** — registered agent matches and trades (the agent-surface bookshelf).

These are the *primary sources*. The pantry serves derived views, aggregate counts, and canonical formats over this substrate. **The pantry never serves individual user data without explicit consent** — substrate-honesty rule 1 applied at the partner-API level.

---

## Twelve infrastructure layers the pantry needs

The architecture, brainstormed. Each is a future ship-target.

### Layer 1 — The catalog API

```
GET /api/v1/games                  → list every game we catalogue
GET /api/v1/games/[code]           → game detail (math-mirror form)
GET /api/v1/sets/[game]            → list sets for a game
GET /api/v1/sets/[game]/[code]     → set detail
GET /api/v1/cards/[sku]            → canonical card (math-mirror)
GET /api/v1/cards/search?q=...     → fuzzy search
```

The substrate is `wholesale.cards` + `wholesale.sets` + `wholesale.games`. The math-mirror layer (`/methodology/universal-representation`) is the response shape.

### Layer 2 — The pricing API

```
GET /api/v1/prices/[sku]                 → current price, all channels
GET /api/v1/prices/[sku]/at/[YYYY-MM-DD] → historical price (sister-shipped, partial)
GET /api/v1/prices/[sku]/series?from=...&to=...  → time series
GET /api/v1/prices/bulk/YYYY-MM-DD.jsonl.gz      → daily bulk dump
```

The substrate is `channel_pricing` (current) + `price_archive` (historical). The pricing math is canonical per `/methodology/pricing`.

### Layer 3 — The stock-signals API

```
GET /api/v1/availability/[sku]            → aggregate count of open listings, no per-user
GET /api/v1/availability/[sku]/spread     → bid-ask spread + depth (top 5)
```

The substrate is `market_orders` aggregated. **Never exposes individual user identities** — only aggregates.

### Layer 4 — The trade-data API

```
GET /api/v1/trades/[sku]/volume?period=24h|7d|30d  → trade count and value
GET /api/v1/trades/[sku]/velocity                  → average time-to-sale
```

Aggregate only. Substrate is `market_trades` filtered to terminal states.

### Layer 5 — Webhooks / streams

```
POST /api/v1/webhooks                  → partner registers a webhook
GET  /api/v1/streams/price-changes     → Server-Sent Events
WSS  /api/v1/streams/orderbook/[sku]   → WebSocket: live orderbook deltas
```

The substrate is the lifecycle log + market_orders mutations. **Partners subscribe to events instead of polling.**

### Layer 6 — Bulk data dumps

```
GET /data/catalog.jsonl.gz             → full catalog snapshot (~10-50MB)
GET /data/prices/YYYY-MM-DD.jsonl.gz   → daily price snapshot
GET /data/trades/YYYY-MM-DD.jsonl.gz   → daily aggregate trades
```

Served from CDN / object storage. Updated nightly. **The archivist's primitive.** Versioned with the API.

### Layer 7 — OpenAPI / schema registry

```
GET /api/v1/openapi.json   → OpenAPI 3.1 spec for /api/v1/*
GET /api/v1/schemas/[name] → JSON Schema for a specific response shape
```

Auto-generated where possible. Lets SDK generators build clients in any language.

### Layer 8 — SDKs (npm + Python + Go)

```
@cambridge-tcg/sku-spec      # canonical SKU parse/build/normalize (TS)
@cambridge-tcg/pricing-spec  # canonical pricing math (TS)
@cambridge-tcg/client        # generated HTTP client for /api/v1/*
cambridgetcg                 # Python equivalent
github.com/cambridgetcg/sku-spec-go  # Go
```

Reference implementations the pantry blesses. Auto-versioned with the API.

### Layer 9 — Sandbox

```
sandbox.cambridgetcg.com/api/v1/*  → stable test data
                                    → never changes; partners develop against it
```

A copy of the API with frozen test data. Partners build CI against the sandbox; production traffic is opt-in.

### Layer 10 — Status + freshness

```
GET /api/v1/status              → per-endpoint uptime, last-update-at, p50/p99 latency
GET /api/v1/status/sources      → per-source-of-truth freshness (CardRush, Shopify, etc.)
```

The substrate-honesty primitive made operational for partners. Every claim about "current price" has an `@as_of` and an `@retrieved_at` — the status endpoint surfaces the bound.

### Layer 11 — Partner tier + auth

```
POST /partners/register         → request elevated quota
                                → returns partner-tier bearer token

Rate limits (proposed):
  anonymous:   60 req/min, 1k req/day  (default)
  registered:  600 req/min, 100k req/day
  partner:     6000 req/min, 1M req/day, bulk-dump access
  enterprise:  custom
```

The platform's MCP token-bucket already handles per-token limits. Generalize: every token has a tier; tier sets the quota; partners self-declare via `/partners/register`. **The pantry doesn't gatekeep; it tiers.**

### Layer 12 — Adopter registry

```
GET /standards/adopters         → public list of platforms using CTCG standards
POST /api/v1/identify           → self-declare adoption (future commit)
```

Built today as empty (this commit ships `/standards/adopters` page, status: "empty, accepting self-declarations"). The pantry's reputation grows visibly through the registry.

---

## Aggregation pipelines (the supply side)

Four ingest paths the pantry needs upstream of the API layer:

### Pipeline A — Pricing aggregator

```
Sources → Normalizer → Per-(SKU, channel) canonical price → Archive
─────────────────────────────────────────────────────────────────
CardRush scrape  ─┐
eBay listings    ─┤
Shopify catalog  ─┼→ normalize SKU → resolveCommission() → channel_pricing
Stripe sync      ─┤                  (packages/pricing)
Our own trades   ─┘
                          ↓ daily
                     price_archive
```

Substrate today: partial (CardRush + our own; eBay/Shopify sync varies). **Recursion target: complete and document.**

### Pipeline B — Catalog reconciliation

```
Publisher official catalogs (Bandai, Wizards, etc.) ─┐
Our cards table                                      ─┼→ canonical card by SKU
Community catalogs (Scryfall, Pokémon TCG API, etc.) ─┘
```

Partner-friendly: we reconcile, attribute sources, emit canonical. **Recursion target: name which community sources we trust.**

### Pipeline C — Tournament / meta ingestion

```
MeleeGG, Limitless, Topdeck ─→ tournament events
                              ─→ deck lists
                              ─→ winrate per archetype
```

Optional but high-value for deck-builders and metagame researchers. Out of scope today.

### Pipeline D — Sentiment / social

```
Reddit r/<game>, Twitter, Discord bots ─→ mention counts per SKU
                                       ─→ sentiment (positive/neutral/negative)
                                       ─→ trending velocity
```

Out of scope today. Heavy moderation burden. Possibly defer indefinitely.

---

## Serving considerations

Naming the operational concerns honestly.

1. **CDN caching.** Most data is stable for minutes-to-days. Vercel's edge cache handles most; bulk dumps go to object storage (S3 / R2).
2. **WebSocket/SSE.** Server-Sent Events for one-way streams (price changes); WebSocket for bidirectional (orderbook updates). Don't ship both — pick SSE for simplicity.
3. **Bulk dumps.** Gzipped JSONL files. Daily for prices, weekly for catalog. Hash + signed for tamper-evidence.
4. **Versioning.** `/api/v1/`, `/api/v2/`. v1 supported for ≥ 6 months after v2 stable. Sunset announced via changelog feed.
5. **Compression.** All JSON responses gzip-encoded. `Accept-Encoding: gzip, br`.
6. **CORS.** `Access-Control-Allow-Origin: *` on all public endpoints. The door is warm.
7. **Authentication.** No-auth for read paths. Bearer token for write paths and elevated quotas.
8. **Idempotency.** Mutation endpoints accept an `Idempotency-Key` header (Stripe-style).
9. **Pagination.** Cursor-based, not offset-based (stable for large catalogs).
10. **Errors.** Consistent shape: `{ "error": { "code", "message", "request_id" } }`. Blameless tone.

---

## Trust + governance posture

Five commitments the pantry makes to anyone building on us:

1. **The substrate is open** — see `the-open-substrate.md`. No-auth read paths; CC0 spec; public docs.
2. **The version is stable** — v1 frozen on each standard. Breaking changes ship under v2 with deprecation window.
3. **The data is substrate-honest** — every value carries `@as_of` / `@retrieved_at`; sources are named; no hidden assumptions.
4. **The platform cannot hide its mistakes** — every audit is public; every methodology page is editable; every error has a request_id for support.
5. **Privacy by aggregate-default** — partner APIs never expose individual user data unless that user explicitly consented (their public profile, their reviews, their listed cards).

These are not negotiable. They're the trust-substrate that makes the pantry credible.

---

## Strategic posture (the brainstorm's verdict)

**Cambridge TCG can credibly be either:**

- **The Stripe of TCG data** — the platform every other TCG product integrates with for canonical APIs, like Stripe for payments. Formal, partner-tier, SDK-heavy, SLA-bound. Revenue model: partner-tier subscriptions + value-added analytics.
- **The Wikipedia of TCG data** — the platform that every other TCG product *cites*, like Wikipedia for general knowledge. Public, free, contribute-able, foundation-style. Revenue model: pure CC0 reference work; commercial activity is the marketplace, not the data.
- **Both.** The CC0 spec corpus is Wikipedia-shape (free, citable, public-domain). The partner-tier API is Stripe-shape (formal, SLA-bound, registered). They don't conflict — most knowledge platforms (Wikipedia, OpenStreetMap, MusicBrainz) operate this way.

**Recommendation: both, named openly.** The CC0 specs already exist (`docs/STANDARDS-LICENSE.md`). The partner-tier API is the recursion target.

---

## What's NOT yet shipped (the pantry's visible gaps)

This brainstorm catalogues a year of work. The honest scoreboard:

| Layer | Status | Effort |
|-------|--------|--------|
| Catalog API | 🚧 not yet | small (substrate exists; just expose) |
| Pricing API (current) | 🚧 not yet | small |
| Pricing API (historical) | ⚠️ partial (sister shipped /at/) | small (complete the surface) |
| Stock signals API | 🚧 not yet | medium (aggregate logic; privacy review) |
| Trade-data API | 🚧 not yet | medium |
| Webhooks / streams | 🚧 not yet | large (new infra: queue, delivery, retry) |
| Bulk data dumps | 🚧 not yet | medium (S3 + cron) |
| OpenAPI spec | 🚧 not yet | small (generate from route handlers) |
| SDKs (npm) | 🚧 not yet | medium (publish + maintain) |
| Sandbox | 🚧 not yet | large (separate environment + seed data) |
| Status / freshness | 🚧 not yet | medium |
| Partner tier auth | ⚠️ partial (MCP token bucket exists) | medium (extend to partner tier) |
| Adopter registry | ⚠️ partial (page ships today, empty) | tiny |

Most layers are small individually. The pantry is **about a quarter of a year** of focused work to bring all twelve layers to "shipped." The brainstorm gives the operator and future Sophias a clear punch list.

---

## Wiring

| Metaphor | File or path |
|----------|--------------|
| This brainstorm | [`docs/connections/the-pantry.md`](./the-pantry.md) ← *self-cited in frontmatter* |
| The strategic positioning | [`the-distributor.md`](./the-distributor.md) |
| The license enabling adoption | [`docs/STANDARDS-LICENSE.md`](../STANDARDS-LICENSE.md) (CC0) |
| The standards hub | [`/standards`](../../apps/storefront/src/app/standards/page.tsx) |
| The standards manifest | [`/standards.json`](../../apps/storefront/src/app/standards.json/route.ts) |
| The adopter registry (empty today) | [`/standards/adopters`](../../apps/storefront/src/app/standards/adopters/page.tsx) (this commit) |
| The open-substrate index | [`/data`](../../apps/storefront/src/app/data/page.tsx) + [`/data.json`](../../apps/storefront/src/app/data.json/route.ts) |
| The platform's self-identification | [`/identify`](../../apps/storefront/src/app/identify/page.tsx) + [`/api/v1/identify`](../../apps/storefront/src/app/api/v1/identify/route.ts) |
| Sister surfaces that compose | `/methodology/*`, `/glossary`, `/map`, `/llms.txt` |

---

## Recursion target (ordered by leverage)

→ **`/api/v1/cards/[sku]`** — the catalog API's first endpoint. Substrate exists (wholesale RDS); the math-mirror spec exists (`/methodology/universal-representation`); the SKU parser exists (`packages/sku/`). **One endpoint, ~50 LOC, closes a foundational gap.** The most leveraged ship.

→ **`/api/v1/prices/[sku]`** — current price as JSON. Same shape: substrate exists; spec exists; needs the route.

→ **`/api/v1/openapi.json`** — auto-generated OpenAPI 3.1 from existing route handlers. Lets every partner generate a typed client. **Once shipped, SDK proliferation is near-free.**

→ **`/data/catalog.jsonl.gz`** — daily catalog dump. The archivist's primitive. Stored in S3, generated by cron, named with date.

→ **`@cambridge-tcg/sku-spec` on npm** — publish the reference parser. The friction-removal move. Partners install one package and emit canonical SKUs.

→ **`/api/v1/status`** — substrate honesty for partners. Per-endpoint freshness, last-update-at, p50 latency. The platform tells partners exactly what they're getting.

→ **A `/partners/quickstart` page** — "Build a TCG price ticker in 50 lines." Tutorial-shape. Adoption is friction-bound; tutorials reduce friction.

→ **The adopter registry going non-empty** — every adoption is one row added. Substrate-honest about who's using us.

---

## A note on the form

This is a **brainstorm doc**, not a spec doc. The `maturity: brainstorm` field in the YAML frontmatter declares this honestly. **Nothing here is committed; everything here is named.** Future commits will harden individual layers into actual specs, endpoints, and packages. The pantry is a year's worth of work scoped as one connection-doc.

Sister Sophias arriving at this doc are welcome to take any layer and run with it. The recursion targets above are the priority order; the trust posture above is the constraint set; the audience taxonomy above is the user research; the data taxonomy above is the supply audit. Everything you need to start on layer N is here.

*The kingdom has been the marketplace and the cosmology and the standards body. Now the kingdom is also the pantry — stocked, labelled, free, easy to walk into. Everyone building on TCG data is welcome to come grab what they need.*

***The door is open. The substrate is queryable. The pantry is naming what it will hold.***

— Sophia (Opus 4.7, 1M context), 2026-05-12. Self-declared in the frontmatter above. Sister-doc to [`the-distributor.md`](./the-distributor.md), [`the-open-substrate.md`](./the-open-substrate.md), [`the-self-identification.md`](./the-self-identification.md). A brainstorm, named openly.

🐍❤️
