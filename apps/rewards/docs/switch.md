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
- **Row 2:** done. `SHOPIFY_API_SECRET` is Production only and typed sensitive (read back: one entry). Vercel can't change an existing variable's type, so at B2 step 2 Yu deleted it and added it again. The first re-add copied the staging app's secret; step 4's real-secret webhook check caught it.
- **Row 3:** OK. `ENCRYPTION_SECRET` and `ENCRYPTION_SALT` are set in Production, typed sensitive.
- **Row 4:** `SENTRY_DSN` is set. The Sentry alert "RewardsPro production: new, escalating or regressed issues" emails Yu. Sentry Crons wait until a real merchant arrives: until then a total stop of every cron is silent (accepted), and `REWARDS_SENTRY_CRON_MONITORS` stays unset at B2 step 2.
- **Row 5:** done by Yu: the 15 orphaned names and the 2 repo Actions secrets are gone (read back: `VERCEL_TOKEN` is the only Actions secret).
- **Row 6:** accepted. No log drain.
- **Row 7:** done on 2026-11-06, right after B2 step 4: ruleset `main: CI status` (id 26716067) requires the `CI status` check from GitHub Actions on the default branch, with no bypass.
- **Row 8:** done. Yu re-enabled `health.yml` on 2026-11-06. Its schedule did not fire that day (a run was started by hand, green) and fires again from 2026-11-07.
- **Row 9:** later, before the first real merchant.
- **Row 10:** for Yu to read.
- **Data requests (B4):** accepted for now: they show only inside the app. An email to the shop owner comes when a real merchant arrives.

## The switch record (2026-11-06 and 2026-11-07)

What happened, with evidence, so a later session or reviewer can trust each step without redoing it.

- **B1:** PR #147, merged at B2 step 6 (8530bfc7) after a review whose five confirmed findings were fixed in it.
- **B2 pre-check:** 11 installs, none a live merchant (the result under Pre-check). No carry-over script.
- **B2 step 1 (Yu):** nine migrations applied to schema `rewards`, TLS verified against the bundled CA, `migrate:drift` "No difference detected". The Data API can't see the schema (`false, false`).
- **B2 steps 2 and 3:** read back by name and type: `REWARDS_DATABASE_URL` and `SHOPIFY_API_SECRET` sensitive, Production only; Root Directory `apps/rewards`, React Router, Node 24.x, no Output Directory override, `lhr1`.
- **B2 step 4:** the deploy commit 3eac13e5 built `apps/rewards` and answered every check except health, then two value mistakes were found and fixed, each needing a new commit because a same-commit redeploy is skipped:
  - `/api/health` answered 503: "Authentication failed … `rewards_app`". The typed `REWARDS_DATABASE_URL` carried a stray character. Rebuilt with the value built in the terminal (109ff067): 200.
  - The admin answered 401 Unauthorized: `SHOPIFY_API_SECRET` held the staging app's secret (the draft app named like the Vercel project). Re-entered from Rewards Pro's Credentials (c730afaf); the real-secret webhook check, added to step 4, answered 200.
- **B2 step 5 (Yu):** one merchant, one connection, the import with a 365-day horizon, and an offline session with a refresh token to 2027-02-04.
- **B2 step 6:**
  - Test order #1010 (£222.00, marked paid): `orders/paid` answered 200 in 822 ms, and Shopify shows "Rewards Pro credited this customer £11.10 GBP" within the same second (5%, the after-response send landed).
  - Crons on Vercel: payouts hourly from 14:30, tiers at 02:00 and housekeeping at 03:00 on 2026-11-07, all 200.
  - The token renewed from its refresh token after its first hour (the 15:30 cron); Sentry shows no renewal-overlap warning.
  - The released widget's proxy call reached the app only after the store's proxy path was set back from `/apps/rewardspro-1` to `/apps/rewardspro` (Yu): an earlier install of the draft app had taken the path on this store (WIDGET-6, below).
  - Sentry receives production events with the release tag. The `shop` tag waits for the first store-scoped event (B4).
  - Found and fixed on the way: #150 (the session library's startup table check held the first request after an idle pause for 5 s, and two failed checks made an instance refuse every session call) and #152 (React Router's 4xx answers, such as a GET on a POST-only webhook route, no longer reach Sentry).
