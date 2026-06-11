# Ledger Contract

The first module in the **rewards chain** — a parallel to the
design-system chain, applied to the points-ledger domain. This module
is the typed canonical: it codifies the points ledger's public surface
and the forbidden patterns that bypass it.

## Why this layer exists

`app/services/points-ledger.server.ts` is the financial truth of the
rewards module. Every points mutation must flow through one of its
three exported functions:

- `earnPoints()` — atomic credit + ledger entry + idempotency dedup
- `spendPoints()` — atomic conditional debit (rejects if balance < amount)
- `adjustPoints()` — manual correction, dispatches to earn or spend

Direct writes to `customer.pointsBalance` outside this module bypass:
- The audit trail (no `PointsLedger` entry → no history)
- The atomic check-and-update (race condition under concurrent spends)
- The idempotency key (double-credit on retry)

The contract names those direct writes as `ForbiddenPattern`s. The
**ledger-validator** (sibling module) enforces the contract by
scanning `app/` for any source file that violates it.

## Layer position (rewards chain)

```
                 Ledger-Validator (next module — enforces this contract)
                          │
                          ▼
                 Ledger-Contract ★ (this module)
                          │
                          ▼
            app/services/points-ledger.server.ts
                          │
                  Customer.pointsBalance + PointsLedger
                  (Prisma — runtime canonical)
```

## Cross-chain note

This is a **separate chain** from the design-system chain. Both
follow the same pattern (typed canonical → consumers → composer →
temporal → writer), but they target different domains:

| Chain          | Canonical                                   | Concern                              |
|----------------|---------------------------------------------|--------------------------------------|
| Design system  | `extensions/.../assets/rp-shared.css`       | Visual consistency across widgets    |
| Rewards (this) | `app/services/points-ledger.server.ts`      | Financial integrity of points moves  |

Both chains share the `architecture` module, which discovers all
modules in `scripts/` regardless of chain.

## Why handwritten, not parsed

The ledger's surface is small (3 functions) and changes rarely.
Handwriting the contract is more honest than parsing the TS file —
the parser would just confirm what we already know. If the surface
grows enough that handwriting is error-prone, swap this file for a
TS-AST parser of `points-ledger.server.ts`. The shape (typed
canonical) stays the same; only the source changes.

## Usage

```ts
import { ledgerContract } from "./scripts/ledger-contract";

// What operations does the contract permit?
ledgerContract.operations.map((op) => op.name);
// → ["earnPoints", "spendPoints", "adjustPoints"]

// What's forbidden outside the ledger module?
ledgerContract.forbidden.map((f) => f.name);
// → ["direct-increment", "direct-decrement", "direct-assignment"]

// Which files ARE the canonical?
ledgerContract.allowedSources;
// → ["app/services/points-ledger.server.ts"]
```
