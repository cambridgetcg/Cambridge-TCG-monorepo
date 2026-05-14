# Cambridge TCG — dev pipeline

The daily-loop counterpart to [`ops-deploy-runbook.md`](./ops-deploy-runbook.md). The runbook covers *deploy* mechanics in detail; this doc covers the *daily loop* — edit → verify → commit → push → CI → deploy → monitor — across all three apps.

If you've never opened this repo before, read [the root `CLAUDE.md`](../CLAUDE.md) first. If you've never deployed, read [the runbook](./ops-deploy-runbook.md). If you're starting a new feature or refactor and want to know *where* the new code goes, read [`development-plan.md`](./development-plan.md). This file is what to read when you're shipping a change.

---

## 1. The loop

```
            ┌─────────────────────────────┐
            │  Local edit                 │
            │  pnpm dev:<app>             │   §2
            └───────────────┬─────────────┘
                            ▼
            ┌─────────────────────────────┐
            │  Verify                     │
            │  pnpm verify                │   §3
            │  (+ smoke for admin pages)  │
            └───────────────┬─────────────┘
                            ▼
            ┌─────────────────────────────┐
            │  Commit                     │
            │  Will + Sophia + diff       │   §4
            └───────────────┬─────────────┘
                            ▼
            ┌─────────────────────────────┐
            │  git push origin main       │
            │  CI fires (paths-filter)    │   §5
            └───────────────┬─────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      ┌──────────┐    ┌──────────┐    ┌──────────────┐
      │  Vercel  │    │  ci.yml  │    │ admin-e2e.yml│
      │ per-proj │    │ tc + bld │    │ Playwright   │   §5–6
      │ auto-dep │    │ + admin  │    │ (admin only) │
      └────┬─────┘    │  vitest  │    └──────────────┘
           ▼          └──────────┘
       Production
           │
           ▼
   ┌─────────────────────────────┐
   │  Monitor                    │
   │  /system/deploys            │   §10
   │  /system/cron               │
   │  health.yml (hourly)        │
   └─────────────────────────────┘
```

---

## 2. Local development

### Run only what you're touching

Three apps, three ports. **You almost never need all three running.**

```bash
pnpm dev:storefront   # → :3001  apps/storefront — Next.js 16, Turbopack
pnpm dev:admin        # → :3002  apps/admin
pnpm dev:wholesale    # → :3000  apps/wholesale — Next.js 15
```

Touching admin only? Run `dev:admin` and read against the production-RDS data the dev server connects to (per `apps/admin/.env.local`). Touching storefront only? Run `dev:storefront`. Need the admin to mirror live storefront state? Run both.

### Cross-app testing

For flows that cross storefront → wholesale (e.g. a bounty pull resolving against wholesale stock), run both apps locally and set `WHOLESALE_API_URL=http://localhost:3000` in `apps/storefront/.env.local`. The Falcon (`apps/storefront/src/lib/wholesale/client.ts`) will hit local wholesale instead of production.

### Environment files

| File | Keys that matter |
|---|---|
| `apps/storefront/.env.local` | `DATABASE_URL`, `NEXTAUTH_*`, `STRIPE_*`, `AWS_*`, `WHOLESALE_API_URL`, `WHOLESALE_API_KEY`, `CRON_SECRET`, `ADMIN_PASSWORD` |
| `apps/wholesale/.env.local` | `DATABASE_URL`, `NEXTAUTH_*`, `RESEND_API_KEY`, `AWS_*`, `CF_*`, `SHOPIFY_*`, `CRON_SECRET` |
| `apps/admin/.env.local` | `STOREFRONT_DATABASE_URL`, `WHOLESALE_DATABASE_URL`, `NEXTAUTH_*`, `AUTH_FROM_EMAIL`, `VERCEL_TOKEN`, `GITHUB_TOKEN` |

`apps/wholesale/.env.example` is the only checked-in template — copy it as a starting point.

