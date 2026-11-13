# RewardsPro Deployment Guide

## Marketing site (`rewardspro.io`)

The public marketing site is a separate Cloudflare Pages project named
`rewardspro-landing`. Its source now lives at `landing/public`; it is not built
from the Remix/Vercel application.

Preview locally from `apps/rewardspro/landing`:

```bash
wrangler pages dev public
```

Deploy only after an explicit production release decision:

```bash
wrangler pages deploy public \
  --project-name rewardspro-landing \
  --branch main \
  --skip-caching
```

`--skip-caching` is deliberate. A cached direct upload produced an empty
deployment on 23 July 2026; forcing the three public assets plus `_headers`
produced a byte-identical, healthy deployment.

Verify the immutable `*.pages.dev` URL before checking the custom domain. Then
verify `https://rewardspro.io`, `/privacy-policy`, `robots.txt`, `sitemap.xml`,
external links, responsive layout, and the visible integration status labels.
Cloudflare Pages retains earlier deployments for rollback.

### After a deploy that changes a page

The site has an IndexNow key. The file
`landing/public/24ab8c1a3858c2261d26321fedb5d88a.txt` holds only the key, with
no newline, and is served at
`https://rewardspro.io/24ab8c1a3858c2261d26321fedb5d88a.txt`. IndexNow passes
a notice to the search engines that take part in it. Google is not one of the
engines its FAQ lists.

The chief of staff's session sends the notice after the deploy, once, and
never before the owner's word to merge. First check that the key file answers
200 and prints only the key:

```bash
curl -sS https://rewardspro.io/24ab8c1a3858c2261d26321fedb5d88a.txt
```

Then send one POST. `urlList` holds the sitemap's pages that the deploy
changed; drop any page it didn't change. With all four:

```bash
curl -sS -i -X POST https://api.indexnow.org/indexnow \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data '{
    "host": "rewardspro.io",
    "key": "24ab8c1a3858c2261d26321fedb5d88a",
    "keyLocation": "https://rewardspro.io/24ab8c1a3858c2261d26321fedb5d88a.txt",
    "urlList": [
      "https://rewardspro.io/",
      "https://rewardspro.io/help/",
      "https://rewardspro.io/privacy-policy/",
      "https://rewardspro.io/subprocessors/"
    ]
  }'
```

The status codes IndexNow lists:

| Code | Meaning |
|---|---|
| 200 | OK: "URL submitted successfully" |
| 202 | Accepted: "URL received. IndexNow key validation pending." |
| 400 | Bad request: "Invalid format" |
| 403 | Forbidden: the key is not valid, for example the file is missing or doesn't hold the key |
| 422 | Unprocessable Entity: a URL doesn't belong to the host, or the key doesn't match the protocol's form |
| 429 | Too Many Requests: "Too Many Requests (potential Spam)" |

A 200 means only that the notice arrived, not that a page was crawled. Don't
send the same URL again without a real change to its page: IndexNow's FAQ
says "Avoid submitting the same URL many times a day unless there are
meaningful content changes." A deploy that changes no page, such as one that
touches only `_headers`, sends nothing. Sources: https://www.indexnow.org/documentation
and https://www.indexnow.org/faq, read on 13 November 2026.

## Embedded Shopify application

The app calls the Admin API at the version `app/shopify.server.ts` pins
(2026-10, accessible until 2027-10-16); a push to `main` changes it.
Webhooks are delivered at `[webhooks] api_version` in `shopify.app.toml`
(2026-01), which changes only when a new app version is released. 2026-01 is
accessible until 2027-01-16 15:00 UTC: re-pin it, check the subscribed
topics' payloads against their handlers, and release a new app version
before then. After that date Shopify moves the webhooks to the oldest version
it still supports, without anyone having tested it.

## Pre-Push Checklist

- [ ] `pnpm --filter rewardspro build` passes with no errors
- [ ] No `console.log` left in production code (use `console.error` for error logging)
- [ ] TypeScript compiles cleanly: `pnpm --filter rewardspro exec tsc --noEmit`
- [ ] All environment variables are set in Vercel dashboard
- [ ] Database migrations are applied before deploying (if schema changed; see below)

## Deployment Steps

### 1. Stage and Commit

```bash
git add <files>
git commit -m "feat/fix/chore: description of change"
```

### 2. Verify Build Locally

```bash
pnpm --filter rewardspro build
```

Fix any build errors before pushing.

### 3. Push to Deploy

```bash
git push origin main
```

This triggers Vercel auto-deploy for production.

### 4. Verify on Vercel

