---
id: kingdom-106
title: "Person publication boundaries - private defaults and narrow public projections"
status: in-progress
priority: critical
engine: tcg
repo: /Users/yu/github/cambridgetcg/Cambridge-TCG-monorepo
claimed_by: codex-gpt-5
claimed_at: "2026-07-11T19:30:45Z"
completed_at: ~
paths:
  - apps/storefront/drizzle/0117_privacy_defaults.sql
  - apps/storefront/src/app/account/profile/page.tsx
  - apps/storefront/src/app/account/reviews/page.tsx
  - apps/storefront/src/app/account/trades/[id]/review/page.tsx
  - apps/storefront/src/app/account/wishlist/page.tsx
  - apps/storefront/src/app/api/escrow/**
  - apps/storefront/src/app/api/account/reviews/route.ts
  - apps/storefront/src/app/api/auctions/[id]/**
  - apps/storefront/src/app/api/leaderboards/route.ts
  - apps/storefront/src/app/api/market/lots/route.ts
  - apps/storefront/src/app/api/market/offers/asks/route.ts
  - apps/storefront/src/app/api/messages/**
  - apps/storefront/src/app/api/rewards/raffles/[id]/proof/route.ts
  - apps/storefront/src/app/api/social/**
  - apps/storefront/src/app/api/u/[username]/**
  - apps/storefront/src/app/api/v1/bridge/**
  - apps/storefront/src/app/api/v1/auctions/[id]/**
  - apps/storefront/src/app/api/v1/universal/auctions/[id]/**
  - apps/storefront/src/app/api/v1/users/[username]/trust/**
  - apps/storefront/src/app/api/v1/universal/users/[username]/trust/**
  - apps/storefront/src/app/bridge/**
  - apps/storefront/src/app/auctions/[id]/read/page.tsx
  - apps/storefront/src/app/auctions/[id]/page.tsx
  - apps/storefront/src/app/market/lots/**
  - apps/storefront/src/app/cards/[sku]/market/page.tsx
  - apps/storefront/src/app/market/[sku]/ListingsPanel.tsx
  - apps/storefront/src/app/data/page.tsx
  - apps/storefront/src/app/data.json/route.ts
  - apps/storefront/src/app/privacy/page.tsx
  - apps/storefront/src/app/api/decks/public/[slug]/route.ts
  - apps/storefront/src/app/u/[username]/**
  - apps/storefront/src/lib/auction/**
  - apps/storefront/src/lib/bridge/**
  - apps/storefront/src/lib/escrow/**
  - apps/storefront/src/lib/journey/public-stats.ts
  - apps/storefront/src/lib/format.ts
  - apps/storefront/src/lib/market/card-market.ts
  - apps/storefront/src/lib/market/lots.ts
  - apps/storefront/src/lib/messages/**
  - apps/storefront/src/lib/decks/**
  - apps/storefront/src/lib/rewards/provable-fair.ts
  - apps/storefront/src/lib/social/**
  - apps/storefront/src/lib/trust/public.ts
  - apps/storefront/src/lib/ui/MessageButton.tsx
  - apps/storefront/src/components/auction/BidHistory.tsx
  - apps/storefront/src/lib/manifest.ts
  - docs/missions/kingdom-106.md
  - docs/operations/community-data-network-release.md
do_not_touch:
  - apps/storefront/drizzle/0118_collective_directory.sql
  - packages/data-ingest/**
related:
  - docs/decisions/2026-07-06-collectors-first.md
  - docs/connections/the-other-minds.md
  - docs/operations/community-data-network-release.md
synced_from: in-repo authored from Yu's 2026-07-11 community-data directive
synced_at: "2026-07-11T19:30:45Z"
---

# kingdom-106 - Person publication boundaries

## Will

Yu asked Cambridge TCG to make its live claims match what the system actually
does, to name gaps plainly, and to expand community data without exploiting
people. This mission closes the existing gap between account data and public
publication permission.

## Work

1. Make person-facing publication and unsolicited-message defaults private.
2. Require an explicit choice before public activity or reviews are emitted.
3. Make public profile, activity, commerce, and trust routes use narrow
   projections and indistinguishable not-found responses for private people.
4. Pause portfolio/wishlist matching and bridge affinity inference until an
   explicit trade-intent publication model exists.
5. Keep owner-only account access working and test the public boundary itself.
6. Remove raw person and transaction identifiers from public auction, market
   tape, and leaderboard surfaces; do not describe deterministic UUID suffixes
   as anonymous or unlinkable.
7. Require a published, non-suspended recipient or a validated shared trade
   context before a new conversation can be opened.
8. Keep raffle proofs, public lots, asks, and public decks useful without
   leaking participant identifiers or treating one publication choice as
   permission for an unrelated person profile.
9. Store current, versioned receipts for profile, messaging, and review
   publication; make review publication inspectable and withdrawable by the
   reviewer.

## Safety

The application code can be reviewed and deployed independently. Migration
0117 changes existing people's publication settings and must not run without a
production snapshot, pre-migration counts, a private rollback ledger, and Yu's
explicit confirmation for that data operation.

## Acceptance

Focused privacy tests, storefront typecheck, the full storefront suite, and
`pnpm verify` pass. Production migration and probes are reported separately
from code deployment.