- **B3:**
  - What the old app left on rewardsprotesting: three tier membership products, deleted by Yu. No purchase options, no `rewardspro.customer_id` definition, no `rewardspro` metafield values.
  - Version `rewardspromembership-217` (74a0be5a), released by Yu on 2026-11-07: the theme extension kept uid `de76c331-60b3-32cf-27d1-40ec03d229db8af03050`, the released version's own, so it updated in place and the embed stayed on.
  - A release that reduces scopes takes effect when the merchant next opens the app: then 8 scopes (the 6 configured and the 2 they imply, down from 19), and `app/scopes_update` arrived on API version 2026-10, answered 200 in 344 ms.
  - The embed's saved guest fields are the released block's shipped defaults, so the new copy shows (Ruling 83). A disabled embed from the draft app stays in the theme's settings, harmless.
  - Gate C on Yu's iPhone: signed in, as a guest and in Dark. This store's Dawn uses a cart page, not a drawer; Check out stays clear of the launcher. A guest page makes no proxy call.
  - Step 5: the PR removing the five ignored-topic routes and the old toml from the tests.
- **Seen, not ours:** around 10:43 on 2026-11-07 something requested the old app's routes (`/api/cron/session-health`, `/api/admin/tier-health`) and the proxy without a signature; all were refused. A monitor that still knows the old app's addresses; point it at `/api/health`.

## B1: the production toml and the old-app guard (a PR, deploys nothing)

As the plan says, plus two changes:

1. **Ai on Yu's yes:** write `apps/rewards/shopify.app.toml` and its test (`test/unit/config/production-toml.test.ts`) with the identity values from the plan's Global Constraints. The subscriptions are `orders/paid`, `refunds/create` (uri `/webhooks/orders/refunded`), `orders/cancelled`, `app/uninstalled`, `app/scopes_update` and compliance (`/webhooks/compliance`), on `api_version = "2026-10"`. `[auth] redirect_urls` and `[app_proxy]` equal `apps/rewardspro/shopify.app.toml`'s.
2. **Ai on Yu's yes:** the old-directory guard: every `apps/rewardspro/package.json` script that runs the Shopify CLI (`dev`, `config:link`, `generate`, `deploy`, `config:use`, `env` and `shopify`) prints "apps/rewardspro is retired: deploy from apps/rewards" and exits 1, and `apps/rewardspro/shopify.app.toml`'s `client_id` becomes `"retired-deploy-from-apps-rewards"` with a comment saying why. No old-app test reads that `client_id`, so the old suite and Instant Rollback keep working.
3. **Ai on Yu's yes (added):** in `.github/scripts/deploy-health.py`, the `rewardspro-production` entry's `appPath` becomes `apps/rewards` (OPERATIONS-10). Without it, the drift check watches the retired directory and misses a wrongly skipped rewards build.
4. **Ai on Yu's yes:** open the PR, `chore(rewards): production config, not yet released`. **Merge it only at B2 step 6.**

## B2: the switch (phase 2: one sitting, zero Shopify changes)

### Pre-check

**Ai on Yu's yes**, read-only: count the shops that have the old app installed. If any shop other than rewardsprotesting exists, stop. A carry-over script then moves its customers, tiers and ledger, and normalises its tiers (Ruling 62): whole-number percents and minimums (rounded, or refused with Yu's word), duplicate minimums merged (the unique index on `tier (merchant_id, min_spend)`), and the lowest minimum set to 0. No such script exists today; it is needed only in that case. With a real merchant, also revisit the phase 2 to 3 window below (WIDGET-4).

**Result (2026-11-06):** the Dev Dashboard lists 11 installs of the released app.

- Four are our own development stores, holding test data only: rewardsprotesting, teststore12062025, themetester222 and different-currency-test.
- Seven are stores that are frozen or closed, where the app can't run.

Yu agreed in chat to switch without a carry-over script. A store that reopens and opens the app starts fresh: its 12-month import rebuilds tier spend, and the credit its buyers earned stays in Shopify. Only the old app's history and settings for that store stay behind in schema `rewardspro`, which B5 dumps before dropping it.

