---
id: kingdom-109
title: "KINGDOM Signals - opportunity-signal/v1 contract and private-engine boundary"
status: in-progress
priority: critical
engine: tcg
repo: /Users/you/Desktop/ctcg-opportunity-signal
claimed_by: codex-gpt-5
claimed_at: "2026-09-01T12:05:53Z"
completed_at: ~
paths:
  - packages/opportunity-signal/**
  - package.json
  - pnpm-lock.yaml
  - docs/methodology/opportunity-signals.md
  - docs/connections/the-opportunity-signal.md
  - docs/connections/README.md
  - docs/connections/the-pillow-book.md
  - docs/state.md
  - docs/missions/kingdom-109.md
  - apps/storefront/src/app/methodology/opportunity-signals/**
  - apps/storefront/src/app/methodology/page.tsx
  - apps/storefront/src/lib/manifest.ts
do_not_touch:
  - packages/data-ingest/**
  - apps/storefront/drizzle/**
  - apps/storefront/src/app/api/**
  - apps/storefront/src/lib/market/**
  - apps/storefront/src/lib/payments/**
  - apps/storefront/src/lib/membership/**
related:
  - docs/missions/kingdom-107.md
  - docs/methodology/source-intake.md
  - docs/connections/the-tributaries.md
  - docs/connections/the-pricing-arrow.md
  - docs/decisions/2026-07-06-collectors-first.md
synced_from: in-repo authored from Yu's 2026-09-01 KINGDOM Signals directive
synced_at: "2026-09-01T12:05:53Z"
---

# kingdom-109 - KINGDOM Signals

## Will

Yu, 2026-09-01:

> “And I do feel like the direct sales of data is not the proper route. Utilising
> the data to create an application that assist card traders to find arbitrage
> opportunities or deals on the market should be what we sell. We keep the
> engine behind. Trade secrets.”

Follow-up authority: “lets go for what you recommended!”

## Chosen slice

Ship the public, source-independent `opportunity-signal/v1` wire contract, its
strict validator, a redaction-safe delivery shape, and the interface a private
engine must implement. The Cambridge TCG monorepo is public, so proprietary
scoring weights, heuristics, models, feature transforms, and training/evaluation
corpora must not enter this repository.

This first slice creates no scraper, database reader, billing path, public API,
user interface, automated purchase path, or executable scoring policy.

## Contract

- Accept exact, explicitly timed evidence and costs; never fetch a source.
- Use integer minor units and explicit currencies at every money boundary.
- Separate a candidate listing, valuation range, costs, liquidity evidence, and
  source/rights state rather than flattening them into one price.
- Derive an expiry from the earliest expiring required input.
- Treat confidence as evidence quality, never profit probability.
- Treat liquidity as unknown unless separately evidenced.
- Refuse to emit an actionable signal when identity, rights, required costs,
  timing, currency conversion, or valuation evidence is incomplete.
- Emit only coarse conservative spread/margin bands and named risks; keep the
  exact valuation and economics private, and never claim guaranteed profit,
  investment advice, execution authority, or arbitrage certainty.
- Keep source rows, private features, model internals, and reconstructive
  historical data out of the delivery shape.

## Safety

- No source permission is inferred from authentication, payment, public
  reachability, transformation, or secrecy.
- The schema has no seller/buyer identity, order-id, listing-corpus, or personal
  data field. The composing service must mint a non-identifying candidate
  reference; the validator can enforce only its wire shape.
- No private-engine implementation may be committed to this public repository.
- The package remains pure and deterministic: no I/O, clock, randomness,
  environment variables, database, or network.

## Acceptance

- Exact versioned TypeScript types and a strict JSON validator ship in a new
  zero-runtime-dependency workspace package.
- Strict validation rejects unknown fields, malformed timestamps, non-integer
  money, unsupported currency/condition/finish values, impossible ranges,
  cross-contract evidence, and unsafe delivery claims; preflight converts
  expired or incomplete evidence into `unavailable`.
- A private-engine provider interface and redacted delivery projector are
  covered by deterministic tests without exposing any proprietary algorithm.
- Canonical methodology and connection documentation name what shipped, what is
  private, and what remains absent.
- Focused package tests, workspace typecheck, audits, and `pnpm verify` pass.

## In-repo addendum

This mission is repository-authored because the accessible canonical private
queue stops at kingdom-051. Kingdom-108 already exists on the unmerged price
datafeed branch, so this directive reserves kingdom-109.
