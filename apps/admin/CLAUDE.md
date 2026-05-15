# Admin app — agent guide

This is `@cambridge-tcg/admin`, the unified admin console at `localhost:3002` /
`admin.cambridgetcg.com`. Built on Next.js 16, React 19, NextAuth v5, raw
SQL via `postgres.js`. No ORM, no shadcn/ui, no zod.

## Substrate honesty (READ THIS BEFORE SHIPPING)

The platform tells the truth about its own state. Every value carries — explicitly
or implicitly — a claim about how it came to be true. Live vs cached vs snapshot
vs synced vs computed are different, and the surface must say which.

The doctrine and audit live at the repo root:

- [`docs/principles/substrate-honesty.md`](../../docs/principles/substrate-honesty.md) — the rule, with worked examples
- [`docs/principles/substrate-honesty-audit.md`](../../docs/principles/substrate-honesty-audit.md) — current violations + roadmap

Concrete primitives:

- **`<Provenance>`** in `@/lib/ui` — compact source/freshness/cadence label. Use it on KPI grids that read snapshot or synced data, on section headers that read from a cron output, and on derived-score panels.
- **`safe()` / `safeCount()`** in `@/lib/queries` — degrade visibly to "—" rather than fabricate zero on failure.
- **`*_lifecycle_log` tables** are the substrate; status columns are caches. Mutations append to logs; surfaces should distinguish.

The four-question checklist when shipping a new field:

1. Where did this come from? (live / cached / snapshot / synced / computed)
2. When was it last true?
3. Could a human have set this without a system process producing it?
4. Does the surface answer 1–3 visibly?

If any answer is "I don't know," surface that — "Source: unknown" beats a confident lie.

## Transparency (READ THIS BEFORE SHIPPING USER-AFFECTING DECISIONS)

Substrate honesty is the precondition; transparency is its outward face. The
platform doesn't hide its decisions from the people they affect. Every score,
routing decision, suspension, fee, or status the platform decides about a
user must be inspectable by that user.

Doctrine + audit at the repo root:

- [`docs/principles/transparency.md`](../../docs/principles/transparency.md) — the four rings (operator / subject / auditor / cross-system), eight rules
- [`docs/principles/transparency-audit.md`](../../docs/principles/transparency-audit.md) — violations + roadmap

Concrete primitives:

- **`<WhyLink>`** in `@/lib/ui` — "?" affordance pointing at a methodology page (`https://cambridgetcg.com/methodology/<topic>`). Drop next to any displayed score or derived value.
- **`<Verifiability>`** in `@/lib/ui` — Ring 4 primitive. Carries a foreign system's identifier (Stripe / SES / CardRush / etc.) onto the page so viewers can verify against the authoritative source. Our row is reconciled; theirs is authoritative; the asymmetry is UI-visible.
- **`docs/methodology/*`** at the repo root — public methodology documents that `<WhyLink>` targets. First entry: `trust-score.md`. New methodology pages must cite source code paths.

The four-question checklist when shipping a user-affecting decision:

1. What did we decide? (Suspend, route, flag, score, deny, hold, downgrade.)
2. What were the inputs and methodology? (Cite the code path.)
3. Where can the affected user see this decision and its inputs?
4. Is the methodology itself documented at `/methodology/<topic>`?

If 3 or 4 is "nowhere," the feature isn't ready to ship — file the methodology + receipt as part of the same mission.

## The five covenants every chapel obeys

Six chapels have shipped against this admin app — chargebacks (kingdom-022),
payouts + membership + rewards (kingdom-023), system/email (kingdom-020),
trust/reviews (kingdom-025 first chapel). They all obey one form. The form is
named once at [`docs/connections/the-shape-of-a-chapel.md`](../../docs/connections/the-shape-of-a-chapel.md)
(S15) so the seventh chapel inherits instead of invents:

1. **Substrate honesty** — `<Provenance>` on the page header naming live /
   synced / snapshot / cached / computed.
2. **Transparency** — `<WhyLink>` next to every derived value, pointing at a
   `docs/methodology/<topic>.md` page that cites source code paths.
3. **Auditability** — every mutation runs inside `adminAction()` so it auth-
   checks, formats results, writes to `admin_actions_log`, and revalidates.
4. **Deep-link discipline** — name what doesn't migrate. Banners + per-row
   "↗ legacy" affordances make the chapel's perimeter visible.
5. **Migration ledger** — strike your own row in
   [`docs/connections/twelve-promises.md`](../../docs/connections/twelve-promises.md)
   and add a paragraph naming what shipped, when, with file paths.

The form doc also lists the six known shadow gaps the form does not yet cover
(Stripe SDK extraction, prize-undo eligibility helper, lifecycle-log helpers,
observability gate, async recompute timing, raffle/box config). Each new
chapel is honest about which of these it still defers to legacy.

