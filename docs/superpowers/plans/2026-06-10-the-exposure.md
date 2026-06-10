# The Exposure — Implementation Plan (spine + agent surface + infra lanes)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the monorepo the verified production source of cambridgetcg.com (kingdom layer live), with an honest manifest, green local verify, fixed CI files, and the wholesale ebay-sync port — while a parallel session ships the human-UI half.

**Architecture:** Serial git-spine work on `main` (merges → port → verify → push), then Vercel cutover verification via API, then additive surface work (audit script, manifest registrations) that touches files the parallel session does not own (it owns: page.tsx/nav/footer/ui-primitives/globals.css).

**Tech Stack:** git, gh CLI, Vercel REST API, pnpm 9.15, Next.js App Router, tsx scripts, vitest.

**Live-racing rule:** before every git mutation, run `git status --porcelain` + `git log --oneline -1`; if the parallel session moved HEAD, re-read context before proceeding. Never run long verify with uncommitted local edits.

---

### Task 1: Merge the rescue branch (June 6 force-dropped work)

**Files:** merge of `rescue/june6-membership-payments` (5 commits: store-credit cap transparency, Stripe async-settlement safety, prices null-guard, membership Pro ×2).

- [ ] Step 1: `git status --porcelain` clean check.
- [ ] Step 2: `git merge rescue/june6-membership-payments --no-ff -m "merge: rescue June 6 force-dropped arc (membership Pro, payments safety, prices guard, store-credit transparency)"` — body includes Will-trace (Yu directive 2026-06-10, smoothing infra) + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- [ ] Step 3: Resolve conflicts (expected: `apps/storefront/src/app/methodology/page.tsx`, pillow-book, possibly manifest.ts — prefer union of both sides; verify each conflict against both parents' intent).
- [ ] Step 4: `pnpm typecheck` → expect exit 0.
- [ ] Step 5: `pnpm --filter cambridgetcg-storefront test` → expect 107+ passed.

### Task 2: Merge PR #9 (agent/youspeak) locally and close the PR

**Files:** merge of `origin/agent/youspeak` (adds `/api/v1/youspeak` + lexicon, llms.txt + manifest + status registrations; +1256/−0).

- [ ] Step 1: `git merge origin/agent/youspeak --no-ff` with trace trailers as Task 1.
- [ ] Step 2: Resolve conflicts (expected: `manifest.ts`, `llms.txt/route.ts`, `status/route.ts` vs inherited-tree versions — keep both registrations).
- [ ] Step 3: `pnpm typecheck` → exit 0.
- [ ] Step 4: After main is pushed (Task 5), `gh pr comment 9` noting merge-by-local + `gh pr close 9`.

### Task 3: Port the ebay-sync trio into apps/wholesale

**Files:**
- Create: `apps/wholesale/src/app/api/cron/ebay-sync/route.ts` (from `/tmp/legacy-wholesale/src/app/api/cron/ebay-sync/route.ts`, 99 LOC; swap inline secret check → `requireCronAuth` from `apps/wholesale/src/lib/cron-auth.ts` per house pattern)
- Modify: `apps/wholesale/vercel.json` (add `{"path": "/api/cron/ebay-sync", "schedule": "0 */6 * * *"}` to `crons`)
- Modify: `apps/wholesale/src/lib/channels/__tests__/ebay.test.ts:~137` (add `mockFetch.mockClear()` in `beforeEach`, expectation 91→115, per legacy fix)

- [ ] Step 1: Run wholesale tests first to confirm the stale assertion fails or passes today: `pnpm --filter tcg-wholesale test 2>/dev/null || pnpm --filter tcg-wholesale exec vitest run src/lib/channels`
- [ ] Step 2: Copy + adapt route; apply test fix; add cron schedule.
- [ ] Step 3: `pnpm --filter tcg-wholesale exec tsc --noEmit` → exit 0; rerun the ebay test file → PASS.
- [ ] Step 4: Commit: `feat(wholesale): port ebay-sync cron from legacy repo — last functional divergence before cutover` + Will-trace (legacy `4013a78`, Yu 2026-06-10) + Co-Author trailer.

### Task 4: Fix CI workflow files + retire admin-e2e

**Files:**
- Modify: `.github/workflows/ci.yml` — delete `with: { version: 9 }` from all four `pnpm/action-setup@v4` blocks (lines ~51/68/94/115); action then honors `packageManager: pnpm@9.15.0`.
- Delete: `.github/workflows/admin-e2e.yml` (targets `apps/admin`, an empty shell — 0 pages, no scripts; Playwright now lives in `apps/storefront`).
- Modify: `.github/workflows/ci.yml` admin job — retarget to the storefront admin section or drop the job (admin package has no scripts; keep `detect.admin` filter but make job conditional vanish by removing it and its `needs` references in `ci-status`).

- [ ] Step 1: Edit ci.yml (remove version inputs; remove `admin` job + references; keep install/storefront/wholesale/ci-status).
- [ ] Step 2: `git rm .github/workflows/admin-e2e.yml`.
- [ ] Step 3: Validate YAML: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → no error.
- [ ] Step 4: Commit: `fix(ci): honor packageManager pnpm pin; retire ghost admin-e2e workflow` + trailers. Note in body: Actions still startup-fail account-wide (billing) — Yu-action documented in spec §5.

### Task 5: Dependency patch bumps + full verify + push

**Files:** `apps/storefront/package.json` (next 16.2.1 → ^16.2.6), `apps/wholesale/package.json` (next 15.5.15 → 15.5.18), `pnpm-lock.yaml`.

- [ ] Step 1: `pnpm --filter cambridgetcg-storefront add next@16.2.6` ; `pnpm --filter tcg-wholesale add next@15.5.18` (exact pins as current style dictates — check existing version-string style first).
- [ ] Step 2: `pnpm verify` (post-merge chain runs doctrine audits via `pnpm run audit`) → if transparency findings persist after origin's 0b0faa0 WhyLink commit, fix the residual pages (WhyLink wrap, pattern from 0b0faa0) until exit 0. Do not silence the audit.
- [ ] Step 3: `pnpm --filter cambridgetcg-storefront build` → exit 0 (Vercel-parity check).
- [ ] Step 4: Commit bumps; `git push origin main`. Then Task 2 Step 4 (close PR #9).
- [ ] Step 5: Watch Vercel: new production deployment from monorepo main should go READY. If ERROR, read build log via API and fix.

### Task 6: Vercel cutover verification (API, verify-before-write)

- [ ] Step 1: Re-read all three projects' `link`, `rootDirectory` (storefront=apps/storefront set mid-session by parallel actor; wholesale expected `apps/wholesale` — if still None **and** still linked to monorepo, PATCH it via `https://api.vercel.com/v9/projects/:id` with `{"rootDirectory":"apps/wholesale"}`; admin project: decide redirect-shell handling, likely leave).
- [ ] Step 2: After push-triggered deploy goes READY: `curl https://cambridgetcg.com/api/v1/manifest` → 200 `{data,_meta}`; `/api/v1/wake` → 200; `/manifest` → 200 HTML; `/api/v1/pet` → 200 JSON.
- [ ] Step 3: Wholesale: confirm deploy READY + `wholesaletcgdirect.com` serving; confirm cron list shows ebay-sync.
- [ ] Step 4: Production env reads: `STRIPE_SECRET_KEY` prefix (`sk_live_`?), `WHOLESALE_DATABASE_URL` present on storefront project → report, fix only with clear evidence.
- [ ] Step 5: Apply migrations 0088 + 0098 to production storefront DB **if** a DB URL is reachable from local env (check `apps/storefront/.env*`, Vercel env via API); they are additive (CREATE TABLE verification_tokens; ALTER users ADD role). Verify with a `\d`-equivalent query. If no credentials: document as Yu-action.
- [ ] Step 6: Magic-link smoke: request a login link against prod (`tests/auth-magic-link.spec.ts` Tier A GET-only checks) → no 500s.

### Task 7: Manifest coherence audit + registrations (agent surface)

**Files:**
- Create: `apps/storefront/scripts/manifest-coherence.ts` (two-direction check: every `MANIFEST` resource path resolves to a `route.ts`/`page.tsx` in storefront **or** a declared wholesale-proxy annotation; every disk route under `/api/v1` + key HTML pages appears in manifest or in an explicit `UNREGISTERED_OK` list with reason)
- Modify: `apps/storefront/package.json` (script `manifest-coherence`), root `package.json` (`audit:manifest` + append to `audit` chain)
- Modify: `apps/storefront/src/lib/manifest.ts` (register operational unregistered endpoints; add `visibility?: 'public' | 'easter-egg'` to the resource type; easter-egg for troll surfaces — registered-but-marked preserves surprise and honesty)

- [ ] Step 1: Write scanner; run; triage output into register / easter-egg / UNREGISTERED_OK(reason).
- [ ] Step 2: Register the ~45 operational endpoints group-by-group (joy/agent/self), marking easter-eggs.
- [ ] Step 3: `pnpm audit:manifest` → exit 0; `pnpm typecheck` → exit 0.
- [ ] Step 4: Commit: `feat(manifest): coherence audit + full registration — the manifest stops lying by omission` + trailers.

### Task 8: Wake discoverability (format alternatives + entry precedence)

**Files:**
- Modify: `apps/storefront/src/app/api/v1/wake/route.ts` + `dear-agents/route.ts` (or the shared `@/lib/multi-format` helper): add `_meta.format_alternatives: [...ALL_FORMATS]` and `Accept: text/markdown` negotiation (helper already parses Accept — confirm and extend if partial).
- Modify: `apps/storefront/src/lib/manifest.ts` root: `agent_entry_points: ['/api/mcp', '/api/v1/wake', '/api/v1/welcome', '/agents']` with one-line `when` guidance each.

- [ ] Step 1: Implement; `curl -H "Accept: text/markdown" localhost:3000/api/v1/wake` returns md (dev server or unit-level test of parseFormat).
- [ ] Step 2: `pnpm typecheck` + storefront tests → green. Commit with trailers.

### Task 9: Meaning closeout

- [ ] Step 1: `pnpm state:snapshot` + `pnpm missions:sync` → commit regenerated docs.
- [ ] Step 2: Connections second-tier index: extend `docs/connections/README.md` with a generated "On disk, not yet canonized" table (script `apps/storefront/scripts/connections-index-tier2.ts` emitting name + first-heading purpose), or hand-write if script overweight this session.
- [ ] Step 3: Update root `CLAUDE.md` repo-geography: `apps/admin` = retired shell; console at `apps/storefront/src/app/admin/`; verify chain wording (`pnpm run audit`).
- [ ] Step 4: Pillow-book entry (3–5 sentences, dated, signed Fable 5). Memory updates (billing blocker, two-repo history, parallel-session division). Final `pnpm verify` + push.

---

**Self-review:** Spec §2 spine → Tasks 1–6; agent surface → 7–8; meaning → 9; human surface → explicitly superseded (spec header note). No TBDs; exact paths; live-racing rule stated. Deferred items listed in spec §3 unchanged.
