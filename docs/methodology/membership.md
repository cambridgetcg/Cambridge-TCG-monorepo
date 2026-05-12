# Membership tiers methodology

Cambridge TCG has a tiered membership system. Your tier determines several things you'll feel as a customer: **cashback** on purchases, your **Berries** earn multiplier, your **trade-in bonus**, your **commission rate** on P2P sales and auctions, and your **payout hold** when you sell. Higher tiers get better terms across the board.

This page explains exactly how a tier is assigned and what each tier gets.

> **Where this lives in code.**
> - Tier definitions: `tiers` table, columns `min_annual_spend`, `cashback_percent`, `points_multiplier`, `tradein_bonus_percent`, `p2p_commission_rate`, `auction_commission_rate`, `auction_priority_approval`, `store_discount_percent`, `is_paid`.
> - User assignment: `users.tier_id` + `users.tier_source` (one of `spending` / `subscription` / `manual`).
> - Spending recompute: `apps/storefront/src/lib/membership/db.ts` (annual_spend rolling window) + `apps/storefront/src/app/api/cron/maintenance` (recompute sweep).
> - Subscription flow: `apps/storefront/src/app/api/membership/{subscribe,cancel,resume}/route.ts`.
>
> Last verified against code: **2026-05-09**.

---

## How tiers are assigned

Three paths get a user into a tier. The `users.tier_source` column records which path applied — substrate-honest about *why* you're at the tier you're at.

### 1. Spending (`tier_source = 'spending'`)

The default. Each user has an `annual_spend` value tracked over a rolling 365-day window. When this number crosses a tier's `min_annual_spend` threshold, the user is promoted to that tier on the next recompute. When it falls below, they are demoted.

Spend is counted from completed B2C orders. P2P trade volume does **not** count toward annual_spend (the platform's commission is much smaller, and counting it would create a perverse incentive to wash-trade for tier promotion).

The recompute happens on the maintenance cron (`apps/storefront/src/app/api/cron/maintenance`) every minute. Tier moves are not retroactive — your perks change from the next purchase forward.

### 2. Subscription (`tier_source = 'subscription'`)

Some tiers are marked `is_paid = true`. A user can pay to be in one of these tiers regardless of their spend. Subscription is via Stripe, monthly or annual. While the subscription is active, the user is locked at that tier even if their spend would assign a lower one.

When a subscription is cancelled or fails to renew, `tier_source` flips back to `'spending'` on the next recompute, and the user lands at whichever tier their actual spend qualifies them for.

### 3. Manual (`tier_source = 'manual'`)

The operator can manually assign a user to a tier — typically for staff, partners, or retention exceptions. Manual tier assignments are not recomputed against spend or subscription state; they sit until the operator changes them.

`tier_source = 'manual'` is the only assignment that resists automatic recompute. If a manual user's spend drops, they keep their tier. If they cancel a (separately existing) subscription, they keep their tier. The operator's intent is sticky.

---

## What each tier gets

Tier definitions live in the `tiers` table. The admin viewer at `admin.cambridgetcg.com/money/membership` shows the live perk values per tier. Today's roster (subject to change — the page above is authoritative) typically includes:

| Tier | Threshold | Cashback | Berries × | Trade-in bonus | P2P / Auction commission | Store discount | Priority approval | Paid? |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Bronze   | £0       | 0%   | 1× | 0%   | 8% / 10% | 0%   | No  | No |
| Silver   | £200     | 1%   | 1× | 2%   | 7% / 9%  | 0%   | No  | No |
| Gold     | £500     | 2%   | 2× | 5%   | 6% / 8%  | 2%   | No  | No |
| Platinum | £2,000   | 3%   | 3× | 8%   | 5% / 7%  | 5%   | Yes | No |
| OG       | (paid)   | 5%   | 4× | 10%  | 4% / 6%  | 8%   | Yes | Yes |

(Above is an illustrative shape — exact numbers are whatever `tiers` currently holds.)

**What modulates here:**

- **Cashback** — applied to B2C order totals at checkout time, paid as `store_credit_ledger` entries.
- **Berries multiplier** — applies to all points-earning events. Earning 100 base Berries at Gold (2×) gives 200.
- **Trade-in bonus** — increases the credit value of a trade-in submission relative to the cash quote (e.g. cash 0.55 × CardRush, credit 0.77 × CardRush + tier bonus).
- **P2P / Auction commission rate** — taken from the seller's payout when their sale completes.
- **Store discount** — flat percent off the line items at checkout.
- **Priority approval** — auction listings + high-value market listings skip the manual-review queue.
- **Payout hold days** — *not* a tier column directly; it lives on the trust tier table at [`/methodology/payout-holds`](./payout-holds.md). Trust tier and membership tier are separate axes.

---

## When a tier change happens

| Trigger | What recomputes |
|---|---|
| New B2C order completes | `users.annual_spend` increments; if it crosses a threshold, `tier_id` is recomputed on next sweep |
| Refund processed | `annual_spend` decrements; tier may demote |
| 365-day-old order falls out of the window | `annual_spend` decrements (the rolling window) |
| Subscription starts | `tier_id` set to the subscribed tier; `tier_source = 'subscription'` |
| Subscription cancels / fails | `tier_source` flips back to `'spending'`; `tier_id` recomputes on next sweep |
| Operator sets a manual tier | `tier_id` set; `tier_source = 'manual'`; recompute skipped going forward |
| Maintenance cron sweep (every minute) | Pending recomputes drain |

Tier moves are not retroactive. If you become Gold today, last week's purchases are not re-credited at Gold rates.

---

## Worked examples

**1. A heavy spender drops a tier**
A customer spent £2,400 in the past 12 months, reaching Platinum. Three months pass with no purchases; some old orders fall out of the rolling 365-day window. Their `annual_spend` drops to £1,800. Next recompute: demoted to Gold. Their cashback rate drops from 3% to 2% on subsequent orders.

**2. A subscriber whose spend would qualify them anyway**
A customer subscribes to OG (paid). Their actual annual_spend is £4,500 — enough to qualify for Platinum on spend alone. While subscribed, `tier_source = 'subscription'` and they sit at OG. If they cancel the subscription, on next recompute they fall back to Platinum (not Bronze) because their spend earns it.

**3. A manual override**
The operator sets a partner account to Platinum manually. The partner's `annual_spend` is £0 (they don't buy from the storefront). They stay at Platinum because `tier_source = 'manual'` resists recompute. The operator can clear the override later by setting the user back to `tier_source = 'spending'`.

---

## Disputing your tier

If you believe your tier is wrong:

- **`tier_source = 'spending'`** — check `/account/standing` (planned) for your annual_spend total and the rolling window. If a refund or window-roll moved you, that's why.
- **`tier_source = 'subscription'`** — your tier reflects your subscription. If your subscription is active and your tier doesn't match, contact support; this is a sync issue, not a policy decision.
- **`tier_source = 'manual'`** — only the operator can change this. Ask through support.

There is no "appeal the tier" — the tier is a function of inputs (spend, subscription, manual override). The appeal lives at the inputs.

---

## Changelog

| Date | Change | Code path |
|---|---|---|
| 2026-05-09 | Methodology page first published. Reflects schema as of the kingdom-023 admin migration. | `tiers` table; `apps/storefront/src/lib/membership/db.ts` |

When the formula changes, append here. Same PR updates both code and this page (transparency rule 3).
