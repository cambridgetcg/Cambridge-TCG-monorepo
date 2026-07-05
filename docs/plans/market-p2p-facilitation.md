# The collectors' market — P2P facilitation build

**Will trace:** Asha, 2026-07-05 — "make cambridgetcg.com/market work, as little friction as
possible. P2P, facilitate collectors' trades, build communication channel for them, infra to
support the trade (logistics, prices). Rebuild the UI/UX to your liking."

**Ground truth this build stands on** (verified 2026-07-05): the exchange is ~90% built —
order book, matching, escrow tiers, Stripe pay, seller shipping, offers/counters, DMs,
disputes, payouts — but broken at the last mile. Production is additionally dark: both RDS
instances unreachable, AWS keys in Vercel invalid (magic-link email dead), deployment frozen
pre-manifest. Infrastructure resurrection is tracked separately; this plan is the code half.

## The loops this build closes

1. **A trade can finish without an admin.** Buyer "confirm received" endpoint + button
   (ported from the auction module's `buyerConfirmReceived`), plus an auto-complete sweep
   after the trade's own `dispute_window_hours` elapses. `completed_via` column keeps
   human-marked vs system-derived honest. Payout clock finally starts by itself.
   Fixes riding along: dead `/account/trades/[id]/pay` link, mark-shipped form hidden when
   `shipping_address` is NULL, `trade.carrier` column that never existed, review page
   fetching a route that doesn't exist (the trust loop's broken input), emails promising
   "24 hours" when the real window is the user's own.

2. **Negotiation is reachable.** A Make-Offer composer on the card page (the entire
   offers/counters/pricing-rules machine exists with zero UI callers), fair-price guidance
   inline (own-tape fair value, falling back to CTCG spot with provenance labels when the
   tape is cold), listing-time options (`accepts_returns`, `return_window_days`) so the
   returns module stops being dead code, and the offer-accept path routed through the same
   escrow routing + commission resolver + transaction as `placeOrder` (closes the
   escrow-bypass and oversell race).

3. **Collectors can talk — and hear.** DMs exist but are silent: no badge, no poll, no
   email. This build adds the nav unread indicator, thread polling, a `messages` email
   category riding the transport seam, block/opt-out enforcement at thread-open (today it
   only fires at send), newest-first thread reads, and a Message button at the pre-trade
   moment on the card page.

4. **The collector trade exists.** Card-for-card swap proposals (± recorded cash delta,
   settled between parties, honest copy about that): propose from a conversation, card page
   or profile; counter; accept; both sides ship with tracking; both confirm; done. Swaps are
   trust-gated by the same `canTrade()` and carry their own lifecycle log + methodology
   page. v1 deliberately does not feed the trust score — the methodology page says so.

5. **Entry is frictionless.** `/login` honors `?return=` (today it hardcodes `/account` and
   dumps mid-trade collectors at the account hub), market CTAs pass their path, first login
   auto-generates a collector handle so no trader ever renders as "—" at the moment trust
   matters most, and tier limits surface before submit instead of as a 403.

6. **The front door sells the market, not the house.** `/market` rebuilt collector-first:
   live book stats, search-first, quick actions, a dedicated `/market/list` flow with card
   autocomplete (today listing one card takes ~9 steps through an identity trap), lots and
   pulse as tabs, the house buylist demoted to a secondary card, wardrobe/Gallery tokens
   end-to-end. Lot purchases are paused honestly until lot fulfilment exists (today the
   money vanishes into a dead redirect).

## Deliberately out of v1

Swap escrow/fees, swap→trust coupling, carrier APIs/labels, multi-currency settlement,
Stripe-automated dispute refunds, lot fulfilment (purchases paused instead), DM
attachments, PRISM consolidation of the price sources (the wholesale API is dead; catalog
degrades honestly for now and the direct-DB read is the follow-up).

## Migrations

`0108_trade_completion.sql` (delivered_at, completed_via, carrier),
`0109_swap_proposals.sql` (swap_proposals, swap_proposal_items + lifecycle slot).
Applied to prod via `apps/storefront/scripts/migrate.mjs` once RDS is back.
