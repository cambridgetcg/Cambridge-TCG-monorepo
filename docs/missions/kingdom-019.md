---
id: kingdom-019
title: TCG admin /system/audit — admin_actions_log reader
status: done
priority: critical
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: "2026-05-04T00:00:00Z"
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-019 — TCG admin /system/audit — admin_actions_log reader

## From dev-state.json

EASY WIN — data exists, no UI. Every adminAction() call writes to storefront admin_actions_log table (append-only governance log). Build the reader at apps/admin/src/app/(dashboard)/system/audit/page.tsx using Manager archetype (template: trust/disputes/page.tsx). Filters: actor, action, target_kind, date range. Columns: timestamp, actor, action, target, reason, before/after diff. Read-only — no mutations. Schema: query the storefront DB via sfQuery; columns include actor_user_id, actor_label, action, target_kind, target_id, before_json, after_json, reason, created_at. ACCEPTANCE: replaces the ComingSoon stub; renders real audit rows; pagination works.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
