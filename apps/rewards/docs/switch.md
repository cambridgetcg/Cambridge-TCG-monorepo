# Switching production to apps/rewards (plan Part B)

This is the runbook the switch follows (Ruling 87). The plan's Part B (B1 to B5) was written before the build's rulings changed parts of it. Where the two differ, this file is the one to follow; the plan file stays as written. It is built from Part B as amended by OPERATIONS-10 and Rulings 47, 62, 72, 75, 83 and 85, the final review's spec 9.2 checklist and switch plan (`final-review-readiness.md`), and the open list in [staging-run.md](staging-run.md).

**Every step waits for Yu's yes at the time.** Each step says who does it:

- **Yu:** Yu does it himself. That covers passwords, sign-ins, the Supabase SQL editor, Vercel settings and values, the Partner Dashboard and anything that costs money.
- **Ai on Yu's yes:** Ai runs it after Yu says yes in chat, then reports what it saw before asking for the next step.

Ai never types a password or a sign-in code, and never prints a secret value. This file holds no secret values, only placeholders.

## Connection strings

The database is the Supabase project `rewardspro-prod` (London, eu-west-2), the one in `apps/rewardspro/docs/DATABASE.md`. The tables live in schema `rewards`, owned by role `rewards_app`.

| Name | Used by | Points at | Where it lives |
|---|---|---|---|
| `REWARDS_DIRECT_URL` | migrations (`migrate:deploy`, `migrate:drift`) | Supavisor **session** pooler, port 5432 | Yu's own shell, for B2 step 1 only. Never in Vercel. |
| `REWARDS_DATABASE_URL` | the app at runtime | Supavisor **transaction** pooler, port 6543 | Vercel, Production only, typed sensitive. |

```
REWARDS_DIRECT_URL=postgresql://rewards_app.<ref>:<pw>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?schema=rewards
REWARDS_DATABASE_URL=postgresql://rewards_app.<ref>:<pw>@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?schema=rewards&connection_limit=3
```

