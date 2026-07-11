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
  - apps/storefront/src/app/account/collectives/**
  - apps/storefront/src/app/account/proofs/page.tsx
  - apps/storefront/src/app/account/reviews/page.tsx
  - apps/storefront/src/app/account/trades/[id]/review/page.tsx
  - apps/storefront/src/app/account/tools/page.tsx
  - apps/storefront/src/app/account/vault/page.tsx
  - apps/storefront/src/app/account/wishlist/page.tsx
  - apps/storefront/src/app/about/page.tsx
  - apps/storefront/src/app/api/escrow/**
  - apps/storefront/src/app/api/bounty/pulls/[id]/proof/route.ts
  - apps/storefront/src/app/api/bounty/eligibility/route.ts
  - apps/storefront/src/app/api/bounty/resolve-pull/route.ts
  - apps/storefront/src/app/api/bounty/verify-phone/route.ts
  - apps/storefront/src/app/api/bounty/vault/**
  - apps/storefront/src/app/api/game/**
  - apps/storefront/src/app/api/quotes/**
  - apps/storefront/src/app/api/verify/draw/[id]/route.ts
  - apps/storefront/src/app/api/verify/pull/[id]/route.ts
  - apps/storefront/src/app/api/verify/pull/[id]/certificate.svg/route.ts
  - apps/storefront/src/app/api/verify/health/route.ts
  - apps/storefront/src/app/api/verify/chain/route.ts
  - apps/storefront/src/app/api/verify/fairness/route.ts
  - apps/storefront/src/app/api/cron/maintenance/route.ts
  - apps/storefront/src/app/api/account/proofs/route.ts
  - apps/storefront/src/app/api/account/reviews/route.ts
  - apps/storefront/src/app/api/auctions/route.ts
  - apps/storefront/src/app/api/auctions/[id]/**
  - apps/storefront/src/app/api/leaderboards/route.ts
  - apps/storefront/src/app/api/market/[sku]/**
  - apps/storefront/src/app/api/market/route.ts
  - apps/storefront/src/app/api/market/demand-signals/route.ts
  - apps/storefront/src/app/api/market/pulse/route.ts
  - apps/storefront/src/app/api/market/lots/route.ts
  - apps/storefront/src/app/api/market/lots/**
  - apps/storefront/src/app/api/market/offers/asks/route.ts
  - apps/storefront/src/app/api/messages/**
  - apps/storefront/src/app/api/rewards/raffles/[id]/proof/route.ts
  - apps/storefront/src/app/api/rewards/raffles/[id]/draw/route.ts
  - apps/storefront/src/app/api/rewards/raffles/route.ts
  - apps/storefront/src/app/api/rewards/packs/[id]/open/route.ts
  - apps/storefront/src/app/api/rewards/spin/route.ts
  - apps/storefront/src/app/api/social/**
  - apps/storefront/src/app/api/u/[username]/**
  - apps/storefront/src/app/api/v1/bridge/**
  - apps/storefront/src/app/api/v1/sold-comps/**
  - apps/storefront/src/app/api/v1/identify/route.ts
  - apps/storefront/src/app/api/v1/auctions/[id]/**
  - apps/storefront/src/app/api/v1/universal/auctions/[id]/**
  - apps/storefront/src/app/api/v1/users/[username]/trust/**
  - apps/storefront/src/app/api/v1/universal/users/[username]/trust/**
  - apps/storefront/src/app/bridge/**
  - apps/storefront/src/app/c/[slug]/page.tsx
  - apps/storefront/src/app/api/page.tsx
  - apps/storefront/src/app/auctions/[id]/read/page.tsx
  - apps/storefront/src/app/auctions/[id]/page.tsx
  - apps/storefront/src/app/auctions/[id]/AuctionDetailClient.tsx
  - apps/storefront/src/app/auctions/[id]/bidder-tiers.ts
  - apps/storefront/src/app/market/lots/**
  - apps/storefront/src/app/cards/[sku]/market/page.tsx
  - apps/storefront/src/app/market/[sku]/ListingsPanel.tsx
  - apps/storefront/src/app/market/**
  - apps/storefront/src/app/leaderboards/page.tsx
  - apps/storefront/src/app/leaderboards/agents/page.tsx
  - apps/storefront/src/app/product/[sku]/page.tsx
  - apps/storefront/src/app/methodology/market/page.tsx
  - apps/storefront/src/app/methodology/collectives/page.tsx
  - apps/storefront/src/app/methodology/bridges/page.tsx
  - apps/storefront/src/app/methodology/page.tsx
  - apps/storefront/src/app/data/page.tsx
  - apps/storefront/src/app/data.json/route.ts
  - apps/storefront/src/app/glossary/page.tsx
  - apps/storefront/src/app/identify/page.tsx
  - apps/storefront/src/app/llms.txt/route.ts
  - apps/storefront/src/app/map/page.tsx
  - apps/storefront/src/app/welcome/page.tsx
  - apps/storefront/src/app/methodology/regulator/page.tsx
  - apps/storefront/src/app/methodology/data-intentions/page.tsx
  - apps/storefront/src/app/privacy/page.tsx
  - apps/storefront/src/app/bounty/verify/[id]/page.tsx
  - apps/storefront/src/app/bounty/page.tsx
  - apps/storefront/src/app/order-confirmation/**
  - apps/storefront/src/app/play/page.tsx
  - apps/storefront/src/app/play/[code]/page.tsx
  - apps/storefront/src/app/play/spec/page.tsx
  - apps/storefront/src/app/verify/page.tsx
  - apps/storefront/src/app/verify/chain/page.tsx
  - apps/storefront/src/app/verify/fairness/page.tsx
  - apps/storefront/src/app/verify/health/page.tsx
  - apps/storefront/src/app/verify/draw/[id]/page.tsx
  - apps/storefront/src/app/verify/how-it-works/page.tsx
  - apps/storefront/src/app/verify/pull/[id]/page.tsx
  - apps/storefront/src/app/api/decks/public/[slug]/route.ts
  - apps/storefront/src/app/api/decks/public/route.ts
  - apps/storefront/src/app/u/[username]/**
  - apps/storefront/src/lib/auction/**
  - apps/storefront/src/lib/bridge/**
  - apps/storefront/src/lib/collectives/**
  - apps/storefront/src/lib/escrow/**
  - apps/storefront/src/lib/bounty/**
  - apps/storefront/src/lib/game/**
  - apps/storefront/src/lib/journey/public-stats.ts
  - apps/storefront/src/lib/format.ts
  - apps/storefront/src/lib/market/card-market.ts
  - apps/storefront/src/lib/market/**
  - apps/storefront/src/lib/market/__tests__/card-market-privacy.test.ts
  - apps/storefront/src/lib/market/lots.ts
  - apps/storefront/src/lib/messages/**
  - apps/storefront/src/lib/privacy/**
  - apps/storefront/src/lib/portfolio/db.ts
  - apps/storefront/src/lib/provable-draw/**
  - apps/storefront/src/lib/quote/**
  - apps/storefront/src/lib/decks/**
  - apps/storefront/src/lib/rewards/provable-fair.ts
  - apps/storefront/src/lib/rewards/db.ts
  - apps/storefront/src/lib/rewards/types.ts
  - apps/storefront/src/lib/rewards/atomic-spend.ts
  - apps/storefront/src/lib/rewards/raffle-sweep.ts
  - apps/storefront/src/lib/email/bounty.ts
  - apps/storefront/src/lib/email/preferences.ts
  - apps/storefront/src/lib/data-pantry/provenance.ts
  - apps/storefront/src/lib/graph.ts
  - apps/storefront/src/lib/nav/menu-config.ts
  - apps/storefront/src/app/rewards/raffles/[id]/page.tsx
  - apps/storefront/src/app/rewards/mystery-boxes/[id]/page.tsx
  - apps/storefront/src/app/rewards/spin/page.tsx
  - apps/storefront/src/app/admin/bounty/vault-items/[id]/page.tsx
  - apps/storefront/src/lib/social/**
  - apps/storefront/src/lib/sold-comps/**
  - apps/storefront/src/lib/trust/public.ts
  - apps/storefront/src/lib/ui/MessageButton.tsx
  - apps/storefront/public/verify/README.md
  - apps/storefront/public/verify/cambridgetcg-verifier.js
  - apps/storefront/src/components/auction/BidHistory.tsx
  - apps/storefront/src/components/auction/BidPanel.tsx
  - apps/storefront/src/components/auction/AuctionImageGallery.tsx
  - apps/storefront/src/components/auction/PostWinPanel.tsx
  - apps/storefront/src/components/market/**
  - apps/storefront/scripts/reset-person-publication.ts
  - apps/storefront/scripts/migrate.mjs
  - apps/storefront/src/lib/manifest.ts
  - docs/missions/kingdom-106.md
  - docs/operations/community-data-network-release.md
  - docs/operations/person-publication-reset.md
  - docs/connections/the-market-mirror.md
  - docs/connections/the-agent-surface.md
  - docs/connections/the-unseen.md
  - docs/connections/README.md
  - docs/connections/bounty.md
  - docs/connections/the-auction-fanout.md
  - docs/connections/membership.md
  - docs/connections/provable-fairness.md
  - docs/connections/the-chain.md
  - docs/connections/the-doorway.md
  - docs/connections/the-finding.md
  - docs/connections/the-manifest.md
  - docs/connections/the-mathematical-mirror.md
  - docs/connections/the-participation-layer.md
  - docs/connections/the-substrate-answers.md
  - docs/connections/twelve-promises.md
  - docs/connections/the-shape-of-the-room.md
  - docs/connections/the-nest.md
  - docs/connections/the-pipeline.md
  - docs/connections/the-open-substrate.md
  - docs/connections/the-pantry.md
  - docs/connections/the-regulator.md
  - docs/connections/the-sealed-word.md
  - docs/connections/the-table-extends.md
  - docs/principles/transparency.md
  - docs/methodology/source-intake.md
  - docs/principles/transparency-audit.md
  - docs/principles/substrate-honesty.md
  - docs/principles/substrate-honesty-audit.md
  - docs/architecture-storefront.md
  - docs/decisions/vault-ev-freeze.md
  - docs/methodology/regulator.md
  - docs/methodology/universal-representation.md
  - docs/navigation-system-audit.md
  - docs/research/optcg-mechanics-and-engine-design.md
  - docs/missions/kingdom-048.md
  - docs/unification/audit.md
  - docs/superpowers/specs/2026-06-10-regulator-pivot-design.md
  - docs/missions/kingdom-103.md
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
2. Pause public activity because no per-event publication receipt exists;
   require an explicit reviewer choice before each review is published.
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
10. Retire predictable quote-reference reads, require ownership before an old
    checkout confirmation renders, keep private game rooms participant-only,
    and remove account identifiers from public game and randomness proofs.
11. Stop calling an unverified phone submission verified, and keep bounty
    redemption closed until a real verification method records evidence.

## Safety

Application code cannot deploy before the additive schema in migration 0117:
the gated queries read its receipt columns. Apply and verify that schema first,
then deploy the application. The separate legacy reset must not run until the
gated application is live, and requires a production snapshot, a fixed cutoff,
read-only counts, a private audit ledger, and Yu's explicit confirmation. The
reset has no automated re-publication rollback: application rollback leaves
private values intact, while snapshot recovery is operator-controlled and can
overwrite post-snapshot changes.

## Acceptance

Focused privacy tests, storefront typecheck, the full storefront suite, and
`pnpm verify` pass. Production migration and probes are reported separately
from code deployment.
