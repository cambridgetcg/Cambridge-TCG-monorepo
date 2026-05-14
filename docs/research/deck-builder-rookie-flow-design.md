# Deck-builder rookie flow — concrete design proposal

> **Pull.** Yu, 2026-05-14: *"TAILOR THE CARD PICKING PROCESS FOR PLAYERS!!!! PUT YOURSELF IN THEIR SHOES!"*
>
> **Form.** Design proposal — applies the patterns from [`deck-builder-ux-survey.md`](./deck-builder-ux-survey.md) and the deck catalog from [`optcg-prebuilt-starter-catalog.md`](./optcg-prebuilt-starter-catalog.md) to a concrete redesign of our deck-building surface. This is a *proposal*, not a ship — concrete enough that the next kingdom can implement it without re-deriving the choices, vague enough that the implementor still owns the interaction details.
>
> Lives alongside the other research docs at `docs/research/`. When the next kingdom ships any part of this, the connection-doc it spawns at `docs/connections/` will reference this design as the wire-half.
>
> **Boundary.** No prices in the design. No commerce nudges. The deck-builder is a play surface ([`docs/principles/cosmology.md`](../principles/cosmology.md) §game-economy). Yu's emphatic 2026-05-14 directives — *"PURELY FOR FUN!!!! MINIMUM BARRIERS, MAXIMUM FUNNNNNN!!!!"* — are doctrine.

---

## What this artifact is

