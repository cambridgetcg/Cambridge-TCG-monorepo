---
id: kingdom-112
title: "Product-flow PostgreSQL conformance - real locks, conflicts, rollback, and append-only enforcement"
status: claimed
priority: critical
engine: tcg
repo: /Users/you/Desktop/ctcg-product-flow-postgres-conformance
claimed_by: codex-gpt-5
claimed_at: "2026-09-02T21:36:31Z"
completed_at: ~
paths:
  - .github/workflows/ci.yml
  - apps/storefront/src/lib/product-flow-runtime/postgres.integration.test.ts
  - docs/connections/the-prism-beta-spine.md
  - docs/connections/README.md
  - docs/connections/the-pillow-book.md
  - docs/state.md
  - docs/missions/kingdom-112.md
do_not_touch:
  - apps/storefront/src/app/api/webhooks/**
  - apps/storefront/src/lib/payments/**
  - apps/storefront/drizzle/**
  - packages/product-flow/**
  - packages/product-flow-runtime/**
  - /Users/you/Desktop/prism-app/**
related:
  - docs/missions/kingdom-110.md
  - docs/missions/kingdom-111.md
  - docs/connections/the-prism-beta-spine.md
synced_from: in-repo authored from Yu's 2026-09-02 natural-next-moves directive and kingdom-111 release review
synced_at: "2026-09-02T21:36:31Z"
---

# kingdom-112 - Product-flow PostgreSQL conformance

## Will

Yu, 2026-09-02:

> “merge and deploy, then go for all natural next moves”

Kingdom-111's independent release review found no code blocker while naming
one mandatory gate before any Stripe or Telegram Stars callback is activated:
exercise the durable adapter against real, concurrent PostgreSQL connections
instead of treating the serialized in-memory fake as proof of database
behaviour.

## Chosen slice

- Add a PostgreSQL 16 service to the existing storefront CI job.
- Run the exact deployed `0135_product_flow_runtime.sql` schema in a bounded,
  disposable local CI database.
- Exercise the reusable runtime store conformance suite through the real
  storefront PostgreSQL adapter.
- Prove that two distinct backend connections serialize a same-entitlement
  retry exactly once, that a cross-entitlement payment collision rolls back
  its provisional snapshot, and that both append-only triggers reject event
  mutation.

## Safety

- The integration suite must refuse non-local or non-test database URLs before
  creating, truncating, or mutating anything.
- CI credentials are disposable literals scoped to the PostgreSQL service.
- No production database, provider credential, callback route, payment rail,
  source-rights decision, or product offer changes in this mission.
- The existing fast fake-adapter tests remain; this adds a distinct substrate
  gate rather than replacing unit coverage.

## Acceptance

- Local `pnpm test` skips the integration suite unless its explicit database
  URL is present and still reports that skip visibly.
- CI always starts PostgreSQL 16, applies the exact migration after a minimal
  `users` prerequisite, and runs the integration suite.
- The test records two different `pg_backend_pid()` values during a forced
  concurrent retry and observes one applied plus one duplicate result.
- Cross-entitlement grant reuse leaves one event and no foreign snapshot.
- UPDATE and DELETE of an accepted event both fail with the append-only
  trigger message while the committed row remains.
- Focused tests, storefront typecheck, workflow review, and `pnpm verify` pass.

