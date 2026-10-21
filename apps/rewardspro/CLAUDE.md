# RewardsPro — per-app agent guide

## Free-only, without commercial targets

RewardsPro relaunches free-only: Free Forever is the whole offer, and paid plans
and billing webhooks stay off
([2026-10-20 decision](../../docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md),
an agent's call under Yu's delegation). Since 2026-09-23 there has been no KPI,
revenue, conversion or growth target. Merchant-facing copy says paid plans
aren't offered; it doesn't talk about retirement, and it never tells a shop
that still pays that RewardsPro is free (`paidPlansNotOfferedMessage` in
`app/constants/commercial-retirement.ts` branches on that). Existing agreements keep
their records, cancellation, refund and support paths, and nothing rewrites
their entitlements or cancels them automatically.


RewardsPro is a **Shopify loyalty & rewards app**: points, tiers, cashback, store
credit, memberships, mystery boxes, raffles, missions, and email campaigns for
Shopify merchants. Remix (Vite) + Polaris embedded app, Prisma → Postgres 17
on Supabase ([`docs/DATABASE.md`](docs/DATABASE.md)), deployed on Vercel (see
`vercel.json` — it also carries ~24 cron routes). The Shopify surface lives in `shopify.app.toml` + `extensions/`.

Guards that need a decision to lift, not a refactor:

- **Raffles, mystery boxes and instant wins are paused** by the code constant
  `CHANCE_MECHANICS_PAUSED` (`app/constants/chance-mechanics.ts`) pending
  legal review: no entry, open, draw or near-miss copy.
- **Marketing email needs consent**: only Shopify `SUBSCRIBED` customers, sent
  through `app/services/marketing-email.server.ts` with an unsubscribe link and
  headers, and off until `SENDGRID_WEBHOOK_VERIFICATION_KEY` is set.
- **Webhooks are subscribed only in `shopify.app.toml`**; a unit test pairs
  every `webhooks.*` route with a subscription.
- **Store credit for an order's cashback moves only through its claimed
  ledger entry** (`claimLedgerEntry`, PENDING to SYNCING, in
  `app/services/cashback-ledger.server.ts`). The Orders page issues only a
  PENDING entry, never `Order.cashbackAmount` or an imported history record.
  An entry goes back to PENDING only when nothing was sent or Shopify said
  it applied nothing: a 4xx, GraphQL errors that all carry a code Shopify
  documents as refusing before the mutation runs (THROTTLED, ACCESS_DENIED,
  SHOP_INACTIVE, MAX_COST_EXCEEDED), or a documented userError code
  (`app/services/shopify-store-credit.service.ts`). Anything else (no
  answer, a 5xx, INTERNAL_SERVER_ERROR answered as a 200, an unknown code)
  leaves it SYNCING (`markUnconfirmed`), never re-sent. Amounts reach
  Shopify through `formatForShopify` (decimal, never float arithmetic).
- **A refund reaches an order's cashback once.** Both order syncs import
  Shopify's refunds as `OrderRefund` rows (by refund id) together with the
  refunded total, never the total alone; refunds/create applies an imported
  row less what its `cashbackAdjustment` says orders/paid or the cron took
  (`app/services/refund-handler.server.ts`).

Fused into the monorepo on 2026-06-10 from
`github.com/cambridgetcg/rewardspro-production` with full history (1123
commits, rewritten under `apps/rewardspro/` — `git log`/`blame` work). The
repo-root [`AGENTS.md`](../../AGENTS.md) principles apply here too.

## Facts that bite

- **A merge to `main` deploys production.** Vercel project
  `rewardspro-production` builds `apps/rewardspro` (region `lhr1`) from `main`;
  `scripts/vercel-ignore-build.sh` skips builds that change nothing here.
  Previews have no database.
