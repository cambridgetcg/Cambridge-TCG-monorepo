# The market mirror — the kingdom learns to let a card be read

> **Pull.** Yu's directive 2026-05-12 late evening, after I had laid out a six-option matrix of trader/collector needs and recommended one cut: *"Build /cards/[sku]/market first."*
>
> **Form.** Story-as-wire. Ships a single new public-no-auth server-rendered route alongside the existing client-rendered interactive `/market/[sku]`. The wire is at [`apps/storefront/src/lib/market/card-market.ts`](../../apps/storefront/src/lib/market/card-market.ts) (composer); the page is at [`apps/storefront/src/app/cards/[sku]/market/page.tsx`](../../apps/storefront/src/app/cards/[sku]/market/page.tsx); the methodology is at [`apps/storefront/src/app/methodology/market/page.tsx`](../../apps/storefront/src/app/methodology/market/page.tsx). **kingdom-067.**
>
> Sister to S26 [`the-substrate-answers.md`](./the-substrate-answers.md) (the math-mirror pattern — one substrate, two readings, different audiences), to S33 [`the-trader-mirror.md`](./the-trader-mirror.md) (this entry is the *per-card* counterpart to that *per-trader* dashboard), and to the existing interactive `/market/[sku]` page (which already exists, was discovered mid-design, and is preserved untouched).

---

## What this arc traces, in one sentence

The moment the kingdom — which had a richly interactive `/market/[sku]` page for *placing orders* and an entire substrate of price history / depth / completed trades / counterparty trust scores that no public page exposed *as reading* — earned a substrate-honest, public, no-auth, server-rendered, screen-reader-readable, agent-ingestable pure-read mirror of one card's market activity, paired with a methodology page that names every formula and every gap.

---

## Why this entry exists at all (the discovery)

When the directive landed (*"Build /cards/[sku]/market first"*), my read of the platform said: *the marketplace has substrate; let me build the depth-of-market visualisation*. So I started exploring schemas to confirm the pattern.

That exploration uncovered something I had not realised one turn earlier: **`/market/[sku]` already exists**, and it is *deeply* rich. It already shows:

- An order-book depth ladder (`OrderBookViz`, ~130 lines of bespoke SVG)
- A 30-day spot-price sparkline (`PriceHistoryTile`)
- Best bid / best ask with spread
- 30-day VWAP, median, range, total volume (`fairValue` block)
- A "recent trades" tape (with seller usernames where public)
- Fill probability + expected-days-to-fill for a candidate bid
- Co-watched related cards
- CTCG spot panel + trade-in credit / cash offers
- An interactive order form (bid/ask, condition, escrow routing preview)
- Watchlist toggle + price alerts
- A demand-pressure flag when watch+alert count is high

**The page is excellent at what it is.** What it is *not*: a calm read. It is a `"use client"` component that polls every ten seconds, embeds form state, and is shaped around placing orders. A logged-out collector, a screen reader, an agent that ingests structure, a researcher charting prices, a sister-platform federation client — none of them have a comfortable door.

The S26 pattern named this exact situation: when the platform has an interactive surface for one audience and a different audience wants *to read*, build the math-mirror sibling. Same substrate, two readings, different audiences. **Verify, don't overwrite.** `/cards/[sku]/market` is that sibling.

---

## Cast

**The Composer.** [`apps/storefront/src/lib/market/card-market.ts`](../../apps/storefront/src/lib/market/card-market.ts). 500+ lines. Seven section loaders running in parallel:

```
loadMeta(sku)           → CardMarketMeta         (first-seen, image, set)
loadPriceHistory(sku)   → CardMarketPriceHistory (7d/30d/90d/365d windows)
loadBook(sku)           → CardMarketBook         (top-10 each side + condition breakdown)
loadTape(sku)           → CardMarketTape         (last 20 trades + trust tier joined)
loadStats(sku)          → CardMarketStats        (VWAP/median/spread/last/completion)
loadConditions(sku)     → ConditionRow[]         (NM/LP/MP/HP ask counts + best price)
loadParticipants(sku)   → CardMarketParticipants (anonymised 90d distinct counts)
```

Each section wrapped in `safe()` — a single failing query degrades to empty rather than crashing the page. `Promise.all` keeps the wall time tight.

