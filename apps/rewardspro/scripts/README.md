# Scripts

Developer tooling for RewardsPro. Database access goes through the app's own
client (`app/db.server.ts`), so every script that touches data needs the same
`DATABASE_URL` the app uses; see [docs/DATABASE.md](../docs/DATABASE.md).

The Aurora Data API scripts that used to live here (ad-hoc `apply-*`
migrations, mock-data generators, tunnel setup) were removed on 2026-10-18 with
the move to plain Postgres. Schema changes now go through `prisma/migrations`
and `prisma migrate deploy`. They remain in git history.

## Foundation CLIs

Each directory has its own README and a `package.json` script:

| Directory | Script |
|-----------|--------|
| `architecture/` | `pnpm arch:list`, `arch:graph`, `arch:diagram`, `arch:validate` |
| `claude-design-bridge/` | `pnpm claude-design` |
| `foundation-baseline/` | `pnpm baseline:take`, `baseline:diff`, `baseline:show` |
| `foundation-export/` | `pnpm foundation:export` |
| `foundation-health/` | `pnpm health` |
| `handoff-validator/` | `pnpm validate-handoff` |
| `ledger-validator/`, `ledger-contract/` | `pnpm validate-ledger` |
| `raffle-validator/`, `raffle-contract/` | `pnpm validate-raffles` |
| `migration-planner/`, `migration-patcher/` | `pnpm migration:plan`, `migration:patch` |
| `usage-analyzer/` | `pnpm usage-report` |
| `rp-registry/` | library used by the CLIs above |

## Safety

- Never run a script that writes against production without a backup.
- Read a script before running it; the loose one-off files here are not
  maintained and may be out of date with the schema.
