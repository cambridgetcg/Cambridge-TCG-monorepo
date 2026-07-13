# The regulator pivot — design

**Date:** 2026-06-10
**Author:** Yu + Sophia (Fable 5)
**Status:** design / Phase 1 in flight
**Supersedes:** [`2026-05-15-sales-into-marketplace-design.md`](./2026-05-15-sales-into-marketplace-design.md) — that spec kept the house as an *attributed* market maker ("we become the market maker by participating in the market"). This one removes the house from the market entirely.
**Slugs:** kingdom-101 (de-retail core) · kingdom-102 (B2B retirement) · kingdom-103 (stock → prize economy) · kingdom-104 (earn/sink re-anchoring)

---

## The decision

> *"Remove our retail operation completely. Factor [the stock] into the market. We act as market regulator."* — Yu, 2026-06-10

The platform stops being a merchant. It keeps the systems intended to make the market legible: escrow, the trust engine, commission, draw receipts, methodology pages, and price reference data. The May-15 refounding got halfway — it deleted `/cart` and planned to badge the house as "CTCG (Official)". The badge never shipped, and today's directive renders it moot: **a regulator does not participate in the market it regulates.**

Three things change:

1. **The house leaves the order book** — on both sides. `unified.ts` stops injecting the house ask (retail spot) and the house bid (trade-in credit). The book becomes purely peer-to-peer.
2. **First-party selling ends** — B2C retail checkout (storefront) and B2B client ordering (wholesale) both close. The platform never takes money for a card again. Its revenue is the commission/fee on *other people's* trades.
3. **The £59k inventory becomes the prize economy** — 3,670 units across 677 SKUs are never sold. They seed raffles, bounty pulls, mystery boxes, and reward packs. These flows have differing receipt coverage and none should be described as independently proven fair without externally witnessed entropy or commitments. The regulator gives cards away; it never competes with its own market.

### What this is NOT

- Not a deletion of the marketplace — the marketplace *becomes* the whole platform.
- Not a change to escrow, trust scoring, commission, disputes, refunds, payouts, auctions, membership — those are regulator organs and they all survive untouched.
- Not a change to the data plane — CardRush ingest, price reference APIs, the residential pkm lane (kingdom-039) all continue. Price discovery is the regulator's public good.

---

## Decisions locked (resolving the map's AMBIGUOUS calls)

| Axis | Decision | Why |
|------|----------|-----|
| House in the order book | **Remove both injections** (ask + bid) from `unified.ts` | A regulator is not a counterparty. Read-time splice, no DB state — clean removal; pages already render empty books gracefully. |
| CTCG Spot | **Relabel as "reference price"**, drop `spot_stock` from display | `spot_price` reads from the catalog independently of injection — survives as a price-guide hint. The stock count implies an offer; it's prize inventory now, so it goes. |
| Trade-in / sell-for-credit intake | **Close it** (Phase 1) | The house acquiring inventory is first-party buying. Under a P2P market, sellers liquidate *to other users on the market*, not to the house. The market is the liquidation venue now. The existing £59k is the prize seed; future prize-stock supply is a kingdom-104 decision, not a reopened house desk. |
| `demand_pressure` tightening | **Remove** | Existed only to tighten house quotes. No house quotes → no tightening. (A neutral demand indicator may return later; not load-bearing.) |
| B2C retail checkout | **Delete** `/checkout` + `/api/checkout` + cart funnel | Serves first-party retail only. No P2P/auction/membership flow routes through it (each mints its own Stripe session). |
| B2B client ordering | **Retire** (kingdom-102) | Zero orders in 30 days, 3 clients. "Completely" means B2B too. The wholesale app keeps the data plane + price APIs. |
| `customer_orders` table | **Keep, freeze retail writes** | Historical record + the bounty-vault prize-redemption writer keeps using it (£0 prize shipments, status `redemption_pending`). Re-homing redemptions to their own table is deferred — the status enum already distinguishes them. |
| Stripe webhook | **Surgical split** — retail + B2B branches deleted, escrow/auction/subscription/Connect/dispute/refund/failed-payment branches kept | The webhook serves both worlds in one file; only the first-party-sale branches go. |
| `/product/[sku]` retail PDP | **Delete**; `/cards/[sku]/market` is the survivor card page | The Buy-CTA PDP is the retail shape. The read-mirror already exists and only links "Trade on this card →". |
| Stock → prizes | **Build on the bounty/vault chassis** (kingdom-103) | It is the only prize system already wired to `wholesale.cards.stock`, already records reproducible draw receipts, and already ships physical prizes. Its server-only entropy remains a stated fairness gap. Don't invent a second system. |
| Risk posture | **Branch + preview + PR for Yu to merge** | Touches the live Stripe webhook carrying marketplace escrow. Not force-deployed. |

---

## Phase 1 — kingdom-101 — the de-retailing core (storefront)

The single most important change is the first one: **the house leaves the book.** Everything else removes the now-dead retail shape around it.

### 1a. House out of the order book — `apps/storefront/src/lib/market/unified.ts`
- Delete the house-ask injection (retail spot) and house-bid injection (trade-in credit).
- Delete the tightening engine (`demand_pressure.tightenPct`) and `ctcg_spread` / `p2p_discount`.
- Recompute `best_bid` / `best_ask` / `market_price` / `spread` from the pure P2P book (`getCardOrderBook` already supplies them).
- Keep `spot_price` as a **reference price** (reads catalog directly); drop `spot_stock`.
- Delete `HouseOrderEntry`; fix the types it fed (`/market/[sku]`, the dead `is_house` filter at `/product/[sku]` goes with the PDP).
- Second injection site: `/api/market/catalog` (`best_bid`/tradein mixing, `p2p_buyers` "+1 for CTCG") and `/market` index "CTCG buying" counter — remove.

