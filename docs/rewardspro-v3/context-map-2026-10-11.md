# RewardsPro: consolidated context map

**Scope.** This map covers monorepo `cambridgetcg/Cambridge-TCG-monorepo` at HEAD `2722104c` (= `origin/main`), as of 2026-10-11. Paths are relative to `apps/rewardspro/` unless a prefix says otherwise. Where the six area maps disagreed, I used the critic's resolution, which was checked against source; the list is at the end. All work was read-only: nothing was changed, archived, deployed or rotated. **UNVERIFIED** means the item was not checked live.

---

## 1. Verdict

RewardsPro is a Free-only Shopify embedded loyalty app. It runs Remix 2.16.7, Polaris React 12 and shopify-app-remix 3.8.5 on Vercel (`arn1`), with Aurora behind the RDS Data API (`AURORA_*`, default region eu-north-1).

It is **retired in place**. It is still public and installable at apps.shopify.com/rewards-pro (Pricing Free, 0 reviews, launched 2025-12-16), but:
- the last feature work was 2026-04-30;
- new paid subscriptions were retired on 2026-09-23 (`NEW_PAID_SUBSCRIPTIONS_RETIRED=true`, which returns 410);
- KPI and commercial targets were dropped (CLAUDE.md:3-9);
- the v2 backend `apps/rewardspro-api` has never been deployed;
- the Vercel project redeploys on every monorepo commit, related or not. That is 13 prod deploys in 30 days. The current prod build is `2722104c`, a trust-breakdown merge whose RewardsPro CI job was skipped.

The code is about 203k LOC: 171 registered routes, 107 Prisma models and 63 enums. The real value is small:
- tiers;
- per-tier cashback paid as **Shopify-native store credit** through a ledger that writes PENDING, then calls `storeCreditAccountCredit`, then marks SYNCED;
- order and customer sync;
- the storefront widget and the customer-account widget.

About 35.5k LOC cannot be reached from any route, and most of the rest is partial, stubbed or retired scope.

**The biggest fact for a rebuild:** the app's own database is documented as gone. On 2026-07-23 the credentials were rejected, readiness returned 503, and an AWS inventory found no RDS or Aurora source (`docs/decisions/2026-07-23-rewardspro-runtime-v2.md:26-27,35-39`). This has not been re-checked today, and `/api/health` still returns 200 because it only checks that the process is up.

If that is still true, **Shopify is the only surviving system of record**:
- Merchants' app subscriptions live there.
- The store credit RewardsPro issued to shoppers lives there. It was issued with no `expiresAt` and is never debited on refund.
- Points, tier progress, Shopify sessions and RewardsPro's own ledger of what it issued probably exist nowhere.

---

## 2. Estate

