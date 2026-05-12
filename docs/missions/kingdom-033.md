---
id: kingdom-033
title: TCG /ops/fulfillment — pick lists + shipping labels + tracking
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

# kingdom-033 — TCG /ops/fulfillment — pick lists + shipping labels + tracking

## From dev-state.json

Currently a placeholder. /ops/orders shows 'tracking: —' for every order because there's no fulfillment pipeline. Decide first: storefront or wholesale order fulfillment (or both)? Then build: (a) pick list generation from open paid orders, (b) shipping label creation (carrier integration — Royal Mail / EVRi / DHL), (c) tracking number capture, (d) writeback to customer_orders.tracking_number/carrier/shipped_at, (e) dispatch email trigger. LARGE — multi-week. Will likely need new shipping_labels + carrier_integrations tables. ACCEPTANCE: orders move from paid → shipped → delivered with admin click-through; tracking visible on /ops/orders.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