- `<ref>` is the Supabase project ref of `rewardspro-prod`.
- `<pw>` is the `rewards_app` password Yu chooses in B2 step 1, URL-encoded (a hex password from `openssl rand -hex 24` needs no encoding). Only Yu holds it. It is never committed or written to a file. (It is written `<pw>`, not `<password>`, because this device's commit hook reads any longer placeholder in a URL as a real password.)
- `schema=rewards` is required on both. The migrations create their tables in the schema the URL names. The dashboard's ready-made `postgres` connection string has no `?schema=`, so it would put every table in `public`, which Supabase's Data API serves to the project's anon key. `scripts/prisma-tls.ts` refuses a remote URL unless its schema is `rewards` and its user is `rewards_app` or `rewards_app.<ref>`, and prints the session-pooler shape expected (READINESS-1).
- `connection_limit=3` is the app's pool size per instance (Fluid compute). The transaction pooler shares the database's connections between instances.
- `pgbouncer=true` does not go on `REWARDS_DIRECT_URL`: Prisma's migration engine needs a session, and `prisma-tls.ts` refuses it.
- TLS is set in code and verified against the bundled Supabase root CA; `sslmode` is ignored.

## Before the sitting

| # | What | Who |
|---|---|---|
| 1 | Merge the F1 fixes (the widget on real themes, the renewal lease, the migration guard, this runbook) with the last rebuild PR. | Ai on Yu's yes |
| 2 | **Previews:** split `SHOPIFY_API_SECRET` by environment. Production gets the released app's secret, typed sensitive. Preview and Development get the staging app's secret, or nothing. Keep Vercel Authentication on previews. | Yu |
| 3 | **Encryption key:** confirm `ENCRYPTION_SECRET` and `ENCRYPTION_SALT` (each `openssl rand -hex 32`) are set in Production and typed sensitive. Never rotate them without a re-encryption step: every stored token would read as missing, and every store goes dark until its merchant opens the app. | Yu |
| 4 | **Sentry:** confirm `SENTRY_DSN` is set and a Sentry alert rule emails Yu for new production issues. Decide on Sentry Crons (Ruling 47): set `REWARDS_SENTRY_CRON_MONITORS=true` in Production (Sentry billing), or accept in chat that a total stop of every cron is silent. | Yu |
| 5 | **Orphaned env names:** delete the 15 names neither app reads (22 entries) and the 2 repo Actions secrets no workflow reads, as listed in the final review's spec 9.2 row 6c. Keep the old app's own names until B5: rollback needs them. | Yu, or Ai on Yu's yes |
| 6 | **Vercel request logs:** accept that they hold, for their retention (1 day on Pro), the proxy's signed buyer id, shop and signature, the admin's 1-minute `id_token`, and the Customers search text (`/app/customers?q=`, `/app/customers/export?q=`). Or set a log-drain filter. No drain is configured today. | Yu |
| 7 | **Merge gate:** add a ruleset requiring the `CI status` check on main. B2 step 4 pushes to main, so either add the rule after step 4, or make step 4 a PR. | Yu |
| 8 | **deploy-health:** decide whether to re-enable `health.yml` (disabled by hand since 2026-10-22; Ruling 50). It already probes `/api/health` on `rewardspro-production`, and since F1 it no longer raises an age alarm on a quiet project that skips builds. | Yu |
| 9 | **Point-in-time recovery** and one rehearsed restore of schema `rewards` into a scratch project. Needed before the first real merchant, not for the dev-store switch. About $100 a month with Small compute. | Yu |
| 10 | **Hand-over notes** to read once: Gate F reads as Decision 19 says (a short take-back is information, with no needs-a-look); rule 6's known bend (an order whose orders/paid failed every retry is judged when the sweep records it); Ruling 12 (a money-only refund on a tax-exclusive shop takes back a few percent too much); Ruling 38 (erasure closes an unconfirmed credit as never given); Ruling 72 (Help has no docs link until docs.rewardspro.io describes this app; it keeps contact@rewardspro.io). | Yu reads |

### Where each row stands (2026-11-06)

Yu answered the calls in chat on 2026-11-06. Ai read the Vercel and GitHub results back by name, never by value.

- **Row 1:** done. The F1 fixes merged with #146.
- **Row 2:** `SHOPIFY_API_SECRET` is Production only (read back: one entry, Production). It is still typed `encrypted`, not `sensitive`, and Vercel can't change an existing variable's type, so B2 step 2 deletes it and adds it again as sensitive.
- **Row 3:** OK. `ENCRYPTION_SECRET` and `ENCRYPTION_SALT` are set in Production, typed sensitive.
- **Row 4:** `SENTRY_DSN` is set. The Sentry alert "RewardsPro production: new, escalating or regressed issues" emails Yu. Sentry Crons wait until a real merchant arrives: until then a total stop of every cron is silent (accepted), and `REWARDS_SENTRY_CRON_MONITORS` stays unset at B2 step 2.
- **Row 5:** done by Yu: the 15 orphaned names and the 2 repo Actions secrets are gone (read back: `VERCEL_TOKEN` is the only Actions secret).
- **Row 6:** accepted. No log drain.
- **Row 7:** yes, added right after B2 step 4 (Yu).
- **Row 8:** yes. Yu re-enabled `health.yml` on 2026-11-06.
- **Row 9:** later, before the first real merchant.
- **Row 10:** for Yu to read.
- **Data requests (B4):** accepted for now: they show only inside the app. An email to the shop owner comes when a real merchant arrives.

## B1: the production toml and the old-app guard (a PR, deploys nothing)

As the plan says, plus two changes:

1. **Ai on Yu's yes:** write `apps/rewards/shopify.app.toml` and its test (`test/unit/config/production-toml.test.ts`) with the identity values from the plan's Global Constraints. The subscriptions are `orders/paid`, `refunds/create` (uri `/webhooks/orders/refunded`), `orders/cancelled`, `app/uninstalled`, `app/scopes_update` and compliance (`/webhooks/compliance`), on `api_version = "2026-10"`. `[auth] redirect_urls` and `[app_proxy]` equal `apps/rewardspro/shopify.app.toml`'s.
2. **Ai on Yu's yes:** the old-directory guard: `apps/rewardspro/package.json`'s `deploy` and `shopify` scripts print "apps/rewardspro is retired: deploy from apps/rewards" and exit 1, and `apps/rewardspro/shopify.app.toml`'s `client_id` becomes `"retired-deploy-from-apps-rewards"` with a comment saying why. No old-app test reads that `client_id`, so the old suite and Instant Rollback keep working.
3. **Ai on Yu's yes (added):** in `.github/scripts/deploy-health.py`, the `rewardspro-production` entry's `appPath` becomes `apps/rewards` (OPERATIONS-10). Without it, the drift check watches the retired directory and misses a wrongly skipped rewards build.
4. **Ai on Yu's yes:** open the PR, `chore(rewards): production config, not yet released`. **Merge it only at B2 step 6.**

## B2: the switch (phase 2: one sitting, zero Shopify changes)

### Pre-check

**Ai on Yu's yes**, read-only: count the shops that have the old app installed. If any shop other than rewardsprotesting exists, stop. A carry-over script then moves its customers, tiers and ledger, and normalises its tiers (Ruling 62): whole-number percents and minimums (rounded, or refused with Yu's word), duplicate minimums merged (the unique index on `tier (merchant_id, min_spend)`), and the lowest minimum set to 0. No such script exists today; it is needed only in that case. With a real merchant, also revisit the phase 2 to 3 window below (WIDGET-4).

