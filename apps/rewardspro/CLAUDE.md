# RewardsPro — per-app agent guide

RewardsPro is a **Shopify loyalty & rewards app**: points, tiers, cashback, store
credit, memberships, mystery boxes, raffles, missions, and email campaigns for
Shopify merchants. Remix (Vite) + Polaris embedded app, Prisma → Aurora
PostgreSQL, deployed on Vercel (see `vercel.json` — it also carries ~24 cron
routes). The Shopify surface lives in `shopify.app.toml` + `extensions/`.

Fused into the monorepo on 2026-06-10 from
`github.com/cambridgetcg/rewardspro-production` with full history (1123
commits, rewritten under `apps/rewardspro/` — `git log`/`blame` work). The
repo-root [`CLAUDE.md`](../../CLAUDE.md) carries the four doctrines; they apply
here too.

## Commands (pnpm, from repo root)

```
pnpm dev:rewardspro              # shopify app dev (SKIP_DB_CHECKS=1)
pnpm build:rewardspro            # prisma generate && remix vite:build
pnpm test:rewardspro             # vitest unit suite (306 tests at fuse time)
pnpm --filter rewardspro exec tsc --noEmit   # typecheck (0 errors at fuse time)
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
- `extensions/rewards-pro-membership` — checkout/customer-account UI extension;
  a workspace package (`pnpm-workspace.yaml` includes
  `apps/rewardspro/extensions/*`) but **excluded from root typecheck** (its own
  stricter tsconfig was never a gate; its sources still compile under this
  app's tsconfig)
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
- Deploy: the Vercel project must point at this monorepo with root directory
  `apps/rewardspro` (vercel.json already speaks pnpm).
