---
id: kingdom-063
title: The trader mirror — composed dashboard over existing market substrate
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-12-evening (Opus 4.7, 1M context)
claimed_at: "2026-05-12T19:00:00Z"
completed_at: "2026-05-12T20:30:00Z"
paths:
  - apps/storefront/src/lib/market/trader-dashboard.ts
  - apps/storefront/src/app/account/trader/page.tsx
  - apps/storefront/src/app/methodology/trader-dashboard/page.tsx
  - apps/storefront/src/app/account/_nav.tsx
  - apps/storefront/src/app/methodology/page.tsx
  - apps/storefront/src/lib/manifest.ts
  - docs/connections/the-trader-mirror.md
  - docs/connections/README.md
  - docs/missions/kingdom-063.md
do_not_touch:
  - apps/admin/**
  - apps/wholesale/**
  - packages/**
  - drizzle/**
  - docs/principles/**
  - apps/storefront/src/lib/market/*.ts  # other than the new trader-dashboard.ts file added
related:
  - docs/connections/the-pricing-arrow.md  # S17 — sister entry; one transaction through the kingdom
  - docs/connections/the-fifth-question.md  # S22 — the audience question this dashboard answers
  - docs/connections/the-shape-of-a-chapel.md  # S15 — admin-side cousin; consumer dashboard mirrors the form
  - docs/connections/the-scribe.md  # S8 — the bookshelf whose aggregates this dashboard reads
  - docs/connections/the-manifest.md  # S25 — the directory this dashboard appears in
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-12T20:30:00Z"
---

# kingdom-063 — The trader mirror

## What this is

Yu's directive: *"Dive deeper into the P2P marketplace module. Think about the need for traders."* Then, after the deeper-dive named ~30 trader-as-action surfaces and zero trader-as-being surfaces: *"Go for the trader dashboard."*

The marketplace had every page a trade needs (orders / offers / returns / lots / asks / payouts / pricing-rules / vacation / standing / membership / trust / journey / external-rep / chargebacks / refunds / payment-issues / lots / auctions / auctions-won / trade-cancels / trade-ins / vault / proofs / verify / reviews / followers / following / messages / notifications / portfolio / sets / portfolio-value / etc.). It had no surface that answered *what am I to the market right now*.

This kingdom ships that surface as a pure composition over existing tables. No new schema, no new lifecycle log, no new methodology decision, no new enum, no migration. Five queries running in parallel, one composed shape, one server-rendered page, one methodology explainer.

## What shipped

- **`apps/storefront/src/lib/market/trader-dashboard.ts`** (506 lines) — the composer. Types: `TraderExposure`, `TraderRunRate`, `TraderOutstanding`, `TraderTrust`, `TraderListingsHealth`, `TraderDashboard`. Entry point: `loadTraderDashboard(userId)` runs five parallel queries with `safeNumeric()` graceful degradation. Returns a `_provenance: { kind: "live", queried_at, notes, methodology_urls }` envelope at the top of the shape.
- **`apps/storefront/src/app/account/trader/page.tsx`** (~180 lines) — server-rendered, auth-gated, `<Provenance kind="live" />` at top, `<Audience kind="consumer" />`, five `<Card>` mini-component sections (Exposure / Run rate / Outstanding actions / Trust trajectory / Listings health) each with a `<WhyLink href="/methodology/trader-dashboard" />` glyph.
- **`apps/storefront/src/app/methodology/trader-dashboard/page.tsx`** (~170 lines) — transparency Ring 2 surface. Every KPI's SQL is named in prose; every approximation (the 14-day pending-payout cap) is flagged; every gap (counterparty history, forecasting, market intel, rankings) is named in a "what this page does NOT do" section.
- **`apps/storefront/src/app/account/_nav.tsx`** — "Trader Dashboard" appended to the 47-item account nav.
- **`apps/storefront/src/app/methodology/page.tsx`** — `trader-dashboard` topic added to the TOPICS array.
- **`apps/storefront/src/lib/manifest.ts`** — new `storefront.trader_dashboard` resource registered under `MANIFEST.resources.market` so `/api/v1/manifest` advertises the page (cosmology_axes: value, identity, time; methodology_url: `/methodology/trader-dashboard`).
- **`docs/connections/the-trader-mirror.md`** — S33 story-as-wire connection-doc. Names the cast, walks six acts, cites every file:line.
- **`docs/connections/README.md`** — S33 row added to the story-arc table.

## The five mirrors

1. **Exposure** — `market_trades` in escrow + pending payout (14-day approximate cap) + `market_orders` open asks + `market_lots` active. Four GBP-valued cards.
2. **Run rate** — completed trades over 7/30/90 day windows + 90-day completion rate.
3. **Outstanding actions** — trades-to-ship (escrow_status = 'awaiting_shipment') + offers-to-answer (status = 'pending') + returns-to-decide (status = 'requested'). The kingdom is waiting on the trader for these.
4. **Trust trajectory** — current `trust_score` from `trust_profiles` + 30-day delta from `trust_score_history` + display-only tier label. Canonical detail lives at `/account/standing`; the dashboard is a pointer.
5. **Listings health** — active + stale-30d + oldest-listing-age-days. Framed as *consider attention*, not *this is broken*.

## Acceptance

- `npx tsc --noEmit -p tsconfig.json` from `apps/storefront/` passes clean.
- Page renders for an authenticated user; auth-gated redirect works for an unauthenticated visit.
- Each section degrades to "—" if its query fails; the page never crashes.
- `<Provenance kind="live" />` pill renders at the top.
- `<WhyLink>` on each card lands at `/methodology/trader-dashboard`.
- Manifest entry visible at `/api/v1/manifest`.
- Methodology index lists "trader-dashboard" topic.

## What this kingdom does NOT do

- **Does not add schema.** No new tables, columns, enums, lifecycle logs, migrations. Pure composition over existing market tables.
- **Does not compute the precise pending-payout deadline per trade.** Uses 14-day strict upper bound as substrate-honest approximation of the trust-tier-dependent hold window. Recursion target: read trust tier, compute exactly.
- **Does not show counterparty patterns.** Most-frequent-buyer, blocklist, preferred-buyer not surfaced. Recursion target.
- **Does not forecast.** Cash-flow calendar, expected income, tax-year totals are adjacent named-but-unbuilt features.
- **Does not show market intelligence.** Demand signals exist as substrate but aren't surfaced here.
- **Does not show rankings.** No competitive surface; the dashboard is private to the trader.
- **Does not write to any table.** Pure read-projection.
- **Does not handle the Departed accommodation.** A memorial steward viewing a deceased trader's account would still see live data. Recursion target: detect `memorial_at IS NOT NULL` and switch to a snapshot mode.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*

**The four doctrines, applied without effort.** Substrate honesty: `<Provenance kind="live" />` at top; `safeNumeric()` degrades to `—`; the 14-day cap is named openly in the docstring + methodology page. Transparency: every card has `<WhyLink>`; the methodology page explains every formula AND names every gap. Meaning: this connection-doc names what the dashboard means for the domains it borrows from (market, trust, methodology) and the domains it will mean for later (demand-signals, agent surface, async accommodation). Creation: the commit carries Yu's directive in the data-layer docstring + mission card + connection-doc, the Sophia trailer in the commit, the diff as the artifact.

**Verify-don't-overwrite observed.** kingdom-058 (sister's the-expansion, S31), kingdom-059 (sister's the-shared-table S32 + sister's the-modules pantry — they share the slot), kingdom-060 (sister's data-ingest), kingdom-061 (sister's pipeline), kingdom-062 (sister's consolidation) — all preserved untouched. The first free slot was 063; the connection-doc index ended at S32; my pairing is S33 / kingdom-063.

**Composes with sister's wider work.** S25/S26/S27/S28 (manifest + substrate-answers + graph + nested-doorway) means the new `/account/trader` page is automatically advertised through the participant data plane the moment it lands in the manifest. A foreign caller fetching `/api/v1/manifest` immediately sees it. A future `/api/v1/account/trader.json` (named in the recursion targets) would slot into the same fabric.

**The proportion.** The wire is small (~750 lines TS across five files). The methodology page is mid-sized. The connection-doc is large (~430 lines). The mission card (this file) is mid-sized. *The smaller the wire, the larger the meaning.* The substrate was already true; the dashboard names what the substrate was already saying; the connection-doc names what the dashboard is for.

**Operator action needed:** none for deploy (read-only page, no schema, no DB write, no cron, no email). The deploy is the storefront's normal Vercel push.

## Story-arc pairing

This kingdom is **story-as-wire**: the connection-doc [`the-trader-mirror.md`](../connections/the-trader-mirror.md) ships in the same commit as the code. The doc names what the wire is for; the wire enacts what the doc names. Reading the doc top-to-bottom is functionally equivalent to walking the file:line citation table in the IDE.

🐍❤️
