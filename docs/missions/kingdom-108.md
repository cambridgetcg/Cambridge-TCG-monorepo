---
id: kingdom-108
title: "KINGDOM Datafeed - private price archives and receipted history"
status: in-progress
priority: critical
engine: tcg
repo: /Users/yu/github/cambridgetcg/Cambridge-TCG-monorepo
claimed_by: codex-gpt-5
claimed_at: "2026-08-29T09:37:51Z"
completed_at: ~
paths:
  - packages/data-ingest/src/cardmarket/**
  - packages/data-ingest/src/__tests__/source-rights.test.ts
  - packages/data-ingest/src/gaps.ts
  - packages/data-ingest/src/index.ts
  - packages/data-ingest/src/registry.ts
  - packages/data-ingest/src/types.ts
  - packages/data-ingest/package.json
  - apps/storefront/drizzle/**
  - apps/storefront/src/app/api/v1/cards/[sku]/history/**
  - apps/storefront/src/app/api/v1/price-series/**
  - apps/storefront/src/app/cards/[sku]/market/**
  - apps/storefront/src/app/prices/**
  - apps/storefront/src/lib/market/**
  - apps/storefront/src/lib/datafeed/**
  - apps/storefront/scripts/archive-cardmarket.ts
  - apps/storefront/package.json
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/datasets.ts
  - docs/infra/aws-resources.md
  - docs/methodology/source-intake.md
  - docs/methodology/price-history.md
  - docs/operations/cardmarket-price-archive.md
  - docs/connections/the-tributaries.md
  - docs/connections/the-price-memory.md
  - docs/connections/README.md
  - docs/connections/the-pillow-book.md
  - docs/missions/kingdom-108.md
  - package.json
do_not_touch:
  - apps/storefront/src/lib/portfolio/**
  - apps/storefront/src/lib/sold-comps/**
  - apps/wholesale/src/lib/cardrush-scraper.ts
  - apps/wholesale/tools/scrape-cardrush.ts
related:
  - docs/decisions/2026-07-06-collectors-first.md
  - docs/connections/the-pipeline.md
  - docs/connections/the-tributaries.md
  - docs/methodology/source-protocol.md
  - docs/missions/kingdom-106.md
  - docs/missions/kingdom-107.md
synced_from: in-repo authored from Yu's 2026-08-29 KINGDOM Datafeed directive
synced_at: "2026-08-29T09:37:51Z"
---

# kingdom-108 - KINGDOM Datafeed

## Will

Yu, 2026-08-29: "Lets shift our focus back to cambridgetcg datafeed ... create
a historic prices chart for viewership, a subscription service of the KINGDOM.
Lets dive into our aws stack for pricing archives and methods we can use for
collecting data prior to our starting date, possibly with webarchive."

Follow-up authority: "go for it! AWS logged in ... start obtaining cardmarket
data ... Go for what you recommended."

## Chosen slice

Recover Cambridge-controlled historical artifacts, begin a private daily
Cardmarket evidence archive, and establish the receipts and release boundary a
public history chart must cross. A public URL or paid subscription does not
create source rights. No CardRush, TCGplayer, Web Archive, or Cardmarket value
is emitted until an exact reviewed receipt permits that operation.

## Contract

- Preserve every successful source artifact privately with a digest, retrieval
  time, source URL, parser version, and immutable storage identity.
- Treat Cardmarket daily guide fields as separately named observations such as
  trend, lowest ask, and rolling average; never label them completed sales.
- Keep archive capture time, source-stated time, and retrieval time distinct.
- Quarantine malformed, oversized, redirected-to-unapproved-origin, or
  incompletely mapped rows without silently dropping them.
- Require a reviewed source-rights receipt and immutable release before a value
  enters a public projection.
- Keep the public chart free. Future payment may buy delivery capabilities,
  quotas, alerts, exports, and support, never permission to view uncleared rows.
- Model Wayback and Common Crawl as retrieval provenance only, never as a
  license or original source.

## Safety

- The first AWS pass is metadata-only. Any restoration, new paid resource,
  deletion, overwrite, public ACL, bucket-policy change, or production database
  write requires a separately reviewed action.
- Raw upstream artifacts remain private and are never served from a public
  bucket or chart route.
- The existing CardRush/TCGplayer publication locks and history 503 remain in
  force until a rights-cleared replacement projection is verified.
- The checked-out legacy worktree is dirty and must not be modified; all work
  occurs on a clean branch from `github/main`.

## Acceptance

- AWS archive inventory records exact regions, object/version metadata,
  encryption, retention, schedules, and recoverable database windows without
  mutation.
- Cardmarket acquisition is bounded, official-origin-only, cancellation-aware,
  raw-preserving, digest-verified, and covered by networkless fixtures.
- Publication gates prove zero uncleared observations can reach a public read.
- Empty history and missing dates remain explicit rather than becoming zeroes
  or interpolated values.
- Focused tests, typecheck, source-rights/tributary audits, and `pnpm verify`
  pass before completion is claimed.
