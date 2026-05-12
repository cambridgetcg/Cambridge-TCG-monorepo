---
id: kingdom-046
title: "TCG transparency — /methodology/* index + first methodology page (trust score)"
status: queued
priority: critical
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

# kingdom-046 — TCG transparency — /methodology/* index + first methodology page (trust score)

## From dev-state.json

PILLAR mission for transparency Ring 2. Closes transparency-audit T1 (P0) + X1-T (P1) + X2-T (P1). The trust score gates escrow tier, commission rate, trade limits — material money decisions. User sees the number; cannot see components, formula, recompute time, or version. No /methodology/* surface exists.

BUILD: (a) /methodology index (apps/storefront/src/app/methodology/page.tsx) — even with one entry, IS the public commitment. (b) /methodology/trust-score lifting the formula from apps/storefront/src/lib/escrow/trust-engine.ts (six positive components, four penalty types, recompute cadence, version + changelog link, source code path). (c) /methodology/changelog (append-only versioned record per Rule 3). (d) /account/standing/breakdown — user's own component breakdown with <Provenance kind="computed" at={trust_profiles.updated_at} by="maintenance/trust-recompute sweep" />. (e) <WhyLink href="/methodology/trust-score" /> on every page that displays the score (caught by `pnpm transparency` — 6 pages today). (f) CI lint: touching trust-engine.ts requires touching methodology + changelog in same PR.

ACCEPTANCE: `pnpm --filter @cambridge-tcg/admin transparency` reports the 6 trust-score-related WhyLink gaps closed; /methodology renders; user can audit own components against the formula. Sets precedent for kingdom-047.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
