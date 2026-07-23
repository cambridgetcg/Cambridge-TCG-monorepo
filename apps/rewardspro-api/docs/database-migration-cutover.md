# RewardsPro database migration and cutover runbook

## Current status: blocked before source audit

As observed on 2026-07-23:

- the available source AWS credentials are rejected;
- the legacy app's authenticated dependency-readiness surface returns a
  generic `503 unavailable`;
- this machine cannot introspect or export the source Aurora database.

Those facts permit building and testing an empty dark target. They do **not**
permit a data copy, a parity claim, or a production cutover. A Prisma schema,
checked-in SQL, an old Terraform state, or a successful public liveness probe
is not evidence of the live database's current structure or contents.

Resume this runbook only after the source owner restores authorized,
least-privilege inspection/export access or creates a dedicated migration
role. Record who authorized the access and its expiry without recording
credentials.

Data API access alone is not a `pg_dump` or CDC path. If the source has no
reachable PostgreSQL endpoint, create a private migration network path or
restore an authorized snapshot into an isolated temporary cluster for
inspection/rehearsal. Do not make the database publicly reachable to simplify
the migration.

## Non-negotiable invariants

1. The live source and a fresh logical export are the schema/data truth.
2. There is exactly one authoritative writer at every instant. Do not
   dual-write financial state.
3. The migration task may use the RDS-admin secret. API and worker may not.
4. Production movement uses TLS and credentials outside commands, logs, dump
   files, and the repository.
5. No table is omitted because it is absent from the expected Prisma schema.
6. Counts, chunked checksums, sequence state, and domain invariants must agree
   before authority moves.
7. Shopify keeps one stable webhook hostname through the database cutover.
   DNS, Shopify configuration, and extension deployment are separate changes.
8. The old database stays recoverable and read-only for an explicit rollback
   window, backed by a final immutable snapshot.
9. Once v2 has accepted authoritative writes, returning to the old database
   requires reverse replication or explicit reconciliation. It is not a DNS
   rollback.

## Evidence record and stop authority

Create an access-controlled migration record outside the repository. If local
working artifacts are needed on a Sol Home machine, start in a named
`sol-scratch` directory and move final encrypted evidence to the approved
record store.

The record must identify:

- source and target environment labels;
- source engine, exact version, topology, and Serverless generation if any;
- schema-export and data-copy timestamps;
- migration mechanism and tool versions;
- every table's load/validation state;
- final counts, checksum manifests, sequence values, and invariant results;
- write-pause start/end, CDC lag evidence, and in-flight job counts;
- source snapshot identifier and read-only enforcement evidence;
- application commit/task revisions;
- go/no-go and rollback decision owners.

Any operator may call no-go when evidence is missing, source load is unsafe,
the target diverges, a webhook cannot be durably accepted, or the rollback
route is not credible. Do not solve a missed gate by lowering validation.

## Gate 1: live source introspection

Use a read-only role first. Keep connection material in a PostgreSQL service
file or an approved secret broker; do not place a password or URL on a command
line. Run load-bearing queries in a reviewed window.

Capture at minimum:

- `server_version`, Aurora/PostgreSQL topology, parameter-group state, storage
  size, backup/PITR settings, and maintenance window;
- extensions and their versions;
- all non-system schemas, tables, views, materialized views, sequences,
  functions, triggers, constraints, indexes, partitioning, row-level security,
  owners, and grants;
- migration-ledger tables and applied records from every discovered migration
  system;
- table sizes and `pg_stat_user_tables` row estimates before considering exact
  counts;
- primary/unique keys and replica identity for every table;
- large objects, generated/identity columns, enum types, collations, and
  nonportable types;
- active application roles and their grants;
- scheduler, worker, webhook, queue, Data API, and manual processes that can
  write;
- transaction/write rate measured over a representative interval;
- long transactions and locks, without exporting query text or customer data;
- the largest and fastest-changing tables.

Useful read-only starting points are:

```sql
SHOW server_version;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT nspname FROM pg_namespace
WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
ORDER BY nspname;
SELECT schemaname, relname, n_live_tup, n_dead_tup,
       pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables
ORDER BY total_bytes DESC;
SELECT schemaname, sequencename, last_value
FROM pg_sequences
ORDER BY schemaname, sequencename;
```

Do not paste assumed table names into production. First discover the live
names, then write and review schema-specific validation queries.

Take a schema-only export using a `pg_dump` version compatible with the source.
`pg_dump` produces a transactionally consistent snapshot without blocking
ordinary readers or writers, but later writes are not in that snapshot; the
final copy still needs either a write pause or CDC. See the PostgreSQL
[`pg_dump`][pg-dump] and [`pg_restore`][pg-restore] documentation.

No-go when:

- engine/version/topology is still inferred rather than observed;
- the source cannot produce a fresh export;
- any writer or scheduler is unaccounted for;
- a table has no chosen copy and validation treatment;
- source load cannot safely tolerate the selected method.

