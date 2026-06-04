# Raffle Contract

The third foundation in the **rewards chain** (after `ledger-contract`).
Codifies the table-ownership rules for the raffles submodule.

## Why this layer exists

The level-3 dive (2026-04-25) mapped raffles as a 10-file submodule
with two clear pipelines:

```
                 raffle-management (foundation)
                          ▲
        ┌─── ENTRY ───────┘     └─── OUTCOME ───────┐
        │                                            │
   raffle-entry              raffle-drawing
   (owns RaffleEntry)        (owns RaffleWinner)
                                    │
                                    ▼
                           raffle-prize-delivery
                           (updates deliveryStatus)
```

`raffle-instant-win.server.ts` exists outside both pipelines but
currently mutates `raffleEntry.instantWinsTriggered` (line 272) — a
direct write to the entry canonical's table from a peer module. That's
the bug class this contract is designed to surface.

## Shape difference vs `ledger-contract`

| Aspect | `ledger-contract` | `raffle-contract` |
|---|---|---|
| Protects | A single FIELD (`pointsBalance`) | Multiple TABLES (`raffleEntry`, `raffleWinner`, `raffleInstantWin`) |
| Allowed sources | One per contract | One LIST per table |
| Forbidden patterns | Specific Prisma update syntax (`{ increment }`) | Any mutation method (`update`/`create`/`upsert`/`delete*`) |
| Validator regex | Highly specific (zero false positives) | Per-table call-site detection |

Same shape (typed canonical + allow-list), parameterized differently
because the rewards submodules have different invariant kinds.

## Layer position

```
        Raffle-Validator (next module — enforces this contract)
               │
               ▼
        Raffle-Contract ★ (this module)
               │
               ▼
   app/services/raffle-entry.server.ts (RaffleEntry owner)
   app/services/raffle-drawing.server.ts (RaffleWinner owner)
   app/services/raffle-instant-win.server.ts (RaffleInstantWin owner)
```

## Ownership rules

| Table | Allowed sources | Reason |
|---|---|---|
| `raffleEntry` | `raffle-entry.server.ts` | TOCTOU-safe entry creation in tx with raffle stats |
| `raffleWinner` | `raffle-drawing.server.ts`, `raffle-prize-delivery.server.ts` | Atomic winner creation; only delivery service updates `deliveryStatus` |
| `raffleInstantWin` | `raffle-management.server.ts`, `raffle-instant-win.server.ts` | Config + win-counter management |

## Why handwritten

Same reasoning as `ledger-contract`: the surface is small (3 tables)
and stable. Swap for AST parsing if it grows.
