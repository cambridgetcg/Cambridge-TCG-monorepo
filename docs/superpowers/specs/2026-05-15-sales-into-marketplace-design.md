# Sales-into-marketplace refounding — design

**Date:** 2026-05-15
**Author:** Yu + Sophia (Opus 4.7 1M)
**Status:** design / awaiting approval before plan
**Related:** kingdom-067 (the market mirror, S35), kingdom-063 (the trader mirror, S33), kingdom-049 (pricing consolidation)
**Slug:** kingdom-094 / kingdom-095 / kingdom-096 (one per phase, to be assigned by `pnpm missions:claim`)

---

## Problem

The platform was built in two shapes that have grown into each other awkwardly:

1. **A B2C ecommerce storefront** — `/cards/[sku]` renders a single retail product page with a Buy CTA, `/cart` and `/checkout/*` handle a fixed-price retail flow, `customer_orders` records the writes. The shape says: *the platform is a shop.*
2. **A P2P marketplace** — `apps/storefront/src/lib/market/` (27 files, 7+ phases shipped) runs a two-sided order book with escrow, offers, returns, lots, trader dashboards. The CTCG operator already participates as a market maker via synthetic injection in `unified.ts` — but the participation is *unattributed*. Buyers hit the house without knowing.

The two shapes coexist on `cambridgetcg.com` and confuse each other. The retail shape suggests the platform sells; the marketplace shape suggests the platform makes a market. The synthetic-injection pattern in `unified.ts` is the load-bearing piece of evidence that the second shape is the truer one — the platform is already market-making, just not legibly.

This spec abandons the retail shape. The marketplace becomes the foundation. CTCG becomes a legible market maker by participating in its own market — keeping the synthetic-injection mechanism but attributing it honestly, badging it, and routing all card-shaped traffic through one canonical surface at `/cards/[sku]`. The retail flow is deleted.

**This is a refounding, not a migration.** The end state is the new foundation; the work is to lay it cleanly.

> *"We become the market maker by participating in the market."* — Yu, 2026-05-15

---

## Decisions locked

| Axis | Decision | Why |
|------|----------|-----|
| Cut line | Retire retail B2C flow only | Wholesale, tradein, auctions, marketplace all survive — they are not the retail shape |
| Seller model | Evolved synthetic injection | CTCG inventory stays in `wholesale.cards`; `unified.ts` keeps projecting; no materialized seller account, no new schema; lower blast radius, faster ship |
| Card URL strategy | `/cards/[sku]` becomes the marketplace card page | Canonical short URL is reused; image + listings + sections live in one surface; `/cards/[sku]/market` folds in; `/market/[sku]` remains the explicit place-order subroute |
| Rollout | Phased — three kingdom commits | Matches the codebase's "one kingdom one ship" rhythm; each phase ships independently with its own connection-doc; `pnpm verify` green at every boundary |
| SEO / continuity | Don't optimize | This is a rebuild — the platform's new foundation is the priority, not the preservation of the old one. No 301 rituals. No GSC monitoring windows. JSON-LD is shipped in the new shape because it's correct, not because it's a transition. |
| CTCG-Official commission | 0% to itself | Internal accounting; house orders pay no platform fee since the platform fee is the platform's own margin. Documented explicitly in `/methodology/official-seller`. |
| `customer_orders` table | Kept, read-only | Historical record preserved for `/account/orders` archive view. Writers deleted. Wears `<Provenance kind="snapshot" />` + `<Memorial>` on the archive header. |
| Auctions, tradein, B2B wholesale | Untouched | Out of scope of this refounding. The pivot is retail → marketplace; everything else continues. |

---

## End state in one picture

