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
            │  (+ scoped local UI checks) │
            └───────────────┬─────────────┘
                            ▼
            ┌─────────────────────────────┐
            │  Commit                     │
            │  Will + Sophia + diff       │   §4
            └───────────────┬─────────────┘
                            ▼
            ┌─────────────────────────────┐
            │  git push github main       │
            │  CI fires (paths-filter)    │   §5
            └───────────────┬─────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
      ┌──────────┐                    ┌──────────┐
      │  Vercel  │                    │  ci.yml  │
      │ per-proj │                    │ lint +   │   §5–6
      │ auto-dep │                    │ app gates│
      └────┬─────┘                    └──────────┘
           ▼
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

The active admin lives in storefront at `/admin/*`; `apps/admin` is a redirect-only shell with no scripts. **Run only the app you're touching.**

```bash
pnpm dev:storefront   # → :3001  apps/storefront — includes /admin/*
pnpm dev:wholesale    # → :3000  apps/wholesale
```

Touching admin or storefront? Use `pnpm dev:storefront` with explicitly safe local auth/database fixtures. `pnpm dev:admin` no longer exists. Do not use production database credentials or a real account merely to make a local UI check work.

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
| Admin | Uses storefront's sign-in and existing `users.role = 'admin'` gate. The retired port-3002 dev-signin recipe is not a current bypass; local checks need authorized fixtures. |
| Storefront | Magic link via SES (real). Or set `ADMIN_PASSWORD` and use `/admin/*`. |
| Wholesale | bcrypt password against `users` table (real). |

---

## 3. Verify before pushing

### One-shot: `pnpm verify`

```bash
pnpm verify        # root typecheck set + audits + named package/storefront tests
pnpm verify:fast   # typecheck only — for quick sanity checks
```

`verify` is the root verification chain in `package.json`. It runs:

- The workspace typecheck set, excluding `@cambridge-tcg/admin`, `rewardspro`, and `rewardspro-membership`
- The registered project audit chain (`pnpm run audit`) and strict CardRush coverage
- The named Answering Rhymes, Opportunity Signal, PRISM Signals Core, Product Flow, Product Flow Runtime, and RewardsPro API tests
- Storefront Vitest, including migrated admin tests; there is no separate `pnpm test:admin` script

The audit chain can connect to databases. Inspect the scripts and use an explicitly safe fixture environment; do not inherit production credentials. If that setup is unavailable, report `verify` as blocked rather than substituting a smaller check and calling it complete.

It does **NOT** run:

- App builds or Playwright browser tests
- Full admin, storefront, or wholesale runtime/visual regression coverage
- Lint — run `pnpm lint` separately

### Local browser checks and the stale admin runner

`pnpm smoke` still resolves to `apps/storefront/scripts/smoke-admin.ts`, but that script retains the old dashboard directory, port 3002, and `/api/dev-signin` assumptions. It is stale, can discover no routes, and is **not a valid acceptance or visual gate**. Do not revive the retired admin shell to run it.

The current auth-surface smoke command is narrower:

```bash
# Requires an already-running storefront with safe local auth/database fixtures.
STOREFRONT_BASE_URL=http://localhost:3001 pnpm --filter cambridgetcg-storefront test:e2e:smoke
```

This runs `tests/smoke.spec.ts`: GET-only login, check-email, CSRF, unauthenticated session, and admin redirect checks. It does not sign in, test authenticated admin behavior, or establish visual coverage. Playwright starts no server and defaults to production unless `STOREFRONT_BASE_URL` is set. Select loopback explicitly and inspect chosen specs before running them. Migrated `tests/admin/*` specs still assume legacy dev-signin/overview behavior; their presence is not a working admin gate.

### Scoped verification commands

