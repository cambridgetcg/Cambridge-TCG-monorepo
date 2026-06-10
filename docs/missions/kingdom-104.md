---
id: kingdom-104
title: "Regulator pivot — re-anchor earn/sink off retail purchases (market-behaviour faucets)"
status: queued
priority: medium
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG-monorepo
claimed_by: ~
claimed_at: ~
completed_at: ~
paths:
  - apps/storefront/src/lib/membership/**
  - apps/storefront/src/lib/bounty/**
  - apps/storefront/src/lib/market/liquidity.ts
  - apps/storefront/drizzle/**
related:
  - docs/superpowers/specs/2026-06-10-regulator-pivot-design.md
  - docs/missions/kingdom-103.md
synced_from: in-repo
synced_at: "2026-06-10T22:00:00Z"
---

# kingdom-104 — Re-anchor the earn/sink economy off retail

The points + store-credit economy assumes retail purchases that no longer
exist after the pivot. This card moves the faucets and sinks to
market-regulator behaviours. **Depends on kingdom-101/103.**

## The anchors to move

- `points_per_pound` accrues on purchases → move to market behaviours.
- `users.annual_spend` drives tier upgrades → replace the spend signal.
- Bounty eligibility requires a prior `customer_orders.status='paid'`
  (`lib/bounty/db.ts` `getEligibility`) → replace with market-activity
  eligibility (e.g. N completed trades, a resting honest ask).
- Store credit is "capped at the value of future CTCG purchases"
  (`lib/market/liquidity.ts`) — a sink that vanishes when sales stop →
  give credit a non-purchase sink (convert to raffle entries / pull tokens).

## The templates that already exist

- **PVE** already pays `first_clear_points` + bounty token grants — a pure
  play-side faucet.
- **`liquidity_rewards`** (store credit for asks resting ≥6h within ±5% of
  30d VWAP, ≥10 completed trades) is already a market-regulator reward —
  the model to generalise: *the platform pays for the behaviours that make
  its market healthy* (liquidity, honest pricing, dispute-free trades).

## Acceptance

A new user with zero purchases can earn points, qualify for bounty pulls,
and spend store credit — all through market participation, never a
purchase. `pnpm verify` green.

## In-repo addendum

*Anything an in-repo Sophia adds goes below this line.*