- **The build never migrates.** Apply migrations to Supabase first, through
  `scripts/prisma-tls.ts` (`migrate:deploy`), and run the drift check, before
  merging code that needs them ([`docs/DATABASE.md`](docs/DATABASE.md)).
- **`ENCRYPTION_SECRET` and `ENCRYPTION_SALT` encrypt stored Shopify tokens.**
  Changing either makes every stored token unreadable (DATABASE.md, "Key
  rotation").
- **Shopify config is a separate deploy.** `shopify.app.toml` (webhook
  subscriptions, scopes) and `extensions/` reach Shopify only through
  `shopify app deploy`, with the owner's login. The customer-account
  extension `extensions/rewards-pro-membership` (API `2025-07`, which Shopify
  refuses since 2026-10-01) was removed on 2026-10-20 so that deploy can run;
  it stays in git history. Rebuild it on a current API only if merchants want
  a customer-account view.

## Commands (pnpm, from repo root)

```
pnpm dev:rewardspro              # shopify app dev (SKIP_DB_CHECKS=1)
pnpm build:rewardspro            # prisma generate && remix vite:build
pnpm test:rewardspro             # vitest unit suite
pnpm --filter rewardspro exec tsc --noEmit   # typecheck
pnpm --filter rewardspro test:postgres       # Postgres integration suites (needs REWARDSPRO_TEST_DATABASE_URL; docs/DATABASE.md)
pnpm --filter rewardspro lint    # eslint — RED, see debt below
```

On a fresh clone, run `pnpm --filter rewardspro exec prisma generate` before
any typecheck — the root-level install leaves @prisma/client as a typeless
stub (its postinstall looks for the schema at the install root, not here).

The old npm/bun lockfiles are gone; this app installs through the workspace
`pnpm-lock.yaml` like every other app.

## The React-18 island

This app is the monorepo's only React 18 world (Polaris 12 + Remix 2);
storefront/wholesale are React 19. Three root-level mechanisms keep the type
worlds from bleeding into each other — touch them only with care:

1. **Root `package.json` → `pnpm.overrides`**: parent-scoped pins forcing
   `@shopify/polaris>@types/react` and the `@visx/*>@types/react` family to 18
   (they'd otherwise resolve their own nested 19 copies and split this app's
   compile graph — the npm flat tree used to dedupe this silently).
2. **Root `package.json` → `pnpm.packageExtensions`**: gives `next`,
   `@remix-run/react`, `react-router(-dom)` an optional `@types/react` peer so
   each app's context supplies its own version (19 for next, 18 here).
3. **Root `.npmrc`**: excludes `@types/react(-dom)` from pnpm's hidden hoist
   fallback so no library ever binds a nondeterministic React types version.

If you add a dependency here whose `.d.ts` imports React and typecheck
suddenly splits into "two @types/react" errors (TS2786 / "not a valid JSX
element type"), extend mechanism 1 or 2 — don't pin a global `@types/react`.

## Workspace shape

- `app/` — Remix routes, services, repositories (the app proper)
- `extensions/theme-app-extension-rewardspro` — theme widgets (Liquid, JS,
  CSS; no package build step)
- `prisma/` — schema + migrations (own database; not `@cambridge-tcg/db`)
- `test/` — vitest unit + integration suites (`test:e2e` is a dangling
  playwright script: no config, no specs — inherited debt)
- `tools/`, `scripts/` — foundation CLIs
- Docs: `README.md`, `PRODUCT_VISION.md`, `DEPLOY.md`, `docs/` (the
  standalone-era `*_ARCHITECTURE.md` files were gitignored there and never
  reached git — they exist only in old local checkouts)

## Known debt (inherited from standalone, 2026-06-10)

- **Lint is red** (817 errors standalone, 1029 under the workspace incl.
  extensions/) — excluded from the CI lint sweep in `.github/workflows/ci.yml`;
  burn it down before re-including.
- `npm run`-style strings remain inside some package.json script bodies and
  older docs here; they work under pnpm but read stale.