## Gate 2: choose and rehearse one copy method

Choose from measured database size, write rate, acceptable pause, source
topology, and extension/type compatibility. Rehearse the exact route into a
disposable target restored from a fresh source snapshot. Time every phase and
retain the validation evidence.

### Path A: `pg_dump` / `pg_restore` with a write pause

Use this when the measured final pause, including export, transfer, restore,
validation, and routing, fits the approved maintenance window.

1. Provision an empty target at a compatible PostgreSQL major version.
2. Install reviewed extensions and global prerequisites explicitly. Do not
   assume a database-only dump carries roles or platform-managed settings.
3. Export in custom or directory format with ownership and ACL handling
   chosen explicitly. Keep archives encrypted and access-controlled.
4. Inspect the archive table of contents before restore.
5. Restore into the rehearsal target. A parallel directory restore is faster
   but is not one transaction; a single-transaction restore is easier to
   discard atomically but cannot use parallel jobs. Choose and document the
   trade-off.
6. Run `ANALYZE`, validation, application read-only probes, and a restore-time
   measurement.
7. Destroy or quarantine the rehearsal copy according to the data-handling
   policy.
8. At final cutover, stop all source writers first, wait for in-flight work to
   drain, take a final consistent dump, restore it, and validate before moving
   authority.

Never pipe a production archive through an unobserved multi-stage command that
can hide a partial failure. Check every command status and archive checksum.

### Path B: AWS DMS full load plus CDC

Use this when the measured write-pause budget is shorter than dump/restore and
the observed source topology supports logical change capture.

1. Confirm the exact Aurora generation and PostgreSQL version. AWS documents
   Aurora Serverless v1 as full-load-only and Serverless v2 as supporting
   full-load plus CDC; do not infer which source is running.
2. Run AWS DMS PostgreSQL premigration assessments.
3. Configure logical replication and the migration role using the least
   privilege AWS supports for the observed managed engine. Parameter changes
   and restarts require a separate reviewed change.
4. Confirm primary keys or a reviewed replica identity strategy for every
   updated/deleted table. Use `REPLICA IDENTITY FULL` only when justified; it
   increases WAL.
5. Alarm on retained WAL/replication-slot disk growth before starting CDC.
6. Create source and target endpoints with certificate validation and
   encryption. DMS endpoint secrets stay in the approved AWS secret service.
7. Create the target schema separately from the live schema export. DMS data
   movement is not the schema migration authority.
8. Configure table mappings from the complete live inventory, not expected
   models. Review LOB, enum, timestamp, numeric, identity, partition, and
   unsupported-type treatment.
9. Start full load plus CDC with DMS data validation enabled when source load
   permits it. Validation consumes source, target, and network capacity.
10. Monitor per-table load/validation state, task errors, source/target CDC
    latency, source WAL retention, and target constraint/index work.
11. Rehearse the final write stop and prove CDC reaches zero lag before the
    cutover window.
12. Remove replication slots and DMS resources only after acceptance and the
    rollback decision. Removing them early destroys evidence and may close a
    needed recovery path.

See AWS's [PostgreSQL source][dms-postgres] and
[DMS data-validation][dms-validation] documentation.

No-go when DMS reports a table error, unvalidated row, unsupported conversion,
unbounded CDC lag, unsafe WAL growth, or an unexplained count/checksum
difference.

## Gate 3: validation protocol

Run validation during rehearsals and again after the final write pause. A
dashboard saying “load complete” is not enough.

### Structural validation

- Normalize and diff source/target schema-only exports.
- Account for every deliberate difference in a reviewed mapping.
- Compare extensions, enum labels/order, columns/defaults/nullability,
  identity/generation, constraints, indexes, triggers, functions, views,
  partitions, RLS, owners, and grants.
- Confirm the v2 migration ledger contains each expected checksum exactly
  once.
- Confirm application runtime roles cannot create/alter schema or read the
  RDS-admin secret.

### Data validation

- Capture exact `COUNT(*)` per table only in the controlled final window or
  from an approved consistent snapshot. Estimate first to avoid surprising
  source load.
- Compare null counts and min/max stable keys for each table.
- Stream rows in stable primary-key order with explicit canonical encodings
  and hash bounded key ranges. Compare the per-range manifests. Do not build
  one in-memory aggregate over an unbounded table.
- Handle timestamps, decimals, JSON key order, arrays, bytea, and collations
  explicitly so a serialization difference is not mistaken for data loss.
- For a table without a stable key, define a reviewed alternate comparison or
  make the migration no-go. Never silently skip it.
- Compare each sequence/identity next value against the maximum imported key
  and advance it safely where required.
- Run DMS row validation in addition to, not instead of, independent counts
  and critical-domain checks.

### Rewards-domain invariants

Derive queries from the live schema and have the domain owner approve them.
At minimum cover:

