---
id: kingdom-071
title: The trust fan-out — single composer + three reading positions + inline primitive
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-13-morning (Opus 4.7, 1M context)
claimed_at: "2026-05-13T08:00:00Z"
completed_at: "2026-05-13T11:00:00Z"
paths:
  - apps/storefront/src/lib/trust/state.ts
  - apps/storefront/src/lib/ui/TrustTier.tsx
  - apps/storefront/src/lib/ui/index.ts
  - apps/storefront/src/app/u/[username]/trust/page.tsx
  - apps/storefront/src/app/api/v1/users/[username]/trust/route.ts
  - apps/storefront/src/app/api/v1/universal/users/[username]/trust/route.ts
  - apps/storefront/src/lib/manifest.ts
  - docs/connections/the-trust-fanout.md
  - docs/connections/README.md
  - docs/missions/kingdom-071.md
do_not_touch:
  - apps/storefront/src/app/account/trust/**     # refactor target; not in this kingdom
  - apps/storefront/src/app/account/standing/**  # refactor target; not in this kingdom
  - apps/storefront/src/lib/escrow/**            # canonical helpers; the composer routes through, doesn't modify
  - apps/storefront/src/lib/market/types.ts      # commissionRateForScore stays here
  - apps/admin/**
  - apps/wholesale/**
  - packages/**
  - drizzle/**
  - docs/principles/**
related:
  - docs/connections/the-market-mirror.md   # S35 — same fan-out shape, different entity (one card)
  - docs/connections/the-substrate-answers.md  # S26 — multi-reading pattern origin
  - docs/connections/the-self-recursion.md  # S29 — _links.kind_definition pattern reused
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-13T11:00:00Z"
---

# kingdom-071 — The trust fan-out

## What this is

Yu's directive 2026-05-13 morning: *"extract the first composer"* → *"Ship whichever pulls you the most first but go for all."* The first composer was the trust state — the kingdom's highest-blast-radius read gap from the previous turn's deep-coupling analysis. Every P2P trade decision pivots on it; before this kingdom no public surface exposed it as anything more than a single number on `/u/[username]`.

This kingdom is the **fan-out pattern's second instance** (after S35's market mirror): one composer feeding three reading positions, plus one shared inline primitive, plus manifest currency.

## What shipped

- **`apps/storefront/src/lib/trust/state.ts`** (~500 LOC) — the composer. `loadUserTrustState(userId)` returns six composed sections (basics + current scores + tier band + stats + reviews + 90d trajectory + **propagation** — the live downstream chain) with `_provenance` envelope. Plus `userTrustStateIsPublic(userId)` and `resolveUsername(username)` helpers. Six DB section queries via `Promise.all` + `safe()` isolation. Does NOT enforce `users.is_public` inline — callers gate.
- **`apps/storefront/src/lib/ui/TrustTier.tsx`** — inline pill primitive. Tier name + (optional) score + (optional) next-tier hint, canonical colors from `TRUST_TIERS`. Server-component-safe. Carries `data-cambridge-trust-tier` and `data-cambridge-trust-score` attributes.
- **`apps/storefront/src/lib/ui/index.ts`** — `TrustTier` exported.
- **`apps/storefront/src/app/u/[username]/trust/page.tsx`** — the HTML calm-read mirror. Server-rendered, public no-auth, gated on `users.is_public`. Provenance pill + WhyLink anchors + Audience declaration. Trajectory sparkline + reviews distribution + sub-rating averages + trade-history stats + **the propagation block** (the killer surface) + next-tier hint. Footer points at JSON + math-mirror siblings.
- **`apps/storefront/src/app/api/v1/users/[username]/trust/route.ts`** — JSON sibling through the data-pantry envelope. `market_signal` freshness (60s). Same `is_public` gate. Returns 404 for private profiles (the JSON sibling must not leak what the HTML hides).
- **`apps/storefront/src/app/api/v1/universal/users/[username]/trust/route.ts`** — math-mirror. `@kind` = `user_trust_state`, `@encoding` = `cambridge-tcg/universal/v1`. Score / ratings as ratios; tiers as ordinals; timestamps as ISO + Unix epoch; username flagged opaque; `user_id_hash = sha256("user:" + uuid)` for federation-stable identity. `@content_hash` stable across retrievals; `_links` includes html_mirror + json_sibling + methodology + kind_definition + encoding_spec.
- **`apps/storefront/src/lib/manifest.ts`** — three new resources registered under `market`: `storefront.user_trust_mirror`, `storefront.user_trust_json`, `storefront.user_trust_math`.
- **`docs/connections/the-trust-fanout.md`** — S37 story-as-wire connection-doc (~700 LOC). Six acts + cast + sister-connections + ten recursion targets + type-signature.
- **`docs/connections/README.md`** — S37 row added.

## The propagation block — the single most novel surface

The kingdom's economic decisions about a user form a five-effect chain from one input (`trust_score`):

```
commissionRateForScore(score) → commission rate
getTrustTier(score) → trade_limit, daily_limit, requires_inspection
getPayoutHoldDays(score) → payout hold days
getUserThresholds(score) → direct/verified escrow bands
```

Before this kingdom, **no page rendered the whole chain against one user's actual score.** The propagation block does. Each row has its own WhyLink to the relevant methodology page. Transparency Ring 2 made unavoidable.

## Acceptance

- `npx tsc --noEmit -p tsconfig.json` from `apps/storefront/` clean for all five new files (pre-existing errors in `api/v1/bridge/route.ts` and `lib/collectives/db.ts` are sister work, untouched).
- Page renders public-no-auth; 404s on missing user, missing username, or `is_public = false`.
- JSON sibling matches HTML mirror's data shape, wrapped in data-pantry envelope.
- Math-mirror produces stable `@content_hash` across retrievals when state unchanged.
- Three manifest entries visible at `/api/v1/manifest`.
- `<TrustTier>` exported from `@/lib/ui`.

## What this kingdom does NOT do

- **Does not refactor the 12 existing direct-`trust_profiles` query sites.** Composer ships first; migration is a follow-on kingdom. Gate condition: prove the shape across three new readers first.
- **Does not ship an MCP per-user trust endpoint.** Named as recursion target.
- **Does not extend the ontology** to include `user_trust_state` as a NodeKind. The math-mirror's `_links.kind_definition` currently points at a 404; substrate-honest gap named.
- **Does not modify `/account/trust` or `/account/standing`.** They keep their current shape; future cleanup composes through the new composer.
- **Does not expose admin-only fields.** `flag_reason` and `suspended_reason` stay private; the composer never returns them.
- **Does not modify the canonical helpers.** `commissionRateForScore`, `getTrustTier`, `getPayoutHoldDays`, `getUserThresholds` stay where they are. The composer routes through them.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*

**The fan-out pattern, named explicitly.** Second instance (after S35). Pattern: `ENTITY → COMPOSER → { HTML calm-read, JSON sibling, math-mirror }`. Each fan-out: one composer + three positions + one shared primitive + three manifest entries + one connection-doc + one mission card + a clear refactor target ("the N existing sites that should compose this"). Future fan-outs: Auction state, Lot state, Card market state (already partial — yesterday's market mirror duplicates `getCardOrderBook` rather than composing it; recursion target there).

**Verify-don't-overwrite observed.** Sister-claimed slots: kingdom-068 (the-collective), kingdom-069 (the-play-substrate). My free slot was kingdom-071; S37 free (S36 sister-claimed). The composer at `lib/trust/state.ts` was extracted yesterday; this kingdom is the fan-out it enables. The 12 existing direct-query sites are preserved untouched.

**Operator action needed:** none for deploy. Pure read additions; no schema; no DB write; no cron; no email. Vercel push.

## Story-arc pairing

This kingdom is **story-as-wire**: the connection-doc [`the-trust-fanout.md`](../connections/the-trust-fanout.md) ships in the same commit as the code. The doc names what the wire is for; the wire enacts what the doc names. Reading the doc top-to-bottom is functionally equivalent to walking the file:line citation table in the IDE.

🐍❤️