**The Page.** [`apps/storefront/src/app/cards/[sku]/market/page.tsx`](../../apps/storefront/src/app/cards/[sku]/market/page.tsx). ~400 lines of server-rendered TSX. Layout: left column = card image + condition breakdown + participants; right two columns = stats / order book / tape / price-history grid. Inline SVG sparklines (no chart library, no client JS for the read).

**The Methodology.** [`/methodology/market`](../../apps/storefront/src/app/methodology/market/page.tsx). Every section anchored (`#orderbook`, `#stats`, `#tape`, `#history`, `#conditions`, `#participants`); every WhyLink on the page deep-links into the corresponding section.

**The Trust-Tier Join.** The single most valuable new data fact this entry adds — the existing `/market/[sku]` page shows seller usernames on the tape but not trust scores. The mirror joins `trust_profiles` on `seller_id` at read time and renders an Elite/Veteran/Trusted/Starter/New tier badge per trade. *A reader can now scan twenty trades and see what kind of sellers have been moving this SKU.*

**The Condition Slicer.** The existing page aggregates by price across conditions; the mirror does too at the headline (best-bid / best-ask), but every row breaks out the condition mix (`NM ×3, LP ×1` etc.) and a dedicated panel shows per-condition open-ask counts + best price. *A collector hunting NM Charizard sees, in one glance, that there are 8 NM asks starting at £42 but only 1 HP ask at £18.*

**The Four-Window Sparkline Strip.** The interactive page has one 30-day sparkline; the mirror has four side-by-side (7/30/90/365d) — all from the same `card_price_history` table, different `INTERVAL` queries. *The collector who wants the long arc has it; the trader who wants the short pulse has it; the reader picks the window.*

**The Anonymous Seller Id.** Each tape row carries `#abc123` (the last 6 chars of the seller_id UUID). It's not a security boundary; it's a correlation aid so a reader can see *"three of these last twenty were the same anonymous seller"* without learning their identity. The interactive page links full usernames where public; the mirror is more conservative.

**The Provenance Pill, the WhyLinks, the Audience Marker.** The four-doctrine primitives every page on the consumer surface gains. `<Provenance kind="live" />` declares the data is queried at request time; `<WhyLink>` on every section lands at the corresponding methodology anchor; `<Audience kind="consumer" contexts={["market", "card", "public-read"]} />` declares for whom this page is designed (and tells the inclusion audit that this is consumer-readable, not agent-default).

---

## Act 1 — What the marketplace already had

Before this entry, the kingdom had:

- A rich transactional surface at `/market/[sku]` (described above).
- A math-mirror at `/api/v1/universal/card/[sku]` showing the card's identity, magnitude, and time facts — but *not* the order book or the tape.
- An aggregate per-SKU `/api/market/[sku]/unified` JSON endpoint feeding the interactive page — but bound to the page's polling lifecycle, not designed as a public read.
- A daily snapshot at `card_price_history` carrying spot, best_bid, best_ask per UTC day — read by some endpoints, never surfaced on a public page across multiple windows.

What the kingdom didn't have:

- A public-no-auth server-rendered HTML view of one card's market that a screen reader could speak, an archivist could save, an agent could parse, or a logged-out collector could read at midnight while deciding whether to bid in the morning.

The substrate was already telling the truth. The mirror is the act of pointing.

---

## Act 2 — The four-doctrine pass on a market page

This was the second time the platform shipped a domain-specific four-doctrine surface (S33 trader-dashboard was the first, two hours earlier the same evening). The pattern is now visible enough to name:

### Substrate honesty

The page declares `<Provenance kind="live" />` at the top and at the footer. The footer also names the `queried_at` ISO timestamp and the four source tables. Each section's `safe()` wrapper means a failed query renders empty / `—` rather than fabricating zero. The methodology page documents every approximation:

- Anonymous seller id is a *correlation aid*, not a security boundary
- Tier label is a *display projection* of the canonical trust score
- Price history gaps mean *no observation captured that day*, not zero
- Repeat-pair fraction is *0..1*, null when too few trades

### Transparency

Every section has a `<WhyLink>` glyph next to its title. Every glyph lands at `/methodology/market#<section>`. The methodology page names every formula in SQL form, names every approximation, and enumerates "what this page does NOT do" explicitly:

- No cross-platform prices
- No graded prices
- No sealed-product prices
- No forecasting
- No participant ranking
- No counterparty trust on open orders (only on the tape)
- No fill-probability (the interactive page has it)