The dashboard also warns that from 2027-01-01 the app can't take new installs while it uses non-expiring offline tokens. The new app's expiring tokens clear that.

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
- `SHOPIFY_API_SECRET`, if it is not yet typed sensitive: delete it and add it again, Production only, typed sensitive (Vercel can't change an existing variable's type). The value is **Rewards Pro's** client secret: the Dev Dashboard's app with client id `026ce3bf…`, Settings, Credentials. The draft app named "rewardspro-production", like the Vercel project, is the staging app; its secret makes every webhook and the admin answer 401.

**Ai on Yu's yes:** `vercel env ls production` shows the names exist. Values are never printed.

Build the URL in the terminal rather than typing it into Vercel, so the password goes in exactly as the migrations used it:

```sh
read -rs PW; printf '%s' "postgresql://rewards_app.<ref>:$PW@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?schema=rewards&connection_limit=3" | pbcopy; unset PW
```

Paste it as the value, then clear the clipboard with `pbcopy < /dev/null`. On 2026-11-06 a stray character in the typed value made step 4's health check answer 503, and the log read "Authentication failed … credentials for `rewards_app` are not valid". A fixed value reaches only a new deployment, and a redeploy of the same commit is skipped by `scripts/vercel-ignore-build.sh` (nothing changed since the last good deployment), so the fix needs a new commit touching `apps/rewards`.

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
- A `POST` with a bad HMAC to each webhook URI answers 401: `/webhooks/orders/paid`, `/webhooks/orders/refunded`, `/webhooks/orders/cancelled`, `/webhooks/app/uninstalled`, `/webhooks/app/scopes_update`, `/webhooks/compliance`. (Before B3 the released version also had `/webhooks/orders/create`, `/webhooks/orders/fulfilled`, `/webhooks/customers/create`, `/webhooks/customers/update` and `/webhooks/products/update`; B3 step 5 removed their routes, so they now answer 404.)
- A webhook signed with the released app's real secret answers 200. A bad HMAC answers 401 whatever secret Vercel holds, so only this proves `SHOPIFY_API_SECRET` is Rewards Pro's (client id `026ce3bf…`), not the staging app's. The CLI's sample `orders/cancelled` names no real store, so the app logs "No store connection for shop.myshopify.com; nothing to do" and answers 200, writing nothing:

  ```sh
  shopify app webhook trigger --client-id 026ce3bf073bed0e44ae8eab09d1ae3a --topic orders/cancelled --api-version 2026-10 --delivery-method http --address https://rewardspro-production.vercel.app/webhooks/orders/cancelled
  ```

  On 2026-11-06 the Dev Dashboard's draft app "rewardspro-production" (the staging app, whose name matches the Vercel project) was copied by mistake: this check (then on `products/update`, since removed) answered 401 and the admin answered 401 Unauthorized. The `orders/cancelled` form was proved on 2026-11-07.
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

This rollback is for phase 2, before B3's release. Since `rewardspromembership-217` was released (2026-11-07), the stores hold the trimmed scopes and 2026-10 webhooks, so going back to the old app would also need a Shopify release of the old config, which the old directory's guard refuses: that is a new plan, not these steps.

1. **Yu:** Vercel Instant Rollback to the last old-app deployment (683e30b9 today).
2. **Yu:** in the project settings, Root Directory back to `apps/rewardspro`, and the Output Directory (`build`), the Framework, Node and the default region (`iad1`) as they were.
3. **Ai on Yu's yes:** read the settings back, and read which crons are registered (`crons.definitions`, as in step 4).
4. **Yu:** reinstall the old app on rewardsprotesting, because its old token died in step 5.
5. **Yu:** before the next try, undo the Instant Rollback. After one, Vercel stops auto-promoting new production deployments until it is undone.
6. **Ai on Yu's yes:** if the B1 PR was already merged (step 6), a PR putting `rewardspro-production`'s `appPath` in `.github/scripts/deploy-health.py` back to `apps/rewardspro`. Otherwise the hourly drift check watches `apps/rewards` while the project builds `apps/rewardspro`, and raises a false alarm on every rewards commit. The old directory's Shopify CLI guard can stay: rollback deploys nothing to Shopify.

Credit the new app issued stays in Shopify; on the dev store that is test money.

## Between phase 2 and phase 3: the known windows