```
BEFORE                                       AFTER
──────                                       ─────
cambridgetcg.com                             cambridgetcg.com
├── /                  retail homepage       ├── /                  marketplace browse + featured
├── /cards/[sku]       retail product page   ├── /cards/[sku]       MARKETPLACE CARD PAGE
│                       (image + Buy CTA)    │                       ├── image header
├── /cards/[sku]/market  calm-read mirror    │                       ├── card meta + provenance
│                       (7 sections)         │                       ├── listings table (sort/filter)
├── /market/[sku]       interactive book     │                       │   CTCG (Official) pinned top
├── /cart               retail cart          │                       │   P2P sellers below
├── /checkout/*         retail checkout      │                       └── 7 sections as bands
├── customer_orders     retail order writes  ├── /market/[sku]       place-order subroute
                                             ├── customer_orders     read-only (historical)

apps/storefront/src/lib/                     apps/storefront/src/lib/
├── cart/, checkout/   retail state          ├── market/
├── cards/ retail UI primitives              │   ├── ui/  ← lifted primitives
│   image + sort + format + price wire       │   │   (CardImage, SortControl, ConditionFilter,
                                             │   │    SellerFilter, PriceCell, ListingRow,
                                             │   │    ListingsTable)
├── market/                                  │   ├── unified.ts ← tightened
│   unified.ts (unattributed injection)      │   │   (attribution + provenance + badge metadata)
                                             │   └── …existing files unchanged
                                             └── ui/ ← cross-cutting primitives
                                                  └── SellerBadge.tsx (new — Phase A)
```

**End-state invariants:**

- `/cards/[sku]` is the canonical card URL — image + listings + sections.
- `unified.ts` remains the *only* path by which CTCG inventory appears in the book. No materialized seller-orders, no DB-side sync, no double source of truth.
- `customer_orders` table survives but is **read-only** (writes deleted, reads only for `/account/orders` historical view).
- Each phase ships independently and `pnpm verify` is green at each boundary.
- A new audit `pnpm audit:retail-shape` prevents the retail shape from sneaking back.

---

## Phase A — Tighten the synthetic seller

**Goal:** make CTCG legible as a marketplace participant before any user-visible URL change. Smallest blast radius, biggest doctrinal payoff (the synthetic projection finally tells the truth about itself).

### Files touched

| File | Change |
|------|--------|
| `apps/storefront/src/lib/market/types.ts` | Add `attribution: "ctcg-official" \| "p2p"` to `OrderBookEntry` and any unified-book carrier types. Carries through to display. |
| `apps/storefront/src/lib/market/unified.ts` | When injecting house orders, set `attribution = "ctcg-official"` and attach `_provenance` (`kind: "synced"`, `source_table: "wholesale.cards"`, `as_of`, `retrieved_at`, freshness budget from `@cambridge-tcg/data-spec`). Already pure-compute — no schema impact. |
| `apps/storefront/src/lib/ui/SellerBadge.tsx` | **New primitive.** Two modes: `<SellerBadge kind="ctcg-official" />` renders the badge + `<Provenance>` + `<WhyLink href="/methodology/official-seller" />`; `<SellerBadge kind="p2p" userId={…} trustScore={…} />` renders the trust-tier badge currently shown. Mirror to admin's `@/lib/ui` since it cross-surfaces. |
| `apps/storefront/src/app/cards/[sku]/market/page.tsx` | Replace ad-hoc seller display with `<SellerBadge />`. (Phase A still uses this surface; Phase B folds it in.) |
| `apps/storefront/src/app/market/[sku]/page.tsx` | Same. |
| `docs/methodology/official-seller.md` | Canonical text: what CTCG (Official) means, the provenance chain, commission model (0% for house orders), how buyer protection works (CTCG warehouses ship direct, no escrow needed for CTCG-side fulfillment), fifth-question scope (this attribution applies to the CTCG operator entity, distinct from CTCG-the-platform-builder), and the load-bearing sentence: *liquidity is the product; participation is what makes price discovery possible on thin-volume cards; by being legibly present on both sides of the book, the platform's spread becomes a public commitment and the platform's profit becomes auditable.* |
| `apps/storefront/src/app/methodology/official-seller/page.tsx` | The public page. Linked from every `SellerBadge kind="ctcg-official"` via WhyLink. |
| `apps/storefront/src/lib/manifest.ts` | Register `methodology.topics` entry for `official-seller`. |
| `docs/connections/the-official-seller.md` | Story-as-wire entry (S38 or next slot). Names the bridge: `wholesale.cards → Falcon → unified.ts → SellerBadge`. Cites file:line. |
| `docs/missions/kingdom-NNN.md` | Mission card. Will trace lands in the kingdom slug. |

