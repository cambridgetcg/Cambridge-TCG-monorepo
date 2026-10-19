# RewardsPro database

RewardsPro keeps its data in Postgres 17 on Supabase: project
`rewardspro-prod` (ref `ebrnfpgoqhvmysfujoog`, region eu-west-2, London). The
app's tables live in schema `rewardspro`, owned by role `rewardspro_app`. That
role can do nothing else: it cannot create schemas or databases and has no
rights in `public`. Vercel runs the functions in `lhr1` (London), next to the
database.

Until 2026-10-13 the app used Aurora through the RDS Data API. That AWS
account has been deleted. The old migration history (28 migrations plus
hand-run SQL) was squashed into one baseline on 2026-10-18 and remains in git
history: see `apps/rewardspro/prisma/migrations` at commit `ab3877e7`.

## Connections

| Variable | Used by | Points at |
|---|---|---|
| `DATABASE_URL` | the app at runtime | Supavisor **transaction** pooler, port 6543 |
| `DIRECT_URL` | migrations (`prisma migrate`) | Supavisor **session** pooler, port 5432 |

```
DATABASE_URL=postgresql://rewardspro_app.ebrnfpgoqhvmysfujoog:<password>@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=rewardspro
DIRECT_URL=postgresql://rewardspro_app.ebrnfpgoqhvmysfujoog:<password>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?schema=rewardspro
```

`<password>` is the `rewardspro_app` password, URL-encoded. The owner holds
it; it is never committed or written to a file.

The query parameters do the following:

- `schema=rewardspro` sets the schema Prisma queries (required on both URLs).
- `connection_limit=1`: each serverless instance holds at most one
  connection, and the transaction pooler shares the database's connections
  between instances. With one connection, never query through the global
  client while an interactive `prisma.$transaction` is open in the same
  request: the transaction holds the connection, and the second query waits
  until the transaction times out. Inside a transaction, use its `tx`.
- `pgbouncer=true` is for the transaction pooler only. Prisma's migration
  engine needs a session, so `DIRECT_URL` must not carry it
  (`scripts/prisma-tls.ts` refuses it).
- `connect_timeout` (seconds, optional) bounds connection setup; the default
  is 10.
- `sslmode` is ignored, because TLS is configured in code (below).
  `sslmode=disable` on a remote host is refused.

## TLS

Every connection to a non-loopback host verifies the server certificate
against the Supabase Root 2021 CA bundled in
`app/utils/database-tls.server.ts` (SHA-256 fingerprint
`80:70:25:AD:…:CA:FA`, pinned by `test/unit/utils/database-connection.test.ts`),
with hostname checking. `app/utils/database-connection.server.ts` builds these
settings and both paths below use it. Verification cannot be switched off.
Only loopback databases (local development, CI) connect without TLS.

- **Runtime:** `app/db.server.ts` connects through `@prisma/adapter-pg`
  (node-postgres), so Node does the TLS. The CA is part of the server bundle
  because it is code, not a file read at runtime.
