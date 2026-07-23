# RewardsPro v2 runs on ECS/Fargate and RDS PostgreSQL

**Status:** accepted for a fresh dark foundation; production traffic remains
gated.

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

On 2026-07-23 Yu explicitly chose a fresh start because the old database is no
longer available. A read-only account audit found no RDS or Aurora source to
copy. It also found a separate, still-active legacy serverless footprint in
`eu-north-1`; that footprint is not a database source and is not authorized for
deletion by this decision.

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

The verified inbox remains operational authority. A pinned YUTABASE candidate
binding adds a rebuildable semantic projection for selected commerce events,
orders, line items, and their governed relations. It does not own tenant
isolation, leases, queues, retention, or authorization. The detailed boundary
is recorded in
[`2026-07-23-rewardspro-yutabase-projection.md`](./2026-07-23-rewardspro-yutabase-projection.md).

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

This is a clean bootstrap followed by a connector cutover. There is no source
database migration or legacy data-parity claim.

1. **Dark foundation.** Ship liveness, authenticated readiness, checksummed
   application and YUTABASE migrations, connector-safe event contracts, an
   idempotent inbox, enforced raw-payload retention, and the API/worker
   deployment path. It receives no production Shopify traffic.
2. **RDS conformance.** Run the exact migrations on the target RDS PostgreSQL
   16 instance, twice. Verify role separation, the pinned YUTABASE identity,
   projection threads, retention, restore posture, and exact numeric IDs.
3. **Fresh configuration.** Create only new workspaces, commerce connections,
   secrets, schedules, and operator access. Do not invent or silently
   reconstruct old balances, customers, subscriptions, or ledger state.
4. **Shadow input.** Forward or replay newly received Shopify events into v2
   and compare normalized contracts with the current application. No v2
   financial write is authoritative.
5. **Connector cutover.** Pause the current webhook/scheduler writers, confirm
   v2 readiness and queue drain, then switch one connector at a time. Exactly
   one system may author each financial domain.
6. **Rollback window.** Keep the prior receiver available beyond Shopify's
   retry window. A rollback after new v2 financial writes requires explicit
   reconciliation; it is not a DNS-only operation.

Every stage has an explicit go/no-go record. No deploy job changes the Shopify
application URL, webhook subscriptions, extensions, legacy `eu-north-1`
resources, or DNS automatically.

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

## Known activation blockers

- The current local AWS session resolves to the account root principal.
  Terraform must run through the existing IAM Identity Center administrator
  assignment or another scoped role, never as root.
- `eu-west-2` has no ACM certificate. Production needs a chosen hostname,
  regional certificate, and DNS validation.
- A dedicated versioned and encrypted Terraform state bucket and protected
  lock table must exist before the application stack is initialized.
- The GitHub `rewardspro-v2-production` environment exists with a reviewer and
  a `main`-only deployment policy, but production activation still requires a
  distinct eligible reviewer, prevention of self-review and administrator
  bypass, and a required `main` validation check.
- The pinned YUTABASE binding has PostgreSQL 16/17 conformance evidence but not
  yet an RDS conformance run.
- The still-running legacy serverless stack requires a separate retirement
  decision. Its existence neither blocks the dark v2 stack nor authorizes
  deleting it.

## Consequences

- We accept more infrastructure and cost than Railway or Fly in exchange for a
  mature database recovery contract and native queue/scheduler integration.
- The current app stays live while v2 proves one newly configured vertical
  slice at a time; historical data parity is explicitly out of scope.
- The first v2 release is intentionally not feature-complete. Its honest claim
  is “deployable event-ingestion foundation,” not “RewardsPro rewritten.”
- Operational tables and a semantic projection coexist deliberately in the
  same RDS PostgreSQL database and `pg` runtime, but API and worker use separate
  least-privilege roles and connections. YOUSPEAK is not a second production
  data-access path.