### Schema impact

**None.** No new tables, no new columns. The `attribution` field exists only in the typed in-memory shape returned by `unified.ts`, never persisted.

### Doctrines

- **Substrate honesty**: ✅ — synthetic asks now wear `<Provenance kind="synced" />`; P2P asks wear `<Provenance kind="live" />`. The two are distinguishable in the UI.
- **Transparency**: ✅ — `<WhyLink href="/methodology/official-seller" />` on every CTCG-badge instance. Methodology page documents the full mechanism.
- **Meaning**: ✅ — `the-official-seller.md` connection-doc, story-as-wire form (code + story in one commit).
- **Creation**: Will trace = `kingdom-NNN`, Sophia trace in commit trailer, the diff itself.
- **Fifth question**: surfaces the Actor distinction (CTCG-operator entity ≠ P2P-seller-individual). The methodology page names the asymmetry explicitly.

### Verification

- `pnpm typecheck` clean.
- `pnpm audit:honesty` — synthetic asks no longer naked (they wear Provenance).
- `pnpm audit:transparency` — methodology page reachable, WhyLink wired.
- `pnpm audit:creation` — commit trailer carries Will + Sophia traces.
- `pnpm audit:nesting` — new connection-doc has frontmatter, no orphans.
- New Playwright spec `apps/storefront/tests/official-seller-badge.spec.ts` — visit `/cards/[sku]/market` for a SKU with CTCG inventory, assert badge renders + WhyLink href is correct.

### Pre-existing concern surfaced (not fixed in Phase A)

When a CTCG-Official ask is *taken* via the place-order flow on `/market/[sku]`, today's code assumes a real `user_id` on the maker side. Synthetic asks have none. Phase A surfaces this concern via the badge but does not resolve it. Phase B forces the decision (see Phase B "Place-order CTA wiring" below).

### Estimated effort

Half a day. ~150 LOC + ~600 lines of prose (methodology + connection-doc + mission card).

---

## Phase B — Reshape `/cards/[sku]` as the marketplace card page

**Goal:** the canonical short URL becomes the front door for any card-shaped intent (browse, study price history, take a listing, make an offer, place a bid). Retail UI primitives get lifted into the market subdomain. The kingdom-067 mirror folds in.

### New directory: `apps/storefront/src/lib/market/ui/`

| File | What it is |
|------|------------|
| `CardImage.tsx` | Card art display. Hi-res, lazy, mobile-responsive. Wears `<Provenance kind="synced" source="scryfall_images" />`. |
| `SortControl.tsx` | Sort listings: price asc (default), price desc, condition (NM→HP), seller trust (Elite→New), quantity, recency. `<WhyLink href="/methodology/marketplace#sort" />`. |
| `ConditionFilter.tsx` | Cumulative filter: NM only / LP+ / MP+ / any. |
| `SellerFilter.tsx` | CTCG (Official) only / P2P only / both (default). |
| `PriceCell.tsx` | Composes `formatPrice` + `<Provenance />`. Branch is load-bearing: `live` for P2P, `synced` for CTCG-Official. |
| `ListingRow.tsx` | One row: `<SellerBadge>` + condition + quantity + `<PriceCell>` + CTA. CTA: `Buy` if direct-take permitted, `Make Offer` if `allow_offers`, `View` for sub-quantity edges. |
| `ListingsTable.tsx` | The composition: header + sort + filter pills + body. CTCG (Official) row pinned to the top of each condition band. |
| `index.ts` | Re-exports. |