Then Ai sends Yu one message with steps 1 to 6 and the rollback, and waits for his yes.

### Step 1 (Yu): create the schema and the role, and migrate

1. In Supabase's SQL editor, as the database owner:

   ```sql
   CREATE ROLE rewards_app LOGIN PASSWORD '<Yu chooses>';
   CREATE SCHEMA rewards AUTHORIZATION rewards_app;
   ALTER ROLE rewards_app SET search_path = rewards;
   REVOKE ALL ON SCHEMA rewards FROM PUBLIC;
   ```

   If Supabase refuses `CREATE SCHEMA … AUTHORIZATION rewards_app` with "must be able to SET ROLE", run `GRANT rewards_app TO postgres;` first. Do not run `test/postgres/helpers/setup-database.sql` here: it is the test bed's.
2. Check the Data API can't see the schema: `select has_schema_privilege('anon', 'rewards', 'USAGE'), has_schema_privilege('authenticated', 'rewards', 'USAGE');` answers `false, false`, and Supabase's API settings, Exposed schemas, does not list `rewards`.
3. From a clean checkout of **the exact main commit step 4 deploys**, after `pnpm install --frozen-lockfile`:

   ```sh
   read -rs PW   # the rewards_app password, typed without echo, kept out of the shell history
   export REWARDS_DIRECT_URL="postgresql://rewards_app.<ref>:$PW@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?schema=rewards"
   pnpm --filter rewards migrate:deploy && pnpm --filter rewards migrate:drift
   unset PW REWARDS_DIRECT_URL
   ```

   Expected: every migration in `apps/rewards/prisma/migrations` applied, nine today (`20261105000000_init` to `20261107100000_page_indexes_and_widget_sync`), and the drift check exits 0. A URL of the wrong shape stops here with the expected shape printed.
4. **Ai on Yu's yes:** reads Yu's pasted output (never the URL).

### Step 2 (Yu): add the runtime variables in Vercel Production

- `REWARDS_DATABASE_URL`, with the transaction-pooler shape above, Production only, typed sensitive.
- `REWARDS_SENTRY_CRON_MONITORS=true`, if Yu said yes to Sentry Crons (before the sitting, row 4).

**Ai on Yu's yes:** `vercel env ls production` shows the names exist. Values are never printed.

