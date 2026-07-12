---
title: The Regulator
slug: the-regulator
kind: story-arc
flavour: story-as-wire
arc: S69
date: 2026-06-10
author: Sophia (Fable 5) + Yu
status: design-shipped / code-queued (kingdom-101..104)
cites:
  - apps/storefront/src/lib/market/unified.ts
  - apps/storefront/scripts/no-house-listing.ts
  - docs/methodology/regulator.md
  - docs/superpowers/specs/2026-06-10-regulator-pivot-design.md
---

# The Regulator (S69)

There is a moment in the life of a market where its keeper has to choose
what it is. For most of Cambridge TCG's life the answer was *a shop* — it
bought cards in Japan, marked them up, and sold them. Then it grew an order
book, and for a while it was both: a shop that also ran the bazaar it sold
inside. The house quoted on both sides of every card. `unified.ts` spliced
a CTCG ask and a CTCG bid into the book before anyone saw it, and a small
engine tightened those quotes when demand ran hot, so the house could lean
into imbalanced flow and take the better side. It was clever. It was also
the referee placing bets.

On the tenth of June, Yu said: *remove our retail operation completely.
Factor the stock into the market. We act as market regulator.*

The wire of this story is a subtraction. The platform's profit had been the
spread — the gap between what it paid the seller and what it charged the
buyer. A regulator has no spread; its profit is the commission other people
pay to trade safely, published and capped, on a book the regulator does not
stand in. So the house leaves the book. Not relabelled, not badged as
"official" — *gone*. The order book becomes what it always pretended to be:
peer to peer, all the way down. The catalog price survives only as a
*reference* — a price guide the platform will never honour, because the
platform sells nothing.

And the cards it already owned — fifty-nine thousand pounds of them, three
thousand six hundred and seventy units — do not get quietly liquidated back
into the market the platform just left. That would be the referee sneaking
back onto the pitch in a different shirt. Instead they become gifts: raffle
prizes, bounty pulls, mystery boxes, each with a reproducible draw receipt and
possible later Merkle inclusion. Server-only entropy does not prove non-selection. The regulator gives its inventory away rather than compete
with the people it regulates. The conflict of interest isn't *managed* — it
is *removed at the root*, which is the only place removing it counts.

The doctrinal weight here is real. Substrate honesty asked every value to
declare how it came to be true; this asks the *platform* to declare what it
is, and then makes the declaration enforceable. `pnpm audit:no-house-listing`
is the wire half — a static guard that fails the build if a house ask, a
retail checkout, a we-buy desk, or a "Buy from CTCG" ever creeps back. The
promise in `/methodology/regulator` and the tripwire in the audit are the
same sentence written twice, once for humans and once for CI.

This entry ships ahead of its own code. A sister was mid-surgery on the
exact files — opening the P2P market to barrier-free trade
(`feat/global-free-trade`), the complement of this removal — and two hands
cannot carve the same board at once. So the design, the declaration, and
the guard land first; the cutting (kingdom-101..104) follows the sister's
merge. The guard already prints the worklist: a hundred and thirty hits
across thirty-four files, the precise shape of the merchant the platform is
about to stop being.

*The platform makes the market legible and publishes its evidence and limits — and never
trades in it; the cards it owns, it gives away.*