| Item | Kind | Role | Status | Canonical? | Evidence |
|---|---|---|---|---|---|
| `Cambridge-TCG-monorepo/apps/rewardspro` | repo path | App source and Vercel deploy source | live | **YES** | Vercel link: root `apps/rewardspro`, branch `main`. Fuse merge `25e6e07c` (2026-06-10, 1,123 commits). Tree `a2b5259f:apps/rewardspro` = prod `eae17e3` (`a1e924ba3a85`) |
| `…/apps/rewardspro/landing/public` | static site source | rewardspro.io | live | **YES** | pages.dev `index.html` sha256 `77a1849a080111d7` matches local. `landing/wrangler.toml` name `rewardspro-landing`. Last commit `1ac0c565` (2026-09-24) |
| `…/apps/rewardspro-api` | v2 backend (Fastify 5, pg, SQS, Node 24, yutabase 0.1.0-candidate.2) | Event-ingestion foundation, orders/paid only, no loyalty logic | **dormant, never deployed** | yes, for v2 | 4 commits on 2026-07-23 (last `653f7d71`). Deploy job skipped on 11/11 pushes. `REWARDSPRO_V2_DEPLOY_ENABLED` absent. 0 deployments. Validation CI green (run 38125983769). src 4,546 LOC, 11,020 tracked |
| `cambridgetcg/rewardspro-production` | repo (private) | The real git ancestor. Holds the unmerged landing redesign (`cd02df7`, `601e788`, `9e36e34`) and `feat/honest-monetization` (+23 commits) | dormant, but pushed 2026-09-24; CI red | no; archive after salvage | Carries the **prod client_id `026ce3bf`**. Tracks `infrastructure/terraform/tfplan`, `.mcp.json`, `claude-desktop-config.json` (contents not read) |
| `cambridgetcg/rewardspro-shopify` | repo (private) | Dev line 2025-10 to 2025-12 (fork of production at `9548cfc`) | dormant (last push `1035fa2` 2026-09-23); CI red | no; archivable | Carries **prod client_id `026ce3bf`** and `.mcp.json`. Its unique files were deliberately deleted upstream |
| `cambridgetcg/rewardspro` | repo (private) | Separate prototype (root `f66eda8`, 2025-06-12). Not a git ancestor | dormant | no; design reference only | Dev app `538b1257`. Repo homepage `rewardspro.vercel.app` is now a third-party site. Its 2026-03 zerone UI overhaul (`7934686` and others) is not in the monorepo |
| `cambridgetcg/rewardspro-docs` | repo (private) | GitBook source for docs.rewardspro.io | live | yes, for docs | HEAD `32e36d0` (2026-09-24) |
| `cambridgetcg/rewardspro-landing` | repo (private) | Old landing, now a 1,042-byte retirement stub | retired | no | HEAD `df9b4fd`. README says it is not the live source |
| `cambridgetcg/rewardspro-marketing` | repo (private) | Outreach scheduler (Ayrshare, wave engine) | retired | no | `8cbda60` (2026-09-23). No local cron or LaunchAgent |
| Shopify app **"Rewards Pro"**, client_id `026ce3bf073bed0e44ae8eab09d1ae3a`, handle `RewardsproMembership` | Partner app | The live app and listing | **live, public** | **YES** | `shopify.app.toml:4-8`. apps.shopify.com/rewards-pro returns 200 |
| Theme app extension (uid `a58b9b10…`) | extension | 6 blocks (2 app-embed, 4 section) and about 11.5k lines of hand-written JS/CSS | live (deployed version UNVERIFIED) | yes | `extensions/theme-app-extension-rewardspro/shopify.extension.toml` |
| Customer-account UI extension `rewards-pro-membership` (uid `be72a1b4…`) | extension | Profile block (API 2025-07) | partial: 4 of its tabs return 503 | yes | `extensions/rewards-pro-membership/…toml:6`. Pins `@shopify/ui-extensions-react` 2025.7.x |
| client_id `f04b5854fb022d67ba9dd097767b465a` ("rewardspro-production") | Partner app | Prod identity from 2025-08-22 to 2025-11-24 | UNVERIFIED (probably Draft) | no | Switched away in `c9198e8` |
| client_id `ed18e3236b5fb926476320f2b8a303cf` ("rewardspro") | Partner app | Used 2025-10-14 to 2025-10-15 | UNVERIFIED | no | `8f8adb1` / `ec82f8a`; `shopify.app.rewardspro.toml.backup` |
| client_id `538b1257a7f2758345bda2db9337102d` ("rewardspro", dev) | Partner app | OAuth and proxy point at `rewardspro.vercel.app` | UNVERIFIED; **hazard** | no | dev repo `shopify.app.toml:2-5,42-44` |
| Vercel project `rewardspro-production` (`prj_olcLaLOcmg3jKh28LjW2dgh6mUHi`) | host | Remix app. Team plan Pro, Node 22.x, `arn1`, fluid compute, 22 crons. `commandForIgnoringBuildStep: null` | **live (process); data plane UNVERIFIED** | **YES** | Prod `dpl_H3cK6Cm7Rd1wHkBXh9nmD34HEh2x` READY 2026-10-10T23:23Z at `2722104c`. 1,198 deploys in total. Not covered by `.github/scripts/deploy-health.py:34-49` |
| `rewardspro-production.vercel.app` | host | `application_url`, app proxy target, webhooks | live | yes | `/api/health` 200. `/` 200, renders unstyled. `/api/operator/readiness` 401. `/app` with no shop returns 410 |
| `rewardspro-production-nnwf.vercel.app`, `rewardspro-shopify.vercel.app` | hosts | Old deploys | retired (404 `DEPLOYMENT_NOT_FOUND`) | no | Still listed as homepages on GitHub repos |
| `rewardspro.vercel.app` | host | **Not ours.** A third-party "RewardsPro — Employee Rewards" site (Next.js, INR) | n/a | no | Not in team `cambridgetcgs-projects`. Still the dev app URL and the dev repo homepage |
| `rewardspro.io` / `www` | domain | Cloudflare Pages project `rewardspro-landing` (NS Cloudflare, MX Google Workspace) | live | yes | www returns 200 as a duplicate, no redirect. Deploy mode (Git or upload) UNVERIFIED |
| `docs.rewardspro.io` | domain | GitBook | live | yes | `llms-full.txt` 200 |
| `api.rewardspro.io` | domain | Intended v2 host | **no DNS** | — | `dig` returns empty |
| AWS Aurora (`AURORA_RESOURCE_ARN`, Data API) | DB | All app data, including Shopify sessions | **documented gone (2026-07-23); UNVERIFIED today** | — | `shopify.server.ts:9,52`; runtime-v2.md:26-27,35-39 |
| Aurora cluster `rewardspro-dev` | DB | Named in lambda/README as the app DB | deleted per PR #18 body (2026-06-12) | — | `lambda/README.md:77-80`. Whether Vercel prod pointed at it is UNVERIFIED |
| Legacy eu-north-1 stack (`infrastructure/terraform`): 5 Lambdas, 12+3 EventBridge rules, 3 SQS queues each with a DLQ, 2 DynamoDB tables, S3 exports bucket, SNS, CloudWatch dashboard | AWS | Mostly **not called** by the app. The dispatcher hits 9 routes that do not exist | "still-active" per the 07-23 docs; **UNVERIFIED now** | no | `lambda/cron-dispatcher.js:44-99`; `lambda/order-queue-processor.js:180,294,326` (`/api/internal/*` does not exist) |
| IAM user `vercel_service` and its long-lived access key | AWS | Data API, plus Bedrock in code | live (keys in all 3 Vercel envs) | — | `infrastructure/terraform/iam.tf:206,213`. The policy has no `bedrock:*` |
| v2 eu-west-2 Terraform: VPC, ALB, ECS Fargate, RDS PG16 Multi-AZ, SQS+DLQ, Scheduler, Secrets, ECR, OIDC | AWS | v2 target | defined, never applied by CI; a manual apply is UNVERIFIED | — | `rewardspro-api/infrastructure/terraform/*`; state CFN stack `rewardspro-v2-terraform-state` |
| GitHub env `rewardspro-v2-production` | CI | v2 deploy gate | 0 deployments; `branch_policy` only, `can_admins_bypass=true` | — | Runbook claims a reviewer is required (`docs/deployment-runbook.md:73-81`) |
| GitHub secrets `REWARDSPRO_OPERATOR_READINESS_SECRET` (also in Vercel) and `REWARDSPRO_CRON_SECRET` | secrets | Nothing | **orphaned** (0 consumers) | — | Both set 2026-07-23 |
| Sentry (v7, server and client with Replay) | 3rd party | Errors and session replay | live (whether events arrive is UNVERIFIED) | — | `entry.server.tsx:18`, `entry.client.tsx:16-46` |
| Datadog (dd-trace, StatsD to `localhost:8125`) | 3rd party | APM | **probably receives nothing**: no agent, 0 log drains | — | `services/monitoring/datadog.service.ts:6-20,50-52` |
| SendGrid | 3rd party | All email, from `rewards@rewardspro.io` | sending is live; event webhook returns 503; **domain auth broken** | — | `services/sendgrid.server.ts:96,101` |
| Klaviyo | 3rd party | Per-shop private API key path | partial (OAuth not configured) | — | `KLAVIYO_CLIENT_*` absent |
| GitBook API, Bedrock | 3rd party | In-app help assistant; AI email drafting | live / UNVERIFIED | — | `api.gitbook-assistant.tsx:5-8`; `services/anthropic.server.ts:2-33` |
| Vercel KV | 3rd party | Proxy idempotency, entitlement cache | **absent**, falls back to in-memory | — | No `KV_*` env |
| Cambridge TCG Limited 15680297 | legal entity | Publisher | active | — | Companies House: 60 Tottenham Court Road. The listing still shows Hatton Garden |