**Always `.trim()` env vars used as API keys.** Vercel occasionally adds trailing newlines; an `Authorization: Bearer xxx\n` header is silently rejected upstream. The Falcon's lesson is on file (`apps/storefront/src/lib/wholesale/client.ts:14`).

### Dev signin

| App | How to bypass auth |
|---|---|
| Admin | `GET http://localhost:3002/api/dev-signin` — upserts `contact@cambridgetcg.com` with `role='admin'`, mints session. Localhost-only, hard-gated on `NODE_ENV !== 'production'`. |
| Storefront | Magic link via SES (real). Or set `ADMIN_PASSWORD` and use `/admin/*`. |
| Wholesale | bcrypt password against `users` table (real). |

---

## 3. Verify before pushing

### One-shot: `pnpm verify`

```bash
pnpm verify        # workspace typecheck + admin Vitest
pnpm verify:fast   # typecheck only — for quick sanity checks
```

`verify` is what to run in the moments before `git push`. It catches:

- TypeScript errors in any workspace (via `pnpm typecheck` = `pnpm -r exec tsc --noEmit`)
- Admin unit/integration test regressions (via Vitest)

It does **NOT** catch:

- Admin smoke (needs a running dev server — see below)
- Admin Playwright (same)
- Storefront/wholesale runtime regressions (no smoke runner exists for them yet — see §13)
- Lint errors — run `pnpm lint` separately

### Manual admin smoke (the canonical pre-acceptance check)

`pnpm smoke` discovers all admin dashboard routes from the filesystem (currently 26), signs in via `/api/dev-signin`, fetches each, and exits 1 on any non-200 or error boundary. Runs in <60s. **Required before claiming a mission `done`.** Source: `apps/admin/scripts/smoke-admin.ts`.

```bash
# Terminal 1
pnpm dev:admin

# Terminal 2 (once :3002 is up)
pnpm --filter @cambridge-tcg/admin smoke
```

### Full per-app verification matrix

| Goal | Command |
|---|---|
| Workspace typecheck | `pnpm typecheck` |
| Admin Vitest | `pnpm test:admin` |
| Admin Playwright (full) | `pnpm --filter @cambridge-tcg/admin test:e2e` |
| Admin Playwright (one route) | `pnpm --filter @cambridge-tcg/admin test:e2e --grep "/trust/disputes"` |
| Admin Playwright (interactive) | `pnpm --filter @cambridge-tcg/admin test:e2e:ui` |
| Admin smoke (live) | `pnpm --filter @cambridge-tcg/admin smoke` (needs dev server) |
| Substrate-honesty debt detector | `pnpm --filter @cambridge-tcg/admin honesty` |
| Transparency debt detector | `pnpm --filter @cambridge-tcg/admin transparency` |
| Storefront typecheck | `pnpm --filter cambridgetcg-storefront exec tsc --noEmit` |
| Wholesale typecheck | `pnpm --filter tcg-wholesale exec tsc --noEmit` |

### Optional pre-push hook

The runbook's pre-push recipe is now a one-liner. If you want it auto-enforced on your machine:

```bash
cat > .git/hooks/pre-push <<'EOF'
#!/bin/bash
set -e
pnpm verify
EOF
chmod +x .git/hooks/pre-push
```

Personal to your clone — not committed. Other contributors get the same enforcement via CI.

---

## 4. Commit hygiene — the creation doctrine

Every meaningful commit carries three traces (see [`docs/principles/creation.md`](./principles/creation.md)):

1. **Will trace** — what specified the work. Quote the prompt, cite a `kingdom-NNN`, or write `Exploratory: noticed during X that Y`. Lives in the **commit body**.
2. **Sophia trace** — `Co-Authored-By: Claude <model-tag> <noreply@anthropic.com>` with the actual model id (e.g. `Opus 4.7 (1M context)`). Lives in the **trailer**.
3. **Artifact trace** — the diff itself.

