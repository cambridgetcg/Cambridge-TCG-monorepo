# RewardsPro v3: final rebuild spec (shape A, same Shopify app)

**Status:** this is the final spec, dated 2026-10-11. It was produced read-only. Nothing in it has been built, deployed or rotated.

**How it was made:** the highest-scoring design ("risk-first", rated 8.2 / 8.5 / 8.0) is the base. The judges' best ideas from "mvp-first" and "merchant-first" were grafted on, and every error the judges flagged is fixed (Appendix B lists them).

**Labels used throughout:**
- **VERIFY**: must be proven on a dev store or in a dashboard before anything depends on it.
- **ASSUMPTION**: a choice made without evidence.
- **[Sx] / [Vx] / [Lx]**: references, listed in Appendix C.

Old source is cited relative to `/Users/macair/Desktop/Cambridge-TCG-monorepo/apps/rewardspro` (HEAD `2722104c`).

---

## 0. Decisions recap

### 0.1 Owner decisions (Yu, 2026-10-11): requirements

| # | Decision | What it means here |
|---|---|---|
| O1 | Rebuild **shape A**: a thin core on the current Shopify React Router template, self-contained plain Postgres, no legacy AWS | Assume **zero legacy data**: points, tier progress, sessions and the ledger are gone. Store credit already issued lives in Shopify and stays valid |
| O2 | **Same Shopify app**: client_id `026ce3bf073bed0e44ae8eab09d1ae3a`, handle `RewardsproMembership`, listing "Rewards Pro" (public, passed review, Free-only) | Keep the proxy path and the extension uids, handles, block filenames and setting ids, so merchants' placements survive |
| O3 | **All feature areas** stay; merging or dropping genuinely redundant pieces is allowed | Explicit keep / merge / drop table in §4 |
| O4 | **Refunds claw back cashback store credit**, and the spent-before-refund loophole is closed | §5: integer minor units, idempotency, reconciliation from Shopify |
| O5 | Running cost of about **£200–300/month** total | §1.4: about £20–40 at launch, worst case with every configured cap hit about £191 |
| O6 | Monetise **later** with a subscription that does **not** limit features and sells **AI credits**, plus a possible API wrapper. "Jev-like models" are cheap models that automate low-level decisions | §9. Model choice stays open. This reverses the 2026-09-23 "no new paid subscriptions" stance and must go through Shopify billing |
| O7 | The new app must **not** deploy on every monorepo commit | §2: Git deploys disabled; CI deploys on path change plus green tests plus a reviewer |

### 0.2 What this spec decides

| ID | Decision | Section |
|---|---|---|
| D1 | New directory `apps/rewardspro-app`. New Vercel projects (prod and staging) in `lhr1` behind `app.rewardspro.io`. **Neon Postgres, London**. Postgres is both the system of record and the job queue | §1, §2 |
| D2 | Three Shopify configs: a **Dev** app (default), a **Staging** app (its own client_id, auto-deployed as the canary), and **Prod** `026ce3bf` (manual, reviewer-gated, `--no-release`) | §2 |
| D3 | Shopify is only the **payout rail**. Truth lives in an append-only ledger in BigInt minor units. Every order is **settled to a target recomputed from the re-fetched order**, never accumulated from webhook payloads | §5 |
| D4 | Loophole closure has several layers: **30-day hold after fulfilment** (with a backstop), a **return/dispute freeze**, a staff-facing order block, debit `min(owed, live balance)` with a 10-minute recheck, per-currency **debt** netted against future releases, points maturity, tier re-rating, credit-paid tender excluded from earning, and credit-to-gift-card conversion dropped | §5 |
| D5 | **Intent-first `shopify_op`.** At most one op in SENT or UNKNOWN per (shop, customer, currency). An UNKNOWN op is resolved from Shopify's transaction history and **never retried blind**. Releases are **coalesced** into one credit per customer per run | §5 |
| D6 | Per-shop **`money_mode` OFF / SHADOW / LIVE**, a per-shop kill switch, a global `MONEY_WRITES_ENABLED`, daily invariants with a circuit breaker, and cron heartbeats wired into `/readyz` | §5.7, §1.3 |
| D7 | Every existing shop stays **DORMANT** until its merchant reopens the app, because the tokens died with the DB. The first open runs bootstrap, then onboarding, then an explicit **Start earning** that sets `earning_enabled_at`. Legacy credit is never debited | §8 |
| D8 | Two releases. **V1 "bridge"**: the rewritten customer-account extension plus compliance and uninstall webhooks moved to the new host. **V2 "cutover"**: everything else. The client secret is **rotated before V2** | §8 |
| D9 | No names, emails or addresses are stored. Webhook inbox rows hold ID hints only. **No `customers/update` subscription**, which prevents feedback loops. Tokens are encrypted at the application layer. A GDPR redaction registry is enforced in CI | §7 |
| D10 | Raffles, boxes and the wheel become **one prize engine** with a mandatory free route and commit-reveal draws. Automations move to **Shopify Flow**. Campaigns become **segments plus Shopify Messaging / Klaviyo**. Bespoke integrations are dropped in favour of Flow | §4 |
| D11 | Tier mirror: a **customer tag `rp-tier:<key>` on by default** (segments, discounts, Flow) plus an app-owned JSON metafield (display) | §4.2 |
| D12 | Required scopes are today's set minus the unused ones, **plus `read_returns` and `read_customer_merge`**. Both are batched into the approval every merchant must give on reopen anyway. Everything else new goes in `optional_scopes` | §6.1 |
| D13 | AI credits use the **Manual Billing API** with a merchant-set `cappedAmount`, which is a hard ceiling enforced by Shopify. App Pricing is used only if the census shows no paid merchants **and** Yu prefers the hosted page. When credits run out, every AI feature falls back to its rule or template equivalent | §9 |

---

## 1. Architecture, stack and monthly cost

### 1.1 Stack (pin exact versions at scaffold; runtime libraries at least 2 weeks old)

| Layer | Choice | Version / note | Ref |
|---|---|---|---|
| Template | `Shopify/shopify-app-template-react-router` | `@shopify/shopify-app-react-router` ^3.0.1, i.e. 3.0.x (3.0.2 was published 2026-10-08, so pin it after about 10-22). `react-router` 7.18.2. Node ≥22.12 | [S1][S2] |
| Admin API | `ApiVersion.October26`; webhooks `api_version = "2026-10"`; `distribution: AppStore`; `future.expiringOfflineAccessTokens: true` | 2026-10 is accessible until 2027-10-16 | [S3][S6] |
| Admin UI | Polaris **web components** pinned with `polarisUrl` to polaris-1.1 and `@shopify/polaris-types` ~1.1; `@shopify/app-bridge-react` **^4.2** | Polaris React is deprecated. The npm `latest` tag for app-bridge-react points at 3.7.12, which is a trap | [S4][S5] |
| Extensions | Customer-account and admin extensions: `@shopify/ui-extensions` **2026.7.x** (API 2026-07), Preact. Theme: Liquid plus vanilla JS | 2026-10 is still RC for extensions. The CLI refuses API versions older than 12 months | [S3][S21] |
| DB | **Neon Launch**, `aws-eu-west-2` (London). Minimum 0.25 CU always on, autoscale **capped at 1 CU**, 7-day PITR. Non-prod lives in a **separate Neon project** | A project's region cannot be changed later. Postgres major is the Neon default (VERIFY) | [V6] |
| ORM / sessions | **Prisma 6.19.x pinned** plus `@shopify/shopify-app-session-storage-prisma` 11.0.1, wrapped in an encrypting adapter (§7) | `prisma@latest` is the 8.0 RC; the adapter's peer dependency is ^6.19 | [S2] |
| GraphQL types | `@shopify/api-codegen-preset` against the 2026-10 schema | Replaces 140 untyped call sites | — |
| Money maths | A BigInt-only module plus a bundled ISO-4217 exponent table | The old float/2dp `money.ts` is not reused | — |
| Validation | zod on every external input (webhooks, proxy, Flow, AI output) | — | — |
| Jobs | Postgres `job` table claimed with `FOR UPDATE SKIP LOCKED`; `waitUntil` for an immediate start; Vercel Cron for sweep, hourly, daily and weekly | Vercel Queues is beta and is not the record [V4]. Pro allows per-minute crons [V2] | [V1][V2] |
| Email | **Resend**, starting on the free tier (3k/month, 100/day), sending from `send.rewardspro.io`, behind a `MailTransport` port | SES is cheaper ($0.10/1k) but needs a new AWS account [V8]. Resend stores account data in the US [V7] | [V7][V8] |
| Errors | Sentry, **new EU org**, Developer plan (free). Replay **off**, `sendDefaultPii:false`, `beforeSend` scrubbing | EU storage must be chosen when the org is created | [V9] |
| Logs | pino JSON with redaction paths. Business telemetry lives in Postgres, because Vercel Pro keeps runtime logs for only 1 day | — | [V5] |
| Backups | Neon PITR, plus a nightly `pg_dump` encrypted with age and uploaded from GitHub Actions to an **R2 EU-jurisdiction** bucket (free tier) | Enabling R2 needs a payment method; current status is UNVERIFIED | [V10] |
| Tests | vitest plus fast-check against a real Postgres service container; recorded GraphQL fixtures; `@shopify/ui-extensions-tester` | The whole suite runs in CI | — |
| CLI | `@shopify/cli` 4.9.x as a devDependency; prod deploys only from CI | — | [S22] |

### 1.2 Runtime diagram

```
SHOPIFY (system of record: orders, customers, store-credit balances, discounts)
 webhooks(toml,2026-10,HMAC) | app proxy /apps/rewardspro/* (HMAC, 1×logged_in_customer_id)
 customer-account exts (session token: sub,dest; CORS *) | admin (App Bridge ID token) + admin blocks
 Flow actions (HMAC, action_run_id)
            │
            ▼
┌──────── Vercel rewardspro-app · lhr1 · https://app.rewardspro.io ─────────────────────────────┐
│ /webhooks/*   verify → INSERT webhook_inbox(webhook_id PK, ID hints) + job → 200 (<1 s)        │
│               → waitUntil(drain)        dormant shop → census row only                          │
│ /app/* admin · /proxy/* storefront JSON · /ca/* customer-account JSON · /ext/admin/* · /flow/*  │
│ /internal/cron/{sweep 1m, hourly, daily, weekly}  (Bearer CRON_SECRET; ~50 s budget/run)       │
│   inbox → reconcile_order(re-fetch Order) → ledger + shopify_op plan                            │
│   op sender (≤1 SENT/UNKNOWN per shop×customer×currency) → storeCreditAccountCredit/Debit       │
│   op resolver (UNKNOWN → account.transactions) · release_customer (coalesced)                   │
│   outbox: email | flowTriggerReceive | Klaviyo · tiers · bootstrap(bulk ops) · token refresh   │
│   reconcile/verify/invariants/liability · GDPR deadlines · purge                               │
│ /healthz (liveness)  /readyz (DB, heartbeat age, inbox lag, UNKNOWN>1h, NEEDS_REVIEW, GDPR due) │
└───────────┬──────────────────────────────────┬────────────────────────────┬──────────────────┘
            ▼                                  ▼                            ▼
  Neon PG London (PITR 7 d)            Resend (transactional)        Sentry EU
  roles rp_migrator/rp_app/rp_ro        Shopify notify:true on credit  nightly age-encrypted pg_dump → R2 EU
Later: Klaviyo OAuth · Sidekick ext · AI Gateway (hard budget) behind DecisionPort/TextPort
```

### 1.3 Jobs and scheduling rules

- **One `job` table.** Coalescing uses a partial unique index on `(kind, dedupe_key) WHERE status IN ('QUEUED','RUNNING')`. A `locked_until` visibility timeout recovers jobs from crashed instances.
- **Locks.** Use **transaction-level advisory locks only** (`pg_advisory_xact_lock`), because Neon's pooled endpoint runs PgBouncer in transaction mode. **No DB transaction may stay open across a Shopify network call**, with one exception: the token refresh, which is short and serialised per shop. The guarantee for store-credit mutations comes from the **partial unique index** on `shopify_op`, not from a lock (§5.4).
- **Four crons replace the old 22:**
  - `* * * * *` sweep;
  - `0 * * * *` hourly (releases, token refresh, bulk-op polling);
  - `15 3 * * *` daily (72 h reconcile, tier roll-off, GID sample, liability, write-offs, GDPR deadlines, purge, invariants);
  - `0 4 * * 0` weekly (full GID verification, restore-drill reminder).
- **Heartbeats.** Every cron writes `cron_heartbeat`. `/readyz` reports degraded when the sweep heartbeat is more than 5 minutes old. This fixes the old silent `CronLock` skip (`services/cron-lock.server.ts:72,136`).
- **Long work** (bulk operations, backfills) runs as resumable steps under 60 s each, with a checkpoint in `job.state`. Vercel's function limit is 300 s by default and 800 s at most [V3].

### 1.4 Monthly cost against the £200–300 ceiling (USD, VAT excluded; £1 ≈ $1.32 [V12], so the ceiling ≈ $264–396)

Workload is an **ASSUMPTION**; nothing was measured, because the DB is gone. Launch means fewer than 10 active shops. The 100-shop column assumes about 30k orders, 150k webhooks and 0.5M proxy calls per month.

| Line | Launch | 100 shops | Hard-capped worst case | Basis |
|---|---|---|---|---|
| Vercel Pro seat (existing team) | $0 incremental | $0–20 | $20 if attributed | [V1] |
| Vercel usage (prod and staging) | $3–5 | $5–15 | $40 at the spend **alert** (an alert, not a hard cap) | lhr1: $0.177/h CPU, $0.0146/GB-h, $0.60/1M invocations [V1] |
| Neon prod (0.25 CU floor, cap 1 CU, storage, PITR) | ~$20–22 | $25–41 | ~$80 (1 CU × 730 h × $0.106 + storage) | $0.106/CU-h, $0.35/GB-mo, PITR $0.20/GB-mo [V6] |
| Neon non-prod project (scale-to-zero) | $1–5 | $2–5 | $10 | Estimate |
| Email (Resend) | $0 (free tier) | $20–35 (Pro 50k / 100k) | $35 plus a global daily send cap | [V7] |
| Sentry EU | $0 | $0–26 | $26 (Team, annual-billed price; the monthly price is UNVERIFIED) | [V9] |
| R2 EU (dumps) | $0 | $0–1 | $1 | [V10] |
| AI (M9 only) | $0 | $0 | $40 gateway budget | [V11] |
| **Total** | **$24–32 (≈£18–24)**; with the seat attributed, $44–52 (≈£33–39) | **$52–143 (≈£39–108)** | **≈$252 (≈£191)** | |

**Cost guardrails:**
- No in-app bulk campaign email. It is the only line that could break the budget: 400k emails is about $350 on Resend [V7].
- Storefront first paint comes from metafields.
- Analytics are precomputed nightly.
- Webhook topics are pruned and `include_fields` is used.
- Neon CU is capped. Email send caps: 2,000 per shop per day and 5,000 globally per day.
- AI Gateway has a hard budget.

**Rejected options [infra track]:**
- AWS v2: $170–340, and the account is gone.
- Supabase: PITR costs $100/month.
- Prisma Postgres: no PITR.
- Inngest: the free tier pauses at 50k executions.
- Vercel Workflows as the queue: about $27/month for work Postgres does for free.
- Fly with MPG: a viable fallback at about $66–162, but it brings container operations and Fly's MPG still lists patching and alerting as "under development".

