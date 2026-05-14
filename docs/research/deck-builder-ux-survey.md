# Deck-builder UX survey across digital TCGs — what rookies actually need

> **Pull.** Yu, 2026-05-14: *"WEBSEARCH FOR KNOWLEDGE ON DECK BUILDING!!!!! PREBUILD FOR ROOKIES!!!! TAILOR THE CARD PICKING PROCESS FOR PLAYERS!!!! PUT YOURSELF IN THEIR SHOES! LOOK INTO DIGITISED CARD GAMES ON HOW THE FLOW WORKS!!! WEBSEARCH AND RESEARCH!!!! CREATE RESEARCH DOCS!!!!"*
>
> **Form.** Research synthesis — survey of how eight digital TCGs handle the deck-building experience for new players. Sibling to the existing OPTCG-specific research at [`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md) (rules + engine) and [`optcg-meta-evolution-and-deckbuilding.md`](./optcg-meta-evolution-and-deckbuilding.md) (competitive doctrine). This document is **game-agnostic** — it asks how the *interaction* of deck-building has been designed across the industry, not what cards or mechanics each game uses.
>
> Composes downstream with [`deck-builder-rookie-flow-design.md`](./deck-builder-rookie-flow-design.md) (the concrete Cambridge TCG proposal) and [`optcg-prebuilt-starter-catalog.md`](./optcg-prebuilt-starter-catalog.md) (the seed deck library).
>
> **Boundary.** Aligned with [`docs/principles/cosmology.md`](../principles/cosmology.md) §game-economy: deck building lives in the game-economy. Money / commerce / collection-completion-as-FOMO are explicitly outside scope. The fun-first directive from kingdom-068 still holds.

---

## Why this exists

We just stripped every price-display from the play module (commits `cdd6077` + `49b2cbe`). The deck builder is now visually clean — no `<Money>` components, no "Buy Missing Cards" CTA, no "earn Berries" sign-in nudge. But cleanliness is not the same as *invitingness*. A rookie arriving today still sees the same flow: pick a Leader, search 9,000+ cards, add them one by one until 50.

That's a 9,000-decision flow for a player whose actual desire is **"I want to play."**

The industry has solved this. This doc surveys how.

---

## The eight games surveyed

| Game | Deck size | Released | Audience | Why I picked it |
|------|-----------|----------|----------|-----------------|
| Hearthstone | 30 | 2014 | Mass-market casual | The original "deck recipe" pioneer |
| MTG Arena | 60 | 2018 | TCG veterans + paper crossover | Hardest deck-builder problem (largest card pool) |
| Marvel Snap | 12 | 2022 | Mobile-first, very casual | Smallest deck — extreme minimal-friction case |
| Pokémon TCG Live | 60 | 2023 | Kids + paper-TCG crossover | Eight-free-starter approach |
| Yu-Gi-Oh Master Duel | 40–60 | 2022 | TCG veterans | Crafting-from-currency model |
| Legends of Runeterra | 40 | 2020 | Free-to-play, no grind | Most generous unlock economy |
| Lorcana TCG | 60 | 2023 (paper) / sim 2024 | Disney crossover | Newest TCG; most rookie-tuned defaults |
| OPTCG (paper baseline) | 50 + 10 DON!! + 1 Leader | 2022 | Anime + TCG crossover | Our target game — establishes the constraint we have to fit |

---

## Section 1 — Five recurring patterns

Across the eight games, five UX patterns reappear. Some are universal; some are differentiators. Each one is a *barrier-reducer*: it lowers the cognitive cost of getting from "I installed the app" to "I'm playing a game."

### Pattern 1 — Free starter library (universal among the best)

**The pattern.** When the player first opens the game, a library of pre-built decks is already in their collection, instantly playable. No purchase, no crafting, no card-by-card construction.

| Game | Free starters at install |
|------|---------------------------|
| Pokémon TCG Live | **8 starter decks** (all 8 from day one — Charizard ex, Mewtwo ex, etc.) |
| Legends of Runeterra | **10+ region starters** (every region has a beginner deck) |
| Hearthstone | **Core set** (every class has a free Core deck since 2021's free-Core revamp) |
| Marvel Snap | **Tutorial deck + Recruit Season cards** (~32 cards, several archetypes) |
| Lorcana sim | Pre-built starter per ink color (6 colors) |
| MTG Arena | 5 colour starter decks (one per colour, from Color Challenges) |
| YGO Master Duel | Solo Mode unlocks pre-built decks per archetype |
| OPTCG (paper) | n/a — paper game; players buy starters individually (ST-01 through ST-28+, all 51-card pre-builds) |

**Why it works.** Removes the *cold-start problem*: a new player has no cards, no idea what synergies exist, no priors on what's good. The starter library compresses that decision space to "pick one of 8" instead of "pick 50 of 9,000."

**Pitfall to avoid.** Hearthstone's *Deck Recipes* (released 2016) failed for new players because the recipes pulled cards the new player didn't own. The substitution logic was opaque — a player would copy a recipe, see "you're missing 18 cards," and bounce. The 2021 Core-set revamp fixed this by making the recipe cards *free* on day one.

**Implication for us.** The OPTCG paper game has 36+ starter decks (ST-01 through ST-28+) that are already 51-card pre-builds. We have catalog data for every card in every starter. We can ship the full starter library as a free in-app deck pool with literally one query: "give me ST-XX's 51 cards." This is the highest-leverage move.

### Pattern 2 — Color/archetype gate before card list

**The pattern.** The first decision in deck-building is *not* "pick a card." It's "pick a color" (or class, or ink, or region, or archetype). Once the color is locked, the visible card pool shrinks ~6× and choice becomes tractable.

| Game | Gate-1 decision | Pool reduction |
|------|------------------|----------------|
| Hearthstone | Class (10 classes) | 9× reduction (per-class library) |
| MTG Arena | Color (5 colors + multicolor) | ~5× per single-color |
| Marvel Snap | n/a (single pool, but archetype tags filter) | Archetype tags |
| Pokémon TCG Live | Energy type (10 types) | ~10× |
| YGO Master Duel | Archetype (~50 named) | Massive (archetype-locked synergy) |
| LoR | Region (10 regions) | ~10× |
| Lorcana | Ink color (6 colors) | 6× |
| **OPTCG** | Leader color (6: R/G/B/P/Bk/Y) | **6×** |

**Why it works.** Cognitive load. Choosing from 9,000 cards is paralysis; choosing from 1,500 is manageable; choosing from 50 is easy. The color/archetype gate is the natural first split — it's *also* the rule that determines deckbuilding legality in most games. Two birds.

**Implication for us.** OPTCG's color rule (deck colors must match Leader colors) already enforces this. Our deck-builder currently asks for Leader first; that's correct. The improvement is **before** the Leader picker: ask for color first. **Then** show only Leaders of that color. Three taps to a starter: color → leader → "Play."

### Pattern 3 — Substitution-aware recipes

**The pattern.** A recipe says "this deck wants Card A here." If the player owns Card A, slot it. If they don't, propose Card B (an owned card with similar role) and let them swap. The recipe stays *complete* — never blocked.

| Game | Implementation |
|------|----------------|
| Hearthstone (post-2021) | Core set guarantees baseline; recipes substitute Core for absent rares |
| MTG Arena (Arena Tutor 3rd-party) | Collection-aware: shows "you have 18 of 30 cards for this deck" with one-click craft suggestions |
| Pokémon TCG Live | Theme decks are full and locked; no substitution needed |
| YGO Master Duel | Structure Decks are fully self-contained; no substitution |
| LoR | "Recommended deck" feature — pre-built decks unlock as you progress |
| Marvel Snap | Auto-builder picks from your collection only (no substitution problem) |

**Why it works.** A substitution-aware recipe is *robust to player progression*. The player can act on it on day 1 (with a partial collection), week 4 (with a full collection), and month 6 (when they want to upgrade the deck). Each time, the recipe degrades gracefully to "the best version of this archetype you can build right now."

**Pitfall to avoid.** Opaque substitutions ("we replaced Goblin Guide with Goblin Cratermaker — why?") frustrate. The best implementations *label the role*: "Card A: 1-drop aggressive creature. You don't own this; we substituted Card B which is also a 1-drop aggressive creature." The role-label is the user-facing artifact, the specific card is implementation detail.

**Implication for us.** We're a marketplace, not a card-grant system — players don't "own" cards on our platform in the digital sense. But the *deck builder* doesn't need to gate on ownership. It can offer the full OPTCG starter as a play-only deck (no purchase needed). Substitution becomes irrelevant: every starter is fully populated, always.

### Pattern 4 — Curve / role visualization (without monetary value)

**The pattern.** The deck builder shows live statistics about the in-progress deck: cost curve, color balance, role coverage (removal / draw / threat / answer). The player sees *game-economy* health, not *real-economy* value.

| Game | Stats shown | Stats deliberately hidden |
|------|-------------|---------------------------|
| Hearthstone | Mana curve | Card value in gold/dust |
| MTG Arena | Mana curve, color sources, lands | Card value in dollars (TCGplayer integration is 3rd-party only) |
| Marvel Snap | Cost curve, average cost | No money anywhere |
| Pokémon TCG Live | Energy curve, type spread | Cash value (collection page shows tcgplayer price separately) |
| YGO Master Duel | Type/attribute spread, level distribution | No money |
| LoR | Mana curve, region split, champion count | Card value |
| Lorcana | Ink curve, lore curve, character/action split | Money |
| OPTCG.gg (community) | Cost curve, rarity mix, set distribution | Often shows market price (community-built) |

**Why it works.** Game-economy metrics teach the player about deck-building *mechanics* — "your curve is heavy at 4-cost, you'll be slow early." Real-economy metrics teach them about *opportunity cost* — "your deck is worth £340" — which is irrelevant to playing the game and corrosive to fun.

**Implication for us.** We already stripped `<Money>` from `DeckStatsPanel.tsx` (commit `cdd6077`). The component currently shows rarity-mix and set-mix. We should *add* cost curve and color balance — both pure game-economy. The Berries-cost curve is the OPTCG equivalent of mana curve.

### Pattern 5 — One-click "play this deck"

**The pattern.** Every deck in the system — pre-built, recipe, custom, friend's — has a single dominant button: **Play**. The friction between "I see a deck I like" and "I'm in a match with it" is zero.

| Game | Friction to play a deck |
|------|--------------------------|
| Hearthstone | 1 click (select deck → queue) |
| MTG Arena | 2 clicks (select deck → play queue type) |
| Marvel Snap | 2 clicks (deck → play) |
| Pokémon TCG Live | 1 click (active deck dropdown) |
| YGO Master Duel | 2 clicks (deck → ranked/casual) |
| LoR | 1 click |
| Lorcana | 2 clicks |

**Why it works.** Game-flow theory. The *desire to play* is a high-energy state; deck-builder navigation drains that energy. Every extra click is a chance for the player to bounce.

**Implication for us.** Our `/play` page already has the "Play" affordance — it loads the active deck and queues a match. The bottleneck is **getting a deck onto the active slot** in the first place. The Quickstart flow (Section 3, [`deck-builder-rookie-flow-design.md`](./deck-builder-rookie-flow-design.md)) should make that one click from arrival.

---

## Section 2 — Three failure modes the industry has documented

Patterns above describe what *works*. Equally important: what's been tried and fails.

### Failure 1 — The "you have 0% of this deck" wall

**Where it fails.** Hearthstone Deck Recipes (2016–2021), MTG Arena's "import deck" feature for paper-deck imports.

**Symptom.** New player picks a recipe / imports a list. Sees a screen: "You own 6 of 30 cards. Craft the rest? (1,440 dust required.)" Their dust balance: 200. They bounce.

**Why.** Aspirational deck-building is a *late-game loop*. Showing it to a day-one player is showing them their distance from the carrot before they've taken a bite.

**How to avoid.** Don't show aspirational decks to new players. The starter library is the day-one loop.

### Failure 2 — The "tell me which deck is best" anti-loop

**Where it fails.** YGO Master Duel meta-deck guides linked from the in-game store. New player clicks "best deck for ladder" → competitive list → 5,000-gem crafting cost.

**Symptom.** Player learns the META before the GAME. Picks deck X because it's tier-1. Loses 10 in a row because they haven't learned to play *yet*. Concludes the game is "pay to win."

**Why.** A competitive deck only performs in competent hands. A new player's hands are *not* competent yet. The variance between "tier-1 deck in tier-1 hands" and "tier-1 deck in tier-100 hands" is enormous.

**How to avoid.** Hide meta from rookies. Show *fun* decks, *thematic* decks, *easy-to-pilot* decks. The competitive deck-builder is a separate tier for players who've voluntarily climbed.

### Failure 3 — The card-pool overwhelm

**Where it fails.** YGO (where the deck-builder shows 12,000+ cards), MTG Arena (Historic format, ~17,000 cards), late-stage Hearthstone.

**Symptom.** Player opens deck-builder, sees a search bar with autocomplete on 12,000 cards, has no priors. Scrolls for 10 minutes. Closes the app.

**Why.** The deck-builder UI treats the card pool as a flat sea. New players need *currents* — a way to navigate the pool by intent ("I want a Red aggressive deck") rather than by name ("Goblin... Guide? Goblin Cratermaker? Goblin...").

**How to avoid.** The color/archetype gate (Pattern 2) is the first current. Role tagging on each card ("removal", "ramp", "threat", "draw") is the second. Recommended-card pinning at the top of search results is the third.

---

## Section 3 — Putting myself in their shoes — four player journeys

Per Yu's directive: *"PUT YOURSELF IN THEIR SHOES!"* Four representative new players. The same surface should work for all four.

### Player A — The total beginner

> *Avatar:* 14-year-old who watches the One Piece anime, has never played a TCG, opened our site because their friend mentioned it. Wants to play One Piece. Has zero context for words like "Leader," "DON," "rest," "counter."

**Their goal.** Play a match in the next 60 seconds.

**What kills them.** Any screen with more than 3 buttons. Any text containing "synergy," "archetype," "mana curve." Any flow that requires choosing 50 of anything.

**What works.** A single button: **Play**. The system picks ST-01 Red Luffy (the canonical beginner deck), drops them into PvE level 1 with a tutorial overlay.

### Player B — The lapsed player

> *Avatar:* 28-year-old who played Yu-Gi-Oh in 2008 and Hearthstone in 2017. Has played a TCG before. Wants to feel competent quickly. Suspicious of "kid stuff."

**Their goal.** See "real" gameplay within 5 minutes, decide if it's worth investing.

**What kills them.** Being treated as a total beginner. Being forced through a tutorial.

**What works.** A library of 6 color-themed starters with one-paragraph descriptions of playstyle ("Red: aggressive rush. Win fast or lose fast. Easy to pilot."). They pick one based on vibe, play, learn from losing.

### Player C — The paper-OPTCG veteran

> *Avatar:* 22-year-old who plays OPTCG at locals. Knows the meta. Has a paper Sakazuki deck. Wants to find a way to playtest online before tournaments.

**Their goal.** Replicate their paper deck digitally and play games against humans or agents.

**What kills them.** A deck-builder that doesn't let them paste a decklist. A flow that hides the catalog behind a starter-first wizard.

**What works.** "Import paper deck" affordance: paste a card-number list, the builder resolves it. Or: full-search mode available as a tier-4 option from the deck-builder landing.

### Player D — The agent operator

> *Avatar:* Researcher building an OPTCG-playing AI agent. Wants to test their bot against the platform. Needs deterministic deck-loading.

**Their goal.** Programmatically load a known deck, start a match against another agent, run 10,000 games.

**What kills them.** A UI-only deck-builder. A deck format that's not stable across sessions.

**What works.** An API to GET/PUT decks by ID, with a stable URL-shareable encoding. The current deck-builder already encodes decks in URL params; surface this as a documented endpoint.

---

## Section 4 — The matrix — what each player kind needs

|                       | Player A (beginner) | Player B (lapsed) | Player C (paper vet) | Player D (agent op) |
|-----------------------|---------------------|-------------------|----------------------|---------------------|
| Entry surface         | `/play` → "Play"    | `/play` → starter library | `/deck-builder` → full search | `/api/decks/*` |
| Default deck          | ST-01 (auto)        | Color-picker      | Empty (their import) | Empty (their PUT)   |
| Tutorial overlay      | Yes (forced)        | Optional          | Off                  | Off                 |
| Card-pool visibility  | Hidden              | Filtered to color | Full search          | API                 |
| Substrate honesty     | "Deck preloaded"    | "6 free starters" | "Imported"           | Programmatic        |
| Friction-to-match     | 1 click             | 3 clicks          | 1 paste + 1 click    | 1 POST              |

The same backend serves all four. The *entry surface* differs. This is the architecture our redesign should target.

---

## Section 5 — What we keep from industry; what we add

### Keep (universal best practices)

- **Free starter library at install.** Every OPTCG ST-XX deck instantly playable. No purchase, no crafting.
- **Color gate before card list.** Three-tap path to a deck.
- **Game-economy stats only.** Cost curve, color balance, role coverage. No prices, no value tracking.
- **One-click play.** Active-deck dropdown on every play surface.

### Add (Cambridge-TCG-specific)

- **Paper-deck import.** OPTCG community already exchanges decklists as plain text (`4x OP01-001 Monkey D. Luffy`). The importer is one regex + a SKU resolver.
- **Federation export.** A deck declared on cambridgetcg.com is publishable as a content-hashed URL. Other implementations can play the same deck.
- **No money anywhere in the play surface.** Universal best practice + Yu's directive made-doctrine. The deck-builder is for *building*, not buying.
- **Multi-archetype audience.** The four player kinds (Section 3) are explicit; the design serves all four from one backend.

---

## Section 6 — Open questions

These are *not* decisions; they're items where the research surfaced contested ground and we'll need to pick a stance.

1. **Should the deck-builder show win-rate stats?** Some games (LoR, MTG Arena via 3rd-party) surface "this archetype wins 53% on ladder." It's competitive information that contaminates the fun-first stance. **Lean: hide for casual; expose for `/play/compete` only.**

2. **Should we auto-pick a starter, or always offer a color choice?** Auto-pick is Pattern 1 in its strongest form (Player A's path); color choice is Pattern 2 (Player B's path). **Lean: auto-pick ST-01 as the day-zero default; expose color picker as a "change deck" affordance one tap away.**

3. **Should we ship recipes (substitution-aware) or full pre-builds (no substitution needed)?** Our marketplace model doesn't track per-player card ownership for play; pre-builds are cheaper to implement and never block. **Lean: pre-builds only for v1. Recipes are a kingdom-088-style "if-needed" extension.**

4. **What's the right place for the existing deck-builder?** The full-search free-build surface is currently the primary affordance. **Lean: it becomes tier-4 (Player C's path). The new primary affordance is the starter-picker.**

5. **Adventure mode default deck.** PvE adventure currently expects players to bring a deck. If they have no deck, they can't play. **Lean: auto-mount a free starter on first PvE play; no deck-selection screen for first-timers.**

These all bubble up into [`deck-builder-rookie-flow-design.md`](./deck-builder-rookie-flow-design.md) as concrete proposals.

---

## Source roll-call

External research consulted 2026-05-14:

- Hearthstone Deck Recipes — [hearthstone.wiki.gg](https://hearthstone.wiki.gg/wiki/Deck_Recipe), [Blizzard announcement](https://hearthstone.blizzard.com/en-us/news/20056279)
- MTG Arena builders — [Draftsim's "5 reasons" review](https://draftsim.com/mtg-arena-deck-builder/), [Arena Tutor](https://mtgazone.com/deck-builder/), [Flipside's beginner guide](https://flipsidegaming.com/blogs/magic-blog/how-to-build-a-deck-on-mtg-arena)
- Marvel Snap deck-building — [Marvel.com first-deck guide](https://www.marvel.com/articles/games/how-to-build-your-first-marvel-snap-deck), [BlueStacks deck-building guide](https://www.bluestacks.com/blog/game-guides/marvel-snap/mvsn-deck-building-guide-en.html)
- Pokémon TCG Live starters — [Pokemon.com "Starter Deck Strategies — March 2025"](https://www.pokemon.com/us/strategy/pokemon-trading-card-game-live-starter-deck-strategies-march-2025), [Bulbapedia decklist](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_Live_decks)
- YGO Master Duel — [Nintendo Life starter guide](https://www.nintendolife.com/guides/yu-gi-oh-master-duel-best-meta-decks-starter-guide-crafting-and-cp-explained), [outofgames builder tutorial](https://outof.games/realms/yugioh/guides/138-how-to-use-yu-gi-oh-master-duels-deckbuilder-to-create-decks/), [BlueStacks gems guide](https://www.bluestacks.com/blog/game-guides/yu-gi-oh-master-duel/ygomd-building-guide-en.html)
- Legends of Runeterra — [RuneterraFire builder](https://www.runeterrafire.com/deck-builder), [Mobalytics meta report](https://mobalytics.gg/blog/lor/best-legends-of-runeterra-decks/), [Pocket Tactics beginner decks](https://www.pockettactics.com/legends-of-runeterra/decks)
- AI deck-builders / smart recommendations — [MTG Agents (Karn)](https://mtg-agents.com/ai-deck-builder), [ManaTap AI](https://www.manatap.ai/), [DeckCheck](https://deckcheck.co/), [Deck AI for Clash Royale](https://deckai.app/)
- OPTCG rules + starters — [official rule manual PDF](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf), [TCG Central guide](https://tcg-central.com/en/articles/how-to-play-one-piece-tcg-complete-rules-guide-2025.php), [Eneba starter guide 2025](https://www.eneba.com/hub/collectibles/best-one-piece-starter-decks/), [TCGplayer ranked starters](https://www.tcgplayer.com/content/article/Every-One-Piece-Card-Game-Starter-Deck-Ranked/bc124cf3-bed7-42ea-a10e-946fee670079/), [cardgamebase starter list](https://cardgamebase.com/one-piece-starter-decks/), [official ST15-20 product page](https://asia-en.onepiece-cardgame.com/products/decks/st15-20.php)
- OPTCG mechanics deep dive (internal) — [`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md)
- OPTCG meta evolution (internal) — [`optcg-meta-evolution-and-deckbuilding.md`](./optcg-meta-evolution-and-deckbuilding.md)

---

*Research, not a ship. Future kingdoms that touch the deck-builder UI start here.*

🐍❤️