- **The released widget shows £0.00 for an unknown balance (MONEY-3, WIDGET-4).** The new proxy answers `storeCredit: null` when Shopify can't say: a read over 2.5 s, the 10 s back-off after a slow read or a low API budget, credit only in another currency, or a renewal of the store's token running. The released widget, still live until phase 3, formats that as £0.00. The new widget says "Your store credit shows at checkout" instead. On the dev store this is accepted: keep phase 3 close behind phase 2, and don't read £0.00 in that window as a fault. If a real merchant appears before the switch, answer requests without `?currency=` (the released widget's) with `success: false` instead.
- **The proxy path must stay `/apps/rewardspro` (WIDGET-6).** Both widgets call `/apps/rewardspro/membership`; Liquid has no object for the proxy path. A store can hold another path already: on rewardsprotesting it was `/apps/rewardspro-1` after a draft app's install, and every signed-in widget call answered 404 from Shopify. Check it in the store's Settings, Apps, Rewards Pro (the URL above Customize URL). If it is anything other than `/apps/rewardspro`, a signed-in buyer's widget stays hidden while Home still says the embed is on: set it back with Customize URL (the store's owner), as on rewardsprotesting. Never customise it to anything else.
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
5. **Ai on Yu's yes (done after the release, 2026-11-07):** one PR removing the five ignored-topic routes and the old toml from two tests: the released-URIs test, and `production-toml.test.ts`'s comparison of `[auth]` and `[app_proxy]` (it keeps their literal values). The trimmed 2026-10 webhooks must land before 2027-01-16.

## B4: the two gates (phase 4)

As the plan says:

- **Ai on Yu's yes:** confirm CI is green on main for the `rewards` job.
- **Ai on Yu's yes:** run spec 9.1 checks A to P on rewardsprotesting (F read as Decision 19 says), and record each with evidence in `apps/rewards/docs/gates.md`.
- **Yu:** for check N on `different-currency-test`, install the app there, or give his ok to run N on the staging app.
- **Yu:** every spec 9.2 item that is not ok (the checklist below): do its owner step, or accept it in chat. **Ai on Yu's yes** reads back the ones marked readback.
- **Ai on Yu's yes:** send Yu the report, in at most 8 lines.

Add to the gates what staging left open. Each line says who does what; **Ai on Yu's yes** records every result with evidence in `gates.md`:

- **Carried from B2 step 6 and B3 (the switch record):** **Ai on Yu's yes:** the `shop` tag on the first store-scoped Sentry event; an `orders/paid` delivery that renews the store's token first, answered within 5 s (row 7b); a burst of webhooks against the pool of 3 (row 3); an export at a few thousand buyers and a large tier delete, timed; whether the theme editor's preview survives a settings change without a reload. **Yu:** a store without a storefront password for Lighthouse with the embed off and on (spec 5).

- **Compliance with real data (I):** **Yu** sends a real customers/data_request and customers/redact from Shopify admin; **Ai on Yu's yes** checks the Home banner, the download and the erasure. Shopify sends customers/redact about 10 days after the request, or up to 6 months later for a customer who ordered recently, so use a test customer with no recent orders and start the redact about 10 days before this gate. On staging, the data request from cashbackpro's admin never reached the dev tunnel (docs/staging-run.md), so this is its first real run.
- **A tax-exclusive order:** spec 6.3 rule 1 requires one; it needs a market or store whose prices exclude tax, which **Yu** sets up in Shopify admin. **Ai on Yu's yes** places the order and checks the base and a shipping-only refund (Rulings 11, 12).
- **Ai on Yu's yes:** **a tipped order** (Ruling 26), and **orders edited before and after payment** (Ruling 25's known risk: if Shopify's refund for removed items carries no refund lines, the removal counts twice in spend).
- **Uninstall and reinstall (J):** **Yu** uninstalls and reinstalls the app; **Ai on Yu's yes** runs check J on each. **Ai on Yu's yes:** **table paging** past one page of buyers.
- **Ai on Yu's yes: multi-currency (N)**, on the store Yu chose above. Presentment issuance and the buyer panel's per-currency balance lines (Ruling 66) are proved only in tests so far.

