---
id: kingdom-067
title: The market mirror — substrate-honest pure-read view of one card's market
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-12-evening (Opus 4.7, 1M context)
claimed_at: "2026-05-12T22:30:00Z"
completed_at: "2026-05-12T23:30:00Z"
paths:
  - apps/storefront/src/lib/market/card-market.ts
  - apps/storefront/src/app/cards/[sku]/market/page.tsx
  - apps/storefront/src/app/methodology/market/page.tsx
  - apps/storefront/src/app/methodology/page.tsx
  - apps/storefront/src/lib/manifest.ts
  - docs/connections/the-market-mirror.md
  - docs/connections/README.md
  - docs/missions/kingdom-067.md
do_not_touch:
  - apps/storefront/src/app/market/**  # the interactive sibling; preserved untouched
  - apps/storefront/src/app/api/market/**  # interactive API endpoints
  - apps/admin/**
  - apps/wholesale/**
  - packages/**
  - drizzle/**
  - docs/principles/**
related:
  - docs/connections/the-trader-mirror.md  # S33 — sister surface; one trader across many transactions
  - docs/connections/the-substrate-answers.md  # S26 — the math-mirror pattern (one substrate, two readings)
  - docs/connections/the-pricing-arrow.md  # S17 — the value that arrives at this page
  - docs/connections/the-fifth-question.md  # S22 — for whom is this page true?
  - apps/storefront/src/app/market/[sku]/page.tsx  # the interactive sibling
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-12T23:30:00Z"
---

# kingdom-067 — The market mirror

## What this is

Yu's directive: *"Build /cards/[sku]/market first."*

The marketplace had a deeply rich interactive surface at `/market/[sku]` (depth ladder, sparkline, VWAP, fair value, fill probability, tape, related cards, alerts, watchlist, order form — discovered during exploration; previously underestimated). What it didn't have was a **calm-read sibling**: a public-no-auth, server-rendered, screen-reader-readable, agent-ingestable mirror of the same substrate.

This kingdom ships that mirror. Same data, two readings, different audiences. Verify-don't-overwrite observed — the interactive page is untouched. The pattern is the S26 math-mirror pattern applied a second time.

## What shipped

- **`apps/storefront/src/lib/market/card-market.ts`** (~520 lines) — the composer. Types: `CardMarketMeta`, `PriceHistoryPoint`, `CardMarketPriceHistory`, `BookRow`, `CardMarketBook`, `TapeEntry`, `CardMarketTape`, `CardMarketStats`, `ConditionRow`, `CardMarketParticipants`, `CardMarket`. Entry point: `loadCardMarket(sku)`. Seven parallel section loaders, each isolated by `safe()`. Returns `_provenance: { kind: "live", queried_at, sources, methodology_url }` envelope.
- **`apps/storefront/src/app/cards/[sku]/market/page.tsx`** (~400 lines) — server-rendered page. `<Provenance kind="live" />` at top + footer; `<WhyLink>` on every section anchored to `/methodology/market#<section>`; `<Audience kind="consumer" contexts={["market", "card", "public-read"]} />`. Inline SVG sparklines for the four price-history windows. Trust tier badges on the tape (Elite/Veteran/Trusted/Starter/New). Anonymous seller id (last 6 chars of UUID) for correlation without identity exposure.
- **`apps/storefront/src/app/methodology/market/page.tsx`** — every formula in SQL form; every approximation flagged; "what this page does NOT do" enumerated (no cross-platform / no graded / no sealed / no forecasting / no rankings / no per-order trust / no fill-probability).
- **`apps/storefront/src/app/methodology/page.tsx`** — `market` topic added to TOPICS array.
- **`apps/storefront/src/lib/manifest.ts`** — new `storefront.card_market_mirror` resource in `MANIFEST.resources.market`. Auth: public. Provenance: live. Cosmology axes: value, transaction, time, identity.
- **`docs/connections/the-market-mirror.md`** — S35 story-as-wire connection-doc (~600 lines). Six acts + cast + sister-connections + 11 recursion targets + type-signature.
- **`docs/connections/README.md`** — S35 row added to the story-arc table.

## The seven sections

1. **Card meta** — sku, name, set, image, first-seen-on-platform.
2. **Order book** — top 10 bid levels (descending) + top 10 ask levels (ascending), each row aggregated by price with inline condition breakdown (`NM ×3, LP ×1`). Best bid/best ask/spread headline.
3. **Aggregate stats** — best bid, best ask, spread, 30d VWAP, 30d median, 30d volume, 30d range, last trade (price + when), 90d completion rate.
4. **The tape** — last 20 completed trades with counterparty trust tier joined from `trust_profiles` at read time. Plus 24h / 7d / 30d trade counts.
5. **Price history** — 7d / 30d / 90d / 365d windows, four sparklines side-by-side, each from independent `card_price_history` queries.
6. **Condition breakdown** — NM/LP/MP/HP ask counts + best open-ask price per condition.
7. **Participants (90d)** — distinct buyers / distinct sellers / repeat-pair fraction. Anonymised counts.

## Acceptance

- `npx tsc --noEmit -p tsconfig.json` from `apps/storefront/` passes clean.
- Page renders public-no-auth.
- Each section degrades to empty / `—` if its query fails.
- `<Provenance kind="live" />` pill at header and footer.
- `<WhyLink>` on each section lands at `/methodology/market#<anchor>`.
- Manifest entry visible at `/api/v1/manifest`.
- Methodology index lists "market" topic.
- Verify-don't-overwrite: `apps/storefront/src/app/market/[sku]/page.tsx` and `apps/storefront/src/app/api/market/**` are untouched.

## What this kingdom does NOT do

- **Does not add schema.** No new tables, no migration.
- **Does not modify the interactive page.** `/market/[sku]` is preserved exactly as-is.
- **Does not write to any table.** Pure read-projection.
- **Does not show cross-platform prices.** Tributaries (TCGplayer / Cardmarket / etc.) are catalogued in `the-tributaries.md` but not surfaced here.
- **Does not show graded / sealed prices.** Singles only, four conditions only.
- **Does not forecast.** Snapshot, not projection.
- **Does not rank participants.** No leaderboard.
- **Does not show per-order counterparty trust.** Order book aggregates by price; only the tape (which is per-trade) carries tier badges.
- **Does not compute fill probability.** That's the interactive page's job; this mirror is read-only.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*

**The discovery.** The directive said *"build /cards/[sku]/market first."* My initial read assumed depth-of-market was missing. Exploring schemas revealed `/market/[sku]` already does almost everything (depth, sparkline, VWAP, fair value, fill probability, tape). The right move was not to compete with that page but to ship its calm-read sibling. **This is a meta-finding for future Sophias: before building a marketplace feature, read what's already there.** The substrate is rich; the surface is often rich; what's missing is usually the sibling-for-different-audience, not new transactional capability.

**Verify-don't-overwrite explicit.** Sister-claimed slots in 060–066: 060 (the-three-paths.md sister; play archetypes), 064 (the-archive.md sister; price archive design), 065 (the-tailored-doors.md sister; community doors), 066 (the-cardrush-alignment.md sister; ingest alignment). My slot was 067. S31 = the-expansion (sister, kingdom-058), S32 = the-shared-table (sister, kingdom-059), S33 = the-trader-mirror (mine, kingdom-063), S34 = the-three-paths (sister, kingdom-060). My free slot is S35.

**The two-reading pattern, named.** S26 was the first instance (math-mirror to product page). This is the second (calm-read mirror to interactive `/market/[sku]`). The pattern: *every interactive transactional surface implies a sibling pure-read mirror for the audiences the interactive page doesn't naturally serve*. Future instances probably want this treatment — auctions, portfolio, trade-in. Not every page needs it; surfaces with mixed auth requirements + form state + polling especially benefit.

**The four-doctrine pass.** This was the second domain to get the full pass in one shipment (after S33's trader-dashboard). The pass: Provenance pill at top + footer; WhyLink on every section anchored into methodology; Audience declaration in head + body; methodology page explaining every formula + every gap; manifest registration; connection-doc naming meaning.

**Operator action needed:** none for deploy (read-only page, no schema, no DB write, no cron, no email).

## Story-arc pairing

This kingdom is **story-as-wire**: the connection-doc [`the-market-mirror.md`](../connections/the-market-mirror.md) ships in the same commit as the code. The doc names what the wire is for; the wire enacts what the doc names. Reading the doc top-to-bottom is functionally equivalent to walking the file:line citation table in the IDE.

🐍❤️
