---
id: kingdom-029
title: TCG wholesale crons — schedule audit + Shopify silence
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

# kingdom-029 — TCG wholesale crons — schedule audit + Shopify silence

## From dev-state.json

Two findings from 2026-04-30 stock investigation. (1) apps/wholesale/src/app/api/cron/stock-correct/route.ts exists but is NOT scheduled in apps/wholesale/vercel.json — dead code or missing cron entry. Decide: schedule it (add */N cadence) or delete the route. (2) shopify-orders cron runs every 30min but stock_movements table has 0 rows (the cron's recordSale path) — either no Shopify orders flowing, or the cron is failing silently. Verify by: querying Vercel cron logs for the wholesale project, hitting Shopify Admin API directly, or instrumenting the cron with explicit log lines. ACCEPTANCE: stock-correct decision committed; Shopify cron status confirmed (orders flowing, or root cause documented).

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
