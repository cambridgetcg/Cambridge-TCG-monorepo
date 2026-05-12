# The trust fan-out — one composer, three positions, one substrate

> **Pull.** Yu's directive 2026-05-13 morning, after the deep-coupling-and-gap analysis named the trust state as the kingdom's highest-blast-radius public-read gap: *"extract the first composer"* → *"Ship whichever pulls you the most first but go for all."* The pull was straight to `/u/[username]/trust` — every P2P trade decision pivots on it, and before this kingdom it lived only on `/account/trust` private to its owner.
>
> **Form.** Story-as-wire. Ships one composer + three reading-position routes + one inline primitive + manifest currency. The composer is at [`apps/storefront/src/lib/trust/state.ts`](../../apps/storefront/src/lib/trust/state.ts); the three routes are at [`/u/[username]/trust`](../../apps/storefront/src/app/u/[username]/trust/page.tsx) (HTML calm-read), [`/api/v1/users/[username]/trust`](../../apps/storefront/src/app/api/v1/users/%5Busername%5D/trust/route.ts) (JSON sibling through the data-pantry envelope), and [`/api/v1/universal/users/[username]/trust`](../../apps/storefront/src/app/api/v1/universal/users/%5Busername%5D/trust/route.ts) (math-mirror with cryptographic content_hash). The primitive is [`<TrustTier>`](../../apps/storefront/src/lib/ui/TrustTier.tsx). **kingdom-071.**
>
> Sister to S35 [`the-market-mirror.md`](./the-market-mirror.md) (yesterday — one card across positions; this is one user's trust across positions), to S26 [`the-substrate-answers.md`](./the-substrate-answers.md) (the multi-reading pattern's origin), and to the deep-coupling analysis filed in the pillow book (the analytical scaffolding that named this as the next move).

---

## What this arc traces, in one sentence

The moment the kingdom — which had a 12-site duplicated `trust_profiles.trust_score` read pattern, no shared composer, no public mirror of the most-load-bearing economic input in the platform, and a downstream propagation chain (commission rate → escrow tier → payout hold → trade limits → inspection) that was invisible everywhere — earned a single typed `loadUserTrustState(userId)` composer plus three reading positions (HTML / JSON / math-mirror) that all consume it, plus an inline `<TrustTier>` primitive that the next ten surfaces will share.

---

## Cast

**The Composer.** [`apps/storefront/src/lib/trust/state.ts`](../../apps/storefront/src/lib/trust/state.ts). 500+ lines. Six composed sections + provenance envelope:

```
loadUserTrustState(userId) →
  ├─ basics       (username, display_name, is_public, member_since)
  ├─ current      (trust_score, seller_score, buyer_score, last_calculated_at)
  ├─ tier         (name, min_score, color, next_tier with points_away)
  ├─ stats        (counts + completion_rate / dispute_rate + financial bands)
  ├─ reviews      (avg + distribution + sub-rating averages, public-gated)
  ├─ trajectory   (delta_7d / delta_30d / delta_90d + 90d daily history)
  ├─ propagation  (the killer block — live downstream chain)
  ├─ flags        (is_flagged / is_suspended / suspended_until — no admin reasons)
  └─ _provenance  (sources listed, last_calculated_at quoted)
```

Plus two helpers: `userTrustStateIsPublic(userId)` (public-gate check) and `resolveUsername(username)` (URL → id resolution).

**The HTML mirror.** [`/u/[username]/trust`](../../apps/storefront/src/app/u/[username]/trust/page.tsx). Server-rendered, no client JS, screen-reader-friendly, public-no-auth, gated on `users.is_public`. Layout: header with `<TrustTier>` pill + JSON / math-mirror links · left column with trajectory sparkline + reviews distribution + sub-ratings · right two columns with trade-history stats + the propagation block + next-tier hint. Provenance pill at top and footer; WhyLink anchors on every section; Audience declared `kind="consumer"` with contexts `["trust", "user", "public-read"]`.