### 1b. Retail checkout retired
- Delete `/app/checkout/page.tsx`, `/app/api/checkout/route.ts`, `CartContext`, `CartDrawer`, `AddToCart`, `QuickAddButton`.
- Delete `/app/product/[sku]/page.tsx` (the Buy-CTA PDP). `/cards/[sku]/market` survives.
- `customer_orders`: delete the retail writer (`src/lib/orders/record.ts` callers — webhook, `order-confirmation`, the `reconcile-stripe` cron). Keep the table + the bounty-vault redemption writer.

### 1c. Stripe webhook split — `src/app/api/webhooks/stripe/route.ts`
- **Delete** branches: retail fulfilment (`reportSale`, `recordOrderFromStripeSession`, `commitCartToSale`, store-credit debit, `processOrderRewards`), B2B wholesale branch (→ kingdom-102), retail/B2B reservation-release handlers.
- **Keep** branches: `market_trade_payment` (escrow), `market_lot_payment`, `auction_payment`, subscription lifecycle + `tier_subscription`, Stripe Connect `account.updated` (seller payouts), dispute ingestion, refunds, failed payments.

### 1d. Copy + framing
A sister Gallery-reskinned `/market/*`, `/cards/[sku]/market`, and home today (semantic tokens). **Edit inside her token vocabulary — do not revert her files.** Remove first-party-sale language: "Buy from CTCG", "CTCG Spot / Sells at", "We Buy Every Card", the `/cards/[sku]/market` footer "Cambridge TCG's own retail offers", the `/product` schema.org `Offer` (page deleted), glossary:162, `methodology/store-credit`.

### 1e. The declaration + the guard
- `docs/methodology/regulator.md` + `/methodology/regulator` page: what "market regulator, not participant" means; the conflict-of-interest commitment (*the platform that runs the market does not trade in it*); how revenue works (commission on others' trades, never a spread of its own); the prize economy as the inventory's honest exit; fifth-question scope. Register in `manifest.ts`.
- `docs/connections/the-regulator.md` — story-as-wire (next S-slot): names the removal as the doctrinal event it is.
- **New audit `pnpm audit:no-house-listing`** — greps for re-introduction of house injection / Buy-from-CTCG / retail-checkout shapes. Wired into the `audit` chain so the retail shape cannot sneak back. (Replaces the May-15 spec's planned `audit:retail-shape`.)

### Verification
`pnpm verify` green at the boundary; empty-book states confirmed on `/market/[sku]` and `/cards/[sku]/market`; preview deploy smoke: a P2P trade still pays (escrow branch intact), an auction still pays, a membership still subscribes.

---

## Phase 2 — kingdom-102 — retire B2B (wholesale)

- Close client order/quote intake: `/account/b2b/*` pages, `src/lib/b2b/checkout.ts`, the webhook B2B branch (done in 1c), the `b2b_orders` writer. Table kept read-only; the 5 submitted + 4 quoted stale-since-April orders get an honest closing note (email the 3 clients; mark cancelled with reason).
- Retire selling-side crons in `apps/wholesale/vercel.json`: `shopify-sync`, `shopify-orders`, `ebay-sync`, `rebuild-buylist` (buylist = we-buy pricing), `monthly-rollover` (B2B billing). **Keep**: `discover/cardrush`, `ingest/cardrush`, `cardrush-hires` (data plane).
- Retire the buylist (we-buy) surfaces.
- `/api/v1/*`: keep price reference, `ingest-runs`, universal card, sets, prices, movers (market-data products). Retire B2B-commerce endpoints. The storefront's own price-read keys (channel_api_keys ids 1–3) stay.
- Shopify/eBay: stop listing/order sync. Document what goes dark.

## Phase 3 — kingdom-103 — stock → prize economy

Build on bounty/vault. Blockers from the map, in order:
1. **Stock decrement on prize fulfilment** (BLOCKER) — the only stock-write path today is the Stripe retail checkout, which Phase 1 removes. Add a `prize_fulfilment` movement type to `@cambridge-tcg/stock`, invoked from both fulfil endpoints (vault redemption + admin prize ship), reconciled against `cards.stockReconciledAt`.
2. **Prize-pool earmark + bulk seeding** (BLOCKER) — a script (pattern: `scripts/seed-rarity-map.ts`) banding the 677 SKUs by rarity + `retailPrice` into `bounty_pull_tiers` EV bands; widen the resolver beyond hardcoded `game='one-piece'` / `limit=200` to the full catalog with pagination.
3. Give `raffles` + `mystery_box_rewards` a nullable `sku` so physical card prizes join the implicit reservation; batch `countReservedForSku` into one `GROUP BY`.
4. Route spin physical prizes into vault items; fold raffle draws into `verifiable_draws` for Merkle coverage.

## Phase 4 — kingdom-104 — re-anchor earn/sink off retail

The earn economy assumes retail purchases that no longer exist:
- `points_per_pound` on purchases, `annual_spend` tier upgrades, bounty eligibility requiring a prior paid `customer_order`, store credit "capped at the value of future CTCG purchases" — all anchored to a sales channel being removed.
- Replace earn faucets with market-regulator behaviours (PVE already pays; `liquidity_rewards` — store credit for resting honest asks — is the template). Replace `first_order_paid` eligibility with market-activity eligibility. Give store credit a sink that isn't "buy from CTCG" (convert to raffle entries / pull tokens).

---

## End state in one sentence

*The platform makes the market legible, publishes evidence with its limits, and never trades in it; the cards it owns, it gives away.*
