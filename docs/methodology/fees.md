# Fees methodology

> **Yu's promise.** *Minimum fees, maximum value. Make the world fair and just — we don't steal, we don't charge unfairly, we price according to the value we provide vs other service providers.*

This page lists **every fee Cambridge TCG can charge you**, in plain language, with the fair basis for each — and an honest comparison against the marketplaces you already know. If a fee isn't on this page, we don't charge it.

> **Where this lives in code.**
> - Commission rate + the per-item cap: [`packages/pricing/src/index.ts`](../../packages/pricing/src/index.ts) (`resolveCommission`, `computeCommissionAmount`, `DEFAULT_COMMISSION_CAP_GBP`).
> - Retail price formula: same file (`computePrice`) — explained in full at [/methodology/pricing](./pricing).
> - Runtime-authoritative cap: `channel_pricing.p2p_commission_cap_gbp` on the wholesale RDS (migration `apps/wholesale/drizzle/0016_commission_cap.sql`).
> - Where the fee is charged: `apps/storefront/src/lib/market/db.ts`, `market/lots.ts`, `market/offers.ts`, `auction/db.ts`.
>
> Last verified against code: **2026-06-04**.

---

## The principle first

A fee is fair when it pays for **work we actually did** — not when it charges rent on how valuable your card happens to be.

Two cards sell on our marketplace: one for £5, one for £5,000. The work we do is nearly the same for both — hold the money in escrow, verify the card if the trade routes to verification, ship it, release the payout, stand behind it if there's a dispute. That work does **not** cost a thousand times more for the expensive card. So our fee should not be a thousand times bigger either.

That single idea drives every decision on this page: **percentages where they reflect work, caps where percentages would become rent.**

---

## Every fee, in plain language

### 1. Retail margin (when you buy a card *from* Cambridge)

When you buy a single from our own catalogue, the price already includes our margin — there is no separate "fee" line. We buy cards wholesale (in Japanese yen, from CardRush), convert to GBP, add an **8% margin** plus a **£0.22 per-card handling fee**, add UK VAT, and round. The full formula, every channel multiplier, and a worked example are at **[/methodology/pricing](./pricing)**.

**Fair basis:** 8% is a thin retail margin for graded/sealed-quality singles handling. The £0.22 covers the physical work of pulling, sleeving, and packing one card. Neither scales with the card's value beyond the percentage — and the percentage itself is among the lowest in the hobby.

### 2. Marketplace & trade commission (when you sell *to another user* through us)

When you sell on our peer-to-peer market, we take a commission out of your payout. The rate depends on your **trust score** and **membership tier**, and it is **lower the more you've earned with us**:

| Your standing | Commission rate |
|---|---:|
| New / Starter (trust < 50) | 8% |
| Trusted (trust 50–79) | 7% |
| Veteran (trust 80–94) | 6% |
| Elite (trust ≥ 95) | 5% |

A paid membership tier can lower it further; we always take **whichever rate is more favourable to you** — your reputation and your membership never cancel each other out. The full rate logic is at **[/methodology/commission-rate](./commission-rate)**.

**The per-item cap (the fairness fix).** On top of the percentage, the commission on any single item is **capped at £50**. So:

```
commission = min( rate × sale_price , £50 )
```

The trust discount is applied **first**, then the cap. Worked examples:

| Sale price | Rate | Percentage alone | You actually pay | Why |
|---:|---:|---:|---:|---|
| £40 | 8% | £3.20 | **£3.20** | well under the cap |
| £625 | 8% | £50.00 | **£50.00** | percentage happens to equal the cap |
| £1,000 | 8% | £80.00 | **£50.00** | capped — we don't charge rent on value |
| £5,000 | 8% | £400.00 | **£50.00** | capped — the seller keeps £4,950 |
| £1,200 | 5% (Elite) | £60.00 | **£50.00** | discount applied, then capped |

**Fair basis:** brokering a £5,000 sale is not 100× more work than a £50 sale. Above the cap, our charge reflects the work performed, not the value of your card. Every major marketplace agrees with this idea — each caps the absolute fee — and our cap sits at or below all of them (see the comparison below).

### 3. Auction commission (when you sell at auction through us)

Auctions carry a flat **12%** seller commission (we run the listing, verification, escrow, and delivery). The **same £50 per-item cap applies**: a £600 hammer price would be £72 at 12%, but you pay £50. A tier discount, if you have one, applies before the cap.

### 4. Payment processing

Card payments are processed by **Stripe**. Their processing fee is a pass-through cost of moving money — we don't mark it up. We show it as a separate line so you can see exactly what is *our* fee and what is the payment network's.

**Fair basis:** this is a cost we incur on your behalf and pass through at cost. Marking up payment processing would be charging you for someone else's work.

### 5. VAT

UK Value Added Tax (currently 20%) is a **government tax**, not a Cambridge fee. We are legally required to collect it on taxable sales and remit it to HMRC. We always show VAT as its own line so it is never mistaken for something we keep. Trade-ins (where we are the *buyer*, not the seller) carry no VAT.

