# Deploying RewardsPro

Four things go live separately.

| What | How it goes live |
|---|---|
| The app's server (this folder) | A merge to `main`: Vercel project `rewardspro-production` builds it and puts it live at once. |
| The database's schema | By the owner's hand, before the merge: [docs/DATABASE.md](docs/DATABASE.md). |
| Shopify's side: `shopify.app.toml` (scopes, webhooks, the app proxy) and `extensions/` (the widget) | `shopify app deploy --no-release`, then `shopify app release`, on the owner's word for each: [docs/switch.md](docs/switch.md), B3. |
| rewardspro.io | By hand: [apps/rewardspro/DEPLOY.md](../rewardspro/DEPLOY.md). |

## The server

- `vercel.json` holds the region (`lhr1`), the build command and the crons. The project's own settings (Root Directory `apps/rewards`, React Router, Node 24.x, no Output Directory override) are in docs/switch.md, B2 step 3.
- Before a merge, CI's `rewards` job runs the typecheck, unit tests, migrations, drift check, Postgres tests and build. It counts towards `CI status`, the one check `main` requires. Use Node 24 locally too.
- `scripts/vercel-ignore-build.sh` skips a commit that changes neither this folder nor the root install files; its header says how. A redeploy of the live commit is skipped too, so a corrected variable needs a new commit that touches this folder.
- The build refuses a commit whose migrations production lacks: docs/switch.md, [A pull request with a migration](docs/switch.md#a-pull-request-with-a-migration).
- Previews have no database and no Shopify secret (both are Production only), so a preview shows only that the commit builds.
- After a deploy, `GET https://rewardspro-production.vercel.app/api/health` answers `200 {"status":"ok","database":"ready"}`, or 503 when the database doesn't answer (`app/routes/api.health.tsx` says what it reads). `health.yml` asks hourly, and raises a `deploy-health` issue on a failure, a failed build or a commit that never went live.
- The names of the variables the app reads: docs/switch.md, spec 9.2 checklist, row 6a.

### Going back

- Revert the change on `main`. It goes live like any other merge.
- Or use Vercel's Instant Rollback to an earlier deployment of this app. Until it is undone, Vercel puts no new deployment live.
- Never go back to a deployment from before 2026-11-06, the previous version: docs/switch.md, Rollback, says why.
- Neither undoes a migration. Migrations here are additive, and their headers say why an older build still runs.

## Shopify's API version

The app calls the Admin API at 2026-10 (`app/shopify.server.ts`), and Shopify delivers its webhooks at 2026-10 (`shopify.app.toml`). A merge changes the first; the second changes only with a new app version. 2026-10 is accessible until 2027-10-16 (recorded on 2026-11-03). Move both before then: after that date Shopify uses the oldest version it still supports, without anyone having tested it.

## Crons

`vercel.json` schedules three, in UTC: `payouts` (hourly, at :30), `tiers` (02:00) and `housekeeping` (03:00). Each route's header says what it does. The project's Cron Jobs setting in Vercel switches them all on or off. A new one goes in `vercel.json`, in `CRON_SCHEDULES` (`app/lib/cron.server.ts`) and through `monitoredCron`; `test/unit/routes/cron-schedule.test.ts` checks them against each other.

How Vercel runs them:

- Each run is a GET with `Authorization: Bearer $CRON_SECRET`, and every cron route answers 401 to anything else. Without `CRON_SECRET` in Production, every run fails.
- Vercel doesn't retry a failed run and tells no one. It doesn't stop two runs overlapping. Delivery is best effort: now and then a run never arrives, and now and then one arrives twice. So each job takes a database lock (`cron_lock`) and picks up what the run before left.
- A run is stopped after 300 seconds (`maxDuration` in each route; each job's own budget is 240).
- Vercel shows a run as failed only when it answers 5xx. `tiers` answers 500 when a buyer or a store's pass failed or is overdue. `payouts` and `housekeeping` answer 200 after a run that failed in part, and record it as partial.

To run one now, for real, against production:

```sh
vercel crons run /api/cron/housekeeping --project rewardspro-production --scope cambridgetcgs-projects
```

or use the Run button beside the job in the Cron Jobs settings. Its log line reads `onSchedule: false`, unless it starts within 5 minutes of the job's slot.

When one fails or stops:

1. **Sentry.** Every event carries the tag `cron.job:<job>`. The header of `app/lib/cron.server.ts` lists what is sent: a failed run, a run with problems, a run Vercel stopped, a job that stopped finishing its runs.
2. **The `cron_run` table.** One row per job and outcome, with the run's start and its error.
3. **The log.** Each run ends with one `cron-monitor` line. Vercel keeps it for a day:

   ```sh
   vercel logs --project rewardspro-production --environment production --query /api/cron/payouts --since 24h
   ```

When all three stop at once, nothing in the app runs to notice. Sentry Crons would: `REWARDS_SENTRY_CRON_MONITORS` names the jobs that check in (`true` for all). Whether it is set is in docs/switch.md, "Where each row stands", row 4.