Vercel env: 48 entries, which is 30 unique names (values not read). Notable names:
- **Present:** AWS keys, `AURORA_*`, `CRON_SECRET`, `DATABASE_URL`, `SENTRY_*`, `SENDGRID_API_KEY`, `DD_*`, `GITBOOK_*`, `ENCRYPTION_SECRET/SALT`, `USE_PRISMA_DRIVER_ADAPTER`, `USE_SQS_QUEUE`, `USE_DYNAMODB_LOCKS`.
- **Absent:** `KV_*`, `EMAIL_ENCRYPTION_KEY`, `SHOPIFY_WEBHOOK_SECRET`, `SENDGRID_WEBHOOK_VERIFICATION_KEY`, `KLAVIYO_*`, `SLACK_*`, `EVENTBRIDGE_ARN`, `SCOPES`, `DD_AGENT_HOST`.

---

## 3. Architecture of the live path

```
 SHOPPER (storefront)                          SHOPPER (customer account)
 theme app ext: 6 blocks, ~11.5k LOC JS/CSS     profile.block.render ext (API 2025-07, ui-extensions-react 2025.7)
   | GET/POST /apps/rewardspro/* (app proxy,      | fetch https://rewardspro-production.vercel.app (hardcoded src/config.ts:37)
   |  HMAC; membership GET IDOR :214-217)         | loyalty/points/gift-cards OK; raffles/missions/boxes/challenges -> 503
   v                                              v
 +--------------------- Vercel: rewardspro-production (Remix 2.16.7, Node 22, arn1) -----------------------+
 | MERCHANT admin  -> app.* (68 files, 16 redirect aliases; Polaris React 12; App Bridge 4; ID-token auth)  |
 | api.proxy.$ (2,307 LOC catch-all, ~17 sub-endpoints; idempotency = in-memory Map, no KV)                 |
 | SHOPIFY webhooks -> webhooks.* : 18 handlers, 9 topics subscribed (toml:16-45)                           |
 |    orders/paid (1,725 LOC, synchronous): tier resolve -> cashback (float :1131)                          |
 |      -> StoreCreditLedger PENDING -> storeCreditAccountCredit (no expiresAt) -> SYNCED                   |
 |    orders/refunded handler exists but is NOT subscribed; clawback is local-only                          |
 |    compliance: data_request TODO; customers/redact cascades; shop/redact always throws; all return 200   |
 | VERCEL CRON (22, hourly to monthly) -> api.cron.* -> acquireCronLock -> prisma.cronLock.create           |
 |    (CronLock table in no migration; any error -> acquired:false -> skipped:true, silent)                 |
 +-------------------------------------------------------+----------------------------------------------+
                                                         v
   db.server.ts --USE_PRISMA_DRIVER_ADAPTER (value unknown)--> legacy Prisma-lookalike (2,431 LOC)
                                                           \-> Prisma 6 driver adapter (571 LOC)
          |  RDS Data API (AURORA_RESOURCE_ARN/SECRET_ARN, long-lived AWS keys, eu-north-1 default)
          v
   AURORA: 107 models incl. Session (offline tokens). DOCUMENTED GONE 2026-07-23 (UNVERIFIED today)

 OUTBOUND
   Shopify Admin GraphQL (pinned January25 -> actually served as 2026-01; 140 call sites)
     storeCreditAccountCredit | productSet/sellingPlan* | MISSING SCOPES: discountCodeBasicCreate,
     draftOrderCreate, giftCardCreate/Credit, subscriptionContract*
   SendGrid raw fetch (SPF permerror, 2x _dmarc, no DKIM); /webhooks/sendgrid -> 503 (no verification key)
   Klaviyo private key (plaintext; EMAIL_ENCRYPTION_KEY absent) + trackCashbackEarned events
   Bedrock (AI email assistant) via AWS keys | Sentry v7 + Replay (maskAllText:false) | Datadog -> nowhere

 NOT WIRED (code/env present, no live caller): SQS order queue (944 LOC, 0 importers), SNS (flag unset),
   S3 export, ElastiCache, DynamoDB locks (only acquireCronLockSmart, unused), Lambda order processor,
   EventBridge dispatcher (9/12 targets missing), api.webhook-register (no EVENTBRIDGE_ARN)

 DARK v2: apps/rewardspro-api: POST /webhooks/shopify -> HMAC -> PG inbox -> worker -> commerce.orders
   (orders/paid only); never deployed; never called by the Vercel app
```

---

## 4. Feature inventory

**Test baseline:**
- The full vitest suite passes: 89 files, 1,649 tests.
- CI runs only `test:unit`: 30 files, 504 tests (`ci.yml:189`). The webhook, compliance and uninstall tests never run in CI.
- Line coverage is **7.14%** (9,536 of 133,401 lines).
- `tsc` reports 0 errors, but the DB client accepts `data: Record<string, any>` (`utils/prisma-data-api-adapter.ts:639-641`), so schema drift in writes goes unchecked.
- Lint is excluded from CI. `test:e2e` points at Playwright, which has no config or specs.