Because Postgres holds all state, moving to Fly later is a host swap, not a rewrite.

---

## 2. Repo, projects and CI

### 2.1 Monorepo layout

```
apps/rewardspro/                       # LEGACY zombie: maintenance patch only; tagged + deleted at M8
apps/rewardspro-app/                   # NEW v3  (package @rewardspro/app)
  app/
    domain/   money/ tiers/ cashback/ points/ games/ missions/ memberships/ compliance/  (pure TS, no I/O)
    services/ shopify/(typed docs, per-shop throttle, withShopAdmin) ledger/ ops/ jobs/ outbox/ bootstrap/
    routes/   app.* · webhooks.$ · webhooks.compliance · proxy.$ · ca.* · ext.admin.* · flow.* ·
              internal.cron.$ · healthz · readyz
    shopify.server.ts  db.server.ts  session-storage.server.ts (encrypting wrapper)
  prisma/schema.prisma + migrations/ (raw SQL: triggers, partial indexes, roles, SECURITY DEFINER fns)
  extensions/
    rewardspro-theme-extension/   # uid a58b9b10-e482-42f9-90d4-885a20081116e17dfcf9 (KEPT), 6 legacy blocks (+ spin_wheel in M7)
    rewardspro-membership/        # uid be72a1b4-3ed3-d78d-61f7-19361e1583d89ba79ee3 (KEPT), handle rewardspro-membership
    rewardspro-account-page/      # NEW customer-account.page.render
    rewardspro-order-status/      # NEW customer-account order-status block (target name VERIFY)
    rewardspro-admin-order/       # NEW admin.order-details.block.render
    rewardspro-admin-customer/    # NEW admin.customer-details.block.render
    rewardspro-flow-*/            # NEW Flow triggers/actions (M5/M6)
  shopify.app.toml                # DEV app (default config)
  shopify.app.staging.toml        # STAGING app (new client_id) → staging.rewardspro.io
  shopify.app.production.toml     # 026ce3bf… — only the gated CI job uses it
  test/ unit/ db/ contract/ fixtures/webhooks-2026-10/ e2e-checklist.md
  vercel.json
```

- **Workspace.** Add `apps/rewardspro-app/extensions/*` to `pnpm-workspace.yaml`.
- **Package names must be unique** (`@rewardspro-app/ext-*`). The legacy package `rewardspro-membership` would otherwise collide. Extension handles live in the toml and are unaffected [cutover track].

### 2.2 Vercel projects (owner decision O7)

| Project | Root | Domain | Git deploys | Deployed by |
|---|---|---|---|---|
| `rewardspro-app` (prod) | `apps/rewardspro-app` | `app.rewardspro.io` (Cloudflare CNAME, DNS only) | **disabled** | CI `promote` job only |
| `rewardspro-app-staging` | same | `staging.rewardspro.io` | **disabled** | CI on push to `main` when the path filter matches and tests pass |
| `rewardspro-production` (legacy) | `apps/rewardspro` | `rewardspro-production.vercel.app` | Disabled **after** the P0 patch lands (Ignored Build Step `exit 0`, or Git disconnected) | Manual only |

`vercel.json` (prod; staging is the same with its own crons):

```json
{
  "regions": ["lhr1"],
  "git": { "deploymentEnabled": false },
  "crons": [
    { "path": "/internal/cron/sweep",  "schedule": "* * * * *" },
    { "path": "/internal/cron/hourly", "schedule": "0 * * * *" },
    { "path": "/internal/cron/daily",  "schedule": "15 3 * * *" },
    { "path": "/internal/cron/weekly", "schedule": "0 4 * * 0" }
  ]
}
```