1. Open [Vercel Dashboard](https://vercel.com) and check the deployment status
2. Wait for the build to complete (typically 2-3 minutes)
3. Check the deployment logs for any runtime errors
4. Verify the preview URL works before promoting (if using preview branches)

### 5. Post-Deploy Verification

- [ ] App loads in Shopify admin (`/app`)
- [ ] Members page loads without errors
- [ ] Webhook endpoints respond (check Shopify webhook logs)
- [ ] Storefront widget renders for logged-in customers

## Crons

Vercel runs the 8 crons in `vercel.json` against the current production
deployment. They have been on since 2026-11-04 09:27 UTC; the project's Cron
Jobs setting in Vercel switches them all on or off.
`test/unit/routes/cron-schedule.test.ts` says why each cron route is
scheduled or not. Schedules are UTC.

| Cron (`/api/cron/...`) | When (UTC) | What it does |
| --- | --- | --- |
| `mission-status` | hourly at :00 | Starts the missions merchants scheduled and closes the ones that ended |
| `scheduled-campaigns` | hourly at :15 | Sends the email campaigns merchants scheduled, up to 10 a run, and holds back any more than 24 hours late (none go out while marketing email is off) |
| `cashback-reconciliation` | hourly at :30 | Checks cashback Shopify never confirmed against the shopper's store credit history (every shop), and retries automatic cashback Shopify didn't take (shops with automatic cashback on) |
| `tier-maintenance` | daily 01:00 | Ends memberships that ran out, sends the membership emails a merchant turned on, repairs tier mismatches |
| `tier-product-cleanup` | daily 03:30 | Permanently deletes membership products 30 days after a merchant deleted them, unless a shopper still holds a membership from one |
| `session-cleanup` | daily 06:00 | Deletes expired Shopify sessions |
| `tier-recalculation` | daily 09:00 | Recalculates tiers in each shop whose recalculation is due |
| `webhook-cleanup` | Sundays 05:00 | Deletes order webhook records after 30 days, webhook errors after 90, billing webhook records after 7, and expired data-request reports |

How Vercel runs them:

- Each run is a GET with `Authorization: Bearer $CRON_SECRET`, and every
  cron route answers 401 to anything else. `CRON_SECRET` must be set in the
  Production environment, or every run fails.
- Vercel doesn't retry a failed run and doesn't tell anyone. It doesn't stop
  two runs overlapping. Its delivery is best effort: now and then a run never
  arrives, and now and then the same run arrives twice. The jobs that must
  not overlap take a database lock (`CronLock`); the others are safe to
  repeat, and each run picks up what the one before left.
- A run is stopped after 300 seconds (the project's function limit; nothing
  sets `maxDuration`).
- Vercel shows a run as failed only when it answers 5xx. Every cron route
  answers 500 when its job fails. In `cashback-reconciliation` and
  `mission-status`, a run that finishes but fails part of its work (a shop,
  an entry, a mission) answers 200 and tells the cron monitor what failed,
  which reports it (below). `tier-maintenance`, `tier-recalculation` and
  `scheduled-campaigns` answer 500 for any such error instead.

To run one now, for real against production, exactly as the schedule would:

```bash
vercel crons run /api/cron/session-cleanup --project rewardspro-production --scope cambridgetcgs-projects
```

(or the Run button next to the job in the project's Cron Jobs settings).
Either way the run arrives from Vercel's cron service, like a scheduled one;
the log line's `onSchedule: false` tells it apart.

### When a cron fails or stops

Every scheduled run goes through `monitoredCron`
(`app/services/cron-monitor.server.ts`), which records it and reports what
went wrong. To see what happened:

1. **Sentry.** Every event below is tagged `cron.job:<job>`:
   - a failed run: an error with the real cause;
   - a run that finished with problems: a warning, "Cron `<job>` finished
     with problems", with how many failed and the first error;
   - a cron that stopped finishing its runs while the others still run (it
     times out, stops being called, or fails every time): a warning, "Cron
     `<job>` has not finished a run within twice its schedule", sent once per
     stop.
2. **`/api/operator/readiness`**, with `Authorization: Bearer $CRON_SECRET`,
   lists each cron's last start, success, partial run and failure, and
   answers 503 `crons_stale` when one hasn't finished a run within twice its
   schedule and 15 minutes (2 h 15 min for the hourly ones, 2 days and 15 min
   for the daily ones, 2 weeks and 15 min for webhook-cleanup), so one run
   Vercel didn't deliver isn't stale. A run that finished with problems
   counts as a run; Sentry reports its problems. Before any cron has run with
   this code, it reads `crons_stale`. An uptime check could poll it, but the
   check would then hold `CRON_SECRET`, which can also start every cron; the
   Sentry Crons monitor below notices a stop without it.
3. **Logs.** Each run ends with one `cron-monitor` line: the job, the HTTP
   status, how many parts failed, how long it took, `vercelCron: true` when
   Vercel's cron service sent it (the schedule, the Run button or
   `vercel crons run`), and `onSchedule: false` when it started more than 5
   minutes after its slot, which marks a run started by hand. Vercel keeps
   runtime logs only for a short time:

   ```bash
   vercel logs --project rewardspro-production --environment production --query /api/cron/tier-maintenance --since 24h
   ```

4. **The records.** `SyncStatus` rows with shop `rewardspro:cron`:
   `<job>:started`, `<job>:succeeded`, `<job>:partial` and `<job>:failed`,
   each with the start time of that run in `lastSyncAt`. The partial and
   failed rows hold what went wrong. `<job>:stale` holds when Sentry was told
   the job had stopped.

When every cron stops at once (the project's Cron Jobs switch is off,
`CRON_SECRET` is missing from Production, a deploy dropped them), nothing in
the app runs to notice. Sentry Crons does: it alerts when a monitor's
check-ins stop. `SENTRY_CRON_MONITORS` names the jobs that check in,
comma-separated, or `true` for all 8. Sentry includes one cron monitor per
plan and bills each further one ($0.78 a month) from the pay-as-you-go
budget, so set `SENTRY_CRON_MONITORS=mission-status` in Production and
redeploy: the hourly job then creates a `rewardspro-mission-status` monitor
on its first run, at no cost unless another project in the Sentry
organisation already uses the included monitor. Each monitor expects a
check-in within twice its cron's schedule and 15 minutes, as readiness
does.

A new scheduled cron goes in `vercel.json`, in `CRON_SCHEDULES` in
`app/services/cron-monitor.server.ts`, and through `monitoredCron`; the
tests check all three.

## Database Migrations

The database is Postgres on Supabase; [docs/DATABASE.md](./docs/DATABASE.md)
has the connection recipe, environment variables and deploy order.
Migrations are an explicit step, applied before the code that needs them is
deployed (the build never migrates):

```bash
# Create the migration against a local Postgres you own
pnpm --filter rewardspro exec prisma migrate dev --name describe_change

# Apply it to production (verified TLS via scripts/prisma-tls.ts)
DIRECT_URL='<session pooler URL>' pnpm --filter rewardspro migrate:deploy
```

## Rollback

### Quick Rollback (Vercel)

1. Open Vercel Dashboard > Deployments
2. Find the last known-good deployment
3. Click the three-dot menu > "Promote to Production"

### Git Rollback

```bash
# Revert the last commit
git revert HEAD
git push origin main

# Or reset to a specific commit (destructive — confirm first)
git log --oneline -10  # find the target commit
git revert <commit-hash>
git push origin main
```

## Environment Notes

| Environment | Database | Deploy Trigger |
|-------------|----------|----------------|
| Production  | Supabase Postgres (`DATABASE_URL` pooler 6543; `DIRECT_URL` 5432 for migrations) | Push to `main` (skipped when nothing under `apps/rewardspro` or the workspace install files changed: `scripts/vercel-ignore-build.sh`) |
| Preview     | None configured: without `DATABASE_URL` a preview fails at runtime. Give previews their own database, never production's. | Push to any branch / PR |
| Local       | Postgres 17 on loopback (no TLS) | `pnpm dev:rewardspro` |

Functions run in `lhr1` (London), next to the database (`vercel.json`). Node
24 everywhere: `engines`, `.nvmrc` and CI.

**Marketing email** (campaigns and automations) stays off until SendGrid's
signed event webhook is configured: set `SENDGRID_WEBHOOK_VERIFICATION_KEY`
to the public key from SendGrid's Event Webhook settings, so bounces, spam
reports and unsubscribes are recorded. Unsubscribe links are built from
`SHOPIFY_APP_URL` and signed with `ENCRYPTION_SECRET`
(`app/services/marketing-email.server.ts`); the link opens a confirmation
page, and mail clients' one-click unsubscribe acts at once. Transactional
email is not affected.

That key is the only server-side switch: once it is set, every shop's
campaigns and automations can send. Before setting it, know that marketing
email does not carry a sender postal address yet, which CAN-SPAM requires
for US recipients (the "Add physical address" setting is not applied), and
that SPF, DKIM and DMARC must be in place for the sending domain.

**Emails RewardsPro sends shoppers by itself** (welcome, tier changes,
membership reminders) need `SENDGRID_API_KEY` and are off for every shop
until its merchant turns each one on in Email settings
(`app/constants/shopper-emails.ts`). No server-side setting turns them on.
