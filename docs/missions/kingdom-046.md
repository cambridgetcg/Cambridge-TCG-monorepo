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

### Beat 2026-06-03 (interactive Sophia, Yu away) — part (e) precedent set

Sisters already shipped parts (a)+(b): `/methodology` index + `/methodology/trust-score`, plus `commission-rate`, `fraud-flag`, `escrow-tier`, `payout-hold`, etc. So part (e) — wiring `<WhyLink>` onto pages that display the scores — is no longer blocked. **Transparency audit 11 → 9 this beat** (verified via `pnpm audit:transparency`). Two pages wired as the exemplary precedent (both confirmed gone from the audit):

- `apps/admin/src/app/(dashboard)/catalog/users/page.tsx` — `trust_score` → `<WhyLink>` in the **Trust** column header → `https://cambridgetcg.com/methodology/trust-score`
- `apps/admin/src/app/(dashboard)/commerce/market/page.tsx` — `commission` → `<WhyLink>` on the header line → `https://cambridgetcg.com/methodology/commission-rate`

**Pattern for the rest:** admin pages `import { WhyLink } from "@/lib/ui"`; `<PageHeader>` has a first-class `whyLink` prop; `Column.header` accepts `ReactNode` (place next to the value). Audit closes a finding when the page body contains a `WhyLink` token *or* a `/methodology/` link (`apps/admin/scripts/transparency.ts:120`).

**Remaining 9 (next beats):**
- admin: `money/chargebacks` (trust_score→trust-score, severity→fraud-flag), `overview` (fraud_signal→fraud-flag — borderline: it's an op count already linking to /trust/fraud), `trust/fraud` (trust_score, severity, auto_action, fraud_signal — needs per-score links)
- storefront legacy admin (uses storefront `@/lib/ui` WhyLink, internal `/methodology/...` hrefs): `admin/chargebacks`, `admin/fraud`, `admin/fraud-signals`, `admin/market` (commission_rate), `admin/tiers` (commission)
- `apps/storefront/src/app/og/page.tsx` — **likely false positive** (OG-image route; "commission" probably in copy, not a displayed score). Verify before wiring.

**Honesty note:** multi-score pages need one link *per score* for genuine transparency, not a single audit-satisfying link. Status left `queued` — kingdom-046 also still needs (c) `/methodology/changelog`, (d) `/account/standing/breakdown`, (f) CI lint. Work landed on branch `heartbeat/transparency-whylink` (local only; `github/main` is force-rewound — consolidation onto the shared branch is a Yu decision).

**Update — beat 13:32 GMT (same branch):** transparency **9 → 7**. Two more closed via the first-class `<PageHeader whyLink>` prop (cleaner than fragile inline JSX on multi-score tables):
- `trust/fraud` → `/methodology/fraud-flag`
- `money/chargebacks` → `/methodology/fraud-flag`

Admin half now done **except `overview`** (fraud_signal is an op count inside a `QueueCard` grid — needs a link near the card or a small component tweak; lower priority). Remaining 7: `overview` + the 5 storefront legacy-admin pages (storefront `@/lib/ui` WhyLink + internal `/methodology/...` hrefs) + the `og` false-positive. Typecheck green; full `pnpm verify` still pre-existing-red (a sister is on `heartbeat/fix-verify-gate`).

**Assessment — beat 14:33 GMT: the genuine WhyLink debt is captured; the rest is tailings.** Verified the remaining 7 are NOT real per-entity-score gaps — do not grind them to zero the audit (that games the heuristic without adding transparency, which the doctrine forbids):
- `apps/storefront/src/app/og/page.tsx` — **confirmed false positive.** `0% P2P commission` is marketing copy on the OG/landing route, not a computed score. Never wire.
- 5 storefront `/admin/*` pages — **legacy/transitional.** The admin app is migrating *off* these (admin CLAUDE.md: "until that surface migrates", "↗ legacy" affordances); their durable replacements (the admin-app pages) are already wired. Wire only if confirmed staying.
- `overview` — **borderline.** fraud_signal is 1 of ~15 operational *counts* on a queue dashboard, not a per-entity score, and its methodology link already lives on `/trust/fraud` (wired this session).

**Better next steps for kingdom-046** than chasing the audit number: parts (c) `/methodology/changelog`, (d) `/account/standing/breakdown`, (f) the CI lint — plus a tiny `transparency.ts` refinement so marketing copy (`og`) and op-count dashboards (`overview`) stop tripping the WhyLink heuristic. The four durable, user-facing derived-score surfaces all carry their methodology link now; that was the real T1 debt.
