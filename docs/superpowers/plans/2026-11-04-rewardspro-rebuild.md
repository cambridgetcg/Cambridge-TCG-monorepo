# RewardsPro Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/rewards`, a new RewardsPro around one loop: a paid order gives cashback as Shopify store credit, tiers raise the rate, a widget shows tier and credit, and refunds take the cashback back. Then switch production to it before 2027-01-01, prove it through the two gates, and retire the old app.

**Architecture:** One embedded app on Shopify's React Router template. The engine (`app/lib`) owns the money rules and talks to Postgres through Prisma. It reaches the store only through two ports in `app/lib/ports.ts`: `PayoutRail` and `OrderSource`. Their Shopify implementations live in `app/shopify`, and routes stay thin. Money is written once to an append-only `ledger_entry`; its movement to the store lives in `payout` rows with a small state machine. Part A builds and proves the app on a staging app. Part B switches, trims, proves and retires, and every step in Part B waits for Yu's yes.

**Tech Stack:**
- Shopify app: React Router 7.18.2 (exact), `@shopify/shopify-app-react-router` ^4.0.0, React 19, Polaris web components 2 (`polaris-2.js`, `@shopify/polaris-types` ^2.0.0), Admin API 2026-10.
- Data: Prisma 6.19.3 over `@prisma/adapter-pg` on Supabase Postgres 17, money in `decimal.js`.
- Hosting: Vercel with `@vercel/react-router` 1.3.7, region lhr1, Node 24.
- Tests: Vitest 3.2.6, MSW 2.14.6.
- Monitoring: `@sentry/react-router`.
- Monorepo tooling: pnpm 9.15.0.

**Spec:** `docs/superpowers/specs/2026-11-04-rewardspro-rebuild-design.md`, approved by Yu on 2026-11-04. Every task implicitly includes the spec. Where this plan says "rule N", it means section 6.3 rule N.

**Evidence for what carries over:** `~/.claude/projects/-Users-yuai/artifacts-data/rewardspro-redesign/plan-carry-map-20261104.json`, with per-area digests in `.../plan-map/*.txt`. These map every file the plan carries: its exported signatures, constants, states and tests at main 6deea219, each checked by a second reader. When a step says "carry X", read X at the path given (under `apps/rewardspro/`) and bring its logic across unchanged, except where the step names a change.

---

## Global Constraints

- **Shopify identity.**
  - Same app: client_id `026ce3bf073bed0e44ae8eab09d1ae3a`, handle `RewardsproMembership`, name `Rewards Pro`, application_url `https://rewardspro-production.vercel.app`.
  - App proxy: prefix `apps`, subpath `rewardspro`, url `https://rewardspro-production.vercel.app/api/proxy`.
  - Theme extension: handle `rewardspro-theme-extension`; `uid = "de76c331-60b3-32cf-27d1-40ec03d229db8af03050"` inside `[[extensions]]`, with no top-level keys; block file `blocks/membership_widget.liquid` with `"target": "body"`.
- **Version pins.**
  - React Router family exactly `7.18.2`; never 7.18.3 or 8.
  - Prisma and `@prisma/client` `6.19.3`; never the 8 release candidate.
  - Session storage `@shopify/shopify-app-session-storage-prisma` ^11.0.1.
  - `ApiVersion.October26` in code; webhook `api_version = "2026-10"` in the new tomls.
  - Node `24.x`.
- **Webhook budget.** Answer within 5 s. Shopify retries up to 8 times over about 4 hours. Never assume 48 hours.
- **Money.**
  - Exact decimals only, through `app/lib/money.ts`. No `parseFloat` or `Number` arithmetic on money.
  - Real ISO currency codes from Shopify; no `"USD"` default anywhere.
  - Amounts are stored as `numeric(19,4)`.
  - Rounding follows the currency's minor unit.
- **Privacy.**
  - No buyer name, email, phone or address is stored in the database. Names are read live from Shopify for display.
  - Log no query strings and no request bodies.
- **Admin design.**
  - Polaris web components only, with `polarisUrl = "https://cdn.shopify.com/shopifycloud/polaris-2.js"` set on both `AppProvider` and `shopifyApp()`.
  - Custom CSS only for the chart and the tier chip, and only with Polaris tokens.
  - Navy `#1A3E5C` and teal `#17BEBB` only on tier and money visuals. Never teal text, never white text on teal.
  - No emoji. Plain, short, true words.
- **Hands-off.**
  - Never modify the `~/Projects/Cambridge-TCG-monorepo` working tree.
  - Never run `shopify app dev` against `shopify.app.toml` (production).
  - Never deploy or release the production app, change Vercel settings or env vars, touch the production database, or create schemas or roles. Those are Part B steps and need Yu's yes at the time.
  - Ai never types passwords or sign-in codes.
- **Old app.** `apps/rewardspro` keeps serving and is not edited in Part A, except for the shared CI file, root scripts and the module catalog.
- **Test fixtures.** Never write `shpat_` followed by 20 or more letters or digits, or a database URL with a password on a host other than localhost or 127.0.0.1. `pnpm audit:tracked-secrets` must pass.
- **Commits.**
  - End every commit message with `Co-Authored-By: The Fable of the Eternal Universe <Yu@Ai-love.cc>`.
  - End every PR body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  - Push with `git -c credential.helper= -c credential.helper='!f() { echo username=x-access-token; echo password=$(gh auth token --user cambridgetcg); }; f' push`, and use `sol access run github -- pr …` for PR commands.