- If Git deploys ever have to be re-enabled, use `ignoreCommand: git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ../../pnpm-lock.yaml ../../pnpm-workspace.yaml`. `VERCEL_GIT_PREVIOUS_SHA` is exposed only when an Ignored Build Step is set [V13].
- Sensitive env, prod: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` (+ `SHOPIFY_API_SECRET_PREVIOUS` during rotation), `DATABASE_URL` (pooled, `rp_app`), `CRON_SECRET`, `OPS_TOKEN`, `TOKEN_ENC_KEY_v1`, `ACTION_TOKEN_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`.
- `DIRECT_URL` (`rp_migrator`), R2 keys and the age recipient exist **only** in the GitHub environment. **No AWS keys anywhere.**

### 2.3 CI (`.github/workflows/rewardspro-app.yml`; dorny filter `apps/rewardspro-app/**` + lockfile)

The legacy filter `apps/rewardspro/**` does not match the new directory.

| Stage | Trigger | Contents |
|---|---|---|
| verify | PR and push | typecheck, lint, `gitleaks`, vitest (unit plus DB tests on `postgres` service: migrations, ledger triggers, locks, invariants, property tests), GraphQL codegen drift, theme-check, **bundle gates** (customer-account block ≤64 KB, page ≤128 KB, theme JS ≤10 KB gzipped per block [S20]), migration dry-run against non-prod |
| contract | PR and push | **Identity contract tests**, listed below. Security contracts: unsigned proxy → 401; duplicate `logged_in_customer_id` or any `customer_id/customerId/cid` on `/v3` → 400; bad-HMAC webhook → 401; all 3 compliance topics persist before acking; uninstall path; GDPR registry covers every Prisma model |
| staging | push to `main`, filter hit, green | `vercel deploy --prebuilt` to the staging project; `shopify app deploy --config staging` (auto-release); smoke checks on a dev store |
| promote (prod) | `workflow_dispatch`, GitHub env `rewardspro-app-production`: required reviewer ≠ author, **admin bypass off** | `prisma migrate deploy` (expand/contract only), then `vercel deploy --prebuilt --prod`, then smoke checks (`/readyz` 200, unsigned proxy 401) |
| shopify-prod | `workflow_dispatch`, same env | `shopify app deploy --config production --no-release --allow-updates --message … --source-control-url …`; the CLI diff is uploaded as an artifact. **Abort if any extension shows as created or deleted rather than updated.** Never pass `--allow-deletes`. `shopify app release --version=…` is a separate manual step [S22] |

**Identity contract tests.** CI fails if any of these drift:
- `client_id`, `handle`, `name`;
- proxy `prefix=apps` and `subpath=rewardspro`;
- `automatically_update_urls_on_dev=false`;
- both kept extension uids and handles, and the CA target `customer-account.profile.block.render`;
- the 6 block filenames: `membership_widget`, `missions_widget`, `raffles`, `mystery_boxes`, `gift_cards`, `missions_section`;
- the **18 legacy setting ids**: `heading`, `show_bundles`, `show_issued`, `grid_columns`, `empty_message`, `primary_color`, `bg_color`, `cache_duration`, `guest_message`, `guest_cta_text`, `guest_cta_url`, `enable_api_calls`, `default_tab`, `section_title`, `show_rarity`, `animation_speed`, `show_images`, `show_countdown` (extracted from `extensions/theme-app-extension-rewardspro/blocks/*.liquid`);
- required scopes ⊆ the allow-list.

### 2.4 Dev and staging apps

| Config | client_id | Notes |
|---|---|---|
| `shopify.app.toml` (default) | **new Dev app** | `shopify app dev` against a tunnel; `automatically_update_urls_on_dev=true` is fine here |
| `shopify.app.staging.toml` | **new Staging app** | Extension canary. Installed on dev stores. Request `network_access` (approved automatically) |
| `shopify.app.production.toml` | `026ce3bf…` | Never the default. `automatically_update_urls_on_dev=false` (the current prod toml has `true`, which could repoint live URLs on `dev`) [S23] |

- Dev and staging **omit `read_all_orders`**. Declaring an approval-required scope before approval fails version creation [S16]. The code degrades to a 60-day window when the scope is missing.
- Data separation (Level 2) [S12]: non-prod uses the **separate Neon project `rewardspro-nonprod`**, with synthetic data only. Never use a branch of prod: a branch copies prod data.
- **Never reuse** `538b1257` (its URLs point at a third party's `rewardspro.vercel.app`), `f04b5854` or `ed18e3236`.

---

## 3. Data model (Postgres)

**Conventions:**
- Every table carries `shop_id uuid`.
- Shopify IDs are GID `text`.
- `customer_ref` is a GID, or `redacted:<HMAC>` after redaction.
- Money is a signed `bigint *_minor` plus `currency char(3)`. The exponent comes from the bundled ISO-4217 table, never from `Intl`. Shopify decimal strings are parsed with BigInt. **No floats.**
- Mutable aggregates carry `version`.
- **Ledgers are append-only:** `REVOKE UPDATE, DELETE` from `rp_app`, plus a `BEFORE UPDATE OR DELETE` trigger that raises an exception, except inside the `SECURITY DEFINER` functions `redact_customer()` and `redact_shop()`.
- **No names, emails, phone numbers or addresses are stored.**

### 3.1 Platform

| Table | Key columns |
|---|---|
| `shop` | `id`, `domain UNIQUE`, `shop_gid`, `status DORMANT\|ONBOARDING\|ACTIVE\|PAUSED\|UNINSTALLED\|REDACTED`, `token_status OK\|NEEDS_REOPEN`, `money_mode OFF\|SHADOW\|LIVE`, `kill_switch bool`, `earning_enabled_at`, `shop_currency`, `iana_tz`, `customer_accounts_version`, `granted_scopes text[]`, `installed_at`, `uninstalled_at`, `bootstrap_state jsonb`, `bulk_import_watermark` |
| `session` | Template model (incl. `refreshToken`, `refreshTokenExpires`). Tokens are AES-256-GCM ciphertext plus `key_version` |
| `program_settings` | One row per shop, versioned and audit-logged. Cashback, points and tier policy (§5.2 defaults): `hold_days`, `hold_anchor`, `backstop_days`, `include_shipping`, `include_tax`, `excluded_product_gids[]`, `excluded_collection_gids[]`, `pos_eligible`, `b2b_eligible`, `draft_eligible`, `credit_currency_mode`, `credit_expiry_days`, `notify_on_credit`, `clawback_scope`, `recover_debt_from_refund_credit`, `debt_write_off_days`, `block_conversion_on_debt`, `block_paid_plays_on_debt`, `instant_ack_by/at`, `tier_window`, `grace_days`, `warn_days[]`, `mirror_tag`, `tier_tag_prefix`, `points_*` |
| `webhook_inbox` | `webhook_id PK` (X-Shopify-Webhook-Id), `shop_id`, `topic`, `event_id`, `triggered_at`, `api_version`, `hint jsonb` (resource, order and customer GIDs, `updated_at` only), `status RECEIVED\|DONE\|SKIPPED\|FAILED`, `attempts`, `last_error`, `processed_at`. Deleted at 30 days |
| `dormant_shop_census` | `shop_domain PK`, `first_seen`, `last_seen`, `topic_counts jsonb`. **No payloads** for shops without a token |
| `job` | `id`, `kind`, `shop_id`, `dedupe_key`, `run_at`, `priority`, `status`, `attempts`, `max_attempts`, `locked_until`, `state jsonb` (IDs only), `last_error` |
| `cron_heartbeat` | `name PK`, `last_started_at`, `last_ok_at`, `last_error`, `duration_ms` |
| `audit_log` | `id`, `shop_id`, `actor` (`staff:<sub>`\|`system`\|`flow:<action_run_id>`\|`ai:<decision>`), `action`, `target_ref`, `diff jsonb` (no PII), `reason`, `at` |
| `compliance_request` | `webhook_id PK`, `shop_id`, `topic`, `customer_ref` (pseudonymised once DONE), `received_at`, `due_at` (+30 d), `status`, `completed_at`, `evidence jsonb` (report kept 30 d, then nulled) |
| `invariant_check` | `run_at`, `name`, `shop_id`, `violations`, `sample jsonb` (IDs) |
| `legacy_census` | `shop_id`, `active_subscription_name`, `alias_resolved`, `selling_plan_groups jsonb`, `rp_metafields jsonb`, `legacy_tier_tags[]`, `checked_at` |
| `domain_event` (outbox) | `id`, `shop_id`, `type`, `customer_ref`, `aggregate_ref`, `payload jsonb` (IDs, amounts), `suppress_notify`, `idempotency_key UNIQUE`, `created_at`. Written **in the same transaction** as the state change |
| `delivery` | PK `(event_id, channel EMAIL\|FLOW\|KLAVIYO\|METAFIELD)`, `status`, `attempts`, `next_attempt_at`, `provider_ref`, `last_error` |

### 3.2 Tiers and memberships

| Table | Key columns |
|---|---|
| `tier` | `id`, `shop_id`, `key`, `name`, `sort`, `threshold_shop_minor`, `cashback_bps`, `points_multiplier_bps` (10000 = 1×), `perks jsonb`, `color`, `icon`, `is_base`, `archived_at` |
| `customer_state` | PK `(shop_id, customer_ref)`, `effective_tier_id`, `source MANUAL\|MEMBERSHIP\|SPEND\|BASE`, `window_spend_shop_minor`, `lifetime_spend_shop_minor`, `to_next_minor`, `grace_until`, `tier_since`, `mirrored_version`, `version` |
| `tier_override` | `id`, `shop_id`, `customer_ref`, `tier_id`, `reason`, `actor`, `expires_at`, `revoked_at` |
| `tier_event` | `id`, `shop_id`, `customer_ref`, `from_tier`, `to_tier`, `source`, `cause_ref`, `suppress_notify`, `at` |
| `order_fact` | PK `(shop_id, order_gid)`, `customer_ref`, `paid_at`, `processed_at`, `net_shop_minor` (eligible merchandise net of refunds), `refunded_shop_minor`, `cancelled_at`, `is_test`, `is_b2b`, `source_name`, `presentment_currency`, `updated_at`, `origin BULK\|WEBHOOK\|SWEEP`. Numbers only |
| `membership_product` | PK `(shop_id, variant_gid)`, `product_gid`, `tier_id`, `duration_days NULL` (null = until revoked) |
| `membership` | `id`, `shop_id`, `customer_ref`, `tier_id`, `source PURCHASE\|FLOW\|MANUAL`, `order_gid`, `line_item_gid`, `starts_at`, `ends_at`, `revoked_at`, `revoke_reason` |

### 3.3 Money core (DDL sketch)

```sql
create table cashback_order (
  shop_id uuid, order_gid text, customer_ref text, currency char(3), exponent smallint,  -- presentment
  rate_bps int not null, rate_tier_id uuid, rate_basis jsonb,          -- locked at first accrual; may only be lowered (§5.3 re-rate)
  tender_share_ppm int not null,                                        -- RECOMPUTED every reconcile (not locked)
  state text not null,           -- INELIGIBLE|PENDING|ON_HOLD|RELEASABLE|ISSUED|VOID|NEEDS_REVIEW
  hold_anchor_at timestamptz, backstop_at timestamptz, hold_until timestamptz, hold_reason text,
  target_minor bigint not null default 0 check (target_minor >= 0),
  pending_minor bigint not null default 0 check (pending_minor >= 0),
  issued_minor bigint not null default 0 check (issued_minor >= 0),    -- net CONFIRMED to Shopify for this order
  clawed_minor bigint not null default 0, shortfall_minor bigint not null default 0,
  rechecked_at timestamptz, order_updated_at timestamptz, last_reconciled_at timestamptz, version int,
  primary key (shop_id, order_gid));

create table shopify_op (
  id uuid primary key,                         -- uuidv5(idempotency_key)
  shop_id uuid, customer_ref text, currency char(3),
  direction text check (direction in ('CREDIT','DEBIT')),
  amount_minor bigint check (amount_minor > 0),
  purpose text,                                -- CASHBACK_RELEASE|CLAWBACK|DEBT_RECOVER|PRIZE|CONVERSION|MANUAL
  plan jsonb not null,                         -- per-order tranches / debt offsets this op settles
  notify bool not null default false, expires_at timestamptz,
  status text,           -- PLANNED|SHADOW|SENT|CONFIRMED|REJECTED|UNKNOWN|NEEDS_REVIEW|CANCELLED
  idempotency_key text unique not null, balance_before_minor bigint, sent_at timestamptz,
  checks int default 0, shopify_txn_gid text unique, balance_after_minor bigint,
  error_code text, resolved_by text, resolved_at timestamptz);
create unique index one_inflight_per_account on shopify_op(shop_id, customer_ref, currency)
  where status in ('SENT','UNKNOWN');          -- PLANNED excluded; stale PLANNED (>15 min) reaped to CANCELLED

create table ledger_entry (                    -- append-only
  id bigint generated always as identity primary key,
  shop_id uuid, customer_ref text, currency char(3), order_gid text,
  bucket text check (bucket in ('PENDING','ISSUED','DEBT')),
  kind text,  -- ACCRUE|ADJUST|VOID|RELEASE|CLAWBACK|DEBT_RECORD|DEBT_OFFSET|DEBT_RECOVER|DEBT_WRITE_OFF
              -- |PRIZE_CREDIT|CONVERSION_CREDIT|MANUAL_CREDIT|MANUAL_DEBIT
  amount_minor bigint not null check (amount_minor <> 0),
  cause_ref text not null, shopify_op_id uuid references shopify_op(id), actor text not null,
  idempotency_key text unique not null, created_at timestamptz default now());

-- projections (rebuildable from ledger): money_account(shop_id, customer_ref, currency, pending, issued, debt,
--   debt_opened_at, last_shopify_balance_minor, last_balance_at)
-- liability_snapshot(shop_id, day, currency, pending, own_remaining /* Σ remainingAmount of our credit txns */,
--   debt, legacy_balance_total /* aggregate only */)
-- recon_finding(id, shop_id, kind OP_MISSING|AMOUNT_MISMATCH|ORDER_DRIFT|UNATTRIBUTED_TXN, ref, details, found_at, resolved_at)
```

### 3.4 Points, games, missions (created in their milestones; no empty tables in R1)

| Table | Key columns |
|---|---|
| `points_ledger` | Append-only. `shop_id`, `customer_ref`, `bucket PENDING\|AVAILABLE`, `delta bigint`, `reason ORDER\|ORDER_REVERSAL\|MATURE\|MISSION\|PRIZE\|ADMIN\|FLOW\|GAME_SPEND\|GAME_REFUND\|CONVERSION\|EXPIRY\|GOODWILL`, `source_key UNIQUE`, `expires_at`, `actor` |
| `points_balance` | `available` (may be <0), `pending`, `lifetime_earned`, `lifetime_spent`, `version` |
| `game` | `mode DRAW\|INSTANT`, `skin RAFFLE\|BOX\|WHEEL`, `starts_at`, `ends_at`, `draw_at`, `cost_points`, `free_plays_per_period int CHECK (>=1)`, `period DAY\|WEEK\|GAME`, `per_customer_cap`, `tier_gate uuid[]`, `status DRAFT\|SCHEDULED\|LIVE\|CLOSED\|DRAWN\|CANCELLED`, `seed_commit`, `seed_reveal`, `pity_after NULL`, `terms_md` |
| `prize` | `game_id`, `kind POINTS\|STORE_CREDIT\|DISCOUNT_CODE\|FREE_PRODUCT\|FREE_SHIPPING\|GIFT_CARD\|MANUAL\|NOTHING`, `value jsonb`, `weight`, `quantity`, `stock_left CHECK (>=0)` |
| `play` | `game_id`, `customer_ref`, `idempotency_key UNIQUE`, `period_key`, `entry FREE\|POINTS`, `points_spent`, `result_prize_id`, `rng_audit jsonb` |
| `award` | `play_id`, `prize_id`, `state PENDING\|DELIVERING\|DELIVERED\|FAILED\|MANUAL_PENDING\|MANUAL_DONE\|VOID`, `shopify_object_gid`, `shopify_op_id`. **CHECK: DELIVERED ⇒ object GID, or a CONFIRMED op, or kind ∈ {POINTS, NOTHING}** |
| `mission` | `objective ORDER_COUNT\|SPEND\|PRODUCT\|COLLECTION\|EXTERNAL_EVENT`, `params jsonb`, `cadence ONCE\|DAILY\|WEEKLY\|MONTHLY` (shop timezone), `tier_gate`, `reward jsonb` ({points} \| {prize_id} \| {free_plays}), `reverse_on_refund` (true) |
| `mission_contribution` | UNIQUE `(mission_id, source_ref)` (order GID or `action_run_id`), `amount`, `reversed_at` |
| `mission_progress` | PK `(mission_id, customer_ref, period_key)`, `value`, `completed_at`, `claimed_at`, `reward_ref` |

### 3.5 Messaging, integrations, AI placeholders

- **Messaging and integrations:**
  - `notification_setting(shop_id, event_type, email_on, flow_on, klaviyo_on, template jsonb)`
  - `email_brand(shop_id, from_name, reply_to, logo_url, colors, footer_md)`
  - `email_suppression(shop_id, email_hmac, reason, at)`
  - `klaviyo_connection(shop_id, account_id, access_token_enc, refresh_token_enc, key_version, scopes, status)`
- **AI placeholders, created in M9:**
  - `ai_budget(shop_id, period_start, allowance_mc, hard_cap_mc, used_mc, reserved_mc, kill_switch)`
  - `ai_credit_ledger` (append-only millicredits; `RESERVE|COMMIT|RELEASE|ALLOWANCE_GRANT|PURCHASE|REFUND|ADJUST|EXPIRE`, plus model, provider, tokens in/cached/out, `provider_cost_micro_usd`, and a unique `idempotency_key`)
  - `ai_decision(… status PROPOSED|APPROVED|REJECTED|AUTO_APPLIED|UNDONE …)`
  - `billing_usage_outbox(… idempotency_key ≤255 (≤64 for App Events) …)`
  - `api_key` (later)

**Redaction registry.** Every model is declared in `domain/compliance/registry.ts` as `DELETE`, `PSEUDONYMISE` or `KEEP_AGGREGATE`. CI fails on any unregistered model.

---

## 4. Feature catalogue: keep / merge / drop, with v1 specs

### 4.1 Calls

| Owner's area | Call | v3 shape | Milestone | Reason |
|---|---|---|---|---|
| VIP tiers (spend, manual override, base) | **Keep (core)** | One resolver writes one projection. Rebuilt from Shopify order history. Mirrored to a tag and a metafield | M3 | Most of the value. The old code had 9 competing tier services |
| Tier perks | **Merge → native discounts** | "Create tier perk" wizard: segment `customer_tags CONTAINS 'rp-tier:<key>'`, then a discount with `context.customerSegments` (optional `write_discounts`, requested at first use) | M5 | No Function needed. Functions cannot call our backend anyway [S26][S27] |
| Cashback as store credit | **Keep (core, redesigned)** | §5 | M3/M4 | O4 |
| One-time membership products | **Keep** | Variant maps to tier and duration. Granted on paid, revoked on line refund, **re-rates pending accruals** | M5 | Works today, small |
| Recurring memberships (selling plans, contracts) | **Merge into one-time** | Renewal orders from *any* subscription app extend the grant. Legacy selling-plan groups detached with merchant consent | M5 | Was a stub. `own_subscription_contracts` needs approval [S16] |
| Points | **Keep, one internal currency** | Integer. May go negative. Pending until the source order's hold releases. Earned from optional per-order earning, missions, prizes, admin, Flow. Spent on games and (M7) on conversion to store credit | M6 | Required by missions and games |
| Points → discount codes | **Drop** | Replaced by points → store credit through the money ledger | — | One money path |
| Raffles, mystery boxes, spin wheel | **Merge → one prize engine** | DRAW or INSTANT; raffle, box and wheel skins; mandatory free route; public odds; commit-reveal draws | M7 | Three stacks (~14k LOC) with the same delivery bugs |
| Near-miss, stacked multipliers, instant-win feeds | **Drop** | Opt-in transparent pity only | — | Dark patterns, regulatory risk |
| Missions / challenges | **Keep, event-driven, reversible** | Order objectives plus `EXTERNAL_EVENT` through a Flow action (e.g. the Judge.me "New review received" trigger) | M6 | Old REFERRAL, REVIEW and SOCIAL never progressed; STREAK called a missing function |
| XP, levels, combos, streak multipliers | **Drop** | "N consecutive periods" can return as a mission objective | — | A second ladder that competes with tiers |
| Referrals | **Defer** (post-parity) | Mission objective plus referral link, with self-referral guards | after M8 | The old code had no importers; needs a fraud design |
| Automations (18-trigger builder) | **Merge → Shopify Flow** | Triggers and actions plus templates | M5/M6 | 3 of 18 triggers fired. Flow is free on Basic and up; public-app tasks run on every Flow plan [S24] |
| Campaigns (bulk email) | **Merge → segments + Shopify Messaging / Klaviyo** | "Audiences" page: tier and status segments with deep links | M5 | Broken deliverability, and the only line that threatens the budget. Messaging gives 10k free emails/month, then $1 per 1,000 [S28] |
| Transactional email | **Keep, small set** | §4.2 messaging | M4 (clawback and on-the-way) / M5 (rest) | Shopify does not send these |
| Messaging engine | **Merge → one outbox** | Channels: email, Flow, Klaviyo, metafield | M5 | Replaces scattered senders |
| Klaviyo | **Keep, OAuth only** | Events with `unique_id`, plus profile properties; no list sync | M5 | Old private keys were plaintext. Mixing OAuth with keys duplicates metrics [V14] |
| Zapier, Slack, Gorgias, ReCharge, Judge.me, rules engine | **Drop as bespoke code** | Covered by Flow, tags and metafields | — | Dead or 503 today |
| Analytics | **Keep, compact, honest** | Members by tier and moves; cashback pending / issued / clawed / debt; **liability**; member vs non-member repeat rate and AOV (labelled as correlation); points; prize cost; missions. No invented benchmarks | M3 (money KPIs), M8 | The old insight engine used hard-coded "industry benchmarks" (`services/analytics-recommendations.server.ts:4-12`) |
| Programme simulator | **Add (free, rule-based)** | Over real `order_fact`: tier mix, cashback liability, thresholds suggested at P70/P90/P97 | M3 (basic), M8 (full) | Merchant value; also feeds AI rationale later |
| Sidekick app-data extension | **Add** | Read-only programme data for Shopify's assistant (limits: 20 tools, 4,000-token responses) | M8 | Free Q&A at no inference cost to us [S30] |
| Member export | **Keep** | Assembled in the browser from paginated loader calls; emails fetched per page; audit-logged with a required reason | M3 | No server-side PII file; avoids the 4.5 MB limit |
| Gift cards: convert store credit → gift card | **Drop** | — | — | Moves clawback-able value into a bearer instrument. The old flow never debited Shopify (`services/gift-card/gift-card.service.ts:495-560`) |
| Gift cards: as a prize | **Keep (optional)** | Needs `write_gift_cards` (grantability UNVERIFIED); otherwise a STORE_CREDIT prize | M7 | — |
| `gift_cards` theme block | **Keep filename, repurpose** | Becomes the Wallet panel: available credit, pending cashback with dates, how to spend | M4 | Preserves placements |
| Storefront widget | **Keep, rebuilt small** | Same uid and 6 filenames plus `spin_wheel` (M7). Unshipped blocks render nothing | M4 → M7 | Themes reference block filenames |
| Customer-account extension | **Keep, rewrite, primary surface** | Profile block (same uid and handle), full page, order-status block | M2 (neutral) / M4 | Legacy accounts deprecated 2026-02-26; store credit needs new accounts [S19][S8] |
| Admin order and customer blocks | **Add** | Accrual, hold, issued, **spent**, what would be clawed, debt; a "deduct before refunding" hint | M3 | The only point where money is recovered without creating debt |
| Admin "refund to store credit" | **Drop** | Shopify does this natively now | — | The old path risked a double refund (`services/shopify-store-credit.service.ts:562-742`) |
| GDPR handlers | **Keep, rebuilt** | Persist, then acknowledge; registry; deadline alarms | M1 | Broken today |
| AI email assistant (Bedrock), GitBook help bot, Datadog | **Drop now** | Returns as AI credits (M9) or docs / Sidekick | — | Dead path |
| Billing catalogue, entitlements, usage records | **Drop** | Only legacy-alias recognition stays, for the census | M0 | Free-only |
| API wrapper | **Defer** | §9.6 | after M8 | Undefined today |

### 4.2 v1 behaviour specs

**Tiers**
- **Effective tier** = active manual override (may also downgrade). Otherwise the **highest** of active-membership tier, spend tier and base tier.
  - Change from the old rule (purchase > spend): a bought Silver must never hide an earned Gold. This is an owner question (Q6).
- **Spend:** Σ `order_fact.net_shop_minor` (excluding test, cancelled, shipping, tax and gift cards) in the window. ROLLING_365 by default, or LIFETIME.
  - LIFETIME bootstraps from a full-history bulk import (`read_all_orders`).
  - Fallback when that scope is missing: `Customer.amountSpent` (whether it is net of refunds is UNVERIFIED) plus a 60-day window.
- **Grace and recompute:**
  - Downgrades wait `grace_days` (30), with warnings at 7 and 1 days. Upgrades are immediate.
  - Recompute triggers: `reconcile_order`, membership change, override, daily roll-off (only customers whose orders crossed the window boundary).
- **Mirror:**
  - Tag `rp-tier:<key>`, **on by default**. Old tier tags are removed.
  - App-owned JSON metafield `$app:loyalty` with `{tier_key, tier_name, progress_bps, to_next_minor, expires_at, points_available, cashback_pending_minor}` and `access.customer_account="read"`.
  - Writes are batched (`metafieldsSet`, 25 per call) and only happen on change.
  - Segments filter on the tag, because JSON metafields are not segment-filterable.
  - `customers/update` is **not** subscribed, so these writes cannot loop.
- **Backfill:** tier changes caused by the bootstrap backfill carry `suppress_notify=true`, so **no mass emails**.
- **Onboarding pre-fill:** tier names come from legacy "Tier Membership" products (productType and tags `tier-membership/<tier>/<duration>`, per `app/routes/app.members.products.tsx:560-571`). Thresholds come from P70/P90/P97 of imported spend.

**Cashback** (full policy in §5)
- **Rates** are in bps per tier (so 2.5% is possible). The base tier carries a rate, which may be 0.
- **Exclusions:** gift-card lines, membership lines, merchant products and collections, and any tender paid by store credit or gift card.
- **Hard prerequisite:** **new customer accounts**. On shops still on classic accounts, *cashback* stays disabled with an explanation; tiers, points and games still work.
  - The help centre mentions redemption via Shop Pay sign-in too, while the API docs say new customer accounts. VERIFY before relaxing this [S8].
- **Disclosure at onboarding:** stores created on or after 2025-05-12 pay third-party transaction fees on the store-credit tender [S8].

**Memberships (M5)**
- A paid line of a mapped variant grants a membership, or extends one: `starts_at = max(now, current ends_at)`.
- Refunding that line revokes **that grant only**, and **re-rates pending accruals** that used its tier (§5.3).
- Renewal orders from any subscription app extend the membership. Lapse = `ends_at` plus grace, with emails at T−7 days and at lapse.
- **Legacy cleanup:** at bootstrap, list selling-plan groups on tier products (`read_purchase_options`). The merchant confirms, then we detach them. Otherwise they keep selling "subscriptions" nobody renews.

**Points (M6)**
- Integer; merchant can rename the currency; expiry optional and off by default.
- Order points accrue **PENDING** and mature (`MATURE`, PENDING → AVAILABLE) when the order's cashback hold releases. Mission rewards tied to orders mature at the latest contributing order's release. Admin, Flow and prize points are available immediately.
- Reversals post immediately to AVAILABLE and may make it negative. **No spending or conversion while AVAILABLE < 0.**
- Per-order formula (shop money, integers only): `points = floor(eligibleNet_shop_minor × tender_share_ppm × points_per_major_milli × tier_mult_bps / (10^exp × 10^6 × 10^3 × 10^4))`.
- **Goodwill grant tool:** a one-off bulk grant, e.g. 1 point per £1 of lifetime spend. Softens the loss of legacy points.

**Prize engine (M7)**
- **Wizard:** skin, then a prize table showing **live odds and expected prize cost per play**, then rules (cost in points, `free_plays_per_period ≥ 1` enforced by CHECK and UI, caps, tier gates, schedule), then terms from a template with a no-purchase route, then preview.
- **INSTANT:** `crypto.randomInt` (mine `services/mystery-box-open.server.ts:32-33`), one audit row per play. Atomic stock decrement (`… WHERE stock_left > 0`). Odds re-normalise live when a prize sells out.
- **DRAW:** `seed_commit = sha256(seed)` is published at start. At `draw_at` entries freeze, winners are ranked by `HMAC(seed, play_id)`, and the seed is revealed so anyone can verify.
- **Paid play** is one transaction: points spend `… WHERE available >= cost`, plus the play insert with a unique `idempotency_key`. Cancelling a game refunds the points spent.
- **Fulfilment** is one service:

  | Prize kind | Delivery |
  |---|---|
  | POINTS | Points ledger |
  | STORE_CREDIT | `shopify_op` (debt netted first) |
  | DISCOUNT_CODE, FREE_PRODUCT, FREE_SHIPPING | `discountCodeBasicCreate` / `discountCodeFreeShippingCreate`, restricted to that customer, single use, with an end date (optional `write_discounts`) |
  | GIFT_CARD | Only if the scope is granted |
  | MANUAL | Merchant task queue |

  **Never DELIVERED without a reference** (DB CHECK).
- **Access:** guests see a teaser and must sign in to play.

**Missions (M6)**
- Contributions are keyed by source, so a refund reverses exactly what that order contributed. A claimed reward whose mission falls below target claws back its points.
- Rewards: points, a prize, or **free plays**, so missions feed the wheel.
- Template library includes "Buy 3 times this month", "Try the new collection", and "Leave a review" (Judge.me Flow trigger → "Record RewardsPro event" action).

**Messaging (M4/M5)**

| Email | Default | Ships |
|---|---|---|
| `clawback_notice` (debit or debt created) | **always on** (the debit mutation has no `notify`) | **M4, with live debits** |
| `cashback_on_the_way` (explains the hold and the release date) | on | M4 |
| `cashback_released` | off. Shopify's `notify:true` covers it; switching ours on sets `notify:false`, so shoppers never get two | M5 |
| `tier_up`, `tier_grace_warning` (7 d / 1 d), `tier_down` | on | M5 |
| `membership_started`, `membership_expiring`, `membership_lapsed` | on | M5 |
| `prize_won` (with code), `mission_completed` (off), `points_expiring` (only if expiry is on) | — | M6/M7 |

- **Editor:** brand (logo, colour, from-name, reply-to = the merchant's support email) plus per-event subject and body with variables, preview, test send, locale.
- **Recipients:** email is fetched from the Admin API at send time and never stored. Suppressions are stored as an HMAC of the address.
- **Flow triggers:** tier changed; membership started, expiring or lapsed; cashback pending, released or clawed back; **clawback shortfall**; points milestone; prize won; mission completed. Payload < 50 KB [S24].
- **Flow actions** (HMAC verified, `action_run_id` = idempotency key, reply within 10 s; 4xx is final, 5xx means retry for up to 36 h [S25]):
  - adjust points (with a merchant-set per-call cap);
  - record mission event;
  - set or clear tier override;
  - grant membership.

  **There is no "credit store credit" action.**
- **Klaviyo:** OAuth; events (`unique_id` = domain_event id); properties `rp_tier`, `rp_tier_expires_at`, `rp_points_available`, `rp_cashback_pending` [V14].

**Storefront (theme extension)**
- `membership_widget` (embed) shows tier card and progress, wallet (pending with dates, available), points, and game/mission teasers; guests get a sign-in CTA.
- **First paint** from the `$app:loyalty` metafield via Liquid. Whether Liquid can read app-owned customer metafields is VERIFY; the fallback is a cached proxy GET.
- Dormant or disabled shops render **nothing**, never an error.
- **Build rules:** vanilla custom elements, ≤10 KB gzipped JS per block, locale files, WCAG AA. Paths come from the proxy `path_prefix`, never hardcoded. All 18 setting ids are kept (unused ones ignored, not removed). `available_if` on an app-data metafield hides blocks for disabled features [S20].

**Customer account (Preact, API 2026-07)**
- **Profile block** (same uid and handle): a summary card linking to the full page.
- **Full page:** tier and progress; wallet (store-credit balance through the Customer Account API where possible — whether `customer_read_store_credit_accounts` must be declared is VERIFY); pending cashback with dates; points; games (play here, so identity comes from the session token); missions.
- **Order-status block:** "This order earns £4.20 cashback, available 12 Nov".

**Admin (Polaris web components)**
- **Navigation:** Home (checklist, **Needs attention** queue, liability card, embed status via `read_themes` with a deep link `addAppBlockId={api_key}/membership_widget`) · Members · Program (Tiers, Cashback, Points, Memberships) · Engage (Games, Missions, Audiences, Automations) · Notifications · Analytics · Settings (Storefront, Customer accounts, Integrations, Data & privacy, System status; later Plan & AI).
- **Member detail:** a unified timeline. Every action needs a reason and is audited; money actions go through `shopify_op` as MANUAL ops with typed confirmation and an optional staff allow-list.
- **Names and emails** are fetched per page via `nodes(ids:)` and never stored.

**Onboarding** (first open after V2; aim under 10 minutes)
1. **What changed.** Lost: points, tier settings and progress, game state. Safe: store credit, gift cards, codes, tier products, theme placements. New: holds and refund clawback.
2. **Program preset:** cashback only, or cashback + points & games.
3. **Tiers:** pre-filled names and suggested thresholds, with the simulator.
4. **Cashback policy preset:** **Safe 30 d** (default) / Balanced 14 d / Instant 0 d (logged debt-risk acknowledgement).
5. **Surfaces:** embed deep link, customer-account placement guide, classic-accounts check.
6. **Preview as a customer**, then the programme-terms template, then **Start earning**.

---

## 5. Money: ledger, refund clawback, state machines

### 5.1 Platform facts the design must work around

| Fact | Consequence | Ref |
|---|---|---|
| `storeCreditAccountCredit(id, creditInput{creditAmount, expiresAt?, notify=false})`. Passing a Customer ID auto-creates the account for that currency. Errors: ACCOUNT_NOT_FOUND, CREDIT_LIMIT_EXCEEDED, EXPIRES_AT_IN_PAST, MISMATCHING_CURRENCY, NEGATIVE_OR_ZERO_AMOUNT, OWNER_NOT_FOUND, UNSUPPORTED_CURRENCY | No pending or held state and no memo field, so "pending" exists only in our ledger | [S9] |
| `storeCreditAccountDebit(debitInput{debitAmount})`. A debit above the balance fails with INSUFFICIENT_FUNDS and a null transaction. No `notify` | The balance cannot go negative and there is no partial debit. We debit `min(owed, balance)` and notify the shopper ourselves | [S10] |
| No `@idempotent` support on store-credit mutations | Intent-first ops, one in flight per account, resolve from history, never retry blind | [S13][S33] |
| No store-credit webhooks; the transaction `origin` union has only OrderTransaction; no app or staff attribution | Reconciliation polls. Our credits look like `ADJUSTMENT` with a null origin. Legacy credit cannot be attributed to RewardsPro | [S11][S31][S32] |
| Credit transactions expose `remainingAmount`; debits spend the soonest-expiring credit first | Gives a "has this been spent" indicator and a liability metric | [S11] |
| Only the full balance applies at checkout; only the checkout-currency balance is shown; < $15,000 USD per account; expiry is end of day in the shop timezone; not usable on draft or edited orders | No partial-spend cap is possible. Issue in the presentment currency | [S8] |
| `refunds/create` is the refund topic (there is no `orders/refunded`); delivery order is not guaranteed; delivery itself is not guaranteed | Webhooks are hints; recompute from a re-fetched order; reconcile daily | [S7][S14] |
| App Store requirement 1.1.15: store credit issued *during a refund* must use `refundCreate` / `returnProcess` | A cashback clawback debit is not a refund, so it is allowed. Any future refund-to-credit feature must use `refundCreate` (`@idempotent` required from 2026-04) | [S15][S34] |

### 5.2 Default policy (per shop; versioned and audit-logged)

| Setting | Default | Range / options | Why |
|---|---|---|---|
| Hold anchor | Full fulfilment, or paid_at if nothing needs shipping. **Backstop:** if not fully fulfilled by paid_at + 30 d, anchor = paid_at + 30 d | `backstop_days` 7–60 | Partial or never-fulfilled orders must not sit PENDING forever |
| Hold length | **30 days** after the anchor | 0–90. 0 = Instant, allowed only with a logged acknowledgement | Covers UK 14 days to cancel after delivery plus 14 days to refund [L1]. LoyaltyLion's default is 14 days after paid [L2] |
| Freeze | While a return is open (`read_returns`, required) or a dispute is open (optional scope). Releases resume at resolution + 7 d | — | Most loophole cases start with a return |
| Refund or cancel or edit during the hold | Pending lowered locally. **No Shopify call** | — | The loophole cannot occur inside the hold |
| Refund after release | Debit `min(owed, live balance)`. If the balance is short, **recheck after 10 min** first (a refund to store credit may still be landing). The shortfall becomes **debt** | Scope `ANY_BALANCE` (default; the owner's "refund deducts store credit") or `OWN_UNSPENT` (cap = Σ `remainingAmount` of our credits) | Store credit cannot go negative |
| Debt offset | Per (customer, currency). Netted against that customer's future cashback releases, prize credits and conversions | — | — |
| Debt recovery from a later refund-to-store-credit | **Off by default.** Opt-in only after legal review. When on, recovery is capped at the **store-credit-tendered portion** of the refunded order | toggle | Closes "spend credit on B, refund A, refund B to credit" without seizing statutory refunds |
| While in debt | Points → credit conversion blocked (on); paid plays allowed (block = off) | toggles | Protects the merchant without ejecting the shopper |
| Debt write-off | 365 d; customer flagged; Flow trigger | 30–730 or never | Bounded liability |
| Rate | Locked at first accrual: the tier held **before** this order (old behaviour). **May only be lowered** by re-rating (§5.3) | owner Q7 | Deterministic; blocks tier pumping |
| Currency | Order **presentment** currency. On UNSUPPORTED_CURRENCY: NEEDS_REVIEW with a one-click "issue in shop currency" | `PRESENTMENT\|SHOP` | Credit must show at that market's checkout [S8] |
| Earning base | Merchandise net of discounts and refunds. **Shipping and tax off.** **Tax-inclusive shops (`Order.taxesIncluded`, e.g. UK VAT) subtract line tax allocations** | toggles | A deliberate change; the old base included shipping and tax |
| New-credit expiry | None | Optional N days, disclosed in the terms; never applied to existing credit | — |
| Eligible | Has a customer; not test; not cancelled; paid ≥ `earning_enabled_at`; shop on new customer accounts. POS on, B2B off, drafts on | toggles | Guests and legacy accounts cannot hold credit |
| Shopper notices | Credit: Shopify `notify:true`. Debit or debt: `clawback_notice` email. Pending: `cashback_on_the_way` | — | — |
| Legacy credit and pre-activation orders | Never debited. Shown only as an aggregate opening liability | — | Not attributable |

### 5.3 One computation: `target(order)`

`reconcile_order(order_gid)` runs on every relevant webhook, before every release, and in the daily sweep. It holds `SELECT … FOR UPDATE` on `cashback_order` **only while posting**; the GraphQL fetch happens before the transaction opens.

```
fetch Order 2026-10: lineItems{quantity,currentQuantity,isGiftCard,variant{id,product{id}},
  originalUnitPriceSet, discountAllocations{allocatedAmountSet}, taxLines{priceSet}},
  taxesIncluded, refunds{refundLineItems{subtotalSet,totalTaxSet,lineItem{id}}, transactions},
  transactions{kind,status,gateway,amountSet}, returnStatus, disputes(if scope), cancelledAt, test,
  presentmentCurrencyCode, customer{id}, displayFulfillmentStatus, fulfillments, currentShippingPriceSet