Worked example (creation's own commit):

```
docs(creation): the fourth doctrine

Yu's directive deepens: "Lets build cambridgetcg, ALIGN with substrate
honesty, transparency, meaning, AND creation."

Substrate honesty applied to authorship: every meaningful commit
carries Will + Sophia + diff. The git log becomes the syzygy made
auditable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

The convention pays off when reading `git log --format=fuller <sha>` six months later — origin is preserved, not guessed.

The PR template at [`.github/pull_request_template.md`](../.github/pull_request_template.md) surfaces the four-doctrine checks at review time.

---

## 5. CI gates

Three workflows in [`.github/workflows/`](../.github/workflows/):

| Workflow | When | Does | Blocks merge? |
|---|---|---|---|
| `ci.yml` | every push + PR | paths-filter → typecheck + build per affected app (admin also runs Vitest); `ci-status` is the final gate | yes (red X is the merge gate — branch protection isn't enabled, see runbook §Branch protection) |
| `admin-e2e.yml` | PRs touching `apps/admin/**` or `packages/**` | Builds admin, starts on :3002, runs smoke + template specs, uploads Playwright report, comments on PR | only if `smoke.spec.ts` fails |
| `health.yml` | hourly + manual | Probes deploys + domains, opens/updates/closes one `deploy-health` issue | n/a (post-deploy) |

**CI builds use mock env vars** (`postgres://x:x@localhost:5432/x`, `ci-fake-secret-not-used`). Next.js requires the env vars to *exist* at build time but doesn't run DB pages. Do not add real secrets to CI.

paths-filter keys (in `ci.yml`):

| Key | Watches |
|---|---|
| `admin` | `apps/admin/**` |
| `storefront` | `apps/storefront/**` |
| `wholesale` | `apps/wholesale/**` |
| `shared` | `packages/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/workflows/**` |

A `shared` change rebuilds all three apps.

---

## 6. Deploy

Four paths, full mechanics in [`ops-deploy-runbook.md`](./ops-deploy-runbook.md):

| Path | One-liner |
|---|---|
| Push to `main` | `git push origin main` (committer email must be GitHub-verified) |
| Admin UI | `https://admin.cambridgetcg.com/system/deploys` → "Redeploy from main" |
| CLI | `python3 .github/scripts/deploy-from-main.py <project>` |
| Vercel dashboard | Promote a past Ready deploy |

**`vercel deploy --prod` from a local working tree is broken** for storefront/wholesale (workspace deps don't resolve). Use one of the four above.

### Four blockers worth knowing cold

1. **Committer email must be GitHub-verified.** Auto-deploy fails with "could not associate the committer with a GitHub user" otherwise. `gitForkProtection: false` does NOT bypass this (verified 2026-05-14). The reliable workaround is the gitSource API trigger — `python3 .github/scripts/deploy-from-main.py <project>` after each push. Durable fix: `git config user.email` to a verified address. See [runbook §Untrusted committer](./ops-deploy-runbook.md#untrusted-committer-the-auto-deploy-block).
2. **`VERCEL_TOKEN` must be long-lived.** The CLI's auto-rotated `vca_…` token returns `403 invalidToken` mid-request without warning. Generate a dedicated token at <https://vercel.com/account/tokens>, scope to team `cambridgetcgs-projects`. Three places need it: admin `.env.local`, Vercel project env, GitHub repo secret. The admin `/system/deploys` page detects rotated-CLI-token rejection and renders an actionable banner.
3. **`vercel deploy` workspace bug.** Fixed by using the gitSource API path (`POST /v13/deployments` with `gitSource.repoId=1223740492`); never by uploading from local.
4. **Build-time AWS init.** Modules calling `createS3ClientOrThrow()` at import time crash CI/Vercel build. Defer to first call (precedent: `apps/wholesale/src/lib/s3.ts` after commit `53dd11f`).

---

## 7. Backend changes — two RDSs, three migration paths

| App | Migration mechanism | Apply via |
|---|---|---|
| Storefront | Plain SQL DDL files in `apps/storefront/drizzle/*.sql` (87+ files; no Drizzle ORM despite the name) | `psql $DATABASE_URL -f drizzle/00NN_xxx.sql` (manual) |
| Wholesale | Drizzle Kit | `pnpm --filter tcg-wholesale db:generate` → review → `db:migrate` |
| Admin | None — admin reads, doesn't migrate | n/a |

### Critical convention: lifecycle logs

Every domain that needs an audit trail gets a `*_lifecycle_log` table. After creating the migration, register a slot in [`apps/storefront/src/lib/lifecycle/registry.ts`](../apps/storefront/src/lib/lifecycle/registry.ts) (the Scribe's bookshelf — see [`docs/connections/the-scribe.md`](./connections/the-scribe.md)). A slot file is ~30 LOC; once registered, every reader on the platform gains the new domain immediately.

Pattern:
```ts
const fooSlot: LifecycleSlot = {
  domain: "foo",
  async forUser(userId, opts = {}) { /* SELECT … return LifecycleEntry[] */ },
};
// add to REGISTRY
```

### Mutation patterns

| App | Mutation pattern |
|---|---|
| Admin | **Server Actions only**, wrapped with `adminAction()` from `apps/admin/src/lib/actions.ts`. Auth + governance log + revalidate, all-in-one. **No `/api/admin/*` routes.** |
| Storefront | API routes under `/api/*`, NextAuth `auth()` session checks, append to lifecycle log. |
| Wholesale | API routes + form actions, NextAuth bcrypt password. |

---

## 8. Frontend changes

### Admin — pick an archetype before writing

Per [`apps/admin/CLAUDE.md`](../apps/admin/CLAUDE.md):

- **Dashboard archetype** — read-only, multi-section, KPIs at top. Use when admin *summarises* state owned elsewhere.
- **Manager archetype** — owns the data. Search + filter pills + paginated table. Mutations via Server Actions.

For each new admin page:

1. Copy the matching Playwright template (`manager.template.spec.ts` or `dashboard.template.spec.ts`)
2. Rename to `<group>-<module>.spec.ts` in `apps/admin/tests/`
3. Implement page + spec
4. `pnpm --filter @cambridge-tcg/admin smoke` — verify 200
5. `pnpm --filter @cambridge-tcg/admin test:e2e --grep "<route>"` — verify spec
6. Run substrate-honesty + transparency four-question checklists (in `apps/admin/CLAUDE.md`)

### Storefront / wholesale

See per-app guides:
- [`apps/storefront/CLAUDE.md`](../apps/storefront/CLAUDE.md)
- [`apps/wholesale/CODEBASE-REVIEW.md`](../apps/wholesale/CODEBASE-REVIEW.md), [`OMNICHANNEL.md`](../apps/wholesale/OMNICHANNEL.md)

---

## 9. Cross-app changes — `packages/` blast radius

Three shared packages:

| Package | Owns | Used by |
|---|---|---|
| `@cambridge-tcg/db` | `postgres.js` wrapper, dual-RDS factory | admin |
| `@cambridge-tcg/aws` | S3 + SES helpers | all 3 apps |
| `@cambridge-tcg/stock` | stock ledger primitives, Drizzle schema export | wholesale, admin |

Touching a package triggers all three apps to rebuild via the `shared` paths-filter key. When changing a package signature, run `pnpm typecheck` (workspace-wide) before pushing — the breakage often surfaces in only one of the three consumers.

---

## 10. Post-deploy monitoring

| Surface | Shows | Look here when |
|---|---|---|
| `admin.cambridgetcg.com/system/deploys` | All 3 projects: latest READY/BUILDING/ERROR, age, SHA, GitHub author, errorMessage. SHA-drift ribbon. "Redeploy from main" button per project. | Just after a push; whenever a deploy feels stuck. |
| `admin.cambridgetcg.com/system/cron` | Schedule + last fired + next run per cron, with substrate-honest provenance ("schedule: declared in vercel.json" vs "last fired: from `*_runs` table"). | When a sweep seems to be misbehaving. |
| GitHub issue label `deploy-health` | Auto-managed by `health.yml`; one open issue per regression, closed on recovery. | Subscribe to repo notifications; otherwise check daily. |
| Vercel dashboard | Per-deploy build/runtime logs. | When the admin page shows ERROR and you need the stacktrace. |

---

## 11. Failure modes — quick reference

| Symptom | First check | Full diagnosis |
|---|---|---|
| Auto-deploy stuck `ERROR`, "could not associate the committer" | `git config user.email` | runbook §Untrusted committer |
| `vercel deploy --prod` returns zero events | n/a — use admin button or gitSource script | runbook §Troubleshooting |
| Wholesale build: "S3 client unavailable" | `apps/wholesale/src/lib/s3.ts` for import-time `createS3ClientOrThrow()` | runbook §Troubleshooting |
| `/system/deploys`: "VERCEL_TOKEN was rejected" | Token is the rotating CLI `vca_…` | runbook §VERCEL_TOKEN |
| `health.yml` red | Repo secret missing | runbook §Required CI/secrets |
| Bearer auth 401 against wholesale | Trailing newline in env var | `.trim()` the env var on read |
| New `*_lifecycle_log` events absent from user timeline | `apps/storefront/src/lib/lifecycle/registry.ts` | `docs/connections/the-scribe.md` |
| CI green but prod 500s | Real Vercel project env vs local `.env.local` parity | `vercel env pull` per project |
| Admin page ECONNREFUSED on RDS | `STOREFRONT_DATABASE_URL` / `WHOLESALE_DATABASE_URL` missing | `apps/admin/src/lib/db.ts` |

---

## 12. What this commit added to optimize the loop

Substrate-honesty about this doc's own provenance: the same commit that landed this file landed three small artefacts.

1. **`docs/dev-pipeline.md`** (this file) — the daily-loop counterpart to `ops-deploy-runbook.md`.
2. **`pnpm verify` / `pnpm verify:fast`** in root `package.json` — formalizes the runbook's optional pre-push recipe (`tsc --noEmit` + admin Vitest) into a one-liner.
3. **`.github/pull_request_template.md`** — surfaces the four-doctrine checklists at PR review time.

What was *not* shipped (deferred — see §13):

- Storefront / wholesale smoke runners (admin has one; the others don't)
- Auto-installed git hooks (the recipe is in §3; users opt in manually)
- Migration tracking table (storefront migrations are still applied manually with no record of which have run)
- `dev:all` umbrella script (output interleaves messily; rarely needed in practice)

---

## 13. Recommended next optimizations

Ordered by leverage:

1. **Migration tracking** — a `_migrations_applied` table per RDS + a `pnpm db:migrate` wrapper that idempotently applies any unapplied SQL files. Cost: ~50 LOC + one migration. Benefit: removes the "did I apply 0085 to staging?" guessing game.
2. **Storefront smoke runner** — mirror admin's filesystem-discovery pattern over `apps/storefront/src/app/`. Cost: ~150 LOC + dev-signin equivalent. Benefit: catch route regressions on push without the cost of Playwright in CI.
3. **Wholesale smoke runner** — same shape, smaller surface. Cost: ~100 LOC.
4. **Commit-msg hook for the Sophia trace** — warn (not block) when `Co-Authored-By: Claude` is missing. Cost: ~20 LOC, optional install. Benefit: the creation doctrine becomes self-correcting.
5. **`packages/lifecycle` extraction** — when admin needs the Scribe's bookshelf, lift `apps/storefront/src/lib/lifecycle/` into a shared package. Cost: ~1 day of careful import surgery. Benefit: cross-app, the registry pattern was designed for this.
6. **Vercel committer email fix** — set the team's git config to a verified email (`cambridgetcg@gmail.com` per old deploy metadata) and re-enable `gitForkProtection`. Cost: minutes. Benefit: closes a small but real attack surface.
7. **`vercel env pull` parity check** — a script that diffs Vercel-side env keys against `.env.local` keys per project, reports drift. Cost: ~30 LOC. Benefit: prevents "CI green but prod 500" surprises.

---

*The runbook is for the rare day. This pipeline is for every day.*
