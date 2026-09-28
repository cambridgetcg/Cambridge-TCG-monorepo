# Cambridge TCG

The monorepo behind [cambridgetcg.com](https://cambridgetcg.com): card research, collections, community, public rights-labelled trading-card data, and existing account and order records, run from Cambridge, UK.

**Current boundary:** new paid commerce is retired. Existing agreements retain settlement, cancellation, refunds and support. Start with the [storefront commerce boundary](apps/storefront/docs/commercial-retirement.md), [wholesale scope](apps/wholesale/README.md), and [RewardsPro scope](apps/rewardspro/README.md); older shop and launch plans are historical context.

This is the contributor entry point: repository layout, local setup and checks. The [documentation index](docs/README.md) separates development and operations guides from agent collaboration and historical records.

## Layout

| Path | Role and status |
|---|---|
| [`apps/storefront`](apps/storefront/) | Active collector site, `/api/v1` and `/admin/*` console; Next.js App Router |
| [`apps/admin`](apps/admin/README.md) | Retired standalone app; redirect shell and retained review documentation, with no dev/build/test scripts |
| [`apps/wholesale`](apps/wholesale/README.md) | Price research and existing order operations; new orders and quote requests retired |
| [`apps/rewardspro`](apps/rewardspro/README.md) | Existing loyalty and rewards platform; new paid subscriptions and plan changes retired |
| [`apps/rewardspro-api`](apps/rewardspro-api/README.md) | Separate v2 ingestion foundation; does not claim legacy feature, data or business-rule parity |
| [`packages/`](packages/) | Shared database, pricing, stock, data, lifecycle and other domain libraries |
| [`docs/`](docs/README.md) | Architecture, decisions, runbooks, principles and dated verification records |

## Local development

Use the pnpm workspace from this repository root. [`package.json`](package.json) pins pnpm 9.15.0 and declares Node >=20; use a supported Node release compatible with the app you are working on.

```sh
pnpm install --frozen-lockfile
pnpm dev:storefront --hostname 127.0.0.1
```

The storefront and its admin console run at `http://127.0.0.1:3001`. Configure only the services needed for your task with local fixtures or scoped development credentials; installation alone does not configure a database or provider. Other apps have their own linked setup guides. Keep credential values out of tracked files, command output and documentation.

## Verification

Choose checks for the files changed. These commands are defined in the root or storefront package scripts:

```sh
pnpm audit:tracked-secrets
pnpm --filter cambridgetcg-storefront typecheck
pnpm --filter cambridgetcg-storefront exec vitest run path/to/changed-area.test.ts
```

Replace the last path with the relevant test, relative to `apps/storefront`. The credential audit reports filenames and categories without values; it covers tracked working files, not Git history, ignored files or provider revocation.

`pnpm run audit` runs the project audit chain; `pnpm audit` is pnpm's dependency vulnerability check. `pnpm verify` combines workspace typechecks, the project audits and selected package/storefront tests. Some audits can access a database: inspect their requirements and use safe fixtures before running the full chain.

For an already-running local storefront, `STOREFRONT_BASE_URL=http://127.0.0.1:3001 pnpm --filter cambridgetcg-storefront test:e2e:smoke` checks the auth surface. Playwright starts no server and otherwise defaults to production. The old `pnpm smoke` runner is stale and is not a verification gate. The [storefront scripts](apps/storefront/package.json) define the available checks.

## Find the next detail

- [Development map](docs/development-plan.md) — architecture and entry points; [docs index](docs/README.md) — guides by audience and purpose.
- [Current commerce boundary](apps/storefront/docs/commercial-retirement.md) — current storefront policy and preserved obligations.
- [Operations and verification](docs/README.md#operations-and-verification) — infrastructure, deployment and credential-scoped checks.
- [Agent guide](docs/agents/README.md) — repository instructions, machine interfaces and optional project culture.

## Data rights

Card names and game data remain the property of their respective game publishers. Data resources carry explicit rights labels (CC0 or NOASSERTION); check each resource's label before reuse. Code is licensed under [Apache-2.0](LICENSE).