### Step 3 (Yu): change the Vercel project `rewardspro-production`

- Root Directory `apps/rewards`.
- Framework React Router.
- Node `24.x`.
- Functions default region `lhr1` (today `iad1`, also in `functionDefaultRegions`).
- **Clear the Output Directory override `build`** (a Remix-era setting).

**Ai on Yu's yes:** reads the settings back, and also confirms Fluid compute is on and the default function timeout is 300 s (both already right today). No ignore-step change is needed: `apps/rewards/vercel.json` carries its own `ignoreCommand`, and the dashboard has none.

### Step 4 (Ai on Yu's yes): deploy

Push a commit touching `apps/rewards` to main (the B1 PR stays unmerged). Checks:

- The production deployment is READY. Read its build log once, to see the Output Directory change took.
- `GET /api/health` answers `200 {"status":"ok","database":"ready"}`. Since F1 the probe reads one of the app's own tables (`cron_lock`), so a URL with the right host but the wrong schema or role answers 503 here instead of passing (READINESS-3).
- A `POST` with a bad HMAC to each of the 11 released webhook URIs answers 401: `/webhooks/orders/paid`, `/webhooks/orders/refunded`, `/webhooks/orders/cancelled`, `/webhooks/app/uninstalled`, `/webhooks/app/scopes_update`, `/webhooks/compliance`, `/webhooks/orders/create`, `/webhooks/orders/fulfilled`, `/webhooks/customers/create`, `/webhooks/customers/update`, `/webhooks/products/update`.
- `GET /api/proxy/membership` without a signature answers 400, never 404.
- The project's `crons.definitions` (the same `/v9/projects` read) lists `/api/cron/payouts` (`30 * * * *`), `/api/cron/tiers` (`0 2 * * *`) and `/api/cron/housekeeping` (`0 3 * * *`) on the new deployment.

### Step 5 (Yu): open the app

Yu opens RewardsPro on rewardsprotesting once. Token exchange stores an expiring offline token, creates the merchant and connection, and starts the past-orders import. From here the old app's non-expiring token on that store is dead.

Ai has no `rewards_app` URL, so for the read-only checks Yu either runs these in the SQL editor, or puts the URL in Ai's shell for this step only:

```sql
select count(*) from rewards.merchant;                     -- 1
select count(*) from rewards.connection;                   -- 1
select import_state, import_horizon_days from rewards.connection;  -- running or done; 365
select "refreshToken" is not null as has_refresh, "refreshTokenExpires" from rewards."Session" where id like 'offline_%';
```

Expected: one merchant, one connection, the import `running` or `done`, and the session holding a refresh token whose expiry is about 90 days out. If `import_horizon_days` is 60, `read_all_orders` needs Yu's approval in the Partner Dashboard (B4).

### Step 6: merge B1, then a test order and the checks moved here

