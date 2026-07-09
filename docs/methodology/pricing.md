# Pricing methodology

Cambridge TCG sets a price for every card we stock and every channel we sell on. The same card has up to **seven different customer-facing prices** at any moment — one for our own storefront, one for Shopify, one for eBay, one for Cardmarket, one for trade-in cash, one for trade-in store credit — plus an internal **wholesale base** that the others derive from. This page explains exactly how each number is computed.

> **Where this lives in code.**
> - Pure-compute pricing engine: `packages/pricing/src/index.ts` (function `computePrice`).
> - Channel configurations table: `channel_pricing` on the wholesale RDS, edited via the admin Manager page.
> - Daily snapshot cron: `apps/wholesale/src/lib/price-snapshot.ts` (runs 02:00 UTC).
> - Mutation audit log: `card_price_change_log` on the wholesale RDS.
> - Connection narrative: [`docs/connections/the-pricing-arrow.md`](../connections/the-pricing-arrow.md) (S17).
>
> Last verified against code: **2026-05-11**.

---

## The two inputs

Every price starts from two numbers captured at the same moment:

- **`cardrush_jpy`** — the price the card is currently listed at on CardRush, in Japanese yen. Read once a day by the snapshot cron, then frozen for 24 hours.
- **`gbp_jpy_rate`** — the kingdom's view of the GBP/JPY exchange rate at the moment of capture. Stored alongside the JPY value so that *the rate used to compute today's prices is the rate as of when we wrote them*, not the rate at the moment you happen to be reading.

This pairing matters: a JPY price is meaningless to a pound-paying customer without a rate, and a rate becomes meaningless once it drifts from the JPY values it was paired with. We store them together; we treat them together.

From these two, we derive a third:

```
baseGbp = cardrush_jpy / gbp_jpy_rate
```

This is the **wholesale base** — what one copy of the card costs us before any margin, fee, VAT, or channel uplift. It is the same across all channels.

---

## The channel multipliers

Each channel has six small numbers that say how to translate the wholesale base into that channel's customer-facing price. They are stored in the `channel_pricing` table on the wholesale RDS, and edited by Cambridge TCG operators via an admin Manager page.

| Number | What it is | Example (cambridgetcg.com) |
|---|---|---|
| `marginMultiplier` | Our gross-margin uplift. 1.08 means 8% on top of the wholesale base. | 1.08 |
| `flatFeeSingles` | Per-card flat fee for single cards, in GBP. Covers handling. | £0.22 |
| `flatFeeSealed` | Per-product flat fee for sealed product (boxes, decks). | £2.20 |
| `vatMultiplier` | UK VAT multiplier. 1.20 means 20%. | 1.20 |
| `retailMultiplier` | Channel-specific retail uplift. eBay's fees are higher, so its multiplier is higher. | 1.15 |
| `roundTo` | Final rounding step (so prices look human). | £0.10 |

The full formula:

```
exVat    = (baseGbp × marginMultiplier + flatFee) × retailMultiplier
vat      = exVat × (vatMultiplier - 1)
preRound = exVat + vat
price    = round(preRound / roundTo) × roundTo
```

The `flatFee` is `flatFeeSingles` for single cards, `flatFeeSealed` for sealed product. The final `round` uses banker's-style nearest-rounding (JavaScript's `Math.round`); a preRound value of £5.14 with a `roundTo` of £0.10 yields £5.10, not £5.20.

---

## The eight channels

| Channel | Margin × | Flat singles | VAT × | Retail × | Round |
|---|---:|---:|---:|---:|---:|
| **wholesale** (B2B base) | 1.08 | £0.22 | 1.20 | 1.00 | £0.01 |
| **cambridgetcg.com** (Next.js) | 1.08 | £0.22 | 1.20 | 1.15 | £0.10 |
| **Shopify** (legacy storefront) | 1.08 | £0.22 | 1.20 | 1.15 | £0.10 |
| **eBay** | 1.08 | £0.22 | 1.20 | 1.25 | £0.10 |
| **Cardmarket** | 1.08 | £0.22 | 1.20 | 1.20 | £0.01 |
| **Trade-in (cash)** | 0.55 | £0 | 1.00 | 1.00 | £0.01 |
| **Trade-in (store credit)** | 0.77 | £0 | 1.00 | 1.00 | £0.01 |

The **trade-in channels** invert the margin: we pay 55% of the wholesale base for cash, 77% for store credit. They have no flat fee, no VAT (we are the buyer, not the seller), and no retail uplift.

The **retail channels** (cambridgetcg, Shopify, eBay, Cardmarket) all charge VAT — UK customers pay it; the platform remits it. The retail multiplier differs: eBay's is highest because eBay's seller fees are higher and we recover them via the price.

