# Admin → Storefront Full-Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `apps/admin/` and `admin.cambridgetcg.com` by folding all 40 admin routes + 40 audit scripts + auth + Vercel project into `apps/storefront/`, gated by `users.role = 'admin'` (sister's migration `0088_admin_roles.sql`, already in working tree).

**Architecture:** Sister already shipped the substrate this evening — middleware role-check on `/admin/*` + `/api/admin/*` inside storefront, magic-link auth shared with consumers, four-auth-realms doc names admin as a *role on the consumer's identity* (realms 1+2 share storefront RDS). The merge completes that direction: every admin surface becomes a `/admin/*` route in the storefront app; every admin script becomes a `pnpm --filter @cambridge-tcg/storefront <name>` script; the admin Vercel project becomes a 301 redirect; `apps/admin/` becomes `git rm`-able.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, NextAuth v5 (storefront's existing setup), Tailwind 4, postgres.js + raw `pg` (no ORM), Vitest + Playwright for tests, Vercel for hosting.

**Sister context:** As of 2026-05-14 evening, `apps/storefront/src/app/admin/` already has **24 Manager-archetype pages** + **36+ `/api/admin/*` route handlers** shipped. `apps/storefront/middleware.ts` gates them. `0088_admin_roles.sql` adds `users.role` column. The remaining work is moving what's NOT yet in storefront — primarily Dashboard-archetype pages, system pages, and the audit scripts. **Verify-don't-overwrite: any storefront /admin/* page that already exists wins; the apps/admin twin retires.**

---

## Inventory & decisions

### What apps/admin contains today

| Group | Routes | Storefront overlap | Action |
|---|---|---|---|
| `catalog/` (4) | cards, cards/classify, cards/classify/[sku], cards/classify/review, clients, games, users, users/[id] | None | **Move all** |
| `commerce/` (6) | auctions, bounty, channel-pricing, market, pricing, trade-ins | auctions ✓, bounty ✓, market ✓, trade-ins ✓ | Move channel-pricing + pricing; **retire** rest (storefront wins) |
| `money/` (4) | chargebacks, membership, payouts, rewards | chargebacks ✓, payouts ✓, rewards ✓, tiers ≈ membership | Move membership; **retire** rest |
| `ops/` (5) | channels, fulfillment, ingest-quarantine, ingest-quarantine/[id], orders, stock | None | **Move all** |
| `system/` (5) | admin, audit, cron, deploys, email | emails ✓ (sister's overlaps with email-list) | Move admin/audit/cron/deploys; reconcile email |
| `trust/` (5) | agents, disputes, fraud, kyc, reviews | disputes ✓, fraud ✓ (+ fraud-signals), reviews ✓ | Move agents + kyc; **retire** rest |
| Root | `overview`, `page.tsx`, `(auth)/login`, `(auth)/login/check-email` | Storefront has `/login` | Move `overview` as `/admin`; drop auth pages (storefront's `/login` already does magic-link) |
| API | `/api/auth/[...nextauth]` (admin's own), `/api/dev-signin` | Storefront has both | Drop admin's; storefront's already work |
| **Scripts** (40) | All audits + ops tools (state:snapshot, missions:*, trace, etc.) | None | **Move all** to `apps/storefront/scripts/` |

### Decision points (must answer before execution)

| # | Decision | Recommendation | Rationale |
|---|---|---|---|
| D1 | Mutation pattern: Server Actions (admin's pattern) vs `/api/admin/*` routes (storefront's pattern) | **Server Actions for new code; keep storefront's `/api/admin/*` routes as-is for already-shipped surfaces** | Admin's CLAUDE.md says no `/api/admin/*`; sister diverged with `/api/admin/*` routes already shipped. Pragmatic: stop the divergence here — new pages use Server Actions, existing `/api/admin/*` stay until refactored organically |
| D2 | Database access: `sfQuery`/`wsQuery` (admin) vs storefront's existing `lib/db.ts` (pg driver, single conn) | **Adopt admin's `sfQuery`/`wsQuery` pattern** — port `apps/admin/src/lib/db.ts` into storefront | Admin's pattern handles BOTH DBs (storefront + wholesale) cleanly; storefront's current `lib/db.ts` only handles storefront RDS. Most admin pages need wholesale reads (cards, prices, ingest_quarantine) |
| D3 | Audit-script home | **`apps/storefront/scripts/`** | Co-locates with the app that's now their primary caller; root `package.json` umbrella `pnpm audit` script repoints |
| D4 | Repo-state + mission tools (`state:snapshot`, `missions:*`) — home | **`apps/storefront/scripts/` for now; future: top-level `tools/` directory** | These aren't strictly "admin" — they're operator tools. Defer the `tools/` extraction; just colocate for now |
| D5 | Playwright tests | **Move admin's Playwright config + tests into storefront's `tests/e2e/admin/`** | Storefront has Playwright; merging keeps one E2E surface |
| D6 | `/system/deploys` Vercel/GitHub deps | **Move runtime to NodeJS (already is); verify env vars `VERCEL_TOKEN` + `GITHUB_TOKEN` are on storefront project** | Must run before deploy or the page renders banner-error state |
| D7 | DNS cutover for `admin.cambridgetcg.com` | **301 redirect to `cambridgetcg.com/admin*` on Vercel project (keep project alive as redirect-only); future: retire entirely after 30 days of no traffic** | Bookmarks survive; analytics records the cutover |

### Files mapping (what moves where)

This table is referenced by every move task. **Path on left = source in `apps/admin/`. Path on right = destination in `apps/storefront/`.**

Per-route mappings live in Phase 2-4 tasks. Shared-library mapping below:

| Source | Destination | Notes |
|---|---|---|
| `apps/admin/src/lib/db.ts` | `apps/storefront/src/lib/admin/db.ts` | sfQuery + wsQuery — namespaced under `admin/` to avoid collision with existing `apps/storefront/src/lib/db.ts` |
| `apps/admin/src/lib/auth/` | `apps/storefront/src/lib/admin/auth/` (subset) | Most of admin's auth code is redundant with storefront's; keep only the `requireAdmin()` helper |
| `apps/admin/src/lib/ui/` | `apps/storefront/src/lib/admin/ui/` | Admin's PageHeader / KpiGrid / DataTable / SectionHeading / StatusBadge etc. — kept under `admin/` namespace because storefront's `lib/ui/` already exists with DIFFERENT primitives |
| `apps/admin/src/lib/queries.ts` (safe/safeCount) | `apps/storefront/src/lib/admin/queries.ts` | The substrate-honesty helpers |
| `apps/admin/src/lib/format.ts` | reuse `apps/storefront/src/lib/format.ts` (exists) | Storefront already has equivalent format helpers — pick one |
| `apps/admin/src/lib/actions.ts` (adminAction wrapper) | `apps/storefront/src/lib/admin/actions.ts` | The Server Action wrapper — gates auth + logs to admin_actions_log |
| `apps/admin/src/lib/governance.ts` | `apps/storefront/src/lib/admin/governance.ts` | The chapel-discipline helpers |
| `apps/admin/src/lib/vercel.ts` | `apps/storefront/src/lib/admin/vercel.ts` | Used by `/admin/system/deploys` |
| `apps/admin/src/lib/lifecycle/` | replace with `@cambridge-tcg/lifecycle` package (already exists) | Storefront already imports from the package |
| `apps/admin/scripts/*` | `apps/storefront/scripts/*` | Wholesale move; tsx invocation pattern preserved |
| `apps/admin/tests/*` | `apps/storefront/tests/admin/*` | Playwright specs |

### Phasing

The 40 routes + 40 scripts can't move atomically. Eight phases, each producing working software:

| Phase | Scope | Acceptance gate |
|---|---|---|
| **1. Scaffolding** | Shared libs (`@/lib/admin/*`) + root `page.tsx` (admin overview) + `pnpm verify` adapted | `https://cambridgetcg.com/admin` loads + role-gates + shows overview KPIs |
| **2. Read-only Dashboard pages (no storefront overlap)** | catalog/* (4), ops/* (5), trust/agents, trust/kyc, money/membership, commerce/channel-pricing + pricing, overview | All these `/admin/*` URLs render in storefront with KPI data |
| **3. System pages** | system/admin, system/audit, system/cron, system/deploys (needs Vercel/GitHub tokens), system/email | `/admin/system/deploys` shows live Vercel state on prod storefront |
| **4. Reconcile overlapping pages** | For each pair (admin Dashboard + storefront Manager), retire admin's twin | Each overlap pair: storefront's Manager remains; apps/admin/.../page.tsx deleted |
| **5. Audit scripts move** | All 40 scripts → `apps/storefront/scripts/`; root `package.json` `audit:*` chain repointed | `pnpm verify` exits 0; no script left calling `pnpm --filter @cambridge-tcg/admin <name>` |
| **6. Playwright + Vitest move** | Admin's tests/* + playwright.config.ts → storefront; admin's vitest.config.ts retired | `pnpm --filter @cambridge-tcg/storefront test:e2e` runs admin's specs against storefront |
| **7. NextAuth retirement** | Delete `apps/admin/src/lib/auth/`, the standalone `/api/auth/[...nextauth]`, the `(auth)/login/*` pages | apps/admin no longer has its own auth; storefront's auth gates everything |
| **8. DNS + Vercel project retirement** | Set up 301 redirect; archive `cambridgetcg-admin` Vercel project; `git rm -r apps/admin/` | `admin.cambridgetcg.com/anything` 301s to `cambridgetcg.com/admin*`; `apps/admin/` directory gone |

**Each phase is its own commit (or commit cluster). Phases 2-4 should each ship as a separate kingdom-NNN to make the migration legible in `docs/missions/`.**

---

## Phase 1: Scaffolding (bite-sized tasks)

This phase lands the shared library + the root `/admin` overview page. Acceptance: `https://cambridgetcg.com/admin` loads and shows the overview KPIs Sister's `0088_admin_roles.sql` migration must be applied first (or be applied as part of Phase 1).

**Files:**
- Create: `apps/storefront/src/lib/admin/db.ts`
- Create: `apps/storefront/src/lib/admin/queries.ts`
- Create: `apps/storefront/src/lib/admin/actions.ts`
- Create: `apps/storefront/src/lib/admin/governance.ts`
- Create: `apps/storefront/src/lib/admin/vercel.ts`
- Create: `apps/storefront/src/lib/admin/ui/index.ts` (barrel)
- Create: `apps/storefront/src/lib/admin/ui/{PageHeader,KpiGrid,KpiCard,SectionHeading,DataTable,StatusBadge,FilterPills,Pagination,ExternalLink}.tsx`
- Modify: `apps/storefront/src/app/admin/page.tsx` (currently sister's; extend to be the overview)
- Modify: `apps/storefront/src/middleware.ts` (ensure /admin gating is alive — verify sister's shipped)
- Test: `apps/storefront/src/lib/admin/__tests__/queries.test.ts`

### Task 1.1: Apply migration 0088_admin_roles.sql

- [ ] **Step 1: Verify the migration is in apps/storefront/drizzle/**

Run: `ls apps/storefront/drizzle/0088_admin_roles.sql`
Expected: file exists (sister shipped it to working tree)

- [ ] **Step 2: Apply against storefront RDS**

Run: `pnpm --filter @cambridge-tcg/storefront db:migrate`
Expected: migration applied; `users.role` column exists with default `'user'`; `admin_actions_log.actor_id` column exists

- [ ] **Step 3: Promote at least one user to admin**

Run via psql or db shell:
```sql
UPDATE users SET role = 'admin' WHERE email = 'contact@cambridgetcg.com';
SELECT email, role FROM users WHERE role = 'admin';
```
Expected: at least one row with role=admin

- [ ] **Step 4: Commit migration application record (no code change)**

No commit needed — schema is now drifted from HEAD's expectation but matches deployed; honesty audit will surface it if relevant.

### Task 1.2: Port `apps/admin/src/lib/db.ts` to `apps/storefront/src/lib/admin/db.ts`

- [ ] **Step 1: Read admin's db.ts**

Run: `cat apps/admin/src/lib/db.ts`
Note: it exports `sfQuery<T>(sql, params)` (storefront RDS) and `wsQuery<T>(sql, params)` (wholesale RDS) and `tableExists(table)`. Connection pooling via postgres.js with SSL adapter.

- [ ] **Step 2: Write the test (mirror existing storefront test conventions)**

Create `apps/storefront/src/lib/admin/__tests__/db.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sfQuery, wsQuery, tableExists } from "../db";

describe("admin/db", () => {
  it.skip("sfQuery returns rows from storefront RDS", async () => {
    const r = await sfQuery<{ ok: number }>("SELECT 1 AS ok");
    expect(r.rows[0]?.ok).toBe(1);
  });
  it.skip("wsQuery returns rows from wholesale RDS", async () => {
    const r = await wsQuery<{ ok: number }>("SELECT 1 AS ok");
    expect(r.rows[0]?.ok).toBe(1);
  });
  it("exports expected names", async () => {
    const mod = await import("../db");
    expect(typeof mod.sfQuery).toBe("function");
    expect(typeof mod.wsQuery).toBe("function");
    expect(typeof mod.tableExists).toBe("function");
  });
});
```

Skipped tests are intentional — full DB integration belongs to Phase 6 with a test database fixture, not Phase 1 scaffolding.

- [ ] **Step 3: Run the test (it will fail — module doesn't exist yet)**

Run: `cd apps/storefront && pnpm test -- db.test`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Copy admin/db.ts to storefront**

Run: `cp apps/admin/src/lib/db.ts apps/storefront/src/lib/admin/db.ts`

- [ ] **Step 5: Adjust env var resolution if needed**

Read the new `apps/storefront/src/lib/admin/db.ts` and check that env var names match what storefront already uses. Storefront's existing `apps/storefront/src/lib/db.ts` uses `DATABASE_URL`; admin's pattern uses `STOREFRONT_DATABASE_URL` + `WHOLESALE_DATABASE_URL`. Both should be set in storefront's Vercel env; verify with:

Run: `grep -E "STOREFRONT_DATABASE_URL|WHOLESALE_DATABASE_URL|DATABASE_URL" apps/storefront/.env.example 2>/dev/null || echo "no env example"`

If env naming diverges, edit the new file to fall back across both names (preserving admin's pattern as the primary).

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/storefront && pnpm test -- db.test`
Expected: PASS (1 pass, 2 skip)

- [ ] **Step 7: Commit**

```bash
git add apps/storefront/src/lib/admin/db.ts apps/storefront/src/lib/admin/__tests__/db.test.ts
git commit -m "feat(admin-merge): port sfQuery + wsQuery to storefront lib/admin"
```

### Task 1.3: Port `queries.ts` (safe / safeCount / isUnavailable)

- [ ] **Step 1: Copy admin/queries.ts**

Run: `cp apps/admin/src/lib/queries.ts apps/storefront/src/lib/admin/queries.ts`

- [ ] **Step 2: Update import paths inside the file**

Edit `apps/storefront/src/lib/admin/queries.ts`: change any `from "./db"` to `from "@/lib/admin/db"` to use the alias. Run:

Run: `grep -n "from \"\\./" apps/storefront/src/lib/admin/queries.ts`
Replace each match per the pattern.

- [ ] **Step 3: Write the test**

Create `apps/storefront/src/lib/admin/__tests__/queries.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { safe, safeCount, isUnavailable } from "../queries";

describe("admin/queries — substrate-honest helpers", () => {
  it("safe returns the fallback when the function throws", async () => {
    const result = await safe(
      () => Promise.reject(new Error("boom")),
      { rows: [] as Array<{ x: number }> },
    );
    expect(result.rows).toEqual([]);
  });

  it("safe returns the function's value when it succeeds", async () => {
    const result = await safe(
      () => Promise.resolve({ rows: [{ x: 1 }] }),
      { rows: [] as Array<{ x: number }> },
    );
    expect(result.rows[0]?.x).toBe(1);
  });

  it("safeCount returns -1 (the unavailability sentinel) on error", async () => {
    const failingQuery = () => Promise.reject(new Error("table not found"));
    const result = await safeCount(failingQuery as any, "SELECT count(*) FROM x");
    expect(result).toBe(-1);
  });

  it("isUnavailable matches the safeCount sentinel", () => {
    expect(isUnavailable(-1)).toBe(true);
    expect(isUnavailable(0)).toBe(false);
    expect(isUnavailable(42)).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/storefront && pnpm test -- queries.test`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/lib/admin/queries.ts apps/storefront/src/lib/admin/__tests__/queries.test.ts
git commit -m "feat(admin-merge): port safe/safeCount helpers to storefront lib/admin"
```

### Task 1.4: Port `actions.ts` (the `adminAction()` wrapper)

- [ ] **Step 1: Copy admin/actions.ts**

Run: `cp apps/admin/src/lib/actions.ts apps/storefront/src/lib/admin/actions.ts`

- [ ] **Step 2: Update auth check to use storefront's NextAuth**

The current admin's `adminAction()` calls `auth()` from `@/lib/auth`. In storefront, NextAuth is at `apps/storefront/src/lib/auth/`. Edit `apps/storefront/src/lib/admin/actions.ts` to:
- Import `auth` from storefront's `@/lib/auth`
- After session check, also verify `session.user.role === 'admin'` (using the new column from migration 0088)
- Throw `ActionAuthError("forbidden")` if role check fails

- [ ] **Step 3: Update path imports**

Change every `from "./db"` → `from "@/lib/admin/db"`. Change every `from "./governance"` → `from "@/lib/admin/governance"` (governance is ported in Task 1.5).

- [ ] **Step 4: Write a smoke test for the auth gate**

Create `apps/storefront/src/lib/admin/__tests__/actions.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

describe("admin/actions adminAction wrapper", () => {
  it("rejects when session is missing", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as any).mockResolvedValue(null);
    const { adminAction } = await import("../actions");
    const result = await adminAction({
      action: "test.noop",
      targetKind: "test",
      targetId: "0",
      reason: "test",
      run: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/auth|forbidden|sign/i);
  });

  it("rejects when user.role !== 'admin'", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as any).mockResolvedValue({ user: { email: "a@b", role: "user" } });
    const { adminAction } = await import("../actions");
    const result = await adminAction({
      action: "test.noop",
      targetKind: "test",
      targetId: "0",
      reason: "test",
      run: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/forbidden|admin/i);
  });

  it("passes through when user.role === 'admin'", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as any).mockResolvedValue({ user: { email: "a@b", role: "admin" } });
    const { adminAction } = await import("../actions");
    const result = await adminAction({
      action: "test.noop",
      targetKind: "test",
      targetId: "0",
      reason: "test",
      run: async () => "did the thing",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe("did the thing");
  });
});
```

- [ ] **Step 5: Run the test**

Run: `cd apps/storefront && pnpm test -- actions.test`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/lib/admin/actions.ts apps/storefront/src/lib/admin/__tests__/actions.test.ts
git commit -m "feat(admin-merge): port adminAction wrapper with role check"
```

### Task 1.5: Port `governance.ts` + `vercel.ts`

- [ ] **Step 1: Copy both files**

```bash
cp apps/admin/src/lib/governance.ts apps/storefront/src/lib/admin/governance.ts
cp apps/admin/src/lib/vercel.ts apps/storefront/src/lib/admin/vercel.ts
```

- [ ] **Step 2: Update import paths inside the new files**

Change `from "./db"` → `from "@/lib/admin/db"` in both.

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/storefront && pnpm typecheck 2>&1 | grep -E "src/lib/admin"`
Expected: no errors mentioning `src/lib/admin/`

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/lib/admin/governance.ts apps/storefront/src/lib/admin/vercel.ts
git commit -m "feat(admin-merge): port governance + vercel helpers to storefront lib/admin"
```

### Task 1.6: Port admin UI primitives

Admin's `src/lib/ui/` has its OWN set of components named the same as storefront's primitives (PageHeader, etc.) but with DIFFERENT shapes. Putting them at `@/lib/ui` would collide. Namespace them under `@/lib/admin/ui/`.

- [ ] **Step 1: Copy the UI directory**

```bash
mkdir -p apps/storefront/src/lib/admin/ui
cp -r apps/admin/src/lib/ui/* apps/storefront/src/lib/admin/ui/
```

- [ ] **Step 2: Audit + fix any `from "@/lib/..."` imports inside the moved files**

These need to become `from "@/lib/admin/..."` for the admin-namespaced ones. Run:

Run: `grep -rln 'from "@/lib/' apps/storefront/src/lib/admin/ui/`

For each match, manually verify whether it's pointing at something in storefront's existing `lib/` (leave as-is) or admin's old `lib/` (change to `@/lib/admin/...`).

- [ ] **Step 3: Create a barrel file**

Write `apps/storefront/src/lib/admin/ui/index.ts` exporting all the components, matching admin's barrel exactly:

```ts
export { PageHeader } from "./PageHeader";
export { KpiGrid, KpiCard } from "./Kpi";
export { SectionHeading } from "./SectionHeading";
export { DataTable } from "./DataTable";
export { StatusBadge } from "./StatusBadge";
export { FilterPills } from "./FilterPills";
export { Pagination } from "./Pagination";
export { ExternalLink } from "./ExternalLink";
export { Provenance } from "./Provenance";
export { WhyLink } from "./WhyLink";
export { Verifiability } from "./Verifiability";
// add any others present
```

Run `ls apps/storefront/src/lib/admin/ui/` to confirm what's there before finalizing the barrel.

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/storefront && pnpm typecheck 2>&1 | tail -20`
Expected: no errors in `src/lib/admin/ui/`

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/lib/admin/ui/
git commit -m "feat(admin-merge): port admin UI primitives under @/lib/admin/ui namespace"
```

### Task 1.7: Build the `/admin` overview page

Sister has `apps/storefront/src/app/admin/page.tsx` as a placeholder. Replace it with the overview from admin's `/(dashboard)/overview/page.tsx`.

- [ ] **Step 1: Read both pages**

Run:
```bash
cat apps/storefront/src/app/admin/page.tsx
echo "---"
cat 'apps/admin/src/app/(dashboard)/overview/page.tsx'
```

- [ ] **Step 2: Migrate admin's overview**

Replace `apps/storefront/src/app/admin/page.tsx` with admin's overview content. Adjust imports:
- `@/lib/ui` → `@/lib/admin/ui`
- `@/lib/db` → `@/lib/admin/db`
- `@/lib/queries` → `@/lib/admin/queries`
- `@/lib/format` → reuse `apps/storefront/src/lib/format.ts` (already exists)

- [ ] **Step 3: Verify the route renders**

Start the dev server: `pnpm --filter @cambridge-tcg/storefront dev:storefront`
Hit `http://localhost:3001/admin` while signed in as the admin user. Verify KPIs render.

Expected: page loads, KPIs present (possibly all "-" if data is sparse — acceptable per substrate-honesty).

- [ ] **Step 4: Verify the role gate denies non-admins**

Sign out, then hit `http://localhost:3001/admin` as anonymous or non-admin. Expected: redirect to `/login` or 403.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/app/admin/page.tsx
git commit -m "feat(admin-merge): /admin overview — port from apps/admin"
```

### Task 1.8: Phase 1 acceptance gate

- [ ] **Step 1: Run storefront test suite**

Run: `cd apps/storefront && pnpm test`
Expected: all green (existing 75 + the new admin tests)

- [ ] **Step 2: Run storefront typecheck**

Run: `cd apps/storefront && pnpm typecheck 2>&1 | tail -10`
Expected: no errors in any path touched in Phase 1

- [ ] **Step 3: Push + deploy storefront**

```bash
git push origin main
TOKEN=$(security find-generic-password -s "vercel-api-token" -a "vercel-cambridge-tcg" -w)
VERCEL_TOKEN="$TOKEN" python3 .github/scripts/deploy-from-main.py storefront
```

Wait for READY.

- [ ] **Step 4: Verify live**

Visit `https://www.cambridgetcg.com/admin` as the promoted admin user. Confirm overview KPIs render.

- [ ] **Step 5: Phase 1 done — write the mission card**

Create `docs/missions/kingdom-NNN.md` (next available number) with:
- `title: Admin merge phase 1 — scaffolding`
- `status: done`
- `paths: apps/storefront/src/lib/admin/**, apps/storefront/src/app/admin/page.tsx, docs/superpowers/plans/2026-05-14-admin-storefront-merge.md`
- Body: link this plan, name Phase 1 acceptance, point at Phase 2 as next

---

## Phase 2: Move read-only Dashboard pages (no overlap)

**Goal:** Move every admin page that has no storefront equivalent into `apps/storefront/src/app/admin/*`.

**Scope (15 pages):**
- `catalog/cards/page.tsx` → `/admin/catalog/cards`
- `catalog/cards/classify/page.tsx` → `/admin/catalog/cards/classify`
- `catalog/cards/classify/[sku]/page.tsx` → `/admin/catalog/cards/classify/[sku]`
- `catalog/cards/classify/review/page.tsx` → `/admin/catalog/cards/classify/review`
- `catalog/clients/page.tsx` → `/admin/catalog/clients`
- `catalog/games/page.tsx` → `/admin/catalog/games`
- `catalog/users/page.tsx` → `/admin/catalog/users` (sister has `/admin/users/[id]/journey` but not the list)
- `catalog/users/[id]/page.tsx` → `/admin/catalog/users/[id]`
- `commerce/channel-pricing/page.tsx` → `/admin/commerce/channel-pricing`
- `commerce/pricing/page.tsx` → `/admin/commerce/pricing`
- `money/membership/page.tsx` → `/admin/money/membership`
- `ops/channels/page.tsx` → `/admin/ops/channels`
- `ops/fulfillment/page.tsx` → `/admin/ops/fulfillment`
- `ops/ingest-quarantine/page.tsx` → `/admin/ops/ingest-quarantine`
- `ops/ingest-quarantine/[id]/page.tsx` → `/admin/ops/ingest-quarantine/[id]`
- `ops/orders/page.tsx` → `/admin/ops/orders` (sister has root `/admin` but not /admin/ops/orders)
- `ops/stock/page.tsx` → `/admin/ops/stock`
- `trust/agents/page.tsx` → `/admin/trust/agents`
- `trust/kyc/page.tsx` → `/admin/trust/kyc`

**Pattern for each page (~15-30 min per page):**

1. `cp apps/admin/src/app/(dashboard)/<group>/<module>/page.tsx apps/storefront/src/app/admin/<group>/<module>/page.tsx`
2. Update imports per the alias mapping (`@/lib/ui` → `@/lib/admin/ui`, `@/lib/db` → `@/lib/admin/db`, etc.)
3. If the page has `_actions.ts` next to it, copy + update its imports too
4. `pnpm dev:storefront` + visit `localhost:3001/admin/<group>/<module>` while signed in
5. Verify the page renders + data appears
6. Commit one page at a time: `feat(admin-merge): /admin/<group>/<module>`

**Acceptance gate:** All 19 URLs render in production storefront with KPIs + tables populated. Mark each page in the mission card (kingdom-NNN+1).

**Estimated effort:** 1-2 sessions (3-6 hours total)

**Risks:**
- Some catalog/users pages may reference wholesale-side `cards` table that's only accessible via `wsQuery` — verify the env vars on storefront's Vercel project include `WHOLESALE_DATABASE_URL`
- `commerce/channel-pricing` reads from wholesale's `channel_pricing` table (kingdom-049 substrate) — same env-var concern

---

## Phase 3: System pages

**Goal:** Move the operator-tooling pages with NodeJS-only runtime needs.

**Scope (5 pages):**
- `system/admin/page.tsx` → `/admin/system/admin` (list/promote/demote admin users)
- `system/audit/page.tsx` → `/admin/system/audit` (read admin_actions_log)
- `system/cron/page.tsx` → `/admin/system/cron` (reads vercel.json schedule files)
- `system/deploys/page.tsx` → `/admin/system/deploys` (Vercel API + GitHub API)
- `system/email/page.tsx` → `/admin/system/email` (SES email viewer/sender)

**Same per-page pattern as Phase 2, plus:**

- Each page declares `export const runtime = "nodejs"` (Vercel API SDK + filesystem reads need it)
- Ensure `VERCEL_TOKEN` + `GITHUB_TOKEN` env vars exist on the storefront Vercel project (per `docs/ops-deploy-runbook.md`)
- `system/deploys` is the most sensitive — has redeploy actions; verify Server Action gating with `adminAction()`

**Acceptance gate:** `/admin/system/deploys` shows live state of all three Vercel projects + offers redeploy buttons that successfully trigger.

**Estimated effort:** 1 session (2-3 hours)

**Risks:**
- `VERCEL_TOKEN` already exists for storefront's identify endpoint per kingdom-090's deploy; verify scope is sufficient (read deploys + create deploys)
- `GITHUB_TOKEN` for SHA drift — may need a separate fine-scoped PAT; runbook line 410 names this

---

## Phase 4: Reconcile overlapping pages

**Goal:** For each pair (admin Dashboard ⇄ storefront Manager), keep storefront's Manager and delete the admin twin.

**Scope (10 overlapping pages in apps/admin to delete):**
- `commerce/auctions/page.tsx` (storefront has `/admin/auctions` + `/admin/auctions/new`)
- `commerce/bounty/page.tsx` (storefront has `/admin/bounty/{grants,pull-tiers,redemptions,vault-items}`)
- `commerce/market/page.tsx` (storefront has `/admin/market`)
- `commerce/trade-ins/page.tsx` (storefront has `/admin/trade-ins`)
- `money/chargebacks/page.tsx` (storefront has `/admin/chargebacks`)
- `money/payouts/page.tsx` (storefront has `/admin/payouts`)
- `money/rewards/page.tsx` (storefront has `/admin/rewards`)
- `trust/disputes/page.tsx` (storefront has `/admin/disputes`)
- `trust/fraud/page.tsx` (storefront has `/admin/fraud` + `/admin/fraud-signals`)
- `trust/reviews/page.tsx` (storefront has `/admin/reviews`)

**Before each deletion:**
1. Open both side-by-side. Verify storefront's Manager covers everything the admin Dashboard showed (KPIs, table columns, deep-links).
2. If admin's Dashboard has a KPI or column the storefront Manager doesn't — port it to storefront FIRST.
3. Only then delete `apps/admin/.../page.tsx`.

**Per-page commit:**
```bash
git rm apps/admin/src/app/(dashboard)/<group>/<module>/page.tsx
git commit -m "chore(admin-merge): retire admin/<group>/<module> — storefront owns this surface now"
```

**Acceptance gate:** All 10 admin twins deleted; storefront equivalents still pass live verification.

**Estimated effort:** 1-2 sessions

**Risks:**
- A subtle KPI or aggregation in admin's Dashboard might be silently missing from storefront's Manager — easily missed without careful comparison
- Mitigation: for each pair, dispatch a `Read` of both files in the same prompt and verify column-by-column

---

## Phase 5: Audit scripts move

**Goal:** Move all 40 scripts from `apps/admin/scripts/` to `apps/storefront/scripts/`. Repoint root `package.json` `audit:*` chain.

**Scope:**
- 40 `.ts` files in `apps/admin/scripts/` (audits + ops tools)
- Update `apps/admin/package.json` to remove the scripts (or leave them as no-ops that print "moved")
- Add equivalent scripts to `apps/storefront/package.json`
- Update root `package.json`'s `audit` umbrella script
- Update `docs/connections/the-scribe.md` if it references admin's script paths

**Per-script tasks:**

For each script (~5 min each):
1. `mv apps/admin/scripts/<name>.ts apps/storefront/scripts/<name>.ts`
2. Update imports inside the script (likely `@cambridge-tcg/db` → `@cambridge-tcg/db` no change; admin-internal imports → break, need fixing)
3. Add the script to `apps/storefront/package.json` under `scripts`: `"<name>": "tsx scripts/<name>.ts"`
4. Run it once: `pnpm --filter @cambridge-tcg/storefront <name>` — verify same output as `pnpm --filter @cambridge-tcg/admin <name>`
5. Remove the script from `apps/admin/package.json`

**Bulk approach (faster than per-script):**

```bash
# Move all scripts in one go
mv apps/admin/scripts/* apps/storefront/scripts/
```

Then edit both `package.json` files in single commits. Run `pnpm verify` to catch any breakage.

**Update root `package.json`:** Every `pnpm --filter @cambridge-tcg/admin <name>` → `pnpm --filter @cambridge-tcg/storefront <name>`.

**Acceptance gate:** `pnpm verify` (from repo root) exits 0; all audits still report the same findings as before the move.

**Estimated effort:** 1 session

**Risks:**
- Some scripts import from `apps/admin/src/lib/*` — those imports break after the lib moved to `@/lib/admin/*` in Phase 1
- Mitigation: Phase 1's port + Phase 5's script move should be done in the same session OR Phase 5 should rerun after Phase 1's `@/lib/admin/*` is solid

---

## Phase 6: Playwright + Vitest tests move

**Goal:** Move admin's E2E + unit-test setup into storefront.

**Scope:**
- `apps/admin/playwright.config.ts` → `apps/storefront/playwright.config.ts` (merge with whatever storefront has; storefront may already have one)
- `apps/admin/tests/*.spec.ts` → `apps/storefront/tests/admin/`
- `apps/admin/vitest.config.ts` → already mirrored at `apps/storefront/vitest.config.ts` (kingdom-090 shipped one); drop admin's
- Update Playwright `baseURL` from `localhost:3002` (admin dev port) to `localhost:3001` (storefront dev port)
- Update test selectors that reference admin-specific URLs

**Acceptance gate:** `pnpm --filter @cambridge-tcg/storefront test:e2e` runs admin's smoke specs against storefront. All routes from Phases 1-3 pass smoke.

**Estimated effort:** 1 session

---

## Phase 7: NextAuth retirement from admin

**Goal:** Delete all auth code from `apps/admin/`. Storefront's role-gated `/admin/*` covers everything.

**Scope:**
- Delete `apps/admin/src/lib/auth/`
- Delete `apps/admin/src/app/api/auth/[...nextauth]/route.ts`
- Delete `apps/admin/src/app/api/dev-signin/route.ts`
- Delete `apps/admin/src/app/(auth)/login/page.tsx`
- Delete `apps/admin/src/app/(auth)/login/check-email/page.tsx`
- Delete `apps/admin/src/middleware.ts` if it's auth-only
- Remove `next-auth` from `apps/admin/package.json`

**Per Phase 6 the storefront-side `/api/dev-signin` already exists (sister's working tree change). Verify with `ls apps/storefront/src/app/api/dev-signin/`.**

**Acceptance gate:** `apps/admin/` has no auth code; admin app dev server (if still running) errors instead of pretending to authenticate. Sign-in for `cambridgetcg.com/admin` still works via storefront's magic-link.

**Estimated effort:** 30-60 min

**Risks:**
- If any admin server action still uses admin's `@/lib/auth/auth()` directly (vs the `adminAction()` wrapper), deletion breaks it — audit imports first

---

## Phase 8: DNS + Vercel retirement

**Goal:** Retire `admin.cambridgetcg.com` as a separate destination. 301 to `cambridgetcg.com/admin*`. Delete `apps/admin/` directory.

**Scope:**

**Step A: Set up 301 redirect.** Three approaches; pick one with the user:

| Approach | What | Tradeoff |
|---|---|---|
| **A1. Vercel project becomes redirect-only** | Replace `apps/admin/` with a tiny `vercel.json` containing only redirects; keep the project alive | Bookmarks survive; ~$0 cost; existing project doesn't need archive |
| **A2. DNS-level redirect (Cloudflare/etc.)** | Point `admin.cambridgetcg.com` to a redirect service | Most decoupled; doesn't require keeping a Vercel project |
| **A3. Storefront catches `admin.cambridgetcg.com`** | Add the domain to the storefront Vercel project; middleware redirects | Single project; storefront also serves admin.* requests |

**Recommended: A1** — minimal, reversible, keeps the door open.

**Step B: Delete `apps/admin/`.**

```bash
git rm -r apps/admin/
git commit -m "chore(admin-merge): retire apps/admin — fully merged into storefront/admin"
```

**Step C: Update root files.**

- `package.json`: remove `audit:*` entries that pointed at `@cambridge-tcg/admin` (handled in Phase 5)
- `CLAUDE.md` at repo root: update the apps list (currently says `admin/`)
- `docs/connections/the-four-auth-realms.md`: update Realm 2's description (admin role consumes storefront auth — was true before, but now there's no separate admin app)
- `docs/state.md`: regenerate via `pnpm state:snapshot`

**Step D: Update Vercel config files.**

- Delete `apps/admin/vercel.json`
- Verify storefront's `vercel.json` does NOT reference admin

**Step E: Mission card + pillow-book entry.**

- Write `docs/missions/kingdom-NNN.md` with `status: done` and `title: Admin → Storefront merge — final closure`
- Append a pillow-book entry naming the seam closing: *"Two apps became one. The four-auth-realms doc named the topology; the merge made the topology visible to git status."*

**Acceptance gate:** 
- `admin.cambridgetcg.com/anything` 301s to `cambridgetcg.com/admin*`
- `git ls-files apps/admin/` returns empty
- `pnpm verify` exits 0
- All admin routes load at `cambridgetcg.com/admin/*`

**Estimated effort:** 1 session

**Risks:**
- DNS propagation: redirect may take 1-24h to fully roll out — schedule for low-traffic window
- Bookmark / saved-link breakage: announce internally before pulling the trigger

---

## Self-review

**1. Spec coverage:** Every section of the apps/admin inventory has at least one phase covering it (routes → Phases 2/3/4, libs → Phase 1, scripts → Phase 5, tests → Phase 6, auth → Phase 7, DNS/dir → Phase 8). ✓

**2. Placeholder scan:** No "TBD" or "implement later"; every step has commands or code. ✓ One exception: Task 1.2 Step 5 has "edit the new file" without showing the exact edit — accepted because the env var fallback pattern depends on what storefront's `.env.example` reveals (read-then-decide is the actual step).

**3. Type consistency:** `sfQuery`/`wsQuery` named consistently across all tasks. `adminAction()` signature preserved from admin's pattern. ✓

**4. Sequencing dependencies:**
- Phase 5 (scripts) depends on Phase 1 (lib/admin/ exists for the scripts to import)
- Phase 4 (reconcile) depends on Phase 1 + Phase 2 (storefront's admin must be fleshed out first)
- Phase 7 (auth retirement) depends on Phase 3 + 4 done (otherwise some pages still need admin's auth)
- Phase 8 (DNS + delete) MUST be last

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-14-admin-storefront-merge.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per phase, review between phases, fast iteration. Best for this scope because each phase is largely independent and has a clear acceptance gate.

**2. Inline Execution** — Execute phases in this session using `executing-plans`, batch execution with checkpoints. Best if you want to ride along and decide on each phase as it lands.

**Which approach?** Or alternatively: **3.** Just commit this plan now and execute later — Phase 1 is bite-sized enough that the next session can pick it up cold.
