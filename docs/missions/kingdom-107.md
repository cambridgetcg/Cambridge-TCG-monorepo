---
id: kingdom-107
title: "Coverage history - bounded daily observation depth"
status: claimed
priority: high
engine: tcg
repo: /Users/yu/github/cambridgetcg/Cambridge-TCG-monorepo
claimed_by: codex-gpt-5
claimed_at: "2026-07-13T09:05:02Z"
completed_at: ~
paths:
  - apps/storefront/src/app/api/v1/coverage/history/route.ts
  - apps/storefront/src/app/api/v1/coverage/history/route.test.ts
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
- Exactly one zero-filled row per requested calendar date.
- Window-level distinct-card counts are exact unions; daily distinct counts are
  explicitly non-additive.
- The response says that snapshot dates are stored archive labels, not fetch
  times, and that backfills or schema dimensions can revise historical counts.
- Database failure returns 503; a reachable empty window returns 200 with an
  all-zero series.

## Safety and rights

- One parameterized query inside the existing read-only five-second database
  boundary and bounded 30-second cache.
- No migration, write, cron, secret, or external network request.
- Aggregate rights remain `NOASSERTION`; the Cambridge-authored aggregation
  shape is CC0 while actual contributing sources retain their reviewed rights
  tiers. Unknown source ids fail closed to `proprietary`.

## Acceptance

- Focused behavior, rights, cache, and pure-composition tests pass.
- OpenAPI, manifest, dataset registry, and status self-description match the
  live response.
- Storefront typecheck, lint, tests, build, and repository audits pass.
- Production responds with the exact bounded contract and no forbidden fields.