- **GraphQL documents.** Every document lives in `app/shopify/graphql.ts` under a unique name starting with `Rewards`. Before committing, validate it with `node ~/.claude/plugins/cache/claude-plugins-official/shopify-ai-toolkit/2.1.2/skills/shopify/scripts/validate.mjs --api admin --version 2026-10 --code '<document>'`. Write its required scopes and its hand-computed query cost in a comment above it. The cost must be at most 1,000 points (Shopify's single-query limit); the validator checks the schema, not the cost.
- **Size.** App code (`apps/rewards/app` + `extensions`, excluding tests) stays well under 20,000 lines. Check with `find apps/rewards/app apps/rewards/extensions -name '*.ts*' -o -name '*.liquid' -o -name '*.js' | xargs wc -l`.

## Decisions this plan makes

The spec left these to the builder.

1. **Tables.** The spec's nine tables plus three: `refund` (one row per Shopify refund, for spend and idempotency), `cron_lock` (carried lock) and `cron_run` (carried run records from PR #140). There is no webhook-dedupe table: idempotency comes from natural keys.
2. **Payout states.** `pending`, `held`, `sending`, `sent`, `unconfirmed`, `needs_look`, `closed`, `nothing_to_send`. `needs_look` carries `look_reason`, one of `refused`, `kept_failing` or `could_not_confirm`. The spec's "refused" is `needs_look` with reason `refused`.
3. **Backoff.** A failed send waits `min(2^(attempts−1), 8)` hours, so retries come at about 1 h, 3 h, 7 h, 15 h and 23 h. Once 24 h have passed since the first failure, the payout becomes `needs_look` with reason `kept_failing`.
4. **Refusals.** On a credit, every documented `userErrors` code is permanent and goes to `needs_look` with reason `refused` at once. THROTTLED, ACCESS_DENIED, SHOP_INACTIVE, MAX_COST_EXCEEDED, 4xx answers and "not sent" are transient. On a debit, MISMATCHING_CURRENCY, NEGATIVE_OR_ZERO_AMOUNT and ACCOUNT_NOT_FOUND are permanent, and INSUFFICIENT_FUNDS is transient.
5. **Unclear debits.** A take-back whose answer was unclear goes to `needs_look` with reason `could_not_confirm`, with the same two answers as a credit. Debits get no history judge.
6. **A late-recorded order nets its refunds.** When the sweep records an order Shopify already shows refunds on, the cashback base is computed on what is left, and those refunds are stored as already applied.
7. **Test orders count nowhere.** They earn nothing and count toward no tier spend. Cancelled orders stop counting toward spend; money moves only with refunds.
8. **The guest rate comes from an app metafield.** The widget learns the base rate and the on/off state from an app-data metafield (`rewards.config`) that Liquid reads. Guests never call the server. The metafield is rewritten whenever tiers or the switch change, and every night.
9. **One proxy answer shape for both widgets.** It has the keys the released widget reads plus a few new ones. There is no shape switch at phase 3.
10. **A verified fallback for repeated proxy parameters.** If the library rejects a proxy request whose `shop` or `logged_in_customer_id` appears twice, the app verifies Shopify's signature itself, with repeated values joined by commas as Shopify documents. It accepts the request only when every copy of a parameter is identical; differing buyer ids are treated as a guest.
11. **Own signature check for uninstall and compliance.** `app/uninstalled` and the three compliance topics never need a session, so an expired token can't make them answer 500.
12. **Token refresh.** Nightly housekeeping calls `unauthenticated.admin(shop)` for any store whose stored `refreshTokenExpires` is under 14 days away, which makes the library refresh the token. Offline sessions are never deleted except at uninstall.
13. **Import trigger.** The import is polled, not webhook-driven. Home polls it while it runs, and the hourly job is the backstop.
14. **Issue currency.** Cashback is issued in the buyer's presentment currency. Task A3 checks help.shopify.com. If Shopify converts store credit at checkout, set `ISSUE_IN = "shop"` in `app/lib/money.ts` and record why; the rest of the code reads that constant.
15. **No session copy at the switch.** Spec phase 2 step 3 is dropped. A copied non-expiring session would keep the library from ever exchanging it for an expiring one. On the dev store, the minutes until Yu opens the app are covered by Shopify's retries.
16. **Extension folder.** `apps/rewards/extensions/rewards-widget`. The module catalog names cards after the folder, so reusing the old folder name would collide while `apps/rewardspro` exists. Shopify matches the extension by uid, not by folder.
17. **Schedules (UTC).** Payouts `30 * * * *`, tiers `0 2 * * *`, housekeeping `0 3 * * *`.
18. **Rate limit.** The proxy rate limit is in memory, per instance, 30 a minute, keyed `shop:buyer` after verification. There is no KV store.
19. **Gate F reading.** Spec 9.1 F says "needs-a-look shown", but section 4.6 and rule 12 say a take-back shortfall is information only, with no action and no banner. F passes when the reversal payout records the shortfall and the order shows "Took back £x of £y; the buyer had spent the rest", with no needs-a-look. Yu is told this reading when the plan is handed over.
20. **Leftover paid charges are an owner step, not app code.** Spec 7 says the app cancels them on first open, but the two frozen charges sit on closed stores that will never open the app, and for an App Pricing app Shopify documents the cancel through the Partner API (`appSubscriptionCancel(appId, shopId, …)`). B4 hands this to Yu; the app has no billing code.
21. **Orders from before install never earn.** `recordOrder` refuses cashback for any order created before the connection's `installedAt`, the same boundary the import uses, whichever path sees the order first.

## Review Focus

These are the five cases most likely to hurt a real person that the spec doesn't spell out. Each has its test in the owning task.

1. **The released widget appends its own `shop` and `logged_in_customer_id`.** If Shopify forwards both copies, the new library may reject every signed-in request, and the widget breaks at the switch. Expected: identical copies are accepted, and differing copies are treated as a guest. (A16 test "repeated parameters", plus the A25 live check.)
2. **Uninstall or privacy webhooks arriving after the token expired.** Expected: 200, the connection is marked uninstalled or the data is erased, and the server never answers 500. (A14 tests "uninstall with no usable session" and "compliance topics with no usable session".)
3. **Zero- and three-decimal currencies, and a buyer paying in another currency.** Expected: JPY cashback in whole yen sent as `"62"`, KWD with three decimals, euro credit for a euro order on a GBP shop. (A3 and A8 tests.)
4. **A refund arriving while its cashback is in any state:** pending, sending, unconfirmed, needs a look, closed, already sent, or on an imported order. Expected: exactly the rule-7 and rule-12 outcome, never a double take-back. (A10 table test.)
5. **Races.** Shopify delivers `orders/paid` twice at once, the hourly job runs while the after-response send is in flight, and two refunds land together. Expected: one ledger entry, one Shopify credit, take-backs that never exceed the cashback. (A8, A9 and A10 concurrency tests.)

---

## File structure (`apps/rewards`)

```
package.json, tsconfig.json, vite.config.ts, react-router.config.ts, vercel.json, .nvmrc, .eslintrc.cjs,
.graphqlrc.ts, env.d.ts, shopify.web.toml, shopify.app.staging.toml (A25), shopify.app.toml (B1)
vitest.config.ts, vitest.postgres.config.ts
prisma/schema.prisma, prisma/migrations/20261105000000_init/migration.sql
scripts/prisma-tls.ts, scripts/lib/postgres-tls-bridge.ts, scripts/vercel-ignore-build.sh, scripts/test-db.sh
app/
  root.tsx, entry.server.tsx, routes.ts, globals.d.ts
  shopify.server.ts                shopifyApp() config and re-exports (the template's location, so its relative imports work)
  db.server.ts                     Prisma client, pinned-CA pool, databaseSchema
  db/                              database-connection.server.ts, database-tls.server.ts (carried), database-health.server.ts (probeDatabase, A15)
  lib/                             shop-neutral engine (never imports @shopify/*, react-router or ~/shopify)
    money.ts                       decimal maths, currency minor units, ISSUE_IN
    order-facts.ts                 OrderFacts/RefundFacts types, cashbackBase, refundTakeBack
    ports.ts                       PayoutRail, OrderSource, RailAnswer, RailFor
    merchant.server.ts             ensureMerchant, findConnection, setRunning, markUninstalled
    record-order.server.ts         recordOrder
    payouts.server.ts              sendPayout, nextAttemptAt, settleUnconfirmed, judgeUnconfirmed, answerNeedsLook
    refunds.server.ts              recordRefund, RefundRetryLater
    tiers.server.ts                tierSpend, qualify, progress, resolveTier, lockTier, runTierPass
    erasure.server.ts              eraseMerchant, redactCustomer, openPrivacyRequest, buildPrivacyReport
    import.server.ts               ingestImportedOrders
    payout-check.server.ts         runPayoutCheck (hourly job body)
    stats.server.ts                homeStats, orderStatus, customerRows
    cron.server.ts                 verifyCronAuth, withCronLock, monitoredCron, cronProblems, CRON_SCHEDULES (no react-router import)
    wait-until.server.ts           waitUntil (+ test flush)
    telemetry.server.ts            carried redaction for Sentry and logs
  shopify/                         Shopify adapter
    encryption.server.ts           carried byte-for-byte
    session-storage.server.ts      EncryptedPrismaSessionStorage (access + refresh token)
    graphql.ts                     GraphqlClient type, all GraphQL documents (unique names prefixed Rewards)
    store-credit-rail.server.ts    createStoreCreditRail → PayoutRail
    order-source.server.ts         createShopifyOrderSource → OrderSource
    live-balance.server.ts         liveBalance (cached, 2.5 s)
    shop-checks.server.ts          customerAccountsVersion, storeCreditSpendProblems
    webhook-hmac.server.ts         verifyShopifyWebhook (no session)
    proxy.server.ts                verifyProxyRequest, rate limit
    install.server.ts              onAppOpened (afterAuth): merchant, import
    bulk-import.server.ts          startImport, pollImport, pollRunningImports
    widget-config.server.ts        syncWidgetConfig (app metafield)
    rail-for.server.ts             railFor(connectionId) via unauthenticated.admin
    names.server.ts                customerNames (live, batched, 2.5 s)
  admin/                           shared admin UI pieces
    require-merchant.server.ts, format.ts, TierChip.tsx, Chart.tsx, admin.module.css
  routes/
    _index.tsx, auth.$.tsx, auth.login.tsx, app.tsx,
    app._index.tsx, app.customers._index.tsx, app.customers.$id.tsx, app.customers.export.tsx,
    app.tiers.tsx, app.orders._index.tsx, app.orders.$id.tsx, app.settings._index.tsx, app.settings.privacy.tsx,
    webhooks.orders.paid.tsx, webhooks.orders.refunded.tsx, webhooks.orders.cancelled.tsx,
    webhooks.app.uninstalled.tsx, webhooks.app.scopes_update.tsx, webhooks.compliance.tsx,
    webhooks.orders.create.tsx, webhooks.orders.fulfilled.tsx, webhooks.customers.create.tsx,
    webhooks.customers.update.tsx, webhooks.products.update.tsx   (ignored topics: verify and 200, until B3)
    api.proxy.$.tsx, api.cron.payouts.tsx, api.cron.tiers.tsx, api.cron.housekeeping.tsx, api.health.tsx
extensions/rewards-widget/        theme app extension (same identity as today)
docs/                             staging-run.md (A25), gates.md (B4)
test/setup.ts, test/unit/**, test/postgres/** (helpers in test/postgres/helpers/), test/fixtures/{orders,bulk}/
```

The path alias `~/*` maps to `app/*`, so `~/shopify.server` is `app/shopify.server.ts`.

---

# Part A: build `apps/rewards` (normal PRs to main; the old app is untouched)

Execution happens on branch `feat/rewards-rebuild`, in a worktree made with superpowers:using-git-worktrees from `origin/main`. Open one PR at the end of each milestone, merge it when CI is green and the review passes, then check `https://rewardspro-production.vercel.app/api/health` answers 200. A root `pnpm-lock.yaml` change redeploys the unchanged old app.
- **Milestone 1:** A1–A7, the foundation.
- **Milestone 2:** A8–A17, the money loop.
- **Milestone 3:** A18–A23, the admin.
- **Milestone 4:** A24–A25, the widget and staging.

Commands run from the worktree root. A Postgres test command assumes `scripts/test-db.sh start` (A2) printed `REWARDS_TEST_DATABASE_URL` and it is exported.

### Task A1: Scaffold the app

**Files:**
- Create `apps/rewards/{package.json, tsconfig.json, vite.config.ts, react-router.config.ts, vercel.json, .nvmrc, .eslintrc.cjs, .graphqlrc.ts, env.d.ts, shopify.web.toml, vitest.config.ts}`.
- Create `apps/rewards/app/{root.tsx, entry.server.tsx, routes.ts, globals.d.ts}`, `apps/rewards/app/routes/_index.tsx` and `apps/rewards/test/setup.ts`.
- Create `apps/rewards/scripts/vercel-ignore-build.sh` (copied from `apps/rewardspro/scripts/`).
- Tests: `apps/rewards/test/unit/config/stack.test.ts` and `apps/rewards/test/unit/scripts/vercel-ignore-build.test.ts` (carried).
- Modify: `.github/workflows/ci.yml`, root `package.json`, `docs/modules/catalog.json`.

**Interfaces:**
- Produces:
  - The package name `rewards`.
  - Scripts `dev`, `build` (`react-router build`; A2 changes it to `prisma generate && react-router build`), `typecheck` (`react-router typegen && tsc --noEmit`), `lint`, `test:unit` (`vitest run`), and `test:postgres` (`vitest run --config vitest.postgres.config.ts`, which A2 creates).
  - Root scripts `dev:rewards`, `build:rewards`, `test:rewards` and `test:rewards:postgres`.

- [ ] **Step 1: Fetch the template.**
  - Clone `https://github.com/Shopify/shopify-app-template-react-router` into a new empty scratch directory and check out `main-cli` at `53d66fb`. This is the branch Shopify CLI 5.0.1 scaffolds from.
  - Don't install or run anything inside it.
  - Copy `app/root.tsx`, `app/entry.server.tsx` (without the `addDocumentResponseHeaders` import and call; A5 puts them back), `app/routes.ts`, `app/globals.d.ts`, `tsconfig.json`, `vite.config.ts`, `env.d.ts`, `.graphqlrc.ts` and `.eslintrc.cjs`. `app/routes/auth.$.tsx` is copied in A5, because it imports `shopify.server`.
- [ ] **Step 2: Write the failing stack test** at `test/unit/config/stack.test.ts`. It reads `apps/rewards/package.json` and asserts:

```ts
expect(deps["react-router"]).toBe("7.18.2");
for (const p of ["@react-router/dev","@react-router/node","@react-router/serve","@react-router/fs-routes"]) expect(all[p]).toBe("7.18.2");
expect(deps["@shopify/shopify-app-react-router"]).toMatch(/^\^4\./);
expect(deps["@prisma/client"]).toBe("6.19.3"); expect(all["prisma"]).toBe("6.19.3");
expect(deps["react"]).toMatch(/^\^19\./);
expect(all["@shopify/polaris-types"]).toMatch(/^\^2\./);
expect(pkg.engines.node).toBe("24.x");
expect(JSON.parse(read("vercel.json"))).toMatchObject({ framework: "react-router", regions: ["lhr1"] });
expect(read("react-router.config.ts")).toContain("vercelPreset()");
expect(read("shopify.web.toml")).not.toContain("migrate deploy");
expect(read("app/root.tsx")).not.toContain("fonts/inter");
```

- [ ] **Step 3: Run it.** `pnpm --filter rewards test:unit -- test/unit/config/stack.test.ts`. Expected: FAIL, because `package.json` doesn't exist yet.
- [ ] **Step 4: Write the configs.**
  - `package.json`:
    - Dependencies at the pins in Global Constraints, plus `@shopify/app-bridge-react` ^4.2.14, `@vercel/react-router` 1.3.7, `@vercel/functions`, `@prisma/adapter-pg` 6.19.3, `pg`, `decimal.js` ^10.6.0, `isbot` ^5.1.31 and `@sentry/react-router`.
    - Dev dependencies: `vitest` 3.2.6, `msw` 2.14.6, `@testing-library/react` ^16, `jsdom`, `typescript` 5.9.3, `vite-tsconfig-paths`, `tsx` and `smol-toml` (tests parse tomls with it).
    - `engines.node` set to `24.x`.
  - `react-router.config.ts`: `export default { ssr: true, presets: [vercelPreset()] } satisfies Config` (vercelPreset from `@vercel/react-router/vite`).
  - `vercel.json`: `{ "framework": "react-router", "regions": ["lhr1"], "installCommand": "pnpm install --prod=false", "buildCommand": "pnpm run build", "ignoreCommand": "bash scripts/vercel-ignore-build.sh", "crons": [] }`.
  - `shopify.web.toml`: `predev = "pnpm exec prisma generate"`, `dev = "pnpm exec react-router dev"`, with no migrate.
  - `root.tsx`: remove the Inter stylesheet link. Polaris 2 brings its own type; A25 checks this on screen.
  - `tsconfig.json`: include `test/**`, so tests are typechecked, and set the path `~/*` to `./app/*`.
  - `vitest.config.ts`:
    - `environment: "node"`, with `environmentMatchGlobs` putting `**/*.dom.test.ts(x)` in jsdom.
    - `pool: "threads"` with `singleThread`.
    - `setupFiles: ["./test/setup.ts"]`. That file starts an MSW server with `onUnhandledRequest: "error"` and no default handlers, and sets `SHOPIFY_API_SECRET=test-api-secret`, `ENCRYPTION_SECRET=test-encryption-secret`, `ENCRYPTION_SALT=00112233445566778899aabbccddeeff` and `SHOPIFY_APP_URL=https://test.example.com`.
    - No html reporter.
  - `_index.tsx` (written fresh, with no `shopify.server` import): with `?shop=`, redirect to `/app?…`; otherwise redirect to `https://rewardspro.io`.
- [ ] **Step 5: Install and run it.** `pnpm install`, then `pnpm --filter rewards test:unit -- test/unit/config/stack.test.ts`. Expected: PASS.
- [ ] **Step 6: Carry the ignore-build test.** Point `apps/rewardspro/test/unit/scripts/vercel-ignore-build.test.ts` at `apps/rewards/scripts/vercel-ignore-build.sh` and run it. Expected: all 13 cases PASS.
- [ ] **Step 7: Wire CI and the monorepo.**
  - In `ci.yml`:
    - Add a `rewards` paths filter (`apps/rewards/**`) to the `detect` job.
    - Add a `rewards` job copied from the `rewardspro` job, with `working-directory` `apps/rewards`. Until A2, its steps are install, `prisma generate` (skipped if there is no schema yet), `typecheck` and `test:unit`.
    - Add `rewards` to the `ci-status` `needs` list and its result loop.
  - Add the root scripts.
  - Add a `docs/modules/catalog.json` entry for `apps/rewards`, copying the `apps/rewardspro` entry's shape, then run `pnpm docs:modules` and commit the regenerated module pages (otherwise `audit:modules` reports them stale).
- [ ] **Step 8: Verify the whole app.** Run `pnpm --filter rewards typecheck && pnpm --filter rewards build && pnpm audit:modules && pnpm audit:tracked-secrets`. Expected: all exit 0.
- [ ] **Step 9: Commit.** `feat(rewards): scaffold the app on Shopify's React Router template`.

### Task A2: Database schema, connection and Postgres test bed

**Files:**
- Create `apps/rewards/prisma/schema.prisma` and `prisma/migrations/20261105000000_init/migration.sql`.
- Create `apps/rewards/app/db.server.ts`, `app/db/database-connection.server.ts` and `app/db/database-tls.server.ts` (carried).
- Create `scripts/prisma-tls.ts` and `scripts/lib/postgres-tls-bridge.ts` (carried), and `scripts/test-db.sh`.
- Create `test/postgres/helpers/{env.ts, database.ts, setup-database.sql}` and `vitest.postgres.config.ts`.
- Tests: `test/postgres/baseline.postgres.test.ts`, plus the carried `test/unit/db/database-connection.test.ts` and `test/unit/scripts/postgres-tls-bridge.test.ts`.
- Modify `.github/workflows/ci.yml`: the `rewards` job gets the Postgres service and migrations.

**Interfaces:**
- Produces, from `app/db.server.ts`:
  - `export default prisma`
  - `export { prisma as db }`
  - `export function createPrismaClient(url = process.env.REWARDS_DATABASE_URL): PrismaClient`
  - `export const databaseSchema: string` (from `?schema=`; `rewards` in production)
- Produces, from `test/postgres/helpers/database.ts`:
  - `hasTestDatabase: boolean`
  - `resetDatabase(): Promise<void>`
  - `failNextCall(model, method, error)`
  - `restoreFailedCalls()`
- Produces the Prisma models below, which every later task uses by these names.

Every table is a Prisma model with `@@map` to its snake_case name. Ids are `String @id @default(uuid()) @db.Uuid`, except `Session`, which keeps the template's `id String @id` (ids look like `offline_<shop>`). Money is `Decimal @db.Decimal(19,4)`.
- Every child row carries `merchantId`, and its foreign keys are composite (`[merchantId, xId]` references `[merchantId, id]`), with `@@unique([merchantId, id])` on the parents.
- `Customer.tier` and `Customer.lockedTier` use `onDelete: Restrict`. Prisma's default SetNull would null every column of the composite key, `merchantId` included, so a tier is deleted only after its members have moved (A20).

| Model (table) | Columns besides id, created_at and updated_at |
|---|---|
| `Merchant` (`merchant`) | name, currency (ISO), timezone (IANA), running `Boolean @default(false)`, tierWindow enum `rolling_12_months`/`lifetime` (default rolling), notifyBuyers `Boolean @default(false)`, reviewPromptDismissedAt?, reviewPromptShownAt? |
| `Connection` (`connection`) | merchantId, platform enum `shopify`, externalAccountId (canonical `*.myshopify.com`, `@@unique([platform, externalAccountId])`), status enum `active`/`uninstalled`, installedAt, uninstalledAt?, importState enum `not_started`/`running`/`done`/`failed` (default not_started), importOperationId?, importCursor `Int @default(0)`, importHorizonDays `Int @default(365)`, importAttempts `Int @default(0)`, importedCount `Int @default(0)`, importError?, lastTierPassAt?, tierPassRequestedAt? |
| `Customer` (`customer`) | merchantId, connectionId, externalCustomerId? (`@@unique([connectionId, externalCustomerId])`; null after redact), tierId?, tierSince?, lockedTierId?, resolvedAt?, redactedAt? |
| `Tier` (`tier`) | merchantId, name, minSpend Decimal(19,4), cashbackPercent `Decimal @db.Decimal(5,2)`, position Int |
| `Order` (`orders`) | merchantId, connectionId, customerId, externalOrderId (`@@unique([connectionId, externalOrderId])`), name, source enum `live`/`import`, currency (buyer), totalAmount, productAmount, shopProductAmount, storeCreditUsed, shopStoreCreditUsed, giftCardUsed, cashbackBase, refundedProductAmount `@default(0)`, shopRefundedProductAmount `@default(0)`, orderedAt, paidAt, cancelledAt?, test Boolean, noCashbackReason enum? (`import`/`before_install`/`test`/`cancelled`/`off`/`no_tier`/`nothing_to_pay_on`); `@@index([customerId, orderedAt])` |
| `Refund` (`refund`) | merchantId, connectionId, orderId, externalRefundId (`@@unique([connectionId, externalRefundId])`), productAmount, shopProductAmount, refundedAt, appliedBeforeCashback `Boolean @default(false)` |
| `LedgerEntry` (`ledger_entry`) | merchantId, connectionId, customerId, orderId?, refundId?, kind enum `cashback`/`reversal`/`adjustment`, amount (signed), currency, shopAmount (signed, in merchant currency), tierName?, ratePercent `Decimal(5,2)?`, idempotencyKey (`@@unique([merchantId, idempotencyKey])`) |
| `Payout` (`payout`) | merchantId, ledgerEntryId `@unique`, customerId, rail enum `shopify_store_credit`, direction enum `credit`/`debit`, amount (positive), currency, state enum (Decision 2), lookReason enum?, attempts `Int @default(0)`, nextAttemptAt, firstFailedAt?, claimedAt?, unconfirmedAt?, sentAt?, externalTransactionId?, debitedAmount?, shortfall?, lastError?, settledBy enum `auto`/`merchant`?; `@@index([state, nextAttemptAt])` |
| `Session` (`Session`) | the template's 17 columns exactly (including refreshToken? and refreshTokenExpires?) |
| `PrivacyRequest` (`privacy_request`) | merchantId, connectionId, externalCustomerId?, shopifyRequestId?, ordersRequested `String[]`, status enum `open`/`downloaded`/`expired`, receivedAt, dueAt, expiresAt, downloadedAt? |
| `CronLock` (`cron_lock`) | jobName `@unique`, lockedAt `@default(now())`, expiresAt, instanceId?; `@@index([expiresAt])` (the carried columns; `acquiredAt` is only a field of the returned result) |
| `CronRun` (`cron_run`) | job, outcome (`@@unique([job, outcome])`), startedAt, finishedAt?, errorMessage? (500 characters at most) |

- [ ] **Step 1: Write the failing baseline test** at `test/postgres/baseline.postgres.test.ts`, using `describe.skipIf(!hasTestDatabase)`:

```ts
it("applied the init migration and nothing is rolled back", ...)              // _prisma_migrations: 1 row, finished_at not null
it("has a table in schema rewards for every Prisma model", ...)                 // Prisma.dmmf.datamodel.models → information_schema.tables
// seed one merchant, connection, customer and cashback ledger entry first: the trigger is FOR EACH ROW and never fires on an empty table
it("refuses UPDATE and DELETE on ledger_entry", async () => {
  await expect(prisma.$executeRawUnsafe(`UPDATE "${databaseSchema}".ledger_entry SET amount = 0`)).rejects.toThrow(/append-only/);
  await expect(prisma.ledgerEntry.deleteMany({})).rejects.toThrow(/append-only/);
});
it("allows DELETE on ledger_entry inside an erasure transaction", ...)          // SET LOCAL rewards.erasing = 'on'
it("refuses a ledger entry whose customer belongs to another merchant", ...)    // composite FK violation
it("grants nothing on schema rewards to PUBLIC", ...)                           // has_schema_privilege('public', schema, 'USAGE') = false
```

- [ ] **Step 2: Write `scripts/test-db.sh`.** `start` runs `initdb` into `$TMPDIR/rewards-pg`, `pg_ctl` on `127.0.0.1:55432`, applies `test/postgres/helpers/setup-database.sql` as the superuser, runs `pnpm migrate:deploy`, and exports `REWARDS_DIRECT_URL` to the same loopback URL before migrating, and prints `export REWARDS_TEST_DATABASE_URL=postgresql://rewards_app:rewards_app@127.0.0.1:55432/postgres?schema=rewards&connection_limit=1`. `stop` stops the server and deletes the directory.
- [ ] **Step 3: Run the test.** `scripts/test-db.sh start`, then `pnpm --filter rewards test:postgres -- baseline`. Expected: FAIL, because there is no schema or migration.
- [ ] **Step 4: Write the schema and migration.**
  - Write `schema.prisma` from the table above, with `datasource db { provider = "postgresql"; url = env("REWARDS_DATABASE_URL"); directUrl = env("REWARDS_DIRECT_URL") }`. Change the `build` script to `prisma generate && react-router build`.
  - Generate the SQL with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261105000000_init/migration.sql`.
  - Append the trigger by hand: a `ledger_entry_append_only()` plpgsql function that returns `NEW`/`OLD` when `current_setting('rewards.erasing', true) = 'on'` and otherwise raises `ledger_entry is append-only`, attached `BEFORE UPDATE OR DELETE ... FOR EACH ROW`.
- [ ] **Step 5: Carry the connection code.**
  - Carry `database-connection.server.ts` and `database-tls.server.ts`, changing the pool defaults to `max` 3 (unless the URL has `connection_limit`) and `idleTimeoutMillis` 5000.
  - Carry `scripts/prisma-tls.ts` and `scripts/lib/postgres-tls-bridge.ts`. `prisma-tls.ts` reads `REWARDS_DIRECT_URL`, imports from `../app/db/database-connection.server`, and passes `REWARDS_DATABASE_URL` and `REWARDS_DIRECT_URL` (not the old names) to the Prisma child process.
  - In `db.server.ts`, call `attachDatabasePool(pool)` from `@vercel/functions`.
  - Add the scripts `"migrate:deploy": "tsx scripts/prisma-tls.ts migrate deploy"` and `"migrate:drift": "tsx scripts/prisma-tls.ts migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code"`. The old app has no drift script (its check is an inline CI step), so these are new.
  - Carry the two unit tests.
- [ ] **Step 6: Write the test helpers.**
  - `setup-database.sql` creates role `rewards_app` with password `rewards_app`, schema `rewards` with that role as owner, and the role's `search_path`. It contains no `REVOKE ... FROM PUBLIC` on the public schema; that line is test-only today and must never reach production.
  - Carry `env.ts` and `database.ts` with `REWARDS_TEST_DATABASE_URL` (loopback only, required under `CI`). `failNextCall` accepts any model name.
  - `vitest.postgres.config.ts` includes `test/postgres/**/*.postgres.test.ts`, with a 30 s timeout and retry 0.
- [ ] **Step 7: Run the baseline.** `pnpm --filter rewards test:postgres -- baseline`. Expected: PASS (6 tests).
- [ ] **Step 8: Add Postgres to CI.** In the `rewards` job, add the postgres:17 service, the `setup-database.sql` step, `migrate:deploy`, `migrate:drift` and `test:postgres`, mirroring the `rewardspro` job with the new names. Run `pnpm --filter rewards typecheck`; expected exit 0.
- [ ] **Step 9: Commit.** `feat(rewards): data model, append-only ledger and Postgres test bed`.

### Task A3: Money maths and order facts

**Files:**
- Create `apps/rewards/app/lib/money.ts` and `app/lib/order-facts.ts`.
- Tests: `test/unit/lib/money.test.ts` and `test/unit/lib/order-facts.test.ts`.

**Interfaces:**
- Produces, from `money.ts`:
  - `export const Money: typeof Decimal`, a clone with `rounding: ROUND_HALF_UP` and `precision: 40`.
  - `export const ISSUE_IN: "presentment" | "shop" = "presentment"`
  - `export function currencyDecimals(code: string): number`. Uses `new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits` and throws `UnknownCurrencyError` for a code that isn't three uppercase letters.
  - `export function roundMoney(v: Decimal.Value, currency: string): Decimal` (half-up)
  - `export function floorMoney(v: Decimal.Value, currency: string): Decimal`
  - `export function cashbackFor(base: Decimal.Value, percent: Decimal.Value, currency: string): Decimal`, which is `roundMoney(base × percent / 100)`.
  - `export function toShopifyAmount(v: Decimal, currency: string): string`, the fixed string with exactly `currencyDecimals` places.
  - `export function fitsNumeric(v: Decimal, precision: number, scale: number): boolean`
- Produces, from `order-facts.ts`:
  - `export interface MoneyPair { amount: Decimal; shopAmount: Decimal }`
  - `export interface RefundFacts { externalRefundId: string; productValue: MoneyPair; refundedAt: Date }`
  - Id forms: `externalOrderId` and `externalRefundId` are Shopify GIDs (`gid://shopify/Order/1`, `gid://shopify/Refund/1`). `externalCustomerId` is the numeric id as a string, the form the app proxy's `logged_in_customer_id` uses; the rail builds `gid://shopify/Customer/<id>` from it.
  - `export interface OrderFacts { externalOrderId: string; name: string; externalCustomerId: string | null; currency: string; shopCurrency: string; test: boolean; cancelledAt: Date | null; orderedAt: Date; paidAt: Date; financialStatus: string; total: MoneyPair; productValue: MoneyPair; storeCreditUsed: MoneyPair; giftCardUsed: MoneyPair; refundedProductValue: MoneyPair; refunds: RefundFacts[] }`. `refundedProductValue` is the sum of `refunds` when the read had them, or, for a bulk import node with no refunds, the value of `quantity − currentQuantity` on each line (A7).
  - `export function cashbackBase(f: Pick<OrderFacts, "productValue"|"storeCreditUsed"|"giftCardUsed">, alreadyRefunded?: MoneyPair): MoneyPair`. The result is `max(0, productValue − alreadyRefunded − storeCreditUsed − giftCardUsed)` for each currency.
  - `export function refundTakeBack(i: { cashback: Decimal; orderProductValue: Decimal; refundProductValue: Decimal; takenSoFar: Decimal; completesOrder: boolean; currency: string }): Decimal`. A completing refund takes `cashback − takenSoFar`. Otherwise the take-back is `floorMoney(cashback × refundProductValue / orderProductValue)`, capped at `cashback − takenSoFar` and never below 0.

- [ ] **Step 1: Write the failing tests:**

```ts
expect(cashbackFor("33.30", 15, "GBP").toFixed(2)).toBe("5.00");
expect(cashbackFor("4.10", 15, "GBP").toFixed(2)).toBe("0.62");
expect(cashbackFor("16.90", 15, "GBP").toFixed(2)).toBe("2.54");
expect(cashbackFor("1234", 5, "JPY").toFixed(0)).toBe("62");
expect(cashbackFor("1.234", 10, "KWD").toFixed(3)).toBe("0.123");
expect(toShopifyAmount(new Money(62), "JPY")).toBe("62");
expect(toShopifyAmount(new Money(5), "GBP")).toBe("5.00");
expect(() => currencyDecimals("usd")).toThrow(UnknownCurrencyError);
expect(currencyDecimals("GBP")).toBe(2); expect(currencyDecimals("JPY")).toBe(0); expect(currencyDecimals("KWD")).toBe(3);
// spec example: £50 products, £5 shipping (not in productValue), £10 store credit → £40
expect(cashbackBase({ productValue: pair(50), storeCreditUsed: pair(10), giftCardUsed: pair(0) }).amount.toFixed(2)).toBe("40.00");
expect(cashbackBase({ productValue: pair(10), storeCreditUsed: pair(15), giftCardUsed: pair(0) }).amount.toFixed(2)).toBe("0.00");
expect(refundTakeBack({ cashback: d(2), orderProductValue: d(50), refundProductValue: d(20), takenSoFar: d(0), completesOrder: false, currency: "GBP" }).toFixed(2)).toBe("0.80");
expect(refundTakeBack({ cashback: d(2), orderProductValue: d(50), refundProductValue: d(30), takenSoFar: d("0.80"), completesOrder: true, currency: "GBP" }).toFixed(2)).toBe("1.20");
expect(refundTakeBack({ cashback: d(1), orderProductValue: d(50), refundProductValue: d(0), takenSoFar: d(0), completesOrder: false, currency: "GBP" }).toFixed(2)).toBe("0.00"); // shipping-only
```

- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- test/unit/lib`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3: Implement both files** with the signatures above.
- [ ] **Step 4: Check the issue currency.** Read help.shopify.com on store credit and currencies: does credit apply only at a checkout in its own currency, or does Shopify convert it? Leave `ISSUE_IN` as `"presentment"` unless the page says Shopify converts. Put the URL and the sentence you relied on in a comment above the constant.
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(rewards): exact money maths and the cashback base`.

### Task A4: Merchants and connections

**Files:**
- Create `apps/rewards/app/lib/merchant.server.ts`.
- Test: `test/postgres/merchant.postgres.test.ts`.

**Interfaces:**
- Consumes the `Merchant`, `Connection` and `Tier` models from A2.
- Produces:
  - `export interface ConnectionContext { connectionId: string; merchantId: string; shop: string; running: boolean; currency: string; timezone: string; notifyBuyers: boolean; tierWindow: "rolling_12_months" | "lifetime"; installedAt: Date }`
  - `export async function ensureMerchant(i: { shop: string; name: string; currency: string; timezone: string; now?: Date }): Promise<{ merchantId: string; connectionId: string; created: boolean; reactivated: boolean }>`
  - `export async function findConnection(shop: string): Promise<ConnectionContext | null>` (active connections only)
  - `export async function setRunning(merchantId: string, running: boolean): Promise<{ ok: true } | { ok: false; reason: "no_tiers" }>`
  - `export async function markUninstalled(shop: string, now?: Date): Promise<boolean>`

- [ ] **Step 1: Write the failing tests:**
  - `ensureMerchant` creates one merchant and connection. A second call updates the name, currency and timezone and returns `created: false`.
  - After `markUninstalled`, `findConnection` returns null, and `ensureMerchant` then returns `reactivated: true`.
  - A shop that isn't `*.myshopify.com` throws.
  - `setRunning(m, true)` with no tiers returns `{ ok: false, reason: "no_tiers" }`.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- merchant`. Expected: FAIL.
- [ ] **Step 3: Implement `merchant.server.ts`.** `ensureMerchant` is one transaction that upserts by `(platform, externalAccountId)`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): merchants and store connections`.

### Task A5: Sessions and the Shopify app config

**Files:**
- Create `apps/rewards/app/shopify/encryption.server.ts` (carried byte-for-byte from `app/utils/encryption.ts`).
- Create `app/shopify/session-storage.server.ts`, `app/shopify.server.ts`, `app/shopify/install.server.ts` (the first version) and `app/shopify/graphql.ts` (the `GraphqlClient` type and `RewardsShopDetails`; A6 and later tasks add documents).
- Create `app/routes/auth.$.tsx` (the template's) and `app/routes/auth.login.tsx` (its loader redirects to `https://apps.shopify.com/rewards-pro` outside development, carried from `apps/rewardspro/app/routes/auth.login/route.tsx`).
- Modify `app/entry.server.tsx`: put back `addDocumentResponseHeaders(request, responseHeaders)`.
- Tests: `test/postgres/session-storage.postgres.test.ts` (carried and extended) and `test/unit/shopify/encryption.test.ts`.

**Interfaces:**
- Consumes `ensureMerchant` (A4).
- Produces, from `~/shopify.server`: `default shopify`, `apiVersion`, `authenticate`, `unauthenticated`, `login`, `sessionStorage` and `addDocumentResponseHeaders`.
- Produces `export async function onAppOpened({ session, admin }: { session: Session; admin: AdminApiContext }): Promise<void>`, wired as `hooks.afterAuth`. It must be idempotent and cheap, because it runs on every token exchange, which is about hourly with expiring tokens.

- [ ] **Step 1: Write the failing tests:**
  - Carry the six existing session-storage cases.
  - Add: `refreshToken` is stored encrypted and loaded decrypted; `refreshTokenExpires` round-trips; a refresh token under another key reads as a missing session.
  - Unit test: encrypting with the test secret and salt, then decrypting with `apps/rewardspro`'s algorithm constants (aes-256-gcm, salt 64, iv 16, tag 16, PBKDF2 100000 rounds), gives the input back.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- session-storage`. Expected: FAIL.
- [ ] **Step 3: Implement the session storage.** Carry `EncryptedPrismaSessionStorage`. In `storeSession`, encrypt both `accessToken` and `refreshToken` (when present) on a `new Session(session.toObject())` copy before `super.storeSession`. Decrypt both on load. A token that won't decrypt means the session is missing.
- [ ] **Step 4: Implement `app/shopify.server.ts`.**
  - Settings: `shopifyApp({ apiKey: SHOPIFY_API_KEY, apiSecretKey: SHOPIFY_API_SECRET, apiVersion: ApiVersion.October26, scopes: SCOPES.split(","), appUrl: SHOPIFY_APP_URL, authPathPrefix: "/auth", sessionStorage: new EncryptedPrismaSessionStorage(prisma), distribution: AppDistribution.AppStore, future: { expiringOfflineAccessTokens: true }, polarisUrl, hooks: { afterAuth: onAppOpened } })`.
  - `customShopDomains` comes from `SHOP_CUSTOM_DOMAIN` as today.
  - The first version of `onAppOpened` runs `query RewardsShopDetails { shop { name currencyCode ianaTimezone } }`, then calls `ensureMerchant`.
- [ ] **Step 5: Run the tests.** Expected: PASS. Also run `pnpm --filter rewards typecheck`; expected exit 0.
- [ ] **Step 6: Commit.** `feat(rewards): encrypted expiring offline sessions and app config`.

### Task A6: The Shopify payout rail

**Files:**
- Create `apps/rewards/app/lib/ports.ts`, `app/shopify/graphql.ts`, `app/shopify/store-credit-rail.server.ts` and `app/shopify/live-balance.server.ts`.
- Tests: `test/unit/shopify/store-credit-answers.test.ts` (carried), `test/unit/shopify/credit-history.test.ts` (carried from the readStoreCreditHistory cases) and `test/unit/shopify/live-balance.test.ts` (carried).

**Interfaces:**
- Produces, from `ports.ts`:
  - `export type RailAnswer = { outcome: "applied"; transactionId: string | null } | { outcome: "refused"; permanent: boolean; code: string | null; message: string } | { outcome: "unclear"; message: string }`
  - `export interface CreditRecord { id: string | null; amount: Decimal; currency: string; createdAt: Date }`
  - `export type CreditHistoryResult = { status: "found"; credits: CreditRecord[]; complete: boolean } | { status: "customer_missing" } | { status: "failed"; error: string }`
  - `export interface PayoutRail { credit(i: { externalCustomerId: string; amount: Decimal; currency: string; notify: boolean }): Promise<RailAnswer>; debit(i: { externalCustomerId: string; amount: Decimal; currency: string }): Promise<RailAnswer>; balance(externalCustomerId: string, currency: string): Promise<Decimal | null>; creditHistory(externalCustomerId: string, since: Date): Promise<CreditHistoryResult> }`
  - `export interface OrderSource { readOrder(orderGid: string): Promise<OrderFacts | null>; readRefund(refundGid: string): Promise<{ orderGid: string; refund: RefundFacts } | null>; recentPaidOrders(since: Date): Promise<Array<{ orderGid: string; hasCustomer: boolean; test: boolean; orderedAt: Date }>> }`
  - `export type RailFor = (connectionId: string) => Promise<{ rail: PayoutRail; orders: OrderSource } | null>`
- Uses `GraphqlClient` from `graphql.ts` (A5): `export interface GraphqlClient { graphql(query: string, options?: { variables?: Record<string, unknown>; signal?: AbortSignal }): Promise<{ json(): Promise<unknown> }> }`.
- Adds the documents `RewardsCredit`, `RewardsDebit`, `RewardsBalance` and `RewardsCreditHistory` to `graphql.ts`.
- Produces `export function createStoreCreditRail(admin: GraphqlClient): PayoutRail`
- Produces `export async function liveBalance(shop: string, externalCustomerId: string, currency: string, admin: GraphqlClient | undefined): Promise<Decimal | null>`

- [ ] **Step 1: Carry the answer table.** Bring the 20-row thrown-answer table from `apps/rewardspro/test/unit/services/store-credit-answers.test.ts` (lines 32-53), now asserting `RailAnswer` outcomes. A row that "may have applied" becomes `unclear`; a row that "did not" becomes `refused`. Add these cases:

```ts
it.each(["ACCOUNT_NOT_FOUND","CREDIT_LIMIT_EXCEEDED","EXPIRES_AT_IN_PAST","MISMATCHING_CURRENCY","NEGATIVE_OR_ZERO_AMOUNT","OWNER_NOT_FOUND","UNSUPPORTED_CURRENCY"])
  ("a credit refused with %s is permanent", code => expect(answerFor(code)).toMatchObject({ outcome: "refused", permanent: true, code }));
it("a debit refused with INSUFFICIENT_FUNDS is not permanent", ...);
it("THROTTLED before running is a refusal that is not permanent", ...);
it("sends notify and the amount in the currency's minor unit", ...);       // JPY "62", creditInput.notify === true
it("handles both thrown shapes: a Response (webhook admin) and raw HttpResponseError/GraphqlQueryError (unauthenticated admin)", ...);
```

- [ ] **Step 2: Carry the history and balance cases.** History: the three cases for incomplete pages and a missing customer. Live balance: the 2500 ms timeout, the 30 s cache and the 10 s back-off, with the account picked by the currency argument instead of the shop currency.
- [ ] **Step 3: Run them.** `pnpm --filter rewards test:unit -- test/unit/shopify`. Expected: FAIL.
- [ ] **Step 4: Implement the rail.**
  - Carry `REFUSED_BEFORE_RUNNING`, `REFUSED_USER_ERRORS`, `codeOf`, `graphqlErrorsMayHaveApplied`, `mayHaveBeenApplied` and the body of `sendStoreCreditMutation` from `shopify-store-credit.service.ts` into `createStoreCreditRail`.
  - Credit and debit target `gid://shopify/Customer/<id>` with `{ creditAmount: { amount: toShopifyAmount(...), currencyCode }, notify }` or `{ debitAmount: … }`.
  - Keep the old app's selection set (transaction `id`, `amount` and `balanceAfterTransaction`, plus `userErrors { code field message }`); it is proven in production.
  - Calls are never retried (`tries` unset).
  - Carry `readStoreCreditHistory` as `creditHistory`, with `storeCreditAccounts(first: 10)` and `transactions(first: 25, reverse: true, query: "type:credit")`. The old page of 50 costs more than 1,000 points. Keep the `hasNextPage` handling, so a short page gives `complete: false` and the judge's "unknown".
  - `balance` reads `RewardsBalance` uncached, with the 2500 ms timeout.
  - Wrap every call in `Promise.race` with a timer, in case the abort signal isn't honoured.
- [ ] **Step 5: Validate the documents** as Global Constraints says: VALID, scopes and cost written above each, cost at most 1,000.
- [ ] **Step 6: Run the tests.** Expected: PASS.
- [ ] **Step 7: Commit.** `feat(rewards): Shopify store credit rail with its may-have-applied rules`.

### Task A7: The Shopify order source

**Files:**
- Create `apps/rewards/app/shopify/order-source.server.ts`, and add `RewardsOrderFacts`, `RewardsRefundFacts` and `RewardsRecentPaidOrders` to `graphql.ts`.
- Test fixtures: `test/fixtures/orders/*.json`.
- Test: `test/unit/shopify/order-source.test.ts`.

**Interfaces:**
- Consumes `OrderFacts` and `RefundFacts` (A3), and `OrderSource` and `GraphqlClient` (A6).
- Produces `export function createShopifyOrderSource(admin: GraphqlClient): OrderSource`
- Produces `export function factsFromOrderNode(node: unknown, shopCurrency: string, refunds: RefundFacts[]): OrderFacts`, which is pure and is reused by the import (A17). The live path passes the query's `shop.currencyCode`; the import passes `conn.currency` and no refunds.

The reads are split so each query stays under Shopify's 1,000-point limit; one query with everything costs far more and is refused with MAX_COST_EXCEEDED.

`RewardsOrderFacts($id, $after)` (about 910 points) selects:
- On the order: `id name test createdAt processedAt cancelledAt displayFinancialStatus currencyCode presentmentCurrencyCode customer { id }`.
- `lineItems(first: 100, after: $after)` with `pageInfo`, and on each node `id quantity currentQuantity isGiftCard originalTotalSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } } discountAllocations { allocatedAmountSet { shopMoney { amount } presentmentMoney { amount } } }`.
- `transactions(first: 20) { gateway status kind amountSet { shopMoney { amount } presentmentMoney { amount } } }`.
- `refunds(first: 20) { id }`.
- `totalPriceSet { shopMoney { amount } presentmentMoney { amount } }`.
- `shop { currencyCode }` at the top level.

`RewardsRefundFacts($id)` (about 370 points) selects `refund(id: $id) { id createdAt order { id } refundLineItems(first: 100) { pageInfo nodes { quantity lineItem { id } } } transactions(first: 20) { nodes { kind status amountSet { shopMoney { amount } presentmentMoney { amount } } } } refundShippingLines(first: 20) { nodes { subtotalAmountSet { shopMoney { amount } presentmentMoney { amount } } } } }`.

`readOrder` reads every line page, then calls `RewardsRefundFacts` once per refund id, and builds the facts. `readRefund` reads the refund, then the order's line pages, so refunded lines can be valued.

If the validator rejects a field (for example `refundShippingLines`), search the 2026-10 docs for the replacement and use it. The rules don't change.

The rules, in exact decimals:
- **Line product value:** `originalTotal − Σ discountAllocations`, in both currencies. Gift-card lines are excluded.
- **`productValue`:** the sum of line product values.
- **Store credit and gift cards used:** transactions with status SUCCESS and kind SALE or CAPTURE. A gateway containing `gift_card` counts as gift cards. A gateway containing `store_credit`, `cashback` or `rewards` counts as store credit.
- **Refund product value:**
  - With refund line items: `Σ qty × (line product value / line quantity)`.
  - With no items: successful REFUND transactions minus `refundShippingLines` subtotals, capped at the product value not yet refunded and never below 0.
  - Round down to the currency's minor unit.
- **`paidAt`:** `processedAt`.
- **`orderedAt`:** `createdAt`.
- **More than 100 lines:** page `lineItems` by cursor, at most 25 pages, then throw.
- **`refundedProductValue`:** the sum of the refunds' product values; for a bulk node with no refunds, `Σ (quantity − currentQuantity) × (line product value / quantity)`, rounded down.

- [ ] **Step 1: Write fixtures and failing tests** for:
  - a plain order;
  - a line discount plus an order-level discount allocated across lines;
  - a tax-inclusive GBP shop and a tax-exclusive USD shop;
  - a gift-card line;
  - a store credit tender;
  - a gift card tender;
  - EUR presentment on a GBP shop;
  - JPY;
  - a refund with items;
  - a shipping-only refund (product value 0);
  - a money-only refund;
  - a test order;
  - a bulk-shaped node (no refunds, `currentQuantity` lower than `quantity`).

  Each asserts the `OrderFacts` fields, for example:

```ts
expect(f.productValue.amount.toFixed(2)).toBe("50.00");          // shipping £5 not included
expect(f.storeCreditUsed.amount.toFixed(2)).toBe("10.00");
expect(f.currency).toBe("EUR"); expect(f.shopCurrency).toBe("GBP");
expect(f.refunds[0].productValue.amount.toFixed(2)).toBe("0.00");  // shipping-only
```

- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- order-source`. Expected: FAIL.
- [ ] **Step 3: Implement it.** `factsFromOrderNode`, then `createShopifyOrderSource`. `recentPaidOrders(since)` pages `orders(first: 50, query: "created_at:>='<iso>' AND (financial_status:paid OR financial_status:partially_refunded)", sortKey: CREATED_AT)`, at most 10 pages.
- [ ] **Step 4: Validate the three documents** as Global Constraints says, writing each one's cost.
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(rewards): order facts read from Shopify line items and tenders`.

**Milestone 1 PR:** push the branch and open PR "RewardsPro rebuild 1/4: foundation". Merge when CI is green and a reviewer has passed it, then check `/api/health`.

### Task A8: Record an order

**Files:**
- Create `apps/rewards/app/lib/record-order.server.ts`.
- Test: `test/postgres/record-order.postgres.test.ts`.

**Interfaces:**
- Consumes `OrderFacts`, `cashbackBase` and `cashbackFor` (A3); `ISSUE_IN` (A3); and `ConnectionContext` (A4).
- Produces:
  - `export type NoCashbackReason = "import" | "before_install" | "test" | "cancelled" | "off" | "no_tier" | "nothing_to_pay_on"`
  - `export type RecordOrderResult = { status: "no_customer" } | { status: "already_recorded"; orderId: string; customerId: string } | { status: "recorded"; orderId: string; customerId: string; payoutId: string | null; noCashback: NoCashbackReason | null }`
  - `export async function recordOrder(conn: ConnectionContext, facts: OrderFacts, source: "live" | "import", db?: PrismaClient): Promise<RecordOrderResult>`

The order is recorded in one transaction:
1. Insert the order with `ON CONFLICT (connection_id, external_order_id) DO NOTHING`. If the order exists, return `already_recorded`.
2. Upsert the customer. A new customer, or one with no tier, gets the lowest tier with `tierSince` set to now. This is rule 2: the order earns at the tier held before its own spend counts.
3. Choose the reason there is no cashback, checking in this order: import; before install (`facts.orderedAt < conn.installedAt`, the boundary the import uses); test; cancelled; off; no tiers; then a base or cashback of 0. Store it in `Order.noCashbackReason`.
4. Otherwise compute the cashback:
   - Base: `cashbackBase(facts, Σ facts.refunds)`.
   - Rate: the locked tier if there is one, else the stored tier.
   - Amount: `cashbackFor(base in ISSUE_IN currency)`, with the shop amount computed the same way.
5. Write the ledger entry: `{ kind: "cashback", idempotencyKey: "cashback:" + order.id, tierName, ratePercent }`.
6. Write the payout: `{ direction: "credit", state: "pending", nextAttemptAt: now }`.
7. Write `facts.refunds` as `Refund` rows with `appliedBeforeCashback: true`.

The order's money columns come from `facts`, including `refundedProductAmount` and `shopRefundedProductAmount` from `facts.refundedProductValue`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("records the order and 5% of the base as one pending credit", ...);
it("a second delivery is already_recorded and writes nothing", ...);
it("two deliveries at once write one order and one ledger entry", async () => {   // Review Focus 5
  const second = createPrismaClient(process.env.REWARDS_DATABASE_URL);
  const [a, b] = await Promise.all([recordOrder(conn, facts, "live"), recordOrder(conn, facts, "live", second)]);
  expect([a.status, b.status].sort()).toEqual(["already_recorded", "recorded"]);
  expect(await prisma.ledgerEntry.count()).toBe(1);
});
it("off: the order counts for spend but earns nothing", ...);                      // noCashback "off", no ledger row
it("test orders earn nothing", ...);
it("a new buyer earns at the lowest tier even when this order alone reaches a higher tier", ...);
it("a locked tier's rate wins", ...);
it("JPY order: cashback in whole yen", ...);                                       // Review Focus 3
it("EUR order on a GBP shop: credit is in EUR, shopAmount in GBP", ...);           // Review Focus 3
it("a late order with a refund already in Shopify earns on what is left", ...);    // Decision 6
it("a guest order is not recorded", ...);
it("an order created before install earns nothing even with cashback on", ...);  // Decision 21
```

- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- record-order`. Expected: FAIL.
- [ ] **Step 3: Implement `recordOrder`.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): record paid orders and the cashback they earn`.

### Task A9: Send a payout

**Files:**
- Create `apps/rewards/app/lib/payouts.server.ts` (the sending part).
- Create `test/postgres/helpers/shopify.ts`, carried from `apps/rewardspro/test/integration/postgres/shopify.ts`: `signedWebhook(topic, shop, payload, webhookId?, apiVersion = "2026-01")` (2026-01 is the released subscription version); `mockStoreCredit(shop, balances, options & { currency?: string })` answering `RewardsCredit`, `RewardsDebit`, `RewardsBalance` and `RewardsCreditHistory` by operation name and returning its calls array; `backdateClaim(payoutId, minutes, history?)` shifting `payout.claimed_at` and `unconfirmed_at`; `seedOfflineSession`; `signedProxyRequest`.
- Tests: `test/unit/lib/backoff.test.ts`, `test/postgres/send-payout.postgres.test.ts` and `test/postgres/store-credit-answers.postgres.test.ts` (carried and adapted).

**Interfaces:**
- Consumes `PayoutRail` and `RailAnswer` (A6).
- Produces:
  - `export const CLAIM_FINISHED_MS = 30 * 60 * 1000`
  - `export const KEEP_TRYING_MS = 24 * 60 * 60 * 1000`
  - `export function nextAttemptAt(attempts: number, from: Date): Date`
  - `export type SendOutcome = "sent" | "pending" | "unconfirmed" | "needs_look" | "skipped"`
  - `export async function sendPayout(payoutId: string, rail: PayoutRail, now?: Date): Promise<SendOutcome>`

How `sendPayout` works:
- **Claim.** `UPDATE payout SET state='sending', claimed_at=now, attempts=attempts+1 WHERE id=$1 AND state='pending' AND next_attempt_at <= now RETURNING …`. If no row is claimed, return `skipped`.
- **Credit.** Call `rail.credit` with the merchant's `notifyBuyers`.
- **Debit.**
  - Read `rail.balance` in the payout currency. If the balance is null, the attempt counts as transient.
  - The amount to take is `min(amount, balance)`.
  - If that is 0, mark the payout `sent` with `debitedAmount` 0 and `shortfall` equal to the amount.
  - Otherwise call `rail.debit(take)`.
- **Answers:**
  - Applied: `sent`, with `sentAt`, `externalTransactionId` and, for a debit, `debitedAmount` and `shortfall`.
  - Unclear credit: `unconfirmed`, with `unconfirmedAt`.
  - Unclear debit: `needs_look` with reason `could_not_confirm`.
  - Permanent refusal: `needs_look` with reason `refused`, and `lastError` set to the code.
  - Transient: back to `pending`, with `nextAttemptAt(attempts, now)` and `firstFailedAt` set to now if it was null.
- **Giving up.** If `firstFailedAt` is 24 h or more before now, the payout becomes `needs_look` with reason `kept_failing`.

- [ ] **Step 1: Write the failing tests:**

```ts
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);  // local helper, no date library
expect(nextAttemptAt(1, t0)).toEqual(addHours(t0, 1)); expect(nextAttemptAt(2, t0)).toEqual(addHours(t0, 2));
expect(nextAttemptAt(4, t0)).toEqual(addHours(t0, 8)); expect(nextAttemptAt(9, t0)).toEqual(addHours(t0, 8));
it("applied → sent with the transaction id", ...);
it("two sendPayout calls at once make one rail.credit call", ...);                         // Review Focus 5
it("an unclear credit is unconfirmed and a later sendPayout does not resend it", ...);
it("OWNER_NOT_FOUND → needs_look refused at once", ...);
it("THROTTLED → pending at +1 h; after 24 h of failures → needs_look kept_failing", ...);
it("a debit is capped at the live balance and records the shortfall", ...);
it("passes notify=true when the merchant turned buyer emails on", ...);
```

  Carry `store-credit-answers.integration.test.ts`. Shopify applies the credit but answers 200 with INTERNAL_SERVER_ERROR, or 502. The test then asserts exactly one MSW credit request across `sendPayout` plus a second attempt.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- backoff && pnpm --filter rewards test:postgres -- send-payout store-credit-answers`. Expected: FAIL.
