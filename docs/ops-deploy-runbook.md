# Deploy & infrastructure runbook

## How the three apps deploy

| App | Vercel project | Domain | Repo path |
|---|---|---|---|
| Admin | `cambridgetcg-admin` (`prj_NGfGodqkx5LCMA6XoeShCAeZZm6u`) | `admin.cambridgetcg.com` | `apps/admin` |
| Storefront | `cambridgetcg-storefront` (`prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD`) | `cambridgetcg.com` | `apps/storefront` |
| Wholesale | `tcg-wholesale` (`prj_t4pr1FszCa87GWAIgQXTbyXED8qr`) | `wholesaletcgdirect.com` | `apps/wholesale` |

All three live in the `cambridgetcgs-projects` Vercel team and are linked
to `cambridgetcg/Cambridge-TCG-monorepo` (production branch: `main`,
root directory: `apps/<name>`, build: `pnpm --filter <pkg> build`).

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

## Untrusted committer

Vercel blocks auto-deploys for commits whose committer email isn't
linked to a known GitHub user with permission on the repo. Symptoms:
deploy state is `ERROR` and `errorMessage` reads
`The Deployment was blocked because GitHub could not associate the
committer with a GitHub user.`

The fix is to set the committer email in your local git config to one
that is verified on the `cambridgetcg` GitHub account:

```bash
git config user.email cambridgetcg@gmail.com   # or whatever's verified
```

As a temporary measure, the three projects have `gitForkProtection:
false` set via the Vercel API, which loosens the check. Re-enable once
all committer emails on the team are verified.

## Required CI/secrets

The two GitHub Actions workflows under `.github/workflows/`:

| Workflow | When | What it does | Required secrets |
|---|---|---|---|
| `ci.yml` | Every push to `main` and every PR | Per-app typecheck + build (and admin tests) only on apps that changed (via `dorny/paths-filter`) | none — uses `GITHUB_TOKEN` only |
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
| Auto-deploy stuck on `ERROR` with "could not associate the committer" | Local git config uses an unverified email | Set `git config user.email` to a GitHub-verified one, or temporarily set `gitForkProtection: false` via API |
| Wholesale build fails on `S3 client unavailable — AWS credentials not configured` | A module is calling `createS3ClientOrThrow()` at import time | Defer init to first call (see `apps/wholesale/src/lib/s3.ts` for the pattern) |
| `/system/deploys` shows "VERCEL_TOKEN env var not set" | Missing token in admin env | Add to `apps/admin/.env.local` (local) and Vercel project env vars (prod) |
| Health check workflow fails | Missing `VERCEL_TOKEN` repo secret | Add at repo Settings → Secrets → Actions |
