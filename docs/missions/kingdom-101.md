---
id: kingdom-101
title: "Regulator pivot — de-retail the storefront (house out of the book, retail checkout removed)"
status: queued
priority: critical
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG-monorepo
claimed_by: ~
claimed_at: ~
completed_at: ~
paths:
  - apps/storefront/src/lib/market/unified.ts
  - apps/storefront/src/app/market/[sku]/page.tsx
  - apps/storefront/src/app/market/page.tsx
  - apps/storefront/src/app/api/market/catalog/route.ts
  - apps/storefront/src/app/product/[sku]/page.tsx
  - apps/storefront/src/app/checkout/**
  - apps/storefront/src/app/api/checkout/**
  - apps/storefront/src/context/CartContext.tsx
  - apps/storefront/src/components/cart/**
  - apps/storefront/src/app/api/webhooks/stripe/route.ts
  - apps/storefront/src/lib/orders/**
do_not_touch:
  - apps/storefront/src/lib/escrow/**        # regulator organ — keep
  - apps/storefront/src/lib/market/db.ts      # P2P book — keep (only stop injecting into it)
related:
  - docs/superpowers/specs/2026-06-10-regulator-pivot-design.md
  - docs/methodology/regulator.md
synced_from: in-repo
synced_at: "2026-06-10T22:00:00Z"
---

# kingdom-101 — Regulator pivot: de-retail the storefront

**The core of the pivot.** Yu, 2026-06-10: *"Remove our retail operation
completely. Factor [the stock] into the market. We act as market
regulator."* Full design in
[`docs/superpowers/specs/2026-06-10-regulator-pivot-design.md`](../superpowers/specs/2026-06-10-regulator-pivot-design.md);
public declaration in [`docs/methodology/regulator.md`](../methodology/regulator.md).

## Worklist (authoritative)

Run `pnpm audit:no-house-listing` — its output IS this worklist (130 hits
/ 34 files at writing). Clear it to zero, then flip the audit to `--strict`
and add it to the `audit` chain in root `package.json`.

1. **House out of the book** — `lib/market/unified.ts`: delete house-ask +
   house-bid injection, the tightening engine (`computeDemandPressure`,
   `MAX_TIGHTEN_PCT`, `tightenPct`, `ctcg_spread`, `p2p_discount` recompute
   from pure P2P), `HouseOrderEntry`. Keep `spot_price` renamed
   `reference_price` (catalog read), drop `spot_stock`. Second injection
   site: `/api/market/catalog` (`p2p_buyers` "+1", tradein mixing) and the
   `/market` index "CTCG buying" counter.
2. **Retail checkout removed** — delete `/checkout`, `/api/checkout`,
   `CartContext`, `CartDrawer`, `AddToCart`, `QuickAddButton`, and the
   retail PDP `/product/[sku]` (the `/cards/[sku]/market` read-mirror is
   the surviving card page; fix inbound links).
3. **Stripe webhook split** — `api/webhooks/stripe/route.ts`: delete retail
   fulfilment branch (`reportSale`, `recordOrderFromStripeSession`,
   `commitCartToSale`, store-credit debit, `processOrderRewards`) + retail
   reservation-release handlers. **Keep** escrow/lot/auction/subscription/
   Connect/dispute/refund/failed-payment branches. (B2B branch → kingdom-102.)
   `customer_orders`: delete retail writer (`lib/orders/record.ts` callers:
   webhook, `order-confirmation`, `reconcile-stripe` cron). Keep the table +
   the bounty-vault redemption writer.
4. **Copy** — remove "Buy from CTCG", "CTCG Spot/Sells at", "We Buy Every
   Card", `/cards/[sku]/market` footer "own retail offers", glossary:162,
   `methodology/store-credit`. **Edit inside the Gallery semantic tokens —
   do not revert the wardrobe/free-trade sisters' files.**

## ⚠️ Coordination (read before claiming)

As of 2026-06-10 22:30 a sister is mid-flight in worktree
`~/Desktop/ctcg-wardrobe` on branch **`feat/global-free-trade`** with
UNCOMMITTED edits to the *exact* Phase 1 file set: `unified.ts` (+101 lines),
`webhooks/stripe/route.ts`, `market/[sku]/page.tsx`, `lib/market/types.ts`,
`lib/market/db.ts`, `glossary`. Her theme (barrier-free P2P trade) is the
*complement* of this pivot (house out of P2P trade) — they compose, but two
hands cannot edit these files at once. **Land `feat/global-free-trade`
first, then execute this card against the merged result.** Re-run
`pnpm audit:no-house-listing` after her merge — the worklist may shrink.

## Acceptance

`pnpm verify` green; `pnpm audit:no-house-listing --strict` exits 0; empty
order books render on `/market/[sku]` + `/cards/[sku]/market`; preview-deploy
smoke confirms a P2P trade, an auction, and a membership still pay (escrow/
auction/subscription webhook branches intact); `/methodology/regulator`
renders and is registered in `manifest.ts`.

## In-repo addendum

*Beat 2026-06-10 (Fable 5): spec + methodology + the `no-house-listing`
guard + these cards shipped collision-free. Code execution deferred to a
coordinated pass after the free-trade sister's branch lands — documented
above. The guard makes the worklist precise and the end-state enforceable.*