**Rebuild stance:** these primitives are *rewritten cleanly* in `lib/market/ui/`, not relocated from the retail flow. The retail flow's tangled equivalents are deleted in Phase C without preservation.

### Reshape: `apps/storefront/src/app/cards/[sku]/page.tsx`

Page composition (top to bottom):

```
[Header band]                  CardImage  |  Name · Set · Rarity · Type · TypeSignature
                                          |  PriceCell (CTCG ask) — Provenance synced
                                          |  Spot price + Floor + Ceiling (last 30d)

[Stats band]                   VWAP (24h) · Median (7d) · Fill rate · Recent volume
                               (each wears Provenance computed + WhyLink → /methodology/market)

[Listings band] ★ THE TABLE    SortControl · ConditionFilter · SellerFilter
                               ──────────────────────────────────────────────
                               ListingRow × N (CTCG-Official pinned per condition band)

[History band]                 Price history sparkline 24h/7d/30d/90d
                               (the kingdom-067 mirror's price_history section, ported)

[Tape band]                    Last 20 trades, anon, trust tiers visible
                               (the kingdom-067 mirror's tape section, ported)

[Conditions band]              Breakdown of available stock per condition NM/LP/MP/HP

[Participants band]            Anon counts: how many bidders / askers active
```

The page calls the existing `loadCardMarket(sku)` composer in `apps/storefront/src/lib/market/card-market.ts` — that function continues to return the 7-section shape; the page consumes it differently.

### Folding the mirror

`/cards/[sku]/market` is **deleted** (not redirected — rebuild stance). The Phase B mission card explicitly names the deletion so the connection-doc S35 (`the-market-mirror.md`) gets updated to point at the new home of those seven sections.

### Place-order CTA wiring

Per `ListingRow` CTA navigates to:
- `/market/[sku]?action=take&order_id=<id>` for P2P listings (existing place-order shape, unchanged).
- `/market/[sku]?action=take&seller=ctcg-official&condition=<x>&qty=<y>` for CTCG-Official listings (new shape).