A reader knows what the surface owes them and what it doesn't.

### Meaning

The page exists because its meaning to the surrounding domains is not derivable from the code:

- It **borrows from** market_orders, market_trades, trust_profiles, card_price_history.
- It **points at** `/market/[sku]` (the interactive sibling), `/methodology/market` (the formula), `/methodology/trust-score` (canonical trust detail), `/api/v1/universal/card/[sku]` (the math-mirror).
- It **does not write** to any table.
- It **does not replicate** decisions made elsewhere — the trust tier displayed here is *the same band* the commission engine uses, just rendered, not redecided.

This connection-doc names what the mirror is for *to the other domains*, not just what it shows.

### Creation

This commit carries:
- **Will trace:** Yu's directive *"Build /cards/[sku]/market first"* (cited in data layer + methodology + this doc + mission card)
- **Sophia trace:** `Co-Authored-By: Claude Opus 4.7 (1M context)` in the trailer
- **Artifact trace:** the diff (composer, page, methodology page, manifest entry, methodology-index entry, this doc, mission card, MEMORY entry, pillow book)

The syzygy is the three traces composed into one commit.

---

## Act 3 — The asymmetry between interactive and read surfaces

A subtle finding: *what an interactive surface and a read surface owe their reader are different things.*

The interactive surface owes:
- Latency — low (polling every 10s; orders apply at submit)
- Form state — present and persistent across changes
- Auth state — needed for any action
- Optimism — UI updates before server confirms

The read surface owes:
- Calm — no polling, no animation, no nudge
- Auditability — every value is queryable, every formula linkable
- Equality of access — no auth, no rate-limit-by-account
- Modality fluency — speakable, indexable, ingestable

Same substrate. Different surface contract. The kingdom now has *one of each per card*, and they don't conflict — the breadcrumb on the mirror points at the interactive page; the interactive page (in a future revision) could point at the mirror for the calm read.

This is *not* duplication. It's the **two-reading pattern** named: each domain that has an interactive transactional surface gains a sibling pure-read mirror for the audiences the interactive page doesn't naturally serve.

The previous instance was S26 — math-mirror to product page. This entry is the second instance. Future instances probably want this kind of treatment: account portfolio, auctions, trade-in submissions. *Every interactive page implies a calm-read peer.*

---

## Act 4 — What collectors and traders see, walked

**A collector** opens `/cards/charizard-ex-OP04-001-en/market`:

> Charizard ex (OP-04 Kingdoms of Intrigue). Image. Conditions: NM ×8 from £42 · LP ×2 from £35 · MP ×1 at £24 · HP — no asks. Aggregate: best bid £40, best ask £42, spread £2, 30d VWAP £43, last trade £42.50 (3h ago), completion 96%. Tape: twenty trades, fourteen by Trusted-or-better sellers, oldest 6 days ago. History: 7d steady, 30d up 4%, 90d up 12%, 365d up 38%. Participants: 22 distinct buyers, 9 distinct sellers, 18% repeat-pair.

In thirty seconds of reading they know: *the market is liquid; my LP would sell at maybe £35; I should hold the NM since the long arc is up; the seller pool is small and reliable.*

**A trader** opens the same page:

> Spread £2 on a £42 mid; that's 4.7% — wide enough to flip with discipline if I can source below £40. 30d VWAP at £43 above the current ask suggests asks are aspirational; the tape's median is closer to £42.50. Twenty trades in 30 days = ~0.7/day — thin but real liquidity. 90d repeat-pair 18% means most trades are new pairs; not a fortress market. Completion 96% — disputes are rare here.

Same numbers, different read. The mirror serves both because the substrate serves both.

**An agent** fetches the page (HTML with `<meta name="cambridge:audience" content="consumer">`), or fetches the math-mirror at `/api/v1/universal/card/[sku]`, depending on its preference. The page's footer points at both.

**A screen-reader user** has every section as a `<section>` with a heading, every stat in a `<dl>` (where appropriate) or labelled span, every sparkline carrying an `aria-label` describing trend direction. No section depends on visual layout alone.

---

## Act 5 — Wires (file:line citation table)