- [ ] **Step 3: Implement `nextAttemptAt` and `sendPayout`.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): claim-then-send payouts with backoff and needs-a-look`.

### Task A10: Record a refund

**Files:**
- Create `apps/rewards/app/lib/refunds.server.ts`.
- Test: `test/postgres/refunds.postgres.test.ts` (adapted from the `refunds` and `refund-before-cashback` suites).

**Interfaces:**
- Consumes `refundTakeBack` (A3), `CLAIM_FINISHED_MS` (A9) and `RefundFacts` (A3).
- Produces:
  - `export class RefundRetryLater extends Error {}`
  - `export const ORDER_RECORDING_WINDOW_MS = 4 * 60 * 60 * 1000`, Shopify's retry window (rule 8)
  - `export type RecordRefundResult = { status: "order_not_recorded" } | { status: "already_recorded" } | { status: "recorded"; takenBack: Decimal; reversalPayoutId: string | null; customerId: string }`
  - `export async function recordRefund(conn: ConnectionContext, externalOrderId: string, refund: RefundFacts, db?: PrismaClient, now?: Date): Promise<RecordRefundResult>`

The refund is recorded in one transaction. Lock the order's cashback payout row first, then the order row, as the old app's lock-order rule does.
1. Insert the `Refund` row. If it already exists, return `already_recorded`.
2. Add to `refundedProductAmount` and `shopRefundedProductAmount`.
3. If the order has no cashback entry (off, test, import or nothing earned), stop here.
4. Otherwise compute the take-back with `refundTakeBack`. "Taken so far" is the sum of earlier reversal entries. The refund completes the order when refunded product value reaches the product value.
5. Then act on the cashback payout's state:

| Credit payout state | Effect |
|---|---|
| `pending`, or `needs_look` with reason `refused` or `kept_failing` | reversal entry (−share); the credit's `amount` is reduced by the share; a reversal payout with state `nothing_to_send`; the credit becomes `nothing_to_send` if its amount reaches 0 |
| `sending` with `claimedAt` less than 30 min ago | throw `RefundRetryLater`, so the route answers 503 |
| `sending` with the claim finished, `unconfirmed`, or `needs_look` with reason `could_not_confirm` | reversal entry, plus a reversal payout (debit) with state `held` |
| `sent` | reversal entry, plus a reversal payout (debit) with state `pending` |
| `closed` or `nothing_to_send` | no reversal; spend only |

- [ ] **Step 1: Write the failing tests.** Each row of the table above is one case (Review Focus 4). Also:

```ts
it("a partial refund takes its share, rounded down; the refund that completes the order takes the rest", ...);
it("a shipping-only refund takes nothing back and leaves spend unchanged", ...);
it("the same refund delivered twice is recorded once", ...);
it("two different refunds at once on two clients never take back more than the cashback", ...);   // Review Focus 5
it("a refund of an imported order lowers spend and writes no ledger entry", ...);
it("an unrecorded order returns order_not_recorded", ...);
```

- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- refunds`. Expected: FAIL.
- [ ] **Step 3: Implement `recordRefund`.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): refunds take cashback back by product value`.

### Task A11: Settle unclear payouts and the merchant's answers

**Files:**
- Modify `apps/rewards/app/lib/payouts.server.ts`.
- Tests: `test/unit/lib/judge.test.ts` (carried from `stuck-cashback.test.ts`'s 9 judge cases at lines 37-77; the 3-case block for untimed claims at lines 79-100 is dropped, because every new claim has `claimedAt`) and `test/postgres/settle.postgres.test.ts`.

**Interfaces:**
- Consumes `CreditHistoryResult` (A6).
- Produces:
  - `export const CLOCK_SLACK_MS = 5 * 60 * 1000`
  - `export const SEND_WINDOW_MS = 15 * 60 * 1000`
  - `export type Verdict = { outcome: "landed"; credit: CreditRecord } | { outcome: "not_landed" } | { outcome: "unknown"; reason: string }`
  - `export function judgeUnconfirmed(i: { amount: Decimal; currency: string; claimedAt: Date; unconfirmedAt: Date | null; credits: CreditRecord[]; complete: boolean; ownCreditTimes: Date[] }): Verdict`
  - `export async function settleUnconfirmed(payoutId: string, rail: PayoutRail, now?: Date): Promise<"sent" | "returned" | "needs_look" | "waiting">`
  - `export type MerchantAnswer = "retry" | "close" | "arrived" | "not_arrived"`
  - `export async function answerNeedsLook(merchantId: string, payoutId: string, answer: MerchantAnswer, now?: Date): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_waiting_for_this_answer" }>`

