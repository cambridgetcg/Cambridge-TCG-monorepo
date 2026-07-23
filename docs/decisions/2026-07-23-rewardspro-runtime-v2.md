# RewardsPro v2 runs on ECS/Fargate and RDS PostgreSQL

**Status:** accepted for a dark foundation; production traffic and data cutover
remain gated.

**Will trace:** Yu, 2026-07-23 — “need migrate the database to new infra, maybe
railway or fly? Or new aws. Lets do the backend from scratch and handle the
deployment workflow.”

## Context

The canonical application is `apps/rewardspro` in this monorepo. The standalone
`cambridgetcg/rewardspro` repository is a stale ancestor, not a deploy source.

The current runtime is not portable merely because its Prisma schema names
PostgreSQL:

- 107 models and 63 enums are reached through a bespoke Aurora Data API client
  or a custom Prisma Data API driver;
- Shopify session storage and several routes call the Data API directly;
- 23 Vercel schedules invoke 24 cron routes, while the checked-in SQS,
  EventBridge, DynamoDB, and Lambda paths are mostly not wired into runtime
  processing;
- migration history combines Prisma migrations, manual SQL, and bespoke
  runners whose claims conflict with the deployment guide;
- the public liveness endpoint is healthy, but the authenticated production
  dependency-readiness endpoint returned `503 unavailable` during this audit;
- Vercel has repeatedly redeployed RewardsPro for unrelated monorepo commits,
  without waiting for the app-specific CI job.

RewardsPro records points, cashback, store credit, subscriptions, and other
financially meaningful state. Its database needs managed backups, tested
recovery, a single canonical writer, and an auditable migration path.

## Decision

Build a commerce-independent backend alongside the current Shopify application:

```text
Shopify connector ─┐
future connectors ─┼─> API inbox ─> normalized commerce events ─> workers
headless clients ──┘       │                    │                    │
                           └──────── RDS PostgreSQL <────────────────┘
                                         │
                                  transactional outbox
                                         │
                                   SQS + dead letter
```

The target runtime is:

- AWS `eu-west-2` by default;
- ECS/Fargate services for the API and long-running worker;
- an ordinary RDS for PostgreSQL Multi-AZ instance, with encryption, forced
  TLS, deletion protection, automated backups, and point-in-time recovery;
- SQS with a dead-letter queue for asynchronous delivery;
- EventBridge Scheduler for explicit scheduled commands;
- Secrets Manager and task roles instead of long-lived AWS keys in the app;
- a public ALB terminating HTTPS, with the database in isolated subnets;
- GitHub Actions authenticating through OIDC and deploying immutable
  commit-SHA images only after tests and a one-off migration task succeed.

The v2 runtime uses direct PostgreSQL through `pg`. Prisma remains in the legacy
application during the transition; it is not the v2 runtime data layer.

## Why this target

Railway has the easiest application workflow, but its default PostgreSQL
offering is explicitly an unmanaged database container. Its HA template moves
database operations back onto this team. See Railway’s
[database](https://docs.railway.com/databases) and
[HA template](https://railway.com/deploy/postgres-ha-patroni) documentation.

Fly.io offers a real managed PostgreSQL product and is a credible lower-ops
alternative. Its current core documentation, however, still describes parts of
patching, alerting, and migration tooling as under development. RewardsPro
should not discover the exact durability contract during an incident. See
[Fly Managed Postgres](https://fly.io/docs/mpg/).

AWS has the largest operational surface, but it already supplies RewardsPro’s
queue, object-storage, email, and scheduler primitives. RDS has mature
[Multi-AZ failover](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
and [point-in-time recovery](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html).
The extra infrastructure work buys a better-understood failure model for the
ledger.

Aurora is not the default target. Ordinary RDS PostgreSQL is easier to inspect,
dump, restore, and operate. Aurora can be reconsidered only after measured load
or global-replication requirements justify it.

## Rollout

This is a strangler migration, not a big-bang rewrite.

1. **Dark foundation.** Ship liveness, authenticated readiness, migrations,
   connector-safe event contracts, an idempotent inbox, and the API/worker
   deployment path. It receives no production Shopify traffic.
2. **Source audit.** Restore authorized access to the old AWS account. Record
   engine/version, extensions, database size, live schema, migration ledger,
   largest tables, row counts, and write rate. Treat the live database and a
   logical dump as truth.
3. **Compatibility schema.** Restore the legacy schema into the target and add
   v2 tables through append-only migrations. Backfill workspaces, commerce
   connections, and external identities without renaming live columns.
4. **Shadow/replay.** Translate copied Shopify events into normalized events and
   compare resulting points/cashback/tier decisions with the legacy path. No v2
   financial writes are authoritative.
5. **CDC and cutover.** Use `pg_dump`/`pg_restore` plus a write pause for a small
   database, or AWS DMS full-load plus CDC for low downtime. Stop old schedulers
   and workers, reach zero lag, validate counts/checksums and critical ledger
   invariants, then switch exactly one writer.
6. **Rollback window.** Keep the old database read-only and retain a final
   immutable backup. Keep the old webhook receiver/forwarder available beyond
   Shopify’s retry window. A database rollback after new writes requires
   reverse replication or explicit reconciliation, not a DNS flip.

Every stage has an explicit go/no-go record. No deploy job changes the Shopify
application URL, webhook subscriptions, extensions, or DNS automatically.

## Deployment invariants

- Production deployment is disabled unless the repository variable
  `REWARDSPRO_V2_DEPLOY_ENABLED` is exactly `true`.
- The GitHub `rewardspro-v2-production` environment must require approval.
- GitHub Actions uses an AWS OIDC role, never access-key secrets.
- Migrations execute as a one-off task before either service is updated.
- SQL migration files execute whole inside a transaction; no hand-written
  semicolon splitter is permitted.
- A failed migration leaves the current services untouched.
- Services use ECS deployment circuit breakers and are checked for stability.
- Public liveness never inspects configuration or dependencies. Readiness is an
  exact-Bearer operator surface with a generic response.
- Secret values, database URLs, raw customer payloads, and AWS identifiers are
  never printed by CI diagnostics.

## Known blocker

The old Aurora database cannot yet be introspected or exported from this
machine. The AWS credentials currently configured for the deployed app are
rejected, and its authenticated readiness probe is unavailable. Building and
validating the dark target is safe; copying data or claiming migration
readiness is not.

Source-account access must be restored or a new least-privilege migration role
must be issued before the source-audit gate can pass.

## Consequences

- We accept more infrastructure and cost than Railway or Fly in exchange for a
  mature database recovery contract and native queue/scheduler integration.
- The current app stays live while v2 proves parity one vertical slice at a
  time.
- The first v2 release is intentionally not feature-complete. Its honest claim
  is “deployable event-ingestion foundation,” not “RewardsPro rewritten.”
- Two database access patterns coexist temporarily. That cost ends only after
  all authoritative paths leave the Data API and the legacy runtime is retired.