**Ten-step recipe** for building chapel #N is at the bottom of S15 — read it
before opening any `page.tsx`.

## Module review playbook (READ THIS BEFORE BUILDING)

Whenever you start, finish, or audit a page, follow
[`docs/review-playbook.md`](docs/review-playbook.md). Six named categories:
**A** Inventory, **B** Reconnaissance, **C** Live verification (Playwright MCP
walk after `/api/dev-signin`), **D** Bug fix in-session, **E** Root-cause
investigation, **F** Mission authoring (writes to
`~/Love/memory/dev-state.json`). The playbook is the loom for every TCG admin
mission — pre-build, post-build, and routine drift checks all run through it.

## Stack quickreference
- Next.js 16 (App Router, Turbopack), React 19, TypeScript 5
- NextAuth v5, magic-link only (`src/lib/auth/`)
- Two databases: `sfQuery()` → storefront RDS, `wsQuery()` → wholesale RDS
- Server Components by default; client components only where state is needed
- Server Actions for mutations (no `/api/admin/*` routes)
- Tailwind 4, dark theme: `bg-neutral-900`, blue/amber/emerald/red accents

## Two page archetypes

Every page is one of these. Pick on intent, not on size.

### Dashboard archetype
Read-only, multi-section, KPIs at the top, deep-links out. Used when the
admin app is *summarising* state owned by another module (e.g.
`/commerce/auctions` summarises auctions, but creation/payout still happens
in storefront admin until that surface migrates).

Skeleton:

```tsx
import { PageHeader, KpiGrid, KpiCard, SectionHeading, DataTable, ExternalLink } from "@/lib/ui";
import { sfQuery } from "@/lib/db";
import { safe, safeCount, isUnavailable } from "@/lib/queries";
import { fmtGBP, fmtDate } from "@/lib/format";

export const metadata = { title: "<Module Name>" };

export default async function Page() {
  const [a, b] = await Promise.all([
    safe(() => sfQuery<RowA>(`SELECT ...`), { rows: [] }),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM ...`),
  ]);

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        title="Module Name"
        description={...}
        action={<ExternalLink href="https://..." variant="primary">Open Admin</ExternalLink>}
      />

      <KpiGrid cols={5}>
        <KpiCard label="Open" value={a.rows.length} urgency="critical" />
        <KpiCard label="Total" value={b} unavailable={isUnavailable(b)} />
        ...
      </KpiGrid>

      <section>
        <SectionHeading count={a.rows.length}>Open</SectionHeading>
        <DataTable columns={...} rows={a.rows} rowKey={(r) => r.id} />
      </section>
    </div>
  );
}
```

### Manager archetype
Owns the data. Search + filter pills + paginated table. Used when the admin
app is the canonical surface for a domain (e.g. `/catalog/users`,
`/ops/orders`). Mutations stay in this page via Server Actions.

Skeleton:

```tsx
import { PageHeader, FilterPills, SearchForm, DataTable, Pagination, StatusBadge } from "@/lib/ui";
import { sfQuery } from "@/lib/db";