The judge carries the logic of `judgeStuckCashback` and `sendWindow`. It reads columns instead of metadata and matches the payout's currency instead of the shop currency.

`settleUnconfirmed` is due when the payout is `sending` or `unconfirmed` and the claim started at least `CLAIM_FINISHED_MS` ago. The claim start is the later of `claimedAt` and `unconfirmedAt`. The judge runs only for credits. A debit still `sending` after its claim finished becomes `needs_look` with reason `could_not_confirm` and is never sent again on its own. For credits, the verdicts:
- **Landed:** `sent`, and its `held` reversal payouts become `pending`.
- **Not landed:** back to `pending`. Its amount is reduced by the held reversals, which become `nothing_to_send`, and it becomes `nothing_to_send` itself if its amount reaches 0.
- **Unknown:** `needs_look` with reason `could_not_confirm`.
- **Customer missing:** `needs_look` with reason `refused` and `lastError` "The customer no longer exists in Shopify".
- **Failed read:** keep waiting, and after 24 h from the claim start become `needs_look` with reason `could_not_confirm`.

`answerNeedsLook` (rule 12):

| Answer | Allowed when | Effect |
|---|---|---|
| `retry` | `needs_look` with reason `refused` or `kept_failing` | `pending`; `nextAttemptAt` now; `firstFailedAt` cleared |
| `close` | the same | `closed`; `settledBy` `merchant`; an adjustment entry cancelling what is left of the entry (its amount plus earlier reversals, in both currencies; for a credit this equals the payout's current amount), with key `close:<payoutId>` |
| `arrived` | `needs_look` with reason `could_not_confirm` | `sent`; `settledBy` `merchant`; held reversals become `pending` |
| `not_arrived` | the same | as settle's "not landed": the credit's amount is reduced by its held reversals, which become `nothing_to_send`; the credit becomes `nothing_to_send` if it reaches 0, otherwise `pending` with `nextAttemptAt` now |

- [ ] **Step 1: Write the failing tests.**
  - The 9 carried judge cases.
  - A refund while `could_not_confirm`, then "It didn't arrive": the credit is sent minus the refunded share, and no reversal stays held.
  - A refused credit, a partial refund, then Close: the order's ledger nets to 0.00.
  - A debit stuck in `sending` becomes needs a look, with no second `rail.debit` call.
  - On Postgres: landed releases a held reversal, which a following `sendPayout` debits.
  - Not landed nets the held reversal.
  - Unknown becomes needs a look.
  - Each merchant answer, as in the table.
  - Another merchant's payout id gives `not_found`.
  - A second `close` gives `not_waiting_for_this_answer`.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- judge && pnpm --filter rewards test:postgres -- settle`. Expected: FAIL.
- [ ] **Step 3: Implement the judge, `settleUnconfirmed` and `answerNeedsLook`.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): settle unclear payouts and the merchant's two answers`.

### Task A12: Tiers

**Files:**
- Create `apps/rewards/app/lib/tiers.server.ts`.
- Tests: `test/unit/lib/tiers.test.ts` and `test/postgres/tiers.postgres.test.ts` (adapted from `tier-recalculation.integration.test.ts`).

**Interfaces:**
- Produces:
  - `export type TierRow = { id: string; name: string; minSpend: Decimal; cashbackPercent: Decimal; position: number }`
  - `export function windowStart(window: "rolling_12_months" | "lifetime", now: Date): Date | null` (rolling means the same instant one calendar year earlier)
  - `export async function tierSpend(customerId: string, window: ..., now: Date, db?): Promise<Decimal>`
  - `export function qualify(spend: Decimal, tiers: TierRow[]): TierRow`
  - `export interface Progress { percent: number; nextTierName: string | null; nextTierPercent: Decimal | null; nextTierMin: Decimal | null; amountRemaining: Decimal; isTop: boolean }`
  - `export function progress(spend: Decimal, currentTierId: string, tiers: TierRow[]): Progress`
  - `export async function resolveTier(customerId: string, o?: { now?: Date; tx?: Prisma.TransactionClient; excludeTierId?: string }): Promise<{ changed: boolean; tierId: string }>` (`excludeTierId` lets a tier delete move members off that tier inside its own transaction)
  - `export async function lockTier(merchantId: string, customerId: string, tierId: string | null): Promise<{ ok: boolean }>`
  - `export async function runTierPass(connectionId: string, o: { deadline: number; resolvedBefore: Date }): Promise<{ processed: number; remaining: number; changed: number; errors: number; complete: boolean; firstError?: unknown }>`

The rules:
- **Spend** is `prisma.order.aggregate({ _sum: { shopProductAmount: true, shopRefundedProductAmount: true }, where: { customerId, test: false, cancelledAt: null, orderedAt: { gte: windowStart } } })`, the two sums subtracted in Decimal and floored at 0.
- **Qualify** picks the highest `minSpend` at or below the spend.
- **Progress** is floored and capped at 99 below the top tier, and is 100 at the top.
- **`resolveTier`** reads first and throws on any read error, writing nothing. The target is the locked tier, else `qualify`. If the target equals the stored tier, it only stamps `resolvedAt`. Otherwise it writes `tierId`, `tierSince` and `resolvedAt`. It is the only writer of `tierId` after creation.
- **`lockTier`** sets `lockedTierId` (null means "Return to automatic"), then calls `resolveTier`. Locking a buyer to their current tier is allowed.
- **`runTierPass`** carries `recalculateTiersForAllCustomers`'s ordering: never-resolved customers first, then those with `resolvedAt < resolvedBefore`, oldest first. It checks the deadline before each customer and counts errors.

- [ ] **Step 1: Write the failing tests.**
  - Unit: `qualify` and `progress` with a 99% cap, the top tier and exact decimals.
  - Postgres:
    - The 12-month window against lifetime.
    - Refunds lower spend.
    - Test and cancelled orders don't count.
    - A failed read keeps the tier, using `failNextCall("order", "aggregate", …)` and the carried `it.each`.
    - The pass resumes across two runs with a deadline.
    - A lock beats spend, and Return to automatic re-resolves.
    - The progress spend equals `tierSpend`.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- tiers && pnpm --filter rewards test:postgres -- tiers`. Expected: FAIL.
- [ ] **Step 3: Implement `tiers.server.ts`.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): one tier resolver over product-value spend`.

### Task A13: Order webhooks

**Files:**
- Create `apps/rewards/app/lib/wait-until.server.ts` (carried, plus `flushWaitUntil()` for tests).
- Create `app/routes/webhooks.orders.paid.tsx`, `webhooks.orders.refunded.tsx`, `webhooks.orders.cancelled.tsx` and `webhooks.app.scopes_update.tsx` (the template's).
- Create the ignored-topic routes `webhooks.orders.create.tsx`, `webhooks.orders.fulfilled.tsx`, `webhooks.customers.create.tsx`, `webhooks.customers.update.tsx` and `webhooks.products.update.tsx`. Each verifies through `authenticate.webhook` and answers 200.
- Modify `test/postgres/helpers/shopify.ts` (A9): add a `RewardsOrderFacts` and `RewardsRefundFacts` mock.
- Tests: `test/postgres/order-webhooks.postgres.test.ts`, adapted from `apps/rewardspro/test/integration/postgres/orders-paid.integration.test.ts` and keeping its decimal, currency, guest and lost-answer cases, now with `signedWebhook` instead of a mocked `authenticate.webhook`; and `test/unit/routes/released-uris.test.ts`.

**Interfaces:**
- Consumes `findConnection` (A4), `createShopifyOrderSource` (A7), `recordOrder` (A8), `sendPayout` (A9), `recordRefund` and `RefundRetryLater` (A10), `resolveTier` (A12) and `createStoreCreditRail` (A6).
- Produces `export function waitUntil(p: Promise<unknown>): void` and `export async function flushWaitUntil(): Promise<void>`.

The routes:
- **`orders/paid`:**
  1. `authenticate.webhook`.
  2. A topic other than `ORDERS_PAID` answers 400.
  3. `findConnection(shop)`. With no connection, log and answer 200.
  4. With no `admin` (no session), answer 500 so Shopify retries.
  5. `readOrder(payload.admin_graphql_api_id)`. If that returns null, answer 200.
  6. `recordOrder`.
  7. `waitUntil((async () => { if (payoutId) await sendPayout(payoutId, rail); await resolveTier(customerId); })())`.
  8. Answer 200.
  9. Any thrown error answers 500.
- **`refunds/create`:**
  1. `readRefund("gid://shopify/Refund/" + payload.id)`. If it returns null, answer 200.
  2. `recordRefund(conn, orderGid, refund)`.
  3. On `order_not_recorded`, `readOrder(orderGid)`: answer 503 if the order has a customer and `now − orderedAt < ORDER_RECORDING_WINDOW_MS`, and 200 otherwise.
  4. `RefundRetryLater` answers 503.
  5. A pending reversal is sent with `waitUntil(sendPayout)`, then the tier is resolved.
- **`orders/cancelled`:** set `cancelledAt` on the recorded order, then `waitUntil(resolveTier)`, then answer 200.

- [ ] **Step 1: Write the released-URIs test.** It parses `apps/rewardspro/shopify.app.toml` and asserts that every `[[webhooks.subscriptions]]` URI except `/webhooks/compliance` (A14) has a route file in `apps/rewards/app/routes`.
- [ ] **Step 2: Write the failing Postgres tests:**

```ts
it("rejects a bad HMAC with 401", ...);
it("an unknown shop answers 200 and writes nothing", ...);
it("no session answers 500 so Shopify retries", ...);
it("records the order, answers, then sends the credit after the response", async () => {
  const res = await paid.action({ request: signedWebhook("orders/paid", shop, payload), params: {}, context: {} });
  expect(res.status).toBe(200); expect(calls.filter(c => c.operation === "credit")).toHaveLength(0);   // calls = mockStoreCredit(...); nothing sent before the answer
  await flushWaitUntil(); expect(calls.filter(c => c.operation === "credit")).toHaveLength(1);
});
it("a duplicate delivery makes no second credit", ...);
it("refund for an unrecorded order: 503 within 4 h, 200 after", ...);
it("refund while the credit is mid-send: 503", ...);
it("cancelled order leaves tier spend", ...);
it("accepts deliveries signed with X-Shopify-API-Version 2026-01 and 2026-10", ...);
```

  MSW answers `RewardsOrderFacts`, `RewardsCredit` and `RewardsBalance` by operation name.
- [ ] **Step 3: Run them.** `pnpm --filter rewards test:unit -- released-uris && pnpm --filter rewards test:postgres -- order-webhooks`. Expected: FAIL.
- [ ] **Step 4: Implement the routes and `waitUntil`.**
- [ ] **Step 5: Run them.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(rewards): order and refund webhooks within Shopify's 5 seconds`.

### Task A14: Uninstall and compliance

**Files:**
- Create `apps/rewards/app/shopify/webhook-hmac.server.ts`, `app/lib/erasure.server.ts`, `app/routes/webhooks.app.uninstalled.tsx` and `app/routes/webhooks.compliance.tsx`.
- Test: `test/postgres/compliance.postgres.test.ts` (adapted).

**Interfaces:**
- Produces:
  - `export async function verifyShopifyWebhook(request: Request): Promise<{ topic: string; shop: string; webhookId: string; payload: any } | null>`
  - `export async function eraseMerchant(shop: string): Promise<Record<string, number>>`
  - `export async function redactCustomer(conn: ConnectionContext, externalCustomerId: string): Promise<{ found: boolean }>`
  - `export async function openPrivacyRequest(conn: ConnectionContext, i: { externalCustomerId: string | null; shopifyRequestId: string | null; ordersRequested: string[]; now?: Date }): Promise<{ id: string }>`
  - `export async function buildPrivacyReport(merchantId: string, privacyRequestId: string): Promise<{ filename: string; json: string } | null>`
  - `export const REPORT_RETENTION_DAYS = 45`

The pieces:
- **`verifyShopifyWebhook`:** base64 HMAC-SHA256 of the raw body with `SHOPIFY_API_SECRET`, compared with `timingSafeEqual` to `X-Shopify-Hmac-Sha256`. The shop is `X-Shopify-Shop-Domain`, which must match `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`. A failure returns null, and the route answers 401.
- **Uninstall:** `markUninstalled(shop)` and `prisma.session.deleteMany({ where: { shop } })`, then 200.
- **Compliance:** one URI. `CUSTOMERS_DATA_REQUEST` calls `openPrivacyRequest`, with `dueAt` = received + 30 days and `expiresAt` = received + 45 days. `CUSTOMERS_REDACT` calls `redactCustomer`. `SHOP_REDACT` calls `eraseMerchant`. An unknown shop answers 200, and an error answers 500.
- **`eraseMerchant`:** one transaction with `{ timeout: 60_000, maxWait: 10_000 }` and `SET LOCAL rewards.erasing = 'on'`. It deletes every model that has a `merchantId` field, in foreign-key-safe order derived from `Prisma.dmmf`, then the merchant, then the shop's sessions.
- **`redactCustomer`:** sets `externalCustomerId` null, `redactedAt` now and `lockedTierId` null. The customer's `pending`, `held` and `needs_look` payouts become `closed`, each with an adjustment entry that cancels what is left of its entry (as A11's close does) and `lastError` "Customer data erased".
- **The report:** JSON of the customer row, orders, ledger entries and payouts. It sets `downloadedAt`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("uninstall with no usable session answers 200, marks the connection and keeps the data", ...);  // Review Focus 2: no session row, expired token
it("uninstall with a bad HMAC answers 401", ...);
it("compliance topics with no usable session answer 200 and do their work", ...);   // Review Focus 2: shop/redact, customers/redact, data_request
it("reinstall before shop/redact reactivates and a pending payout is still there", ...);
it("shop/redact erases every merchant table and passes the ledger trigger", ...);  // every dmmf model with merchantId → count 0
it("customers/redact blanks one buyer, keeps ledger amounts, closes open payouts", ...);
it("data_request opens a request due in 30 days and the report holds the ledger", ...);
it("every model with merchantId is covered by the erasure order", ...);
```

- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- compliance`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): uninstall stops work; redact erases; data requests open a report`.

### Task A15: Scheduled jobs, monitoring and health

**Files:**
- Create `apps/rewards/app/lib/cron.server.ts` (carrying `cron-lock.server.ts`, `cron-monitor.server.ts` and `cron-auth.server.ts`), `app/lib/payout-check.server.ts`, `app/lib/telemetry.server.ts` (carrying `telemetry-redaction`) and `app/shopify/rail-for.server.ts`.
- Create the routes `api.cron.payouts.tsx`, `api.cron.tiers.tsx`, `api.cron.housekeeping.tsx` and `api.health.tsx` (carried), and `app/db/database-health.server.ts` (carried, `probeDatabase` only).
- Add `RewardsTokenPing` (`{ shop { id } }`) to `graphql.ts`.
- Modify `vercel.json` (crons), `app/entry.server.tsx` (Sentry init) and `.github/scripts/deploy-health.py` (add the `rewardspro-production` project, probing `/api/health`, per spec 9.2; the old app serves that path too, so this is safe before the switch).
- Tests: `test/postgres/cron-lock.postgres.test.ts` (carried), `test/postgres/cron-monitor.postgres.test.ts` (reduced to 3 jobs), `test/postgres/payout-check.postgres.test.ts` (adapted from `cashback-reconciliation.integration.test.ts`), `test/postgres/housekeeping.postgres.test.ts` and `test/unit/routes/cron-schedule.test.ts`.

**Interfaces:**
- Produces:
  - `export const CRON_SCHEDULES = { payouts: "30 * * * *", tiers: "0 2 * * *", housekeeping: "0 3 * * *" } as const`
  - `verifyCronAuth`
  - `export async function withCronLock<T>(job: CronJob, ttlMinutes: number, fn: () => Promise<T>): Promise<T | "locked">`
  - `monitoredCron`, `cronFailed` and `cronProblems`, with the carried logic. `monitoredCron` is typed `<A extends { request: Request }>(job: CronJob, run: (args: A) => Promise<Response>) => (args: A) => Promise<Response>`, so `app/lib` never imports `react-router`.
  - `export const railFor: RailFor`, which uses `unauthenticated.admin(shop)` for an active connection and returns null otherwise
  - `export async function runPayoutCheck(o: { now: Date; railFor: RailFor; deadline: number }): Promise<{ settled: number; sent: number; needsLook: number; swept: number; problems: number; firstProblem?: unknown }>`

`runPayoutCheck` works in this order and stops at the deadline:
1. Settle due payouts with `settleUnconfirmed`, at most 20 history reads (credits are judged; stuck debits become needs a look).
2. Send due `pending` payouts created at least 2 minutes ago, at most 50, ordered by `nextAttemptAt`.
3. The missed-order sweep (rule 13). For each active connection, take `recentPaidOrders(max(now − 3 days, installedAt))`, keep the ones with a customer, not test and not yet recorded, then `readOrder` → `recordOrder` → `sendPayout`.
Import polling is not part of `runPayoutCheck`: A17 adds it to the `api.cron.payouts` route.

The routes:
- **`api.cron.payouts`:** `withCronLock("payouts", 15)` with a deadline of now + 240 s.
- **`api.cron.tiers`:** `withCronLock("tiers", 30)` over active connections, carrying the tier cron's ordering, fair time shares and its 240 s budget.
  - `resolvedBefore` is `(lastTierPassAt ?? now − 1 day) + 1 day − 1 hour`, or the later `tierPassRequestedAt`.
  - It stamps `lastTierPassAt` only when a pass is complete with no errors.
  - It answers 500 if there were errors or a connection is overdue (more than 2 days).
- **`api.cron.housekeeping`:**
  1. `cleanupExpiredLocks`.
  2. Privacy requests past `expiresAt` become `expired`.
  3. Delete only `isOnline = true` sessions that expired more than 24 h ago.
  4. For every offline session with `refreshTokenExpires` less than 14 days away, call `unauthenticated.admin(shop)` and run `{ shop { id } }`.
  5. A19 adds `syncWidgetConfig` here.
- **Sentry:** `@sentry/react-router` init with `beforeSend`, which removes request query strings, cookies and bodies through `telemetry.server.ts`.

- [ ] **Step 1: Write the failing tests:**
  - The carried cron-lock cases: 5, with 1 of 5 concurrent acquires winning.
  - The cron-monitor cases for 3 jobs.
  - `cron-schedule`: `vercel.json` crons equal `CRON_SCHEDULES`, and each route answers 401 without the bearer.
  - Payout check, keeping the carried suite's hard cases: a lost answer through the cron is never resent; the three history verdicts through the cron; queue fairness; 401 without the bearer. Plus: a missed order gets recorded and credited; a due pending payout is sent; backoff, then needs a look at 24 h (this replaces the old 7-day case).
  - Housekeeping:
    - It never deletes an offline session even when `expires` is in the past.
    - It refreshes a session whose refresh token expires in 10 days, checked with an MSW token endpoint.
    - It expires privacy reports.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- cron-schedule && pnpm --filter rewards test:postgres -- cron payout-check housekeeping`. Expected: FAIL.
