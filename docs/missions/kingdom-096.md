---
id: kingdom-096
title: Global free trade — verification gates off; reputation, messaging, and global logistics wiring at the point of trade
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-06-10-evening (Fable 5)
claimed_at: "2026-06-10T15:50:00Z"
completed_at: "2026-06-10T17:30:00Z"
paths:
  - apps/storefront/src/app/api/market/orders/route.ts
  - apps/storefront/src/app/api/market/lots/route.ts
  - apps/storefront/src/app/api/market/lots/[id]/buy/route.ts
  - apps/storefront/src/app/api/trust/disputes/route.ts
  - apps/storefront/src/lib/escrow/trust-engine.ts
  - apps/storefront/src/lib/escrow/types.ts
  - apps/storefront/src/lib/payouts/sweep.ts
  - apps/storefront/drizzle/0105_trade_shipping_address.sql
  - apps/storefront/src/app/api/market/trades/[id]/pay/route.ts
  - apps/storefront/src/app/api/market/trades/[id]/ship/route.ts
  - apps/storefront/src/app/api/market/trades/[id]/route.ts
  - apps/storefront/src/app/api/market/trades/route.ts
  - apps/storefront/src/app/api/webhooks/stripe/route.ts
  - apps/storefront/src/lib/market/db.ts
  - apps/storefront/src/lib/market/types.ts
  - apps/storefront/src/lib/market/email.ts
  - apps/storefront/src/lib/market/unified.ts
  - apps/storefront/src/lib/market/lots.ts
  - apps/storefront/src/lib/market/offers.ts
  - apps/storefront/src/lib/messages/db.ts
  - apps/storefront/src/lib/ui/MessageButton.tsx
  - apps/storefront/src/lib/ui/Icon.tsx
  - apps/storefront/src/app/api/messages/route.ts
  - apps/storefront/src/app/api/messages/conversations/route.ts
  - apps/storefront/src/app/account/messages/page.tsx
  - apps/storefront/src/app/u/[username]/page.tsx
  - apps/storefront/src/app/market/[sku]/page.tsx
  - apps/storefront/src/app/market/lots/page.tsx
  - apps/storefront/src/app/market/lots/[id]/page.tsx
  - apps/storefront/src/app/account/offers/page.tsx
  - apps/storefront/src/app/account/trades/page.tsx
  - apps/storefront/src/app/account/trades/[id]/page.tsx
  - apps/storefront/src/app/api/escrow/reviews/route.ts
  - apps/storefront/src/app/methodology/trust-score/page.tsx
  - apps/storefront/src/app/methodology/trust-score/summary.md
  - apps/storefront/src/app/methodology/fraud-flag/page.tsx
  - apps/storefront/src/app/glossary/page.tsx
  - apps/storefront/src/app/account/verify/page.tsx
  - apps/storefront/src/app/api/trust/verify/route.ts
  - docs/methodology/trust-score.md
  - docs/principles/transparency.md
  - docs/superpowers/specs/2026-06-10-global-free-trade-design.md
  - docs/connections/the-open-floor.md
  - docs/missions/kingdom-096.md
do_not_touch:
  - apps/storefront/src/lib/reviews/**       # gates/sweep/moderation — already policy-ready, composed not modified
  - apps/storefront/src/lib/fraud/**         # signals/sweep/auto-suspend — the remaining brakes, unchanged
  - apps/storefront/src/lib/escrow/service-tiers.ts  # escrow routing by trust — the wiring the policy keeps
---

# kingdom-096 — Global free trade

## Will

Yu, 2026-06-10: *"actually no need verification. Just have acc is ok. ppl will leave reviews gah lah. Let people build their reputation and trust. and dont limit to uk. Global free trade. Let them figure out the logistics if they wanna do international. We provide the connection and wiring, also the messaging and reputation checker."*

## What shipped

1. **Gates off** — all four `isUserVerified` blocks removed (place order, create lot, buy lot, raise dispute) plus both client walls. Account + trust-tier limits (`canTrade`) are the whole entry requirement.
2. **Reputation re-weighted & made visible** — trust formula now completion 35 + reviews 30 + volume 15 + age 10 + external 10 (verification component removed, dated note in methodology); seller tier/rating/review-count visible at `/market/[sku]` (best-ask seller + tape), lot cards + detail, offers rows; the orphaned review form gains CTAs on terminal trades; refunded trades reviewable.
3. **Global wiring** — Stripe pay collects a shipping address from any Stripe-supported country (237 codes); webhook persists it to `market_trades.shipping_address` (migration 0105); seller sees it on the trade page + seller-paid email (the email's old promise, kept); counterparty **emails removed** from trades APIs; new seller-gated `POST /trades/[id]/ship` for self-serve dispatch + tracking.
4. **Messaging as pillar** — `MessageButton` primitive; reference-typed conversations (`market_trade|market_lot|offer|auction|market_order`) with server-side allowlist + sender-relationship validation (closes the forged-reference phishing vector); wired at lot/offer/trade/profile contexts; notifications deep-link the thread.
5. **Brakes hardened** — `hold_payout` fraud auto-action now actually holds payouts (sweep join); `UNVERIFIED_HIGH_VALUE` (producerless) deleted; public order-book payload shielded from the new address column.
6. **Transparency, same arc** — trust-score trio + glossary + transparency example + fraud-flag list rewritten; `/account/verify` reframed as optional ("Trading needs an account, not an identity").

## Verification

`pnpm verify` exit 0; tsc clean; live smoke on real data (trade form un-gated signed-out→sign-in only; reputation panel renders when a P2P ask exists). Deploy requires migration 0105 against the storefront prod DB **before** the code (webhook writes the column).

## Queued

Global (non-UK) identity verification + public verified badge; `/methodology/global-trade` page; review-prompt emails; international dispute-window tuning; `block_trade` auto-action enforcement; drop `country='GB'` stamp on verification approval.
