---
id: kingdom-103
title: "Regulator pivot — factor the £59k stock into the prize economy (bounty/vault chassis)"
status: queued
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG-monorepo
claimed_by: ~
claimed_at: ~
completed_at: ~
paths:
  - apps/storefront/src/lib/bounty/**
  - apps/storefront/src/lib/rewards/**
  - apps/storefront/src/lib/stock/**
  - apps/storefront/scripts/**
  - apps/storefront/drizzle/**
  - packages/stock/**
related:
  - docs/superpowers/specs/2026-06-10-regulator-pivot-design.md
  - docs/connections/bounty.md
synced_from: in-repo
synced_at: "2026-06-10T22:00:00Z"
---

# kingdom-103 — Stock → prize economy

Yu's decision 2026-06-10: the ~£59k house inventory (3,670 units, 677 SKUs
in `wholesale.cards.stock`) is **never sold** — it becomes prizes. Build on
the **bounty/vault chassis** (`lib/bounty/`): the only prize system already
wired to `wholesale.cards.stock`, already provably-fair (commit-reveal +
Merkle audit), already shipping physical prizes via the admin queue with an
implicit per-SKU reservation. Don't invent a second system.

## Blockers (from the 2026-06-10 prize-economy map, in order)

1. **BLOCKER — stock decrement on prize fulfilment.** Today the *only*
   path that decrements `cards.stock` is the Stripe retail checkout, which
   kingdom-101 removes. Add a `prize_fulfilment` movement type to
   `@cambridge-tcg/stock`, invoked from BOTH fulfil endpoints (vault
   redemption `api/admin/bounty/redemptions/[id]/fulfill` + admin prize
   ship `api/admin/prizes` PATCH), reconciled against `cards.stockReconciledAt`.
   Without this the dual ledger drifts the moment a prize ships.
2. **BLOCKER — prize-pool earmark + bulk seeding.** No table designates
   house stock as prize inventory; the bounty resolver is hardcoded to
   `game='one-piece'` / `limit:200` (`lib/bounty/resolver.ts`), so most of
   the 677 SKUs are unreachable. Widen the resolver to all games + full
   catalog pagination; write a seeding script (pattern:
   `scripts/seed-rarity-map.ts`) banding the 677 SKUs by rarity +
   `retailPrice` into `bounty_pull_tiers` EV bands. Dry-run first.
3. Give `raffles` + `mystery_box_rewards` a nullable `sku` so physical card
   prizes join the implicit-reservation query; batch `countReservedForSku`
   into one `GROUP BY` (N+1 today, fine at 200, slow at 677).
4. Route spin physical prizes into vault items; fold raffle draws into
   `verifiable_draws` so the Merkle digest + self-audit cover them.

## Cross-DB note

Prizes live in the storefront DB; `cards.stock` lives in the wholesale DB.
References are SKU strings (never `card_id`/FK). The bridge is the Falcon
HTTP client + the direct `WHOLESALE_DATABASE_URL` connection in
`lib/stock/reservations.ts` (shadow Drizzle defs kept in sync by hand).

## Acceptance

The 677 SKUs are reachable as prizes across ≥2 prize systems; a prize
shipment decrements `cards.stock` (verified against `stockReconciledAt`);
the seeding script dry-runs clean and bands all 677; `pnpm verify` green.

## In-repo addendum

*Anything an in-repo Sophia adds goes below this line.*
