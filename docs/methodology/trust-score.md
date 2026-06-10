# Trust score methodology

The trust score is a single number, 0–100, that summarises a user's track record on Cambridge TCG. It influences:

- **Trade limits** — how much a user can transact per trade and per day.
- **Escrow tier routing** — Direct, Verified, or Full (faster vs slower flows).
- **Whether escrow inspection is required.**
- **Payout hold days** — how long after a sale the seller waits to be paid.

The score is computed by code, not by humans, against data the platform has already collected about the user's behavior. Every user can see their own score and its components on `/account/standing`. This page documents the formula.

> **Where this lives in code.** The canonical implementation is at `apps/storefront/src/lib/escrow/trust-engine.ts` (function `calculateTrustScore`). When the formula changes, this page is updated in the same PR. Last verified against code: **2026-06-10**.

---

## Components (positive — up to 100 points)

The score is built from five positive components plus a tier table.

> **2026-06-10** — the verification component was removed when identity verification stopped gating trade; weights moved to behaviour: completion +5, reviews +5. Scores recompute nightly.

### 1. Trade completion rate — up to **35 points**

The fraction of your trades that ended with `escrow_status = completed`, scaled to 35. A user with 4 of 5 trades completed gets 28 points; a user with 5 of 5 gets 35.

Cancelled and disputed trades count *against* completion (they're in the denominator but not the numerator). New users with zero trades get 0 here — the score grows as you trade.

### 2. Review score — up to **30 points**

Average rating across reviews you've received as a counterparty, scaled to 30 (so a 5-star average yields the full 30, a 3-star average yields 18).

**Reviewer-trust weighting.** Each review's contribution to your average is multiplied by a weight that depends on the reviewer's *own* trust score:

| Reviewer's trust | Weight |
|---|---|
| ≥ 80 (Veteran/Elite) | 1.0 |
| ≥ 50 (Trusted) | 0.8 |
| ≥ 20 (Starter) | 0.6 |
| < 20 (New) | 0.4 |

This is anti-farming. A 5-star from a Veteran counts more than a 5-star from a brand-new account that just opened today. The effective weight is persisted on each review row so you can see — on `/account/reviews` — exactly how much each review counted.

### 3. Trade volume — up to **15 points**

Logarithmic. Total cumulative volume (in £) is taken as `log10(total)` × 5, capped at 15. A user with £100 cumulative volume gets 10 points; £1,000 gets 15; £10,000 also gets 15 (capped).

The log scale is deliberate — it means going from £0 to £100 matters more than going from £10,000 to £20,000. Trust accrues with experience, not deal size.

### 4. Account age — up to **10 points**

Months since your *first* trade, capped at 5 months for the maximum 10 points (2 points per month). A user one month into trading gets 2; five months gets the full 10.

Age tracks experience-on-the-platform, not calendar age of the account. A user who registered a year ago but only started trading last week is still "new."

### 5. External reputation — up to **10 points**

5 points per verified cross-platform reputation entry, capped at 10. Linking and verifying your eBay or CardMarket account contributes here.

External reputations are verified via per-platform challenges; see `/methodology/external-reputation` (planned) for that flow.

---

## Penalties (subtracted from the positive total)

| Trigger | Penalty |
|---|---|
| Active dispute (open) | **−10** per open dispute |
| Dispute lost (resolved against you) | **−15** per lost dispute |
| Dispute resolved as split | **−8** per split (half-credit) |
| Unresolved fraud signal of medium severity or higher | **−20** per signal |

Penalties stack. A user with one open dispute and one medium-severity unresolved fraud signal pays −10 + −20 = **−30**.

**Win/loss attribution depends on role.** If you were the seller and the dispute resolved as `release_seller`, you won. If it resolved as `refund_buyer` or `return_card`, you lost. The `split` outcome credits half a loss to both sides.

---

## Final score and tiers

```
raw_score   = completion + review + volume + age + external_rep
final_score = max(0, min(100, raw_score - penalties))
```

The final score is then mapped to a tier, which determines limits and routing:

| Tier | Min score | Trade limit | Daily limit | Inspection? | Payout hold |
|---|---:|---:|---:|---|---:|
| **New** | 0 | £50 | £100 | yes | 7 days |
| **Starter** | 20 | £150 | £500 | yes | 5 days |
| **Trusted** | 50 | £500 | £2,000 | no | 3 days |
| **Veteran** | 80 | £2,000 | £10,000 | no | 1 day |
| **Elite** | 95 | £10,000 | £50,000 | no | 0 days |

Tier table source: `apps/storefront/src/lib/escrow/types.ts:101-106` (`TRUST_TIERS`).

---

## Recompute cadence

Your trust score is recomputed automatically when:

- A trade you're part of completes, cancels, or is disputed.
- A review of you is submitted, hidden, or restored.
- A fraud signal against you is raised or resolved.
- An external reputation entry is verified or removed.
- The maintenance sweep runs (every minute) — if you have any of the above events pending recompute.

The maintenance cron lives at `apps/storefront/src/app/api/cron/maintenance` and dispatches the recompute via `apps/storefront/src/lib/escrow/trust-recompute.ts`. The `trust_profiles.last_calculated_at` column tracks the most recent recompute; both the admin user-detail hub and (soon) `/account/standing` surface this timestamp.

---

## Worked example

A user has:

- 22 completed trades out of 25 total → completion = 22/25 × 35 = **30.8 → 31**
- 12 reviews, weighted average 4.6 → review = (4.6 / 5) × 30 = **27.6 → 28**
- £4,200 cumulative volume → volume = log10(4200) × 5 = **18.1 → capped at 15**
- 3 months trading → age = 3 × 2 = **6**
- 1 verified eBay reputation → external = 5 × 1 = **5**
- 1 dispute lost (as seller) → penalty = **−15**
- No fraud signals.

Raw = 31 + 28 + 15 + 6 + 5 = **85**
Final = max(0, min(100, 85 − 15)) = **70** → Trusted tier (£500 trade limit, no inspection, 3-day payout hold).

---

## Disputing your score

If you believe an input to your score is wrong (a review you think shouldn't count, a fraud signal you believe is misfired, a dispute outcome you'd contest):

- **Reviews** — appeal via `/account/reviews` (per-review).
- **Fraud signals** — appeal path lives at `/account/standing` (planned T5).
- **Disputes** — these have their own resolution flow at `/account/disputes`.

There is no "appeal the score itself" — the score is a function of inputs, so the appeal lives at the inputs.

---

## Changelog

| Date | Change | Code path |
|---|---|---|
| 2026-06-10 | Verification component (10 pts) removed — identity verification stopped gating trade ("global free trade"). Weights moved to behaviour: completion 30 → 35, reviews 25 → 30. Scores recompute nightly. | `apps/storefront/src/lib/escrow/trust-engine.ts` |
| 2026-05-05 | Methodology page first published. Reflects formula as of 2026-04 reviewer-trust-weighting commit. | `apps/storefront/src/lib/escrow/trust-engine.ts` |

When the formula changes, append here. The same PR must update both the code and this page — see `docs/principles/transparency.md` rule 3.