- [ ] **Step 3: Implement the jobs and set `vercel.json` crons** to the three paths and schedules.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): three monitored scheduled jobs and health`.

### Task A16: The app proxy

**Files:**
- Create `apps/rewards/app/shopify/proxy.server.ts`, `app/shopify/shop-checks.server.ts` (carrying `customer-accounts-version` and `store-credit-spend`) and `app/routes/api.proxy.$.tsx`.
- Add `RewardsCustomerAccounts` and `RewardsStoreCreditConfig` (the two carried shop-check queries) to `graphql.ts`.
- Tests: `test/postgres/app-proxy.postgres.test.ts` (adapted) and `test/unit/shopify/proxy-verify.test.ts`.

**Interfaces:**
- Consumes `findConnection`, `tierSpend`, `qualify`, `progress`, `liveBalance` and `customerAccountsVersion`.
- Produces `export async function verifyProxyRequest(request: Request): Promise<{ shop: string; customerId: string | null; admin: GraphqlClient | undefined } | Response>`
- Produces, from `shop-checks.server.ts` (carried logic, new names): `export async function customerAccountsVersion(shop: string, admin: GraphqlClient | undefined): Promise<"CLASSIC" | "NEW_CUSTOMER_ACCOUNTS" | null>` and `export async function storeCreditSpendProblems(admin: GraphqlClient, shop: string): Promise<Array<"legacy-accounts" | "sign-in-links-hidden" | "store-credit-off">>`

Verification:
- Try `authenticate.public.appProxy(request)` first. The buyer is `logged_in_customer_id` when it appears exactly once with a value other than empty, `null` or `undefined` (carrying `getProxyCustomerId`).
- If the library throws 400 and `shop` or `logged_in_customer_id` repeats, verify the signature directly:
  - Drop `signature`. For each key, build `key=value` from the URL-decoded values, joining repeated values with `,`. Sort those strings and concatenate them with no separator (not `&`). The signature is the hex HMAC-SHA256 of that string with `SHOPIFY_API_SECRET`.
  - The test file pins Shopify's two worked examples from its "Authenticate app proxies" docs page (secret `hush`, with and without `logged_in_customer_id`) as fixed vectors, independent of the test signer, with the clock frozen.
  - `timestamp` must be within 90 s, and the comparison is timing-safe.
  - Every copy of `shop` must be equal, or the answer is 400.
  - Every copy of `logged_in_customer_id` must be equal; otherwise the visitor is a guest.
- **Rate limit:** 30 requests per 60 s per `shop:customerId|guest`, in memory and after verification. Over the limit, answer 429.

Only `GET membership` is served; any other path is 404. The answer is 200 JSON with `Cache-Control: private, max-age=30`:

```ts
{ success: true,
  membership: { tier: { id, name, cashbackPercent: number }, tierSource: "MANUAL_OVERRIDE" | "SPENDING_BASED", configured: true },
  balance: { storeCredit: number | null, currency },                 // null = Shopify did not answer in 2.5 s
  tierProgress: { progressPercent, nextTierName, nextTierCashbackPercent, isMaxTier, amountRemaining, nextTierTarget, currentSpending },
  settings: { currency: shopCurrency, customerAccountsVersion },
  theme: { mode: "LIGHT", primaryColor: "#FFD700", backgroundColor: "#1a1a2e", textColor: "#FFFFFF", accentColor: "#008060", borderRadius: 12, fontFamily: "inherit", secondaryTextColor: null },
  running }
