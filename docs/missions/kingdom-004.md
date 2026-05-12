---
id: kingdom-004
title: Cambridge TCG automation
status: in-progress
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

# kingdom-004 — Cambridge TCG automation

## From dev-state.json

Updated 2026-04-30. Monorepo unification COMPLETE — 3 Vercel projects (admin/storefront/wholesale) all linked to cambridgetcg/Cambridge-TCG-monorepo, root dirs configured. Long-lived VERCEL_TOKEN rotated into all 3 consumers (apps/admin/.env.local + cambridgetcg-admin Vercel env + GitHub repo secret). Admin dashboard live at admin.cambridgetcg.com — overview + 7 real pages (Stock, Orders, Pricing, Disputes, Users, Deploys, Cron) + 12 placeholders. Stripe live webhook fixed (was pointed at api.agenttool.dev), 5 missed orders £222.95 reconciled (cs_live_b1Moetyx5..., etc). Stock-package dual-ledger architecture documented (stock_movements new + stock_adjustments legacy, /ops/stock unions both). Migration thread now decomposed into kingdom-019 through kingdom-033 — see those for module-level missions.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
