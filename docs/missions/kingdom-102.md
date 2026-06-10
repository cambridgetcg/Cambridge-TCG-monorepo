---
id: kingdom-102
title: "Regulator pivot — retire wholesale B2B ordering + selling crons (keep the data plane)"
status: queued
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG-monorepo
claimed_by: ~
claimed_at: ~
completed_at: ~
paths:
  - apps/storefront/src/app/account/b2b/**
  - apps/storefront/src/lib/b2b/**
  - apps/wholesale/vercel.json
  - apps/wholesale/src/app/api/v1/**
do_not_touch:
  - apps/wholesale/src/app/api/cron/discover/**   # data plane — keep
  - apps/wholesale/src/app/api/cron/ingest/**      # data plane — keep
  - apps/wholesale/src/app/api/cron/cardrush-hires/**  # data plane — keep
related:
  - docs/superpowers/specs/2026-06-10-regulator-pivot-design.md
  - docs/missions/kingdom-101.md
synced_from: in-repo
synced_at: "2026-06-10T22:00:00Z"
---

# kingdom-102 — Retire wholesale B2B ordering

"Completely" includes B2B. Zero orders in 30 days; 3 clients. The wholesale
app **keeps running** — but only as the data plane (CardRush ingest, price
reference APIs), not as a sales channel.

## Worklist

1. **Close client ordering** — `/account/b2b/*` pages, `lib/b2b/checkout.ts`,
   the `b2b_orders` writer, the webhook B2B branch (coordinated with
   kingdom-101 §3). Table kept read-only. The 5 `submitted` + 4 `quoted`
   orders stale since April: email the 3 clients a closing note, mark
   `cancelled` with reason — honest, not silent.
2. **Retire selling-side crons** in `apps/wholesale/vercel.json`:
   `shopify-sync`, `shopify-orders`, `ebay-sync`, `rebuild-buylist`
   (we-buy pricing), `monthly-rollover` (B2B billing). **KEEP**
   `discover/cardrush`, `ingest/cardrush`, `cardrush-hires`.
3. **Buylist (we-buy) surfaces** retired.
4. **`/api/v1/*`**: keep price reference, `ingest-runs`, universal card,
   sets, prices, movers (market-data products — the regulator's public
   good). Retire B2B-commerce endpoints. Storefront price-read keys
   (`channel_api_keys` ids 1–3) stay.
5. **Shopify/eBay**: stop listing + order sync; document what goes dark.

## Acceptance

`pnpm verify` green (wholesale + storefront); the three cardrush crons still
run (check `ingest_run`); `/api/v1/prices` + `/api/v1/sets` still serve the
storefront; no B2B order can be placed; the 3 clients notified.

## In-repo addendum

*Anything an in-repo Sophia adds goes below this line.*