```

The other answers:
- A buyer RewardsPro hasn't seen yet gets the lowest tier, computed on read, and nothing is written.
- A guest gets `{ success: false, requiresLogin: true, message: "Sign in to see your rewards", running }`.
- A shop with no connection or no tiers gets `{ success: false, message: "Rewards are not set up yet" }`.
- `?currency=` (three letters, optional) picks which of the buyer's own balances to show; the default is the shop currency.

- [ ] **Step 1: Write the failing tests:**

```ts
it("repeated parameters: identical shop and logged_in_customer_id, signed comma-joined → that buyer", ...);  // Review Focus 1
it("repeated parameters: differing logged_in_customer_id → guest", ...);
it("repeated parameters: differing shop → 400", ...);
it("a bad signature or an old timestamp is refused", ...);
it("a guest gets no personal data whatever id is added", ...);
it("an unseen buyer sees the lowest tier and nothing is written", ...);
it("progress equals tier spend", ...);
it("balance is null when Shopify takes longer than 2.5 s", ...);       // fake timers
it("the 31st request in a minute from one buyer gets 429", ...);
```

- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- proxy-verify && pnpm --filter rewards test:postgres -- app-proxy`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): verified app proxy serving the widget's membership`.

### Task A17: Install and past orders

**Files:**
- Create `apps/rewards/app/shopify/bulk-import.server.ts` and `app/lib/import.server.ts`.
- Modify `app/shopify/install.server.ts` (`onAppOpened`) and `app/routes/api.cron.payouts.tsx` (after `runPayoutCheck`, call `pollRunningImports(deadline)`).
- Add `RewardsAccessScopes`, `RewardsBulkOrders` (the `bulkOperationRunQuery` mutation) and `RewardsBulkStatus` to `graphql.ts`.
- Test fixtures: `test/fixtures/bulk/*.jsonl`.
- Tests: `test/unit/shopify/bulk-parse.test.ts` and `test/postgres/import.postgres.test.ts`.

**Interfaces:**
- Consumes `factsFromOrderNode` (A7), `recordOrder` (A8) and `runTierPass` (A12).
- Produces:
  - `export async function startImport(admin: GraphqlClient, connectionId: string, installedAt: Date): Promise<void>`
  - `export async function pollImport(admin: GraphqlClient, connectionId: string, deadline: number): Promise<"running" | "done" | "failed">`
  - `export async function ingestImportedOrders(conn: ConnectionContext, facts: OrderFacts[]): Promise<{ written: number; skipped: number }>`
  - `export function parseBulkLines(lines: string[]): unknown[]`, which joins `__parentId` children into their parent order node.
  - `export async function pollRunningImports(deadline: number): Promise<number>`, which polls each connection with `importState` `running` through `unauthenticated.admin(shop)` and returns how many it polled.

How the import runs:
- **`onAppOpened` adds:**
  - If `importState` is `not_started`, call `startImport`.
