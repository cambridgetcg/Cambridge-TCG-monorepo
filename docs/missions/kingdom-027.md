---
id: kingdom-027
title: TCG /commerce/pricing — data sanity audit
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: "2026-05-05T04:35:00Z"
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-027 — TCG /commerce/pricing — data sanity audit

## From dev-state.json

Suspicious findings on /commerce/pricing as of 2026-04-30: KPI 'Manual override 11,358 differs from base' = 100% of catalog (filter likely broken or every price is overridden, making the filter useless). KPI 'Stale (>7d) 8,082' = 71% of catalog (price-snapshot cron runs daily 02:00 UTC per apps/wholesale/vercel.json — investigate why most stale). Inspect: (a) the SQL behind both filters in apps/admin/src/app/(dashboard)/commerce/pricing/page.tsx, (b) the price-snapshot + shopify-sync cron logs on Vercel for the wholesale project, (c) the cards table's last_synced_at distribution. ACCEPTANCE: either filters are corrected to be useful, or root cause documented (e.g., cron broken — filed as separate fix).

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