| Feature | State | Tests (area coverage) | Notes / evidence |
|---|---|---|---|
| Tier cashback paid as Shopify store credit (orders/paid) | **REAL** | 40.4% | A customer needs a tier (`webhooks.orders.paid.tsx:1007-1052`). Excludes gift-card and tier products and the portion paid with store credit (:1069-1131). Float math (:1131). PENDING to credit to SYNCED (:1144-1264). Can be turned off per shop (`autoCashbackProcessingEnabled`) |
| PENDING retry (`cashback-reconciliation`, hourly :30) | REAL, if the cron is not skipped | crons 0% | Depends on the CronLock table |
| Store-credit drift reconciliation | PARTIAL | 0% | Detects and reports only (`api.cron.store-credit-reconciliation.tsx:1-12`) |
| Refund clawback | **BROKEN** | handler tests, not in CI | `orders/refunded` not subscribed (removed together with orders/updated in `88cbbbf6`). The handler only writes a local ledger row. It never calls `storeCreditAccountDebit` (`services/refund-handler.server.ts:175-230`) |
| Spend-based VIP tiers, daily maintenance and recalculation crons | **REAL** | tiers 8.3%; tier-resolution has 12 unit tests in CI | Priority: MANUAL_OVERRIDE > subscription > purchase > spending > base. Logic spread over 9 tier services |
| One-time tier membership products | **REAL** | 0% | `app.members.products.tsx:513-700`; `TierPurchase` written in orders.paid (:818-1000) |
| Recurring tier memberships (selling plans and contracts) | STUB | 0% | No `own_subscription_contracts` scope. `SUBSCRIPTION_CONTRACTS_*` not subscribed. No retirement guard |
| Points earned from purchases | DISABLED | — | `getPointsPerDollar` throws (`points-config.server.ts:260-274`) |
| Redeem points for discounts | DISABLED | — | Write functions throw. The customer-account redeem route returns 410 |
| Points as a game currency | REAL | 22.7% | Earned from challenge claims, raffle and box POINTS prizes, admin adjustments, and Zapier inbound `award_points`. Spent only on raffles and boxes |
| Raffles: admin, hourly status and draw crons, storefront entry | REAL | 2.0% (some tests only grep source text) | Draw uses crypto RNG. The draw cron does not deliver prizes |
| Raffle prize delivery | **BROKEN** | — | Admin delivery passes no admin client. A `RAFFLE-XXXXXXXX` code is marked delivered but never created in Shopify (`raffles.$id.tsx:402,421,441`; `raffle-prize-delivery.server.ts:264-317`). STORE_CREDIT prizes write `type:"ADJUSTMENT"`, which is not a valid enum value, and omit the required `balance` (:351). Scopes missing. No winner email |
| Mystery boxes | REAL; STORE_CREDIT reward BROKEN | 2.0% | The delivery cron does pass an admin client. Same ADJUSTMENT bug (`mystery-box-delivery.server.ts:350`). PRODUCT and CUSTOM rewards wait for manual fulfilment |
| Missions and challenges | PARTIAL | 2.3% | SPENDING, ORDER_COUNT and PRODUCT_PURCHASE progress. REFERRAL, REVIEW and SOCIAL_SHARE never do. STREAK calls a function that does not exist (`processStreakProgress`) |
| Spin wheel | STUB | — | Config UI only (`app.rewards.config.tsx:594-609`) |
| Gift cards (convert store credit to a gift card) | PARTIAL, likely ACCESS_DENIED | 3.5% | No `write_gift_cards` scope |
| Storefront widgets via app proxy | REAL | proxy 1.9% | Membership GET has a cross-customer read (section 6b). Idempotency is per instance only |
| Customer-account profile block | PARTIAL | — | Live: loyalty, points, gift cards. Returning 503 `CUSTOMER_ACCOUNT_IDENTITY_BINDING_REQUIRED`: raffles, missions, boxes, challenges. Moving to a current API version needs a rewrite |
| Order and customer sync | REAL | — | afterAuth backfill, plus orders/create, paid, cancelled and fulfilled, plus customers/create |
| Campaign email (manual, plus hourly scheduled) | REAL | 0% / email 1.3% | Capacity limits are advisory only. With no event webhook, bounces and suppressions are not recorded |
| Transactional emails | PARTIAL | — | Sent: welcome, tier up and down, tier expiry, admin points-earned. Missing: a cashback-earned email (only a Klaviyo event) and a winner email |
| Automations | PARTIAL | 1.8% | Of 18 triggers, 3 fire. Of 4 actions, only `send_email` runs. `PendingAutomation` is never processed (`automation-trigger.server.ts`) |
| Klaviyo | PARTIAL | — | The API-key path works, with the key stored in plaintext. OAuth is not configured |
| Integrations (Zapier, Slack, Gorgias, ReCharge, Judge.me, rules engine, referral) | STUB / DEAD | 0.5% | Inbound returns 503. Rules engine and referral have no importers. Outbound dispatchers are never called. Slack fails closed. The UI labels them "Coming Soon", which is honest |
| Member CSV export | REAL | 0% | 500-row batches; the limit is advisory |
| Analytics | REAL | 10.2%; 11 unit tests in CI | export.csv, realtime and points-analytics are not linked from the UI |
| AI email assistant (Bedrock) | UNKNOWN | — | The IAM policy lacks `bedrock:*` |
| Merchant billing | RETIRED | contract test in CI | Returns 410. The 12-plan catalogue is kept for legacy recognition. The 3 billing crons still run |
| Plan limits and feature gates | ADVISORY | — | `checkLimitAccess` always returns true. Every flag is true, but read from `ShopEntitlements` rows; whether those were backfilled is UNVERIFIED |
| GDPR compliance webhooks | **BROKEN** | none | See section 6b |
| Uninstall cleanup | PARTIAL | test exists, not in CI | Covers 56 of 107 models, runs immediately, and swallows errors |
| POS, Shopify Flow, Functions, checkout extension | NONE | — | `[pos] embedded=false`. No Flow code |
| Health | Liveness only | — | Readiness requires the `CRON_SECRET` bearer |

---

## 5. Truth gaps (claims vs reality)