**Decision forced here (Phase A's surfaced concern):** how does `/market/[sku]` handle the CTCG-Official synthetic-take? Two valid options:

| Option | Mechanism | Tradeoff |
|--------|-----------|----------|
| **(i) Materialize-at-take** | At take time, insert a real `market_orders` row owned by a CTCG service-user, then immediately match against it. Audit trail in `market_orders` looks identical to P2P. | Requires a CTCG service-user `users` row to exist (small migration). Cleanest audit. |
| **(ii) Direct-fulfillment branch** | The place-order route detects CTCG-Official takes and routes through a separate fulfillment path: no `market_orders` row, write directly to `market_trades` with a sentinel `seller_id`. | No service-user needed. Audit trail diverges from P2P. Requires bespoke fulfillment logic. |

**Spec defers** this decision to writing-plans (the plan can inspect today's place-order code and pick the option that fits the existing flow with least surgery). Both are valid; both preserve the synthetic-injection invariant on the *read* side.

### Files touched (rough)

- `apps/storefront/src/app/cards/[sku]/page.tsx` — full rewrite (~400–500 LOC)
- `apps/storefront/src/lib/market/ui/*` — ~200–400 LOC across 8 files (clean rewrites)
- `apps/storefront/src/app/cards/[sku]/market/page.tsx` → deleted
- `apps/storefront/src/lib/market/card-market.ts` — unchanged unless new aggregates needed
- `apps/storefront/src/app/market/[sku]/page.tsx` — gains CTCG-Official take branch (per the decision above)
- `apps/storefront/src/app/methodology/marketplace/page.tsx` — update to document sort/filter semantics, with anchors `#sort` and `#filter`
- `docs/methodology/marketplace.md` — same
- `docs/connections/the-card-page.md` — new connection-doc (S39 or next slot); story-as-wire
- `docs/connections/the-market-mirror.md` — updated to note the mirror has folded in; the seven sections now live as bands on `/cards/[sku]`
- `apps/storefront/src/lib/manifest.ts` — update `/cards/[sku]` entry; remove `/cards/[sku]/market`
- `apps/storefront/src/app/api/v1/status/route.ts` — adjust `ENVELOPE_COMPLIANT_PATHS` if needed
- `docs/missions/kingdom-NNN.md` — Phase B mission card

### Doctrines

- **Substrate honesty**: every price cell wears Provenance. CTCG-Official asks: `synced`. P2P asks: `live`. Stats (VWAP, median, fill rate): `computed`. Image: `synced` from scryfall.
- **Transparency**: SortControl, ConditionFilter, SellerFilter each WhyLink to `/methodology/marketplace` anchors. Per-listing trust tier WhyLinks to `/methodology/trust`. CTCG-Official badge WhyLinks to Phase A's `/methodology/official-seller`.
- **Meaning**: `the-card-page.md` connection-doc names the merge: clean rewrite of UI primitives + kingdom-067 mirror folded in + Phase A badge → one page, one URL, one front door.
- **Creation**: Will/Sophia/diff.
- **Fifth question**: SellerFilter offers `CTCG only` / `P2P only` / `both` — explicit choice rather than implicit default. The methodology page names *for whom* the listings table is rendered (synchronous buyer; the asynchronous-buyer path through Make Offer is named separately).

### Verification

- `pnpm typecheck` clean.
- `pnpm audit` — all six audits green.
- `pnpm audit:nesting` — new connection-doc has frontmatter, no orphan citations. `the-market-mirror.md` update doesn't leave dangling references.
- New Playwright spec `apps/storefront/tests/card-page.spec.ts`:
  - Image renders.
  - Listings table renders with at least one row.
  - Sort reorders rows.
  - Condition filter narrows results.
  - Seller filter narrows results.
  - Click "Buy" on a P2P listing navigates to `/market/[sku]?action=take&order_id=...`.
  - Click "Buy" on a CTCG-Official listing navigates to `/market/[sku]?action=take&seller=ctcg-official&...`.
  - GET old `/cards/[sku]/market` → 404 (no redirect — rebuild stance).
- New vitest unit tests for SortControl + ConditionFilter + SellerFilter (pure-compute branches).
- Manual: load a SKU with no listings (empty state), a SKU with only CTCG asks (P2P-empty), a SKU with deep book (sort works at scale).

### Estimated effort

1–2 focused days. The hard parts are the listings-table merge logic (synthetic CTCG asks + P2P asks) and the place-order CTCG-Official branch decision.

---

## Phase C — Retire retail, lay the new foundation

**Goal:** the storefront's retail shape disappears. What remains is the marketplace + tradein + auctions + the historical-orders archive. Homepage, header, nav are rebuilt as marketplace-shape. An audit prevents the retail shape from sneaking back.

### Deleted

| Path | Why |
|------|-----|
| `apps/storefront/src/app/cart/**` | Retail cart route tree. |
| `apps/storefront/src/app/checkout/**` | Retail checkout route tree. |
| `apps/storefront/src/lib/cart/**` | Cart state, providers, hooks. |
| `apps/storefront/src/lib/checkout/**` (if exists) | Retail checkout logic. |
| Retail Stripe checkout code in `apps/storefront/src/lib/stripe/` | Surgical: retail-specific session creation. Marketplace/auction/tradein/B2B Stripe paths intact. |
| `apps/storefront/src/lib/orders/record.ts` retail writer (`recordOrderFromStripeSession()`) | Function disappears. Webhook handler drops the retail branch. |
| Retail email templates in `apps/storefront/src/lib/email/templates/` (retail order confirmation, retail shipping) | Marketplace templates remain. |
| "Add to cart" CTAs anywhere they survive on non-retail pages | Mechanical sweep — audit catches what's missed. |

### Kept, made read-only

| Path | Why |
|------|-----|
| `customer_orders` table | Historical record. Legal/customer-service requirement. No new writes. |
| `apps/storefront/src/app/account/orders/page.tsx` | Renders historical retail orders with `<Provenance kind="snapshot" />` + `<Memorial>` primitive on the page header — *"This account's retail orders archive; this surface no longer accepts new orders."* |

### Rebuilt

| Path | Shape |
|------|-------|
| `apps/storefront/src/app/page.tsx` | Marketplace homepage. Above the fold: hero + featured CTCG (Official) listings + recent tape. Below: trending cards (highest volume 24h), recently-added singles, set browser entry. Not a "transition" page — this is the homepage. |
| `apps/storefront/src/app/layout.tsx` | Strip retail header/footer; install marketplace shell. |
| `apps/storefront/src/components/Header.tsx` (or equivalent) | Marketplace nav: **Browse · Sellers · Sell · Account**. No cart icon. |
| Footer | Marketplace links: Methodology · Transparency · Official seller · Trust · Connections · About. Strip retail links. |

### New audit: `pnpm audit:retail-shape`

**File:** `apps/admin/scripts/audit-retail-shape.ts` (or `apps/storefront/scripts/`; pick whichever co-locates better with the audit family).

**What it catches:**
- Any `import` from `@/lib/cart`, `@/lib/checkout`, `@/app/cart`, `@/app/checkout` paths.
- String literals `"Add to cart"`, `"Proceed to checkout"`, `"Your cart"` in storefront source.
- Retail Stripe session creation patterns (`createCheckoutSession(... mode: 'payment'...)` with retail-shape line items — detected via heuristic on call sites).
- New route files under `apps/storefront/src/app/cart/` or `apps/storefront/src/app/checkout/`.

**Registered as:** `audit:retail-shape` in root `package.json`; chained into `pnpm audit`; surfaced in `docs/state.md` audit findings table.

**Exit codes:** standard `0` / `1` / `2` per audit family convention.

### Methodology + connection-doc

| File | Content |
|------|---------|
| `docs/methodology/pivot.md` + `apps/storefront/src/app/methodology/pivot/page.tsx` | Canonical public text of the refounding. What changed (retail → marketplace), why (CTCG becomes legibly a market maker by participating), what's preserved (marketplace, tradein, auctions, wholesale), what's gone (retail), what the methodology page itself signals (the kingdom can declare its own pivots in public). Fifth-question paragraph: this rebuild is *inclusive* of one being (the market participant — trader, market maker, seller) and *exclusive* of another (the casual fixed-price retail buyer). Name that asymmetry honestly. |
| `docs/connections/the-new-foundation.md` (S40 or next slot) | Story-as-wire. Cites the three commits (Phases A, B, C) by hash. Names the cosmology shift: from retail-storefront cosmology to marketplace-platform cosmology. Carries the *"we become the market maker by participating in the market"* line as the load-bearing sentence. References how each of the four doctrines is honored differently by the new foundation. |
| `docs/missions/kingdom-NNN.md` | Phase C mission card. |

### Doctrines

- **Substrate honesty**: historical-orders view wears `<Provenance kind="snapshot" />` + `<Memorial>` on the page header.
- **Transparency**: `/methodology/pivot` is the public explanation. Linked from homepage footer + historical-orders archive + connection-doc.
- **Meaning**: `the-new-foundation.md` names what the modules now mean to each other under the new foundation.
- **Creation**: each phase's commit carries Will (`kingdom-NNN` slug) + Sophia (`Co-Authored-By: Claude Opus 4.7 (1M context)`) + the diff. Phase C commit message names *"the rebuild"* explicitly. The connection-doc names the syzygy of the three commits as one refounding act.
- **Fifth question**: methodology page names *for whom* the new foundation is true (market participants) and *for whom* it is no longer (casual retail buyers who liked one-click fixed-price flows). The asymmetry is not hidden.
- **Cosmology**: cosmology axes don't change, but the platform's *position* on the value axis shifts: from "platform sells inventory at retail prices" → "platform makes a market in which inventory trades at price-discovered values." Optional update to `docs/principles/cosmology.md` if desired.

### Verification

- `pnpm typecheck` clean.
- `pnpm audit` (all six existing + new `audit:retail-shape`) green.
- New Playwright spec `apps/storefront/tests/post-pivot.spec.ts`:
  - `GET /cart` → 404
  - `GET /checkout` → 404
  - `GET /` → marketplace homepage (assert no `"Add to cart"` string in DOM, assert marketplace nav present, assert featured listings render)
  - `GET /account/orders` → historical orders render with snapshot Provenance pill + Memorial header
- `pnpm smoke` (admin filesystem-discovered route smoke) passes for unchanged admin surfaces.
- Manual: mobile + desktop walk-through. Open homepage, click into a card, click a CTCG-Official listing's Buy CTA, land on `/market/[sku]` with the synthetic-take payload, complete a test purchase end-to-end.

### Estimated effort

1 focused day. Deletion + homepage rebuild + audit + connection-doc + methodology prose.

### Sequencing note

Phase C should ship *after* Phase B is verified — not for SEO (rebuild stance) but because Phase C's new homepage links into Phase B's reshaped `/cards/[sku]`. Order is A → B → C. Gap between B and C can be hours, not days.

---

## The triptych

The three connection-docs form a triptych:

1. `the-official-seller.md` (Phase A) — names CTCG as a market maker.
2. `the-card-page.md` (Phase B) — names the new front door.
3. `the-new-foundation.md` (Phase C) — names the refounding.

Story-as-wire form throughout: each ships in the same commit as the code it describes. The third doc is the umbrella; no separate meta-overview is needed.

---

## Doctrines audit — the whole pivot

| Doctrine | Phase A | Phase B | Phase C |
|----------|---------|---------|---------|
| Substrate honesty | Synthetic asks wear `synced` Provenance | Every price cell wears Provenance (live/synced/computed); stats wear `computed` | Historical orders wear `snapshot` Provenance + `<Memorial>` |
| Transparency | `<WhyLink>` to `/methodology/official-seller` on every badge | WhyLinks on sort/filter/trust/escrow/commission | `/methodology/pivot` linked from footer + archive + connection-doc |
| Meaning | `the-official-seller.md` | `the-card-page.md` + `the-market-mirror.md` updated | `the-new-foundation.md` umbrella |
| Creation | Will (kingdom-NNN) + Sophia (Co-Authored-By) + diff | Same | Same; Phase C commit names *"the rebuild"* |
| Fifth question | Actor distinction (CTCG-operator vs P2P-individual) named | SellerFilter as explicit choice; sync/async surfaces named | Inclusion asymmetry (market participants in, casual retail out) named honestly |

---

## Out of scope

This refounding does **not** touch:

- **Auctions module** (`apps/storefront/src/lib/auction/`) — separate lifecycle, separate escrow, untouched. Future kingdom can fold auction listings into the `/cards/[sku]` page as a tab; not now.
- **Tradein / bounty** (`apps/storefront/src/lib/tradein/`) — buy-from-users flow, untouched. Still feeds CTCG inventory; still uses tradein-cash / tradein-credit channels in `@cambridge-tcg/pricing`.
- **Wholesale B2B** (`apps/wholesale/`) — still its own app, still partner-facing, still owns the `cards` table that feeds `unified.ts` via Falcon. The `wholesale.cards` → `unified.ts` → marketplace seller-ask path stays exactly as today.
- **Shopify / eBay sync** — secondary channels, untouched. CTCG inventory still flows out through them. Future kingdom can decide whether to retire these channels in favour of marketplace-only outflow; not now.
- **Admin chapels** for `/commerce/market`, `/commerce/trade-ins`, `/commerce/auctions`, `/ops/orders`, `/ops/stock` — these are retrofit targets in `docs/admin-migration-punchlist.md`. The pivot may shift their content (e.g., the `/commerce/market` chapel will want a new section for CTCG-Official badge management), but reshaping the admin pages is a separate kingdom.
- **Methodology / market** — Phase B updates this page's sort/filter section; the rest stays.
- **Search, set-browser, catalog browse** — surfaced briefly in Phase C's homepage rebuild but not deeply reshaped. Future kingdom can rebuild a marketplace-shape search experience.

---

## Open questions for execution time

These are deliberately deferred to writing-plans / implementation — they're discovery work, not decisions:

1. **Lift sources for UI primitives.** Phase B writes `lib/market/ui/CardImage.tsx` etc. cleanly. The plan needs to inspect the existing retail-flow primitives to extract their *intent* (props, accessibility, responsive behaviour) without inheriting their tangles.
2. **Place-order CTCG-Official branch** — option (i) materialize-at-take vs option (ii) direct-fulfillment-branch. Decide after reading today's `/market/[sku]` place-order code and `apps/storefront/src/lib/market/db.ts:matchOrders()` transaction shape.
3. **CTCG service user**, if option (i) is chosen. What `users` row? What `role`? Any trust profile? Where is its identity managed?
4. **Stripe webhook surgery** in Phase C. Identify the retail branch precisely; ensure marketplace/auction/tradein branches are untouched.
5. **Audit threshold for `audit:retail-shape`.** The plan should decide whether to fail on partial matches (e.g., `"Add to cart"` substring inside a methodology page's prose discussing retail history is fine; same string in a button label is not). Allowlist file paths if needed.
6. **Manifest update** in Phase B. The `/cards/[sku]` entry in `apps/storefront/src/lib/manifest.ts` already exists; its description/cosmology axes/methodology grounding all change. The plan touches this carefully.
7. **`audit:nesting` updates** as connection-docs land. The citation graph picks up the three new docs; verify no orphans, no one-way leaves.
8. **JSON-LD `Product` + `AggregateOffer`** for `/cards/[sku]`. Ship in Phase B as the *correct* shape for a marketplace card page (multiple offers per product). Not as an SEO accelerator — as the truthful structured-data shape for the new foundation.
9. **`/api/cron/reconcile-stripe` retail branch.** The cron reconciles Stripe sessions against `customer_orders`. After Phase C, no new retail writes occur; the cron's retail branch becomes dead code. Plan inspects today's reconcile logic and either deletes the retail branch or scopes it to historical sessions only.
10. **In-flight retail orders at Phase C ship time.** If retail orders exist in `customer_orders` with fulfillment not yet complete, the plan decides whether Phase C requires a drain period (wait for outstanding orders to ship) or whether existing fulfillment workflows (admin-driven, not retail-writer-driven) can complete after the writers are deleted. Most likely the latter, since fulfillment moves via admin actions on the order row — but verify before shipping Phase C.

---

## Verification gates

`pnpm verify` (the *am I done?* gate) is the universal check at every phase boundary. Specifically:

- **End of Phase A:** all existing audits green; new Playwright `official-seller-badge.spec.ts` passes; new connection-doc has frontmatter.
- **End of Phase B:** all audits green including new Playwright `card-page.spec.ts`; vitest unit tests for UI primitives pass; old `/cards/[sku]/market` returns 404.
- **End of Phase C:** all audits green + new `audit:retail-shape` green; `post-pivot.spec.ts` passes; `pnpm smoke` clean.

---

## Effort summary

| Phase | Estimated effort | Schema migration | New audit |
|-------|------------------|-------------------|-----------|
| A — Tighten synthetic seller | ½ day | None | None |
| B — Reshape `/cards/[sku]` | 1–2 days | None | None |
| C — Retire retail | 1 day | None | `audit:retail-shape` |

**Total:** ~3 focused days of work, three kingdom commits, three connection-docs, three methodology pages (one new in A, one updated in B, one new in C), one new audit. No schema migrations.

---

## The load-bearing sentence

> *"We become the market maker by participating in the market."*

This line carries into the methodology pages of all three phases and is the heart of `the-new-foundation.md`. The platform's market-making is not hidden behind a synthetic injection; it is named, badged, and made auditable by being visible.

The refounding is what makes that sentence true.
