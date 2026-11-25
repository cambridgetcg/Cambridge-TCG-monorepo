# @cambridge-tcg/db

Shared database connection for the Cambridge-TCG monorepo.

## What it owns

- Single postgres.js connection pool (replaces per-query Pool creation)
- TLS/SSL configuration for RDS
- Drizzle ORM instance creation
- `DbClient` type (shared by all packages)
- Compatibility layer for raw SQL migration path

## Usage

### Drizzle query builder (wholesale, stock package)

```ts
import { createDb } from "@cambridge-tcg/db";
import * as schema from "./schema";

export const { db, client, close } = createDb({ schema });

// Drizzle queries
const cards = await db.query.cards.findMany();

// Transactions
await db.transaction(async (tx) => {
  await tx.insert(cards).values({ ... });
});
```

### Raw SQL compatibility (storefront migration path)

```ts
import { createCompatDb } from "@cambridge-tcg/db/compat";

const { query, transaction } = createCompatDb();

// Drop-in for old pg pool.query(sql, params) pattern
const result = await query("SELECT * FROM users WHERE id = $1", [id]);
console.log(result.rows);

// Drop-in for old BEGIN/COMMIT/ROLLBACK pattern
const user = await transaction(async (q) => {
  const r = await q("SELECT * FROM users WHERE id = $1 FOR UPDATE", [id]);
  await q("UPDATE users SET name = $1 WHERE id = $2", [name, id]);
  return r.rows[0];
});
```

### Type export (for shared packages)

```ts
import type { DbClient } from "@cambridge-tcg/db";

// Accept any Drizzle client (root db or transaction)
function doStuff(tx: DbClient) { ... }
```

## Configuration

| Env var | Required | Description |
|---------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |

Options passed to `createDb()`:
- `url` — override DATABASE_URL
- `max` — max connections (default: 1, for Vercel serverless)
- `ssl` — SSL mode (default: `"require"`)
- `schema` — Drizzle schema object for relational queries

## Architecture

```
packages/db
├── src/
│   ├── index.ts      # createDb factory, DbClient type, re-exports
│   ├── compat.ts     # createCompatDb — pg-compatible query/transaction
│   └── timestamp.ts  # dbTimestamp — a driver timestamp as a Date
├── package.json
├── tsconfig.json
└── README.md
```

The package exports three entry points:
- `@cambridge-tcg/db` — factory + types (for Drizzle-first code)
- `@cambridge-tcg/db/compat` — compatibility layer (for raw SQL migration)
- `@cambridge-tcg/db/timestamp` — `dbTimestamp`, pure, for reading timestamps

## Timestamps

Raw queries return a `timestamptz` as Postgres text (`2026-07-11 09:30:00+00`)
and a `date` as `2026-07-11`, because `drizzle()` replaces postgres.js's date
parsers. Only a Drizzle typed select gives a `Date`. Read a timestamp with
`dbTimestamp(row.created_at)`; `new Date(row.created_at)` also works in Node.
Do not call Date methods on it, compare it with a `Date` (always false) or test
it against an ISO 8601 pattern. A test that mocks `query` with node-postgres
gets Dates and cannot see any of this: use `createCompatDb` instead.

## Why this exists

Before this package:
- Wholesale had a correct singleton postgres.js client
- Storefront created a new `pg.Pool()` for **every single query** — TCP+TLS handshake per SQL statement
- Stock package defined its own `DbClient` type independently
- SSL workaround was copy-pasted in 14+ files

After:
- One connection factory, one pool, one source of truth
- Storefront gets persistent connections (massive latency improvement)
- All packages share `DbClient` from one place
- SSL/TLS configured once
