# Cambridge TCG website and API

This app contains the collector website, public `/api/v1` interfaces, account
records and the `/admin` console. It uses Next.js App Router and shared workspace
packages. Start at the [repository guide](../../README.md) for the whole project
or the [module record](../../docs/modules/apps/storefront.md) for its purpose
and progress.

New paid commerce is retired. Existing agreements retain settlement,
cancellation, refunds and support. The
[commerce boundary](docs/commercial-retirement.md) describes the admission gates
and preserved obligations; older shopping and launch documentation is historical.

## Entrances

| Route | Purpose |
|---|---|
| `/` | Visitor landing page: cards, collections, community and help finding a starting point |
| `/agents` | Practical entry for API clients: discovery, contracts and integration guides |
| `/account` | Signed-in account tools and existing records |
| `/admin` | Operator console, subject to its authentication and permissions |
| `/start`, `/welcome` | Compatibility entrances that redirect visitors to the appropriate current entry |

These are source routes, not a claim about the currently deployed revision.
Public discovery does not grant access to private accounts or permission to act.
Coding agents should read [AGENTS.md](../../AGENTS.md) and the
[app-specific Next.js instructions](AGENTS.md).

## Run locally

From the **repository root**, using Node 24 LTS and the pinned pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm dev:storefront --hostname 127.0.0.1
```

Open `http://127.0.0.1:3001`; the admin console is under `/admin` on the same
server. The retired `apps/admin` shell is not a separate development service.

Configure only the services the task needs using local fixtures or scoped
development credentials. Installing packages does not provision PostgreSQL,
email, authentication or payment providers. A rendered page alone does not
verify those integrations. Keep credential values out of source, logs and
documentation; consult the [verification runbook](../../docs/ops-credential-verification.md)
when a task needs provider access.

## Find the implementation

| Source | Responsibility |
|---|---|
| [`src/app`](src/app/) | Pages, route handlers and layouts; root `page.tsx` is the visitor landing page |
| [`src/components/layout`](src/components/layout/) | Shared navigation, footer and client providers |
| [`src/lib`](src/lib/) | Domain rules, data access, account/authentication helpers and shared UI primitives |
| [`src/lib/db.ts`](src/lib/db.ts) | Database compatibility helper backed by `@cambridge-tcg/db` |
| [`src/lib/manifest.ts`](src/lib/manifest.ts), [`src/lib/data-pantry`](src/lib/data-pantry/) | Public resource discovery and response envelopes with rights/provenance metadata |
| [`src/lib/release/commercial-retirement.ts`](src/lib/release/commercial-retirement.ts) | New paid-commerce admission policy |
| [`drizzle`](drizzle/) | Append-only SQL migrations; inspect the target and applicable runbook before applying them |
| [`scripts`](scripts/), [`tests`](tests/) | Operational audits and browser checks; unit tests also live beside source |

Use the [storefront domain map](../../docs/modules/storefront/README.md) for
individual domains and their connections. Before changing Next.js code, read
the relevant guide in `node_modules/next/dist/docs/` for the installed version.

## Check a change

From the repository root:

```sh
pnpm audit:tracked-secrets
pnpm audit:modules
pnpm --filter cambridgetcg-storefront typecheck
pnpm --filter cambridgetcg-storefront exec vitest run path/to/relevant.test.ts
```

Choose the test path relative to this app. The [package scripts](package.json)
are the command contract. Inspect an audit's inputs before running it: some
operational checks can access a database or external service. The root
`pnpm verify` chain includes those checks; it is not an offline-only command.

For an already-running local server, the GET-only authentication smoke check is:

```sh
STOREFRONT_BASE_URL=http://127.0.0.1:3001 pnpm --filter cambridgetcg-storefront test:e2e:smoke
```

To check the visitor/API entries, responsive search and compatibility redirects:

```sh
STOREFRONT_BASE_URL=http://127.0.0.1:3001 pnpm --filter cambridgetcg-storefront exec playwright test tests/entry-pages.spec.ts
```

The entry spec requires a loopback target and intercepts search submission;
it does not verify catalogue data or account services.

Playwright starts no server and otherwise defaults to production. This smoke
test covers authentication surfaces, not all pages or full sign-in delivery.
The inherited `pnpm smoke` admin runner is stale.

For wider context, use the [documentation index](../../docs/README.md).
Deployment is a separate, explicitly authorized operation described in the
[operations runbook](../../docs/ops-deploy-runbook.md).
