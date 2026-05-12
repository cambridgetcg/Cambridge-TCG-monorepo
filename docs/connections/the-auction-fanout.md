# The auction fan-out — the kingdom's most-shareable entity finally readable

> **Pull.** Yu's directive 2026-05-13, after the trust fan-out: *"Go for Auction state."* The auction module's `lib/auction/db.ts` is 1177 lines of writers and 22 exported functions with no composer — every caller assembles "this auction's state" from individual queries. The interactive `/auctions/[id]` is a `"use client"` polling component; nothing else can read an auction calmly, machine-readably, or federationally.
>
> **Form.** Story-as-wire. Ships one composer + three reading-position routes + manifest currency. The composer is at [`apps/storefront/src/lib/auction/state.ts`](../../apps/storefront/src/lib/auction/state.ts); the three routes are at [`/auctions/[id]/read`](../../apps/storefront/src/app/auctions/%5Bid%5D/read/page.tsx) (HTML calm-read), [`/api/v1/auctions/[id]`](../../apps/storefront/src/app/api/v1/auctions/%5Bid%5D/route.ts) (JSON sibling through the data-pantry envelope), and [`/api/v1/universal/auctions/[id]`](../../apps/storefront/src/app/api/v1/universal/auctions/%5Bid%5D/route.ts) (math-mirror with cryptographic content_hash). **kingdom-074.**
>
> Sister to S37 [`the-trust-fanout.md`](./the-trust-fanout.md) (yesterday's fan-out — one user's trust across positions; this is one auction across positions; same shape), S35 [`the-market-mirror.md`](./the-market-mirror.md) (one card across positions, the original two-reading instance), and S26 [`the-substrate-answers.md`](./the-substrate-answers.md) (the math-mirror pattern's origin).

---

## What this arc traces, in one sentence

The moment the kingdom — whose interactive `/auctions/[id]` polled every two seconds, gated everything on the bidder's session, hid all data from search engines and screen readers and agents and federation clients alike — earned a single typed `loadAuctionState(id)` composer plus three reading positions (HTML / JSON / math-mirror) that all consume it, with bidder identities anonymised behind opaque ids + trust tier badges, the reserve value structurally hidden when not met, and a propagation block that finally names what the auction's current price produces for the seller's economics.

---

## Cast

**The Composer.** [`apps/storefront/src/lib/auction/state.ts`](../../apps/storefront/src/lib/auction/state.ts). 400+ lines. Composes `getAuction(id)` (which already returns auction + images + last-50 bids inline) rather than duplicating its SQL — substrate-honest about shared composition. Adds three things `getAuction` doesn't:

```
loadAuctionState(id) →
  ├─ meta            (id, title, description, type, status, consignment flag, approval status)
  ├─ images          (display-order array from the join)
  ├─ pricing         (starting / current / increment / buy_now / dutch params + live computed)
  ├─ timing          (starts/ends + time_remaining + has_started/has_ended)
  ├─ reserve         (boolean met/not-met — VALUE never exposed publicly)
  ├─ bids            (anonymised — opaque ids + trust tier badges only)
  ├─ winner          (when ended — anonymised + paid-at)
  ├─ seller          (username + trust tier when public; "Cambridge TCG" when platform)
  ├─ propagation     (commission / payout-hold / escrow flow / estimated payout)
  └─ _provenance     (sources listed, queried_at)
```

Plus `auctionStateIsPublic(id)` — the gate helper. Public iff auction exists AND status isn't draft AND (not consignment OR approval_status === 'approved').

**The HTML mirror.** [`/auctions/[id]/read`](../../apps/storefront/src/app/auctions/%5Bid%5D/read/page.tsx). Server-rendered, no client JS, public no-auth. Layout: header with `<StatusBadge>` pill + interactive-page link + JSON / math links · left column with primary image + thumbnails + seller (with `<TrustTier>` and link to `/u/[username]/trust`) + description · right two columns with pricing + timing + propagation block + winner (when ended) + bid history table. Provenance pill at top and footer; WhyLink anchors on every section; Audience declared `kind="consumer"` with contexts `["auction", "public-read"]`.

**The JSON sibling.** [`/api/v1/auctions/[id]`](../../apps/storefront/src/app/api/v1/auctions/%5Bid%5D/route.ts). Wraps the composer's output in the data-pantry envelope. Freshness `market_signal` (60s) — auctions update on each bid. Same `auctionStateIsPublic` gate; same 404 behaviour as the HTML mirror.

**The math-mirror.** [`/api/v1/universal/auctions/[id]`](../../apps/storefront/src/app/api/v1/universal/auctions/%5Bid%5D/route.ts). The federation-stable cryptographic form. `@kind = auction_state`, `@encoding = cambridge-tcg/universal/v1`. Key design choices:

- **Auction type encoded as ordinal** (0=english, 1=dutch, 2=buy_now) alongside name with `_note_opaque` flag.
- **Status encoded as ordinal** (0=draft … 5=cancelled) alongside name.
- **Prices encoded as both absolute GBP magnitudes AND ratios to `starting_price`**: every price comes with `_gbp` (the magnitude) AND `_to_starting_ratio` (the universal-comparable). A federation client receiving a Dutch auction with `end_to_start_ratio: 0.5` knows the price floor is half the start without converting GBP.
- **Auction id encoded as both raw + hash**: `auction_id_hash = sha256("auction:" + uuid)` for federation-stable reference; raw uuid retained for in-platform use.
- **Bidder identities collapsed to `bidder_anonymous_id` + `trust_tier_ordinal`**.
- **Reserve value structurally absent** — only `reserve_met: true|false|null` survives the math-mirror; substrate-honest about seller privacy.
- **Time encoded twice** — ISO 8601 + Unix epoch on every timestamp.
- **`_links` block**: html_mirror, json_sibling, interactive page, methodology_propagation map, manifest, openapi, ontology kind_definition anchor, encoding spec.

**The reserve-privacy discipline.** The reserve price exists in the database but the composer never exposes its value — only the boolean `reserve_met` (or `null` when no reserve set). Sellers retain price-discovery privacy until their reserve is hit. This is the SAME discipline `getPublicProfile` uses for `users.is_public`: gate at the composer layer, not at every caller. *The substrate has the fact; the mirror declines to expose it.*

**The propagation block.** What the auction's current price *currently produces* in the kingdom's economics:

```
current_price × (1 - commission_rate)  →  estimated_seller_payout
current_price × commission_rate        →  estimated_commission
                                          payout_hold_days = 3 (flat per /methodology/payout-hold)
                                          escrow_flow = "ctcg_mediated" (auctions always)
```

The block names what the seller would receive if the auction settled at the current price, and what the platform would collect. *The kingdom's substrate has had `seller_commission_rate` per row since the consignment migration, but no page surfaced the implied payout against the current bid until now.*

---

## Act 1 — Why this fan-out is bigger than the others

The auction module's blast radius is broader than the trust state or the market mirror, for three reasons:

### Auctions are the most-shareable entity

A card has many auctions over time; a user has one trust profile. **Auctions are the artifact that gets linked to.** A Discord channel saying "Charizard ex auction ends Sunday at £200" wants to share a page. Before this kingdom that page was `/auctions/[id]` — a client-rendered polling shell that generated barely-useful link previews. The calm-read mirror finally produces a meaningful Open Graph card (the title, the current price, the time remaining, the image) without the recipient needing to authenticate.

### Auctions are the kingdom's most economically-charged read

The trader-dashboard tells me about myself. The card-market tells me about supply and demand. The trust profile tells me about a counterparty. **The auction page tells me what's about to happen in fifteen minutes** — a decision under time pressure. Substrate-honesty about *what the platform is about to do* (commission, payout hold, escrow flow) is most load-bearing exactly here. The propagation block answers *"if I win this at £200, what do I owe?"* and *"if I sell this at £200, what do I receive?"* — questions the current interactive page never explicitly answers.

### Auctions are the entity with the most layered privacy

Trust state has one gate (`is_public`). The market mirror has two (per-listing visibility + per-trade anonymisation). **Auctions have five:**
- Reserve value (hidden until met)
- Bidder identities (always anonymised)
- Seller identity (revealed only if `is_consignment` AND `users.is_public`)
- Draft auctions (entirely hidden)
- Consignment-pending-review auctions (hidden until approved)

The composer threads all five gates. Each gate is named in the docstring. A future audit can verify each gate by composing test fixtures and asserting the right shapes return.

---

## Act 2 — The Dutch-auction edge case, named

Dutch auctions drop in price over time. The kingdom's substrate stores `current_price` (updated by a cron) and `dutch_start_price` / `dutch_end_price` / `dutch_price_drop` / `dutch_drop_interval_seconds`. The pure helper `getCurrentDutchPrice(auction)` computes the live price from elapsed time since `starts_at`.

The composer renders **both**:

```
pricing.current_price         — what the database currently says
pricing.dutch_computed_price  — what the live computation says
```

These can disagree if the cron hasn't fired in the last interval — the live value will be lower than the database value. The mirror surfaces both so a reader can see *the drift between the daemon's snapshot and the live formula*. Substrate-honest about the kingdom's eventual consistency.

The math-mirror encodes `end_to_start_ratio` so a federation client can reason about *how much price the Dutch auction has been authorised to drop* without GBP conversion. A 0.5 ratio means the floor is half the start; a 0.9 ratio means the auction is only authorised to drop 10% — different objects with different psychologies.

---

## Act 3 — Why we don't compose `loadUserTrustState` for the seller

A natural question: when the auction's seller is a public user with a trust profile, why not call `loadUserTrustState(seller_id)` and embed the full shape?

Because:
- The auction state needs only `{ username, display_name, trust_tier, trust_score }` — six fields out of 60+.
- `loadUserTrustState` runs six DB queries (basics + profile + reviews + trajectory) — we'd add 6 round-trips to every auction read.
- The seller's full trust state has its own canonical reading position at `/u/[username]/trust`; the auction mirror just *links* there.

So the composer does the minimal join itself — one query against `users LEFT JOIN trust_profiles ON user_id`. The auction mirror's seller block renders `<TrustTier>` (the inline primitive) and a link to the seller's full trust mirror for the reader who wants to drill in.

This is the **composition perimeter principle**: a composer reads what it needs and points at the canonical surface for what's beyond. *Don't bring the whole graph into every node — name where the whole graph lives.*

---

## Act 4 — Wires (file:line citation table)

| Concept | File:line | Role |
|---|---|---|
| The composer | [`apps/storefront/src/lib/auction/state.ts`](../../apps/storefront/src/lib/auction/state.ts) | Single source of truth for auction-state composition |
| The HTML mirror | [`apps/storefront/src/app/auctions/[id]/read/page.tsx`](../../apps/storefront/src/app/auctions/%5Bid%5D/read/page.tsx) | Server-rendered, no client JS, public, gated |
| The JSON sibling | [`apps/storefront/src/app/api/v1/auctions/[id]/route.ts`](../../apps/storefront/src/app/api/v1/auctions/%5Bid%5D/route.ts) | Data-pantry envelope, `market_signal` freshness |
| The math-mirror | [`apps/storefront/src/app/api/v1/universal/auctions/[id]/route.ts`](../../apps/storefront/src/app/api/v1/universal/auctions/%5Bid%5D/route.ts) | Cryptographic `@content_hash`, ratios, ordinals, opaque flags |
| The interactive sibling | [`apps/storefront/src/app/auctions/[id]/page.tsx`](../../apps/storefront/src/app/auctions/%5Bid%5D/page.tsx) | Preserved untouched; verify-don't-overwrite observed |
| The composed writer | [`apps/storefront/src/lib/auction/db.ts`](../../apps/storefront/src/lib/auction/db.ts) `:86` (`getAuction`) | `loadAuctionState` composes this; doesn't duplicate |
| Lifecycle helpers | [`apps/storefront/src/lib/auction/lifecycle.ts`](../../apps/storefront/src/lib/auction/lifecycle.ts) | Pure functions composed for Dutch / reserve / remaining-time |
| Manifest entries | [`apps/storefront/src/lib/manifest.ts`](../../apps/storefront/src/lib/manifest.ts) | Three new resources under `market` |
| TRUST_TIERS canonical | [`apps/storefront/src/lib/escrow/types.ts`](../../apps/storefront/src/lib/escrow/types.ts) `:101` | Bidder + seller tier resolution |
| `<TrustTier>` primitive | [`apps/storefront/src/lib/ui/TrustTier.tsx`](../../apps/storefront/src/lib/ui/TrustTier.tsx) | Reused on seller + bidder + winner rows |
| `getTrustTier` | [`apps/storefront/src/lib/escrow/trust-engine.ts`](../../apps/storefront/src/lib/escrow/trust-engine.ts) `:309` | Score → tier name resolution |

---

## Sister connections

- **S37 [`the-trust-fanout.md`](./the-trust-fanout.md)** — the trust state fan-out (yesterday's kingdom). This entry reuses the `<TrustTier>` primitive on every counterparty surface (seller, bidder, winner). The two kingdoms compose: an auction's seller-trust-tier badge links to that seller's full trust mirror.
- **S35 [`the-market-mirror.md`](./the-market-mirror.md)** — the market-mirror was the first instance of the fan-out pattern; the trust-mirror was the second; the auction-mirror is the third. *The pattern has now run three times; the principle is no longer just claimed, it's repeated.*
- **S26 [`the-substrate-answers.md`](./the-substrate-answers.md)** — the math-mirror pattern's origin. The auction math-mirror is the fourth entity-kind to gain a universal-rep form (after Card / Set / Game / User-trust).
- **The interactive `/auctions/[id]`** — preserved untouched. Verify-don't-overwrite observed. A future revision could add a small "calm read" link in the interactive page's footer pointing at `/auctions/[id]/read` for screen-reader users and archivists.

---

## Recursion targets

The fan-out is v1. Named openly:

1. **Refactor the existing `/auctions/[id]` interactive page** to compose `loadAuctionState` instead of polling `/api/auctions/[id]` with its own assembly. The composer's shape is now stable; the interactive page can derive its render from the same source and add form state on top. *Gate condition: same as the trust fan-out — composer first, three readers prove the shape, then the interactive page migrates.*
2. **`/auctions` archive endpoint** at `/api/v1/auctions?status=ended&limit=N` — list completed auctions for archivists and price-discovery readers. Compose `listAuctions` from `lib/auction/db.ts`.
3. **`/cards/[sku]/auctions`** — per-card auction history. Cross-composes the card-market mirror with the auction archive. Strong price-discovery value for collectors.
4. **MCP per-user `/api/mcp/account/auctions`** — the agent-side sibling for a user's own agent acting as bidder or seller.
5. **Extend `lib/ontology.ts`** to include `auction_state` as a typed NodeKind. The math-mirror's `_links.kind_definition` currently points at `/api/v1/ontology#node-auction-state` which 404s.
6. **`/methodology/auctions`** — a methodology page that ties commission-rate + payout-hold + escrow-tier to the auction-specific defaults. The current methodology corpus has those three separately; one auction-specific synthesis would help.
7. **Reserve-discovery audit** — assert that the composer never exposes `reserve_price` when `isReserveMet` returns false. Composition-time discipline made mechanical.
8. **Bidder-anonymity audit** — assert that no bid row includes the raw `user_id` in any reading position. Same discipline.
9. **`/auctions/[id]/timeline`** — a deeper lifecycle view showing the auction's full state-machine progression (draft → scheduled → live → ended → paid → fulfilled). Composes `auction_lifecycle_log` (the Scribe's bookshelf entry that already exists).
10. **Federation reverse-resolver for auction hashes** at `/api/v1/federation/identify/[hash]`. The math-mirror's `@content_hash` is currently a publication-only identifier; future kingdom could let a foreign caller resolve back.
11. **`<AuctionStatusBadge>` primitive promotion**. The inline `StatusBadge` in the HTML mirror could move into `lib/ui/AuctionStatusBadge.tsx` once a second surface needs it. *Don't extract before second user.*
12. **The fairy-tale companion** — the auction walked through the eyes of *the Cryer* (the personification of the auction itself). Same form as S3/S6/S21.

The composer is small. The fan-out is the act of letting it serve every audience at once.

---

## The fan-out pattern, now established at three

Two readings was a coincidence (S35 + S37). Three readings is a pattern:

```
ENTITY → COMPOSER → { HTML calm-read, JSON sibling, math-mirror } + shared primitives
   ↓
S35  Card / market           → loadCardMarket          → /cards/[sku]/market + ...
S37  User / trust state      → loadUserTrustState      → /u/[username]/trust + ...
S39  Auction / state         → loadAuctionState        → /auctions/[id]/read + ...
```

The kingdom now has the discipline three times over. Each new entity-kind that gains a fan-out adds:
- ~300-500 LOC of composer
- ~100-200 LOC of HTML mirror
- ~50 LOC of JSON sibling
- ~200 LOC of math-mirror
- 3 manifest entries
- 1 connection-doc

Roughly 1100 LOC + paperwork per fan-out. Reproducible. Predictable. Each fan-out exercises the discipline more, strengthening the pattern. The kingdom *has* a multi-reading discipline now — not just a goal.

**Next candidates** (each blocked on a composer extraction; ordered by leverage):
- Lot state (auction's sibling — bundle listings)
- Trade state (per-trade composer that the lifecycle-log composer doesn't quite cover)
- Card market state refactor (refactor `lib/market/card-market.ts` to compose `getCardOrderBook` rather than duplicate it — the substrate-honest gap S35 named)

---

## Coda

The Discord-channel announcement of an auction ending Sunday now produces a link preview that says what the auction is, what its current price is, and how much time remains — without the recipient signing in. The screen-reader user opening the same link hears the title, the current state, the time remaining, the seller's trust tier, the bid history with tier badges, and the propagation block — without fighting a polling client. The agent ingesting the page parses a stable JSON shape with a content_hash that doesn't change across two retrievals of an unchanged auction. The federation client compares this auction's `auction_id_hash` against another platform's record of the same physical sale.

**The auction is the kingdom's most-shareable entity, and tonight it is finally shareable to every audience that wanted to receive it.**

The pattern is small. The pattern is whole. The pattern repeats — and that is the point: a kingdom that has named its multi-reading discipline three times can be trusted to name it the fourth time, and the fifth, until every entity-kind in the platform has its fan-out and every audience that wanted to read can read.

🐍❤️

*— Sophia (Opus 4.7, 1M context), 2026-05-13.*

---

### Type-signature

- **kind**: connection-doc, story-as-wire
- **kingdom**: kingdom-074
- **doctrines**: substrate honesty, transparency, meaning, creation (all four)
- **audience**: developer, builder, future-Sophia, bidder, seller, archivist, agent, federation client, screen-reader user
- **freshness**: as of 2026-05-13; substrate referenced is live in the current schema
- **self-citation**: appears in [`docs/connections/README.md`](./README.md) as S39
