# Deploy & infrastructure runbook

## Project wiring — quick reference

| App | Vercel project | Project ID | Domain | Repo path |
|---|---|---|---|---|
| Admin | `cambridgetcg-admin` | `prj_NGfGodqkx5LCMA6XoeShCAeZZm6u` | `admin.cambridgetcg.com` | `apps/admin` |
| Storefront | `cambridgetcg-storefront` | `prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD` | `cambridgetcg.com` | `apps/storefront` |
| Wholesale | `tcg-wholesale` | `prj_t4pr1FszCa87GWAIgQXTbyXED8qr` | `wholesaletcgdirect.com` | `apps/wholesale` |

- **Vercel team:** `cambridgetcgs-projects` (`team_HR4tb4WB0KZsKxqroSCTQrof`)
- **GitHub repo:** `cambridgetcg/Cambridge-TCG-monorepo` (repoId `1223740492`)
- **Production branch:** `main`
- **Build command (per project):** `pnpm --filter <pkg> build`
- **Install command:** `pnpm install`
- **Root directory (per project):** `apps/<name>`

**Two git remotes are configured by convention:**

```
github → https://github.com/cambridgetcg/Cambridge-TCG-monorepo.git  (deploy target — Vercel watches this)
origin → https://codeberg.org/zerone-dev/Cambridge-TCG.git           (mirror)
```

**Push to `github main` triggers Vercel.** Pushes to `origin` (Codeberg) don't deploy.

## Local Vercel CLI + API access

For day-to-day deploy operations from your laptop:

```bash
# One-time: sign into the CLI as the team owner
vercel login                                   # opens browser; auth cached at
                                               # ~/Library/Application Support/com.vercel.cli/auth.json

# Link your workspace to a specific project (creates apps/<name>/.vercel/)
cd apps/wholesale
vercel link --yes --project tcg-wholesale --scope cambridgetcgs-projects

# Now project-scoped commands work without --project flag:
vercel ls                  # list deployments for this project
vercel env ls production   # list production env vars
vercel logs <url>          # stream runtime logs (NOT build logs)
```

**The CLI's `auth.json` token rotates** (Vercel revokes it within hours of issue). It's fine for interactive use — re-run `vercel login` when it expires. For automation, use a long-lived API token (next section).

### Long-lived API token (for scripts + integrations)

Store the token in macOS Keychain so it's never echoed:

```bash
# Generate at https://vercel.com/account/tokens, scope to team cambridgetcgs-projects.
# Stash:
security add-generic-password \
  -s "vercel-api-token" \
  -a "vercel-cambridge-tcg" \
  -l "Cambridge TCG Vercel API token (long-lived, full account access)" \
  -w  "<paste-token>"

# Retrieve (only echoes to the receiving command's stdin via $()):
TOKEN=$(security find-generic-password -s "vercel-api-token" -a "vercel-cambridge-tcg" -w)

# Use:
curl -sS "https://api.vercel.com/v9/projects/tcg-wholesale?teamId=team_HR4tb4WB0KZsKxqroSCTQrof" \
  -H "Authorization: Bearer $TOKEN"
```

