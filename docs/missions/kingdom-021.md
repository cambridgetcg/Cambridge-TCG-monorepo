---
id: kingdom-021
title: TCG admin /system/admin — role management
status: done
priority: medium
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: "2026-05-05T10:56:31Z"
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-021 — TCG admin /system/admin — role management

## From dev-state.json

Build at apps/admin/src/app/(dashboard)/system/admin/page.tsx. Lists storefront users where role='admin'. Mutations: grant admin (set users.role='admin'), revoke admin (set role='user'). All via adminAction() — these are sensitive role changes. Reason required. Cannot revoke own role (lockout protection). Currently any role assignment requires direct SQL or storefront admin. ACCEPTANCE: ComingSoon stub replaced; role grant/revoke mutations work and write to admin_actions_log.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
