---
id: kingdom-036
title: TCG admin — Playwright-driven dev infra + smoke regression
status: done
priority: high
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

# kingdom-036 — TCG admin — Playwright-driven dev infra + smoke regression

## From dev-state.json

FORCE-MULTIPLIER mission. Every Cambridge TCG admin migration mission (kingdom-019..035 + future module work) needs verifiable acceptance — currently builders ship pages and humans eyeball them. Playwright MCP is available in Claude Code sessions (interactive browser snapshots, console capture, screenshots — used effectively in 2026-04-30 Cowork audit). Build the infra so every Love builder uses it during dev, and so a regression suite catches breakage on every commit. Multi-phase deliverable, autonomous spawn-friendly.

PHASE 1 — Project MCP config + dev-signin smoke runner.
  (a) Add /Users/you/Desktop/Cambridge-TCG/.mcp.json registering the Playwright MCP server (stdio: 'npx -y @playwright/mcp@latest --headless' with project-relative output dir). Reference: ~/Desktop/rewardspro-production/.mcp.json structure. This makes Playwright MCP available to every CLI session opened in this repo without per-session config.
  (b) Add apps/admin/scripts/smoke-admin.ts — a script that boots the admin dev server (or hits localhost:3002 if already running), walks every /(dashboard)/* route discovered from the filesystem, captures console errors + HTTP status + page title, and outputs a markdown report. Auth via GET /api/dev-signin. No assertions — just observation.
  (c) Wire as `pnpm --filter @cambridge-tcg/admin smoke` in package.json. Runs in <60s. Every Love builder mission ends by running this — failures gate completion.

PHASE 2 — Per-archetype Playwright spec templates.
  (a) Adopt @playwright/test (NOT just MCP — the test runner is for CI). Install in apps/admin/, baseUrl from ADMIN_BASE_URL env (defaults http://localhost:3002).
  (b) apps/admin/tests/manager.template.spec.ts — Disputes-pattern test (loads list, clicks row, runs a reversible state transition, asserts list refresh + audit log row). Used as copy-paste template for: chargebacks, fraud, payouts, membership, kyc, etc.
  (c) apps/admin/tests/dashboard.template.spec.ts — Dashboard-pattern test (loads page, asserts KPI counts against direct sfQuery/wsQuery, verifies deep-link href targets). Used for: trade-ins, auctions, market.
  (d) apps/admin/tests/smoke.spec.ts — generated from PHASE 1's discovery, asserts every route returns 200 and emits zero console errors.
  (e) Document the workflow in apps/admin/CLAUDE.md: 'When you build a new admin page, copy the matching template.spec.ts, fill in the assertions, run `pnpm --filter @cambridge-tcg/admin test:e2e` before claiming acceptance.'

PHASE 3 — CI integration against preview deployments.
  (a) Add .github/workflows/admin-e2e.yml — runs on every PR touching apps/admin/**. Uses Vercel preview URL (the GitHub Actions deployment-status webhook fires when preview is ready). Configure ADMIN_BASE_URL=<preview-url>, run all admin specs.
  (b) Auto-comment results on the PR (pass/fail per route + screenshot of any failures).
  (c) Production smoke: extend .github/workflows/health.yml's hourly run to invoke smoke.spec.ts against admin.cambridgetcg.com (using a long-lived dev-signin or a service-account session). Surface regressions as a 'deploy-health' issue update.

PHASE 4 — Visual regression baselines.
  (a) Use Playwright's snapshotPath + toMatchSnapshot for golden-pixel comparisons of every page. Initial baselines committed under apps/admin/tests/__snapshots__/.
  (b) Cron-driven baseline refresh on main when intentional UI changes land — gate on human approval via PR review.
  (c) Gives early signal on UI drift (e.g., a Tailwind class rename breaking layout that smoke alone would miss).

PHASE 5 — Builder ergonomics: 'verify' command for autonomous CLIs.
  (a) Add /verify slash command (skill) at apps/admin/.claude/skills/verify.md OR a top-level repo skill that any Love session can invoke. Behaviour: run smoke + run e2e for the touched module(s) + summarize. Replaces the eyeball-then-claim-done pattern.
  (b) Document in /Users/you/Love/COWORK.md and apps/admin/CLAUDE.md so coordinators know to instruct builders 'end with /verify before reporting acceptance.'

DEPENDENCIES: kingdom-019 needs PHASE 1 to land first (so its acceptance check is verifiable). PHASE 2-5 can land iteratively. Don't block module migrations on PHASE 4-5.

ACCEPTANCE: (1) `pnpm --filter @cambridge-tcg/admin smoke` runs in <60s and reports all 22 admin routes; (2) one Manager spec + one Dashboard spec runs green via @playwright/test; (3) GitHub Action runs admin specs against preview URL on PR; (4) CLAUDE.md updated with the workflow so future Love builder missions follow it.

NON-GOALS: Storefront e2e tests (separate scope). Wholesale admin e2e (legacy, getting migrated away). Cross-browser (Chromium-only is fine for admin — internal tool).

WHEN PICKED UP BY ALPHA/BETA/GAMMA: this is a meta mission — it builds the loom that weaves the rest. Do PHASE 1 in a single session; subsequent phases can be follow-up missions if scope demands.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
