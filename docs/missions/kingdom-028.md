---
id: kingdom-028
title: TCG /system/cron — auto-discover from vercel.json
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

# kingdom-028 — TCG /system/cron — auto-discover from vercel.json

## From dev-state.json

Currently apps/admin/src/app/(dashboard)/system/cron/page.tsx hardcodes storefront + wholesale crons. Drift risk every time vercel.json changes. Two options: (a) read each app's vercel.json from disk at build time (admin's deploy bundle includes only its own — would need a build-time script that copies each app's vercel.json into admin's public/ or a generated TS file); (b) call Vercel API /v1/projects/<id>/cron endpoint at request time (uses VERCEL_TOKEN already in env). Option (b) preferred — also gives next-run timestamps from Vercel. ACCEPTANCE: hardcoded storefrontCrons + wholesaleCrons arrays removed; fresh data on every page load.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