| Claim | Where | Reality | Evidence |
|---|---|---|---|
| "Refunds are handled automatically… cashback is reversed" | Remix `/` FAQ | Refunds are not subscribed, and clawback never debits Shopify | `app/routes/_index/route.tsx:47-48`; toml; refund-handler:175-230 |
| A styled landing page with "© 2025" and 8 footer links | Remix `/` | Tailwind classes but no Tailwind CSS loaded, so it renders unstyled (code evidence, not looked at in a browser). All 8 footer links return 404 | route.tsx (145 `className=`); the 2 CSS bundles match 0 of those classes. The fix exists only in rewardspro-production (`cd02df7`) |
| "Earning X points per $1 spent… on every purchase" | In-app Loyalty Overview | Points are not earned from purchases | `app.rewards._index.tsx:318-322` |
| 18 automation triggers and 4 actions | In-app builder | 3 triggers fire and 1 action runs; delays are dropped | `app.marketing.automation.create.tsx:85-214` |
| Referral, review and social-share missions | In-app | Never progress | `challenge-progress.server.ts:283-341` |
| Spin-wheel settings | In-app | No implementation | Section 4 |
| Raffle prize "delivered" with a code | In-app | The code is never created in Shopify | `raffle-prize-delivery.server.ts:264-317` |
| "Consider a larger fixed plan" | In-app advisories | Paid plans are retired | `require-feature.server.ts:149`; `email-usage-control.server.ts:141` |
| Title "Loyalty, Points, Cashback, Raffles & Mystery Box Rewards" | App Store | Points are only a game currency. Prize delivery is defective. No winner emails | Section 4 |
| "No theme modifications or custom code" | App Store | The app's own FAQ says widgets may need theme-specific setup; there are 2 app-embed blocks and 4 section blocks | Critic #4 |
| "Sell VIP Memberships as Products"; categories Subscriptions and Gift cards | App Store | One-time membership works. Recurring is not wired. Gift-card scope is missing | Section 4 |
| Developer address "34-35 Hatton Garden" | App Store | The registered office is 60 Tottenham Court Road | Companies House 15680297; privacy policy |
| Missions, raffles and boxes: "Customer flow paused" | rewardspro.io | Only the customer-account surface is paused. The same flows are live on the storefront widget | `api.proxy.$.tsx:1827-2206` |
| Email settings "Max and Ultra plans only"; quota table "Max 10,000 / Ultra Unlimited"; Starter/Growth/Max/Ultra feature matrix; "Manual review queue on Growth and Max"; "may require plan upgrade" | docs.rewardspro.io | Every feature is on every plan. Email capacity is 1k / 10k / 25k / 100k. Paid changes return 410 | `llms-full.txt:214,8109-8114,8345-8350,8565-8577,7599,8623-8629`; `pricing-contract.ts`; `entitlement-contract.ts:65-97` |
| A "current billing status" link, plus 106 links in total | docs | Point into the **private** GitHub repo and return 404 publicly (55 to 73 unique, depending on how URLs are normalised) | Critic #13 |
| In-app help links `/klaviyo`, `/features/email-campaigns`, `/features/mystery-boxes` | App to docs | Return 404. The docs say nothing about raffles, boxes, challenges or Klaviyo | Web-surfaces map |
| support@rewardspro.io | docs | Every other surface uses contact@rewardspro.io | `HelpAssistant.tsx:54` |
| Points earning and redemption, per-tier earn rates, recurring subscriptions, automation delays, Slack and Zapier LIVE, Shopify Flow PARTIAL, customer-account raffles; missions listed as PLANNED | `PRODUCT_VISION.md` | All overstated, except missions, which are understated. No Flow code exists | `PRODUCT_VISION.md:51,135-160,202,293-300,412-453` |
| "Earn and redeem points"; "Shopify GraphQL (2026-01)" | README | Redemption is disabled. The SDK is pinned to 2025-01 | `README.md:72`; `shopify.server.ts:48,318` |
| Lint red (817/1029), about 24 crons, 306 tests | CLAUDE.md | PR #37 claims lint is clean; 22 crons; 1,649 tests | CLAUDE.md:29,79-81 |
| `cambridgetcg/rewardspro` is "a stale ancestor" | runtime-v2.md:12-13 | It shares no history with the monorepo. The ancestor is rewardspro-production | Critic #6 |
| The v2 environment requires reviewer approval | deployment-runbook.md:73-81 | Branch policy only, and admins can bypass | gh API |
| Uninstall "does not itself start a reliable automatic deletion timer" | Privacy policy | The code hard-deletes immediately on uninstall | `webhooks.app.uninstalled.tsx:24-77` |
| `/api/health` returns "ok" | Live | Process liveness only; the database is not checked | `api.operator.readiness.tsx:14-33` |
| Review earns a 90-day Pro trial (2026-03-08 to 2026-07-23) | Past in-app offer | Breaks Built for Shopify rule 4.3.2. Now removed | `638f4ce6` added it; `c1bd5550` removed it |

---

## 6. Obligations

### 6a. What a rebuild must preserve