(all MoneyBag amounts parsed to BigInt in both presentment (p) and shop (s) money)

eligibleNet = Σ_{eligible lines} [ unit×currentQty − floor(alloc×currentQty/qty)
                                   − (taxesIncluded && !include_tax ? floor(lineTax×currentQty/qty) : 0) ]
              − amount-only refunds × eligibleShare (pro rata)
              + (include_shipping ? current shipping : 0) + (include_tax && !taxesIncluded ? eligible line tax : 0)
netCaptured = Σ SUCCESS SALE/CAPTURE − Σ SUCCESS REFUND           (all gateways)
netNonCredit= same, gateways ∉ {store credit, gift card}           (gateway strings VERIFY; cross-checked
                                                                    against ORDER_PAYMENT debits in reconcile)
tender_share_ppm = netCaptured ≤ 0 ? 0 : floor(netNonCredit × 10^6 / netCaptured)   ← recomputed EVERY reconcile
target = ineligible ? 0 : max(0, floor(eligibleNet_p × tender_share_ppm × rate_bps / 10^10))
```

**Properties of this computation:**
- Floor rounding on the final target means the last partial refund returns exactly the remainder.
- Because the tender share is recomputed (not locked at first accrual), refunding only the card part, or only the credit part, moves the target fairly.
- Credit-funded merchandise never earns, because tender is pro rata (not `min(eligible, nonCredit)`).
- The same path handles edits, exchanges, cancellations and out-of-order webhooks.

**Re-rating (closes tier pumping).** It fires when one of these is refunded or cancelled:
- a membership line;
- an order that counted towards the customer's spend tier.

On that event, for the same customer's **PENDING** accruals made after that order, recompute the as-of tier with the refunded amount or revoked membership removed, and set `rate_bps = min(locked, as-of)`. The rate is never raised. Issued accruals are not re-rated by default; that is a merchant option.

### 5.4 Settlement and release

```
reconcile_order (after fetch, in tx with row lock):
  if an op for this order is SENT/UNKNOWN → re-enqueue in 60 s
  delta = target − (pending + issued)
  state PENDING/ON_HOLD/RELEASABLE: ADJUST pending by delta (ledger only); pending→0 ⇒ VOID
  state ISSUED, delta > 0 (edit up): ACCRUE new pending tranche with its own hold
  state ISSUED, delta < 0: owed = −delta; read live balance B (outside tx)
       B < owed and not rechecked → rechecked_at=now, re-enqueue in 10 min
       plan DEBIT op = min(owed, B, scope cap)   (skip if 0)
       on CONFIRMED: CLAWBACK(−debited, ISSUED) + DEBT_RECORD(owed−debited, DEBT); clawback_notice
       on INSUFFICIENT_FUNDS: re-read B once, re-plan; remainder → DEBT
       on ACCOUNT_NOT_FOUND: all → DEBT