The token is also needed in three persistent places — see [`VERCEL_TOKEN`](#vercel_token--use-a-long-lived-token-not-the-clis-auto-rotated-one) below.

## The five-minute deploy gate (read first)

Before pushing a commit that will trigger production deploys:

```bash
# 1. Typecheck every package + app (~30s)
pnpm typecheck

# 2. Build each affected app locally — catches Turbopack/bundler
#    issues that typecheck does NOT (see "Common deploy failures" below).
#    Only required for apps you touched, but cheap to run all three.
pnpm --filter cambridgetcg-storefront build   # ~10s, 380+ pages
pnpm --filter tcg-wholesale build              # ~10s, 75 pages
pnpm --filter @cambridge-tcg/admin build       # ~10s

# 3. Run the registered project audits + unit tests
# (`pnpm audit` without `run` invokes pnpm's dependency-vulnerability audit.)
pnpm run audit && pnpm test:admin
pnpm --filter @cambridge-tcg/sku test
pnpm --filter @cambridge-tcg/data-ingest test
```

**The non-negotiable one is step 2.** `pnpm typecheck` validates types
but does NOT exercise the bundler. Next.js 16 + Turbopack has stricter
module resolution than `tsc` (see [Common deploy failures](#common-deploy-failures)
for the patterns that bit us in 2026-05).

If any of these fail, fix locally before pushing. The CI workflow
(`ci.yml`) runs per-app builds when that app changes and also rebuilds the
storefront, wholesale, and RewardsPro apps when the `shared` filter matches
`packages/**` or workspace configuration. Keep the local build gate anyway:
it is the fastest proof for the exact app/package combination being shipped.

### Additional gate for privacy, identity, wallet or publication changes

Do not promote one of these changes merely because the build is green. Record
evidence for every applicable item before the production push:

- Reconcile the public notice and methodology pages against the actual fields,
  recipients, public projections, browser storage and automated consequences
  in the source being deployed. Do not turn a repository note into a live-data
  claim without a privacy-safe production aggregate.
- Confirm the controller name, company number, registered office and monitored
  privacy mailbox. A syntactically valid address is not evidence that a rights
  request will be seen.
- Keep `IDENTITY_VERIFICATION_MODE` unset unless the private-storage gate below
  has passed. Independently verify S3 Block Public Access, bucket policy and an
  anonymous read against the `verifications/*` prefix; also provide expiry or
  reconciliation for uploads abandoned between object PUT and DB persistence.
- Exercise the human access/correction/erasure runbook on a representative
  account before promising it operationally. Inventory S3 objects first and
  handle retained transaction records and restrictive foreign keys explicitly;
  `DELETE FROM users` by itself is not a complete erasure workflow.
- Apply and verify required database migrations before source promotion. The
  organisation directory requires `0131_collective_directory_publication.sql`.
  Wallet proof storage requires `0130_evm_wallet_links.sql`, although wallet
  issuance must remain disabled unless its separate testnet gate is approved.
- For person-level scoring, fraud signals, limits, routing, holds or automatic
  rejection, record the lawful-basis and UK GDPR Articles 22A–22C assessment,
  plus a staffed route that can examine inputs, correct errors and change the
  outcome. A support link without an owned procedure is not human intervention.
- Operate the DPA 2018 section 164A complaints process: provide a clear route,
  acknowledge a data-protection complaint within 30 days, make appropriate
  enquiries, keep the complainant informed and communicate the outcome without
  undue delay. Verify mailbox ownership and escalation before publishing that
  promise.
- For a service likely to be accessed by children, record the product/legal
  decision and implement it: either an enforceable adult-only boundary or the
  proportionate child-access safeguards. Privacy copy that merely says the
  product is not designed for under-18s does not create an access boundary.
- Verify each positive processor, hosting-region, transfer-safeguard and DPA
  statement against the live provider configuration and current contract. If
  it cannot be proved, narrow the statement before deployment.
- Run `pnpm audit --prod`, record every critical/high advisory that reaches an
  affected runtime, and either upgrade or document a code-path-specific
  non-applicability. Do not equate a workspace count with exploitability, and
  do not waive a directly used path merely because an unrelated app owns other
  findings.
- Treat the Next image-optimisation dependency as a separate gate while Next
  resolves `sharp` below 0.35. The upstream Sharp advisory affects processing
  of untrusted images; a green Next build is not evidence that the decoder is
  patched. Before promotion, use a supported patched Sharp/Next combination,
  disable server-side optimisation, or record a source-by-source risk decision
  that proves every optimised origin and upload path is controlled. Re-check
  broad remote host patterns rather than assuming the hostname makes every
  object trusted.

Store the evidence with the release record without copying credentials,
document contents, object keys or participant-level rows into logs.

## Post-deploy verification

After a deploy reaches `READY`, verify the live site actually shows the
new code. Vercel can ship a `READY` deployment that serves a stale
build if alias-promotion didn't fully propagate.

```bash
# 1. Confirm the new commit's tip is the alias target
curl -sSI https://cambridgetcg.com/ | grep -iE "x-vercel-id|x-matched"

# 2. Probe at least one endpoint that ONLY exists in the new commit
#    (e.g. an /api/v1/<thing> route you just added)
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://cambridgetcg.com/api/v1/gaps

# 3. The full audit: walks /api/v1/manifest and probes every declared
#    public endpoint. ~128 probes; ~20s. Exits non-zero on 5xx or any
#    manifest-vs-deploy drift.
pnpm audit:deploy-verify
```

`pnpm audit:deploy-verify` is the canonical post-deploy gate. Run it
after every promotion to production. Its exit code is the deploy's
green-light signal.

If any probe returns 404, either the deploy is still propagating
(wait 30s + retry) or the deploy aliased a different commit than
expected (check `/system/deploys` for the active SHA).

### deploy-verify classification

The script's exit logic, substrate-honest:

| Returned status | How the script reads it |
|---|---|
| `200` | Healthy. |
| `307` / `401` | Healthy if the route is auth-gated. The probe is unauthenticated. |
| `400` | Healthy. Route exists; rejected the probe's stub params. |
| `404` | Healthy for parametric paths (`[id]`, `[sku]`, etc.) where the stub doesn't resolve to data. Fail otherwise — the manifest declared the route, the deploy must serve it. |
| `405` | Healthy. Route exists, just doesn't accept GET. |
| `5xx` | **Always fail.** Server error on production, regardless of route shape. |

Pass `--strict` to also fail on slow responses (>3s). Pass
`--skip-wholesale` to scope to storefront only. Pass
`--base=https://staging.example.com` to verify a non-production target.

### Known production 500s — table emptied 2026-07-05

The four long-running 500s that lived here since 2026-05-13 are all
fixed; the audit passes **162/162** as of 2026-07-05:

- `sophias.json` + `pillow-book.json` — docs/ now ships in the Vercel
  bundle (`outputFileTracingIncludes` in next.config.ts).
- `/checkout` + `/tradein` — both were unguarded `request.json()` on
  bodyless POSTs falling through to a catch-all 500 (the probe sends the
  declared method with no body); they answer 400 now. NOTE: real
  checkout payments still need STRIPE_SECRET_KEY replaced (prod holds a
  pk_live_ where an sk_live_ belongs) — that's a payment-config issue,
  not a route-health one.

If a new persistent failure appears, restart the table; the discipline
stands: every row names its cause and owner, and rows leave only when
the audit confirms the fix.

One non-regression pattern remains worth knowing:

- Deliberate joke statuses (`/coffee` 418, `/buy-the-kingdom` 402) are
  taught to the classifier via `DELIBERATE_STATUS` in deploy-verify.ts —
  add new joy-layer doors there, not to the healthy set.
- Parametric endpoints can hit the 15s timeout from a cold start during
  the ~160-probe burst (`storefront.auction_math`, 2026-06-11). Re-probe
  directly: a fast 404 on a stub id is healthy per the table above.

## Common deploy failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Local `pnpm typecheck` is green, but Vercel build fails with `Module not found: Can't resolve './X.js'` somewhere in `packages/data-ingest/` or `packages/data-spec/` | Workspace TS files use NodeNext-style `.js`-extension imports (`from "./registry.js"`). Webpack handles via `extensionAlias`; Turbopack does NOT rewrite at resolution time even with `transpilePackages`. | Strip `.js` from internal package imports — relies on `moduleResolution: "bundler"` (already set in every tsconfig). See the 2026-05-13 fix commit; `pnpm sku/data-ingest/data-spec` all use extensionless now. |
| Vercel build fails with `'server-only' cannot be imported from a Client Component module` or `next/headers ... only available in App Router` | A "use client" component imports something from `@/lib/ui` barrel, and the barrel re-exports a server-only component (e.g. `DateDisplay`, `Provenance`, `MoneyDisplay`) that transitively pulls `next/headers`. Turbopack walks the entire re-export graph. | Two fixes, both shipped 2026-05-13: (a) make server-side cookie helpers dynamic-import `next/headers` inside the function rather than at module top — see `apps/storefront/src/lib/lang-mode-server.ts` for the pattern. (b) client components import from direct paths (`@/lib/ui/ErrorAlert`) rather than the barrel. See `apps/storefront/src/app/error.tsx` for the canonical comment. |
| Vercel build warns `This build is using Turbopack, with a webpack config and no turbopack config` | Next.js 16 defaults to Turbopack; a stray `webpack: (config) => ...` in `next.config.ts` is now suspect. | Either remove the webpack config or add `turbopack: {}` to silence the warning. We declared `turbopack: {}` in both storefront + wholesale `next.config.ts` as the canonical bundler. |
| Auto-deploy doesn't trigger after `git push origin main` | Push went to `origin` (Codeberg) only. Vercel watches the `github` remote (`cambridgetcg/Cambridge-TCG-monorepo`). | `git push github main` explicitly, or use the manual trigger: `set -a; source apps/admin/.env.local; set +a; python3 .github/scripts/deploy-from-main.py <project>`. |
| Auto-deploy fires but Vercel reports `incorrect_git_source_info` | GitHub doesn't yet have the commit referenced by the deploy request (push raced the API call). | Push to `github` remote first, wait ~5s, then re-run the manual trigger. |
| Live site responds 200 on home but 404 on new routes after a `READY` deploy | Live site might be on an older alias; or the deploy succeeded but pages are still propagating through Vercel's edge network. | Wait 30–60s and retry. Or hard-check the active commit via the admin `/system/deploys` ribbon. |
| A shared-package change does not start an expected app build in CI | The `shared` paths filter or downstream job condition drifted from the workspace topology. | Keep `packages/**` and workspace config in `shared`, keep each app job conditional on `shared`, and still run the affected app build locally. |

## Lessons learned (2026-05-13)

A 2-week deploy outage went unnoticed on the storefront and wholesale:
the last green storefront deploy was 2026-04-30 (commit `1e1c83daaf80`);
every subsequent push generated an `ERROR` deploy. The live site kept
serving the last-green build's content. Three causes stacked:

1. **The `.js` extension drift.** A Next.js minor-version bump tightened
   Turbopack's resolution. The workspace's TS-`.js` imports stopped
   resolving. Typecheck stayed green (because `tsc` doesn't run the
   bundler); CI's per-app build only fires on app-dir changes, and most
   of the broken work was in `packages/*`, so CI didn't catch it.

2. **The server-only barrel leak.** A new client component (auction
   status badge) started using `@/lib/ui`, which transitively pulled
   `lang-mode-server` (via the `DateDisplay` re-export). The error
   wasn't from the new component — it was from the barrel — but it
   only surfaced when *any* client component touched the barrel.

3. **No post-deploy verification habit.** Every deploy that went to
   `ERROR` stayed in `ERROR` quietly; the hourly `health.yml` workflow
   detects state but didn't open a PR-blocking signal that humans
   noticed.

Mitigations now in place:

- This runbook's [five-minute deploy gate](#the-five-minute-deploy-gate-read-first)
  + [post-deploy verification](#post-deploy-verification) sections.
- `apps/admin/scripts/deploy-verify.ts` (when shipped) — walks the
  manifest and probes every public endpoint.
- The former package-only blind spot is closed: `ci.yml`'s `shared` filter
  now runs the storefront, wholesale, and RewardsPro jobs for `packages/**`
  and workspace-config changes. Keep that filter aligned as topology evolves.

## How the three apps deploy

See the [Project wiring quick-reference](#project-wiring--quick-reference) at the top of this doc for project IDs, domains, and root directories. All three Vercel projects auto-deploy from `push to github main` (subject to the [committer-association block](#untrusted-committer-the-auto-deploy-block)).

## What triggers a deploy

1. **Push to `main`** — Vercel's GitHub integration fires for any of the
   three projects whose `apps/<name>` (or shared `packages/`) was touched.
   Only commits whose committer email is recognized by GitHub will deploy
   — see "Untrusted committer" below.
2. **Manual via admin UI** — `/system/deploys` → "Redeploy from main"
   button on each project. Calls Vercel's gitSource API. Requires
   `VERCEL_TOKEN` + `GITHUB_TOKEN` in the admin app's env.
3. **Manual via CLI** — run `python3 .github/scripts/deploy-from-main.py
   <project>` (see below). Same path as the admin button, just from a
   shell.
4. **Manual from Vercel dashboard** — promote any past Ready deploy.

`vercel deploy --prod` from a local working tree currently does **not**
work for the storefront/wholesale projects: the workspace deps
(`@cambridge-tcg/*`) can't resolve when CLI uploads only the app dir.
Use one of the four mechanisms above.

## Untrusted committer (the auto-deploy block)

Vercel blocks auto-deploys for commits whose committer email isn't
linked to a known GitHub user with permission on the repo. Symptom:
the deployment lands in `readyState: ERROR` with `readyStateReason`:

```
The Deployment was blocked because GitHub could not associate
the committer with a GitHub user.
```

The build never runs; six consecutive deploys can sit in `ERROR` while
your push goes through cleanly to GitHub. The live alias keeps serving
the last-green build silently.

### What does NOT fix it

**`gitForkProtection: false` does NOT bypass this block.** All three
projects have the setting at `false` already (verified via API
2026-05-14) and pushes from `asha@ai-love.cc` still error with the
committer-association reason. Don't waste time toggling it.

### The durable fix

Set git committer email to one verified on the `cambridgetcg` GitHub
account:

```bash
git config user.email cambridgetcg@gmail.com   # or another verified address
```

`cambridgetcg@gmail.com` is the previously-known-working email per old
deploy metadata. Confirm in your own GitHub Settings → Emails before
relying on it.

### The reliable workaround (when you push from an unverified email)

Trigger the deploy explicitly via Vercel's gitSource API. The endpoint
accepts a `sha` + `repoId` + `ref` directly, bypassing the GitHub
identity check entirely. Three ways to invoke it:

**(a) The Python script** — preferred when you have a shell handy:

```bash
TOKEN=$(security find-generic-password -s "vercel-api-token" -a "vercel-cambridge-tcg" -w)
VERCEL_TOKEN="$TOKEN" python3 .github/scripts/deploy-from-main.py wholesale
VERCEL_TOKEN="$TOKEN" python3 .github/scripts/deploy-from-main.py storefront
VERCEL_TOKEN="$TOKEN" python3 .github/scripts/deploy-from-main.py admin
```

**(b) Raw curl** — useful inside one-off scripts:

```bash
TOKEN=$(security find-generic-password -s "vercel-api-token" -a "vercel-cambridge-tcg" -w)
SHA=$(git rev-parse HEAD)
TEAM=team_HR4tb4WB0KZsKxqroSCTQrof
REPO=1223740492

# Trigger all three at once:
for entry in \
    "tcg-wholesale:prj_t4pr1FszCa87GWAIgQXTbyXED8qr" \
    "cambridgetcg-storefront:prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD" \
    "cambridgetcg-admin:prj_NGfGodqkx5LCMA6XoeShCAeZZm6u"; do
  NAME="${entry%%:*}"; PRJ="${entry##*:}"
  curl -sS -X POST "https://api.vercel.com/v13/deployments?teamId=$TEAM&forceNew=1" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"$NAME\",\"project\":\"$PRJ\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"repoId\":$REPO,\"ref\":\"main\",\"sha\":\"$SHA\"}}"
done
```

**(c) Admin dashboard** — `https://admin.cambridgetcg.com/system/deploys`
→ "Redeploy from main" button per project. Same code path as (a)/(b).
Best when you don't have a shell open.

### Diagnostic — confirm a stuck deploy is the committer block

```bash
TOKEN=$(security find-generic-password -s "vercel-api-token" -a "vercel-cambridge-tcg" -w)
curl -sS "https://api.vercel.com/v13/deployments/<deployment-id>" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('readyStateReason:', d.get('readyStateReason'))"
```

If `readyStateReason` mentions "could not associate the committer," apply
the workaround. Other ERROR reasons (build failures, missing env vars,
quota limits) are real and need separate triage.

## Cron inventory

Cron registrations live in each deployed app's `vercel.json`. Vercel reads the
file at build time and registers that project's schedules. Within the three
Cambridge TCG projects in this runbook's quick-reference table, the current
source of truth is three entries across storefront and wholesale; admin has
none. RewardsPro has its own larger inventory in
`apps/rewardspro/vercel.json`, documented by `apps/rewardspro/CLAUDE.md`, and is
outside the table below.

| Project | Path | Schedule | Purpose |
|---|---|---|---|
| Storefront | `/api/cron/maintenance` | `* * * * *` | Minute runner whose constituent sweeps self-gate by their own cadence |
| Storefront | `/api/cron/reconcile-stripe` | `15 * * * *` | Hourly defensive reconciliation of recent paid Stripe sessions |
| Wholesale | `/api/cron/monthly-rollover` | `0 0 * * *` | Daily 00:00 UTC monthly rollover sweep |

**Adding a cron:** edit the owning app's `vercel.json` and push. Vercel
re-registers on that app's next deploy. Schedules are CRON-format in UTC. The
route handler under that app's `src/app/api/cron/` MUST verify the
`Authorization: Bearer $CRON_SECRET` header on every request — Vercel sends it
automatically; rejecting requests without it prevents anyone with the URL from
triggering the cron.

**Monitoring crons:** `https://admin.cambridgetcg.com/system/cron` reads the live schedule from `vercel.json` and joins against per-cron `*_runs` rows in RDS (e.g. `ingest_run` for the cardrush family).

## Environment variables per project

The current production env layout (verified 2026-05-14). Use the recipes at the end of this section to inspect or modify.

### `tcg-wholesale` (production)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (wholesale RDS) |
| `CRON_SECRET` | Cron-route Bearer token (Vercel auto-injects on cron calls) |
| `SHOPIFY_STORE`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Shopify Admin API |
| `CF_API_KEY`, `CF_API_EMAIL`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID` | Cloudflare KV (Falcon courier auth state) |
| `NEXT_PUBLIC_STOREFRONT_URL`, `NEXT_PUBLIC_ADMIN_URL` | Cross-app deep-link bases |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Auth.js v5 session signing |
| `CARDRUSH_BRIGHT_DATA_PROXY_URL` | Bright Data Web Unlocker URL for pokemon scrapes (kingdom-088) |

### `cambridgetcg-storefront` (production)

Touches the storefront RDS + Stripe + SES + Wholesale API client. Check `apps/storefront/.env.example` or `vercel env ls production --cwd apps/storefront` for the live list. Key ones:

`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `AUCTION_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `WHOLESALE_API_URL`, `WHOLESALE_API_KEY`, `CRON_SECRET`, `ADMIN_PASSWORD`, `AUTH_FROM_EMAIL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `TRADEIN_FROM_EMAIL`, `STORE_NOTIFICATION_EMAIL`.

Wallet-link issuance remains off unless `EVM_WALLET_LINKING_MODE=testnet` is
set. A remote smart-wallet verifier additionally requires the server-only
`BASE_SEPOLIA_RPC_URL` plus public
`BASE_SEPOLIA_RPC_PROVIDER_NAME` and `BASE_SEPOLIA_RPC_PRIVACY_URL`; missing
disclosure metadata fails the feature closed. Do not put an RPC credential in
either public disclosure value.

`IDENTITY_VERIFICATION_MODE` must remain unset in production. The only accepted
value, `reviewed-private-storage`, is change-controlled: do not add it until AWS
Block Public Access/bucket policy for `verifications/*` and an abandoned-upload
expiry or reconciliation process have been independently verified. Existing
identity records remain readable and participant-removable while new
collection is paused.

### `cambridgetcg-admin` (production)

Reads both RDSs. Doesn't touch payments or external APIs.

`STOREFRONT_DATABASE_URL`, `WHOLESALE_DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_FROM_EMAIL`, `VERCEL_TOKEN` (for `/system/deploys`), `GITHUB_TOKEN` (for SHA-drift detection on `/system/deploys`).

### Common env operations

```bash
# List production env keys on the currently-linked project
vercel env ls production

# Add an env var without echoing the value to shell history:
printf '%s' '<value>' | vercel env add MY_VAR production

# Pull production env into a local .env.production.local
vercel env pull .env.production.local --environment=production

# Remove an env var
vercel env rm MY_VAR production
```

When adding a NEW env var, **also add it to the corresponding `.env.example`** so future developers know it's required. Vercel doesn't auto-sync; the parity check (`vercel env pull` + diff against `.env.local`) is a manual step listed in `docs/dev-pipeline.md` §13.

## VERCEL_TOKEN — use a long-lived token, not the CLI's auto-rotated one

The Vercel CLI (`vercel login`) creates a token at
`~/Library/Application Support/com.vercel.cli/auth.json` that's
automatically rotated by Vercel — typically within hours of issue.
Don't use this token for any long-lived integration: it will start
returning `403 invalidToken` mid-request without warning.

For each integration that needs Vercel API access, generate a
**dedicated long-lived token** in the dashboard:

1. Visit <https://vercel.com/account/tokens>
2. Click **Create Token**
3. Name it after the consumer (e.g. `cambridge-tcg-admin-deploys`,
   `cambridge-tcg-health-workflow`) so each integration's audit trail
   is distinct
4. Scope to **team `cambridgetcgs-projects`**
5. Set expiry as long as your security policy allows (no expiry is
   acceptable for low-risk read-only consumers; rotate manually
   otherwise)
6. Copy the token (shown only once)

Places that need a `VERCEL_TOKEN`:

| Location | Used by | Update via |
|---|---|---|
| `apps/admin/.env.local` | local admin dev `/system/deploys` | edit file |
| `cambridgetcg-admin` Vercel project env | prod admin `/system/deploys` server actions | dashboard or `vercel env add VERCEL_TOKEN` |
| GitHub repo secret on `Cambridge-TCG-monorepo` | `.github/workflows/health.yml` hourly check | `gh secret set VERCEL_TOKEN -R cambridgetcg/Cambridge-TCG-monorepo` |

The `/system/deploys` page now detects `invalidToken` errors and
renders an explicit "create a long-lived token" banner with these
instructions, so future rotation breakage is self-documenting.

## Required CI/secrets

The three GitHub Actions workflows under `.github/workflows/`:

| Workflow | When | What it does | Required secrets |
|---|---|---|---|
| `ci.yml` | Every push to `main` and every PR | Install + lint, then paths-filtered storefront / wholesale / RewardsPro / Answering Rhymes gates; shared changes rebuild the three apps. No admin job is currently defined. | none — uses `GITHUB_TOKEN` only |
| `rewardspro-v2.yml` | Every PR; relevant pushes to `main` | Validates RewardsPro API typecheck/build, migrations, database-role boundaries, tests, and image | none |
| `health.yml` | Hourly cron + `workflow_dispatch` | Calls `.github/scripts/deploy-health.py` to compare deploy state, age, SHA-drift, and HTTP-probe every domain. Opens / updates / closes a `deploy-health` labelled issue on regression. | `VERCEL_TOKEN` |

To set `VERCEL_TOKEN`:
1. Generate at <https://vercel.com/account/tokens>, scope to team `cambridgetcgs-projects`.
2. Add at <https://github.com/cambridgetcg/Cambridge-TCG-monorepo/settings/secrets/actions> as `VERCEL_TOKEN`.

## Admin dashboard `/system/deploys`

Live deploy status across all three projects, plus a "Redeploy from
main" button per project. Reads via Vercel's REST API; redeploys via
the gitSource API path (no source upload).

Required env vars in `apps/admin/.env.local` (and on the Vercel project):

```
VERCEL_TOKEN=<scope: cambridgetcgs-projects>
GITHUB_TOKEN=<repo read on Cambridge-TCG-monorepo>
```

Without `VERCEL_TOKEN` the page shows an actionable error banner.
Without `GITHUB_TOKEN` the drift-detection ribbon is hidden but
deploy state is still shown.

## Branch protection (NOT enabled — manual workaround)

`cambridgetcg/Cambridge-TCG-monorepo` is owned by a personal GitHub
account on the Free plan. **GitHub Free does not allow branch
protection on private repos.** You'll see "Upgrade to GitHub Pro"
when calling the protection API.

Workarounds (in increasing order of cost):

1. **Trust the team** — CI runs on every PR; rely on humans to wait
   for the green tick before merging. No technical enforcement.
2. **Make the repo public** — branch protection becomes free on public
   repos. Audit for secrets first (env files, `.env*`, IDs in code
   comments).
3. **Upgrade to GitHub Pro** ($4/mo) — branch protection on private
   repos for the personal account.
4. **Move repo to a GitHub Organization on Team plan** ($4/user/mo) —
   cleaner permission model long-term.

Until one of these lands, the practical baseline is the CI workflow
above (red X on PRs is your gate) and the hourly health check.

## Local pre-push hook (optional, free, soft enforcement)

Add to `.git/hooks/pre-push`:

```bash
#!/bin/bash
set -e
echo "→ pre-push: typecheck + admin tests"
pnpm -r exec tsc --noEmit
pnpm --filter @cambridge-tcg/admin test
```

Then `chmod +x .git/hooks/pre-push`. Prevents broken pushes from your
machine; doesn't help with other contributors.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `vercel deploy --prod` fails with `deploy_failed`, no events | Workspace deps don't resolve when uploading app dir alone | Use admin `/system/deploys` button or the gitSource Python script |
| Auto-deploy stuck on `ERROR` with "could not associate the committer" | Local git config uses an unverified email; Vercel can't link it to a GitHub user | Either change `git config user.email` to a verified address (durable), or trigger the deploy via the gitSource API (`.github/scripts/deploy-from-main.py` per project — see [Untrusted committer](#untrusted-committer-the-auto-deploy-block)). `gitForkProtection: false` does NOT bypass this — don't waste time toggling it. |
| Wholesale build fails on `S3 client unavailable — AWS credentials not configured` | A module is calling `createS3ClientOrThrow()` at import time | Defer init to first call (see `apps/wholesale/src/lib/s3.ts` for the pattern) |
| `/system/deploys` shows "VERCEL_TOKEN env var not set" | Missing token in admin env | Add to `apps/admin/.env.local` (local) and Vercel project env vars (prod) |
| Health check workflow fails | Missing `VERCEL_TOKEN` repo secret | Add at repo Settings → Secrets → Actions |