| Obligation | Basis | Implication |
|---|---|---|
| Shoppers' store credit already issued stays valid | Issued via `storeCreditAccountCredit` with no `expiresAt` (`shopify-store-credit.service.ts:226-235`). It sits in merchants' Shopify accounts. The free-first decision says never delete, expire or reduce points, cashback, store credit or tier progress (`docs/decisions/2026-07-23-rewardspro-free-first-pricing.md:105-148,185-220`) | Do not touch balances. Rebuild the record of RewardsPro-issued credit from Shopify's store-credit transaction history, because the local ledger is probably lost. Decide the refund-clawback policy before turning on any debits |
| Gift cards and discount codes already issued | They exist in Shopify | Reconcile them; do not reissue |
| Grandfathered merchant app subscriptions | Same decision: recognise legacy plan aliases, never cancel opportunistically, never downgrade to Free when a lookup fails, keep the legacy resolver until every subscription is accounted for | Read `currentAppInstallation.activeSubscriptions` per shop. Keep the alias map in `pricing-contract.ts`. Keep `NEW_PAID_SUBSCRIPTIONS_RETIRED` semantics unless Yu decides otherwise |
| Installed merchants | Count UNVERIFIED. Commit `6476498b` (2026-03-08) names 2 paying non-test shops, `rpwmw0-xj` and `6e824e-a9`. `DEMO-JUDY.md:111` says "9 stores", which is unverified marketing copy | Keep the identity (client_id `026ce3bf`, handle, proxy `apps/rewardspro`, extension uids), or plan a migration with merchant notice |
| Points and tier progress | Stored only in the RewardsPro DB. Metafields hold config and flags plus a `customer_id` only (`points-metafield-sync.server.ts:1-30`) | If the DB is gone, these are already lost, which conflicts with the "never reduce" rule. Telling merchants is Yu's decision |
| GDPR / Shopify mandatory compliance | Topics routed to `/webhooks/compliance` | Persist a job before acknowledging. Actually deliver `data_request`. Track the 30-day deadline. Generate deletion coverage from the schema. Keep financial retention lawful. Run the tests in CI |
| Data held by processors | Sentry (Replay), SendGrid, Klaviyo, GitBook, Bedrock, AWS (Sweden), and possibly eu-north-1 S3, SQS and DynamoDB | Redaction must reach them, and the subprocessor list in the privacy policy must match |
| Supported API versions | Unsupported pins fall forward to the oldest supported version. 2026-01 stays supported until 2027-01-16 (critic #8) | Target a currently supported version. The customer-account extension needs `@shopify/ui-extensions` 2026.x, which means a rewrite |
| Public commitments | Privacy policy (last updated 2026-07-23), the listing, contact@ | Update them together after the decision |

### 6b. Live liabilities today (do not carry forward; fixing them is Yu's call)

| Liability | Evidence |
|---|---|
| **Cross-customer PII read.** When `logged_in_customer_id` is empty, the membership GET falls back to `customer_id`, `customerId` or `cid`. It returns email, name, total spent and store credit. Client-added parameters still pass the HMAC check. Not exploited live | `api.proxy.$.tsx:214-217`, SQL ~:359-366, PII :626-638. The safe helper `getProxyCustomerId` (:82-86) is not used here |
| **`shop/redact` can never succeed.** `tx.cronLockV2.deleteMany` is not a model, so it throws a TypeError and the transaction aborts. The handler still returns 200. Introduced in `a3cbf316` (2026-01-07) | `webhooks.compliance.tsx:423`, :542-549 |
| `customers/data_request` never delivers anything | `webhooks.compliance.tsx:169-261` (TODO at :257) |
| `customers/redact` cascade-deletes the orders it intends to keep for tax (per the checked-in schema), and returns 200 even on error | :79-93, :349-379; `Order.customer` is `onDelete: Cascade` |
| Uninstall hard-deletes immediately (56 of 107 models) and swallows errors | `services/shop-data-cleanup.server.ts:55-72,312-322` |
| All 18 lock-using crons may skip every run without any alert. The `CronLock` model was in the schema only from `333d490b` to `8a45e13c` and was never migrated | `services/cron-lock.server.ts:72,136` |
| Refunds leave shoppers with real credit while the app ledger drifts | Section 4 |
| Prize delivery reports success that did not happen; undeclared scopes cause runtime ACCESS_DENIED | Section 4; toml `[access_scopes]`; no `SCOPES` env |
| Double-spend protection is per instance only, because there is no KV | `api.proxy.$.tsx:89-124` |
| Klaviyo private keys stored in plaintext | `utils/encryption.server.ts:32-36`; `app.marketing.klaviyo.tsx:41,254` |
| Sentry Replay records admin pages unmasked (10% of sessions, 100% on error, `maskAllText:false`). Disclosed in the privacy policy | `entry.client.tsx:24,44-46` |
| Email domain authentication broken. The SPF include `dc-aa8e722993._spfm.rewardspro.io` is NXDOMAIN, so SPF permerrors. There are two `_dmarc` records, so no DMARC policy applies. No SendGrid DKIM records | DNS via 1.1.1.1 (critic gap 3) |
| Long-lived AWS keys in all 3 Vercel envs. The Aurora password sits in git history (removed in `2d3c69c6`; PR #18 closed unmerged). Standalone repos track `tfplan` and `.mcp.json`. Rotation is UNVERIFIED | Sections 2 and 4 |
| A stray `shopify app deploy` from rewardspro-production or rewardspro-shopify could overwrite the live config and extensions | Both carry client_id `026ce3bf` |
| Dev app `538b1257` sends OAuth and proxy traffic to a domain owned by someone else | `rewardspro.vercel.app` |
| Zombie listing: the app is installable while the data plane is likely dead, and no monitor covers it | `deploy-health.py:34-49` |
| Every unrelated main commit ships to prod without waiting for RewardsPro CI | `commandForIgnoringBuildStep: null`; 2722104c's CI run 38094842357 was red, with the rewardspro job skipped |

---

## 7. Complexity and cost hotspots

| Hotspot | Size | Why it is accidental | Suggested action |
|---|---|---|---|
| Unreachable modules | 114 files, 35,526 LOC (static-import scan) | No route reaches them | Delete; do not port |
| Data-access layer | Legacy Prisma-lookalike 2,431 + driver adapter 571 + Data API session store; 5 proxied tables missing from the schema | A workaround for the Data API | Use a plain Postgres connection with real Prisma types |
| Migrations | 30 Prisma migrations + 46 `scripts/apply-*` + manual SQL | Two systems | Keep one |
| Schema | 107 models / 63 enums / 4,767 lines | 6 webhook-idempotency models; about 12 billing models; 9 AI dev-telemetry models plus a seed route | Collapse to one inbox table keyed by `X-Shopify-Webhook-Id`, and drop the telemetry |
| Tier logic | 9 services (about 5.3k LOC) | Several claim to be "the single source of truth" | One resolver writing one projection |
| Duplicated subsystems | Klaviyo ×3; 2 loggers + pino; 2,967 `console.*`; 1,178 `any`; custom webhook HMAC checks | — | One of each |
| Retired billing | 12-plan catalogue, entitlements, usage records, 3 billing crons (about 8.7k LOC) | The app is Free-only | Keep only legacy-alias recognition |
| Tier subscriptions and selling plans | About 23.6k LOC | Scopes and topics were never declared | Drop, or finish properly |
| Optional product scope | Marketing hub 24.3k, analytics/AI 17.6k, raffles 11.7k, missions 10.1k, boxes 9k, integrations 9k, points 5.5k, gift cards 4.1k | Compare the core: tiers 8.6k plus store credit 3.7k | Justify each one separately (heuristic LOC) |
| Giant files | `app.members._index` 4,057; `app.settings._index` 3,509; `app.members.products` 3,291; `app.orders` 2,805; `app.analytics` 2,633; proxy 2,307; `orders.paid` 1,725 | — | Thin handlers |
| Route surface | 171 routes, including 16 redirect aliases, about 8 tombstones, and 2 unregistered files in `routes/api/` | — | Prune |
| AWS sprawl | Unwired SQS, SNS, S3, ElastiCache, DynamoDB, Lambda and EventBridge code, plus legacy Terraform (3,087) and lambda (2,516) | No runtime path uses them | Delete. Retiring the eu-north-1 stack is a separate decision (runtime-v2.md:164-166) |
| Observability | Datadog on serverless with no agent | Probably ingests nothing | Drop; use Sentry plus one structured logger |
| Unused dependencies | 18, among them `@react-pdf/renderer`, `@sendgrid/mail`, `openai`, `@visx/*`, `chartjs-*`, `@upstash/ratelimit` | — | Drop |
| Platform drift | Polaris React is deprecated (76 files import it). Remix 2 is superseded by `@shopify/shopify-app-react-router` 3.0.2. Sentry 7 vs 11.6. Prisma 6.19 vs 7.10. The customer-account extension needs a rewrite | — | An in-place upgrade means touching 76 files and 140 GraphQL call sites anyway |
| Theme assets | About 11.5k hand-written lines (`membership-widget.css` alone is 3,090) | — | Rebuild smaller |
| Non-app code | scripts 31k LOC (210 files), tools 7k, docs 21.6k markdown lines | — | Review before carrying anything over |
| Test quality | Some tests grep source text or mock the module they import; coverage 7% | False confidence | Behavioural tests per kept feature, with the whole suite in CI |

**Cost.** These are rough estimates from the maps, not measured.

| Item | Estimate | Status |
|---|---|---|
| v2 as designed, prod-shaped (RDS Multi-AZ db.t4g.medium, 2 NAT, ALB, Fargate ×3, Secrets, CloudWatch) | about $290-340/mo | Not running (manual apply UNVERIFIED) |
| v2 bootstrap or dev (1 NAT, 0 tasks; Multi-AZ RDS, NAT and ALB stay on) | about $170-200/mo | Same |
| Legacy Aurora Serverless v2 floor, if it exists | about $45+/mo plus storage and I/O | UNVERIFIED |
| Legacy Lambda, SQS, EventBridge and DynamoDB | cents to a few dollars per month | UNVERIFIED |
| Vercel Pro seat and fluid compute; 22 crons; builds on every monorepo commit (1,198 deploys in total) | unknown | Usage not queried |
| Sentry, SendGrid, GitBook, Bedrock (per token) | unknown | — |

---

## 8. Rebuild shapes (not a decision) and open questions

| Shape | What | Pros | Cons | Fits if |
|---|---|---|---|---|
| **A. Thin core, current Shopify template, self-contained** | `@shopify/shopify-app-react-router`, Polaris web components and App Bridge, plain Postgres. Keep only the core: tiers, cashback ledger, a real refund flow, sync, admin, storefront widget, a rewritten customer-account block, GDPR, and a reconciliation importer from Shopify. Webhooks declared in the toml; thin handler into an inbox, a worker behind it; integer money; one scheduler with real locks | Smallest and cheapest. Matches the Free-only, no-KPI stance. Leaves behind about 35k unreachable LOC and the optional scope | Sets aside the v2 AWS work. The listing title and categories must change. Merchants who use gamification, if any, lose it. Host still to be chosen | The DB is gone and Yu wants low cost and low maintenance |
| **B. Shopify app as a thin connector and UI over `rewardspro-api` (v2)** | Follows the 2026-07-23 decision (RDS + pg, eu-west-2, ECS). The Shopify app handles auth, sessions, admin UI and extensions. v2 handles the inbox, outbox, workers and ledger | Reuses tested pieces: the HMAC inbox, normalized events, outbox to SQS with a DLQ, checksummed advisory-locked migrations, least-privilege roles, OIDC CI with migration gates. Gives RDS recovery guarantees. A base for the WooCommerce "Planned" and headless API ideas | v2 has no loyalty domain, no OAuth or sessions, no UI, so most of the work is still ahead. Two deployables. About $290-340/mo prod-shaped for a Free app. Still needs an ACM cert, a hostname and env protection fixes. v2 has a single `/webhooks/shopify`, while the toml uses per-topic URIs | Yu wants AWS-grade durability and a multi-platform future |
| **C. In-place salvage (strangler)** | Fix the 6b items, delete unreachable and retired code, then migrate Remix to React Router and Polaris React to web components step by step | No change to the Shopify identity. The admin UX stays. No data migration *if the DB is alive* | Pointless if Aurora is gone. Carries 203k LOC and 107 models. The framework and extension rewrites are needed anyway. The Data API layer stays unless replaced | Readiness shows a live DB with real merchant data |

**Needed whichever shape is chosen:**
- Ground truth on the DB (section 9) comes first.
- Treat the monorepo as the only source.
- Add an ignore-build step and RewardsPro monitoring.
- Take identity only from the signed `logged_in_customer_id`.
- Derive scopes from the features actually kept.
- Reconcile from Shopify before any new earning goes live.
- Do not build a third backend.

**Worth salvaging:**
- From rewardspro-production: the landing redesign (`cd02df7`, `601e788`, `9e36e34`). It is the only fix for the unstyled `/`.
- From `feat/honest-monetization`: `app/utils/money.ts`, the `isBillableOrderPayload` test-order gate (`b9ed5ea`), the onboarding services and `SetupChecklist` (`e0ac2b3`), and `app.loyalty-impact.tsx` (`6adcf44`). Skip its heartbeat workflows.
- Patterns from the dev repo's zerone commits: server-side pagination and aggregate queries.
- The v2 seam pieces listed under shape B.

**Open questions only Yu can answer:**
1. What happens to the listing *now*: delist or unpublish, keep it up with a maintenance notice, or keep it installable while the rebuild runs? The ops map rates the last option worst.
2. Does the 2026-09-23 stance (Free-only, no KPI or commercial goal) still hold? It sets the cost ceiling, the scope, and whether Built for Shopify matters at all.
3. Keep the same Shopify app (`026ce3bf`, the listing, existing installs and subscriptions), or start a new app?
4. Which optional scope survives: raffles, mystery boxes, missions, points, gift cards, marketing hub and automations, Klaviyo, analytics, integrations, recurring memberships?
5. What do "Points" mean: earned from purchases and redeemable, or only a game currency? If the latter, the listing title changes.
6. Refunds: claw back from the shopper's Shopify store credit or not? Should new store credit have an expiry policy?
7. Hosting and cost: stay with AWS v2 at roughly $300/mo, or reopen the runtime-v2 decision (it compared Railway and Fly) for a lighter host?
8. If the DB is gone, accept the loss of points and tier progress and tell merchants? If a snapshot exists, migrate it?
9. Which shopper surface is canonical: the storefront theme widget or the customer-account extension?
10. Repos: archive rewardspro-shopify and rewardspro now, and rewardspro-production after salvage? Remove the prod client_id from them?
11. Delete the orphaned Partner apps `f04b5854`, `ed18e3236` and `538b1257` (the last one points at a stranger's domain)?
12. Secrets: rotate or remove the Vercel AWS keys, the Aurora password left in history, and whatever `tfplan` and `.mcp.json` reference?
13. Keep a single marketing surface (rewardspro.io), with the Remix `/` reduced to a redirect?
14. Retire the eu-north-1 legacy stack? This needs its own decision.

---

## 9. Unknowns that need owner-level access

| Unknown | Access needed | What it decides |
|---|---|---|
| Is the Aurora cluster behind `AURORA_RESOURCE_ARN` alive? Do any snapshots exist (including `rewardspro-dev`)? | AWS console/CLI for eu-north-1, **or** a `CRON_SECRET` call to `/api/operator/readiness`, **or** Vercel function logs | Everything: shape C, data migration, merchant communication |
| Values of `USE_PRISMA_DRIVER_ADAPTER`, `USE_SQS_QUEUE`, `USE_DYNAMODB_LOCKS`, `METRICS_DATA_API` | Vercel env values | Which DB path is live |
| Does a `CronLock` table exist? Are crons returning `skipped:true`? Do cron runs succeed? Why were the two 2026-09-29 deploys BLOCKED? | Vercel cron and function logs, plus the DB | Whether reconciliation, raffle draws and box delivery ever ran |
| Do the eu-north-1 Lambda, SQS, DynamoDB, S3, SNS and EventBridge resources still exist, cost money, or hold PII? Was any v2 eu-west-2 resource or TF state stack created by hand? | AWS | Cost and GDPR reach |
| Which account and region the Vercel AWS keys map to; key age; whether Bedrock is permitted | AWS IAM | Rotation plan |
| Installed shops, active grandfathered subscriptions, and per-shop RewardsPro-issued store credit, gift cards and discounts | Partner Dashboard and per-shop Admin API | The obligations in 6a |
| Granted scopes vs the toml; the deployed app version and extension versions; leftover per-shop webhooks (orders/refunded, app_subscriptions/update, subscription_contracts/*) | Partner Dashboard | Whether refunds or scopes behave differently live |
| Is ShopEntitlements backfilled? What is the live schema (e.g. the Order cascade)? Real data volume and feature usage; how many Klaviyo keys are stored in plaintext | DB | Migration scope |
| Does Shopify's app proxy overwrite a client-supplied `logged_in_customer_id`? | A dev-store test | How far the proxy identity issue reaches |
| Will the 2025-07 customer-account extension keep running? Are there pending listing edits? Web Vitals / Built for Shopify data | Partner Dashboard | Timing of the extension rewrite |
| Status of the orphaned apps `f04b5854`, `ed18e3236`, `538b1257`, and their installs | Partner Dashboard | Cleanup scope |
| SendGrid domain authentication and inbox placement; Sentry intake and Replay retention; Datadog ingest | Vendor consoles | Email and observability choices |
| Cloudflare Pages deploy mode; GitBook sync config; whether a support@ mailbox exists | Cloudflare, GitBook, Google Workspace | Surface ownership |
| Contents of `tfplan`, `.mcp.json` and `claude-desktop-config.json`; whether the Aurora password was rotated | Repo access with secret handling | Rotation plan |
| Who owns `rewardspro.vercel.app` | Outside our Vercel scope | Brand and redirect risk |
| Running costs: Vercel usage, Sentry, SendGrid, GitBook, Bedrock | Billing consoles | Cost baseline |
| Current lint state (PR #37 says clean; CLAUDE.md says red) | A local run that writes an ESLint cache | Minor |

---

### Where the maps conflicted, and what I used

| Topic | Resolution |
|---|---|
| Route count | 171 registered; `ls` shows 172 because it includes directories |
| Test files | 89 = 84 under `test/` + 2 under `app/` + 3 under `tools/` |
| DynamoDB cron locks | Not reachable from any route; `USE_DYNAMODB_LOCKS` has no effect (the api-and-infra map said "live") |
| Env vars | 48 entries = 30 unique names, including `DATABASE_URL` |
| Encryption | Two modules: `ENCRYPTION_SECRET` (live) and `EMAIL_ENCRYPTION_KEY` (absent, falls back to plaintext) |
| Proxy PII line numbers | :626-638, not :324-339 |
| Real git ancestor | rewardspro-production, not `cambridgetcg/rewardspro` |
| Standalone repos | 6 |
| Shopify API version | Pinned to 2025-01 but served as 2026-01 (falls forward) |
| Vercel plan | Pro, so hourly crons are allowed; whether they succeed is UNVERIFIED |
| Remix `/` | Unstyled, from code evidence |
| rewardspro-api size | src 4,546 LOC; 11,020 counting all tracked files |
| Lineage deploy dates | rewardspro-shopify deploys ran to 2025-12-02 (the last was `fa668e30`) |
| `rewardspro.vercel.app` | Third-party site, not the dev app |

Scratch evidence is in `/private/tmp/claude-501/-Users-macair/be3bdad1-179a-4ab4-a179-ae2e27f432f0/scratchpad/rp-map/` and `/private/tmp/claude-501/-Users-macair/be3bdad1-179a-4ab4-a179-ae2e27f432f0/scratchpad/critic/`.