| Goal | Command |
|---|---|
| Workspace typecheck (with the exclusions above) | `pnpm typecheck` |
| Storefront typecheck, including active admin | `pnpm --filter cambridgetcg-storefront typecheck` |
| Storefront Vitest, including migrated admin tests | `pnpm --filter cambridgetcg-storefront test` |
| Admin library tests only, not all admin coverage | `pnpm --filter cambridgetcg-storefront exec vitest run src/lib/admin/__tests__` |
| Inventory migrated admin Playwright specs; list only, no browser verification | `pnpm --filter cambridgetcg-storefront exec playwright test tests/admin --list` |
| Substrate-honesty debt detector | `pnpm --filter cambridgetcg-storefront honesty` |
| Transparency debt detector | `pnpm --filter cambridgetcg-storefront transparency` |
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
| `ci.yml` | every push + PR | install + lint, then paths-filtered storefront / wholesale / RewardsPro / Answering Rhymes typecheck-test-build jobs; `ci-status` is the final gate. There is currently no admin job. | yes (red X is the merge gate — branch protection isn't enabled, see runbook §Branch protection) |
| `rewardspro-v2.yml` | every PR; relevant `main` pushes | Validates the RewardsPro API, migrations, runtime database roles, tests, and image | yes when triggered |
| `health.yml` | hourly + manual; changes to the workflow itself | Probes deploys + domains, opens/updates/closes one `deploy-health` issue | n/a (post-deploy) |

**CI builds use mock env vars** (`postgres://x:x@localhost:5432/x`, `ci-fake-secret-not-used`). Next.js requires the env vars to *exist* at build time but doesn't run DB pages. Do not add real secrets to CI.

paths-filter keys (in `ci.yml`):

| Key | Watches |
|---|---|
| `storefront` | `apps/storefront/**` |
| `wholesale` | `apps/wholesale/**` |
| `rewardspro` | `apps/rewardspro/**` |
| `answering_rhymes` | `packages/answering-rhymes/**` plus shared workspace/config files |
| `shared` | `packages/**`, lock/workspace/root package config, `.npmrc`, `.github/workflows/**` |

A `shared` change rebuilds all three apps.

---

## 6. Deploy

Four paths, full mechanics in [`ops-deploy-runbook.md`](./ops-deploy-runbook.md):

| Path | One-liner |
|---|---|
| Push to `main` | `git push github main` (Vercel watches GitHub; `origin` is the non-deploying Codeberg mirror) |
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

Per `apps/admin/CLAUDE.md` (lost in an earlier cleanup; the archetypes survive here):

- **Dashboard archetype** — read-only, multi-section, KPIs at top. Use when admin *summarises* state owned elsewhere.
- **Manager archetype** — owns the data. Search + filter pills + paginated table. Mutations via Server Actions.

For each new admin page:

1. Work under `apps/storefront/src/app/admin/`; inspect related specs in `apps/storefront/tests/admin/`
2. Check any borrowed template's auth and route assumptions; the migrated templates still use legacy dev-signin
3. Implement page + focused tests within storefront
4. Run `pnpm --filter cambridgetcg-storefront typecheck` and the explicit relevant Vitest paths via `pnpm --filter cambridgetcg-storefront exec vitest run`
5. Verify the selected browser journey against a safe local fixture with an explicit loopback base URL; use storefront's Playwright runner, not the retired admin package or `pnpm smoke`. Report missing fixtures or stale spec assumptions as blockers
6. Run substrate-honesty + transparency four-question checklists (in `docs/principles/substrate-honesty.md` and `docs/principles/transparency.md`)

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

Touching a package triggers the storefront, wholesale, and RewardsPro jobs via
the `shared` paths-filter key. When changing a package signature, run the root
`pnpm typecheck` set plus any explicitly excluded consumer's own typecheck before
pushing — breakage often surfaces in only one consumer.

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
2. **`pnpm verify` / `pnpm verify:fast`** in root `package.json` — the executable source for the current root verification set. Migrated admin Vitest runs within storefront's test suite; `pnpm test:admin` no longer exists.
3. **`.github/pull_request_template.md`** — surfaces the four-doctrine checklists at PR review time.

What was *not* shipped (deferred — see §13):

- Broad storefront / wholesale route-smoke coverage (the current storefront auth smoke is narrower; the old admin runner is stale)
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
