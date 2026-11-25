# Payout holds methodology

When you sell something on Cambridge TCG, the buyer's payment is held briefly before it is released to you. The duration of the hold depends on **what kind of sale it was** and, for P2P trades, **what your trust tier was at the moment the trade was created**. This page explains exactly how the duration is set.

> **Where this lives in code.**
> - Trust tier table: `apps/storefront/src/lib/escrow/types.ts:101-106` (`TRUST_TIERS`).
> - Trade hold-days column: `market_trades.payout_hold_days`, stamped at trade-creation time from the seller's then-current tier.
> - Auction hold: flat 3 days, applied by the maintenance cron sweep at `apps/storefront/src/app/api/cron/maintenance` (auction payout sweep).
> - The "available_at" calculation rendered on `cambridgetcg.com/admin/payouts` is `completed_at + payout_hold_days` (trades) or `paid_at + 3 days` (auctions).
> - Which sales are owed a payout at all: `apps/storefront/src/lib/payouts/owed.ts`.
>
> Last verified against code: **2026-05-09**; the section on a missing payment: **2026-11-25**.

---

## What "hold" means

A hold is the gap between two events:

1. The buyer pays. (For trades: when the escrow flow reaches `completed`, and only if the buyer's payment is recorded in `buyer_paid_at`. For auctions: when the winner's payment is recorded, `auction.status = 'paid'` with a `paid_at`.)
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

The admin payouts page at `cambridgetcg.com/admin/payouts` shows an "Available" column. Two values:

- A literal date (e.g. **05/05/2026**) — the hold has not yet elapsed; the row is dimmed.
- The word **now** in amber — `available_at <= NOW()`; the operator can release.

Rows past their available_at come first, and the line under the table counts them as overdue.

---

## When a payment is missing from the record

A sale with no recorded payment is not owed a payout. It is not on `/account/payouts`, the sweep does not pay it, and a payout recorded by hand is refused with the reason. `cambridgetcg.com/admin/payouts` counts these sales in an amber line: completed trades, and auctions marked paid. The same line counts a trade with no completion time and an auction with no payout amount.

If you are the seller and the buyer has paid, contact support with the trade or auction id.

For the operator: no page has a button made for this. The steps below exist, and each has side effects. Check first that the money arrived.

- **A completed trade without the buyer's payment.** As a signed-in admin, send `PATCH /api/market/trades/<id>` with `{"status":"paid"}`, then at once with `{"status":"completed"}`. The payment is recorded as of now. The seller is told that the buyer has paid and the card can ship. Both sides get the completion email again, but no second bell. The completion time becomes now, so the payout hold and any return window start again.
- **A completed trade without a completion time.** In Admin, Market, open the trade and press Save Notes. The completion time becomes now, and both sides get the completion email again.
- **An auction marked paid without the winner's payment.** Only Stripe's webhook records that payment, and only while the auction's status is `ended`.
  1. In Stripe, find the event for the winner's payment: `checkout.session.completed`, or `checkout.session.async_payment_succeeded` for a delayed method. Its metadata names the auction.
  2. In Admin, Auctions, set the auction to `ended`.
  3. Resend the event at once. The auction is paid as of now, so its 3 days start now. Its payout is worked out, it goes back to awaiting shipment, and the seller and the winner are told as for any payment.

  If the winner's payment window has passed, the unpaid sweep cancels an `ended` auction within a minute, or as soon as anyone opens a list of auctions. It also puts an unpaid-auction signal on the winner's record. A resend after that records nothing: set the auction to `ended` and resend again, and dismiss the signal in Admin, Fraud.

  A payment made outside Stripe Checkout, such as a bank transfer, has no event. Nothing in the app records it for an auction.
- **An auction without a payout amount.** As a signed-in admin, send `POST /api/auctions/<id>/approve` with `{"action":"calculate_payout"}`.

---

## Disputing your hold

If you believe your hold duration is wrong:

- **The hold is set by your trust tier at trade-creation time.** If your trust score has gone up since then, future trades will get the lower hold; past trades remain on the hold they were created with. (This protects you from the reverse case too — a tier downgrade after a trade is created doesn't extend an existing hold.)
- **If you believe the trust score itself is wrong**, see the appeal paths in [`/methodology/trust-score`](./trust-score.md#disputing-your-score). The appeal lives at the inputs (reviews, fraud signals, dispute outcomes), not at the hold.
- **If a held payout is overdue and you haven't been paid**, the operator's queue is at `cambridgetcg.com/admin/payouts`; reach out via support and reference the trade or auction id.

There is no "reduce my hold" appeal for a single trade — the hold is a property of the tier-at-creation contract, locked to that moment.

---

## Changelog

| Date | Change | Code path |
|---|---|---|
| 2026-11-24 | A completed trade is owed a payout only if the buyer's payment is recorded (`buyer_paid_at`), and an auction only if the winner's is (`paid_at`). One rule now decides this for the admin list, the seller's page, the trader dashboard, the payout sweep, and the check made before any payout. Before, a trade was never checked for it, and an auction only in the admin list and the sweep. The admin page counts the sales the rule leaves out. On this date there were no trades and no auction was affected, so no payout changed. Also corrected here: a trade's available date counts from `completed_at`, not `seller_paid_at`, and the admin page is `cambridgetcg.com/admin/payouts`. | `apps/storefront/src/lib/payouts/owed.ts` |
| 2026-05-09 | Methodology page first published. Reflects formula as of the kingdom-023 admin migration. | `apps/storefront/src/lib/escrow/types.ts:101-106`; `apps/storefront/src/app/api/cron/maintenance` (auction payout sweep) |

When the formula changes, append here. The same PR must update both the code and this page — see `docs/principles/transparency.md` rule 3.
