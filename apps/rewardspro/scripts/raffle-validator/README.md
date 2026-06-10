# Raffle Validator

Scans every source file in `app/` for Prisma mutation calls against
raffle tables (`raffleEntry`, `raffleWinner`, `raffleInstantWin`).
Flags any call site that's not in the allowed-sources list for that
table.

Second consumer in the **rewards chain** alongside `ledger-validator`.
Different shape than the ledger one (per-table allow-list rather than
per-field forbidden-pattern), same architectural slot.

## What it catches

For each table protected by `raffle-contract`:
- `prisma.<table>.create / createMany`
- `prisma.<table>.update / updateMany`
- `prisma.<table>.upsert`
- `prisma.<table>.delete / deleteMany`
- The same calls with `tx.` (inside a `prisma.$transaction` callback)

Outside the table's allowed-sources, any of these is a violation.

## Layer position (rewards chain)

```
                  Raffle-Validator ★ (this module)
                          │
                          ▼
                  Raffle-Contract (typed canonical)
                          │
                          ▼
        app/services/raffle-{entry,drawing,prize-delivery,instant-win,management}.server.ts
```

Sibling of `ledger-validator`. Both consume their respective contracts;
both walk `app/` for violations. The `architecture` module discovers
both as part of the rewards chain (alongside the design-system chain).

## Usage

```bash
npm run validate-raffles
```

Programmatic:

```ts
import { validateRaffleContract, validate } from "./scripts/raffle-validator";
import { raffleContract } from "./scripts/raffle-contract";

// Live run:
const report = validateRaffleContract();

// Pure (synthetic):
const report2 = validate(
  [{ path: "app/x.ts", content: "prisma.raffleEntry.update({...})" }],
  raffleContract
);
```

## Known violations (calibration)

When introduced on 2026-04-25, this validator's first run is expected
to surface **at least 1 real violation**:

- `app/services/raffle-instant-win.server.ts:272` —
  `prisma.raffleEntry.update(...)` outside `raffle-entry.server.ts`,
  paired with a sibling `prisma.raffleInstantWin.update(...)` at
  line 264 (split-write — non-transactional pair, separate atomicity
  bug not caught by this validator).

The aspirational test in `test/scripts/raffle-validator.test.ts`
asserts this violation exists — celebrate-fix pattern. When fixed,
the test fails and forces reconciliation.

## What it does NOT catch

- **Multi-write atomicity** (sequential `prisma` calls that should be
  one `$transaction`). Different validator shape; not in scope here.
- **Read-side correctness** — only mutations are checked.
- **Indirect mutation** via raw SQL or via repositories that wrap
  prisma calls. Add allowed-sources for those wrappers if they
  emerge.