- **Migrations and other Prisma CLI commands:** Prisma's schema engine does
  its own TLS, and it cannot verify this chain. With `sslmode=require` it
  accepts any certificate. With `sslaccept=strict` it uses the OS verifier,
  and macOS rejects Supabase's 5-year server certificate even with the right
  root (Apple's TLS policy: `OtherTrustValidityPeriod`, `ServerAuthEKU`).
  `scripts/prisma-tls.ts` therefore runs the Prisma command against a bridge
  on 127.0.0.1 that opens the upstream connection itself. It uses Postgres'
  SSLRequest and Node TLS, verified like the runtime path. Plaintext never
  leaves the machine. A loopback `DIRECT_URL` passes straight through.

The bundled root CA expires on 2031-04-26. If Supabase rotates it, replace the
PEM and the pinned fingerprint together.

## Environment variables

Database and session storage need these four. The other variables (Shopify,
`CRON_SECRET`, email, monitoring) are unchanged.

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes, runtime | Transaction pooler URL above. Not needed to build. |
| `DIRECT_URL` | for migrations | Session pooler URL above. Not read at runtime or build. |
| `ENCRYPTION_SECRET` | yes, runtime | Encrypts Shopify access tokens and integration credentials at rest (AES-256-GCM). Generate with `openssl rand -hex 32`. No fallback: the app refuses to start without it. |
| `ENCRYPTION_SALT` | yes, runtime | Key-derivation salt. `openssl rand -hex 32`. |

**Key rotation.** `ENCRYPTION_SECRET` is independent of the Shopify client
secret, so rotating `SHOPIFY_API_SECRET` never touches stored data. Set
`ENCRYPTION_SECRET` and `ENCRYPTION_SALT` before the first deploy on
Supabase: there is no existing encrypted data to migrate. Changing either one
later makes every stored token and integration credential unreadable. The app
treats an unreadable session as missing, so admin sessions are re-created by
token exchange when a merchant next opens the app. Until then, offline work
for that shop (webhooks that call the Admin API, crons) fails, and
integrations must be reconnected. Rotate only deliberately, and expect that.

## Migrations

Apply pending migrations (this is the production deploy step):

```sh
DIRECT_URL='<session pooler URL>' pnpm --filter rewardspro migrate:deploy
```

Check that the database matches `prisma/schema.prisma` exactly. Exit code 0
means no drift; otherwise the difference is printed:

```sh
DIRECT_URL='<session pooler URL>' pnpm --filter rewardspro exec \
  tsx scripts/prisma-tls.ts migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

- Create a migration against a local database you own (`migrate dev` also
  creates a shadow database):
  `DATABASE_URL=… DIRECT_URL=… pnpm --filter rewardspro exec prisma migrate dev --name <change>`.
  Review the SQL. `rewardspro_app` cannot create schemas, so delete any
  generated `CREATE SCHEMA` statement.
- Never run `prisma db push` or `migrate reset` against production.
- The build never migrates (Vercel runs `pnpm run build`). Migrations are an
  explicit deploy step, run before the code that needs them goes live.

The baseline (`prisma/migrations/20261018000000_baseline`) creates all 110
models in an empty schema. On Postgres 17, `migrate diff` reports no
difference afterwards; CI checks this on every change.

## Deploy order

1. **Provisioned:** the `rewardspro_app` role and the `rewardspro` schema
   exist on Supabase (`test/integration/postgres/setup-database.sql`
   reproduces that setup for tests).
2. Set `DATABASE_URL`, `DIRECT_URL`, `ENCRYPTION_SECRET` and
   `ENCRYPTION_SALT` in Vercel (Production).
3. Apply the baseline with `migrate:deploy` and confirm the drift check exits
   0. This must happen before the deploy: without the `Session` table, the
   session storage fails at startup and the process exits.
4. Remove the dead AWS and Aurora variables from Vercel.
5. Deploy (merge to `main`).
6. Smoke test: `GET /api/health` returns
   `200 {"status":"ok","database":"ready"}`.
   `GET /api/operator/readiness` with `Authorization: Bearer $CRON_SECRET`
   returns `200 {"status":"ready"}`. Then open the app in a development store and
   place a paid test order (`orders/paid` records a PENDING cashback entry).

## Driver notes

- **A failed query costs a reconnect.** node-postgres' pool discards a
  connection after any query error, so the next query opens a new connection
  (TCP, TLS, SCRAM). Expected errors such as the unique-constraint conflicts
  that cron locks and webhook idempotency rely on (P2002) therefore cost one
  reconnect each. In-region this is cheap. From a workstation far from London
  it can take seconds, enough to time out the 2-second health probe.
- **Raw SQL:** `@prisma/adapter-pg` cannot deserialize the Postgres `name`
  type. Cast catalog columns such as `current_user`, `tablename` and
  `relname` with `::text` in `$queryRaw`.
- **Unqualified table names** in raw SQL resolve through the role's
  `search_path`, which provisioning sets to `rewardspro` on Supabase and in
  `setup-database.sql`. New raw SQL should qualify tables with
  `databaseSchema` from `app/db.server.ts`, as the shop-data cleanup does.

## Health checks

- `GET /api/health` (public) runs `SELECT 1` with a 2-second timeout. It
  answers 200 `{"status":"ok","database":"ready"}`, or 503
  `{"status":"unavailable","database":"unavailable"}` with no detail. Each
  instance reuses one result for 5 seconds.
- `GET /api/operator/readiness` (Bearer `CRON_SECRET`) runs the same probe
  for operators: 200 `{"status":"ready"}`, 503 `{"status":"unavailable"}`, or
  401 without the exact credential.

## Local development and tests

Use any Postgres 17. Set it up like Supabase and apply the migrations as the
app role:

```sh
psql -U postgres -f test/integration/postgres/setup-database.sql   # role + schema
export DIRECT_URL='postgresql://rewardspro_app:rewardspro_app@127.0.0.1:5432/postgres?schema=rewardspro'
pnpm --filter rewardspro migrate:deploy
```

The integration suites (`test/integration/postgres`) cover encrypted session
storage, the baseline, `orders/paid` end to end with Shopify mocked, the
compliance webhooks and the cron locks:

```sh
REWARDSPRO_TEST_DATABASE_URL='postgresql://rewardspro_app:rewardspro_app@127.0.0.1:5432/postgres?schema=rewardspro&connection_limit=1' \
  pnpm --filter rewardspro test:postgres
```

They truncate every table, so `REWARDSPRO_TEST_DATABASE_URL` must be a
loopback database you can wipe. The suites skip under any other vitest
config, and they refuse a non-loopback URL. CI runs them against a
`postgres:17` service (`.github/workflows/ci.yml`, job `rewardspro`).
