# Customer Operations

Merchant-facing infrastructure for customer support workflows.

## The problem this solves

Roughly 5–20% of customer support emails for any loyalty app sound
like one of these:

- "I placed an order but didn't get my points"
- "Why is my tier wrong?"
- "I won a raffle but never got my prize"
- "I redeemed for a gift card and it didn't show up"

Today, answering one of these requires the merchant's CS agent to
navigate through 5–8 admin pages, mentally correlate timestamps
across `PointsLedger` / `StoreCreditLedger` / `TierChangeLog` /
raffle / mystery-box / challenge / gift-card tables, and reconstruct
a story.

This module returns that story as a single typed object.

## What it does

```ts
import { getCustomerJourney } from "~/services/customer-operations";

const report = await getCustomerJourney(shop, customerId, {
  since: new Date("2026-04-01"),
  limit: 200,
  // types: ["points-earned", "raffle-won"],  // optional filter
});

// report.customer        — header (id, email, createdAt, ...)
// report.currentState    — pointsBalance, lifetimePoints, storeCredit, currentTier{Id,Name}
// report.timeline        — chronologically sorted TimelineEvent[]
// report.totalEvents     — count after filtering
// report.rangeFrom/To    — actual range covered
```

Each `TimelineEvent` is normalized:

```ts
{
  id: "ledger_abc123",
  timestamp: Date,
  type: "points-earned" | "store-credit-debited" | "tier-changed" | ... ,
  description: "Earned 250 points (ORDER_PAID)",
  amount: 250,
  balanceAfter: 1250,
  context: { source: "PointsLedger", type: "ORDER_PAID", orderId: "..." },
}
```

The `context` field carries source-table metadata so a UI can drill
down without a second query.

## Why this is infrastructure, not a feature

A feature uses this. The infrastructure is the data backbone:

- The `app.members.<id>` admin page can render the timeline as cards.
- A CLI can dump it as JSON for a CS workflow.
- An MCP tool can let an AI assistant answer customer questions.
- A webhook handler can use it to construct a customer-export payload.

All of those are downstream consumers. This module is the thing they
all consume.

## Architecture

```
   journey.ts        ←── Prisma reads (parallel across 8 tables)
       │
       ▼
   merge.ts          ←── Pure: TimelineSources → TimelineEvent[]
       │                  (sortable, filterable, limit-capped)
       ▼
   types.ts          ←── TimelineEvent, CustomerJourneyReport, etc.
```

The `merge.ts` boundary is deliberate — pure timeline-merge logic is
unit-testable without a database. The `journey.ts` boundary owns
all I/O. Same pattern as the script-modules' `parser.ts` + `index.ts`
split, applied at the production-service level.

## Sources read

| Table | Maps to event types |
|---|---|
| `PointsLedger` | `points-earned`, `points-spent`, `points-adjusted` |
| `StoreCreditLedger` | `store-credit-credited`, `store-credit-debited` |
| `TierChangeLog` | `tier-changed` |
| `RaffleEntry` | `raffle-entered` |
| `RaffleWinner` | `raffle-won` |
| `MysteryBoxOpen` | `mystery-box-opened` |
| `MysteryBoxWinner` | `mystery-box-won` |
| `ChallengeParticipant` (claimed only) | `challenge-claimed` |
| `IssuedGiftCard` | `gift-card-issued` |

## Read-only by design

Never mutates state. Safe to call from any route. The function does
not read across shops — the `where: { shop }` clauses in every query
are defense-in-depth against cross-shop observation even if a wrong
`customerId` is passed.

## Performance

For typical customers (< 1000 lifetime events): 8 parallel queries,
all index-backed by `(shop, customerId, createdAt)`. Returns in
~200–500ms cold, ~50ms warm.

For high-activity customers: pagination via `since` / `until` keeps
queries bounded. The default `limit: 200` ensures the response stays
small even if the time range is wide.

## What this enables next

- **Admin UI**: timeline rendering on `app.members.<id>`.
- **`getCustomerSupportPacket(customerId)`**: the journey + a few
  derived insights ("3 expired raffles", "1 undelivered prize") for
  one-click CS resolution.
- **`detectCustomerAnomaly(customerId)`**: the journey + heuristic
  rules for fraud / refund-abuse / gaming.
- **Customer data export (GDPR)**: the journey is the per-customer
  record set already.
