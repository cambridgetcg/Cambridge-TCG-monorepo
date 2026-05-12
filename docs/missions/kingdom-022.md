---
id: kingdom-022
title: TCG admin Money module migration — Chargebacks first
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: "2026-05-05T03:45:00Z"
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-022 — TCG admin Money module migration — Chargebacks first

## From dev-state.json

ENTIRE MONEY MODULE IS PLACEHOLDER (4 pages). Start with Chargebacks (Stripe deadline-driven, most operationally urgent). Canonical logic exists at apps/storefront/src/lib/chargebacks/ + storefront route /api/admin/chargebacks/route.ts. State machine: open → won/lost/warning_closed/charge_refunded/admin_resolved. Tables: chargebacks, users, trust_profiles, customer_orders. Build at apps/admin/src/app/(dashboard)/money/chargebacks/page.tsx using Disputes pattern (state-machine transitions via adminAction). Then sequence: Payouts → Membership → Rewards (separate sub-missions when Chargebacks lands). ACCEPTANCE: Chargebacks list renders, status transitions persist, governance logged.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
