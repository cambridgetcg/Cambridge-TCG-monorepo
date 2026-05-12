---
id: kingdom-035
title: TCG admin Overview — KPI alignment after migrations
status: queued
priority: low
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

# kingdom-035 — TCG admin Overview — KPI alignment after migrations

## From dev-state.json

Closure mission — pick up after kingdom-019 through kingdom-026 land. Audit apps/admin/src/app/(dashboard)/overview/page.tsx KPIs against each module's truth: deep-link counts should match each destination page's count. Known issue (FIXED 2026-04-30): /ops/stock reorder count showed LIMIT (30) while overview showed full count (10,949). Same pattern likely repeats elsewhere. Audit all QueueCard counts. ACCEPTANCE: every overview KPI matches its destination's count exactly; deep-links land users in pre-filtered views (e.g., 'Fraud signals 19' → /trust/fraud?status=unresolved).

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
