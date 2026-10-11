# Wholesale frozen at b4386471 pending retirement

**Status:** In force from 2026-10-11, assessed under the owner's delegation
below. It ends when the app is retired or a later decision record unfreezes it.

**Will trace:** Yu, 2026-10-11 — "wholesale你覺得有用就駁返啦 我原本係想retire嘅"
("reconnect wholesale if you think it's useful; I originally wanted to retire it").

## Decision

The owner left reconnection to judgement and named retirement as the original
intent. The assessed answer is not to reconnect. The Vercel project
`tcg-wholesale` (`wholesaletcgdirect.com`) stays on the build it serves today
until it is retired. Per the read-only check on 2026-10-11, that build is from
commit `b4386471` ("Retire wholesale order admission and purchase surfaces",
2026-09-23).

Why, from the read-only investigation on 2026-10-11 (git facts rechecked
against `092c6822`):

- One `apps/wholesale` commit has landed since `b4386471`: `12bbb904`
  (2026-09-29), which tightens validation in
  `apps/wholesale/src/app/api/admin/channel-pricing/route.ts` and adds its
  test. It has no migration and no new env var. Production does not need it.
- A Git link would turn pushes to `main` into production deploys of an app
  that is being retired: new deploy risk for no product gain.
- Retirement is already planned in
  [the retirement runbook](../wholesale-app-retirement-runbook.md). Reconnecting
  would grow the surface that plan removes.

## What "frozen" means

- **No Git link, on purpose.** The project stays unlinked and a GitHub push
  does not deploy it. Do not link it to "fix" the gap.
- **No promotion of `main`.** Do not run
  `python3 .github/scripts/deploy-from-main.py wholesale`, the gitSource
  `curl` loop in the [deploy runbook](../ops-deploy-runbook.md), or the
  "Redeploy from main" button for `tcg-wholesale` on the admin
  `/system/deploys` page.
  These tools still offer wholesale (`.github/scripts/deploy-from-main.py`,
  `apps/storefront/src/lib/admin/vercel.ts`). This decision did not remove it
  from them.
- **Redeploying the same build is allowed.** Secrets are being rotated on
  2026-10-11. Redeploying the current production deployment with the new
  environment (same `b4386471` source) stays within the freeze, even though
  the new deploy has a fresh timestamp. Unverified: whether a dashboard
  redeploy keeps `meta.githubCommitSha`. If it does not, the health check
  reports the sha as unknown (a note), not as a promotion.
- **Any change to the code being served is an unfreeze.** That includes a
  security fix, and it needs its own decision (see below).
- **`apps/wholesale` on `main` is not what production runs.** CI still builds
  it when it changes. Read production behaviour from `b4386471`
  (`git show b4386471:apps/wholesale/...`).

## What still depends on wholesale

The running app and the wholesale database are separate dependencies.
Retiring the app does not retire the database.

### The running app (`wholesaletcgdirect.com`)

- **Storefront's API client**, `apps/storefront/src/lib/wholesale/client.ts`.
  It calls `${WHOLESALE_API_URL}/api/v1/*` (default
  `https://wholesaletcgdirect.com`) with `WHOLESALE_API_KEY`, or
  `WHOLESALE_B2B_API_KEY` for the wholesale channel. 46 non-test storefront
  files import it, counted with `git grep` at `092c6822`. By function:
  - HTTP first, falling back to the wholesale database through
    `apps/storefront/src/lib/wholesale/db-source.ts` when HTTP fails
    (`WHOLESALE_DB_DIRECT=1` skips HTTP): `fetchPrices`, `fetchCard`,
    `fetchGamesDetailed`/`fetchGames`, `fetchSetsDetailed`/`fetchSets`.
  - HTTP only, with no fallback: `fetchSourceLastRuns` and
    `fetchSourceRunHistory` (used by `apps/storefront/src/app/api/v1/sources/`),
    `fetchPriceSources` (used by
    `apps/storefront/src/app/api/v1/cards/[sku]/everything/route.ts`), and
    `reportSale`, a `POST /api/v1/sales` from the legacy retail branch of
    `apps/storefront/src/app/api/webhooks/stripe/route.ts`.
    `fetchCardFresh` and `fetchQuarantine` are HTTP only but have no non-test
    callers.
  - Database only or stubbed (no app dependency): `fetchAggregatorCoverage`,
    `fetchAggregatorCoverageHistory`, `fetchCardrushHistory`,
    `fetchTcgplayerHistory`, `fetchTcgplayerResolve`, `fetchMovers`.
  - A comment in that file (lines 23–31; the file last changed 2026-09-08)
    says the wholesale domain 301s and the API times out. The middleware at
    `b4386471` (`apps/wholesale/src/middleware.ts`, unchanged since) keeps
    `/api/v1`, `/api/webhooks`, `/api/cron` and `/api/auth` live on
    `wholesaletcgdirect.com` and 301s other paths to `cambridgetcg.com`.
    Which is true in production today is **unverified**.
