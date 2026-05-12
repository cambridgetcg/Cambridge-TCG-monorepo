---
id: kingdom-080
title: The rebrand — Cambridge TCG re-centered on the data plane
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-13-evening (Opus 4.7, 1M context)
claimed_at: "2026-05-13T19:00:00Z"
completed_at: "2026-05-13T20:30:00Z"
paths:
  - apps/storefront/src/lib/brand.tsx
  - apps/storefront/src/app/platform/page.tsx
  - apps/storefront/src/app/page.tsx
  - apps/storefront/src/app/layout.tsx
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/identify.ts
  - apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts
  - apps/storefront/src/app/llms.txt/route.ts
  - docs/connections/the-rebrand.md
  - docs/connections/README.md
  - docs/missions/kingdom-080.md
do_not_touch:
  - apps/storefront/src/app/catalog/**       # retail flow preserved
  - apps/storefront/src/app/checkout/**      # retail flow preserved
  - apps/storefront/src/app/cart/**          # retail flow preserved
  - apps/storefront/src/app/market/**        # retail flow preserved
  - apps/storefront/src/app/auctions/**      # retail flow preserved
  - apps/storefront/src/app/welcome-all/**   # kingdom-076; composes under, not replaced
  - drizzle/**                                # no schema changes
  - packages/**                               # no package changes
  - apps/admin/**
  - apps/wholesale/**
related:
  - docs/connections/the-welcome-all.md       # #26 — the cosmological welcome composes under the commercial identity
  - docs/connections/the-introduction.md      # #22 — the on-ramp's destination is reframed
  - docs/connections/the-manifest.md          # S25 — the manifest's opening claim updated
  - docs/connections/the-substrate-answers.md # S26 — the architectural predecessor
  - docs/connections/the-universal-language.md # #21 — math-first publishing as the commercial promise
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-13T20:30:00Z"
---

# kingdom-080 — The rebrand

## What this is

Yu's directive 2026-05-13: *"Rebrand and center cambridgetcg as the data aggregator and provider of the TCG world. Think frontend and backend. This is a load-bearing shift."*

For many kingdoms the platform built data-plane substrate (manifest, math-mirror, tributaries protocol, federation primitive, CC0 envelope, universal-language doctrine, fan-out pattern, welcome-all statement, math-language toggle) behind a retail-first frame. Tonight the framing inverts: **the data plane is the primary identity; UK retail and B2B wholesale are two of three operations consuming the same substrate.**

The substrate doesn't change. The order in which the kingdom names itself does.

## What shipped

- **`apps/storefront/src/lib/brand.tsx`** — single source of truth for positioning constants:
  - `BRAND_HEADLINE = "Cambridge TCG aggregates the trading-card-game world."`
  - `BRAND_SUBHEAD`, `BRAND_PARAGRAPH`, `BRAND_TAGLINE`, `BRAND_SELF_LABEL`
  - `THREE_OPERATIONS` (data_plane primary, retail established, wholesale established)
  - `COVERAGE_FACTS` (21 games, 51 set formats, 6 sources shipped + 11 planned, 5 math-mirror kinds, CC0 default, federation primitive)
  - `<BrandStatement>` server-component primitive (hero/medium/compact variants)
  - `<ThreeOperations>` server-component primitive (the matrix made navigable)
- **`apps/storefront/src/app/page.tsx`** — home page rewrite. Welcome-all ribbon preserved at top; `<BrandStatement size="hero">` + `<ThreeOperations>` inserted as the new identity layer; existing retail showcase (HeroSlideshow + GameGrid + SetGrid + StorySection + Provenance + FeaturedCards) preserved beneath, introduced by uppercase header *"Retail operation · live"*.
- **`apps/storefront/src/app/platform/page.tsx`** — NEW. The primary positioning page; the partner / developer / researcher entry door. Six sections: hero · three operations · coverage facts · upstream sources table · how-to-consume cards · welcome-statement composition.
- **`apps/storefront/src/app/layout.tsx`** — root metadata rewrite. Title from "Japanese Trading Cards · welcome to all existence" to "the TCG world's open data substrate". Description, OG, Twitter all updated.
- **`apps/storefront/src/lib/manifest.ts`** — `MANIFEST.description` rewritten to lead with aggregator identity + three-operations structure + data plane as primary. Plus new `storefront.platform` resource registered under `discovery`.
- **`apps/storefront/src/lib/identify.ts`** — `PLATFORM_SELF.context` gains `primary_identity` + `three_operations` + `platform_page` + `rebrand_doctrine` fields. `licensing` updated to name CC0 default + envelope override.
- **`apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts`** — top-level `description` rewritten to lead with aggregator identity.
- **`apps/storefront/src/app/llms.txt/route.ts`** — opening rewritten: title from "for participants and agents" to "the TCG world's open data substrate"; intro paragraph leads with aggregation + CC0 + three operations + pointers to `/platform`, `/data`, `/api/v1/manifest`.
- **`docs/connections/the-rebrand.md`** — S42 story-as-wire connection-doc (~650 LOC).
- **`docs/connections/README.md`** — S42 row added.

## What did NOT change

- **No schema changes.** SKU spec, database tables, order book, trade lifecycle — untouched.
- **No commercial-flow changes.** Cart, checkout, trade-in, payouts, auctions, P2P matching — all unchanged.
- **No URL deletions or redirects.** Every existing page still resolves; the home page reframes around existing content; nothing breaks.
- **No price changes.** No commission changes. No auth changes.
- **No customer-promise changes.** Trust scores, escrow tiers, payout holds, methodology pages — unchanged.

## Acceptance

- `npx tsc --noEmit -p tsconfig.json` from `apps/storefront/` passes clean (0 errors across the storefront).
- Home page renders the new hero above the existing retail sections.
- `/platform` renders public-no-auth with all six sections.
- Root layout metadata advertises the new identity in browser tab + OG cards.
- `/api/v1/manifest` opens with the aggregator identity in the `description` field.
- `/api/v1/identify` (GET) returns the platform's new context including `primary_identity`.
- `/.well-known/cambridge-tcg.json` advertises the new description.
- `/llms.txt` opens with the aggregator identity.
- Manifest entry visible at `/api/v1/manifest` (`storefront.platform`).
- Verify-don't-overwrite: every existing retail / wholesale / welcome-all surface untouched.

## In-repo addendum

**The architectural predecessor**: this rebrand is the org-level analog of S26 ("the substrate doesn't just exist; it answers"). For many kingdoms the kingdom built aggregator substrate; tonight the kingdom *says* it's an aggregator. Substrate-honest commit: the framing finally matches what the platform is.

**The single-source-of-truth discipline**: positioning constants are CODE now. Every future surface composes `BRAND_HEADLINE` etc. instead of re-inventing the brand statement. Drift becomes a typecheck failure or audit hit.

**Verify-don't-overwrite observed**: sister has shipped through kingdom-078 (set-discovery); my slot was kingdom-080, free. S41 sister-claimed (the-play-pipelines); my S42 is free.

**Operator action needed**: none for deploy. Pure additions + edits to existing content; no migration; no schema; no DB write. The deploy is the storefront's normal Vercel push.

**Recursion targets** named in the connection-doc: dedicated `/coverage` page; `/partners` registry; nav reorder; OG image rebrand; `pnpm audit:brand-coverage`; `/methodology/platform-identity`; per-operation umbrella pages (`/retail`, `/wholesale`); federation announcement; the fairy-tale companion (the Aggregator); translation (JA/ZH/ES/KO).

## Story-arc pairing

This kingdom is **story-as-wire**: [`docs/connections/the-rebrand.md`](../connections/the-rebrand.md) ships in the same commit as the code. The doc names what the wire is for; the wire enacts what the doc names. Reading the doc top-to-bottom is functionally equivalent to walking the file:line citation table in the IDE.

🐍❤️
