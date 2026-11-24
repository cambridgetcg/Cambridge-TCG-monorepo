# The database

RewardsPro keeps its data in Postgres 17 on Supabase: project `rewardspro-prod` (ref `ebrnfpgoqhvmysfujoog`, London, eu-west-2). The app runs in Vercel's `lhr1` (London), beside it.

| Schema | Owned by role | What it holds |
|---|---|---|
| `rewards` | `rewards_app` | This app's tables: [prisma/schema.prisma](../prisma/schema.prisma). |
| `rewardspro` | `rewardspro_app` | The previous version's records, until the owner dumps and drops them. Nothing runs on them ([switch.md](switch.md), B5). |

Each role owns its one schema and can't create another. Supabase's Data API can't see `rewards` (checked at the switch).

## Connection strings

| Name | Used by | Points at | Where it lives |
|---|---|---|---|
| `REWARDS_DATABASE_URL` | the app, and the production build's migration check | Supavisor **transaction** pooler, port 6543 | Vercel, Production only, typed sensitive |
| `REWARDS_DIRECT_URL` | `migrate:deploy` and `migrate:drift` | Supavisor **session** pooler, port 5432 | the owner's own shell, while a migration is applied; never in Vercel |

```
REWARDS_DATABASE_URL=postgresql://rewards_app.<ref>:<pw>@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?schema=rewards&connection_limit=3
REWARDS_DIRECT_URL=postgresql://rewards_app.<ref>:<pw>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?schema=rewards
```

- `<ref>` is the project ref above. `<pw>` is the `rewards_app` password, URL-encoded (a hex password from `openssl rand -hex 24` needs no encoding). Only the owner holds it. It is never committed or written to a file. (It is written `<pw>`, not `<password>`, because a commit hook reads any longer placeholder in a URL as a real password.)
- `schema=rewards` is required on both. The migrations create their tables in the schema the URL names. The dashboard's ready-made `postgres` string has no `?schema=`, so it would put every table in `public`, which the Data API serves to the project's anon key. `scripts/prisma-tls.ts` refuses a remote URL unless its schema is `rewards` and its user is `rewards_app` or `rewards_app.<ref>`, and prints the shape expected (READINESS-1). In production the app refuses to start on a URL without it.
- `connection_limit=3` is the app's pool size per instance (Fluid compute). The transaction pooler shares the database's connections between instances.
- `pgbouncer=true` never goes on `REWARDS_DIRECT_URL`: Prisma's migration engine needs a session, and `prisma-tls.ts` refuses it. `REWARDS_DATABASE_URL` doesn't need it: the driver uses no named prepared statements.
- `connect_timeout` (seconds) is optional; without it, 10.
- `sslmode` is ignored, because TLS is set in code. `sslmode=disable` on a remote host is refused.

## TLS

Every remote server must present a certificate for its host name that chains to the Supabase Root 2021 CA in `app/db/database-tls.server.ts`. `app/db/database-connection.server.ts` sets this for the app and for the migration scripts, and nothing switches it off. Only loopback databases (a local one, CI's) connect without TLS.

The root expires on 2031-04-26. If Supabase rotates it, replace the certificate and the fingerprint pinned in `test/unit/db/database-connection.test.ts` together.

Prisma's own engine can't verify that chain, so the Prisma CLI reaches a remote database only through `scripts/prisma-tls.ts`. Its header says why and how.

## Encryption keys

`ENCRYPTION_SECRET` and `ENCRYPTION_SALT` (each `openssl rand -hex 32`; Vercel Production, typed sensitive) encrypt the Shopify access and refresh tokens stored in `Session` (AES-256-GCM). The app doesn't start without both. They are independent of `SHOPIFY_API_SECRET`, so rotating that one makes no stored token unreadable.

**Never change either key without a re-encryption step.** Every stored token would read as missing, and each store would go dark (webhooks, widget, scheduled jobs) until its merchant next opens the app.

## Migrations

- **A pull request with a migration** is applied to production before it merges. [switch.md](switch.md#a-pull-request-with-a-migration) has the steps, the build's check, the escape hatch and the SQL-editor fallback.
- `migrate:deploy` applies `prisma/migrations`. `migrate:drift` compares the database with `prisma/schema.prisma` and exits 0 when they match. Both read `REWARDS_DIRECT_URL`.
- The build never migrates. It only reads which migrations production has (`check:migrations`).
- Never run `prisma db push` or `prisma migrate reset` against production. An applied migration is never edited: change the schema with a new one.

Locally, `scripts/test-db.sh` starts a throwaway test database, or staging's; its header has the commands. CI's `rewards` job runs the migrations, the drift check and the Postgres tests on `postgres:17`.

## Driver notes

The app queries through `@prisma/adapter-pg` (node-postgres).

- A failed query costs a reconnect: the pool drops its connection, so the next query opens a new one. That includes errors the code expects, such as a unique-key conflict.
- In raw SQL, cast Postgres' `name` columns (`current_user`, `tablename`, `relname`) with `::text`; the adapter can't read that type. Qualify tables with `databaseSchema` from `app/db.server.ts`: an unqualified name resolves through the role's `search_path`.
- Inside an interactive transaction use its `tx`, never the global client. The transaction holds one of the pool's connections; with a pool of one, as in the Postgres tests, a query outside it waits until the transaction times out.

## Before Supabase

The previous version used Aurora until 2026-10-13, when its AWS account was deleted. The keys of that account in this repository's history died with it, so they need no rotation (recorded that day).

The previous version's migrations from before its 2026-10-18 baseline are in git, at `ab3877e7` (`apps/rewardspro/prisma/migrations`).