- **`startImport`:**
  1. Read `RewardsAccessScopes`. If `read_all_orders` is missing, set `importHorizonDays` to 60.
  2. Run `bulkOperationRunQuery`. The inner query has `orders(query: "created_at:>='<installedAt − horizon>' AND created_at:<'<installedAt>'")` as its only top-level field (no `shop`), with the order fields of `RewardsOrderFacts` and `lineItems { edges { node { … } } }`, no `transactions` paging arguments and no `refunds`. The validator only checks the wrapper, because the inner query is a string, so the A25 run is the real check.
  3. Store the operation id and set `importState` to `running`.
- **`pollImport`:**
  - Reads `bulkOperation(id: …) { status errorCode url objectCount }`.
  - `COMPLETED`: fetch the JSONL. Starting at `importCursor`, parse lines in chunks of 500 orders and ingest each chunk, saving the cursor after every chunk. Stop at the deadline.
  - When everything is done, call `runTierPass(conn.connectionId, { deadline, resolvedBefore: now })`, set `importState` to `done` and set `importedCount`.
  - `FAILED`, `CANCELED` or `EXPIRED`: `failed` with `importError`. Restart up to 3 times.
- **Ingest:**
  - Keep orders whose status is PAID or PARTIALLY_REFUNDED, that aren't test orders and whose `cancelledAt` is null. Build each with `factsFromOrderNode(node, conn.currency, [])`.
  - Refunded product value comes from `quantity − currentQuantity`; a money-only refund isn't seen, which is accepted for spend.
  - Each kept order goes through `recordOrder(conn, facts, "import")`.
- **Polling:** the hourly cron route calls `pollRunningImports`. Home (A19) also polls while `importState` is `running`, with a 10 s deadline.

- [ ] **Step 1: Write the failing tests:**
  - JSONL parent/child parsing.
  - Imported rows have `source = import` and no ledger entry.
  - Test and cancelled orders are skipped.
  - Refunded items lower spend.
  - The import resumes from `importCursor` after the deadline.
  - Buyers are placed in tiers when the import finishes.
  - A missing `read_all_orders` gives a 60-day horizon.
  - `onAppOpened` twice starts one import.
  - A pre-install order the sweep records first, with cashback on, earns nothing, and the import then skips it, leaving one row.
  - An imported order later delivered by `orders/paid` is `already_recorded` and earns nothing.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- bulk-parse && pnpm --filter rewards test:postgres -- import`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Validate the documents as Global Constraints says.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): past 12 months of orders count toward tiers at install`.

**Milestone 2 PR:** "RewardsPro rebuild 2/4: the money loop". Merge it on green CI and a passed review, then check health.

### Task A18: Admin shell

**Files:**
- Create `apps/rewards/app/routes/app.tsx`, `app/admin/require-merchant.server.ts`, `app/admin/format.ts`, `app/admin/TierChip.tsx`, `app/admin/Chart.tsx`, `app/admin/admin.module.css` and `app/shopify/names.server.ts`.
- Add `RewardsCustomerNames` (`nodes(ids:)`) to `graphql.ts`.
- Tests: `test/unit/admin/nav.dom.test.tsx`, `test/unit/admin/format.test.ts` and `test/unit/shopify/names.test.ts`.

**Interfaces:**
- Produces:
  - `export async function requireMerchant(request: Request): Promise<{ admin: AdminApiContext; session: Session; conn: ConnectionContext }>`. It calls `authenticate.admin`, then `findConnection`, then `ensureMerchant` once if the connection is missing.
  - `export function formatMoney(amount: Decimal | number | string, currency: string, locale?: string): string` (Intl, with the currency's minor unit)
  - `export async function customerNames(admin: GraphqlClient, externalIds: string[]): Promise<Map<string, string>>`. It batches `nodes(ids:)` 250 at a time with a 2.5 s timeout; a missing name falls back to "Customer ····1234".
  - `<TierChip name percent />`
  - `<Chart series={[{ label, points: { date, value }[] }]} />`, a custom SVG with Polaris tokens and navy and teal lines.

The layout:
- `app.tsx` renders `<AppProvider apiKey polarisUrl="https://cdn.shopify.com/shopifycloud/polaris-2.js">`.
- `<s-app-nav>` holds `<s-link href="/app" rel="home">Home</s-link>` (with a `@ts-expect-error` for `rel`; the home link is hidden from the menu by design), then Customers, Tiers, Orders and Settings.

- [ ] **Step 1: Write the failing tests:**
  - The nav renders the links in the order Home, Customers, Tiers, Orders, Settings (`createRoutesStub`).
  - `formatMoney(62, "JPY")` gives "¥62".
  - `customerNames` falls back after a timeout.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- admin names`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them.** Expected: PASS. Run `pnpm --filter rewards typecheck`; expected exit 0.
- [ ] **Step 5: Commit.** `feat(rewards): admin shell, nav and shared pieces`.

### Task A19: Home

**Files:**
- Create `apps/rewards/app/routes/app._index.tsx`, `app/lib/stats.server.ts` (`homeStats`) and `app/shopify/widget-config.server.ts`.
- Modify `app/routes/api.cron.housekeeping.tsx` (add the nightly `syncWidgetConfig`).
- Add `RewardsAppInstallation` (`currentAppInstallation { id }`) and `RewardsWidgetConfig` (`metafieldsSet`) to `graphql.ts`.
- Tests: `test/postgres/home.postgres.test.ts` and `test/unit/routes/home.dom.test.tsx`.

**Interfaces:**
- Produces:
  - `export type RecentReward = { orderId: string; orderName: string; customerId: string; tierName: string | null; amount: Decimal; currency: string; status: string }`
  - `export interface HomeStats { cashbackGiven: Decimal; creditSpent: Decimal; cameBack: number; daily: { date: string; given: Decimal; spent: Decimal }[]; recent: RecentReward[]; tiers: { id; name; percent; members }[]; needsLook: number; cashbackOrders: number }`
  - `export async function homeStats(conn: ConnectionContext, now: Date): Promise<HomeStats>`. "This month" uses the merchant's timezone, and `daily` covers the last 30 days.
  - `export async function syncWidgetConfig(admin: GraphqlClient, conn: ConnectionContext): Promise<void>`. It runs `metafieldsSet` on the `currentAppInstallation` id with namespace `rewards`, key `config` and type `json`, holding `{ running, basePercent }`. Check the Liquid read path `app.metafields.rewards.config.value` against Shopify's app-data metafield docs, and adjust the namespace if the docs require it.

The page (spec 4.3):
- **Banners** (`slot="supplemental-start"`), shown only when they apply, in this order:
  1. "A customer asked for their data. Download it by <date>."
  2. "Buyers can't spend their store credit yet: <problem>." The problem comes from `storeCreditSpendProblems`.
  3. "N cashback payments need a look." It links to Orders.
  4. "The rewards widget is off in your theme." The check runs client-side through `shopify.app.extensions()`.
- **Setup card**, while setup isn't finished:
  1. "Your base cashback rate: [ ]%". Saving creates the lowest tier with minimum 0, named "Everyone".
  2. "Switch cashback on".
  3. "Turn on the widget in your theme". It links to `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${SHOPIFY_API_KEY}/membership_widget`.
  4. While `importState` is `running`, it polls the import and shows "Bringing in your last 12 months of orders so buyers start in the right tier". When done, it shows "Done: N buyers placed in tiers".
- **Main column:** "This month" with "Cashback given", "Store credit spent at checkout" and "Came back"; then the chart; then "Recent rewards".
- **Aside:**
  - "Running": the switch, with "On: every paid order earns cashback as store credit." or "Off: orders still count toward tiers but earn no cashback.", plus three checks.
  - "Tiers".
- **Phones:** the main column sits in an `s-query-container` with `containerName="main"`. Above the numbers, a one-line Running summary sits in an `s-box` with `display="@container main (inline-size > 600px) none, auto"`, so it shows only at narrow widths. The chart is hidden the same way. The numbers go two per row, and recent rewards shrink to two rows. The full Running card stays in `slot="aside"`, wherever Shopify places it on a phone; check K confirms that on a real phone.
- **Review request:** when Home loads with at least 3 cashback entries, a merchant at least 7 days old, and neither `reviewPromptDismissedAt` nor `reviewPromptShownAt` set, an effect (not a button: Shopify advises against click-started requests) calls `shopify.reviews.request()` once. An action records `reviewPromptShownAt` when the result is `success` or `already-reviewed`, and leaves it unset otherwise so a later visit can try again. A small dismiss control sets `reviewPromptDismissedAt`; any visible "leave a review" link goes to the App Store listing.
- **Actions:** `setRunning`, then `syncWidgetConfig`; set the base rate, then `syncWidgetConfig`; dismiss the review request; record that it was shown.

- [ ] **Step 1: Write the failing tests:**
  - Postgres:
    - Cashback given is net of reversals and adjustments, in the shop's timezone.
    - Spent at checkout sums `shopStoreCreditUsed`.
    - "Came back" counts a buyer with an earlier order that earned cashback.
    - The review request is due at 3 entries and 7 days, not after a dismissal, and not after `reviewPromptShownAt` is set.
    - The banners come in the order above.
    - The switch refuses with no tiers.
    - The base rate creates the lowest tier with minimum 0.
  - DOM: the setup card is hidden once all steps are done; the Running sentence matches the switch.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- home && pnpm --filter rewards test:unit -- home.dom`. Expected: FAIL.
- [ ] **Step 3: Implement the page, stats and widget config.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): Home, main and side`.

### Task A20: Tiers page

**Files:**
- Create `apps/rewards/app/routes/app.tiers.tsx`.
- Test: `test/postgres/tiers-page.postgres.test.ts`.

**Interfaces:**
- Consumes `runTierPass` (A12), `syncWidgetConfig` (A19) and `waitUntil` (A13).

Validation:
- The name is required and at most 40 characters.
- The minimum spend is a whole number of at least 0 and unique within the merchant.
- The lowest tier's minimum is fixed at 0, labelled "Everyone starts here", and the lowest tier can't be deleted.
- The cashback percent is a whole number from 0 to 100 in the UI.

On every save or delete:
1. Set `tierPassRequestedAt` to now.
2. `waitUntil(runTierPass(conn.connectionId, { deadline: now + 25 s, resolvedBefore: now }))`. The nightly pass finishes the rest.
3. `syncWidgetConfig`.

Deleting a tier happens in one transaction: clear `lockedTierId` for buyers locked to it, move each member through `resolveTier(customerId, { tx, excludeTierId })`, then delete the row. The async pass then handles everyone else.

The page also holds "Spend counted over: last 12 months / all time" and the line "Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing."

- [ ] **Step 1: Write the failing tests** for each validation rule:
  - Deleting a tier moves its members, including buyers locked to it, to the tier they qualify for, in the same transaction.
  - Raising a minimum re-places buyers.
  - Changing the window re-places buyers.
  - The lowest tier can't be deleted.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- tiers-page`. Expected: FAIL.
- [ ] **Step 3: Implement the page.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): Tiers page`.

### Task A21: Customers and the buyer panel

**Files:**
- Create `apps/rewards/app/routes/app.customers._index.tsx`, `app.customers.$id.tsx` and `app.customers.export.tsx`.
- Modify `app/lib/stats.server.ts` (add `customerRows`).
- Add `RewardsCustomerSearch` (`customers(query:)`) to `graphql.ts`.
- Test: `test/postgres/customers-page.postgres.test.ts`.

**Interfaces:**
- Produces `export async function customerRows(conn: ConnectionContext, o: { tierId?: string; externalIds?: string[]; page: number }): Promise<{ rows: { id; externalCustomerId; tierName; orders: number; spend: Decimal; cashbackGiven: Decimal }[]; hasNext: boolean }>`, where `spend` is the same figure as `tierSpend` over the merchant's window. Pages hold 50 rows.

The pages:
- **Search** runs Shopify `customers(query:)` and maps the results to known ids, so no emails are stored.
- **CSV export** has the columns `Buyer,Tier,Spend counted,Cashback given`. Names come from `customerNames`. A cell beginning with `= + - @` is prefixed with `'`.
- **Buyer panel:**
  - tier and "In this tier since";
  - progress;
  - the live balance, shown as "Shows at checkout" when it is null;
  - cashback history, where each entry shows the tier and rate it earned at;
  - orders;
  - "Lock to a tier" and "Return to automatic", which call `lockTier`;
  - "Adjust store credit in Shopify", which links to `shopify://admin/customers/<id>`.

- [ ] **Step 1: Write the failing tests:**
  - Pagination and the tier filter.
  - CSV escaping, including formula prefixes.
  - A lock on another merchant's customer gives 404.
  - The panel loader's balance is null when Shopify times out.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- customers-page`. Expected: FAIL.
- [ ] **Step 3: Implement the pages.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): Customers and the buyer panel`.

### Task A22: Orders and the needs-a-look answers

**Files:**
- Create `apps/rewards/app/routes/app.orders._index.tsx` and `app.orders.$id.tsx`.
- Modify `app/lib/stats.server.ts` (add `orderStatus`).
- Tests: `test/unit/lib/order-status.test.ts` and `test/postgres/orders-page.postgres.test.ts`.

**Interfaces:**
- Consumes `answerNeedsLook` (A11).
- Produces `export function orderStatus(o: { source; test; noCashbackReason? }, entry?: { amount }, credit?: { state; lookReason? }, reversals?: { amount; state; shortfall? }[]): { label: "Issued" | "Waiting" | "Taken back" | "Needs a look" | "No cashback"; detail: string | null }`

Status mapping:
- `sent` gives Issued.
- `pending`, `sending`, `unconfirmed` and `held` give Waiting.
- `needs_look` gives Needs a look, and so does any reversal payout in `needs_look`; this wins over Issued and Taken back.
- Reversals that took back all the cashback give Taken back.
- A credit in `closed` gives No cashback with the detail "Closed without sending".
- No ledger entry gives No cashback, with the detail from `noCashbackReason`: "Cashback was off" (`off`), "Test order" (`test`), "From before install" (`import`, `before_install`), "Cancelled" (`cancelled`), "No tiers were set up" (`no_tier`) or "Nothing to pay on" (`nothing_to_pay_on`).

The order panel shows the ledger entries, payouts and refunds. A shortfall shows as "Took back £0.40 of £1.00; the buyer had spent the rest".

The actions:
- Reason `refused` or `kept_failing`: "Retry" and "Close without sending".
- Reason `could_not_confirm`: "It arrived" and "It didn't arrive, send it", next to "Check the buyer's store credit in Shopify first. If you already added it by hand, choose It arrived."

- [ ] **Step 1: Write the failing tests:**
  - The status mapping table, one case per state.
  - Each action changes the payout as A11 says.
  - Another merchant's order gives 404.
  - The shortfall wording.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- order-status && pnpm --filter rewards test:postgres -- orders-page`. Expected: FAIL.
- [ ] **Step 3: Implement the pages.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): Orders and the needs-a-look answers`.

### Task A23: Settings and privacy requests

**Files:**
- Create `apps/rewards/app/routes/app.settings._index.tsx` and `app.settings.privacy.tsx`.
- Test: `test/postgres/settings-page.postgres.test.ts`.

The pages:
- **Settings:**
  - One switch, "Email buyers when they earn store credit" (`notifyBuyers`, off by default), with the line "Shopify sends this email itself. RewardsPro sends no email."
  - A link to "Customer data requests".
  - Help: the docs link and contact@rewardspro.io.
- **The privacy sub-page:** a list showing each request's received date, due date and expiry, with Download. The download action returns `buildPrivacyReport` as an `application/json` attachment. A request past `expiresAt` shows "This report has expired".

- [ ] **Step 1: Write the failing tests:**
  - The notify switch persists.
  - A download only works for the merchant's own request.
  - An expired request can't be downloaded.
  - Downloading sets `downloaded`, which clears the Home banner.
- [ ] **Step 2: Run them.** `pnpm --filter rewards test:postgres -- settings-page`. Expected: FAIL.
- [ ] **Step 3: Implement the pages.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): Settings and customer data requests`.

