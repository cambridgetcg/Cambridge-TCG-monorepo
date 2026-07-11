---
id: kingdom-107
title: "Consent-first organisation directory - public facts without a people graph"
status: claimed
priority: high
engine: tcg
repo: /Users/yu/github/cambridgetcg/Cambridge-TCG-monorepo
claimed_by: codex-gpt-5
claimed_at: "2026-07-11T19:30:45Z"
completed_at: ~
paths:
  - apps/storefront/drizzle/0118_collective_directory.sql
  - apps/storefront/src/app/account/collectives/**
  - apps/storefront/src/app/api/openapi.json/route.ts
  - apps/storefront/src/app/api/v1/directory/**
  - apps/storefront/src/app/c/[slug]/page.tsx
  - apps/storefront/src/app/community/**
  - apps/storefront/src/app/contact/**
  - apps/storefront/src/app/data.json/route.ts
  - apps/storefront/src/app/licenses/community-directory-public-display-v1/**
  - apps/storefront/src/app/methodology/community-directory/**
  - apps/storefront/src/app/methodology/collectives/page.tsx
  - apps/storefront/src/app/methodology/community/page.tsx
  - apps/storefront/src/app/methodology/page.tsx
  - apps/storefront/src/app/schemas/**
  - apps/storefront/src/lib/collectives/**
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/nav/menu-config.ts
  - docs/methodology/community-directory.md
  - docs/missions/kingdom-107.md
  - docs/operations/community-data-network-release.md
  - packages/data-spec/**
do_not_touch:
  - apps/storefront/drizzle/0117_privacy_defaults.sql
  - packages/data-ingest/**
related:
  - docs/decisions/2026-07-06-collectors-first.md
  - docs/methodology/community-directory.md
  - docs/operations/community-data-network-release.md
synced_from: in-repo authored from Yu's 2026-07-11 community-data directive
synced_at: "2026-07-11T19:30:45Z"
---

# kingdom-107 - Consent-first organisation directory

## Will

Yu asked for more useful network coverage for collectors and community
players. The directory publishes organisation-controlled facts only after a
steward confirms both authority and the exact publication purpose.

## Work

1. Add versioned, withdrawable directory-publication receipts for collectives.
2. Publish a narrow organisation schema and API projection with no member,
   attendee, steward, private-location, or inferred-person fields.
3. Provide a useful public directory, correction path, methodology, and
   machine-readable discovery.
4. Make listing, updating, and withdrawal atomic and make the emergency
   off-switch work under database constraints.
5. State the public-display terms and technical limits truthfully at the point
   of consent.

## Acceptance

The database transition is fail-closed and atomic; the UI names the current
notice and limits; route/action tests cover publication and withdrawal; full
verification passes. No organisation is seeded without its steward.