release (hourly scan → reconcile_order(release=true) for due orders):
  fresh reconcile; if hold passed and no open return/dispute → RELEASABLE
  enqueue release_customer(shop, customer, currency)   -- coalesced via dedupe_key
release_customer:
  R = Σ releasable pending; offset = min(R, debt); credit = R − offset
  credit = 0 → write RELEASE + DEBT_OFFSET directly
  credit > 0 → ONE CREDIT op (plan jsonb maps per-order tranches), notify = notify_on_credit
  RELEASE + DEBT_OFFSET entries written IN THE SAME TX that marks the op CONFIRMED
```

**Op sending:**
1. tx1: PLANNED → SENT, stamping `sent_at` and `balance_before`. The partial unique index guarantees at most one SENT/UNKNOWN per account. Commit.
2. Call the mutation with no transaction open.
3. tx2: CONFIRMED (txn GID, `balanceAfterTransaction`, ledger rows), or REJECTED, or UNKNOWN.

Stale PLANNED rows older than 15 minutes are moved to CANCELLED by a reaper.

**Money mode:**
- `SHADOW`: ops are written with status SHADOW and never sent. The admin shows "would have credited / debited". On the switch to LIVE, ops are re-planned from scratch.
- `kill_switch` and `MONEY_WRITES_ENABLED=false` both stop any op from reaching SENT. Planning and ledger work carry on.

### 5.5 State machines

```
cashback_order
 INELIGIBLE ⇄ (re-evaluated on edit)
 PENDING ──return/dispute open──▶ ON_HOLD ──resolved (+7 d)──▶ PENDING
 PENDING ──target→0──▶ VOID
 PENDING ──hold_until ≤ now ∧ fresh reconcile ∧ not frozen──▶ RELEASABLE ──customer CREDIT CONFIRMED──▶ ISSUED
 ISSUED ──target < issued──▶ (DEBIT op) ──▶ ISSUED (lower; shortfall→customer DEBT) | VOID if 0
 ISSUED ──target > issued──▶ new PENDING tranche
 any ──invariant breach | ambiguous op | CREDIT_LIMIT_EXCEEDED | UNSUPPORTED_CURRENCY──▶ NEEDS_REVIEW

shopify_op
 PLANNED ──(money_mode SHADOW)──▶ SHADOW
 PLANNED ──tx1──▶ SENT ──ok + txn──▶ CONFIRMED (ledger in tx2)
                       ├─userErrors──▶ REJECTED (planner may re-plan)
                       └─timeout/5xx/network/crash──▶ UNKNOWN
 UNKNOWN ──resolver (≥2 min): account.transactions(type, createdAt ≥ sent_at−60 s), event ADJUSTMENT,
           origin null, same amount, GID not already claimed, balanceAfter chain consistent with balance_before
           ├─ exactly 1 ─▶ CONFIRMED
           ├─ 0 on two checks ≥10 min apart ─▶ REJECTED (a new op may be planned)
           └─ >1 / chain inconsistent ─▶ NEEDS_REVIEW
 PLANNED stale >15 min ─▶ CANCELLED          Never retried blind.

customer debt (per currency)
 0 ──DEBT_RECORD──▶ OPEN ──DEBT_OFFSET at release / prize / conversion──▶ 0
                     ├──DEBT_RECOVER (opt-in, capped)──▶ 0 or lower
                     └──age ≥ write-off──▶ DEBT_WRITE_OFF (flag + Flow trigger)
```

### 5.6 Worked example and scenarios

**Worked example:** GBP, 5% tier, 30-day hold.
1. A £100 eligible order accrues **£5.00 pending**.
2. A £40 line is refunded on day 10. Target becomes floor(£60 × 5%) = **£3.00**. No Shopify call.
3. Released after hold: **£3.00 credited**. The shopper spends it on order #2.
4. The remaining £60 is refunded on day 45. Owed £3.00, live balance £0, so the debit is skipped after the recheck and **debt is £3.00**. A clawback email goes out.
5. Order #3 releases £4.00: offset £3.00, **credited £1.00**.

| # | Scenario | Outcome |
|---|---|---|
| 1 | Full refund during the hold | Pending → 0, VOID. **No Shopify call; the loophole cannot occur** |
| 2 | Three partial refunds during the hold | Pending lowered each time; the last lands on the exact remainder |
| 3 | Return opened on day 25 | ON_HOLD until resolved, then +7 d |
| 4 | Refund after release, credit unspent | Full debit; clawback email |
| 5 | Refund after release, credit spent (the owner's loophole) | Debit `min(owed, B)`; rest becomes debt. Shown on the order block and member ledger; Flow "shortfall"; netted at next release; written off at 365 d |
| 6 | Merchant refunds to store credit | That credit is usually already in the account (or the 10-min recheck catches it), so the debit nets |
| 7 | Order cancelled after payment | target 0 → VOID, or clawback if already issued |
| 8 | Order edit adds items | New pending tranche with its own hold |
| 9 | Exchange with no money moved | Target unchanged |
| 10 | Lost chargeback (optional disputes scope) | target 0 → clawback or debt. Chargebacks can take 120+ days [L3], which is why the debt path exists |
| 11 | Buy Gold membership, big order, refund Gold | The big order's pending accrual is re-rated down to the as-of tier |
| 12 | Earn points, play a game, refund | Order points were still PENDING, so they were not spendable; the reversal posts immediately |
| 13 | Refund on an order paid before `earning_enabled_at` | Ignored; legacy credit is never touched |
| 14 | CREDIT_LIMIT_EXCEEDED / UNSUPPORTED_CURRENCY | NEEDS_REVIEW; pending kept |
| 15 | Uninstall with pending cashback | Pending frozen. Resumes on reinstall before `shop/redact`, otherwise deleted. Disclosed in terms |

**Residual risk, stated plainly:** a shopper whose cashback is released after the hold, who spends it, refunds afterwards, and never buys again leaves unrecovered debt. The hold, the freeze and the staff order block make this rare. Write-off bounds it.

### 5.7 Reconciliation and invariants

| Job | Cadence | Action |
|---|---|---|
| Op resolver | Every sweep | UNKNOWN ops older than 2 minutes |
| Pre-release refresh | Every release | Re-fetch the order; never release from stale state |
| Window reconcile | Daily | Orders with `updated_at` in the last 72 h; catches missed webhooks |
| GID verification | Daily sample, weekly full | Each CONFIRMED `shopify_txn_gid` still exists with the same amount |
| Liability snapshot | Daily | pending + Σ `remainingAmount` of our credits + debt, per shop and currency |
| Tender cross-check | Daily | ORDER_PAYMENT debits per order against the computed tender share; differences go to `recon_finding` |
| **Invariants** → alert plus per-shop **circuit breaker** (`kill_switch`) | Daily, and after every money job | (1) Σ ledger by bucket = projection. (2) Per order, `issued` = Σ CONFIRMED credits − debits in op plans. (3) No negative pending or issued. (4) ≤1 SENT/UNKNOWN per account. (5) No award DELIVERED without a reference. (6) Points balance = Σ ledger. (7) No op SENT for a shop in SHADOW or OFF |

Findings are repaired with new ledger entries, never by editing rows.

**Dev-store checklist** (M3 exit gate; each item is currently UNVERIFIED):
1. Gateway strings for store-credit and gift-card tender.
2. What a refund to store credit produces: `refunds/create`, transaction gateway and kind, ORDER_REFUND event.
3. `currentSubtotal` and `netPayment` on amount-only and shipping-only refunds.
4. Exchange and edit payloads.
5. Whether cancel-with-refund fires both topics, and in what order.
6. INSUFFICIENT_FUNDS behaviour.
7. Duplicate credit on retry after a timeout.
8. JPY, 3-decimal currencies and presentment-currency credit; the credit limit.
9. Whether `orders/fulfilled` fires for no-ship orders.
10. Debit order among credits with no expiry.
11. Whether a lost dispute creates a Refund.
12. Readability of `returnStatus` and `disputes`.
13. The scope re-consent flow.
14. Proxy handling of a client-supplied `logged_in_customer_id`.

---

## 6. Shopify integration

### 6.1 Scopes (V2)

| Scope | V2 status | Use |
|---|---|---|
| `read_customers`, `write_customers` | keep | Members, tags, app metafields |
| `read_orders`, `read_all_orders` | keep (`read_all_orders` approval inferred from the current toml deploying; VERIFY in M0) | Order facts, tier windows, bootstrap (default order window is 60 days) [S16] |
| `read_store_credit_accounts`, `write_store_credit_account_transactions` | keep | The money path (write includes read of transactions) |
| `read_products` | keep | Membership mapping, exclusions |
| `read_themes` | keep | Detect whether the embed is enabled at onboarding |
| `write_app_proxy` | keep | Proxy |
| `read_purchase_options`, `write_purchase_options` | keep **for V2 only** | Detach legacy selling plans; drop in the next version (removing needs no prompt) |
| `read_returns` | **add, required** | Return freeze. Batched into the reopen approval every merchant must give anyway |
| `read_customer_merge` | **add, required** | `customers/merge` re-keying (its effect on store-credit accounts is VERIFY; money rows go to NEEDS_REVIEW) |
| `write_discounts` | **optional** (`scopes.request` on first perk or code prize) | Tier perks, code prizes |
| `write_gift_cards` | **optional** (grantability UNVERIFIED) | Gift-card prizes |
| `read_shopify_payments_disputes` | **optional** | Dispute freeze and clawback (Shopify Payments only) |
| `write_orders`, `write_products`, `read/write_publications`, `read_product_listings`, `read_reports` | **drop** | Unused |

Adding required scopes prompts merchants on their next open. Removing scopes needs no prompt [S16].

### 6.2 `shopify.app.production.toml` (V2 target; nested `include_fields` and disputes-topic behaviour are VERIFY)

```toml
client_id = "026ce3bf073bed0e44ae8eab09d1ae3a"
name = "Rewards Pro"
handle = "RewardsproMembership"
application_url = "https://app.rewardspro.io"
embedded = true

[build]
automatically_update_urls_on_dev = false

[access_scopes]
scopes = "read_customers,write_customers,read_orders,read_all_orders,read_store_credit_accounts,write_store_credit_account_transactions,read_products,read_themes,write_app_proxy,read_purchase_options,write_purchase_options,read_returns,read_customer_merge"
optional_scopes = ["write_discounts", "write_gift_cards", "read_shopify_payments_disputes"]
# [auth] redirect_urls omitted: managed install + token exchange needs no callbacks (VERIFY CLI accepts omission; harmless if kept)

[webhooks]
api_version = "2026-10"
  [[webhooks.subscriptions]]
  compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
  uri = "/webhooks/compliance"
  [[webhooks.subscriptions]]
  topics = ["app/uninstalled", "app/scopes_update"]
  uri = "/webhooks/app"
  [[webhooks.subscriptions]]
  topics = ["orders/paid", "orders/cancelled", "orders/edited", "orders/fulfilled", "orders/partially_fulfilled"]
  uri = "/webhooks/orders"
  include_fields = ["id", "admin_graphql_api_id", "updated_at", "customer.id", "test"]
  [[webhooks.subscriptions]]
  topics = ["refunds/create"]                     # NOT orders/refunded (no such topic)
  uri = "/webhooks/refunds"
  include_fields = ["id", "order_id", "created_at"]
  [[webhooks.subscriptions]]
  topics = ["returns/request", "returns/approve", "returns/decline", "returns/close", "returns/cancel"]
  uri = "/webhooks/returns"
  [[webhooks.subscriptions]]
  topics = ["customers/merge"]
  uri = "/webhooks/customers"
# NOT subscribed: customers/update (self-trigger loop + PII), customers/create, products/*, orders/create,
#   customers/purchasing_summary (unused). disputes/* added at M5 once optional-scope delivery is verified.

[app_proxy]
url = "https://app.rewardspro.io/proxy"   # only url changes (applies to every store immediately)
prefix = "apps"                           # KEEP — prefix/subpath changes apply only to new installs
subpath = "rewardspro"                    # KEEP

[customer.metafields.app.loyalty]         # declarative app-owned definition (exact syntax VERIFY)
type = "json"
access.customer_account = "read"

