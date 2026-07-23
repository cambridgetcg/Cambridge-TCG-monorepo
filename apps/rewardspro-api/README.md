# RewardsPro API v2 foundation

This package is a new backend foundation. It does **not** claim feature, data,
or business-rule parity with the legacy RewardsPro application.

It provides:

- a Fastify API with unauthenticated liveness and operator-authenticated
  readiness probes;
- a raw-body Shopify webhook receiver with HMAC verification and a durable,
  idempotent PostgreSQL commerce-event inbox;
- a worker that turns supported inbox records into a versioned
  `order.paid` document with explicit source provenance;
- optional SQS delivery backed by database outbox state. PostgreSQL remains
  authoritative, and duplicate SQS delivery is safe;
- a checksum-verified, advisory-locked SQL migration runner.

No financial ledger is created or mutated by this foundation.
The inbox gives PostgreSQL the verified raw JSON text directly, and processing
reads `jsonb` back as text before decoding it, so Shopify's 64-bit numeric IDs
are preserved as exact decimal strings instead of rounded JavaScript numbers.
Raw webhook payloads carry an explicit 30-day retention deadline in the inbox
schema. A production retention sweeper is still required to enforce deletion
at that deadline.

## Local PostgreSQL

From this directory:

```sh
export REWARDSPRO_LOCAL_DB_PASSWORD='<choose-a-local-only-password>'
docker compose up -d postgres
export DATABASE_URL="postgresql://postgres:${REWARDSPRO_LOCAL_DB_PASSWORD}@127.0.0.1:5433/rewardspro"
export SHOPIFY_API_SECRET=local-only-placeholder
export OPERATOR_TOKEN=local-only-placeholder
pnpm build
pnpm db:migrate
pnpm start
```

Run the worker separately with `pnpm start:worker`. Without `SQS_QUEUE_URL`,
the worker safely claims inbox records directly from PostgreSQL.

The API defaults to port 3000. `GET /health/live` is public.
`GET /health/ready` requires an exact
`Authorization: Bearer <OPERATOR_TOKEN>` header and checks PostgreSQL.

Before accepting webhooks, provision an `rp_workspace` and an active
`rp_commerce_connection` whose `provider` is `shopify` and whose
`external_account_id` is the canonical `*.myshopify.com` shop domain.

## AWS secrets

Production accepts `DB_SECRET_ARN`, `SHOPIFY_API_SECRET_ARN`, and
`OPERATOR_TOKEN_SECRET_ARN`. ARN mode requires `AWS_REGION`.
The worker loads only its database secret (and SQS configuration); it does not
read the Shopify signing secret or operator readiness token. The migration
entrypoint loads only database configuration.

`DB_SECRET_ARN` accepts a raw PostgreSQL URL, a JSON URL field, or standard
RDS JSON fields (`host`, `port`, `username`, `password`, and
`dbname`/`database`). AWS-managed RDS master secrets contain only credentials;
the migration task must pair those with non-secret `DB_HOST`, `DB_PORT`, and
`DB_NAME` environment values. API and worker deployments should use a
least-privilege application database secret. The RDS master secret is only
appropriate for the separately controlled migration task.

In `NODE_ENV=production`, every non-loopback `DATABASE_URL` (including a raw
URL read from Secrets Manager) uses `sslmode=verify-full`; weaker explicit
modes are rejected. RDS connections also require `DB_SSL_ROOT_CERT` or an
explicit `sslrootcert` URL parameter. The production image packages the
reviewed Europe (London) RDS root bundle at
`/app/certs/eu-west-2-bundle.pem`, and Terraform supplies that path to API,
worker, and migration tasks. Loopback URLs remain usable for local containers.

## Migration and runtime database roles

Run `node dist/migrate.js` with a separately controlled migration role that
owns, or can create and alter, the `rp_*` objects. Do not give those DDL
credentials to the API or worker. After migrations, an application role used
by both runtime processes needs the following table-level grants (substitute
the actual role name and grant database `CONNECT` separately):

```sql
GRANT USAGE ON SCHEMA public TO rewardspro_app;
GRANT SELECT ON TABLE rp_commerce_connection TO rewardspro_app;
GRANT SELECT, INSERT, UPDATE ON TABLE rp_commerce_event TO rewardspro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rp_worker_probe TO rewardspro_app;
```

Migration files have their own `MIGRATION_QUERY_TIMEOUT_MS` budget, defaulting
to 540,000 ms (nine minutes). Runtime queries retain the much smaller
`DB_QUERY_TIMEOUT_MS` default. Keep the migration budget below the deployment
workflow's ECS waiter horizon; use staged/online data moves rather than one
unbounded migration file.

The authenticated API readiness endpoint and worker startup check inspect
PostgreSQL catalogs without changing data. They require the expected columns
and the exact runtime DML grants above, so a merely connectable but unmigrated
or under-granted database is not reported ready.

## SQS worker delivery and deployment probe

With SQS enabled, PostgreSQL outbox state remains authoritative. The worker
does not delete malformed, unsupported, actively leased, or otherwise
non-terminal messages; SQS visibility retry and the queue redrive policy must
route repeated failures to a DLQ. Each loop also recovers expired processing
leases and old `queued` inbox rows whose original SQS delivery was lost.
Infrastructure failures terminate the process after
`WORKER_MAX_CONSECUTIVE_ERRORS` (default `5`) so the service supervisor can
restart it.

After the worker service is stable, run this one-off deployment gate:

```sh
node dist/worker-probe.js
```

It requires `SQS_QUEUE_URL`, `AWS_REGION`, the worker database configuration,
`WORKER_PROBE_TIMEOUT_MS` (default 60 seconds), SQS `GetQueueAttributes` and
`SendMessage`, and the runtime database grants above. The live worker requires
SQS `GetQueueAttributes`, `ReceiveMessage`, and `DeleteMessage`. The command
succeeds only after the live worker validates the DB probe, successfully
deletes its strict probe message from SQS, and then records the acknowledgement
in PostgreSQL. The acknowledged row remains until expiry so delayed
at-least-once duplicates can also be deleted and acknowledged safely; a later
probe cleans up expired rows. A post-send timeout likewise leaves one expiring
row for safe delayed delivery.

This is a deployment-only fleet probe, not a recurring container health check:
each invocation writes an expiring DB row and sends an SQS message.

Build the image from the monorepo root:

```sh
docker build -f apps/rewardspro-api/Dockerfile .
```

The compiled process contracts are:

- API: `node dist/main.js`
- worker: `node dist/worker.js`
- migrations: `node dist/migrate.js`
- one-off worker deployment probe: `node dist/worker-probe.js`