**Ai on Yu's yes:** keep in Yu's B4 message: the two frozen paid charges (Decision 20: Yu cancels each with the Partner API `appSubscriptionCancel(appId, shopId, prorate: false)`, or asks Partner Support), `read_all_orders` if the import fell back to 60 days, protected customer data (the app reads only first and last names; it needs email only for Shopify's search to match emails, so phone and address can be dropped from the approval), and Ruling 72 (no docs link).

**Data requests (Yu's call):** a customers/data_request shows only inside the app (Home's banner, Settings, Customer data requests). A merchant who doesn't open the app within 30 days misses the due date, and after 45 days the request can't be downloaded. Accept that, or ask for an email to the shop owner. A compliance delivery that exhausts Shopify's retries: housekeeping now erases a store uninstalled more than 30 days ago (Ruling 86), but a lost customers/redact can't be backstopped, because its customer id is only in the payload; read it from the Partner Dashboard's webhook delivery log and redact by hand.

## B5: retire (phase 5, at least a week after B4)

As the plan says, plus:

- B3 step 5 is done, so no `apps/rewards` test reads the old toml. `apps/rewardspro`'s own tests still do, and the `rewardspro` CI job runs them under `CI status`, which main's ruleset requires: delete the old toml only together with that job (below);
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
| 1b | Region and Node as the project default | OK | Read back at B2 step 3: `lhr1`, Node 24.x. |
| 2 | Schema and role isolated, not exposed via the Data API | OK | B2 step 1: `false, false` for `anon` and `authenticated`, and the health probe reads the app's own table as `rewards_app`. |
| 3 | Pool settings | OK; one open | Max 3, idle 5 s, connect 10 s, `attachDatabasePool`, pinned CA; since #150 no query at module load. Open: a burst of webhooks against 3 connections (B4). |
| 4 | Migrations and drift check | OK | B2 step 1: nine migrations, no drift. |
| 5 | Previews: no production database, no production Shopify secret | Owner | Before the sitting, row 2. `REWARDS_DATABASE_URL` is Production only. |
| 6a | Secrets: only the names the app reads | OK | Shared: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `ENCRYPTION_SECRET`, `ENCRYPTION_SALT`, `CRON_SECRET`, `SENTRY_DSN`. Added at B2: `REWARDS_DATABASE_URL`, and `REWARDS_SENTRY_CRON_MONITORS` on Yu's yes. Read but unset, harmless: `SCOPES`, `SHOP_CUSTOM_DOMAIN`. |
| 6b | Production secrets typed sensitive | OK | Read back on 2026-11-06: `SHOPIFY_API_SECRET`, `REWARDS_DATABASE_URL`, `ENCRYPTION_SECRET`, `ENCRYPTION_SALT` and `CRON_SECRET` are sensitive. `SENTRY_DSN` stays encrypted: a DSN only lets a sender submit events, and Sentry treats it as public. |
| 6c | Orphaned names deleted | Owner | Before the sitting, row 5; the old app's own names at B5. |
| 7a | HMAC on every webhook route | OK | 6 of 6 URIs of the released version `rewardspromembership-217`; B2 step 4 checks each answers 401 to a bad HMAC. The five ignored-topic routes were removed in B3 step 5. |
| 7b | Webhooks answered within 5 s, measured | OK; one open | `orders/paid` 822 ms and `app/scopes_update` 344 ms on lhr1 (Dev Dashboard); the 5 s wait after an idle pause is fixed by #150. Open: a delivery that renews the token first (B4). |
| 7c | Webhooks idempotent by natural keys | OK | Unique keys on order, refund, ledger entry and payout. |
| 8 | App proxy: signature, identity, rate limit | OK | The released widget, then the new one, against the new proxy on rewardsprotesting; unsigned calls answer 400. |
| 9 | Tokens: expiring, encrypted including refresh, refresh proven | OK | B2 step 5 (refresh token to 2027-02-04), and the first renewal at the 15:30 cron with no overlap warning. |
| 10a | Sentry on cron failures and stops | Owner | Before the sitting, row 4. |
| 10b | `/api/health` in the hourly deploy-health check | OK | `appPath` is `apps/rewards` (#147) and `health.yml` runs hourly again. |
| 11 | Buyer ids in Vercel's request logs | Owner | Before the sitting, row 6. |
| 12 | `CI status` required on main | OK | Ruleset 26716067. |
| 13 | Point-in-time recovery and one rehearsed restore | Owner, before the first real merchant | Before the sitting, row 9. |