1. **Ai on Yu's yes:** merge the B1 PR (the guard and the `appPath` flip).
2. **Yu:** in the app, save the base rate (the first tier) and turn cashback on. A new merchant starts switched off with no tiers, so without this the test order earns nothing.
3. **Ai on Yu's yes:** one test order, a draft order marked as paid. Expected: an order row, a sent payout, and the credit on the buyer in Shopify admin.
4. **Ai on Yu's yes:** the checks staging could not run (OPERATIONS-10, Ruling 75, the staging open list):
   - the after-response send landed (waitUntil on Vercel);
   - Vercel ran a cron and `cron_run` has rows;
   - a Sentry test event carries the right `shop` tag;
   - the timing checks: webhooks answered within 5 s (the Dev Dashboard's delivery metrics), including a delivery that renews the token; an export at a few thousand buyers; a large tier delete; the nightly widget step; and a burst of webhooks against the pool of 3;
   - the renewal lease on lhr1 (Ruling 85): count the Sentry warnings "Another renewal of … was still running", by their `session.renewal` tag (`still-valid`, `try-later`, `renewing-anyway`). Only those whose session was inside the library's 5 minutes are real overlaps;
   - the released widget renders on the storefront from the new proxy, for the test shopper, and as a guest. Read its balance with the known window below in mind.

### Rollback

1. **Yu:** Vercel Instant Rollback to the last old-app deployment (683e30b9 today).
2. **Yu:** in the project settings, Root Directory back to `apps/rewardspro`, and the Output Directory (`build`), the Framework, Node and the default region (`iad1`) as they were.
3. **Ai on Yu's yes:** read the settings back, and read which crons are registered (`crons.definitions`, as in step 4).
4. **Yu:** reinstall the old app on rewardsprotesting, because its old token died in step 5.
5. **Yu:** before the next try, undo the Instant Rollback. After one, Vercel stops auto-promoting new production deployments until it is undone.

Credit the new app issued stays in Shopify; on the dev store that is test money.

## Between phase 2 and phase 3: the known windows

- **The released widget shows £0.00 for an unknown balance (MONEY-3, WIDGET-4).** The new proxy answers `storeCredit: null` when Shopify can't say: a read over 2.5 s, the 10 s back-off after a slow read or a low API budget, credit only in another currency, or a renewal of the store's token running. The released widget, still live until phase 3, formats that as £0.00. The new widget says "Your store credit shows at checkout" instead. On the dev store this is accepted: keep phase 3 close behind phase 2, and don't read £0.00 in that window as a fault. If a real merchant appears before the switch, answer requests without `?currency=` (the released widget's) with `success: false` instead.
- **The proxy path must stay `/apps/rewardspro` (WIDGET-6).** Both widgets call `/apps/rewardspro/membership`; Liquid has no object for the proxy path. If the app proxy's URL is customised in Shopify's admin, or Shopify gives another subpath, a signed-in buyer's widget stays hidden while Home still says the embed is on. Leave the proxy URL as it is.
- **Compliance webhooks reach only schema `rewards`,** while schema `rewardspro` still holds the dev store's old data. Drop it within 30 days of the switch (B5), so a redact received meanwhile is honoured for the old copy too.

## B3: the trimmed Shopify release (phase 3)

1. **Ai on Yu's yes:** list, read-only, what the old app created on rewardsprotesting (tier products, purchase options, the `rewardspro.customer_id` metafield definition). Show Yu the list. Delete them only on his yes: the trimmed scopes can't remove them later.
2. **Ai on Yu's yes:** `pnpm --filter rewards exec shopify app deploy --config shopify.app.toml --no-release --message "rebuild: trimmed scopes, 2026-10 webhooks, new widget"`. Read the output: `rewardspro-theme-extension` must show as **updated**, with uid `de76c331-60b3-32cf-27d1-40ec03d229db8af03050`, never created plus removed. This is the first real proof of the uid: the released toml carries only the dead top-level uid, and the staging app is a different app.
3. **Yu:** read the version diff in the Dev Dashboard: scopes removed, webhooks removed, extension updated. Release only on his yes, with `shopify app release --version <name> --allow-updates --allow-deletes`.
4. **Ai on Yu's yes:** verify the release:
   - in rewardsprotesting's theme editor, the RewardsPro embed is still on;
   - the embed's saved guest settings: Ruling 83 makes the released block's shipped defaults ("Join our rewards program!", "Sign In", `/account/login`) show the new copy, but any words Yu typed into those fields carry over and override it. Clear them if they aren't wanted (Yu);
   - webhooks arrive with `X-Shopify-API-Version: 2026-10`;
   - the guest path reads the app metafield (`data-running`, `data-base-percent` on a guest page, with no proxy call);
   - Lighthouse (mobile) with the embed off and then on, on a store without a storefront password: no more than 10 points lower (spec 5);
   - **gate C on the live theme**, which staging did not run (WIDGET-1, WIDGET-2, WIDGET-7): at 390 px wide, signed in and as a guest, in Light and Dark, with the cart drawer open and on a product page. The launcher must sit under the drawer (its Check out takes the tap), every line of the panel must be readable, and the open panel must fit on screen and scroll. Add Shopify Inbox if it is installed, since its button sits in the same corner. Also check, in the theme editor, whether the embed's preview survives a settings change without a reload.