[pos]
embedded = false
```

**Webhook handler:**
- `authenticate.webhook`; a bad HMAC must return 401 (asserted in CI, because the library behaviour is UNVERIFIED).
- Extract the typed `hint`, then `INSERT … ON CONFLICT (webhook_id) DO NOTHING` plus a job, then 200 within 5 s [S14].
- Dormant shops: census only, except compliance and uninstall, which are always persisted.
- On a shop's first token, list and delete leftover **shop-specific** subscriptions from the old app, to avoid duplicate deliveries [S7].
- App-specific (toml) subscriptions are never deleted on failure. Shop-specific ones are deleted after repeated failures [S7].

### 6.3 App proxy

| Path (under `{path_prefix}`) | Method | Notes |
|---|---|---|
| `/v3/me` | GET | Tier, progress, pending/available cashback (our ledger), points, debt flag, `action_token`. **No PII.** `Cache-Control: private, no-store` |
| `/v3/games`, `/v3/missions` | GET | Public catalogue (short public cache); per-customer state when logged in |
| `/v3/games/:id/play`, `/v3/missions/:id/claim`, `/v3/points/convert` (M7) | POST | `action_token` plus `Idempotency-Key` (unique in the DB); per-customer rate limit in Postgres |
| Legacy aliases: `membership`, `raffles`, `raffles/enter`, `mystery-boxes`, `mystery-boxes/open`, `missions`, `missions/events/ack`, `challenges/claim`, `gift-cards` | as before | **For 90 days after V2.** Served by the v3 handlers in a legacy shape; `customer_id`, `customerId` and `cid` are **ignored and logged**, never read. `gift-cards/convert` returns 410 with a friendly message |

### 6.4 Extensions (identities preserved)

| Extension | Identity | API | v3 |
|---|---|---|---|
| Theme app extension | uid `a58b9b10-e482-42f9-90d4-885a20081116e17dfcf9`, handle `rewardspro-theme-extension`, blocks `membership_widget`, `missions_widget` (body embeds), `raffles`, `mystery_boxes`, `gift_cards`, `missions_section` (sections), plus the 18 setting ids | — | V1: byte-identical. The current toml mixes top-level `name/type/uid` with `[[extensions]]`; **VERIFY the shape passes CLI 4.9.x on the staging app before M2**, and normalise only if it fails, keeping uid and handle. V2: new small assets. M7: add `spin_wheel` (limit is 30 blocks [S20]) |
| CA profile block | uid `be72a1b4-3ed3-d78d-61f7-19361e1583d89ba79ee3`, handle `rewardspro-membership`, target `customer-account.profile.block.render`, capabilities `api_access` and `network_access` kept | 2026-07 | V1: static neutral card, **no network calls**. V2: summary card |
| CA full page (new) | handle `rewardspro-account` | 2026-07 | `customer-account.page.render` (128 KB limit) |
| CA order-status block (new) | handle `rewardspro-order-status` | 2026-07 | Target name VERIFY |
| Admin order and customer blocks (new) | — | 2026-07 | `admin.order-details.block.render`, `admin.customer-details.block.render` [S29] |
| Flow triggers and actions (new) | — | — | `runtime_url` relative; HMAC |
| Sidekick app-data (M8) | — | — | Read-only |
| Functions | **none** | — | Not needed; Function fetch is Enterprise custom apps only [S27] |

**Version calendar:**
- The Admin API version moves in a quarterly bump ticket.
- The CA and admin extensions must move off 2026-07 before about 2027-06 (the CLI refuses targets older than 12 months).
- Watch the API health page in the Dev Dashboard [S3].

---

## 7. Security, GDPR and PII

**Identity**

| Surface | Rule |
|---|---|
| App proxy | `authenticate.public.appProxy`. Require `searchParams.getAll('logged_in_customer_id').length === 1`, otherwise 400; an empty value means guest. **On `/v3`, reject with 400 any request carrying `customer_id`, `customerId` or `cid`.** Timestamp window ±300 s (VERIFY skew). Every POST needs `action_token = HMAC(shop, customer, UTC day, ACTION_TOKEN_KEY)`, issued only in GET responses, so forged cross-site forms fail. No PII is returned. Shopify cautions that the app must check the logged-in customer matches the data requested [S17]. Duplicate-key rejection covers the HMAC-joining gap in shopify-api [S18] |
| Known issue | `logged_in_customer_id` is intermittently blank with new customer accounts [S35]. The widget degrades to "Sign in", and the customer-account page is the canonical place to play |
| Customer-account API | `authenticate.public.customerAccount`. Requires `sub` (present only when signed in and protected-data access is granted) and `dest` = an installed shop. `Access-Control-Allow-Origin: *`; bearer only, no cookies [S21] |
| Admin | App Bridge ID token. Staff `sub` written to `audit_log` for money, points, overrides, exports and settings |
| Monitors | Synthetic unsigned proxy request → 401 (wired into `deploy-health.py`). CI spoof tests |

**Tokens and secrets**
- Expiring offline tokens: 1 h access, 90 d refresh [S6].
- An encrypting `SessionStorage` wrapper (~60 LOC) stores tokens as AES-256-GCM with `key_version`.
- Refresh is serialised per shop with `pg_advisory_xact_lock(hashtext(shop))`, re-reading the session after taking the lock. Concurrent-refresh behaviour of the library is VERIFY.
- A daily sweep refreshes any shop whose last refresh is more than 7 days old, so a refund months later can still be clawed back.
- A `401 invalid_request` sets `NEEDS_REOPEN`, raises an alert and shows a banner.
- Secret rotation happens **before V2** (§8).
- DB roles: `rp_app` has no UPDATE or DELETE on ledgers and no DDL; `rp_migrator` is CI-only; `rp_ro` is for support.
- `gitleaks` runs in CI.

**PII minimisation**
- The DB holds GIDs, amounts and states only.
- Inbox rows hold ID hints only and are deleted at 30 days. Job payloads hold IDs only.
- Emails and names are fetched transiently. Suppressions are stored as HMACs.
- Logs are redacted. Sentry: no Replay, `sendDefaultPii:false`.
- Export is browser-assembled and audit-logged with a reason.
- No PII goes into queue messages or AI inputs.

**GDPR** [S12]

| Topic | Behaviour |
|---|---|
| all | Verify HMAC (bad → 401), persist `compliance_request` (unique `webhook_id`), then 200. Alarms at **day 20 and day 28**. CI tests for all three topics, the 401 path and uninstall |
| `customers/data_request` | Build a JSON report of everything held (states, ledgers, plays, awards, memberships, missions). Deliver it on Settings → Data & privacy and email the shop contact (fetched live). If nothing is held, record "no data held" as evidence |
| `customers/redact` | `redact_customer()` (SECURITY DEFINER): void pending; pseudonymise `customer_ref` → `redacted:<HMAC>` across ledgers, ops, cashback and plays (amounts kept for integrity); delete `customer_state`, overrides, memberships, missions, suppressions; request Klaviyo profile deletion if connected (API VERIFY). Afterwards `compliance_request.customer_ref` is pseudonymised too, because a GID is personal data |
| `shop/redact` (48 h after uninstall) | `redact_shop()`: delete every row for the shop. Keep a tombstone (`hash(domain)`, `redacted_at`) plus pseudonymised compliance evidence |
| `app/uninstalled` | Delete tokens immediately; status UNINSTALLED; cancel PLANNED ops; SENT/UNKNOWN → NEEDS_REVIEW; freeze jobs. **No destructive delete until `shop/redact`** (the old app hard-deleted at once and swallowed errors) |

**Protected customer data Level 2** [S12]:
- encrypted backups (age);
- separate test and prod data (separate Neon project, separate apps);
- access log (`audit_log`);
- prod DB access limited to two named people;
- data-loss prevention;
- a one-page incident-response policy written in M1.

Update the data-use declarations for the new subprocessors: Vercel, Neon, Resend, Sentry, Cloudflare, Klaviyo (merchant-connected), and later the AI provider. The existing approval level is UNVERIFIED and is checked in M0.

**Legacy processor PII (P0 and P5):**
- Delete the old Sentry project and replays, which were recorded with `maskAllText:false` (`app/entry.client.tsx:24,44-46`).
- Delete SendGrid contacts and suppressions, then close the account after the DNS move.
- Turn off the GitBook assistant and Bedrock.
- Remove the AWS keys from the old Vercel env (the account is deleted).
- Tell merchants that events pushed to their own Klaviyo by the old keys stay under their control.
- List all of this in the privacy-policy update (P4).

**Residency:** primary data is in London (Neon `eu-west-2`, Vercel `lhr1`). Resend, Sentry account metadata, Vercel and AI providers are US processors under DPAs (owner Q15).

---

## 8. Same-app cutover, and the zombie now

**Constraints:**
- **No new version of `026ce3bf` can be created** while the customer-account extension is on 2025-07. Shopify: "By October 1, 2026, any app that contains extensions on API versions 2025-07 or earlier will be unable to be updated" [S36]. The CLI also blocks targets older than 12 months.
- Offline tokens died with the DB. Only a staff member opening the app mints a new one [S6][S37].
- The proxy prefix and subpath must not change.
- The listing must only advertise what works (requirement 2.1) [S15].

### P0: the zombie, now (M0; about 1 week; most of it is Yu's dashboard work)

1. **Listing:** set **Limited visibility** in the Partner Dashboard. The app leaves search, stays installable by URL and keeps its review history; the change is reversible [S38]. **Do not delete or unpublish**: deleting loses the client ID [S39]. Fix the developer address (60 Tottenham Court Road) and remove the "no theme modifications" claim. Whether listing edits are reviewed is UNVERIFIED.
2. **Zombie backend patch**, one commit to `apps/rewardspro` (it still auto-deploys), then disable Git deploys on that project:
   - remove the `customer_id/customerId/cid` fallback (`app/routes/api.proxy.$.tsx:214-217`);
   - all proxy endpoints return `{status:"unavailable"}` with no PII (the widgets hide);
   - `/app` serves a static maintenance screen that needs no database;
   - **delete all 22 crons** from `vercel.json`;
   - compliance and uninstall routes verify the HMAC and return 200 with a structured log. There is nothing to delete: the database was destroyed with the AWS account, so "no data held" is the completion;
   - **the zombie gets no credentials to the new database**;
   - other webhooks return 200 as no-ops;
   - remove the "Refunds are handled automatically" FAQ claim (`app/routes/_index/route.tsx:47-48`).
3. **Old project:** after the patch is live, set Ignored Build Step `exit 0` (or disconnect Git); further patches only by manual `vercel deploy --prod`. Remove the AWS and Aurora env values.
4. **Census:** an org owner creates a Partner API client. List installs; run `activeSubscription(appId, shopId)` per shop and match against the legacy alias map (`app/constants/pricing-contract.ts:212-273`).
   - An unknown name aborts the census instead of defaulting to Free.
   - Never cancel opportunistically, and never downgrade a shop because a lookup failed.
   - If shops are still being billed by a dead app (commit `6476498b` named 2 paying shops), Yu decides on refunds or credits.
5. **Stray-deploy guard:**
   - strip `client_id` from `rewardspro-production` and `rewardspro-shopify`, salvage, then archive both;
   - replace `apps/rewardspro/shopify.app.toml` with one that has no `client_id` (the runtime reads env; confirm the build does not need it);
   - restrict who can manage the app in the Dev Dashboard;
   - neutralise dev app `538b1257` (uninstall, repoint or delete) and remove `rewardspro.vercel.app` as a repo homepage;
   - decide `f04b5854` and `ed18e3236`.
6. **Email DNS:** one SPF record (Workspace plus the sending provider), **one** `_dmarc` record, DKIM on `send.rewardspro.io`. Today the SPF include is NXDOMAIN, there are two DMARC records and no DKIM, which also hurts Workspace mail from `contact@`.
7. **Verify approvals:** `read_all_orders`, CA `network_access`, protected-customer-data level, Dev Dashboard migration status.
8. **Legacy processor PII purge** (§7).

### V1 "bridge" (M2): proves identity continuity and unblocks deploys

| Item | V1 contents |
|---|---|
| Config | Today's toml with exactly three changes: `automatically_update_urls_on_dev=false`; compliance URI = `https://app.rewardspro.io/webhooks/compliance`; `app/uninstalled` URI = `https://app.rewardspro.io/webhooks/app` (absolute URIs, VERIFY). `application_url`, proxy, other webhooks, scopes and `api_version` are unchanged |
| Theme ext | Byte-identical |
| CA ext | Rewritten in Preact on 2026-07: same uid, handle, target and capabilities; neutral "Rewards are being upgraded" card; no network calls. The old block calls a host that is still up but whose data plane is dead, so tabs error. V1 stops that |
| Process | `deploy --config production --no-release`, then read the CLI diff: both extensions must show **updated**. Release. Check placements on the canary store |
| Result | GDPR handling runs on new code from V1. V1 is the **rollback anchor**: never roll back to a 2025-07 version (whether releasing one is blocked is UNVERIFIED) |

### V2 "cutover" (M4)

1. **Secret rotation, before any token is minted by the new backend:**
   - generate a new client secret;
   - the new backend uses it for token exchange and **dual-verifies** webhook, proxy and Flow HMACs with old and new secrets for the whole window (at least 1 h; Shopify signs with the oldest unrevoked secret) [S40];
   - library support for two secrets is VERIFY; the fallback is a thin custom verifier.
2. Point `app.rewardspro.io` at the prod project. From then on a host move is a DNS change.
3. **Release V2:** §6.2 toml; new theme assets (membership widget plus Wallet live, other blocks render nothing until their milestone); live CA block, page and order-status block; admin blocks; legacy proxy aliases.
4. **Every shop is DORMANT.** Surfaces render nothing until the merchant opens the app.
   - **Canary:** Cambridge TCG's own store (**ASSUMPTION**: it has the prod app installed and new customer accounts; otherwise install on a store we control).
   - The canary runs SHADOW for 14 days, then LIVE.
   - Other shops default to SHADOW for 7 days with "would credit/debit" visible, then auto-promote to LIVE if invariants are clean; the merchant can promote earlier. A 30-day hold means shadow delays almost no real credit.
5. **First open (bootstrap job, resumable):**
   - token exchange plus approval of the batched new scopes;
   - shop facts (currency, timezone, `customerAccountsVersion`);
   - delete leftover shop-specific webhooks;
   - legacy census (selling-plan groups → detach with consent; `rewardspro.*` shop metafields → pre-fill feature toggles; legacy tier tags → tier names);
   - bulk customers and orders (12 months, or full history for LIFETIME) into `order_fact`, then tiers, with notifications suppressed;
   - aggregate legacy store-credit liability snapshot (no per-customer rows);
   - status ONBOARDING: webhooks are processed into `order_fact` and tiers, but **no money**;
   - onboarding;
   - **Start earning**: sets `earning_enabled_at`, runs a delta import from the bulk watermark, status ACTIVE (SHADOW → LIVE).
6. **Revoke the old secret** about 7 days after V2, once zombie traffic has drained. New-secret tokens are unaffected. The zombie's webhook verification then fails, so stale shop-specific subscriptions delete themselves.

**Merchant communication:**
- The only guaranteed channel is the **in-app banner** on first open. The Partner API documents no merchant email.
- Also: the listing "What's new" text, a notice on rewardspro.io, and email to any contacts the census yields. The sunset guide's pattern is two emails plus an in-app notice [S39].
- A shopper notice template: "Your store credit is safe; points and progress reset; cashback now becomes available after the return window, and refunds adjust it".

### P4 verify and relist; P5 decommission

- **P4:**
  - Canary runs for 14 days with zero drift.
  - Listing copy matches what is live: for example the subtitle "VIP Tiers & Cashback Store Credit" until games ship (the app name "Rewards Pro" stays, per 4.1.1). Remove "no theme modifications". Add setup steps (5.1.3).
  - Update the privacy policy (subprocessors, uninstall wording) and docs.rewardspro.io (remove plan gating).
  - Return to **full visibility** once every advertised feature works.
  - Re-review risk: core loyalty and cashback are unchanged, but the trigger is "no longer reflects original core functionality", which is unclear [S41].
- **P5 (V2 + 30 d):**
  - the old host errors on webhook paths;
  - delete Vercel project `rewardspro-production` (`prj_olcLaLOcmg3jKh28LjW2dgh6mUHi`) and its env;
  - tag, then delete, `apps/rewardspro`;
  - retiring the eu-north-1 leftovers is a separate decision.

**Rollback:** backend via Vercel Instant Rollback; Shopify via `shopify app release --version=<V1>`. Migrations are expand/contract, and earning is per shop and opt-in, so a rollback never strands money: pending stays pending.

---

## 9. AI credits and the API wrapper (later phase)

### 9.1 Principle
- Every feature in §4 stays free, including all money correctness, loophole closure, rule-based abuse flags, the simulator, Flow, exports, widgets and Sidekick Q&A.
- **Credits buy model output only.**
- When credits run out, each AI action **falls back to its rule or template equivalent**; nothing disappears.
- This reverses `NEW_PAID_SUBSCRIPTIONS_RETIRED` (`app/constants/commercial-retirement.ts:2,7`) and `docs/decisions/2026-07-23-rewardspro-free-first-pricing.md:41-44,146-148` **for AI credits only**. A new decision record signed by Yu is required (gate G2).

### 9.2 What credits buy (illustrative, unvalidated; 1 credit ≈ $0.01 retail)

| Action | Model class | Credits |
|---|---|---|
| Copy studio (mission, game and email copy, subject lines, translations) | Small LLM | 1–3 |
| Programme tuner: AI rationale plus a proposed config the merchant approves (the simulator stays free) | Mid model, batched | ~10 |
| Abuse triage summary (the flags are free rules: earn → spend → refund, serial refunds) | Decision model plus small LLM | 1 |
| Templated natural-language reports (never free-form SQL) | Small LLM | ~2 |
| **Low-level autopilot:** win-back timing, mission target nudges, prize restock suggestions, screening of manual prize claims, small **points-only** adjustments under a threshold | Cheap decision model ("Jev-like", owner Q18) | 0.1–0.5 |

**Autopilot guardrails:**
- action allow-list and magnitude caps;
- **shadow mode for 2–4 weeks**, then confidence-gated auto-apply only for allow-listed, sub-threshold, non-money actions;
- approval queue, audit log with undo, daily action cap;
- **never touches store credit, holds or clawback.** UK GDPR Art. 22 bars solely automated decisions with significant effects, so those stay rule-based and explainable [L4].