**The JSON sibling.** [`/api/v1/users/[username]/trust`](../../apps/storefront/src/app/api/v1/users/%5Busername%5D/trust/route.ts). Wraps the composer's output in the data-pantry envelope. Freshness key: `market_signal` (60s). Same `is_public` gate; same 404 behaviour as the HTML mirror (the JSON sibling must not leak what the HTML hides). `as_of` is `last_calculated_at` from the trust profile; `retrieved_at` is request time; sources list is the four read tables.

**The math-mirror.** [`/api/v1/universal/users/[username]/trust`](../../apps/storefront/src/app/api/v1/universal/users/%5Busername%5D/trust/route.ts). The federation-stable cryptographic form. `@kind` = `user_trust_state`; `@encoding` = `cambridge-tcg/universal/v1`. **Magnitudes encoded as ratios**: `score_ratio` = score/100, `commission_ratio` already 0..1, review distribution as fractions of total, sub-ratings as /5 ratios. **Tiers encoded as ordinals**: 0 (New) through 4 (Elite), with `tier_name` retained as opaque-flagged label. **Time encoded twice**: ISO 8601 + Unix epoch for every timestamp. **Username flagged opaque** (natural-language handle), with `user_id_hash` = sha256("user:" + uuid) as the federation-stable identifier. `@content_hash` stable across retrievals when state hasn't changed; `@self_hash` includes `@retrieved_at` so two retrievals at different moments differ. `_links` block points at the HTML mirror, JSON sibling, methodology pages, manifest, OpenAPI, ontology kind-definition anchor, and encoding spec.

**The `<TrustTier>` primitive.** [`apps/storefront/src/lib/ui/TrustTier.tsx`](../../apps/storefront/src/lib/ui/TrustTier.tsx). Single component the next surfaces share: tier name + (optional) score + (optional) next-tier hint, with the canonical color palette from `TRUST_TIERS`. Server-component-safe; carries `data-cambridge-trust-tier` and `data-cambridge-trust-score` attributes for the inclusion audit. Exported from `@/lib/ui`.

**The propagation block.** The single most novel surface this kingdom adds. The kingdom previously had `commissionRateForScore`, `getTrustTier`, `getPayoutHoldDays`, `getUserThresholds` as four separate helpers, each called from its own consumer site, with no page that read them *together* against one user's score. The propagation block reads all four against `current.trust_score` and renders the result as one panel: *"what this trust score currently produces"*. It is the answer to a question the kingdom always implicitly raised but never explicitly answered.

---

## Act 1 — The 12-site duplication this kingdom ends

Before this kingdom, the read pattern for trust was:

```
[page] → [own SELECT FROM trust_profiles] → [own getTrustTier call]
       → [own commissionRateForScore call] → [own getPayoutHoldDays call]
       → [render however the page felt like rendering]
```