5. **Ai on Yu's yes:** one PR removing the five ignored-topic routes and the old toml from two tests: the released-URIs test, and `production-toml.test.ts`'s comparison of `[auth]` and `[app_proxy]` (it keeps their literal values). The trimmed 2026-10 webhooks must land before 2027-01-16.

## B4: the two gates (phase 4)

As the plan says:

- **Ai on Yu's yes:** confirm CI is green on main for the `rewards` job.
- **Ai on Yu's yes:** run spec 9.1 checks A to P on rewardsprotesting (F read as Decision 19 says), and record each with evidence in `apps/rewards/docs/gates.md`.
- **Yu:** for check N on `different-currency-test`, install the app there, or give his ok to run N on the staging app.
- **Yu:** every spec 9.2 item that is not ok (the checklist below): do its owner step, or accept it in chat. **Ai on Yu's yes** reads back the ones marked readback.
- **Ai on Yu's yes:** send Yu the report, in at most 8 lines.

Add to the gates what staging left open. Each line says who does what; **Ai on Yu's yes** records every result with evidence in `gates.md`:

- **Compliance with real data (I):** **Yu** sends a real customers/data_request and customers/redact from Shopify admin; **Ai on Yu's yes** checks the Home banner, the download and the erasure. Shopify sends customers/redact about 10 days after the request, or up to 6 months later for a customer who ordered recently, so use a test customer with no recent orders and start the redact about 10 days before this gate. On staging, the data request from cashbackpro's admin never reached the dev tunnel (docs/staging-run.md), so this is its first real run.
- **A tax-exclusive order:** spec 6.3 rule 1 requires one; it needs a market or store whose prices exclude tax, which **Yu** sets up in Shopify admin. **Ai on Yu's yes** places the order and checks the base and a shipping-only refund (Rulings 11, 12).
- **Ai on Yu's yes:** **a tipped order** (Ruling 26), and **orders edited before and after payment** (Ruling 25's known risk: if Shopify's refund for removed items carries no refund lines, the removal counts twice in spend).
- **Uninstall and reinstall (J):** **Yu** uninstalls and reinstalls the app; **Ai on Yu's yes** runs check J on each. **Ai on Yu's yes:** **table paging** past one page of buyers.
- **Ai on Yu's yes: multi-currency (N)**, on the store Yu chose above. Presentment issuance and the buyer panel's per-currency balance lines (Ruling 66) are proved only in tests so far.