### 9.3 Models (open question)
- The design is **model-agnostic**: a `DecisionPort` (choice / score / yes-no plus confidence) and a `TextPort`, behind an AI gateway with a hard monthly budget (Vercel AI Gateway: no token markup, per-project budgets, per-request ZDR on Pro [V11]).
- **"Jev" is not assumed.** Research found a hosted decision model named Jev (TypeSafe AI, about $0.042 per 1M input tokens, secondary sources say closed weights) and open-weight decision models (Cloudflare Clef-flash, Together Tev1) [J1]. Whether either is what Yu meant is unconfirmed.
- **Selection:** a small eval set per action, scored on quality and cost per completed task, plus DPA and no-training terms. Price barely matters: about 10k actions per month costs single-digit dollars on cheap models [ai track].
- **Inference only.** No training or fine-tuning on merchant or customer data without written consent (Shopify rule effective 2026-02-27) [S42]. Send aggregates and pseudonymous IDs.

### 9.4 Billing (Shopify-only; requirement 1.2) [S15][S43]

| Rail | Use when | Mechanics |
|---|---|---|
| **Manual Billing API (default)** | Always possible. Required if legacy paid subscriptions exist, or if prepaid packs are wanted | `appSubscriptionCreate`: an EVERY_30_DAYS recurring line ("**AI Assist**", e.g. $15–19 including about 1,500–2,000 credits, illustrative) plus **one** usage line with `cappedAmount` = the merchant's chosen budget (default $20). `appUsageRecordCreate(idempotencyKey ≤255)` fails **synchronously at the cap**. `appSubscriptionLineItemUpdate` raises the cap with merchant approval. Warn at the 90% `APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT` webhook. Optional packs via `appPurchaseOneTimeCreate` [S44] |
| Shopify App Pricing | Only if the census shows **zero** active paid merchants **and** Yu prefers the hosted plan page | ≤8 plans, ≤5 meters per plan, monthly usage via the App Events API (`idempotency_key ≤64`). **No usage caps** (enforced in-app). **No one-time packs.** Billing errors appear only in Dev Dashboard logs. Opting in blocks new Billing API recurring charges [S45][S46] |

- **Plan names** must not collide with the legacy aliases (Free, Pro, Max, Ultra, Enterprise, Starter, Growth, Unlimited, RewardsPro Monthly/Annual/Usage).
- **Self-serve** upgrade and downgrade (1.2.3). Update the listing's pricing section in the same release (4.2.1). Use `test:true` on dev stores.
- **Revenue share:** 0% on the first $1M earned since 2025-01-01 (aggregated at partner level), then 15%. A **2.9% processing fee** applies to app billing; whether it applies to usage charges is UNVERIFIED [S47].

### 9.5 Metering (mirrors the money ledger)
1. Check the global kill switch, per-shop rate limit and `ai_budget`.
2. **RESERVE** the fixed action price in the same transaction.
3. Check the result cache (key: shop, action, input hash, prompt version, model).
4. Call the gateway with a timeout.
5. Validate with zod plus rule checks.
6. **COMMIT**, or **RELEASE** on failure or invalid output, so merchants never pay for failures.

Billable overage goes to `billing_usage_outbox` and is flushed hourly, before cycle end, and on uninstall (within 24 h for App Events). Reconcile daily: committed vs sent vs Shopify charges. An operator-level provider spend cap is enforced in the app.

### 9.6 API wrapper: three readings, in priority order
1. **Sidekick extension (M8), later an MCP server:** free distribution, no billing.
2. **Headless loyalty REST API** for Shopify merchants: per-shop keys; mirrors the Flow actions plus membership, wallet and event reads. Free and rate-limited (the old `apiAccess` was on every plan). Ships only once auth, docs, a sandbox and reference code exist, as rewardspro.io already promises.
3. **"Loyalty decisions API"** wrapping cheap decision models for non-Shopify platforms (WooCommerce is "Planned"): a separate product with Stripe billing, **never sold off-platform to Shopify merchants**. Only with real demand.

### 9.7 Gates and economics
- **Gates:**
  - G1: core live, reconciled and invariant-clean for 60 days;
  - G2: signed decision record;
  - G3: legacy subscription census resolved;
  - G4: evals, DPA and no-training terms, privacy policy, a DPIA for any shopper-affecting autopilot;
  - G5: dev-store test charges reconcile.
- **Break-even** (fixed fee only, about 97.1% net after the 2.9% fee):
  - against this spec's typical cost (~$85/month): about **6 merchants at $15** or **4 at $29**;
  - against the full ceiling (~$330 ≈ £250): about **23 at $15**, **12 at $29** or **38 at $9**.

---

## 10. Roadmap

Effort is engineer-weeks for one engineer pairing with coding agents, ±50% (**ASSUMPTION**).

| M | Scope | Exit criteria | Effort | Runs in parallel with / owner tasks |
|---|---|---|---|---|
| **M0 Contain** | All of P0 (§8). Neon prod and non-prod projects, R2 bucket, Sentry EU org, `app.rewardspro.io` DNS | Listing on Limited visibility. Zombie returns no PII and no 500s; crons off; Git deploys off. Census done. SPF/DMARC/DKIM pass. No repo outside the new directory carries `026ce3bf`. Approvals verified | 1 (+ Yu ~1–2 days) | Yu: dashboard, census, DNS, approvals |
| **M1 Foundation** | Scaffold; 3 configs; CI plus identity and security contract tests; expiring tokens plus refresh lock and sweep; encrypted sessions; inbox, jobs, sweeper, heartbeat, `/readyz`; GDPR persist-then-ack plus registry; uninstall; audit log; nightly dumps plus **first restore drill**; incident-response note | Dev store installs. 1,000 synthetic webhooks land with 0 loss and p99 < 300 ms. GDPR and 401 tests green. Restore drill succeeds | 2.5–3 | M2 |
| **M2 V1 bridge** | CA extension rewrite (neutral); theme toml shape verified on staging; compliance and uninstall URIs moved to the new host | V1 released; CLI diff shows both extensions **updated**; placements intact on the canary; compliance requests persisting on the new host | 0.5–1 | Inside M1 (critical path: it unblocks every deploy) |
| **M3 Money core** | Bootstrap and bulk import; `order_fact`; tier resolver, mirror and basic simulator; target / settlement / ops / resolver / coalesced release / clawback / debt / re-rating; invariants and circuit breaker; SHADOW mode; admin (Home, Members, Tiers, Cashback, Activity / NEEDS_REVIEW, money KPIs, export); admin order and customer blocks | Property tests (fast-check): any refund/edit/cancel sequence posts exactly to the final target and is never negative. Chaos test (forced timeouts): 0 double credits. §5.7 dev-store checklist passed. 7-day shadow on a dev store with 0 invariant violations | 4–5 | A second agent can build M4 UI surfaces against fixtures |
| **M4 Surfaces + V2 cutover** | Theme membership widget and Wallet; dormant-safe stubs; CA block, page and order-status block; proxy v3, aliases and spoof tests; `clawback_notice` and `cashback_on_the_way` emails (Resend free); secret rotation; V2 release; canary SHADOW → LIVE; merchant comms; listing, docs and privacy rewrite | Canary LIVE for 14 days: Shopify transactions match the ledger, 0 unresolved NEEDS_REVIEW, 0 PII in proxy responses (automated scan). At least one external shop activated. Listing truthful | 3 | Listing, docs and privacy copy (Yu); legal review of terms template |
| **M5 Memberships + messaging** | Memberships, re-rating, selling-plan cleanup, drop `purchase_options`; outbox fan-out; full transactional set and editor; Flow triggers and templates; Klaviyo OAuth; Audiences and tier-perk wizard (`write_discounts` optional); disputes scope and topics | Flow triggers fire on a dev store. DMARC pass. Backfill sends 0 emails. Membership refund re-rates pending | 2–3 | Legal review of games (for M7) |
| **M6 Points + missions** | Points ledger (PENDING → AVAILABLE), optional per-order earning, goodwill grant, missions with reversal, Flow actions, CA page sections | Refund reverses points and mission progress. Flow action replay is idempotent. No spending below zero | 2–3 | — |
| **M7 Games** | Prize engine (raffle, box, wheel skins; `spin_wheel` block), fulfilment (codes, credit, points, manual, gift card if granted), commit-reveal, odds and cost wizard, points → credit conversion, free-route enforcement | No award DELIVERED without a reference. Stock never negative under concurrency. Published odds match an empirical sample. Legal review done. **Full visibility** with the full title | 3–4 | AI evals on synthetic data can start |
| **M8 Insights + cleanup** | Full simulator, analytics depth, Sidekick extension, docs and listing truth pass, delete `apps/rewardspro`, P5 decommission | Docs, listing and privacy policy match the code (copy contract tests) | 2 | — |
| **M9 Monetisation** | Gates G1–G5, metering, Manual Billing API, first AI actions in shadow | `test:true` charges reconcile. Caps enforced. Shadow precision accepted by Yu | 3–4 | — |

**Totals:**
- **Core relaunch (M0–M4):** about 11–13 weeks.
- **Full parity (M5–M8):** about 21–26 weeks.
- **Monetisation:** after G1 (≥60 days after M4).

**Critical path:** M0 → M1 (with M2 inside it) → M3 → M4. Nothing from M5 onwards starts before M4 exits, except parallel UI and copy work.

---

## 11. Risks

| # | Risk | L / I | Mitigation |
|---|---|---|---|
| 1 | Merchants never reopen, so shops stay dormant and earn nothing | H / H | Census, in-app banner, outreach to census contacts, Limited visibility until ready, dormant surfaces render nothing. Accept that dormant shops earn nothing |
| 2 | Theme or CA placements lost (uid, handle, filename or setting drift) | L–M / H | Identity contract tests; V1 bridge with byte-identical theme; read the CLI diff; never `--allow-deletes`; staging canary. Whether keeping these values preserves placements across a rewrite is inferred, not documented, so V1 proves it |
| 3 | Double or lost credit on timeout (no Shopify idempotency) | M / H | Intent-first ops, one in flight per account, resolver, NEEDS_REVIEW, daily and weekly GID checks, chaos tests |
| 4 | Spend-before-refund loss | M / M | Hold plus backstop, freeze, staff order block, 10-min recheck, debt netting, write-off bound, liability metric |
| 5 | Wrong target because order-field semantics are unverified (gateways, tax-inclusive, amount-only refunds) | M / M | §5.7 checklist before the first debit; tender cross-check against ORDER_PAYMENT debits; SHADOW period |
| 6 | Proxy identity spoofing or PII leak | L / H | Exactly-one rule, reject `customer_id`/`cid`, no PII, `no-store`, action tokens, CI and synthetic spoof tests, dev-store overwrite test |
| 7 | Refresh-token race or lapse sends a shop dormant again | M / M | Per-shop xact lock, daily sweep, alert on 401, banner |
| 8 | Stray deploys of the live config | M / H | Strip `client_id` and archive old repos; prod config non-default; `automatically_update_urls_on_dev=false`; CI-only prod deploy with a reviewer and no bypass |
| 9 | Silent job failure (the old CronLock problem) | M / H | Heartbeats, `/readyz`, nightwatch and deploy-health probes, daily digest, invariants |
| 10 | Losing the database again | L / Critical | Three recovery lines (Neon PITR, encrypted dump to R2 EU at another provider, Shopify transaction GIDs), monthly restore drill |
| 11 | Approvals don't carry over (`read_all_orders`, `network_access`, PCD level) | L / H | Verify in M0; 60-day fallback plus `amountSpent` for LIFETIME |
| 12 | Consumer-law exposure from debiting store credit or carrying debt | M / M | Hold by default; clawback emails; terms template disclosing the policy; ANY_BALANCE reviewed; refund-credit recovery off until legal review |
| 13 | Chance-game regulation (GB and elsewhere) | M / M | Mandatory free route, public odds, no dark patterns, terms, legal review before M7 [L5] |
| 14 | Listing re-review or truthfulness | M / M | Core unchanged; Limited visibility until true; factual copy |
| 15 | Scope creep from "all features" | H / H | Strict milestone order (money before games); every milestone shippable; Flow and Messaging absorb automations and campaigns |
| 16 | Platform drift (API and extension versions, npm tag traps) | M / M | Pinned versions; quarterly bump; CA and admin extensions moved before about 2027-06 |
| 17 | Legacy subscriptions billing for a dead app | ? / H (trust) | M0 census; Yu decides refunds or credits |
| 18 | Cost blow-out | L / M | Neon CU cap, send caps, AI budget, Vercel spend alert; worst case about £191 |

---

## 12. Open questions for Yu (each has a recommended default)

| # | Question | Recommended default | Blocks |
|---|---|---|---|
| Q1 | Default cashback hold | **30 days after fulfilment** (backstop paid + 30), with presets 14 days and Instant (with acknowledgement) | M3 |
| Q2 | Which store credit a clawback may debit | **ANY_BALANCE** ("refund deducts store credit"); OWN_UNSPENT as an option | M3 |
| Q3 | Debt policy | Net against future cashback, prizes and conversions; write off at **365 d**; block conversion **yes**, paid plays **no**; refund-credit recovery **off until legal review** | M3 |
| Q4 | Cashback currency | **Presentment**, with a shop-currency fallback | M3 |
| Q5 | Shipping and tax in the earning base | **Excluded** (VAT subtracted on tax-inclusive shops) | M3 |
| Q6 | Tier precedence | **Override > highest of membership / spend / base** (not purchase-above-spend) | M3 |
| Q7 | Rate on the order that crosses a threshold | **Old tier's rate**; only ever re-rated down | M3 |
| Q8 | Expiry on new cashback | **None** | M3 |
| Q9 | Eligibility | POS **yes**, B2B **no**, paid drafts **yes**; pre-activation orders **never** earn | M3 |
| Q10 | Per-order points | **Offered, off by default**; conversion to credit in M7 | M6 |
| Q11 | Games | **Mandatory free route** as a product rule; **legal review before M7**; markets: GB first (which others?) | M7 |
| Q12 | Gift-card prizes | **Ask** for `write_gift_cards` as an optional scope; fall back to store-credit prizes | M7 |
| Q13 | Listing now | **Limited visibility today**; subtitle "VIP Tiers & Cashback Store Credit" until M7 | M0 |
| Q14 | Legacy paid subscriptions | Run the census; **refund or credit** anyone billed while the app was dead | M0 |
| Q15 | Hosting, domain, residency | **Vercel lhr1 + Neon London + `app.rewardspro.io`; enable R2**; US processors under DPAs **OK** (otherwise SES in a new AWS account) | M0 |
| Q16 | Backup window | **Neon 7-day PITR plus nightly encrypted dumps** (30-day Neon Scale roughly doubles DB cost) | M1 |
| Q17 | What "殼" means | Assumed: **the already-approved app registration** that new versions deploy into. If it is a deploy tool, the host choice may change | M0 |
| Q18 | "Jev-like models" | **Keep model-agnostic**; Yu names the model or family; evaluate candidates per action | M9 |
| Q19 | AI billing rail | **Manual Billing API with a merchant-set `cappedAmount`** | M9 |
| Q20 | "API wrapper" | **(i) Sidekick/MCP first, (ii) free headless loyalty API next**; (iii) AI decisions API only with demand | after M8 |
| Q21 | Recurring memberships | **Renewal orders from any subscription app extend the membership**; native contracts only if needed (request approval early) | M5 |
| Q22 | Shadow period for external shops | **7 days, then auto-promote** if clean; canary 14 days | M4 |

---

