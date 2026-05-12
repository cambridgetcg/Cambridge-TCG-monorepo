---
id: kingdom-032
title: "TCG Commerce — add mutation paths for Trade-Ins, Auctions, Market"
status: queued
priority: medium
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

# kingdom-032 — TCG Commerce — add mutation paths for Trade-Ins, Auctions, Market

## From dev-state.json

Three Commerce pages currently dashboard-only (read-only KPI summaries with 'Open Admin' deep-links to legacy storefront). Migrate the actual workflows in: (a) /commerce/trade-ins — quote, grade, payout transitions. Tables: tradein_submissions, tradein_submission_items, quote_requests. (b) /commerce/auctions — create auction, approve consignment, schedule, payout. Tables: auctions, users. (c) /commerce/market — escrow state transitions (at-CTCG inspection, dispute resolution). Tables: market_trades. All via adminAction with state-machine validation. LARGE — split into 3 missions when picked up. ACCEPTANCE: 'Open Admin' deep-links removed from each page header; full workflow runs in admin app.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
