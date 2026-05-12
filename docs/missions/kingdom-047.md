---
id: kingdom-047
title: "TCG transparency — methodology pages for tier, fees, escrow, fraud-categories, pricing"
status: queued
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: ~
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-047 — TCG transparency — methodology pages for tier, fees, escrow, fraud-categories, pricing

## From dev-state.json

Continuation of kingdom-046 once the trust-score precedent lands. Each is a methodology page + a few WhyLink drop-ins:
  - /methodology/membership-tiers (audit T2 P0) — Bronze/Silver/Gold/Platinum/OG thresholds, perks, recompute cadence. WhyLink on /membership, /account/membership.
  - /methodology/fees (audit T10 P1) — selling fees, escrow fees, payout fees, currency conversion. Linked from /auctions/sell, /account/payouts, market trade flow.
  - /methodology/escrow-tiers (audit T4 P1) — Direct/Verified/Full routing decision tree. WhyLink on /account/trades/[id] + market trade detail.
  - /methodology/fraud-categories (audit T5 P0) — published category granularity (NOT individual signal types — preserves circumvention safety). Linked from /account/standing fraud-flag display + sign-in error page when locked out.
  - /methodology/pricing (audit T3 P1) — JPY → £ conversion path, margin (8% wholesale, channel-specific retail multipliers), VAT, flat fee, rounding, daily sync cadence. WhyLink on /market/[sku], /catalog, /product/[sku], /prices/one-piece, /trade-in, /page.tsx (root). **Phase 5 of kingdom-049 (pricing consolidation) is FOLDED here as of 2026-05-10** — cite docs/pricing-current-state.md as the source-of-truth doc for the formula and `packages/pricing/src/index.ts` (created in Phase 1) as the source code path.

ACCEPTANCE: `pnpm transparency` reports all WhyLink gaps closed for these surfaces; /methodology index has 5+ entries; each methodology page cites a source code path. Each sub-page is independent.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