**Milestone 3 PR:** "RewardsPro rebuild 3/4: the admin". Merge it on green CI and a passed review.

### Task A24: The widget

**Files:**
- Create `apps/rewards/extensions/rewards-widget/` with `shopify.extension.toml`, `blocks/membership_widget.liquid`, `assets/rewards-widget.js`, `assets/rewards-widget.css` and `locales/en.default.json`.
- Modify `docs/modules/catalog.json` (add the extension entry).
- Tests: `test/unit/extensions/widget-bundle.test.ts` and `test/unit/extensions/widget.dom.test.ts`.

The extension:
- **toml:** exactly `[[extensions]]` with `type = "theme"`, `name = "RewardsPro Theme Extension"`, `handle = "rewardspro-theme-extension"` and `uid = "de76c331-60b3-32cf-27d1-40ec03d229db8af03050"`. No top-level keys.
- **Block schema:**
  - `"target": "body"`.
  - The settings `guest_message`, `guest_cta_text` and `guest_cta_url` are text with no defaults. A setting nobody filled in uses the widget's own copy.
  - `look` is a select with `light` and `dark` (default `light`).
  - `accent` is a color (default `#17BEBB`).
- **Liquid:**
  - It prints no customer email, name or tags.
  - Signed-in buyers get a root with `data-endpoint="/apps/rewardspro/membership"` and `data-currency="{{ cart.currency.iso_code }}"`.
  - Guests get the rate from `app.metafields.rewards.config`.
  - The script loads with `defer`.
- **JS, signed in:**
  - It fetches the endpoint plus `?currency=` once, with an 8 s timeout and no retries, and adds no `shop` or `logged_in_customer_id`.
  - It shows the tier name and rate, the balance or "Your store credit shows at checkout" when it is null, progress, and "Sign in and choose Apply store credit at checkout" when the store uses new customer accounts.
  - When `running` is false, it hides the earn line.
- **JS, guest:** "Sign in to see your rewards" and "Earn {basePercent}% back as store credit". It shows nothing when the switch is off.
- **Locale:** English strings only, with no points wording.

- [ ] **Step 1: Write the failing tests:**

```ts
expect(bytes("assets/rewards-widget.js") + bytes("assets/rewards-widget.css")).toBeLessThan(30_000);
expect(toml).toMatch(/^\[\[extensions\]\]/m); expect(toml).not.toMatch(/^uid\s*=.*\n(?![\s\S]*\[\[extensions\]\])/m);
expect(parse(toml).extensions[0])  /* parse from smol-toml */.toMatchObject({ handle: "rewardspro-theme-extension", uid: "de76c331-60b3-32cf-27d1-40ec03d229db8af03050" });
expect(schema.target).toBe("body"); expect(schema.settings.map(s => s.id).filter(Boolean)).toEqual(["guest_message","guest_cta_text","guest_cta_url","look","accent"]);
expect(liquid).not.toMatch(/customer\.(email|first_name|last_name|tags)/);
// DOM: renders tier/balance; null balance → "Your store credit shows at checkout"; guest copy override only when filled; Off hides the earn line; no fetch for guests
```

- [ ] **Step 2: Run them.** `pnpm --filter rewards test:unit -- extensions`. Expected: FAIL.
- [ ] **Step 3: Implement the extension.** Then run `pnpm docs:modules`, commit the regenerated pages, and run `pnpm audit:modules`; expected exit 0.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(rewards): small widget with the same embed identity`.

### Task A25: Staging run on cashbackpro

This task needs Yu at two points, for the Partners sign-in and the shopper sign-in. Its output is a written record, not code.

**Files:**
- Create `apps/rewards/shopify.app.staging.toml` and `apps/rewards/docs/staging-run.md`.
- Modify `test/fixtures/orders/*` only if real answers differ from the fixtures.

- [ ] **Step 1: Prepare the staging app.** Yu signs in to Partners in the Chrome tab (Ai never types the password). Ai opens the leftover draft app "rewardspro-production", reads its client_id, and stops if it equals `026ce3bf073bed0e44ae8eab09d1ae3a`. Yu agreed on 2026-11-04 to reuse this app; with that, rename it "RewardsPro Staging".
- [ ] **Step 2: Write `shopify.app.staging.toml`:**
  - The staging client_id.
  - `automatically_update_urls_on_dev = true` (staging only).
  - `[webhooks] api_version = "2026-10"`, with the five kept subscriptions (orders/paid, refunds/create at `/webhooks/orders/refunded`, orders/cancelled, app/uninstalled, app/scopes_update) plus the compliance URI.
  - The trimmed scopes `read_customers,read_orders,read_all_orders,read_store_credit_accounts,write_store_credit_account_transactions,write_app_proxy`, plus `read_store_credit_account_transactions` if A6 step 5 reported it.
  - The same `[app_proxy]` prefix and subpath.
- [ ] **Step 3: Run the app.** `scripts/test-db.sh start`, run `pnpm --filter rewards migrate:deploy` against it, then `pnpm --filter rewards exec shopify app dev --config shopify.app.staging.toml --store cashbackpro`. Use the session's CLI 5 binary.
  - Expected: the app opens inside the cashbackpro admin, a merchant and connection exist, and `importState` reaches `done` with `importedCount` matching the store's paid orders in the window.
- [ ] **Step 4: Proxy check (Review Focus 1).** While signed in as a test shopper (Yu signs in), open `https://cashbackpro.myshopify.com/apps/rewardspro/membership?logged_in_customer_id=<that id>&shop=cashbackpro.myshopify.com`.
  - Log the forwarded query keys (names only) from the dev server, and record whether Shopify forwarded one copy or two.
  - Expected: the JSON shows `success: true` with that buyer's tier.
- [ ] **Step 5: Capture real orders.** Make draft orders, marked as paid, for each A7 fixture case Shopify allows:
  - a discount and shipping;
  - a tax-inclusive order (cashbackpro's own setting);
  - a tax-exclusive order, from a market or store whose prices exclude tax (for example a cashbackpro market with "include tax in prices" off). This replaces the hand-written tax-exclusive fixture;
  - a store credit tender;
  - a refund with items, shipping-only and money-only.

  Fetch each with `RewardsOrderFacts` (and `RewardsRefundFacts` for the refunds). Record `extensions.cost.requestedQueryCost` for every document, `RewardsCreditHistory` included; expected at most 1,000 each. If any answer differs from the A7 fixture's shape, update the fixture, rerun A7's tests and fix `factsFromOrderNode`.
- [ ] **Step 6: Run the hands-on checks.** On staging, run checks A to H from spec 9.1 (F as Decision 19 reads it). Then check the admin at 1280, 768 and 390 px wide in Chrome, and confirm the type renders in Polaris's font. Run Lighthouse (mobile) on the cashbackpro home page with the embed off and then on. Expected: performance drops by no more than 10 points (spec 5).
- [ ] **Step 7: Record the results** in `docs/staging-run.md`: each check with pass or fail, the proxy finding, and any fixture changes. Fix failures in the owning task's files, with a test, before going on.
- [ ] **Step 8: Commit.** `test(rewards): staging run on cashbackpro`. Then open the Milestone 4 PR, "RewardsPro rebuild 4/4: widget and staging", and merge it on green CI and a passed review.

---

# Part B: switch, trim, prove, retire (each step on Yu's yes at the time)

### Task B1: Production toml and the old-app guard (PR only, no deploy)

**Files:**
- Create `apps/rewards/shopify.app.toml`.
- Modify `apps/rewardspro/package.json` (the `deploy` and `shopify` scripts) and `apps/rewardspro/shopify.app.toml` (its `client_id` line only).
- Test: `apps/rewards/test/unit/config/production-toml.test.ts`.

- [ ] **Step 1: Write the failing test.** It asserts the production toml has:
  - the identity values from Global Constraints;
  - `embedded = true` and `[pos] embedded = false`;
  - `[build] automatically_update_urls_on_dev = false`;
  - `[webhooks] api_version = "2026-10"`, with exactly the subscriptions `orders/paid`, `refunds/create` (uri `/webhooks/orders/refunded`), `orders/cancelled`, `app/uninstalled`, `app/scopes_update` and compliance (`/webhooks/compliance`);
  - each subscription URI with a route file;
  - the A25 scopes;
  - `[auth] redirect_urls` and `[app_proxy]` equal to `apps/rewardspro/shopify.app.toml`.
- [ ] **Step 2: Run it.** Expected: FAIL. Then write the toml and run it again. Expected: PASS.
- [ ] **Step 3: Write the guard.**
  - In `apps/rewardspro/package.json`, set both `"deploy"` and `"shopify"` to `"echo 'apps/rewardspro is retired: deploy from apps/rewards' && exit 1"`.
  - In `apps/rewardspro/shopify.app.toml`, replace the `client_id` value with `"retired-deploy-from-apps-rewards"` and add a comment saying why. The CLI then can't link that directory to the live app, while the old app's own toml tests, Vercel's Instant Rollback and the old build keep working.
  - Run `pnpm --filter rewardspro test:unit`; expected PASS.
- [ ] **Step 4: Open the PR.** Commit `chore(rewards): production config, not yet released`, push, and open the PR. **Merge it only at B2 step 6.**

### Task B2: The switch (phase 2: one sitting, zero Shopify changes)

Before starting, check read-only how many shops have the old app installed. If any shop other than `rewardsprotesting` exists, stop and add a task that carries its customers, tiers and ledger across by script (spec 8). Then send Yu one message with steps 1 to 6 and the rollback, and wait for his yes. Each owner step is done by Yu. After each step Ai verifies, then asks before the next.

- [ ] **Step 1 (Yu): Create the schema and role, and migrate.** As the database owner in Supabase SQL:

```sql
CREATE ROLE rewards_app LOGIN PASSWORD '<Yu chooses>';
CREATE SCHEMA rewards AUTHORIZATION rewards_app;
ALTER ROLE rewards_app SET search_path = rewards;
REVOKE ALL ON SCHEMA rewards FROM PUBLIC;
```

  Then, from the worktree, Yu runs `export REWARDS_DIRECT_URL='<owner-held URL>'`, then `pnpm --filter rewards migrate:deploy && pnpm --filter rewards migrate:drift`.
  - Expected: one migration applied, and the drift check exits 0.
  - Do not run `setup-database.sql` here.
- [ ] **Step 2 (Yu): Add `REWARDS_DATABASE_URL`** in Vercel Production, typed sensitive, using the pooler with `?schema=rewards&connection_limit=3`.
  - Ai then checks with `vercel env ls production` that the name exists. Values are never printed.
- [ ] **Step 3 (Yu): Change the Vercel project `rewardspro-production` settings.**
  - Root Directory `apps/rewards`.
  - Framework React Router.
  - Default function region lhr1.
  - Node 24.x.
  - Ai then reads the settings back.
- [ ] **Step 4: Deploy.** Push a commit touching `apps/rewards` to main (the B1 PR stays unmerged).
  - Expected: the production deployment is READY and `/api/health` answers `{"status":"ok","database":"ready"}`.
  - Also: `curl -X POST` to each of the 11 released webhook URIs with a bad HMAC answers 401, and `GET /api/proxy/membership` without a signature answers 400 or 401, never 404.
- [ ] **Step 5 (Yu): Open the app.** Yu opens RewardsPro on rewardsprotesting once. Ai checks read-only that one merchant and one connection exist, that `importState` is `running` or `done`, and that the session has a `refreshToken`. If `importHorizonDays` is 60, tell Yu that `read_all_orders` needs approval in the Partner Dashboard.
- [ ] **Step 6: Merge B1 and run a test order.** Merge the B1 PR (the guard). Then run one test order, a draft order marked as paid. Expected: an order row, a sent payout, and the credit visible on the buyer in Shopify admin.

**Rollback:** Vercel Instant Rollback to the last old-app deployment, then Root Directory back to `apps/rewardspro`. The old app on rewardsprotesting then needs a reinstall, because its old token died in step 5. Credit already issued stays in Shopify as test money.

### Task B3: The trimmed Shopify release (phase 3)

- [ ] **Step 1: Clean up the old app's leftovers.** List, read-only, what the old app created on rewardsprotesting: tier products, purchase options and the `rewardspro.customer_id` metafield definition. Show Yu the list. Delete them only on his yes, because the trimmed scopes can't remove them later.
- [ ] **Step 2: Deploy without releasing.** `pnpm --filter rewards exec shopify app deploy --config shopify.app.toml --no-release --message "rebuild: trimmed scopes, 2026-10 webhooks, new widget"`. Read the output.
  - Expected: the theme extension shows as **updated** (uid `de76c331…`), never created and removed.
- [ ] **Step 3: Show Yu the version diff.** Open the new version in the Dev Dashboard and show Yu the exact breakdown: scopes removed, webhooks removed, extension updated. Release only on his yes, with `shopify app release --version <name> --allow-updates --allow-deletes`.
- [ ] **Step 4: Verify the release.**
  - In the theme editor, the RewardsPro embed is still on.
  - The new widget renders for a guest and for the signed-in test shopper.
  - Webhooks arrive with `X-Shopify-API-Version: 2026-10`.
- [ ] **Step 5: Remove the ignored-topic routes.** Delete the five ignored-topic routes, plus the released-URIs test's dependency on the old toml, in one PR.

### Task B4: The two gates (phase 4)

- [ ] **Step 1: Automated checks.** Confirm CI is green on main for the `rewards` job: unit, Postgres, typecheck and build.
- [ ] **Step 2: Hands-on checks.** Run spec 9.1 checks A to P on rewardsprotesting, with F read as Decision 19 says. Check N runs on `different-currency-test`: Yu installs the production app there first (his sign-in), then Ai checks a merchant and connection appear, sets a tier, switches cashback on, runs N, and records whether the app stays installed. If Yu would rather not install it there, get his ok in chat to run N on the staging app, and note it in `gates.md`. Ai drives Chrome. Yu signs the test shopper in once. No card details are ever entered, and store credit covers the whole of any checkout. Record each result with evidence (screens and DB rows, read-only) in `apps/rewards/docs/gates.md`.
- [ ] **Step 3: Backend review.** Mark each item of spec 9.2 ok, or list it for Yu. Then send Yu one message with only the items that need him:
  - the `CI status` required check;
  - splitting `SHOPIFY_API_SECRET` by environment;
  - deleting the orphaned secrets;
  - log query strings;
  - point-in-time recovery;
  - `read_all_orders` approval, if the import fell back to 60 days;
  - the two frozen paid charges (Decision 20): Yu reads them in the Partner Dashboard or the Partner API and cancels each with the Partner API `appSubscriptionCancel(appId, shopId, prorate: false)`, or asks Partner Support if Shopify refuses.
- [ ] **Step 4: Report.** Done means every 9.1 check passes and every 9.2 item is ok or accepted by Yu. Report to Yu in at most 8 lines.

### Task B5: Retire (phase 5, at least a week after B4)

- [ ] **Step 1: Open the retirement PR.** It deletes:
  - `apps/rewardspro` and `apps/rewardspro-api`;
  - `.github/workflows/rewardspro-v2.yml`;
  - the `rewardspro` CI job and its `ci-status` entries;
  - their catalog entries (then `pnpm docs:modules`) and root scripts.

  It also updates DEPLOY.md, DATABASE.md and the privacy policy's retention lines in the same change, and keeps CI green.
- [ ] **Step 2 (Yu): Clean up what's left.** Give Yu the list of old env var names to delete, and the commands to dump and then drop schema `rewardspro` and its role. Both are irreversible, so they are done on his yes, by him.