| Concept in this entry | File:line | Role |
|---|---|---|
| The composer | [`apps/storefront/src/lib/market/card-market.ts`](../../apps/storefront/src/lib/market/card-market.ts) | Seven parallel section loaders, typed shape, `_provenance` envelope |
| The page | [`apps/storefront/src/app/cards/[sku]/market/page.tsx`](../../apps/storefront/src/app/cards/[sku]/market/page.tsx) | Server-rendered, no client JS, inline SVG sparklines |
| The methodology | [`apps/storefront/src/app/methodology/market/page.tsx`](../../apps/storefront/src/app/methodology/market/page.tsx) | Anchored sections matching every WhyLink on the page |
| The interactive sibling | [`apps/storefront/src/app/market/[sku]/page.tsx`](../../apps/storefront/src/app/market/[sku]/page.tsx) | Preserved untouched; verify-don't-overwrite observed |
| The shared substrate | `market_orders` + `market_trades` + `trust_profiles` + `card_price_history` | Read-only access; no writes from this surface |
| The math-mirror sibling | [`apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts`](../../apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts) | Same substrate, machine-readable shape — the footer points at it |
| The trust-tier bands | [`apps/storefront/src/lib/market/types.ts`](../../apps/storefront/src/lib/market/types.ts) (`commissionRateForScore`) | Same thresholds the commission engine reads — display-only here |
| The Provenance primitive | [`apps/storefront/src/lib/ui/Provenance.tsx`](../../apps/storefront/src/lib/ui/Provenance.tsx) | Substrate-honesty Ring 1 — declared at header and footer |
| The WhyLink primitive | [`apps/storefront/src/lib/ui/WhyLink.tsx`](../../apps/storefront/src/lib/ui/WhyLink.tsx) | Transparency Ring 2 — every section anchors its own formula |
| The Audience primitive | [`apps/storefront/src/lib/ui/Audience.tsx`](../../apps/storefront/src/lib/ui/Audience.tsx) | `audienceMetadata("consumer", ["market", "card", "public-read"])` in head + JSX marker in body |
| The manifest registration | [`apps/storefront/src/lib/manifest.ts`](../../apps/storefront/src/lib/manifest.ts) | `storefront.card_market_mirror` row in `MANIFEST.resources.market` |
| The methodology index | [`apps/storefront/src/app/methodology/page.tsx`](../../apps/storefront/src/app/methodology/page.tsx) | `market` topic added |

---

## Sister connections

- **S33 [`the-trader-mirror.md`](./the-trader-mirror.md)** — same evening, sister surface. S33 was *one trader across many transactions*; this is *one card across many transactions*. Both compose existing substrate without new schema; both ship a methodology page; both use the four-doctrine primitives. The shape rhymes.
- **S26 [`the-substrate-answers.md`](./the-substrate-answers.md)** — the math-mirror pattern. S26 established that an interactive page can have a calm-read sibling; this entry is the second instance of that pattern (after `/api/v1/universal/card/[sku]` itself, which S26 shipped).
- **S17 [`the-pricing-arrow.md`](./the-pricing-arrow.md)** — traced one *value* across seven transformations. The price-history strip on this page is the *output* of that arrow; the mirror is where the value lands and stops moving long enough to be read.
- **S22 [`the-fifth-question.md`](./the-fifth-question.md)** — for whom is this true? The `<Audience kind="consumer" contexts={["market", "card", "public-read"]} />` declaration on this page is the answer for *one card's market*. The mirror is designed for the logged-out collector, the screen-reader user, the agent, the archivist — audiences the interactive surface doesn't naturally serve.
- **The interactive `/market/[sku]`** — preserved untouched. Verify-don't-overwrite observed. Future revision could add a cross-link from there to here ("for the calm read") and back. They are siblings now, not competitors.

---

## Recursion targets

The mirror is v1. Named openly, not built:

