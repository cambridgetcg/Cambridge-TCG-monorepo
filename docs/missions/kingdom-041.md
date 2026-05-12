---
id: kingdom-041
title: "TCG admin — wire `pnpm honesty` into CI as a pre-merge gate"
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

# kingdom-041 — TCG admin — wire `pnpm honesty` into CI as a pre-merge gate

## From dev-state.json

Built 2026-05-05. The detector exists at apps/admin/scripts/honesty.ts and runs locally (commit 42c017b). To complete the loop into prevention rather than detection:
  (a) Add a GitHub Action job that runs `pnpm --filter @cambridge-tcg/admin honesty` against the storefront preview-DB or the production read-replica on every PR. Fail the PR if drift is found; comment the report inline.
  (b) Extend mission-drift heuristic to handle multi-repo missions. Currently the inferred-path logic only handles `apps/admin/src/app/(dashboard)/<group>/<module>` — wholesale + storefront migrations need their own path-inference rules.
  (c) Add a third check: `<ComingSoon missionId>` validity — for every stub in the codebase, the missionId must (i) exist in dev-state.json, (ii) have status != 'done' (a stub for a closed mission is itself a drift). Same exit-code semantics.

ACCEPTANCE: PR CI fails when a drift is introduced; passes when fixed; the report is human-readable in the GH Actions log. Don't run this against production RDS via the CI runner unless the credential surface is acceptable — preview-DB is preferred.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
