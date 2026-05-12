---
id: kingdom-023
title: "TCG admin Money module — Payouts, Membership, Rewards"
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: "2026-05-10T12:00:00Z"
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-023 — TCG admin Money module — Payouts, Membership, Rewards

## From dev-state.json

SHIPPED 2026-05-09 → 2026-05-10 — Money trinity closed. (a) /money/payouts (2026-05-09): outstanding + recent payouts queue from market_trades + auctions; recordPayout Server Action for manual records (bank/PayPal/crypto/store_credit/stripe_connect/other). Stripe Connect transfers + balance verification still deep-link to legacy until storefront's Stripe + Connect helpers are extracted to a shared package — flagged as follow-up. Methodology: docs/methodology/payout-holds.md. (b) /money/membership (2026-05-09): read-only Dashboard with five tier cards from `tiers` table joined to per-tier user counts + spend rollups; tier_source provenance surfaced (spending/subscription/manual). No mutations; tier perk editing stays in legacy. Methodology: docs/methodology/membership.md. (c) /money/rewards (2026-05-10): unified prize-fulfilment queue across raffles + mystery_box_opens + pack_opens with same-user+address clustering; three Server Actions (shipPrize, bulkShipCluster, markFulfilled). Undo deep-links to legacy until prize_fulfilment_log eligibility helper is extracted. Raffle/box config stays in legacy. Methodology: docs/methodology/prize-fulfillment.md. All three: typecheck + smoke (27/27 routes 200) + browser-verified. Twelve-promises.md shrunk three rows. Pattern named in docs/connections/the-shape-of-a-chapel.md (S15) for future chapels to inherit.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
