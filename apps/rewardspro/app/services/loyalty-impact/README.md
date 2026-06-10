# Loyalty Impact

Merchant infrastructure for the universal "is this app paying for
itself?" question.

## The merchant problem

Every Shopify merchant who pays for a loyalty app eventually asks
some version of:

- *"Are members spending more than non-members?"*
- *"What does the program actually cost me?"*
- *"Should I keep paying for this app, or upgrade my plan, or downgrade?"*

Most loyalty apps show counters — points issued, redemptions, active
customers. Those numbers don't answer the question. The merchant
needs **cohort comparison** (members vs non-members) and **honest
program cost**, then they can draw their own conclusion.

This service produces both, with deliberate honesty about the limits
of what observation can tell you.

## What it returns

```ts
const report = await getLoyaltyImpactReport(shop, {
  windowFrom: new Date("2026-04-01"),
  windowTo: new Date("2026-04-30"),
  cohortDefinition: "any-loyalty-event",  // or "has-redeemed", "has-spent-points"
  pointsRate: 0.01,                        // 1 point = 1 cent (default)
});

// report.cohorts:
//   { members: 412, nonMembers: 1583, totalCustomers: 1995 }

// report.revenue:
//   members:    { customerCount: 412, totalRevenue: 18420, orderCount: 287, aov: 64.18, arpu: 44.71 }
//   nonMembers: { customerCount: 1583, totalRevenue: 41200, orderCount: 1124, aov: 36.65, arpu: 26.03 }
//   aovDelta: 27.53          // members spend $27.53 more per order
//   aovLiftPercent: 75.1     // 75% higher AOV
//   arpuDelta: 18.68

// report.programCost:
//   pointsRedeemedValue: 384.50
//   storeCreditIssued: 1240.00       // future obligation
//   storeCreditRedeemed: 892.00      // realized cost
//   giftCardsIssued: 350.00
//   rafflePrizesAwarded: 12          // count, no $ aggregated
//   mysteryBoxRewardsAwarded: 47
//   totalDirectCost: 1626.50         // points-redeemed + store-credit-redeemed + gift-cards-issued

// report.estimatedImpact:
//   aovLiftRevenue: 7901.11   // (aovDelta) × member orders — naive
//   netImpact: 6274.61
//   confidence: "low" | "medium"  // never "high"
//   caveat: "AOV-lift attribution is naive..." (full text)
```

## Honesty principle

The `confidence` field is **always `low` or `medium`, never `high`**.
The counterfactual — what members would have spent without the
program — is unknowable from observation alone. Selection bias means
already-engaged customers self-select into loyalty, so the AOV-lift
attribution over-attributes lift to the program.

The `caveat` field always names the assumptions. A merchant should
read it before quoting any number.

For a defensible ROI claim: run an experiment with random assignment.
For "is the program directionally working?": this report answers it
with appropriate caveats.

## Architecture

```
   report.ts           ←── Prisma reads (parallel: customers, orders,
       │                   ledger, gift cards, prize counts)
       ▼
   compute.ts          ←── Pure: cohort metrics + program cost +
       │                   honest impact estimate. No I/O.
       ▼
   types.ts            ←── LoyaltyImpactReport, CohortMetrics, etc.
```

The `compute.ts` boundary is the testable seam — pure aggregation
logic exercised by hand-crafted inputs without a database.

## Cohort definitions

Three pre-defined cohort types, each with different selection bias
characteristics:

| Type | Definition | Selection bias |
|---|---|---|
| `any-loyalty-event` (default) | Any PointsLedger or StoreCreditLedger entry, ever | Low to moderate — captures everyone the program has ever touched |
| `has-redeemed` | At least one negative-amount entry (spent points/credit) | Higher — only customers engaged enough to redeem |
| `has-spent-points` | Negative PointsLedger entry inside the window | Highest — narrow active-engagement signal |

Use `any-loyalty-event` for the broadest "did the program reach
this customer?" view; use `has-redeemed` when you want to compare
*active program users* vs everyone else.

## What it does NOT do

- **Does NOT claim causation.** AOV-lift × order volume is a naive
  estimate, not an ROI proof. The `caveat` field says this in plain
  language.
- **Does NOT value heterogeneous prizes.** Raffle / mystery-box prizes
  are reported as counts only; their dollar value is shop-specific
  (depends on cost-of-goods, refund frequency, etc.).
- **Does NOT compute LTV / cohort retention.** That's a separate
  module (not yet built). This is point-in-time impact, not lifetime
  value.
- **Does NOT account for app subscription fee.** The merchant knows
  what they're paying; this service shows the program's *direct*
  cost (rewards issued/redeemed). Add the subscription fee
  externally for total program cost.

## Performance

Customer-cohort queries can be heavy on shops with millions of
customers. The current implementation reads all customer IDs in the
shop (`prisma.customer.findMany({ where: { shop }, select: { id } })`)
which is fine up to ~100k customers. Above that, materialize the
member set into a separate table or denormalized column.

The order / ledger / gift-card reads are all bounded by the time
window and indexed by `(shop, createdAt)`.

## What this enables next

- **Admin dashboard card**: "Loyalty members spent $X this month vs $Y for non-members."
- **Merchant email digest**: monthly impact summary delivered to the merchant.
- **Pricing-tier upgrade prompt**: when impact crosses a threshold, suggest the next plan.
- **Comparison view**: this month vs last month, with caveats preserved.