A concrete proposal for the deck-builder + play-entry surface, designed against the four player journeys from the [survey doc §3](./deck-builder-ux-survey.md#section-3--putting-myself-in-their-shoes--four-player-journeys):

- **Player A — Total beginner** (60 seconds to first match, zero choices)
- **Player B — Lapsed player** (3 minutes to first match, one choice — color)
- **Player C — Paper-OPTCG veteran** (paste-and-play their existing list)
- **Player D — Agent operator** (programmatic deck-load via API)

The same backend serves all four. The *entry surface* differs. This is the architecture this proposal targets.

---

## Section 1 — The four-tier surface map

| Tier | Audience | Surface | Time-to-match | Choices made |
|------|----------|---------|---------------|--------------|
| **1 — Quickstart** | Player A | `/play` (default) | ~10 seconds | 1 click |
| **2 — Pick-a-starter** | Player B | `/play/starters` (new) | ~30 seconds | 1 color + 1 confirm |
| **3 — Guided build** | Mid-engagement | `/deck-builder?guided=1` (new flag) | ~5 minutes | 5-10 choices within a recipe |
| **4 — Free build** | Player C | `/deck-builder` (existing) | unbounded | unlimited |
| **API** | Player D | `/api/decks/*` (existing + minor extensions) | programmatic | n/a |

Each tier composes downward: a player can drop from tier-1 to tier-2 by saying "actually let me pick the color," from tier-2 to tier-3 by saying "let me tune the deck," from tier-3 to tier-4 by saying "let me free-build from scratch." **Never upward** — a tier-4 user doesn't get demoted to tier-1.

### Tier-1 — Quickstart (Player A's path)

**Surface.** The existing `/play` page, slightly modified.

**Current state** (live as of 2026-05-14): the page shows YOUR DECK / NEXT OPPONENT / Play button. If the user has no decks, they're routed to the deck-builder with a "no decks yet" empty state. This is the failure surface — Player A bounces here.

**Proposed state.** When `signedIn=false` AND no `pve_progress` cookie:
1. Auto-mount **ST-15 Edward Newgate** (or rotate weekly between ST-15 through ST-20 to teach color variety).
2. Show the SAME page Player A would see if they had a deck — Deck panel + Opponent panel + Play.
3. Add a small bottom-of-page link: *"Want a different starter? See all 6 colors →"* (links to tier-2).

**Result.** Player A lands on `/play`. Sees: ST-15 deck loaded, Level 1 opponent, big Play button. Clicks Play. **They're in a match.** No deck-builder, no leader picker, no card list, no friction.

**One-paragraph framing on the page** (rookie tone):
> *"You've got the Whitebeard deck. Big characters, big attacks. Press Play to face Alvida and start your adventure."*

The starter is in `lib/play/starter-decks.ts` (catalog at [`optcg-prebuilt-starter-catalog.md` §5](./optcg-prebuilt-starter-catalog.md#section-5--data-shape--what-the-deck-builder-needs-to-know)).

### Tier-2 — Pick-a-starter (Player B's path)

**Surface.** New page at `/play/starters` (sister to existing `/play/casual`, `/play/compete`, `/play/adventure`).

**Layout.**

```
┌─────────────────────────────────────────────────────────┐
│  Pick your first deck                                    │
│  Each color plays differently. Pick one that sounds fun. │
├──────────┬──────────┬──────────┬──────────┬──────────┬──┤
│  ┌────┐  │  ┌────┐  │  ┌────┐  │  ┌────┐  │  ┌────┐  │  │
│  │ R  │  │  │ G  │  │  │ B  │  │  │ P  │  │  │ Bk │  │  │  ← 6 color tiles
│  │ █  │  │  │ █  │  │  │ █  │  │  │ █  │  │  │ █  │  │  │
│  └────┘  │  └────┘  │  └────┘  │  └────┘  │  └────┘  │  │
│  Red     │  Green   │  Blue    │  Purple  │  Black   │ Y│
│  Whitbd  │  Uta     │  Doflam. │  Luffy   │  Smoker  │  │
│  Beatdwn │  Outlast │  Bounce  │  Ramp    │  Discount│  │
│  ──────  │  ──────  │  ──────  │  ──────  │  ──────  │  │
│  one-    │  one-    │  one-    │  one-    │  one-    │  │
│  liner   │  liner   │  liner   │  liner   │  liner   │  │
└──────────┴──────────┴──────────┴──────────┴──────────┴──┘

       ↓ click any tile

┌─────────────────────────────────────────────────────────┐
│  Red Whitebeard (ST-15)                                  │
│  Pure Red beatdown — pressure their Life early and       │
│  don't let up. ~3 minutes to learn.                      │
│                                                          │
│  Leader: Edward Newgate    51 cards    Color: Red        │
│                                                          │
│  ┌─ Card list ──────────┐  ┌─ How it plays ──────┐      │
│  │ 4× OP01-001 Luffy    │  │ Big creatures.       │      │
│  │ 4× OP01-013 Sabo     │  │ Attack their Life.   │      │
│  │ ... (50 entries)     │  │ Their counters       │      │
│  │                      │  │ don't matter once    │      │
│  │                      │  │ you stack DON.       │      │
│  └──────────────────────┘  └──────────────────────┘      │
│                                                          │
│  [▶ Play with this deck]    [← Pick a different color]   │
└─────────────────────────────────────────────────────────┘
```

**Flow.**
1. Player lands. Sees 6 tiles, one per color, with leader portrait + 2-word playstyle ("Beatdown", "Outlast", "Bounce", "Ramp", "Discount", "Trigger").
2. Clicks a tile. Sees an *expanded* card showing the starter's name, one-paragraph framing, card list (collapsed by default), and TWO buttons: **Play** + **Pick a different color**.
3. Clicks Play. The starter loads as their active deck, they're routed to `/play` and into the next opponent.

**Result.** Player B in 3 clicks: color → deck-detail → Play. One real choice (color); two confirmations.

**The 6 one-liners** (from [`optcg-prebuilt-starter-catalog.md` §2](./optcg-prebuilt-starter-catalog.md#section-2--tier-1-the-6-we-surface-to-rookies)):

| Color | 2-word | Full one-liner |
|-------|--------|----------------|
| Red | Beatdown | Pure Red beatdown — pressure their Life early and don't let up. |
| Green | Outlast | Outlast them. Their characters get to attack once each; yours get to attack twice. |
| Blue | Bounce | They play it; you send it back; they play it again. |
| Purple | Ramp | You play more DON than they do, faster — then crush them with cards they can't match. |
| Black | Discount | Their 5-cost is your 3-cost. Outnumber them. |
| Yellow | Trigger | Damage is good for you, actually. |

### Tier-3 — Guided build

**Surface.** Existing `/deck-builder` with a new optional state, entered via `?guided=1` query param (set by tier-2's "Tune this deck" affordance, or directly).

**Premise.** A player who picked a starter at tier-2 might want to *modify* it — swap a few cards, learn the building loop. The guided flow lets them do that without dropping into the full 9,000-card search.

**Layout.** Same builder UI as today, but with:
1. The starter pre-loaded (all 50 cards + leader + DON deck).
2. A **role-coverage** panel on the left showing the deck's current composition:
   - Removal: 6 cards (target: 5–8)
   - Card draw: 4 cards (target: 4–6)
   - Big threats: 4 cards (target: 3–5)
   - Cheap chaff: 18 cards (target: 16–22)
   - Counter: 6 cards (target: 5–8)
3. Card-suggestion buttons next to each role: *"Need more removal? Try Card X."*
4. Cost curve chart (game-economy stat) live-updates.

**Critically, this tier still hides PRICES**. The role-coverage is the meaningful guidance; the cost curve teaches game balance; nothing about money.

### Tier-4 — Free build (current flow)

**Surface.** Existing `/deck-builder` — unchanged in shape, since Player C already lives here.

**Changes from today.** Add an "Import paper deck" affordance at the top:
```
┌─ Import a paper decklist ───────────────────────────┐
│ Paste your tournament list. We'll resolve the SKUs. │
│                                                     │
│ ┌─────────────────────────────────────────────┐    │
│ │ 4x OP01-001 Monkey D. Luffy                 │    │
│ │ 4x OP01-013 Sabo                            │    │
│ │ ...                                         │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
│           [Import]    [Cancel]                      │
└─────────────────────────────────────────────────────┘
```

The regex is simple (`/^(\d)x?\s+([A-Z]+\d+-\d+)/`), and we already have SKU resolution via the catalog. Player C goes from "Cambridge TCG doesn't have my deck" to "loaded in 5 seconds."

### API tier — Player D

**Existing endpoints** (deck-builder already uses these):
- `POST /api/decks` — create deck
- `GET /api/decks/:id` — read deck
- `PUT /api/decks/:id` — update deck

**Proposed additions:**
- `POST /api/decks/import` — accept a paper-decklist string + game slug; return resolved-SKU deck object
- `GET /api/decks/starters` — return the tier-1 + tier-2 starter catalog (typed)
- `GET /api/decks/starters/:id` — return a specific starter's full composition

The agent operator gets the same data the UI uses, in machine-readable form. Substrate-honest by construction.

---

## Section 2 — The data layer

### `apps/storefront/src/lib/play/starter-decks.ts`

New module. Typed array of `StarterDeck` entries (shape defined at [`optcg-prebuilt-starter-catalog.md` §5](./optcg-prebuilt-starter-catalog.md#section-5--data-shape--what-the-deck-builder-needs-to-know)). Hand-curated for tier-1 + tier-2 (14 entries). Tier-3 surfaces are derived dynamically from the wholesale catalog filtered by set code.

```ts
export const STARTER_DECKS: StarterDeck[] = [
  {
    id: "ST-15",
    display_name: "Edward Newgate",
    color: "red",
    leader_sku: "op-st15-001-en",
    card_list: [/* 50 entries */],
    tier: 1,
    tier_1_one_liner: "Pure Red beatdown — pressure their Life early and don't let up.",
    tier_1_complexity: 2,
    era: "2024-reboot",
    source_citation: "Bandai official ST15-20 product page",
  },
  // ... ST-16 through ST-20 + ST-28 in tier-1
  // ... ST-01, ST-23, ST-24, ST-26, ST-27 in tier-2
];

export const TIER_1_DECKS = STARTER_DECKS.filter(d => d.tier === 1);
export const TIER_2_DECKS = STARTER_DECKS.filter(d => d.tier === 2);

/** Get the canonical tier-1 deck for a given color. */
export function getTier1ForColor(color: Color): StarterDeck | undefined;

/** Get the "default rookie deck" — auto-mounted at /play when player has none. */
export function getDefaultRookieDeck(): StarterDeck;
```

### Card composition resolution

For each starter, the 50-card list is hand-curated from Bandai's published decklists (sources in [`optcg-prebuilt-starter-catalog.md` §6](./optcg-prebuilt-starter-catalog.md#section-6--substrate-honesty-about-card-data)). On load:

1. Resolve each `sku` against the wholesale catalog (existing API).
2. If a SKU is missing or unpriced, log a warning + substitute with the next-closest variant (e.g., same card different printing). Substitution is **catalog-driven**, not price-driven.
3. The resolved deck object is what's served to the deck-builder + play surface.

### Validation against banlist

Each starter is validated weekly against the current Standard banlist (source: Bandai tournament rules page). A banlist-incompatible starter shows an amber pill: *"Contains 1 card on the current ban list. Still playable in casual mode."*

---

## Section 3 — The four-question transparency checklist

Per `apps/admin/CLAUDE.md`'s substrate-honesty four-question discipline, applied to the rookie flow:

1. **What is this value, exactly?** The starter deck is a hand-curated list of 50 cards published by Bandai. Tier-1 vs tier-2 is **Cambridge TCG's editorial recommendation**, not Bandai's. The 6-color one-liner is editorial. The complexity rating is editorial.

2. **How did we get it?** Hand-research from public sources cited in [`optcg-prebuilt-starter-catalog.md` §9](./optcg-prebuilt-starter-catalog.md#source-roll-call). Each entry's `source_citation` field carries the URL.

3. **Is it live, snapshot, cached, or synced?** The starter compositions are **snapshots** of Bandai's published lists. They change when Bandai issues errata or new starters; we refresh manually. The complexity tier is **editorial-static** — change requires a PR.

4. **Could a user reasonably ask "wait, why does this say X?" — and if so, where does the answer live?** A `<WhyLink href="/methodology/starter-decks" />` next to each rookie-flow affordance, pointing to a methodology page that lists the source citations + the editorial framing rules. (Methodology page not yet shipped; would be created alongside implementation.)

**The fifth question** — *for whom is this true?* — applies too. The tier-1 rookie selection assumes:
- An English-reading player (default locale)
- Vision-able (icons + color tiles)
- Sufficient bandwidth for card-list rendering
- Synchronous response window (the auto-mounted deck is "ready now")

Each assumption is a default we could honor or relax for non-default audiences. Implementation should ensure:
- JP-locale players see ST-15 with JP card SKUs (already handled by the language resolver, [`apps/storefront/src/lib/cards/name.ts`](../../apps/storefront/src/lib/cards/name.ts))
- Screen readers get full ARIA on the color tiles + the deck panel
- Text-mode (`text-mode=1` cookie) renders the starter picker as a list, not tiles
- Async players (`users.response_window_hours > 24`) see a slightly different framing — "play whenever; the game waits"

---

## Section 4 — Implementation order

When the next kingdom ships this, suggested order:

**Phase 1 — Data layer (smallest, highest unblock value)**
1. Hand-curate `STARTER_DECKS` array in `lib/play/starter-decks.ts` for ST-15 through ST-20 (6 tier-1 entries).
2. Verify SKU resolution against current catalog.
3. Ship `/api/decks/starters` endpoint.

**Phase 2 — Tier-1 surface**
4. Modify `/play` page to auto-mount the default rookie deck when the player has none.
5. Add the rookie one-paragraph framing.
6. Add the "See all 6 colors →" link to tier-2.

**Phase 3 — Tier-2 surface**
7. Build `/play/starters` page with the 6-tile color picker + per-deck expanded view.
8. Wire the "Play with this deck" button to load + redirect.

**Phase 4 — Methodology**
9. Methodology page at `/methodology/starter-decks` explaining editorial choices + source citations.
10. `<WhyLink>` from every rookie surface to the methodology page.

**Phase 5 — Tier-3 + Tier-4 polish (later)**
11. Role-coverage panel on `/deck-builder`.
12. Import paper deck affordance on `/deck-builder`.
13. Tier-2 of starter catalog (ST-01, ST-23, ST-24, ST-26, ST-27, ST-28).

**Phase 6 — API tier (later)**
14. `POST /api/decks/import` (paper-list resolver).
15. Documentation in `apps/storefront/src/lib/manifest.ts`.

Phases 1–3 are the highest-leverage subset. They take Player A from "bounce on no-deck wall" to "in a match in 10 seconds." Everything else is optimization.

---

## Section 5 — What we explicitly don't do

The directive is *minimum barriers, maximum fun*. So:

1. **No required sign-up.** Tier-1 works for guests (existing PvE guest path already mints a `user_id` on first POST).
2. **No "preview your deck's market value"** — the deck-builder never shows prices anywhere (already enforced after commits `cdd6077` + `49b2cbe`).
3. **No "Buy missing cards" CTA on the deck-builder** (already removed in `49b2cbe`).
4. **No "you've unlocked X% of the starter" gamification** — the starter is fully available immediately; gamification is anti-fun friction.
5. **No paywall, no "premium starter," no "subscriber-only deck."** Every tier-1 and tier-2 deck is free to play.
6. **No daily login bonus for "first deck of the day."** Berries-from-clearing-adventure-levels stay (game-economy points; not real-economy).
7. **No competitive-rating display on rookie surfaces.** Tier-1 and tier-2 stay rating-hidden per [`/play/casual` framing](../../apps/storefront/src/app/play/casual/page.tsx).
8. **No "win-rate of this deck on ladder" stats on rookie surfaces.** Competitive information goes on `/play/compete` only.

These exclusions are the *fun* in fun-first. Each one is something the industry has tried; each one has corroded the rookie experience somewhere. We deliberately don't reach for them.

---

## Section 6 — Testing the design — five rookie scenarios

Before this design ships, it should pass these scenarios (written as Playwright tests or manual scripts):

### Scenario 1 — Cold visit, click Play
- Open private window
- Navigate to `/play`
- **Expected:** ST-15 (or rotating tier-1) loaded as active deck; opponent loaded; one Play button visible
- **Assert:** Time-to-first-button < 2 seconds; no deck-builder modal, no sign-in wall

### Scenario 2 — Pick-a-color path
- Navigate to `/play/starters`
- Click any color tile
- **Expected:** Expanded view appears with one-paragraph framing + card list + 2 buttons
- Click "Play with this deck"
- **Assert:** Active deck switches; redirect to `/play`; Play button visible

### Scenario 3 — Veteran paste-import
- Navigate to `/deck-builder`
- Click "Import paper deck"
- Paste a known list
- **Expected:** Resolves all SKUs; deck loaded; no errors
- **Assert:** All 50 cards resolved against catalog; if not, clear error message naming the unresolved card numbers

### Scenario 4 — Agent operator API
- `POST /api/decks/import` with a paper list
- **Expected:** Returns deck object with resolved SKUs; 200 status
- `GET /api/decks/starters/ST-15`
- **Expected:** Returns full ST-15 composition; 200 status with envelope

### Scenario 5 — Text-mode rookie
- Set cookie `text-mode=1`
- Navigate to `/play/starters`
- **Expected:** 6 color "tiles" render as a `<ul>` of links; expanded view renders as semantic HTML; same flow possible without JS

If all five pass, the design has delivered on *minimum barriers, maximum fun*.

---

## Section 7 — Open questions for the implementor

1. **Where do tier-1 starters live in the database?** Three options:
   - (a) Pure code constant in `lib/play/starter-decks.ts`. Pro: zero DB dependency. Con: editing requires a PR.
   - (b) Seed a `pve_starter_decks` table. Pro: editable via admin. Con: drift between code + DB.
   - (c) Hybrid: code is canonical, DB caches the resolved composition. Pro: best of both. Con: implementation complexity.
   - **Lean: (a) for v1; (c) later if editorial cadence needs it.**

2. **Should the tier-1 default rotate weekly, or stay pinned to ST-15?**
   - Rotating teaches color variety (a different starter each week → player meets all 6 colors).
   - Pinned guarantees a consistent first impression.
   - **Lean: pin to ST-15 for first-visit; offer "show me a different starter" on subsequent visits.**

3. **What happens when the player loses with the starter?** Adventure mode tracks level progress. If a starter is too weak for the level, the player bounces. The current adventure unlock chain ensures Level 1 is winnable with any starter — but is this true for all tier-1 decks? **Requires playtesting.**

4. **How does this interact with `/play/welcome`?** That page already exists as the "audience door" — player kinds A/B/C/D each have a path on it. The redesign here is the *deck* layer; welcome page is the *audience* layer. They compose: a player declares an archetype (Hobbyist / Competitor / Collector — see [`docs/connections/the-three-paths.md`](../connections/the-three-paths.md)) on `/welcome`, then enters the appropriate deck-flow tier. Confirm: `/play/welcome` should link to `/play/starters` for the Hobbyist path.

5. **Federation.** A starter deck declared on cambridgetcg.com has a content hash (50-card SKU list, sorted, sha256). Other implementations could play the same deck by quoting the hash. **Lean: out of scope for v1; recursion target.**

---

## Section 8 — Closing — the fun-first cosmology

The Cambridge TCG cosmology ([`docs/principles/cosmology.md`](../principles/cosmology.md)) names two intersecting economies: the game-economy (Berries, DON, Life, attack power — internal to a match) and the real-economy (currency, card prices, trade value — external to a match). Most TCG platforms blur the two. We don't.

This design proposal is the *deck-building* expression of that doctrine. The starter library is free because deck-building lives in the game-economy. Card prices are absent because they don't compute over the play surface. Recommendation tiers are editorial-because-fun, not editorial-because-monetization.

When the player clicks Play on tier-1 and finds themselves in a match in 10 seconds, the cosmology has done its job. The platform is honest about what game they're playing — and the game is *fun*.

---

## Source roll-call

External research:
- All sources in [`deck-builder-ux-survey.md`](./deck-builder-ux-survey.md#source-roll-call)
- All sources in [`optcg-prebuilt-starter-catalog.md`](./optcg-prebuilt-starter-catalog.md#source-roll-call)

Internal references:
- [`docs/principles/cosmology.md`](../principles/cosmology.md) — game-economy vs real-economy
- [`docs/connections/the-three-paths.md`](../connections/the-three-paths.md) — three archetypes (Hobbyist / Collector / Competitor)
- [`docs/connections/the-shared-table.md`](../connections/the-shared-table.md) — tutorial layer, player-kind welcome
- [`docs/research/optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md) — rules + engine
- [`docs/research/optcg-meta-evolution-and-deckbuilding.md`](./optcg-meta-evolution-and-deckbuilding.md) — competitive doctrine
- [`apps/storefront/src/app/play/page.tsx`](../../apps/storefront/src/app/play/page.tsx) — current Play surface
- [`apps/storefront/src/app/deck-builder/page.tsx`](../../apps/storefront/src/app/deck-builder/page.tsx) — current deck builder
- [`apps/storefront/src/app/play/welcome/page.tsx`](../../apps/storefront/src/app/play/welcome/page.tsx) — player-kind welcome
- [`apps/storefront/src/lib/cards/name.ts`](../../apps/storefront/src/lib/cards/name.ts) — language resolver pattern
- [`apps/storefront/src/lib/prices/games-config.ts`](../../apps/storefront/src/lib/prices/games-config.ts) — typed-config pattern to mirror

---

*Design, not a ship. The next kingdom that picks up the deck-builder starts here.*

*Minimum barriers, maximum fun.* 🐍❤️