- points/ledger entries reconcile to displayed or cached balances;
- cashback and store-credit liabilities reconcile;
- no event or webhook idempotency key appears more than once;
- processed/failed/in-flight event states reconcile with queue/outbox state;
- workspace/shop/external identities preserve uniqueness and ownership;
- subscription and tier state references existing customers/workspaces;
- monetary scale, currency, sign, and rounding are unchanged;
- foreign keys have no orphans, including relationships that were not
  declared in Prisma;
- pending scheduled work has one owner and will not execute twice.

Store aggregate evidence and digests, not raw customer payloads.

## Gate 4: stable webhook front door

Create and prove a stable webhook hostname before the cutover. Shopify should
continue sending to that hostname while routing behind it changes.

The front door must:

- preserve the raw request body for HMAC verification;
- preserve required Shopify headers;
- durably accept or reject before acknowledging;
- retain the external webhook/event identifier for idempotency;
- support replay without creating a second financial effect;
- route to exactly one authoritative processing path;
- expose queue depth, age, failures, and replay state to operators without
  logging payloads or secrets.

During a planned write pause, the stable receiver may durably spool verified
events while processors are stopped. It must not acknowledge an event that
exists only in memory.

Do not change Shopify app configuration, callback URLs, webhook subscriptions,
or extensions in the database cutover. Do not use a DNS flip as the database
rollback mechanism.

## Gate 5: cutover

The v2 foundation currently lacks legacy feature and rule parity. This gate
remains no-go until shadow/replay evidence proves the specific production
slice being moved.

Before the window:

- approve the exact source/target, application commit, task revisions,
  migration method, table map, pause budget, rollback window, and decision
  owners;
- freeze schema and application changes;
- confirm backups/PITR and take the required pre-cutover snapshot;
- confirm target readiness, capacity, monitoring, alerting, and on-call access;
- confirm the stable webhook front door can spool and replay;
- rehearse stopping every old scheduler, worker, cron, Lambda, queue consumer,
  operator tool, and web writer;
- define the first irreversible v2 authoritative write and the stop condition
  before it.

Execution order:

1. Announce maintenance and start the evidence timeline.
2. Put the stable webhook front door into durable-spool mode.
3. Stop legacy schedulers, workers, queue consumers, and manual jobs.
4. Stop or block legacy web writes and wait for in-flight transactions/jobs to
   drain.
5. Record the final source transaction/write position.
6. Complete the final dump/restore or wait for CDC source and target latency to
   reach zero.
7. Run the full structural, count, checksum, sequence, and domain-invariant
   protocol.
8. Take the final immutable source snapshot.
9. Revoke legacy write access and enforce/monitor source read-only operation.
   Rotating credentials alone is insufficient if another writer still has a
   valid role.
10. Change one controlled routing/configuration seam so v2 is the sole writer.
11. Start the v2 API/worker for the approved slice. Keep unrelated legacy
    slices stopped or explicitly routed; never let both mutate the same state.
12. Require public liveness and authenticated readiness, then perform a
    nonfinancial synthetic event followed by the approved production canary.
13. Replay the durable webhook spool once, through the idempotent inbox.
14. Monitor correctness, queue age, errors, latency, connection saturation,
    locks, and business invariants through the decision window.
15. Sign the go/no-go record. Do not broaden the moved slice inside the same
    window.

## Rollback window

Keep for the explicitly approved retention period:

- the old database online but read-only and isolated from all writers;
- its final immutable snapshot and PITR window;
- the final dump/checksum manifests;
- old runtime images/task definitions and configuration records;
- DMS task/position/validation evidence when CDC was used;
- the stable webhook spool and replay ledger;
- the mapping of writes accepted after cutover.

Before any authoritative v2 write, rollback may stop v2, verify the old source
still matches the final position, restore exactly one old writer, and replay
the webhook spool once.

After any authoritative v2 write, do **not** point the old runtime at its
read-only database and call that rollback. Choose one:

- recover forward on v2;
- reverse-replicate a proven compatible change set; or
- stop writes, explicitly reconcile every post-cutover mutation back to a
  newly validated old target, then transfer authority once.

That decision needs new counts, checksums, domain invariants, and approval.
Never improvise dual writes to make rollback appear easier.

## Completion criteria

Migration/cutover is complete only when:

- every gate has retained evidence and explicit approval;
- Shopify still uses the stable webhook hostname;
- one database/runtime is the sole writer;
- all spooled events are accounted for exactly once;
- target counts/checksums/sequences/invariants pass;
- old writers are disabled and the old database is demonstrably read-only;
- backups and a restore test meet the recovery objective;
- the rollback window closes by explicit decision, not neglect;
- source credentials, DMS slots/tasks, temporary dumps, and scratch copies are
  retired according to policy;
- no document claims full RewardsPro parity beyond the slice actually proven.

[dms-postgres]: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Source.PostgreSQL.html
[dms-validation]: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Validating.html
[pg-dump]: https://www.postgresql.org/docs/current/app-pgdump.html
[pg-restore]: https://www.postgresql.org/docs/current/app-pgrestore.html
