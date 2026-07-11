---
id: kingdom-105
title: "Coverage ground route - make collected-data depth live after wholesale retirement"
status: claimed
priority: high
engine: tcg
repo: /Users/yu/github/cambridgetcg/Cambridge-TCG-monorepo
claimed_by: codex-gpt-5
claimed_at: "2026-07-11T18:09:31Z"
completed_at: ~
paths:
  - apps/storefront/src/app/api/v1/coverage/route.ts
  - apps/storefront/src/app/api/v1/coverage/route.test.ts
  - apps/storefront/src/app/prices/coverage/page.tsx
  - apps/storefront/src/app/prices/[game]/page.tsx
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/wholesale/db-source.ts
  - apps/storefront/src/lib/wholesale/client.ts
  - apps/storefront/src/lib/wholesale/__tests__/db-fallback.test.ts
  - docs/connections/the-aggregator-presents.md
  - docs/missions/kingdom-105.md
do_not_touch:
  - apps/wholesale/**
  - apps/storefront/drizzle/**
  - apps/wholesale/drizzle/**
related:
  - docs/decisions/2026-07-06-collectors-first.md
  - docs/connections/the-aggregator-presents.md
  - docs/connections/two-letters-and-a-falcon.md
  - apps/storefront/src/app/api/v1/coverage/route.ts
synced_from: in-repo authored from Yu's 2026-07-11 community-data directive
synced_at: "2026-07-11T18:09:31Z"
---

# kingdom-105 - Coverage ground route

## Will

Yu, 2026-07-11: "DEEP DIVE CAMBRIDGETCG! Wanna increase coverage of data. Lets
see what is valuable and we can do for collectors and different players of the
community. Network!"

## Found gap

`GET /api/v1/coverage` is the public map of what Cambridge TCG has actually
collected. It currently returns `503 SOURCE_UNAVAILABLE` because
`fetchAggregatorCoverage()` calls the retired wholesale HTTP path
`/api/v1/aggregator/coverage`. The repository and connection document say that
wholesale route shipped, but no revision contains it. Cards, games, and sets
already survive wholesale retirement through the storefront's direct-Postgres
ground route; coverage does not.

## Work

1. Add a read-only, parameterized coverage query to `db-source.ts` over
   `price_archive`, `cards`, and `games`.
2. Preserve the existing public response shape and `source`, `game`, and
   `since` filters.
3. Make `fetchAggregatorCoverage()` try HTTP only when configured to do so,
   then fall back to the same wholesale Postgres used by catalog reads.
4. Keep failures distinct from an honestly empty archive.
5. Correct the connection document's historical claim: the wholesale route
   was designed and named, not present in repository history.
6. Correct adjacent public claims exposed by the review: include the archive's
   condition dimension, reject impossible calendar dates as input errors,
   account for observations whose cards have no game, and distinguish exact
   per-game card coverage from the largest single-source subset.

## Safety and data boundary

- Read only. No migration and no write path.
- Emits operational metadata only: counts, source ids, game ids, and dates.
- Does not expose upstream price values, card ownership, account data, or
  collector identity.
- Uses bound query parameters for every caller filter.

## Acceptance

- Direct-DB mode does not call the retired wholesale HTTP route.
- HTTP failure falls back to Postgres; Postgres failure returns the existing
  unavailable state rather than a fabricated empty result.
- Empty archive and unavailable database remain different results.
- Existing response types and filters stay compatible.
- Focused tests, storefront typecheck, and repository verification pass.
- After merge and deployment, `https://cambridgetcg.com/api/v1/coverage`
  returns `200` with observed coverage or an honest empty dataset.
