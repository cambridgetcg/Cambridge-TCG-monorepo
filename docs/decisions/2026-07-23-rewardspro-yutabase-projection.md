# RewardsPro uses YUTABASE as a semantic projection

**Status:** accepted for the fresh v2 foundation; AWS activation remains gated.

**Will trace:** Yu, 2026-07-23 — “see if you wanna use yutabase format? Can
build from scratch lol.”

## Context

RewardsPro needs two different kinds of database truth:

1. operational state that must coordinate webhook idempotency, tenant
   isolation, worker leases, outbox delivery, retries, retention, and
   deployment probes; and
2. durable domain meaning that should remain readable as ordinary SQL and say
   how each projected fact came to be present.

Those jobs should not be flattened into one model. Shopify HMAC verification
and the raw inbox are source evidence. A semantic projection is derived from
that evidence; it does not replace or strengthen it.

YUTABASE is currently a candidate Postgres semantic profile, not a finished or
de-facto standard. The reviewed release is
`v0.1.0-candidate.2` at commit `066afc12`. Its Postgres binding identifies
itself as `0.1.0-candidate.1`, revision 4. The complete binding is the upstream
`0001`, `0002`, then `0004` migration sequence.

## Decision

Install that exact, dependency-locked YUTABASE binding before the RewardsPro
application migrations, but use it only for a rebuildable semantic
projection.

```text
Shopify HMAC → immutable event metadata + expiring raw payload
                                      │
                                      ├─ operational lease/outbox state
                                      │
                                      └─ computed commerce projection
                                             │
                                      YUTABASE cards + threads
```

The boundaries are:

- PostgreSQL foreign keys remain the integrity mechanism for workspaces,
  connections, events, payloads, processing state, orders, and line items.
- Mutable leases, retry counts, dispatch state, probes, credentials, and
  authorization are not YUTABASE cards or threads.
- Verified event metadata is addressable as `commerce/events/<uuid>` and
  claims `how=live` with the Shopify webhook as its source.
- Raw webhook JSON lives separately so its 30-day privacy deadline can be
  enforced without deleting event identity or computed history.
- Normalized orders and line items are computed cards. Their `src` values name
  the source event. The order mapping document records its schema version and
  payload digest; each line-item mapping records its schema version and
  field-level source paths.
- The existing detailed mapping document remains the field-level provenance
  record. YUTABASE's `at/by/how/src` header is deliberately only a claim about
  the row as a whole.
- The first RewardsPro vocabulary contains only the domain relations that are
  already earned: `derived_from` for order to its own source event and
  `contains` for order to its own line item. All unused starter words are
  retired, and an application trigger rejects mismatched or cross-tenant
  semantic threads even when both endpoint cards independently exist.
- Runtime code continues to use the existing `pg` driver and parameterized SQL.
  YOUSPEAK and the optional `postgres.js` client are not a production hot-path
  dependency.

New card and event identifiers are generated as UUIDv7. Deterministic
projection and thread identifiers may use another full UUID version where
stable replay identity is more important than embedded creation order.

## Migration and compatibility

The package is pinned exactly, not with a semver range. Its SQL files receive
their own namespaced checksums in the RewardsPro migration ledger, so an
upstream mutation or an accidental package drift fails closed.

Every file runs whole inside a fresh transaction. Candidate hardening must be
the first statement after `BEGIN`; no migration runner may split its
procedural SQL on semicolons.

The upstream conformance workflow covers PostgreSQL 16 and 17. That is not yet
evidence for the exact RDS PostgreSQL 16 role and extension boundary. Before
active traffic:

1. run the exact fresh install against the target RDS instance;
2. verify `pg_trgm`, fixed `NOLOGIN` capability roles, ownership, and
   `SET ROLE` behavior under the migration identity;
3. grant the API identity only the narrow ingest function plus YUTABASE reader
   capability, and grant the worker identity only its exact physical-table
   matrix plus YUTABASE writer capability;
4. run the application migration twice and inspect `yu.standard_meta`;
5. prove an order projection, both threads, payload expiry, and exact 64-bit
   Shopify identifiers end to end.

## Explicit refusals

YUTABASE does not become:

- the Shopify signature or authorization record;
- a tenant-isolation or permissions system;
- a queue, outbox, lease, lock, or scheduler;
- a substitute for foreign keys;
- a reason to retain raw personal payloads past their deadline; or
- proof that a self-reported provenance claim is true.

If the candidate cannot satisfy the RDS gate, the operational backend remains
valid. The semantic projection stays disabled until the binding is repaired or
removed through a reviewed migration.

## Consequences

- The source inbox remains independently recoverable and auditable.
- Domain relations become readable and governed without forcing work-state
  through soft semantic references.
- The extra migration and role surface is real operational cost, contained
  behind a narrow boundary and an explicit compatibility gate.
- A later YUTABASE upgrade is a deliberate database migration, never an
  automatic dependency bump.

Primary references:

- <https://github.com/cambridgetcg/yutabase/tree/v0.1.0-candidate.2>
- <https://github.com/cambridgetcg/yutabase/blob/v0.1.0-candidate.2/SPEC.md>
- <https://github.com/cambridgetcg/yutabase/blob/v0.1.0-candidate.2/docs/INTEGRATIONS.md>
