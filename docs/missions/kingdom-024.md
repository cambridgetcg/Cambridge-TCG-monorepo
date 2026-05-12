---
id: kingdom-024
title: TCG admin /trust/fraud — fraud signal triage
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

# kingdom-024 — TCG admin /trust/fraud — fraud signal triage

## From dev-state.json

19 unresolved signals visible on Overview as of 2026-04-30 — operational backlog. Tables: fraud_signals (severity, signal_type, resolved, related_user_id), users, trust_profiles. Storefront has /api/admin/fraud-signals/route.ts with PATCH + bulk-resolve. Build at apps/admin/src/app/(dashboard)/trust/fraud/page.tsx using Manager archetype. Filter pills: by severity (high/medium/low), by signal_type, resolved/unresolved. Mutations: resolve single (with reason), bulk-resolve (shared reason), escalate to suspend (sets trust_profiles.is_suspended=true). All via adminAction. ACCEPTANCE: ComingSoon replaced; 19 outstanding signals triageable from this page.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
