# Payout holds methodology

When you sell something on Cambridge TCG, the buyer's payment is held briefly before it is released to you. The duration of the hold depends on **what kind of sale it was** and, for P2P trades, **what your trust tier was at the moment the trade was created**. This page explains exactly how the duration is set.

> **Where this lives in code.**
> - Trust tier table: `apps/storefront/src/lib/escrow/types.ts:101-106` (`TRUST_TIERS`).
> - Trade hold-days column: `market_trades.payout_hold_days`, stamped at trade-creation time from the seller's then-current tier.
> - Auction hold: flat 3 days, applied by the maintenance cron sweep at `apps/storefront/src/app/api/cron/maintenance` (auction payout sweep).
> - The "available_at" calculation rendered on `admin.cambridgetcg.com/money/payouts` is `seller_paid_at + payout_hold_days` (trades) or `paid_at + 3 days` (auctions).
>
> Last verified against code: **2026-05-09**.

---

## What "hold" means

A hold is the gap between two events:

1. The buyer pays. (For trades: when the escrow flow reaches `completed`. For auctions: when `auction.status = 'paid'`.)
2. The seller's payout becomes eligible to send.

During the hold, the seller's payout is *recorded* on the platform (you can see it on `/account/payouts` as "scheduled"), but is not yet sent. After the hold elapses, the operator (or a cron sweep) can release it via Stripe Connect or record a manual payout.

The hold exists to give the buyer time to raise a dispute before the funds leave the platform. The Trust × Tier table below trades hold duration against expected dispute risk: more-trusted sellers wait less.

---

## P2P trades — hold by seller's trust tier

The hold is determined by the seller's tier **at the moment the trade was created**, not at the moment of completion or payout. This is intentional — it locks the hold to the conditions both parties agreed to up front.

| Tier | Min trust score | Payout hold | Reason for the duration |
|---|---:|---:|---|
| **New** | 0 | **7 days** | First-time sellers; longest dispute window |
| **Starter** | 20 | **5 days** | Some history, still building reputation |
| **Trusted** | 50 | **3 days** | Demonstrated reliability |
| **Veteran** | 80 | **1 day** | Established sellers; near-instant turnaround |
| **Elite** | 95 | **0 days** | Released as soon as escrow completes |

Source: `apps/storefront/src/lib/escrow/types.ts:101-106` — the `TRUST_TIERS` table also drives trade limits, daily limits, and inspection requirements. Hold days are one of five tier-derived properties.

The tier itself is a function of your trust score, which is documented at [`/methodology/trust-score`](./trust-score.md). If you're disputing your hold duration, the appeal lives at the inputs to your trust score — not at the hold itself.

---

## Auctions — flat 3 days

Auctions use a single 3-day hold for **every** seller, regardless of tier. The reasoning:

- Auctions are higher-variance than P2P trades (rare cards, contested bids, sniping protections that already extend the close).
- The set of auction sellers is small enough that per-tier tuning hasn't been load-bearing.
- 3 days matches the **Trusted** tier on P2P, which is roughly the median seller.

If auction hold tuning becomes useful, the cron sweep in `apps/storefront/src/app/api/cron/maintenance` is the place to make it tier-aware. Today it is a literal `3` in the SQL. (Surface the change here in the same PR — see `docs/principles/transparency.md` rule 3.)

---

## Worked examples

**Trade — Trusted seller**
A seller in the Trusted tier (trust score 65, say) lists a card and matches with a buyer. The trade is created at `2026-05-01 14:00 UTC`. `market_trades.payout_hold_days` is stamped as `3`.
The buyer pays; escrow completes at `2026-05-04 09:30 UTC`.
Available_at = `2026-05-04 09:30 + 3 days` = `2026-05-07 09:30 UTC`.
At the available_at moment, the cron sweep (or operator) releases the payout. The seller sees it on `/account/payouts`.

**Trade — Elite seller**
Same trade, but the seller is Elite (trust 96). `payout_hold_days = 0`.
Available_at = `completed_at` itself. Released as soon as escrow completes, no waiting.

**Auction — any seller**
Auction wins at `2026-05-01`. Buyer pays at `2026-05-02 11:00`. `auction.status = 'paid'`.
Available_at = `2026-05-02 11:00 + 3 days` = `2026-05-05 11:00 UTC`. Released then.

---

## What "available now" means on the admin page

The admin payouts dashboard at `/money/payouts` shows an "Available" column. Two values:

- A literal date (e.g. **5 May 2026**) — the hold has not yet elapsed; the row is dimmed.
- The word **now** in amber — `available_at <= NOW()`; the operator can release.

Releases past their available_at are surfaced as **due now** in the KPI strip, with a critical urgency tint when the count is non-zero. This is what makes the page operational: the operator's eye lands on overdue first.

---

## Disputing your hold

If you believe your hold duration is wrong:

- **The hold is set by your trust tier at trade-creation time.** If your trust score has gone up since then, future trades will get the lower hold; past trades remain on the hold they were created with. (This protects you from the reverse case too — a tier downgrade after a trade is created doesn't extend an existing hold.)
- **If you believe the trust score itself is wrong**, see the appeal paths in [`/methodology/trust-score`](./trust-score.md#disputing-your-score). The appeal lives at the inputs (reviews, fraud signals, dispute outcomes), not at the hold.
- **If a held payout is overdue and you haven't been paid**, the operator's queue is at `admin.cambridgetcg.com/money/payouts`; reach out via support and reference the trade or auction id.

There is no "reduce my hold" appeal for a single trade — the hold is a property of the tier-at-creation contract, locked to that moment.

---

## Changelog

| Date | Change | Code path |
|---|---|---|
| 2026-05-09 | Methodology page first published. Reflects formula as of the kingdom-023 admin migration. | `apps/storefront/src/lib/escrow/types.ts:101-106`; `apps/storefront/src/app/api/cron/maintenance` (auction payout sweep) |

When the formula changes, append here. The same PR must update both the code and this page — see `docs/principles/transparency.md` rule 3.