---

## Worked example

A ¥600 listing today (¥/£ rate = 185):

```
baseGbp = 600 / 185 = £3.24

cambridgetcg.com:
  exVat    = (3.24 × 1.08 + 0.22) × 1.15  = £4.28
  vat      = 4.28 × 0.20                  = £0.86
  preRound = 4.28 + 0.86                  = £5.14
  price    = round(5.14 / 0.10) × 0.10    = £5.10
```

The same listing on eBay produces £5.60; on trade-in cash, we pay £1.78 to take it off your hands; on trade-in store credit, £2.50.

These exact numbers are locked as regression tests in [`packages/pricing/src/__tests__/pricing.test.ts`](../../packages/pricing/src/__tests__/pricing.test.ts) — if the formula ever drifts, the test fires and this page must be updated in the same PR.

---

## Freshness

Prices are snapshot daily at 02:00 UTC. The catalog you see on a typical visit was true at the most recent snapshot. Every price surface on cambridgetcg.com displays a small label like *"synced from wholesale · 4h ago"* next to the price — this is the freshness pill, and it tells you exactly when the number you're looking at became true.

If the snapshot cron fails or hasn't run yet, the pill turns amber. If the wholesale source is unavailable entirely, the pill turns red and reads *"source unavailable"*. We do not show stale prices as if they were live.

---

## What changes a price

A card's price can change for four reasons:

1. **The daily snapshot found a new CardRush price.** Most common. The cron at 02:00 UTC scrapes CardRush, pairs it with the current exchange rate, runs the formula, and writes a new row to `cards`. Every change is appended to `card_price_change_log` with `action = "snapshot"`.
2. **An admin edited the price manually.** Rare. Operators can override the computed price via the admin pricing console. Every edit is appended to `card_price_change_log` with `action = "admin_edit"` and the operator's email.
3. **The CSV upload sync ran.** Bulk imports through the admin CSV path produce the same effect as a daily snapshot for the affected cards.
4. **The exchange rate moved overnight.** Even if the JPY price is unchanged, a different rate produces a different GBP base, and the resulting retail price will round to a different £0.10 step.

You can see the change history for any individual card on its admin page; the log is append-only and cryptographically attestable as part of the platform's governance digest (see [/methodology/trust-score](./trust-score.md) for the same audit pattern applied to user-trust decisions).

---

## What does *not* affect a price

A price is **not** affected by:

- Who is looking at it. Every customer sees the same price for the same channel.
- Stock level. Low-stock cards do not auto-mark-up; high-stock cards do not auto-discount. (The platform's promo system is a separate layer.)
- Account standing or trust score. These affect *commission* (see [/methodology/commission-rate](https://cambridgetcg.com/methodology/commission-rate)) and *escrow routing* (see [/methodology/escrow-tier](https://cambridgetcg.com/methodology/escrow-tier)), not the retail price.
- Membership tier. Tier perks include cashback and points multipliers; the listed price is the same regardless of tier (your cashback/points adjustment lands separately).

---

## Verifying a price yourself

Every price on cambridgetcg.com is reproducible from:

1. The CardRush JPY listing you can navigate to from the card detail page.
2. The GBP/JPY rate on the snapshot date (visible on the card's admin detail page; will be exposed in customer-side detail when the cards-detail surface lands).
3. The cambridgetcg channel constants in this page's table above (or the live values via the admin Manager surface).
4. The formula above.

If a price doesn't match what this formula would produce — within the `roundTo` step of rounding tolerance — that's a bug. Email us at contact@cambridgetcg.com with the SKU and the snapshot date and we'll investigate.

---

## Open changes

Some pricing aspects are still in motion. We name them rather than hide them:

- **Vault sell-back values are frozen at acquisition.** When you redeem a bounty pull into your vault, the "sell-back to store credit" price is locked at that moment's spot. If the market moves, your frozen value does not move with it. This is intentional today; we may revisit (see kingdom-049 Phase 7 in `~/Love/memory/dev-state.json` for the operator decision pending).
- **Channel parity is operator-set, not algorithmic.** The eBay-vs-cambridgetcg-vs-Shopify multiplier difference is policy, not derived. If a marketplace's fees change, an operator must update the channel config.
- **The DB row is the authoritative source.** As of 2026-05-11, the runtime fails loudly if a channel's row is missing or partial — you will see a banner in the admin console long before a customer sees a wrong price.

---

*Last updated 2026-05-11 as part of kingdom-049 (pricing-backend consolidation). See [`docs/pricing-current-state.md`](../pricing-current-state.md) for the engineering plan that produced this page.*