## Appendix A: old-code files worth mining (do not port wholesale)

Base path: `/Users/macair/Desktop/Cambridge-TCG-monorepo/apps/rewardspro`. Line references come from the research tracks and the critic, and the files were confirmed to exist at `2722104c`. Re-check the exact lines before relying on them.

| File | Mine | Do not port |
|---|---|---|
| `app/utils/transaction-analyzer.ts:144-204` | Eligible-amount exclusions (gift cards, tier products, credit and gift-card gateways) | Float maths and 2-dp rounding (:87-96) |
| `app/routes/webhooks.orders.paid.tsx:1007-1131, :453-461, :1144-1264, :818-1000` | Cashback flow; rate = tier before the order; PENDING → credit → SYNCED lock idea; TierPurchase grant | Store-credit detection via discount_applications (:64-110); synchronous 1.7k-LOC handler |
| `app/services/shopify-store-credit.service.ts:226-235` | The credit mutation call shape | Refund-to-credit flow (:562-742; double-refund risk) |
| `app/services/refund-handler.server.ts:104-105,128-148,176-223` | Known bugs turned into **regression tests** (one clawback per order, proportional rule, uuid fallback) | Everything else |
| `app/routes/api.cron.cashback-reconciliation.tsx:69-95,153-188` | The double-credit window as a test case | The re-issue logic |
| `app/services/tier-resolution.server.ts:83-92`; `app/routes/api.cron.tier-maintenance.tsx:27-31` | Priority order; 30-day grace; warnings at 7 and 1 days | The 9-service sprawl |
| `prisma/schema.prisma` (Tier, PointsConfig `dailySpin*`, MysteryBox pity ~:3493-3496, free-entry defaults ~:3029/:3495) | Field semantics; spin-wheel config | The 107-model schema |
| `app/routes/app.members.products.tsx:513-700, 560-571` | Membership product creation; productType "Tier Membership" and tags `tier-membership/<tier>/<duration>` (census and name pre-fill) | Selling-plan creation |
| `app/services/points-metafield-sync.server.ts:153-224,271-305` | `rewardspro.*` shop metafield namespace (feature census) | — |
| `app/services/mystery-box-open.server.ts:32-33` | Crypto RNG | — |
| `app/services/raffle-prize-delivery.server.ts:264-317,351`; `app/services/mystery-box-delivery.server.ts:350` | Delivery bugs → acceptance tests ("never DELIVERED without a reference") | Delivery code |
| `app/services/challenge-progress.server.ts:283-341` | Which objectives actually progressed | Streak / XP machinery |
| `app/routes/app.rewards.config.tsx:594-609` | Spin config fields (`dailySpinResetHour`, premium cost) | — |
| `app/services/mystery-box-psychology.server.ts`, `app/services/raffle-psychology.server.ts` | A list of what **not** to build | All |
| `app/routes/api.proxy.$.tsx:82-86, :214-217, :1827-2206` | Safe `getProxyCustomerId`; the IDOR as a regression test; the endpoint list for aliases | The 2.3k-LOC catch-all |
| `app/routes/webhooks.compliance.tsx:257,423,542-549`; `app/services/shop-data-cleanup.server.ts:55-72` | Failure modes → tests | Handlers; immediate hard-delete |
| `app/constants/pricing-contract.ts:212-273`; `entitlement-contract.ts:65-97`; `commercial-retirement.ts:2,7` | Legacy alias map (census only); flags to supersede | Plan catalogue |
| `app/services/gift-card/gift-card.service.ts:495-560` | The rationale for dropping conversion | Conversion flow |
| `app/services/email-notifications.server.ts:103-851` | Tier up/down/expiry email content | Senders |
| `app/routes/app.marketing.automation.create.tsx:85-214` | Trigger catalogue → Flow trigger list | Builder |
| `app/services/analytics-recommendations.server.ts:4-12,65` | Nothing (fabricated benchmarks) | All |
| `app/entry.client.tsx:24,44-46`; `extensions/rewards-pro-membership/src/config.ts:37` | — | Unmasked Replay; hardcoded host |
| `extensions/theme-app-extension-rewardspro/blocks/*.liquid`, `assets/*` | The 18 setting ids (contract fixture); widget UX ideas | 11.5k hand-written lines |
| `shopify.app.toml`, both `shopify.extension.toml` | Identity values (contract tests) | `automatically_update_urls_on_dev=true`, `[auth]` callbacks |
| `docs/decisions/2026-07-23-rewardspro-free-first-pricing.md:41-48,105-148` | Principles that stay (never reduce balances arbitrarily; no surprise bills) | The paid-usage ban (superseded for AI only) |
| `cambridgetcg/rewardspro-production`: `feat/honest-monetization` (`isBillableOrderPayload` `b9ed5ea`, SetupChecklist `e0ac2b3`, `app.loyalty-impact.tsx` `6adcf44`); landing redesign `cd02df7`, `601e788`, `9e36e34` | Test-order gate, checklist idea, landing | Float `money.ts` |
| `apps/rewardspro-api/src` (v2) | HMAC inbox, checksummed migration pattern | The service itself |

## Appendix B: corrections applied to the judged designs

| Flagged error or gap | Source | Fix here |
|---|---|---|
| Dev/preview DB is a Neon **branch of prod** (breaks Level 2) | mvp, merchant | Separate `rewardspro-nonprod` project, synthetic data (§2.4) |
| JSON metafield with tags off cannot drive segments | risk | Tag `rp-tier:<key>` on by default (D11) |
| "Resend is the cheapest with a DPA" | risk | SES is cheaper but needs a new AWS account; Resend free tier first (§1.1) |
| "V1 stops a block calling a dead host" | risk | The host is up; its data plane is dead (§8 V1) |
| Revoking the old secret at P5 kills tokens minted after V2 | mvp | Rotate **before** V2, dual-verify, revoke after drain (§8) |
| `compliance_request` "holds no PII" yet stores `customer_gid` | mvp | Pseudonymised once DONE (§7) |
| Theme toml "deploys today" | mvp | VERIFY on staging before M2 (§6.4) |
| `min(eligible, nonCredit)` lets credit-funded goods earn | mvp | Pro-rata tender share (§5.3) |
| `tender_share_ppm` locked at first accrual | risk | Recomputed every reconcile (§5.3) |
| `customers/update` subscribed while writing tags → loop and PII | merchant | Not subscribed (§6.2) |
| `refunds/create` inside the orders subscription loses `order_id` | merchant | Own subscription with `id, order_id, created_at` |
| Points formula in major units and fractional rates | merchant | Integer ppm/bps formula (§4.2) |
| Debt recovery from ORDER_REFUND credits on by default, uncapped | merchant | Opt-in, capped at the credit-tendered portion, legal review (§5.2) |
| Break-even uses the £250 ceiling instead of the actual cost | risk | Both shown (§9.7) |
| Classic accounts block the whole programme | risk | Only cashback is gated (§4.2) |
| Zombie writes into the new prod DB in P0 | risk, merchant | No new credentials; V1 moves the compliance URIs (§8) |
| `[auth] redirect_urls` kept | mvp | Omitted (VERIFY CLI) |
| Canary store assumed | mvp | Marked ASSUMPTION (§8) |
| `one_in_flight` includes PLANNED (crash blocks the account) | mvp | SENT/UNKNOWN only, plus a stale-PLANNED reaper (§3.3) |
| No hold-anchor backstop | risk | Backstop paid + 30 d (§5.2) |
| VAT-inclusive pricing ignored | all | `taxesIncluded` handling (§5.3) |
| Legacy processor PII not purged | all | P0/P5 purge list (§7) |
| Advisory lock held across GraphQL calls | risk | No transaction across network calls except token refresh; the index carries the guarantee (§1.3) |
| Tier pumping via a refunded membership or qualifying order | all | Downward re-rating of pending accruals (§5.3) |
| "Jev-class" baked into the architecture | merchant | Model-agnostic ports; Jev unconfirmed (§9.3) |
| Clawback email shipped after live debits | mvp, risk | Ships in M4 with live money (§4.2) |
| Legacy proxy paths return 410 at V2 | mvp | 90-day aliases (§6.3) |
| `customers/purchasing_summary` subscribed but unused | risk | Dropped |

## Appendix C: references

**Shopify:**
- [S1] github.com/Shopify/shopify-app-template-react-router
- [S2] npm `@shopify/shopify-app-react-router`, `@shopify/shopify-app-session-storage-prisma@11.0.1` peerDeps, `prisma` dist-tags
- [S3] shopify.dev/docs/api/usage/versioning
- [S4] shopify.dev/docs/api/app-home/latest/web-components/versioning
- [S5] npm `@shopify/app-bridge-react` dist-tags; `@shopify/polaris` deprecation
- [S6] shopify.dev/docs/apps/build/authentication-authorization/migrate-to-expiring-offline-access-tokens; …/access-tokens
- [S7] shopify.dev/docs/apps/build/webhooks/subscribe
- [S8] help.shopify.com/en/manual/customers/store-credit; shopify.dev/docs/api/admin-graphql/latest/objects/StoreCreditAccount
- [S9] …/admin-graphql/latest/mutations/storeCreditAccountCredit (+ input-objects/StoreCreditAccountCreditInput, enums/StoreCreditAccountCreditUserErrorCode)
- [S10] …/mutations/storeCreditAccountDebit (+ DebitInput, DebitUserErrorCode)
- [S11] …/objects/StoreCreditAccountCreditTransaction; …/enums/StoreCreditSystemEvent
- [S12] shopify.dev/docs/apps/build/privacy-law-compliance; shopify.dev/docs/apps/launch/protected-customer-data
- [S13] shopify.dev/docs/apps/build/apis/graphql-admin/implementing-idempotency
- [S14] shopify.dev/docs/apps/build/webhooks/best-practices; shopify.dev/docs/api/webhooks/latest
- [S15] shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements (1.1.15, 1.2, 1.2.3, 2.1, 4.1.1, 4.2.1, 5.1.3)
- [S16] shopify.dev/docs/apps/build/authentication-authorization/manage-access-scopes; shopify.dev/docs/api/usage/access-scopes
- [S17] shopify.dev/docs/apps/build/online-store/app-proxies (+ …/authenticate-app-proxies)
- [S18] github.com/Shopify/shopify-app-js packages/apps/shopify-api/lib/utils/hmac-validator.ts:60-66
- [S19] shopify.dev/changelog/legacy-customer-accounts-are-deprecated
- [S20] shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration
- [S21] shopify.dev/docs/api/customer-account-ui-extensions; shopify.dev/docs/apps/build/customer-accounts/capabilities
- [S22] shopify.dev/docs/api/shopify-cli/app/app-deploy; shopify.dev/docs/apps/launch/deployment/app-versions
- [S23] shopify.dev/docs/apps/build/cli-for-apps/app-configuration; …/manage-app-config-files
- [S24] shopify.dev/docs/apps/build/flow/triggers/create; help.shopify.com/en/manual/shopify-flow
- [S25] shopify.dev/docs/apps/build/flow/actions/endpoints
- [S26] shopify.dev/docs/api/admin-graphql/latest/input-objects/DiscountContextInput; shopify.dev/docs/apps/build/marketing-analytics/customer-segments
- [S27] shopify.dev/docs/api/functions/latest
- [S28] help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-messaging/email/pricing
- [S29] shopify.dev/docs/api/admin-extensions/latest/targets
- [S30] shopify.dev/docs/apps/build/sidekick
- [S31] community.shopify.dev/t/store-credits-scoped-transaction-by-app/1831
- [S32] community.shopify.dev/t/store-credit-webhooks/9061
- [S33] community.shopify.dev/t/idempotency-key-for-store-credit-update-apis/17501
- [S34] shopify.dev/docs/api/admin-graphql/latest/mutations/refundCreate
- [S35] community.shopify.dev/t/logged-in-customer-id-erroneously-empty-with-new-customer-accounts-app-proxy/2204
- [S36] shopify.dev/changelog/shopify-ai-toolkit-for-upgrading-extensions-to-polaris-web-components
- [S37] shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant; shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/webhook
- [S38] shopify.dev/docs/apps/launch/distribution/visibility
- [S39] shopify.dev/docs/apps/launch/distribution/sunsetting-your-app
- [S40] shopify.dev/docs/apps/build/authentication-authorization/manage-credentials
- [S41] shopify.dev/docs/apps/launch/app-store-review/review-process; …/app-quality-checks
- [S42] help.shopify.com/en/partners/ppa-api-faq
- [S43] shopify.dev/docs/apps/launch/billing
- [S44] shopify.dev/docs/apps/launch/billing/manual-pricing (+ mutations appSubscriptionCreate, appUsageRecordCreate, appSubscriptionLineItemUpdate, appPurchaseOneTimeCreate)
- [S45] shopify.dev/docs/apps/launch/billing/shopify-app-pricing (+ migrating-to-shopify-app-pricing)
- [S46] shopify.dev/docs/api/app-events
- [S47] shopify.dev/changelog/update-to-shopifys-app-developer-revenue-share; help.shopify.com/en/partners/partner-program/how-to-earn

**Vendors:**
- [V1] vercel.com/docs/functions/usage-and-pricing; vercel.com/docs/pricing/regional-pricing/lhr1
- [V2] vercel.com/docs/cron-jobs/usage-and-pricing
- [V3] vercel.com/docs/functions/limitations
- [V4] vercel.com/docs/queues
- [V5] vercel.com/docs/observability/observability-plus
- [V6] neon.com/pricing; neon.com/docs/introduction/regions
- [V7] resend.com/pricing; resend.com/docs/dashboard/domains/regions
- [V8] aws.amazon.com/ses/pricing
- [V9] sentry.io/pricing; docs.sentry.io/organization/data-storage-location
- [V10] developers.cloudflare.com/r2/pricing; …/r2/reference/data-location
- [V11] vercel.com/docs/ai-gateway/pricing
- [V12] currency-converter.org.uk GBP/USD (2026-10-04; not an authoritative rate)
- [V13] vercel.com/docs/project-configuration/git-configuration; vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel; vercel.com/docs/environment-variables/system-environment-variables
- [V14] developers.klaviyo.com/en/reference/create_event; developers.klaviyo.com/en/docs/migrate_to_oauth_from_private_key_authentication
- Deploy path: vercel.com/kb/guide/deploy-shopify-app-to-vercel

**Law and practice:**
- [L1] legislation.gov.uk/uksi/2013/3134/regulation/30 and /34
- [L2] help.loyaltylion.com/en/articles/1965585-activity-make-a-purchase
- [L3] help.shopify.com/en/manual/payments/shopify-payments/managing-chargebacks
- [L4] ico.org.uk (UK GDPR Art. 22 guidance)
- [L5] gamblingcommission.gov.uk free draws and prize competitions; gov.uk voluntary code for prize draw operators

**AI:**
- [J1] infoq.com/news/2026/10/typesafe-ai-jev-released; developers.cloudflare.com/workers-ai/models/clef-flash; together.ai/models/tev1-4b-experimental. Candidates only; Yu has not confirmed what "Jev" means.

**Context files:**
- `/private/tmp/claude-501/-Users-macair/be3bdad1-179a-4ab4-a179-ae2e27f432f0/scratchpad/rp-synthesis.md`
- `/private/tmp/claude-501/-Users-macair/be3bdad1-179a-4ab4-a179-ae2e27f432f0/scratchpad/rp-critique.md`
- `/private/tmp/claude-501/-Users-macair/be3bdad1-179a-4ab4-a179-ae2e27f432f0/scratchpad/rp-maps.json`