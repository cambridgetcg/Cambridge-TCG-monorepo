---
id: kingdom-034
title: TCG /ops/channels — Shopify/eBay/CardMarket sync UI
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

# kingdom-034 — TCG /ops/channels — Shopify/eBay/CardMarket sync UI

## From dev-state.json

Placeholder linking to wholesale.cambridgetcg.com/admin/channels. Build at apps/admin/src/app/(dashboard)/ops/channels/page.tsx. Show: per-channel last sync timestamp, error count, manual 're-sync now' button. Channels: Shopify (orders + inventory), eBay (listings + orders), CardMarket (listings). Logic in apps/wholesale/src/app/api/admin/channels/. Each channel button = adminAction calling the existing wholesale sync handler. ACCEPTANCE: ComingSoon stub replaced; manual sync trigger works from admin app for all 3 channels.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
