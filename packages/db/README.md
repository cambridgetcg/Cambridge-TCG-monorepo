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
│   ├── index.ts    # createDb factory, DbClient type, re-exports
│   └── compat.ts   # createCompatDb — pg-compatible query/transaction
├── package.json
├── tsconfig.json
└── README.md
```

The package exports two entry points:
- `@cambridge-tcg/db` — factory + types (for Drizzle-first code)
- `@cambridge-tcg/db/compat` — compatibility layer (for raw SQL migration)

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
