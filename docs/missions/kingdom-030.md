---
id: kingdom-030
title: TCG /commerce/pricing — port S3 sync + CSV upload from wholesale
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

# kingdom-030 — TCG /commerce/pricing — port S3 sync + CSV upload from wholesale

## From dev-state.json

Pricing page inline-edit is wired in admin, but bulk operations still live in apps/wholesale: S3 price-feed sync + CSV upload at apps/wholesale/src/app/api/sync/. The pricing page header shows 'Open legacy ↗' link to wholesale.cambridgetcg.com/admin/prices for these. Port both into admin via Server Actions. Need: (a) S3 bucket access via @cambridge-tcg/aws, (b) CSV parser (consider papaparse), (c) preview-then-confirm flow for CSV uploads with row-level validation. All via adminAction. ACCEPTANCE: 'Out of scope for this pilot' banner removed from /commerce/pricing; both bulk paths run from admin app.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
