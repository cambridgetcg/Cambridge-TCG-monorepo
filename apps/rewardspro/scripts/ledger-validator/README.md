# Ledger Validator

Scans every source file in `app/` for direct mutations of
`customer.pointsBalance` that bypass the ledger contract. Flags every
violation with a path, line number, the matched pattern, and the
contract's reason.

This is the second module in the **rewards chain** — the consumer
that earns the contract its place. Its first run on the existing
codebase surfaced a real bug-in-waiting (see "Known violations" below).

## What it catches (v1)

- `pointsBalance: { increment: ... }` outside the ledger module —
  bypasses `earnPoints()`'s atomic ledger entry + idempotency dedup.
- `pointsBalance: { decrement: ... }` outside the ledger module —
  bypasses `spendPoints()`'s atomic conditional check (race-prone
  under concurrent spends).

These two forms are **uniquely Prisma update syntax** — they can't
appear in any other context, so regex matching has zero false
positives.

## Why direct-assignment isn't enforced (yet)

Direct `pointsBalance: <value>` matches three structurally identical
contexts:

- Real Prisma DB write: `data: { pointsBalance: 0 }` (DANGEROUS)
- API response payload: `pointsBalance: balance.available` (SAFE)
- Object spread for analytics: `{ ...customer, pointsBalance: x }` (SAFE)

A first-run trial flagged 13 cases, all (b) or (c). 100% false-
positive rate erodes trust faster than missed catches — the pattern
memory's "conservative heuristics over greedy ones" rule. Adding
direct-assignment back requires an AST-aware validator that knows
when an expression is inside a Prisma `data: {}` block.

## Layer position (rewards chain)

```
Foundation-Health   Foundation-Baseline ...     ← design-system chain
        │
        └── Registry / Validators / etc.

Ledger-Validator ★  ← rewards chain (this module)
        │
        ▼
Ledger-Contract     ← typed canonical (handwritten)
        │
        ▼
app/services/points-ledger.server.ts   (the runtime canonical)
```

## Usage

```bash
npm run validate-ledger
```

Exit code 1 on violation, 0 on clean. Wire into CI as a merge gate.

```ts
import { validateLedgerContract, validate } from "./scripts/ledger-validator";
import { ledgerContract } from "./scripts/ledger-contract";

// Real run against the live app/ tree:
const report = validateLedgerContract();

// Pure (synthetic):
const report2 = validate(
  [{ path: "x.ts", content: "pointsBalance: { increment: 10 }" }],
  ledgerContract
);
```

## What it does NOT do

- **No semantic analysis.** This is a regex-based scanner. If a file
  uses unusual formatting (e.g. multi-line property declarations with
  the value on a different line from `pointsBalance`), the validator
  may miss it. Format your code conventionally.
- **No verification of correct ledger usage.** It can tell you the
  ledger function was called; it can't verify the call's arguments
  are correct.
- **No coverage of `lifetimePoints` or `StoreCreditLedger`.** Those
  are separate ledgers with separate contracts. A future
  `credit-ledger-validator` would mirror this module for store credit.

## Known violations

When introduced on 2026-04-25, this validator's first run surfaced
**1 real violation**:

- `app/services/raffle-instant-win.server.ts:355` —
  `pointsBalance: { increment: points }` outside a transaction, paired
  with a `PointsLedger` entry that has `balance: 0, // Will be calculated`
  (incomplete). This bypasses `earnPoints()`'s atomic balance recording
  and is race-prone under concurrent earns.

The aspirational test (in `test/scripts/ledger-validator.test.ts`)
asserts that this exact violation exists — when the bug is fixed, the
test fails and forces reconciliation. Same celebrate-fix pattern as
the design-system chain's celebrate-adoption tests.