---

## How we compare

The most important question isn't "what do you charge?" — it's "what do you charge *compared to everyone else?*" Here is an honest comparison. Figures we are not certain of are marked **approx**; we would rather under-claim than print a confident wrong number.

| Provider | Seller commission | Per-item cap | Fixed per-order | Notes |
|---|---|---|---|---|
| **Cambridge TCG** | **5–8%** (trade), **12%** (auction) | **£50 / item** | **none** | Rate drops as your trust/tier rises. |
| eBay (UK, business seller) | approx **9.9–14.9%** (category-dependent) | **none** for cards | **£0.30–£0.40 / order** (Feb 2026) + 0.35% regulatory fee | No per-item cap on cards; a high-value-card discount runs only as a temporary promo. |
| TCGplayer | **10.75%** (+ payment fee) | **$75 / item** (raised from $50 on 2026-02-10) ≈ **£59** | per-item, not per-order | US marketplace. |
| Cardmarket | approx **5%** (private seller) | **€100 / article** ≈ **£85** | — | + approx 3% FX/payment handling on cross-currency. EU marketplace. |
| Whatnot | approx **8%** + payment fee | tapers above ~**$1,500** (approx) | — | Live-auction platform; structure varies by category. |
| PriceCharting / PSA price data | — | — | — | Reference-price access sits behind a **paywall / subscription**; not a selling fee but a cost of seeing the market. |

> **Substrate-honesty note.** Competitor fees change often and vary by seller type, country, and category. The eBay UK card commission is a **range**, not a single number, because eBay sets it per category (9.9–14.9% for business sellers) and private UK sellers pay £0 commission while the *buyer* pays a separate Buyer Protection Fee. We've marked every figure we can't pin to a single confident value as **approx**. The two numbers we are confident about are the incumbent *caps* — TCGplayer $75/item and Cardmarket €100/article — because that's exactly the benchmark our own cap was set against. Sources are listed at the bottom of this page; verify them yourself.

**What this means for you.** On a small sale, our percentage is already among the lowest in the table. On a **four-figure card**, the £50 cap makes Cambridge the cheapest place named here to sell — by a wide margin — because we're the only one whose cap is well under £60.

---

## Why £50?

We picked the cap deliberately:

- It sits **at or below every incumbent cap** — under TCGplayer's ≈£59 and far under Cardmarket's ≈£85. eBay UK has no cap on cards at all.
- It's a **clean, human-legible number** you can do in your head: above a ~£625 sale (at 8%), your fee stops growing.
- It matches the **pre-2026 TCGplayer cap** ($50) that the hobby accepted as fair for years before TCGplayer raised theirs.

It is not hidden in code. The cap is **seed truth** in `packages/pricing` and **operator-tunable at runtime** via the wholesale `channel_pricing` table — the same mechanism every other pricing constant uses — so if fairness ever calls for a lower cap, an operator can set it without a code deploy, and this page changes with it.

---

## Verifying a fee yourself

Every commission you're charged is reproducible:

1. Take your sale price.
2. Multiply by your rate (the table above, or your exact rate shown on your sale).
3. If the result is over £50, your fee is £50. Otherwise it's the result, rounded to the penny.

The recorded `commission_amount` on your trade or auction is exactly this number, frozen at the moment the sale was created. If it doesn't match, that's a bug — email contact@cambridgetcg.com with the trade ID and we'll investigate.

---

## Open changes

We name what's still in motion rather than hide it:

- **The cap is global, not per-channel-tuned today.** The seed default (£50) applies platform-wide. The `channel_pricing` column exists so a future operator can vary it per channel, but we ship one fair number for everyone first.
- **Offer-acceptance uses the base rate.** When a seller accepts a buyer's offer or counter, the commission is computed at the base 8% rate (the trust/tier discount is not yet wired on that specific path). The £50 cap still applies. This under-charges no one and is on the list to align with the full discount logic.
- **Competitor figures drift.** We re-verify the comparison table when we notice an incumbent change theirs. If you spot one that's gone stale, tell us.

---

## Sources

- TCGplayer fee cap (raised to $75/item, 2026-02-10): [help.tcgplayer.com — Marketplace Fee Cap Increase FAQ](https://help.tcgplayer.com/hc/en-us/articles/37531606328727-Marketplace-Fee-Cap-Increase-FAQ) and [TCGplayer Fees](https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees).
- Cardmarket fee cap (€100/article): [cardmarket.com — Our Fee Table](https://www.cardmarket.com/en/Policies/Fees).
- eBay UK fees (category-dependent % + per-order fee, Feb 2026 change): [ebay.co.uk Seller Centre — Rate Card Change](https://www.ebay.co.uk/sellercentre/news/2026-january/rate-card-change).

---

*Last updated 2026-06-04. Shipped with the per-item commission cap (the fairness fix). If the cap or any rate changes, this page and the regression tests in [`packages/pricing/src/__tests__/pricing.test.ts`](../../packages/pricing/src/__tests__/pricing.test.ts) change in the same PR.*