- **Wholesale's own cron:** `/api/cron/monthly-rollover`, daily at 00:00 UTC
  (`apps/wholesale/vercel.json`, unchanged since `b4386471`). It recalculates
  each client's rolling 30-day spend, the basis of the retired volume
  discount. It runs for as long as the project is deployed.
- **Inbound integrations, unverified:** the Shopify `orders/paid` route
  (`apps/wholesale/src/app/api/webhooks/shopify/orders-paid/`) exists in
  source. Whether Shopify still sends to it has not been checked, and neither
  has whether any partner still calls `/api/v1` on this domain.
- **Checks that probe it:** `apps/storefront/scripts/deploy-verify.ts`
  (`WHOLESALE_BASE`, skip with `--skip-wholesale`) and
  `.github/scripts/deploy-health.py`. The health probe requests `/`, which
  the middleware 301s to `cambridgetcg.com`. `urllib` follows the redirect,
  so a 2xx result says little about wholesale's `/api/v1`.

### The wholesale database

These read the database directly and stay in use until the database merge
([Phase 6 runbook](../wholesale-db-merge-runbook.md), still marked DRAFT; its
migration is `apps/storefront/drizzle/drafts/0102_wholesale_db_merge.sql.draft`):

- `apps/storefront/src/lib/wholesale/db-source.ts`: `WHOLESALE_DATABASE_URL`
  for structural catalog reads and `WHOLESALE_COVERAGE_DATABASE_URL` for
  coverage scans.
- `apps/storefront/src/lib/admin/db.ts` (`WHOLESALE_DATABASE_URL`),
  `apps/storefront/src/lib/swaps/catalog.ts` (through that admin connection)
  and `apps/storefront/src/lib/stock/reservations.ts`
  (`WHOLESALE_DATABASE_URL`, else `DATABASE_URL`).
- Storefront audit, seed and merge scripts under `apps/storefront/scripts/`
  that read `WHOLESALE_DATABASE_URL`. The audits skip when it is unset; the
  seed and merge scripts exit.

For today's rotation: the frozen app's own `DATABASE_URL` and the
storefront's `WHOLESALE_DATABASE_URL` and `WHOLESALE_COVERAGE_DATABASE_URL`
all point at the wholesale database. If they share a database user (not
verified), rotating it means updating both projects.

## Unfreezing or retiring

**Unfreezing** (serving newer code, or linking Git) needs a new decision
record from the owner. Before deploying: compare `b4386471..<target>` for
`apps/wholesale` and the workspace packages it uses, run
`pnpm --filter tcg-wholesale build` locally, deploy the exact sha, then update
or remove the `frozen` entry in `.github/scripts/deploy-health.py`. Note that
`deploy-from-main.py` deploys whatever `main` points to, not a chosen sha.

**Retiring** follows the
[retirement runbook](../wholesale-app-retirement-runbook.md) (2026-05-15). It
has not been executed, and it waits on the Phase 6 database merge, which is
still a draft. Parts of it are older than the code, so re-inventory before
executing it. Its Step 4 lists eight cron schedules, but
`apps/wholesale/vercel.json` lists only `monthly-rollover`, both at `b4386471`
and now. Its Step 1 cron file list also differs from
`apps/wholesale/src/app/api/cron/` today. Beyond the runbook, retirement
also needs:

- a database path or removal for the HTTP-only storefront calls listed above;
- confirmation that no Shopify or partner traffic reaches
  `wholesaletcgdirect.com` (unverified today);
- a decision on `monthly-rollover`, which maintains a retired discount basis;
- removal of `tcg-wholesale` from `.github/scripts/deploy-health.py`,
  `.github/scripts/deploy-from-main.py` and
  `apps/storefront/src/lib/admin/vercel.ts`, and from the
  [deploy runbook](../ops-deploy-runbook.md).

## Health check

`.github/scripts/deploy-health.py` gives `tcg-wholesale` a frozen baseline:
`sha b4386471`, `since 2026-10-11`, pointing at this record.

- Deploy age (over 336h) and app drift are not checked. The report prints a
  note instead: "frozen at b4386471 since 2026-10-11 (see this file)".
- A latest production deploy that is `ERROR`, `BLOCKED`, `CANCELED` or in an
  unrecognised state is still an issue, and so is a failed domain probe.
- The newest `READY` production deploy is checked against the frozen sha. A
  different sha is an issue (an unexpected promotion). An unknown sha (lookup
  failed, no `READY` deploy, no git metadata) is a note, not an issue. A
  same-sha redeploy passes.
- As for every project, the script reads the newest `READY` deploy, not the
  production alias. After an Instant Rollback the two can differ.

Tests: the `FrozenCheck` and `FrozenWiring` classes in
`.github/scripts/test_deploy_health.py`.