const PAGE_SIZE = 50;
export const metadata = { title: "<Module Name>" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Build WHERE / params, run rows + total + facets in parallel
  const [rowsResult, totalResult, byStatusResult] = await Promise.all([...]);
  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Href factory used by FilterPills + SearchForm + Pagination
  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (overrides.q ?? q) next.set("q", overrides.q ?? q);
    if (overrides.status ?? status) next.set("status", overrides.status ?? status);
    const newPage = overrides.page ?? String(page);
    if (newPage !== "1") next.set("page", newPage);
    const qs = next.toString();
    return `<this-route>${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Module" description="What this page is for" />
      <FilterPills selected={status} pills={[
        { value: "", label: "All", count: total, href: buildHref({ status: "", page: "1" }) },
        ...byStatusResult.rows.map((r) => ({
          value: r.status,
          label: r.status,
          count: r.count,
          href: buildHref({ status: r.status, page: "1" }),
        })),
      ]} />
      <SearchForm
        action="/<route>"
        value={q}
        clearHref={buildHref({ q: "", page: "1" })}
        preserve={{ status }}
      />
      <DataTable columns={...} rows={rowsResult.rows} rowKey={(r) => r.id} />
      <Pagination
        page={page}
        totalPages={totalPages}
        totalRows={total}
        pageSize={PAGE_SIZE}
        href={(p) => buildHref({ page: String(p) })}
      />
    </div>
  );
}
```

## Server Actions

Mutations live in `_actions.ts` next to the page. Always wrap with
`adminAction()` — it handles auth, governance, error formatting, and
revalidation.

```ts
// app/(dashboard)/money/chargebacks/_actions.ts
"use server";

import { adminAction, ActionInputError } from "@/lib/actions";
import { sfQuery } from "@/lib/db";

export async function forceResolveChargeback(input: { id: string; reason: string }) {
  return adminAction({
    action: "chargeback.force_resolve",
    targetKind: "chargeback",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/money/chargebacks",
    run: async () => {
      if (!input.reason.trim()) throw new ActionInputError("Reason required");
      const r = await sfQuery<{ stripe_dispute_id: string; stripe_status: string }>(
        `UPDATE chargebacks SET stripe_status = 'admin_resolved', resolved_at = now()
           WHERE stripe_dispute_id = $1 RETURNING stripe_dispute_id, stripe_status`,
        [input.id],
      );
      if (r.rows.length === 0) throw new ActionInputError("Chargeback not found");
      return r.rows[0];
    },
  });
}
```

The handler can `throw` for failures — the wrapper formats the result as
`{ ok: false, error: <message> }`. Successful results return
`{ ok: true, data }`. Governance log fires fire-and-forget on success.

In a form:

```tsx
"use client";
import { forceResolveChargeback } from "./_actions";
import { useTransition } from "react";

export function ResolveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => {
        const reason = window.prompt("Reason for force resolve?");
        if (!reason) return;
        start(async () => {
          const result = await forceResolveChargeback({ id, reason });
          if (!result.ok) alert(result.error);
        });
      }}
      disabled={pending}
    >
      {pending ? "Resolving…" : "Force resolve"}
    </button>
  );
}
```

## Database access

- Use `sfQuery<T>(sql, params)` and `wsQuery<T>(sql, params)` from `@/lib/db`
- Use `safe()` / `safeCount()` from `@/lib/queries` for **non-essential** reads —
  they tolerate missing tables and schema drift, returning a fallback / `-1`
- Let throws bubble for **required** reads — Next.js will render the error UI
- Cast numeric columns with `::text` in SELECT to keep precision (raw `pg`
  returns numeric as string anyway, but explicit `::text` makes intent clear)
- Use `to_regclass($1) IS NOT NULL` (via `tableExists()`) before querying tables
  that may not be deployed in dev (`market_trades`, future schemas)

## File layout per module

```
src/app/(dashboard)/<group>/<module>/
  page.tsx            ─ default export, Server Component
  _actions.ts         ─ "use server"; mutations via adminAction()
  _components.tsx     ─ "use client"; only when interactivity is needed
  [id]/page.tsx       ─ row drill-down (when applicable)
```

Files prefixed with `_` are kept out of the route table by Next.js.

## Style rules

- One `<PageHeader>` per page. `max-w-5xl` for Dashboard pages, `space-y-6`
  default container for Manager pages.
- Currency via `fmtGBP()` / `fmtJPY()`. Dates via `fmtDate()` / `fmtDateTime()`.
- `<StatusBadge status={...} />` for any status enum — pass `palette` prop to
  override per-status colors.
- Never hand-roll `<table>` — use `<DataTable />`. If the layout doesn't fit,
  the column abstraction is wrong; fix it once instead of forking.
- "Open in legacy admin" CTAs use `<ExternalLink />` for consistency.

## Testing

### Vitest (unit + integration)
- `pnpm --filter @cambridge-tcg/admin test` — run all Vitest tests
- `pnpm --filter @cambridge-tcg/admin typecheck` — TypeScript check
- Navigation/route tests live in `src/tests/nav.test.ts`

### Doctrine audits (drift detectors)
- `pnpm --filter @cambridge-tcg/admin honesty` — substrate-honesty: schema vs deployed drift, mission-ledger vs git drift.
- `pnpm --filter @cambridge-tcg/admin transparency` — WhyLink coverage, Verifiability coverage, lifecycle-log subject-access coverage.
- `pnpm --filter @cambridge-tcg/admin pricing` — pricing-consolidation drift (kingdom-049). Seven checks: computation surfaces, silent fallback, history-table redundancy, change-log presence, storefront price-surface coverage, mutator inventory. Exits non-zero on drift. See `docs/pricing-current-state.md` for the plan and `docs/connections/the-pricing-arrow.md` (S17) for the story-arc.
- `pnpm --filter @cambridge-tcg/admin creation` — Will + Sophia trace coverage in git history since the doctrine commit. Catches commits missing Co-Authored-By or commits with no Will trace in their body.
- All four are heuristic — false positives are expected and they shrink as work lands. Run via `pnpm audit` (chained) or `pnpm verify` (umbrella). Use as a backlog signal, not as a CI gate (yet).

### Repo-state and mission-queue tools (kingdom-050)
- `pnpm state:snapshot` — regenerate `docs/state.md` (one-page state surface with audit counts + kingdom queue + git status).
- `pnpm missions:list` — CLI listing of the kingdom queue grouped by status.
- `pnpm missions:list --available` — queued + unclaimed.
- `pnpm missions:sync` — regenerate `docs/missions/kingdom-NNN.md` mirror from `~/Love/memory/dev-state.json`.
- `pnpm missions:claim kingdom-NNN` — cooperative claim helper (flips frontmatter, prints suggested commit).
- `pnpm missions:done kingdom-NNN` — flips status, writes `completed_at`.
- `pnpm trace --mission kingdom-NNN --verb done` — pre-fills a pillow-book autonomous-trace block.
- `pnpm agent-readiness` — self-validating audit that every shaping is wired.
- For the operations cycle (find → claim → work → verify → trace) see [`AGENTS.md`](../../AGENTS.md) at the repo root.

### Smoke runner (fast, no browser)
Run this **before claiming acceptance** on any module:

```bash
# Start the dev server first
pnpm --filter @cambridge-tcg/admin dev

# In another terminal:
pnpm --filter @cambridge-tcg/admin smoke
```

Discovers all 26 dashboard routes from the filesystem, signs in via
`/api/dev-signin`, fetches each route, and outputs a markdown report.
Exits 1 on any non-200 or error boundary. Runs in <60s.

### Playwright E2E (browser, full verification)
```bash
pnpm --filter @cambridge-tcg/admin test:e2e        # run all specs
pnpm --filter @cambridge-tcg/admin test:e2e:ui     # interactive UI mode
pnpm --filter @cambridge-tcg/admin test:e2e --grep "/trust/disputes"  # single route
```

Three spec templates in `apps/admin/tests/`:
- `smoke.spec.ts` — auto-generated from filesystem, asserts 200 + no error boundary on all routes
- `manager.template.spec.ts` — copy for Manager-archetype pages (search, table, state transition)
- `dashboard.template.spec.ts` — copy for Dashboard-archetype pages (KPI counts, deep links)

**When you build a new admin page:**
1. Copy the matching template spec (`manager.template.spec.ts` or `dashboard.template.spec.ts`)
2. Rename to `<group>-<module>.spec.ts` in `apps/admin/tests/`
3. Fill in the route, title pattern, and assertions for your module
4. Run `pnpm --filter @cambridge-tcg/admin smoke` — verify 200 + no error boundary
5. Run `pnpm --filter @cambridge-tcg/admin test:e2e` — verify all assertions pass
6. Include test results in your PR / mission completion notes

### Playwright MCP (interactive — for Gamma/review sessions)
The `.mcp.json` at the repo root registers the Playwright MCP server.
Any Claude Code session opened in this repo can use it:

```
Playwright MCP: navigate http://localhost:3002/api/dev-signin
Playwright MCP: navigate http://localhost:3002/<route>
Playwright MCP: browser_snapshot target=main
Playwright MCP: browser_console_messages level=error
```

Follow the Category C workflow in `docs/review-playbook.md`.

### Rules
- Don't use the Drizzle query builder — raw SQL via `sfQuery`/`wsQuery` only
- Keep smoke passing: every new route added to the filesystem is covered automatically
- Don't mark a mission `review` or `done` until `smoke` exits 0

## Optional env vars

- `VERCEL_TOKEN` — required by `/system/deploys` to read deploy state
  and trigger redeploys. Team-scoped to `cambridgetcgs-projects`. Without
  it the page renders an actionable error banner.
- `GITHUB_TOKEN` — required by `/system/deploys` to detect SHA drift
  between deployed code and `main` HEAD, and by `redeployFromMain` to
  resolve current `main` HEAD. Fine-scoped PAT with `repo` read access
  to `cambridgetcg/Cambridge-TCG-monorepo`.

Without either, the page degrades gracefully (banners + disabled actions)
but doesn't crash. They're optional for non-system features.

## Local dev shortcuts

- `GET /api/dev-signin` — bypasses magic-link in dev. Localhost-only,
  hard-gated on `NODE_ENV !== 'production'`. Upserts
  `contact@cambridgetcg.com` with `role='admin'` and mints a session.
- `pnpm --filter @cambridge-tcg/admin dev` — admin runs on `:3002`
- The dev server connects to the *production* RDS instances (per
  `apps/admin/.env.local`). Page reads are safe; only `dev-signin` mutates
  (refreshes the session row).

## What to avoid

- Don't add `/api/admin/*` routes — use Server Actions
- Don't import storefront/wholesale internals — only `@cambridge-tcg/db`,
  `@cambridge-tcg/aws`, `@cambridge-tcg/stock` packages are shared
- Don't assume table existence — wrap in `safe()` or `tableExists()`
- Don't emit `<title>` containing the suffix manually — root layout's
  `template: "%s — Cambridge TCG Admin"` handles it. `metadata.title = "X"` is enough.
- Don't redefine `KpiCard` / `StatusBadge` / table shells — they're in `@/lib/ui`
