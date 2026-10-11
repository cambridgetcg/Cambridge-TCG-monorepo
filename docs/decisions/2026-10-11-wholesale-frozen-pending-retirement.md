# Wholesale frozen at b4386471 pending retirement

**Status:** In force from 2026-10-11, assessed under the owner's delegation
below. It ends when the app is retired or a later decision record unfreezes it.

**Will trace:** Yu, 2026-10-11 — "wholesale你覺得有用就駁返啦 我原本係想retire嘅
Shopify partners logged in btw" ("reconnect wholesale if you think it's useful;
I originally wanted to retire it. Shopify Partners is logged in, by the way").
The commit that first added this record (`f737e477`) quoted only the first two
clauses.

## Decision

The owner left reconnection to judgement and named retirement as the original
intent. The assessed answer is not to reconnect. The Vercel project
`tcg-wholesale` (`wholesaletcgdirect.com`) stays on the build it serves today
until it is retired. Per the read-only check on 2026-10-11, that build is from
commit `b4386471` ("Retire wholesale order admission and purchase surfaces",
2026-09-23). That check's deployment uid, created time and source field were
not recorded here. Once this is on `main`, each health-check run prints the
newest `READY` production deployment's uid and sha (read from
`meta.githubCommitSha`) in its note or issue, so the first run is the record to
compare against.

Why, from the read-only investigation on 2026-10-11 (git facts rechecked
against `092c6822`):

- One `apps/wholesale` commit has landed since `b4386471`: `12bbb904`
  (2026-09-29), which tightens validation in
  `apps/wholesale/src/app/api/admin/channel-pricing/route.ts` and adds its
  test. It has no migration and no new env var. Production does not need it.
- A deploy of `main` would also ship changes to workspace packages wholesale
  depends on. Since `b4386471`, `12bbb904` changed `packages/pricing`,
  `packages/sku` and `packages/data-ingest`, and `bb9e7d4c` added a
  `data-ingest` test (10 files, +282/−43, tests included, across the six
  `@cambridge-tcg/*` packages in `apps/wholesale/package.json`, at
  `092c6822`). For example, `computePrice`, which
  `apps/wholesale/src/lib/channel-pricing.ts` calls, now throws `RangeError`
  on a non-positive JPY price or exchange rate, and its rounding code changed.
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
  `curl` loop in the [deploy runbook](../ops-deploy-runbook.md) with `main`'s
  head, or the "Redeploy from main" button for `tcg-wholesale` on the admin
  `/system/deploys` page.
  These tools still offer wholesale (`.github/scripts/deploy-from-main.py`,
  `apps/storefront/src/lib/admin/vercel.ts`). This decision did not remove it
  from them.
- **Redeploying the same build is allowed.** A credential rotation was planned
  for 2026-10-11. No record of it is kept in this repository, so whether it
  happened, and whether it covered `tcg-wholesale`'s own environment, is not
  stated here. Redeploying with rotated environment variables from the same
  `b4386471` source stays within the freeze, even though the new deploy has a
  fresh timestamp. Two routes keep the source:
  - a Vercel dashboard **Redeploy** of the current production deployment,
    which builds that deployment's source again with the project's current
    environment;
  - the gitSource call in the
    [deploy runbook](../ops-deploy-runbook.md#the-reliable-workaround-when-you-push-from-an-unverified-email)
    sent to `tcg-wholesale` (`prj_t4pr1FszCa87GWAIgQXTbyXED8qr`) with the full
    sha `b43864719e70bd4ae4098154f05cd62bf7a808ce` in place of
    `$(git rev-parse HEAD)`.

  Neither route has been tried on this project since the freeze, and it has no
  Git link, so either may be refused. Whether either keeps
  `meta.githubCommitSha` is unverified. If the sha is lost, the health check
  reports it as unknown (a note), not as a promotion.
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
  `WHOLESALE_B2B_API_KEY` for the wholesale channel. 48 non-test files under
  `apps/storefront/src` import it (47 besides `db-source.ts`, its database
  fallback), counted at `092c6822` with `git grep` for the alias import
  (`@/lib/wholesale/client`) and the relative ones (`./wholesale/client` in
  `catalog-sitemap.ts`, `./client` in `db-source.ts`). By function:
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
  - A comment in that file (lines 23–32, the claim at 25–26; the file last
    changed 2026-09-08) says the wholesale domain 301s and the API times
    out. The middleware at `b4386471` (`apps/wholesale/src/middleware.ts`,
    unchanged since) keeps `/api/v1`, `/api/webhooks`, `/api/cron` and
    `/api/auth` live on `wholesaletcgdirect.com` and 301s other paths to
    `cambridgetcg.com`.
    Which is true in production today is **unverified**.
- **Wholesale's own cron:** `/api/cron/monthly-rollover`, daily at 00:00 UTC
  (`apps/wholesale/vercel.json`, unchanged since `b4386471`). It recalculates
  each client's rolling 30-day spend, the basis of the retired volume
  discount. It runs for as long as the project is deployed.
- **Inbound integrations, unverified:** the Shopify `orders/paid` route
  (`apps/wholesale/src/app/api/webhooks/shopify/orders-paid/`) exists in
  source. Whether Shopify still sends to it has not been checked, and neither
  has whether any partner still calls `/api/v1` on this domain. The owner
  reported on 2026-10-11 that Shopify Partners was logged in (see the will
  trace). That access was not used for this record, so Shopify delivery is
  still unverified; it is a place to check it.
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
- Storefront scripts under `apps/storefront/scripts/` that read
  `WHOLESALE_DATABASE_URL` (17 files at `092c6822`: audits, seed and restock
  scripts, the merge scripts and `apply-b2b-consolidation.ts`). When it is
  unset, the audits skip (`tributaries.ts` tries `DATABASE_URL` first);
  `seed-classifications-from-cards.ts` and `seed-rarity-map.ts` exit;
  `generate-wholesale-merge-sql.ts`, `verify-wholesale-merge.ts` and
  `apply-b2b-consolidation.ts` fall back to `DATABASE_URL`, then exit;
  `seed-dev-catalog.mjs` and `restock-card-sets.mjs` fall back to a local dev
  database.

For any rotation: the frozen app's own `DATABASE_URL` and the
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

- Deploy age (over 336h) and app drift are not checked for the frozen build.
  The report prints a note instead under Notes. It names the frozen sha, the
  date and this file's path, says age and drift were not checked, and says
  whether the newest `READY` deploy matches the frozen sha.
- A latest production deploy still `QUEUED`, `INITIALIZING` or `BUILDING` more
  than 336h after it was created is an issue: a stuck redeploy leaves the
  previous build, with its previous credentials, serving.
- A latest production deploy that is `ERROR`, `BLOCKED`, `CANCELED` or in an
  unrecognised state is still an issue, and so is a failed domain probe
  (connect error or 5xx). The probe requests `/`, which the middleware 301s to
  the storefront (see above), so it does not show that wholesale's `/api/v1`
  or its cron work.
- The newest `READY` production deploy is checked against the frozen sha. A
  different sha is an issue (an unexpected promotion). An unknown sha (lookup
  failed, no `READY` deploy, no git metadata) is a note, not an issue. A
  same-sha redeploy passes. Notes neither fail the run nor open an issue, so
  a different build deployed without git metadata would show only in the job
  log.
- As for every project, the script reads the newest `READY` deploy, not the
  production alias. After an Instant Rollback the two can differ.

Tests: the `FrozenCheck` and `FrozenWiring` classes in
`.github/scripts/test_deploy_health.py`.