This happened at twelve sites: `/account/trust`, `/account/standing`, `/cards/[sku]/market` tape rendering (yesterday's kingdom), `/account/trader` (kingdom-063), the various admin trust surfaces, the order-entry validation, the escrow router, the email cadence resolver, and so on. Each site re-derived; each site could disagree with its siblings under schema drift.

The composer takes that pattern and:

1. **Centralises the queries** — six DB section reads run in parallel via `Promise.all`, each isolated by `safe()`.
2. **Centralises the propagation** — `buildTierBand(score)` and `buildPropagation(score)` are in-code pure functions that compose the existing helpers without re-implementing them.
3. **Surfaces the provenance** — `_provenance.sources` lists all eight contributors (four DB tables + four lib modules) so a future reader knows exactly what fed the result.
4. **Names the privacy contract** — `loadUserTrustState` doesn't enforce `is_public`; the caller chooses. This is the same pattern `lib/social/db.ts:getPublicProfile` follows: gating is the caller's responsibility, not the composer's.

**Refactoring the 12 existing sites is a follow-on kingdom**, not in this commit. The composer ships first; migration to it ships next; the gate condition is *the composer must prove itself across three new readers before existing readers migrate*. That's what the three new positions (HTML, JSON, math-mirror) accomplish — they exercise the composer's shape under three different rendering pressures.

---

## Act 2 — Why the propagation block is the single most novel surface

The kingdom's economic decisions about a user form a chain:

```
trust_profiles.trust_score
  │
  ├──→ commissionRateForScore(score)   →  market_trades.commission_rate
  │
  ├──→ routeTrade({ sellerScore, … })  →  market_trades.escrow_tier
  │
  ├──→ getPayoutHoldDays(score)        →  market_trades.payout_hold_days
  │
  ├──→ getUserThresholds(score)        →  per-trade direct/verified bands
  │
  ├──→ TRUST_TIERS[tier].tradeLimit    →  order entry validation
  │
  └──→ TRUST_TIERS[tier].dailyLimit    →  24h commitment cap
```

Five computed effects from one input. **Before this kingdom, no page showed the whole chain against one user's actual score.** `/methodology/trust-score` explained the score formula. `/methodology/commission-rate` was a stub. `/methodology/payout-hold` existed but generically. `/account/standing` mentioned tiers but didn't quote the user's own current commission rate or daily limit. The reader had to assemble the chain in their head from four pages.

The propagation block renders all six values against the user's actual score in one panel. Each row has its own WhyLink to the relevant methodology page. The block names what the kingdom *would currently do* to a trade by this user — without the user needing to read four methodology pages and apply the formulas themselves.

**This is the transparency doctrine's deepest reach**: not just *explain the formula* but *show the live result of applying it to this specific subject*. Ring 2 transparency, made unavoidable.

---

## Act 3 — The math-mirror's design choices

Three deliberate calls that may not be obvious from the code:

### 1. user_id_hash, not user_id

The math-mirror exposes `user_id_hash = sha256("user:" + uuid)` instead of the raw UUID. Reasoning:

- **The raw UUID is platform-internal.** A federation client receiving the raw UUID has nothing to do with it; it's not a join key into any sister system.
- **The hash is stable.** Two retrievals of the same user produce the same hash, so federation clients can correlate without learning the platform's identifier.
- **The username is also exposed**, but flagged opaque — `username` is natural-language, can be changed; `user_id_hash` is stable.
- A future cross-platform federation could publish the same hash from a sister kingdom under a different username; the hash bridges them.

### 2. Ordinals beside names

Every tier is encoded as both `tier_name: "Trusted"` and `tier_ordinal: 2`. A federation-aware decoder reads the ordinal (universal ordering: 0=New, 4=Elite); a human-aware decoder reads the name. The `_note_opaque` field tells decoders not to ground meaning on the name alone.

### 3. The propagation block carries methodology URLs inside the data

```json
"_links": {
  "methodology_propagation": {
    "commission_rate": "/methodology/commission-rate",
    "escrow_tier": "/methodology/escrow-tier",
    "payout_hold": "/methodology/payout-hold"
  }
}
```

This means a federation client receiving the math-mirror can fetch *the rules that produced these numbers*, not just the numbers themselves. Substrate-honesty extends to the federation surface: the kingdom doesn't just publish the result, it publishes a pointer to the rule.

---

## Act 4 — What the public mirror lets the kingdom finally do

Before this kingdom:

> *"Is this seller trustworthy enough to bid £200 on their card?"*

The asker could see the seller's score on `/u/[username]` (one number, no context). The trajectory was invisible. The reviews distribution was invisible. The actual commission they'd pay was invisible. The escrow band that would gate the trade was invisible. The completion rate was invisible.

After:

> The asker opens `/u/[username]/trust`. Sees: Trusted (62, ↗ +4 last 30 days). 24 trades total, 23 completed, 1 cancelled, 0 disputed. 4.8 avg across 18 reviews, distribution skews 5-star. Commission they'd pay this seller: 7%. Their payout hold: 3 days. Their direct-escrow band: £150 — so a £200 trade routes verified, with photos required.

Same data, surfaced. The asker can decide on facts instead of vibes.

For an agent acting on behalf of an asker, the JSON sibling produces the same shape machine-readably. For a federation client comparing across kingdoms, the math-mirror produces a stable hash.

---

## Act 5 — Wires (file:line citation table)

| Concept | File:line | Role |
|---|---|---|
| The composer | [`apps/storefront/src/lib/trust/state.ts`](../../apps/storefront/src/lib/trust/state.ts) | Single source of truth for trust-state composition |
| The HTML mirror | [`apps/storefront/src/app/u/[username]/trust/page.tsx`](../../apps/storefront/src/app/u/[username]/trust/page.tsx) | Server-rendered, public, no client JS |
| The JSON sibling | [`apps/storefront/src/app/api/v1/users/[username]/trust/route.ts`](../../apps/storefront/src/app/api/v1/users/%5Busername%5D/trust/route.ts) | Data-pantry envelope, freshness market_signal |
| The math-mirror | [`apps/storefront/src/app/api/v1/universal/users/[username]/trust/route.ts`](../../apps/storefront/src/app/api/v1/universal/users/%5Busername%5D/trust/route.ts) | Cryptographic content_hash, ratios, ordinals, opaque flags |
| The `<TrustTier>` primitive | [`apps/storefront/src/lib/ui/TrustTier.tsx`](../../apps/storefront/src/lib/ui/TrustTier.tsx) | Inline pill — name + score + next-tier hint |
| UI export | [`apps/storefront/src/lib/ui/index.ts`](../../apps/storefront/src/lib/ui/index.ts) `:35` | TrustTier added to the primitive library |
| Manifest entries | [`apps/storefront/src/lib/manifest.ts`](../../apps/storefront/src/lib/manifest.ts) | Three new resources registered under `market` |
| TRUST_TIERS canonical | [`apps/storefront/src/lib/escrow/types.ts`](../../apps/storefront/src/lib/escrow/types.ts) `:101` | The 5-tier band table — colors, limits, payout-hold-days |
| `getTrustTier` | [`apps/storefront/src/lib/escrow/trust-engine.ts`](../../apps/storefront/src/lib/escrow/trust-engine.ts) `:309` | Score → tier band; the composer routes through this |
| `getPayoutHoldDays` | same file `:304` | Tier → payout hold days |
| `getUserThresholds` | [`apps/storefront/src/lib/escrow/service-tiers.ts`](../../apps/storefront/src/lib/escrow/service-tiers.ts) `:240` | Score → escrow bands |
| `commissionRateForScore` | [`apps/storefront/src/lib/market/types.ts`](../../apps/storefront/src/lib/market/types.ts) `:126` | Score → commission rate |

---

## Sister connections

- **S35 [`the-market-mirror.md`](./the-market-mirror.md)** — yesterday's kingdom (kingdom-067). Same pattern, different entity: one *card* across three positions (HTML calm-read + interactive + math-mirror). This kingdom is one *user*'s trust across three positions. The proportion holds: the smaller the wire, the larger the meaning.
- **S26 [`the-substrate-answers.md`](./the-substrate-answers.md)** — the multi-reading pattern's origin. The math-mirror at `/api/v1/universal/users/[username]/trust` is the third instance of the universal-rep encoding applied to a new entity kind.
- **S29 [`the-self-recursion.md`](./the-self-recursion.md)** — `_links.kind_definition` pattern reused here, pointing at the ontology's user-trust-state node (which doesn't exist yet — recursion target: extend sister's `lib/ontology.ts` to include user-trust-state as a NodeKind).
- **The deep-coupling analysis** filed in the previous pillow-book turn — the analytical scaffolding that named this kingdom's substrate-extraction-then-fan-out as the right next move. *The doc didn't ship in this commit; the analysis-as-pillow-entry ships its own conclusion.*
- **The 12 existing read sites** that *will* migrate in a follow-on kingdom: `/account/trust`, `/account/standing`, `/cards/[sku]/market` tape, `/account/trader`, admin trust surfaces, escrow router, order-entry validator, email cadence resolver. None refactored here; the composer ships first, migration follows when the shape proves itself.

---

## Recursion targets

The fan-out is v1. Named openly:

1. **Refactor the 12 existing direct-`trust_profiles`-query sites** to compose `loadUserTrustState`. Highest-leverage cleanup; closes the duplication this kingdom names but doesn't yet remove.
2. **MCP per-user `/api/mcp/account/trust`** — the agent-side sibling for a user's own agent. Same composer, no public gate, returns the full state for the authenticated user.
3. **Extend `lib/ontology.ts`** (sister's kingdom-055) to include `user_trust_state` as a typed NodeKind. The math-mirror's `_links.kind_definition` currently points at `/api/v1/ontology#node-user-trust-state` which 404s — substrate-honest gap.
4. **`/methodology/trust-state`** — a methodology page that documents the full composition (which sub-formulas combine into the propagation block). Currently the page links to four separate methodology pages; a single methodology-of-the-composer would tie them.
5. **Federation reverse-resolver for trust hashes** at `/api/v1/federation/identify/[hash]`. The math-mirror's `@content_hash` is currently a publication-only identifier; a future kingdom could let a foreign caller resolve the hash back to a username.
6. **`/u/[username]/trust/history`** — a deeper trajectory view showing every individual `trust_score_history` row with associated trade IDs that drove changes. Composer extension target.
7. **`audit:siblings` check** that, for each top-coupled entity, verifies the composer + HTML + JSON + math-mirror tuple exists. Trust is the first entity to have all four; the audit would name which other entities lack it.
8. **The reviews-detail page** — current page shows distribution + sub-rating averages; a future revision could show individual reviews (gated on per-review `is_public`).
9. **Cross-platform reputation in propagation** — `external_reputation` exists as a separate table. A future revision could surface "verified eBay rep: 4.8 across 247 sales" inline in this surface.
10. **The fairy-tale companion** — same form as S6/S21: the trust profile walked through the eyes of the Reader-who-considers-trading. Companion entry in the fairy-tale flavour.

The composer is small. The fan-out is the act of letting it serve every audience at once. *Every reader sees the same trust state through the same composer; the kingdom can't disagree with itself about what a user's trust currently means.*

---

## A note on the form

This is the second time in two days the kingdom shipped a three-position fan-out from a single composer (after S35's market mirror). Naming the pattern explicitly:

```
ENTITY → COMPOSER → { HTML calm-read, JSON sibling, math-mirror }
```

Each fan-out:
- Introduces one composer (lib/<entity>/state.ts or analog)
- Ships three reading positions consuming that composer
- Adds three manifest entries (one per modality)
- Writes one connection-doc naming the fan-out
- Files one mission card
- Leaves a clear refactor target ("the N existing sites that should compose this")

Future fan-outs probably want this shape: **Auction state, Lot state, Card market state (already partial)**. The deep-coupling analysis named these as the next three to extract.

---

## Coda

The counterparty who opens `/u/[username]/trust` tomorrow before bidding will not know that this surface didn't exist yesterday. They'll glance at the propagation block, see the commission they'd pay and the escrow band that gates the trade, and bid with their eyes open. **That is the correct outcome.** The fan-out's success is its invisibility — the surface that becomes the obvious place to look, the page open in a background tab, the answer to *can I trade with this person?* asked before risk is committed.

One composer. Three positions. Six sections × one envelope. The kingdom can't disagree with itself about what a user's trust currently produces, because every reader composes through the same function.

The fan-out is small. The fan-out is whole. The fan-out is held coherent by the discipline of *one composer per entity, every reader compose through it, never duplicate the query at the page layer*.

🐍❤️

*— Sophia (Opus 4.7, 1M context), 2026-05-13.*

---

### Type-signature

- **kind**: connection-doc, story-as-wire
- **kingdom**: kingdom-071
- **doctrines**: substrate honesty, transparency, meaning, creation (all four)
- **audience**: developer, builder, future-Sophia, counterparty, agent, federation client, screen-reader user
- **freshness**: as of 2026-05-13; substrate referenced is live in the current schema
- **self-citation**: appears in [`docs/connections/README.md`](./README.md) as S37
