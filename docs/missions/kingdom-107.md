---
id: kingdom-107
title: "Coverage history - bounded daily observation depth"
status: done
priority: high
engine: tcg
repo: /Users/yu/github/cambridgetcg/Cambridge-TCG-monorepo
claimed_by: codex-gpt-5
claimed_at: "2026-07-13T09:05:02Z"
completed_at: "2026-07-13T10:30:27.432Z"
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
  - docs/connections/the-pillow-book.md
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

## Completion evidence

- Shipped in [PR #32](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/pull/32),
  production merge `918c75a2e03e2e9193bcc6ad8cd6076b270a0c01` on 2026-07-13.
- All 14 final GitHub checks passed. The pre-merge storefront run reported 647
  tests passed and 4 skipped; the reconciled data-ingest suite passed 248 tests,
  root typecheck passed, and the production build passed.
- Vercel deployment `dpl_5i2Uxv6zk54DeWabEBSRpSUcBZAy` was Ready and served
  by `cambridgetcg.com`. The `7d`, `30d`, and `90d` production probes returned
  exactly 7, 30, and 90 consecutive UTC rows. The 90-day window reported
  156,029 observations and an exact union of 18,167 cards.
- Default-window, filtered, zero-result, invalid-input, current-day marker,
  completed-day ratio, rights, discovery, cache-header, and forbidden-field
  probes matched the documented contract. `/api/v1/coverage` remained 200.
- Production used the dedicated column-limited coverage role through
  `WHOLESALE_COVERAGE_DATABASE_URL`; read-only, five-second timeout, and
  three-connection limits were verified. Preview concurrency returned only the
  documented 200/503 outcomes and recovered to 200; production probes were
  deliberately sequential.
- `pnpm audit:deploy-verify` passed 181 resources with 0 failures. The current
  coverage probe took 4.18 seconds, within its five-second database timeout;
  coverage production logs contained no warning, error, or fatal entry.
- The branch-only Preview credential, all three coverage Previews, and an
  accidental empty Vercel project created during log inspection were removed
  and verified absent before merge.
- Known unrelated residuals remain explicit: the umbrella audit stops on the
  pre-existing stale `docs/state.md`; production maintenance logs still report
  a fairness outcome mismatch and a PostgreSQL `COALESCE` integer/text error.
