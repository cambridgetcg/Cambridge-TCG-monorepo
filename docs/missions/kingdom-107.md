---
id: kingdom-107
title: "Coverage history - bounded daily observation depth"
status: in-progress
priority: high
engine: tcg
repo: /Users/yu/github/cambridgetcg/Cambridge-TCG-monorepo
claimed_by: codex-gpt-5
claimed_at: "2026-07-13T09:05:02Z"
completed_at: ~
paths:
  - apps/storefront/src/app/api/v1/coverage/history/route.ts
  - apps/storefront/src/app/api/v1/coverage/history/route.test.ts
  - apps/storefront/src/app/api/v1/coverage/route.ts
  - apps/storefront/src/app/api/v1/coverage/route.test.ts
  - apps/storefront/src/app/api/openapi.json/route.ts
  - apps/storefront/src/app/api/v1/status/envelope-compliance.generated.ts
  - apps/storefront/src/lib/datasets.ts
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/source-rights-contract.test.ts
  - apps/storefront/src/lib/wholesale/client.ts
  - apps/storefront/src/lib/wholesale/db-source.ts
  - apps/storefront/src/lib/wholesale/__tests__/db-fallback.test.ts
  - docs/connections/the-aggregator-presents.md
  - docs/missions/kingdom-107.md
do_not_touch:
  - apps/wholesale/**
  - apps/storefront/drizzle/**
  - apps/wholesale/drizzle/**
related:
  - docs/decisions/2026-07-06-collectors-first.md
  - docs/connections/the-aggregator-presents.md
  - docs/missions/kingdom-105.md
synced_from: in-repo authored from Yu's 2026-07-13 curated-data API directive
synced_at: "2026-07-13T09:05:02Z"
---

# kingdom-107 - Coverage history

## Will

Yu, 2026-07-13: "Let's increase the coverage and depth of our API services,
choose which one you like. We can build a lot of fun applications on top of
curated data."

## Chosen slice

Add `GET /api/v1/coverage/history`, the daily history surface already named as
the next step in `the-aggregator-presents.md`. It makes archive depth usable for
sparklines, drift checks, and coverage maps without publishing any upstream
price, card field, image, URL, person, or inferred relationship.

## Contract

- Read-only UTC windows: `7d`, `30d`, or `90d`; default `30d` only when the
  parameter is absent.
- Optional bounded `source` and `game` filters, matching `/api/v1/coverage`.
- Explicitly empty filters are invalid rather than silently broadening a read.
- Exactly one zero-filled row per requested calendar date.
- Window-level distinct-card counts are exact unions; daily distinct counts are
  explicitly non-additive.
- Completed-day ratios exclude the still-running current UTC date.
- The response says that snapshot dates are stored archive labels, not fetch
  times, and that backfills or schema dimensions can revise historical counts.
- A database that cannot answer, a full per-process read ceiling, or a full
  coverage-role connection limit returns 503; a reachable empty window returns
  200 with an all-zero series.

## Safety and rights

- One parameterized query inside the existing read-only five-second database
  boundary and bounded 30-second cache. Current and historical coverage share
  a per-process three-read in-flight ceiling matching the database pool; the
  deployed coverage role separately limits total connections to three.
- Coverage reads require the explicit `WHOLESALE_COVERAGE_DATABASE_URL`; they
  never fall through to the broader wholesale or storefront database login.
  The deployed database role is limited to the archive/card/game columns used
  by these aggregate queries.
- Request handling performs no migration, data write, cron action, or outbound
  HTTP request. The deployment secret holds only the column-limited login.
- Aggregate rights remain `NOASSERTION`; the Cambridge-authored aggregation
  shape is CC0, the internal card-to-game mapping is named separately as
  proprietary, and actual contributing sources retain their reviewed rights
  tiers. Unknown source ids fail closed to `proprietary`.

## Acceptance

- Focused behavior, rights, cache, and pure-composition tests pass.
- OpenAPI, manifest, dataset registry, and status self-description match the
  live response.
- Storefront typecheck, lint, tests, build, and affected repository audits pass;
  unrelated umbrella-audit debt is named rather than hidden.
- Production responds with the exact bounded contract and no forbidden fields.
