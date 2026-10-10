# Cambridge TCG

Building open-source TCG data infrastructure from Cambridge, UK: shared tools and standards for card identity, images, prices and market observations. The [website](https://cambridgetcg.com) gives people and API clients ways to inspect those records and their sources.

The [data-platform roadmap](docs/plans/tcg-data-platform/README.md) is the current integration plan. Reference packages remain workspace-only; public repository access and package distribution are separate release gates. A source adapter, registered game or published plan does not establish available data or permission to redistribute it.

**Current boundary:** new paid commerce is retired. Existing agreements retain settlement, cancellation, refunds and support. Start with the [storefront commerce boundary](apps/storefront/docs/commercial-retirement.md), [wholesale scope](apps/wholesale/README.md), and [RewardsPro scope](apps/rewardspro/README.md); older shop and launch plans are historical context.

## Start here

| I want to… | Entry point |
|---|---|
| Explore cards, collections and community | [Website](https://cambridgetcg.com/) |
| Understand the data-platform direction | [Purpose](docs/purpose.md) and [integration roadmap](docs/plans/tcg-data-platform/README.md) — SKU, images, pricing and market foundations |
| Understand or change this repository | [Module map](docs/modules/README.md) — purpose, source paths, connections and progress |
| Review the complete website rebuild | [Draft room and content plan](docs/plans/storefront-rebuild/README.md) — purpose, pages, modules, wiring and design |
| Understand current contracts and gaps | [Card-data foundations](docs/architecture/card-data-contracts.md) — identity, images, prices, market observations and source boundaries |
| Run the site locally | [Local development](#local-development), then the [storefront guide](apps/storefront/README.md) |
| Find a guide or recorded decision | [Documentation](docs/README.md) |
| Work as a coding agent or use the API | [Agent guide](docs/agents/README.md) — repository rules and public interfaces |

This README is the human contributor entrance. Module records describe the
checked-in source and recorded work; they do not establish deployment or service
health. Coding-agent instructions live in [AGENTS.md](AGENTS.md).

## Layout

| Path | Role and status |
|---|---|
| [`apps/storefront`](apps/storefront/README.md) | Human data tools, collector pages, `/api/v1` interfaces and `/admin/*` console; Next.js App Router |
| [`apps/admin`](apps/admin/README.md) | Retired standalone app; redirect shell and retained review documentation, with no dev/build/test scripts |
| [`apps/wholesale`](apps/wholesale/README.md) | Price research and existing order operations; new orders and quote requests retired |
| [`apps/rewardspro`](apps/rewardspro/README.md) | Existing loyalty and rewards platform; new paid subscriptions and plan changes retired |
| [`apps/rewardspro-api`](apps/rewardspro-api/README.md) | Separate v2 ingestion foundation; does not claim legacy feature, data or business-rule parity |
| [`packages/`](packages/) | Shared database, pricing, stock, data, lifecycle and other domain libraries |
| [`docs/`](docs/README.md) | Architecture, decisions, runbooks, principles and dated verification records |

The [module map](docs/modules/README.md) expands this layout into individual
module records. Its [JSON catalog](docs/modules/catalog.json) gives tools the
same inventory.

## Local development

Use the pnpm workspace from this repository root. [`package.json`](package.json)
pins pnpm 9.15.0. Use Node 24 LTS for workspace development: the root accepts
Node >=20, while [RewardsPro API](apps/rewardspro-api/package.json) requires
Node >=24 <25.

```sh
pnpm install --frozen-lockfile
pnpm dev:storefront --hostname 127.0.0.1
```

The storefront and its admin console run at `http://127.0.0.1:3001`. Configure only the services needed for your task with local fixtures or scoped development credentials; installation alone does not configure a database or provider. Other apps have their own linked setup guides. Keep credential values out of tracked files, command output and documentation.

## Verification

Choose checks for the files changed. These commands are defined in the root or storefront package scripts:

```sh
pnpm audit:tracked-secrets
pnpm audit:modules
pnpm --filter cambridgetcg-storefront typecheck
pnpm --filter cambridgetcg-storefront exec vitest run path/to/changed-area.test.ts
```

Replace the last path with the relevant test, relative to `apps/storefront`.
After changing a module's purpose, connections or progress, update its record
with dated evidence in the [catalog](docs/modules/catalog.json), regenerate with
`pnpm docs:modules`, then check with `pnpm audit:modules`. The
[module guide](docs/modules/README.md) explains the fields and generated files.
The credential audit reports filenames and categories without values; it covers
tracked working files, not Git history, ignored files or provider revocation.

`pnpm run audit` runs the project audit chain; `pnpm audit` is pnpm's dependency vulnerability check. `pnpm verify` combines workspace typechecks, the project audits and selected package/storefront tests. Some audits can access a database: inspect their requirements and use safe fixtures before running the full chain.

For an already-running local storefront, `STOREFRONT_BASE_URL=http://127.0.0.1:3001 pnpm --filter cambridgetcg-storefront test:e2e:smoke` checks the auth surface. Playwright starts no server and otherwise defaults to production. The old `pnpm smoke` runner is stale and is not a verification gate. The [storefront scripts](apps/storefront/package.json) define the available checks.

## Find the next detail

- [Module map](docs/modules/README.md) — source inventory, connections and progress; [docs index](docs/README.md) — guides by audience and purpose.
- [Historical development plan](docs/development-plan.md) — earlier architecture and proposals; read current module records before using its paths or status claims.
- [Current commerce boundary](apps/storefront/docs/commercial-retirement.md) — current storefront policy and preserved obligations.
- [Operations and verification](docs/README.md#operations-and-verification) — infrastructure, deployment and credential-scoped checks.
- [Agent guide](docs/agents/README.md) — repository instructions, machine interfaces and optional project culture.

## Data rights

Code follows the root [Apache-2.0 license](LICENSE) and applicable more-specific notices. The [CC0 dedication](docs/STANDARDS-LICENSE.md) covers specification prose. Provider data, publisher text and artwork retain their own terms; check each source, field and permitted use before reuse. These are separate from repository access, API authentication and package publication.