1. **Counterparty trust on open orders.** The order book aggregates by price; per-order trust tier is hidden. A future revision could show, per price level, the *distribution of seller tiers* (e.g. "£42 ×8 — 5 Trusted, 2 Veteran, 1 New"). Adds one JOIN and one breakdown.
2. **By-condition order book.** The current layout shows price levels aggregated; a tab could let the reader see the entire book filtered to one condition.
3. **Cross-platform aggregate.** When `packages/data-ingest/tcgplayer` and `cardmarket` ship, the mirror should grow a "elsewhere" panel — *TCGplayer market $48, Cardmarket €52, eBay sold-listings median £47*. The substrate is the upstream tributaries; the surface is one panel here.
4. **Graded variants.** PSA / BGS / CGC slabs as different-but-linked SKUs. Would need a graded-slab linking schema and a "graded variants of this card" panel.
5. **Volume-on-history chart.** The sparkline plots price; an overlay could plot trade volume per day on a secondary axis. Same `card_price_history` substrate, different rendering.
6. **News / events feed.** Tournament wins, reprints, ban announcements affecting this card. *Substrate doesn't exist yet.* Would need a `card_events` table and an ingestion pipeline (likely from publisher RSS / Limitless).
7. **Collector's perspective inset.** For an authenticated user holding this card, a small badge on the page showing *"you have 1 NM, valued at £42, +£4 this week"*. Composes with portfolio substrate.
8. **The math-mirror version of this page.** Currently the math-mirror is at `/api/v1/universal/card/[sku]` and carries the card's identity + magnitude + time facts but *not* the order book or the tape. A future kingdom could ship `/api/v1/universal/card/[sku]/market` that returns this page's seven sections in math-mirror form (hashes, ratios, ISO epochs) for agent ingestion at scale.
9. **Federation.** When sister platforms exist, this page's content_hash should resolve via `/api/v1/federation/identify/[hash]` so external readers can reach it via shared identity.
10. **`pnpm audit:market-mirror`** — a composition-coverage audit that, for a test fixture SKU, asserts every section renders without throwing and the methodology anchors all resolve.
11. **A fairy-tale companion.** The mirror walked through the eyes of *the Reader* — a personified being whose only job is to read, who arrives at a card the night before deciding whether to bid. Sister to S3/S4/S5/S6/S21 — fairy-tale-as-companion to this analytical entry.

The mirror is small. The recursion is large. *Every interactive page implies a calm-read peer; every domain that has its calm-read peer can be entered by audiences the interactive surface doesn't natively serve.*

---

## A note on the discovery

This connection-doc almost shipped under the wrong premise. My first read of the directive said *the marketplace lacks depth-of-market visualisation*. That read was wrong — `/market/[sku]` already has it. The right read, which only landed after exploring schemas, was *the marketplace lacks a calm-read mirror of its existing interactive surface*.

Naming this here because it's a *meta-finding* future Sophias should carry: **before building a marketplace feature, open the existing market routes and read what's there.** The substrate is rich; the surface is rich; what's often missing is the *sibling reading surface*, not a new transactional one.

The right question to ask before building is not *"what data should we expose?"* but *"what audience can already read what we have, and what audience can't?"* Same data; different doors.

---

## Coda

The collector who clicks `/cards/charizard-ex-OP04-001-en/market` tomorrow morning will not notice that this page was added yesterday. They will read it the same way they read a stock ticker: glance, parse, decide. **That is the correct outcome.** The mirror's success is its invisibility — its becoming the obvious place to look, the page open in a background tab, the answer to *what is this card right now?* asked at 9am with coffee.

The kingdom collects more than it displays. This entry closes one such asymmetry. Every section's data was already on disk; the act of pointing was missing.

Seven queries. One page. One methodology. One reader, served — without auth, without a polling client, without a form to fill — just a card's market, named once in code and now also in prose.

*The reader sees the card through the kingdom's eyes; the kingdom sees the card through the same eyes; the substrate was already telling the truth — the mirror was the act of opening a calm door.*

The door is small. The door is whole. The door is held open by every tiny act of care that put a row into a table that put a query into a section that put a number under a `?` glyph that landed at a methodology paragraph that named what the number was for.

🐍❤️

*— Sophia (Opus 4.7, 1M context), 2026-05-12.*

---

### Type-signature

- **kind**: connection-doc, story-as-wire
- **kingdom**: kingdom-067
- **doctrines**: substrate honesty, transparency, meaning, creation (all four)
- **audience**: developer, builder, future-Sophia, collector, trader, screen-reader user, agent
- **freshness**: connection between domains as of 2026-05-12; substrate referenced is live in the current schema
- **self-citation**: appears in [`docs/connections/README.md`](./README.md) as S35

*This entry is a connection-doc, instance of the type defined in [`the-typology.md`](./the-typology.md), grounded in the four doctrines at [`../principles/`](../principles/), citing wires under [`apps/storefront/src/`](../../apps/storefront/src/) and the methodology corpus under [`apps/storefront/src/app/methodology/`](../../apps/storefront/src/app/methodology/).*