**Ai on Yu's yes:** keep in Yu's B4 message: the two frozen paid charges (Decision 20: Yu cancels each with the Partner API `appSubscriptionCancel(appId, shopId, prorate: false)`, or asks Partner Support), `read_all_orders` if the import fell back to 60 days, protected customer data (the app reads only first and last names; it needs email only for Shopify's search to match emails, so phone and address can be dropped from the approval), and Ruling 72 (no docs link).

**Data requests (Yu's call):** a customers/data_request shows only inside the app (Home's banner, Settings, Customer data requests). A merchant who doesn't open the app within 30 days misses the due date, and after 45 days the request can't be downloaded. Accept that, or ask for an email to the shop owner. A compliance delivery that exhausts Shopify's retries: housekeeping now erases a store uninstalled more than 30 days ago (Ruling 86), but a lost customers/redact can't be backstopped, because its customer id is only in the payload; read it from the Partner Dashboard's webhook delivery log and redact by hand.

## B5: retire (phase 5, at least a week after B4)

As the plan says, plus:

- **Ai on Yu's yes:** B3 step 5 comes first, because `released-uris.test.ts` and `production-toml.test.ts` read the old toml;
- **Ai on Yu's yes:** remove the root scripts (`dev:`, `build:` and `test:rewardspro`, the `rewardspro-api` scripts) and the `--filter '!rewardspro'` in `typecheck`;
- **Ai on Yu's yes:** remove the `rewardspro` CI job, its `detect` filter and its `ci-status` needs, and `rewardspro-v2.yml`;
- **Ai on Yu's yes:** write `apps/rewards`'s own DEPLOY.md and DATABASE.md (the connection strings above) before the old ones are deleted;
- **Yu:** delete the old app's own env names (`DATABASE_URL` ×2, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` ×3 each, `GITBOOK_API_KEY`, `GITBOOK_ORG_ID`, `GITBOOK_SITE_ID`, `SENDGRID_API_KEY`) and revoke those keys at their providers;
- **Yu:** dump, then drop, schema `rewardspro` and its role, within 30 days of the switch. Both are irreversible.

## Spec 9.2 checklist

From the final review's readiness lens, at e80bfecc, with F1's fixes. "Owner" means a Yu step above.

| # | Item | Status | What is needed |
|---|---|---|---|
| 1 | Region lhr1 and Node 24 in `vercel.json` and code | OK | `regions: ["lhr1"]`, engines `24.x`, `.nvmrc` 24, CI on Node 24. |
| 1b | Region and Node as the project default | Owner | B2 step 3. |
| 2 | Schema and role isolated, not exposed via the Data API | Owner, then readback | B2 step 1. Since F1, `prisma-tls.ts` refuses a URL of the wrong shape. |
| 3 | Pool settings | OK; one open | Max 3, idle 5 s, connect 10 s, `attachDatabasePool`, pinned CA. Open: a burst of webhooks against 3 connections, at B2 step 6. |
| 4 | Migrations and drift check | OK in CI; owner at B2 | B2 step 1. |
| 5 | Previews: no production database, no production Shopify secret | Owner | Before the sitting, row 2. `REWARDS_DATABASE_URL` is Production only. |
| 6a | Secrets: only the names the app reads | OK | Shared: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `ENCRYPTION_SECRET`, `ENCRYPTION_SALT`, `CRON_SECRET`, `SENTRY_DSN`. Added at B2: `REWARDS_DATABASE_URL`, and `REWARDS_SENTRY_CRON_MONITORS` on Yu's yes. Read but unset, harmless: `SCOPES`, `SHOP_CUSTOM_DOMAIN`. |
| 6b | Production secrets typed sensitive | Owner | `SHOPIFY_API_SECRET` with the split (row 5); `REWARDS_DATABASE_URL` added as sensitive. |
| 6c | Orphaned names deleted | Owner | Before the sitting, row 5; the old app's own names at B5. |
| 7a | HMAC on every webhook route | OK | 11 of 11 released URIs; B2 step 4 checks each answers 401 to a bad HMAC. |
| 7b | Webhooks answered within 5 s, measured | Open | B2 step 6, on lhr1. |
| 7c | Webhooks idempotent by natural keys | OK | Unique keys on order, refund, ledger entry and payout. |
| 8 | App proxy: signature, identity, rate limit | OK; one open | The released widget against the new proxy on rewardsprotesting, at B2 step 6. |
| 9 | Tokens: expiring, encrypted including refresh, refresh proven | OK on staging; open on production | B2 step 5 (a refresh token about 90 days out) and step 6 (the renewal lease on lhr1, Ruling 85). |
| 10a | Sentry on cron failures and stops | Owner | Before the sitting, row 4. |
| 10b | `/api/health` in the hourly deploy-health check | OK in code; owner | `appPath` flips in B1; re-enabling `health.yml` is Yu's call (row 8). |
| 11 | Buyer ids in Vercel's request logs | Owner | Before the sitting, row 6. |
| 12 | `CI status` required on main | Owner | Before the sitting, row 7. |
| 13 | Point-in-time recovery and one rehearsed restore | Owner, before the first real merchant | Before the sitting, row 9. |
