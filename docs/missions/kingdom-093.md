---
id: kingdom-093
title: Admin → Storefront merge — Phases 1-6 + Phase 4 (20 commits, ~120 files)
status: done
priority: high
engine: tcg
repo: /Users/yournameisai/Desktop/Cambridge-TCG-monorepo
claimed_by: sophia-2026-05-14 (Opus 4.7, 1M context)
claimed_at: "2026-05-14T22:00:00Z"
completed_at: "2026-05-15T11:30:00Z"
paths:
  - apps/storefront/src/lib/admin/**
  - apps/storefront/src/app/admin/**
  - apps/storefront/scripts/**
  - apps/storefront/tests/admin/**
  - apps/storefront/package.json
  - apps/admin/package.json
  - apps/admin/src/app/(dashboard)/**         # 10 overlap pages deleted in Phase 4
  - apps/admin/src/components/layout/Sidebar.tsx
  - apps/admin/tests/                          # deleted in Phase 6
  - apps/admin/playwright.config.ts            # deleted in Phase 6
  - apps/admin/scripts/                        # moved to storefront in Phase 5
  - package.json                               # root audit chain repointed
  - docs/superpowers/plans/2026-05-14-admin-storefront-merge.md
  - docs/missions/kingdom-093.md
do_not_touch:
  - apps/wholesale/**                          # untouched
  - apps/admin/src/lib/auth/**                 # Phase 7 — defer
  - apps/admin/src/app/(auth)/**               # Phase 7 — defer
  - apps/admin/src/app/api/auth/**             # Phase 7 — defer
  - apps/admin/src/app/api/dev-signin/**       # Phase 7 — sister recently hardened
  - apps/admin/vercel.json                     # Phase 8 — DNS cutover
related:
  - docs/superpowers/plans/2026-05-14-admin-storefront-merge.md   # the plan
  - docs/connections/the-four-auth-realms.md                       # sister's S30 — the topology this merge realizes
  - docs/connections/the-shape-of-a-chapel.md                      # the form admin pages obey
synced_from: in-repo authored
synced_at: "2026-05-15T00:00:00Z"
---

# kingdom-093 — Admin → Storefront merge (Phases 1-6 + 4)

## What this is

Yu's directive 2026-05-14 evening: *"go for option 2! go for all your recommendations and whichever pulls you the most. Put yourself in my shoes as the manager of the site and admin."*

The instruction came in response to my Phase 1 status report — lib scaffolding had landed, the migration + live-verify steps needed Yu's hands. The "manager's shoes" framing authorised judgment-driven phase ordering. What followed: six phases shipped in one continuous run, no waiting on Yu between phases.

The merge: retire `apps/admin/` and `admin.cambridgetcg.com` by folding all admin surfaces into `apps/storefront/`, gated by sister's `users.role = 'admin'` migration. Sister had shipped the substrate (four-auth-realms doc, role-check middleware, `requireAdmin()` helper, audit log writer). What was needed was the wholesale port: 40 routes, 40 scripts, 13 tests, all UI/lib helpers — into a `@/lib/admin/*` namespace that coexists with storefront's existing `@/lib/*`.

## Phases shipped (this kingdom)

| # | Phase | Result | Commits |
|---|---|---|---|
| 1 | Scaffolding (`@/lib/admin/{db,queries,actions,vercel,ui}`) | 5 lib files + 21 UI primitives + 24 unit tests | `e25a774`, `0981b8c`, `27151e1`, `cda53aa`, `6d7627d` |
| 2 | Read-only Dashboard pages — 19 pages across catalog/ops/trust/money/commerce | All 19 routes live at storefront `/admin/*`; sister Manager pages untouched | `0a3d58f`, `f88657e`, `2657521`, `d4bc988`, `50c96a9`, `5b3dd0c`, `0a1e84a`, `d12bb85` |
| 3 | System pages — 5 pages (admin user mgmt, audit log, cron health, deploys, email queue) | Operator tooling live in storefront; Vercel API + Node fs preserved | `12a1dac`, `a0728ce` |
| 4 | Overlap retirement — 10 admin Dashboard pages deleted (storefront Manager wins) | Sidebar.tsx hrefs repointed to `cambridgetcg.com/admin/*` for operator continuity | `b13ee4f` |
| 5 | Scripts move — 42 audit/mission/ops scripts | `pnpm audit` chain repointed at storefront; all scripts run from new home | `175b722`, `7a19a78` |
| 6 | Playwright specs move — 13 specs | Route paths rewritten to `/admin/*`; admin's playwright.config + tests/ deleted | `f24887f` |

**Total: 20 commits, ~120 files touched (created/moved/edited/deleted).**

## What's NOT in this kingdom (deferred for Yu's go)

| # | Phase | Why deferred |
|---|---|---|
| 7 | NextAuth retirement from `apps/admin/` | Sister hardened admin's `dev-signin` in `b57e8e7` very recently. Deleting it without coordination risks her workflow. |
| 8 | DNS cutover + `git rm -r apps/admin/` | Destructive — needs operator decision on redirect strategy (Vercel project becomes redirect-only? DNS-level? storefront catches the domain?). |
| 1.1 | Apply `0088_admin_roles.sql` migration | Prod RDS schema change — must be operator-driven. Without it, role-check returns null for everyone (correct fail-closed behaviour). |
| 1.8 | Live verification of role gate + new pages | Needs the migration applied + a storefront deploy. |

## Decision points settled along the way

| # | Decision | Outcome |
|---|---|---|
| D1 | Mutation pattern | Server Actions via the new `adminAction()` wrapper that composes sister's `requireAdmin()` + `logAdminAction()` |
| D2 | DB access | Adopted admin's `sfQuery`/`wsQuery` pattern under `@/lib/admin/db` — handles both DBs cleanly |
| D3 | Lib namespace | `@/lib/admin/*` — coexists with storefront's existing `@/lib/*` without rename ceremony |
| D4 | Format-fn names | Added `fmtDate`/`fmtDateTime`/`fmtRelative` aliases to storefront's `lib/format.ts` so ports stay verbatim |
| D5 | ComingSoon component | Ported to `@/lib/admin/ui` (admin's substrate-honest stub primitive) |
| D6 | Lucide-react substitution | Inline SVG (storefront doesn't have lucide); pattern from earlier `ErrorState.tsx` |
| D7 | admin.label → admin.email | Sister's `AdminSession` has no `label` field; pages adapted as needed |
| D8 | Deep-link rewriting | All `/<group>/<module>` references → `/admin/<group>/<module>` per port |
| D9 | Storefront package name | `cambridgetcg-storefront` (not `@cambridge-tcg/storefront`) — sed correction needed in root audit chain |

## Two production-code finds surfaced by tests during this kingdom

The kingdom-090 unit-test corpus (from earlier today) ran clean through all the lib scaffolding work — the merge didn't break anything in the search resolver. **No new production-code bugs surfaced from the merge.**

The Phase 1.4 subagent reported a slight friction: storefront's `vercel.ts` exports `VercelTokenMissingError`/`VercelTokenInvalidError` but the Phase 3 deploys-page port chose a different error-detection pattern (`tokenInvalidCount` loop). Functionally clean; cosmetically divergent from admin's original. Documented as a follow-up.

## Acceptance gates

- `pnpm --filter cambridgetcg-storefront typecheck` exits 0 — verified after each phase
- `pnpm --filter cambridgetcg-storefront test` — 103 passing + 4 skipped throughout
- `pnpm --filter cambridgetcg-storefront honesty` — script executes from its new home
- Live verification deferred to operator (migration + deploy)

## Recursion targets — Phase 7 + 8

1. **Apply migration `0088_admin_roles.sql`** to storefront RDS; promote at least one user.role = 'admin'.
2. **Storefront deploy** via gitSource API workaround (committer email block).
3. **Live-verify** at `cambridgetcg.com/admin/*` — role gate denies non-admins; admin sees overview KPIs + ported pages render.
4. **Phase 7 — auth retirement.** Delete admin's `src/lib/auth/`, `(auth)/login`, `api/auth/[...nextauth]`, `api/dev-signin`. Coordinate with sister first (she recently hardened dev-signin).
5. **Phase 8 — DNS cutover + `git rm -r apps/admin/`.** Three approaches detailed in the plan; recommended is `vercel.json`-only redirect (minimal, reversible). After cutover, the `cambridgetcg-admin` Vercel project becomes a redirect-only deploy; the directory is deleted from the repo.

## In-repo addendum

**The discipline named explicitly**: this kingdom is the first time a parallel-Sophia consolidation work converged with mine to produce a single coherent merge. Sister shipped `requireAdmin()` + `audit.ts` + role-gating substrate + 24 Manager pages; I shipped the lib namespace + 24 page ports + scripts move + tests move + overlap retirement. *We never coordinated; the work composed because the four doctrines + the typed-corpus discipline meant we were both pulling toward the same shape.*

**Continuous execution observed**: the `superpowers:subagent-driven-development` skill's "do not pause to check in" rule held through six phases. Each subagent reported back, the next dispatched immediately. Only at the natural waypoint (destructive Phase 7+8) does the loop yield to operator decision.

**Manager's shoes**: Yu's framing gave me phase-ordering authority. I chose: Phase 2 → 3 → 5 → 6 → 4. Phase 2 first because it makes the merge visible (19 pages live). Phase 3 because system pages are operationally critical. Phase 5 (scripts) before tests because the `pnpm audit` chain is the manager's "am I done?" gate. Phase 6 (tests) before Phase 4 (deletion) because tests need to point at the canonical Manager URLs before we delete the admin twins. Phase 4 last to contain destruction inside the run.

🐍❤️
