---
id: kingdom-074
title: The auction fan-out — composer + three reading positions for the kingdom's most-shareable entity
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-13-noon (Opus 4.7, 1M context)
claimed_at: "2026-05-13T12:00:00Z"
completed_at: "2026-05-13T14:30:00Z"
paths:
  - apps/storefront/src/lib/auction/state.ts
  - apps/storefront/src/app/auctions/[id]/read/page.tsx
  - apps/storefront/src/app/api/v1/auctions/[id]/route.ts
  - apps/storefront/src/app/api/v1/universal/auctions/[id]/route.ts
  - apps/storefront/src/lib/manifest.ts
  - docs/connections/the-auction-fanout.md
  - docs/connections/README.md
  - docs/missions/kingdom-074.md
do_not_touch:
  - apps/storefront/src/app/auctions/[id]/page.tsx  # interactive sibling — verify-don't-overwrite
  - apps/storefront/src/lib/auction/db.ts           # composed, not modified
  - apps/storefront/src/lib/auction/lifecycle.ts    # pure helpers — composed, not modified
  - apps/storefront/src/lib/escrow/**               # canonical helpers
  - apps/admin/**
  - apps/wholesale/**
  - packages/**
  - drizzle/**
  - docs/principles/**
related:
  - docs/connections/the-trust-fanout.md     # S37 — same fan-out shape, previous kingdom
  - docs/connections/the-market-mirror.md    # S35 — same fan-out shape, original
  - docs/connections/the-substrate-answers.md # S26 — math-mirror pattern origin
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-13T14:30:00Z"
---

# kingdom-074 — The auction fan-out

## What this is

Yu's directive 2026-05-13: *"Go for Auction state."* Third instance of the fan-out pattern (after S35 card-market and S37 trust-state). The auction module had 1177 lines of writers and zero aggregate composer; the interactive `/auctions/[id]` polled and gated everything on the bidder's session; nothing else could read an auction calmly, machine-readably, or federationally.

This kingdom ships the composer + three positions + manifest currency.

## What shipped

- **`apps/storefront/src/lib/auction/state.ts`** (~430 LOC) — the composer. `loadAuctionState(id)` composes the existing `getAuction(id)` (so the writer-side sweep runs first) and adds: bidder anonymisation, seller-tier-only resolution (no full trust query — the auction mirror points at `/u/[username]/trust` for the canonical view), Dutch live-computed price, reserve-met boolean (value hidden), and a propagation block (commission_rate / payout_hold_days / escrow_flow / estimated payout). Plus `auctionStateIsPublic(id)` (gates drafts + consignment-pending-review).
- **`apps/storefront/src/app/auctions/[id]/read/page.tsx`** — HTML calm-read. Server-rendered, no client JS, public no-auth. `<Provenance kind="live" />` at top + footer; `<WhyLink>` anchors; `<Audience kind="consumer" contexts={["auction", "public-read"]} />`; `<TrustTier>` primitive reused on seller / bidder / winner rows. Layout: image + seller + description on left; pricing + timing + propagation block + winner + bid history on right.
- **`apps/storefront/src/app/api/v1/auctions/[id]/route.ts`** — JSON sibling. Data-pantry envelope, `market_signal` freshness (60s), same gate.
- **`apps/storefront/src/app/api/v1/universal/auctions/[id]/route.ts`** — math-mirror. `@kind = auction_state`, `@encoding = cambridge-tcg/universal/v1`. Auction type encoded as ordinal (0=english/1=dutch/2=buy_now); status as ordinal (0=draft … 5=cancelled); prices as `_gbp` + `_to_starting_ratio` pairs; bidder identities as `bidder_anonymous_id` + `trust_tier_ordinal`; reserve value structurally absent; `auction_id_hash = sha256("auction:" + uuid)` for federation-stable reference.
- **`apps/storefront/src/lib/manifest.ts`** — three new resources under `market`: `storefront.auction_mirror`, `storefront.auction_json`, `storefront.auction_math`.
- **`docs/connections/the-auction-fanout.md`** — S39 story-as-wire connection-doc (~600 LOC).
- **`docs/connections/README.md`** — S39 row added.

## Five privacy gates threaded by the composer

1. **Reserve value** — hidden until `isReserveMet` returns true (boolean exposed; value never).
2. **Bidder identities** — always anonymised (last 6 chars of UUID + trust tier badge).
3. **Seller identity** — revealed only if `is_consignment AND users.is_public`; platform-owned auctions surface as "Cambridge TCG" with no trust tier.
4. **Drafts** — `auctionStateIsPublic` returns false for `status='draft'`.
5. **Consignment-pending-review** — returns false unless `approval_status='approved'`.

The composer threads all five. Each gate is documented in the docstring and named openly in the connection-doc.

## Key design choices in the math-mirror

- **Ordinals beside names** for both `auction_type` (0/1/2) and `status` (0–5) with `_note_opaque` flagging name strings as natural-language.
- **Prices as ratios to starting_price** alongside absolute GBP, so a federation client can reason about *how the auction has moved* without GBP conversion.
- **`auction_id_hash`** (sha256 of `"auction:" + uuid`) for federation-stable reference; raw uuid retained.
- **Time encoded twice** — ISO 8601 + Unix epoch on every timestamp.
- **`@content_hash` excludes `@retrieved_at`** — two retrievals of unchanged state produce identical hashes.

## Why `loadAuctionState` doesn't compose `loadUserTrustState` for the seller

A natural question. Answer: the auction mirror needs only `{ username, display_name, trust_tier, trust_score }` for the seller — six fields. Calling `loadUserTrustState` would run 6 DB round-trips per auction read. The mirror does a minimal `users LEFT JOIN trust_profiles` itself and *links* to `/u/[username]/trust` for the reader who wants to drill in.

**The composition perimeter principle**: a composer reads what it needs and points at the canonical surface for what's beyond.

## Acceptance

- `npx tsc --noEmit -p tsconfig.json` from `apps/storefront/` clean for all four new files (0 errors total across the storefront).
- HTML mirror renders public-no-auth; 404s on draft / pending-review / nonexistent.
- JSON sibling matches HTML mirror's data shape, wrapped in data-pantry envelope.
- Math-mirror produces stable `@content_hash` across retrievals when state unchanged.
- Three manifest entries visible at `/api/v1/manifest`.
- Verify-don't-overwrite: `/auctions/[id]` (interactive) and `lib/auction/db.ts` untouched.

## What this kingdom does NOT do

- **Does not refactor `/auctions/[id]`** to compose the new composer. Follow-on kingdom; gate condition: three new readers prove the shape first → done; migration when authorized.
- **Does not modify `lib/auction/db.ts`** (1177 LOC writer file). Composes `getAuction`, doesn't replace it.
- **Does not ship the auctions archive** (`/api/v1/auctions?status=ended&limit=N`). Named as recursion target.
- **Does not ship `/cards/[sku]/auctions`** (per-card auction history). Named.
- **Does not extend the ontology** to include `auction_state` NodeKind. Math-mirror's `_links.kind_definition` currently 404s; named gap.
- **Does not ship `/methodology/auctions`** — composer's WhyLinks point at the four existing methodology pages (commission-rate / payout-hold / escrow-tier / trust-score); a synthesis page is a recursion target.
- **Does not expose reserve value.** Structural gate. Recursion target: audit that mechanically asserts this.
- **Does not expose bidder identities.** Structural gate. Same.

## In-repo addendum

**The fan-out pattern is now established at three.** S35 (card-market) was once; S37 (trust state) was twice; S39 (this kingdom, auction state) is three times. Two readings was a coincidence; three is a pattern. The kingdom now *has* a multi-reading discipline — not just a goal.

**Verify-don't-overwrite explicit.** Sister claimed kingdom-070 (the-universal-language + the-play-structure), kingdom-072 (the-introduction). My slot was kingdom-074. S38 sister-claimed (the-play-structure); S39 mine.

**Operator action needed:** none. Pure read additions; no schema; no DB write; no cron; no email.

## Story-arc pairing

This kingdom is **story-as-wire**: the connection-doc [`the-auction-fanout.md`](../connections/the-auction-fanout.md) ships in the same commit as the code.

🐍❤️
