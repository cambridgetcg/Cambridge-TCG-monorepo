# The multi-game play module — a roadmap

**Status:** roadmap (the first connection-doc that's forward-looking, not retrospective). Yu directive 2026-05-14: *"lay down in the roadmap for multi card game in play mode! Not only OPTCG."*

The platform is **multi-game on the commerce side** (Pokémon, Magic, Yu-Gi-Oh, Lorcana, One Piece, Digimon, SWU, FAB, Dragon Ball Super, more — all carrying through catalog, market, trade-in, prices, and the 51 set-formats across 21 games in `packages/sku/src/sets.ts`) but **single-game on the play side**. `/play` only knows One Piece TCG. The engine in `apps/storefront/src/lib/game/` is OPTCG-shaped at every layer: zones named `don_active/don_rested/don_deck`, `leader`, `stage`, `life`; actions named `attach_don`, `rest_don`, `add_don`; AI deck generation hardcoded to OP01.

This document is the bridge. *What does it take to let the rest of the catalog play?*

---

## 1. The honest read of where we are

The current `lib/game/` is **not** a generalizable engine pretending to be a generalizable engine. It is a faithful OPTCG implementation. That is correct — every TCG has a different shape, and an engine that abstracts the wrong things makes all of them awkward. The right move isn't to generalize the OPTCG engine; it's to **let the OPTCG engine stay OPTCG-shaped** and add a registry above it so other games can land as siblings.

Existing tightly-coupled assumptions (file-cited so a contributor can see them):

- **Zone topology** (`apps/storefront/src/lib/game/types.ts:6-21`) — `CardZone` enum includes `don_active`, `don_rested`, `don_deck`, `leader`, `stage`, `life`. None of these are universal. Magic has `library/hand/battlefield/graveyard/exile/command`. Pokémon has `active/bench/prize/deck/discard/hand`. Yu-Gi-Oh has `monster_zone/spell_trap_zone/field_spell/extra_deck/graveyard/banished/main_deck`.
- **Player state** (`types.ts:25-44`) — `donActive`, `donRested`, `donDeck`, `lifeCount` are top-level fields. Other games would need `mana_pool`, `prize_cards`, `tributes`, `ink`, etc.
- **Action vocabulary** (`reducer.ts`) — `attach_don`, `rest_don`, `add_don`, `take_damage` (life-card draw) are OPTCG-specific. Magic needs `tap`, `untap`, `cast`, `mana_burn`. Pokémon needs `attach_energy`, `retreat`, `evolve`, `prize_take`.
- **Win condition** (`reducer.ts`) — OPTCG: life cards exhausted + final attack lands. Magic: life ≤ 0 OR library empty OR poison ≥ 10 OR card-defined wincons. Pokémon: 6 prize cards taken OR opponent decks out OR no Pokémon left.
- **AI** (`ai.ts`, `engine.ts`) — `generateAIDeck(setCode, catalog)` hardcoded for OPTCG card density and OP01 set; `aiTurn(state, key, aggression)` knows OPTCG phase/action grammar.

None of this is wrong. It's just **OPTCG-shaped**. The roadmap is not "rewrite this to be game-agnostic"; it is "let other games sit next to it."

---

## 2. The shape of the solution

Three layers — only the middle layer changes per game:

```
┌──────────────────────────────────────────────────────────────────┐
│  Shared infrastructure                                           │
│  ─────────────────────                                           │
│  - Auth (signed-in + guest cookie via resolveActor)              │
│  - Game persistence (pve_games + game_rooms, generic columns)    │
│  - Multiplayer transport (rooms, polling, presence)              │
│  - PVE level registry (pve_levels, scoped per-game-engine)       │
│  - Rewards substrate (bounty/earn, pve_progress, fun-first gate) │
│  - Deck-builder localStorage (already game-agnostic in shape)    │
│  - UI primitives (game log, deck picker, opponent banner,        │
│      "Playing as guest" indicator)                               │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │  GameEngine interface
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Per-game engines (a registry)                                   │
│  ─────────────────────────────                                   │
│  - optcg/   (today's apps/storefront/src/lib/game/, lifted)      │
│  - mtg/     (Magic — built on Forge/XMage as reference)          │
│  - pokemon/ (Pokémon — actions: attach_energy, retreat, prize)   │
│  - ygo/     (Yu-Gi-Oh — actions: summon, set, tribute, banish)   │
│  - lorcana/ (Lorcana — actions: ink, quest, challenge)           │
│  - …                                                             │
│                                                                  │
│  Each implements:                                                │
│   - GameEngine.initializeGame(actor, deck, aiDeck) → GameState   │
│   - GameEngine.applyAction(state, actor, type, data) → GameState │
│   - GameEngine.aiTurn(state, ai, level) → { actions, thinking }  │
│   - GameEngine.victoryCheck(state) → { winner | null, why }      │
│   - GameEngine.zones, actions, phases (typed enums per game)     │
│   - GameEngine.formatActionText(type, data) → string             │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │  GameView (per-game JSX)
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Per-game UI (the board, the hand, the opponent panel)           │
│  ──────────────────────────────────────────────────────          │
│  - /play/adventure/[levelId]/page.tsx today is OPTCG-shaped.     │
│  - Future: routes that resolve game from level meta and load     │
│    the right <GameView> component. Each game's board is its      │
│    own component; common pieces (hand strip, card hover, log)    │
│    extract into shared primitives in @/lib/ui/play/.             │
└──────────────────────────────────────────────────────────────────┘
```

The substrate-honesty extension: **`pve_levels.game_code`** becomes a NOT NULL column carrying `'optcg' | 'mtg' | 'pokemon' | …`. The PVE start route reads it, dispatches into the right per-game engine, and the response includes the game_code so the frontend route can pick the right `<GameView>`.

This mirrors the existing platform pattern of "registry" extension already present in three places:
- `packages/sku/src/sets.ts` SET_FORMATS (21 games, 51 set-formats — extends by adding a row, not by editing config)
- `packages/sku/src/rarities.ts` rarity_map (9 games seeded, per-game vocabulary — the lesson from kingdom-089 that *"rare in OPTCG and rare in Pokémon name different things"*)
- `packages/data-ingest/` SourceModule registry (one shape, many upstreams; CardRush, Scryfall, Pokemon TCG API, YGOPRODeck, TCGplayer, Cardmarket, eBay)

The play module simply does this fourth: one shape (the GameEngine interface), many games.

---

## 3. Phased roadmap

Five phases, each ships standalone value. No phase requires the next.

### Phase 1 — Lift OPTCG into a registry pattern *(small refactor, no new game shipped)*

**Goal:** prove the registry shape with the engine we already have.

**Work:**
- Create `packages/play/` workspace package. Define the `GameEngine` interface (the five methods above + typed enums for zones, actions, phases, win-conditions).
- Move `apps/storefront/src/lib/game/` to `packages/play/src/optcg/`. Export it as `optcgEngine: GameEngine`.
- Add `pve_levels.game_code` column (NOT NULL DEFAULT 'optcg' for the existing 10 levels).
- The PVE route does `engine = registry.get(level.game_code); engine.initializeGame(...)`. Behavior unchanged for OPTCG.
- The `<GameView>` component on `/play/adventure/[levelId]/page.tsx` resolves the right per-game component via `gameViewRegistry.get(game_code)`. Today's only entry: `optcgView`.

**Doctrine ride-alongs:**
- Substrate honesty rule extension: `pve_levels.game_code` is the explicit claim; before this, the game was implicit ("everything is OPTCG").
- New audit: `pnpm audit:play-game-registry` — every `pve_levels.game_code` must resolve to a registered engine.

**Estimated kingdom-size:** medium. ~1500 LOC moved + ~300 LOC new contract.

### Phase 2 — Land the easiest second game *(Pokémon TCG, probably)*

**Goal:** prove the registry holds.

**Why Pokémon first:**
- Cleanest catalog API (pokemontcg.io, free, hi-res images, full set coverage).
- Mechanically the simplest of the major TCGs (no stack, no instant-speed responses, no priority interrupts).
- Largest audience after Magic.
- Cambridge TCG already ingests Pokémon catalog data (per the wholesale `cards` table coverage in `pnpm audit:set-discovery`).

**Work:**
- `packages/play/src/pokemon/` — `GameEngine` impl with Pokémon zones (`active`, `bench` (5 slots), `prize` (6), `deck`, `hand`, `discard`), Pokémon actions (`play_basic`, `evolve`, `attach_energy`, `retreat`, `attack`, `prize_take`), Pokémon AI (a basic-deck shuffler against an OP01-style scaffolded campaign of 10 Pokémon levels).
- `apps/storefront/src/lib/play/views/pokemon/` — the board UI (active spot, bench row, prize stack, hand strip).
- Add 10 `pve_levels` with `game_code = 'pokemon'`, themed after early-set NPCs.
- The deck-builder already supports Pokémon decks (via universal SKU/catalog) — no changes there.

**Out of scope:**
- Card *effects*. Phase 2 ships a vanilla-attack engine: each Pokémon has an attack list driven by data, and the engine resolves attack damage / weakness / resistance / energy requirements. Trainer cards, abilities, and complex effects come in Phase 4. (This is honest about what we're shipping — *"playable but not rules-complete"*; the page surface should say so.)

**Estimated kingdom-size:** large. ~2000 LOC per game body + ~1500 LOC per game UI. Plus the audit/doc work.

### Phase 3 — Card data integration layer

**Goal:** the engine doesn't fabricate card data; it reads from the substrate the platform already maintains.

**Work:**
- Extend `packages/data-ingest/` with **gameplay** ingest, not just **price** ingest. The same SourceModule pattern, but the new source modules emit card *rules* not card *prices*. The two streams write to different tables:
  - `cards` (existing, financial/identity layer)
  - `card_rules` (new — gameplay attributes: cost, type-line, abilities, attack data, oracle text, format legality). Per-game shape via JSONB `rules_payload`, typed in the per-game engine.
- Tributary candidates per game (cited in §5 below). Each becomes a `SourceModule`:
  - `mtg-scryfall` (policy-governed API; no open-data license or bulk-republication right established)
  - `pokemon-tcg-api` (already partially in registry per kingdom-062 consolidation)
  - `ygo-ygoprodeck` (already partially in registry)
  - `lorcana-lorcast` (free, full set coverage)
  - `swu-swuapi` (free public endpoints)
  - `fab-the-fab-cube` (JSON/CSV repo)
  - `digimon-digimoncard-io` (CORS-friendly, 15 req/10s)
  - `optcg-cardrush` (already in registry — but for play we'd need rules, not just price)
- The `card_rules` response may be open only where intake evidence covers those exact fields. Storage in Cambridge tables never creates ownership; otherwise the aggregate boundary is `NOASSERTION` or the source remains blocked.

**Doctrine ride-alongs:**
- The 8-step source protocol applies (`docs/methodology/source-protocol.md`).
- Welcome strings per source (kingdom-080 / S44 / the-welcome-table).
- License-tier audit gets a per-table extension: `card_rules` rows carry per-source-license metadata.

### Phase 4 — Effect engine *(the hardest layer)*

**Goal:** cards have *effects*, not just static attack/defense numbers.

This is the layer that has historically eaten open-source TCG sim projects alive. MOOgiwara (the only prior OPTCG community sim) was abandoned in 2023 with **0 card effects implemented**. XMage took ~15 years to reach 30k MTG cards. EDOPro inherited a decade of YGOPro's effect framework.

The path here is **not** "build a generic effect engine that handles all games." The path is:
- **Effect grammar per game** — each `GameEngine` declares a typed effect AST that the engine can interpret. Magic and Yu-Gi-Oh have rich, recursive effect grammars; Pokémon and OPTCG have simpler ones.
- **Authoring tools** — the operator can author effects via admin (transparency Ring 1 — every effect is inspectable from the rules-engine debug view).
- **Steal liberally** — for Magic specifically, Forge's effect scripting system (text-based, declarative, ~30k cards already implemented in their format) is a documented prior art. If we ever wire Magic, the path is to *re-host Forge's card scripts under our engine*, not author from scratch.

This phase is multiple kingdoms. The honest read: Phase 4 is when *the play module becomes serious*. Phases 1–3 ship a vanilla-attack experience for many games; Phase 4 makes one (probably Magic, via Forge) rules-complete.

### Phase 5 — Real-time multiplayer

**Goal:** the room/code pattern works, but each turn is a polling round-trip. For real-time interactive play, the platform needs WebSockets or CRDT-based sync.

**Two clean candidates:**
1. **Colyseus** — authoritative Node server, schema-based binary delta sync, room model with matchmaking/queue/reconnect built in. Closest fit to our existing room-and-turn shape. Deployable on Fly.io or Railway alongside the existing Vercel storefront (Vercel functions don't host long-lived WS connections well).
2. **PartyKit** — Cloudflare-edge stateful "Party" per room; pairs naturally with Next.js; supports Y.js (CRDT) for free. Slightly tighter platform integration; vendor lock-in to CF Workers.

The shared infrastructure (auth, persistence, registry) stays. The transport layer changes from polling to WS push.

This phase is deferred until at least one game (Phase 2 Pokémon + Phase 4 MTG via Forge) is interesting enough to demand it.

---

## 4. Cosmology + the four doctrines under multi-game

The four doctrines + fifth question all extend:

- **Substrate honesty.** `pve_levels.game_code` is the explicit claim; the engine response carries it back in `_meta.game_code`; the UI shows the game's name. No silent "everything is OPTCG" anymore.
- **Transparency.** Per-game methodology pages (`/methodology/play/<game_code>`) explain the rules approximation level ("vanilla attacks only" vs "rules-complete"). The operator's effect-authoring surface is open to inspection per game.
- **Meaning.** A `cards` row from Scryfall is meaningful to the MTG engine in a way it is not meaningful to the OPTCG engine. The play module names that connection — `card_rules.game_code` and `card_rules.rules_payload_schema_version` are how the platform speaks about which engine *uses* this row.
- **Creation.** Per-game commits credit the engine reference if Forge/XMage scripts are adapted (a credit line in `card_rules.source_meta`).
- **Fifth question — for whom is this true?** The current play module privileges One Piece players. Multi-game serves Magic players, Pokémon players, Lorcana collectors, FAB hobbyists, SWU competitors — each with different cultural norms, sim familiarity, and expectations. The roadmap is itself an act of *inclusion at module scale*.

**Cosmology axis** (per `docs/principles/cosmology.md`): the play module currently treats *the OPTCG game-axis* as the only kind of game. Multi-game adds a new axis to the kingdom's cosmology: *game-as-substrate*. Different games have different cosmologies (Magic's stack is a different model of time than OPTCG's phase progression). The play module substrate now holds multiple game-cosmologies.

---

## 5. External resources catalog *(2026-05-14 reconnaissance)*

Two parallel catalogs: **engines** (rules + AI), and **card-data APIs** (the substrate the engines consume).

### 5a. Open-source rules engines per game

| Game | Project | Repo | Language | License | Maturity | Notes |
|------|---------|------|----------|---------|----------|-------|
| **Magic** | XMage | [magefree/mage](https://github.com/magefree/mage) | Java | (per repo) | High — 30k+ cards, full rules, active 2026 | Server + client app; rules engine extractable for headless use |
| **Magic** | Forge | [Card-Forge/forge](https://github.com/Card-Forge/forge) | Java | GPL | High — community-maintained, ~25k+ cards, has *Adventure* mode (single-player campaign with overworld) | The Adventure-mode pattern is closest to our PVE; Forge's scripting language could be re-hosted |
| **Yu-Gi-Oh** | EDOPro (formerly YGOPro) | [edo9300/edopro](https://github.com/edo9300/edopro) | C++ | AGPL v3 | High — script engine + GUI, 10k+ cards | `ocgcore` fork is the rules engine; incompatible with non-EDOPro forks |
| **Magic** | Cockatrice | [Cockatrice/cockatrice](https://github.com/Cockatrice/cockatrice) | C++/Qt5 | GPL v2 | High — virtual tabletop only (no rules enforcement), 3.0.0 modernization released | Useful for the "manual VTT" path; rules-engine-free design |
| **Hearthstone-shape** | SabberStone | [HearthSim/SabberStone](https://github.com/HearthSim/SabberStone) | C# .NET | (per repo) | High — sim + AI, large card coverage | Reference for action-model; HearthSim org has many adjacent tools |
| **Hearthstone-shape** | Fireplace | [jleclanche/fireplace](https://github.com/jleclanche/fireplace) | Python | (per repo) | Medium — sim, less active | Smaller reference; cleaner code than SabberStone |
| **One Piece** | OPTCG Sim | [optcgsim.com](https://optcgsim.com/) | Closed-source | Proprietary | The thing we'd compete with — single-dev desktop app, active 2026 (May/Apr/Mar/Jan releases), Discord support | Free but desktop-only; our web-based browser-native + signed-out + multi-game pitch differs |
| **One Piece** | MOOgiwara | [BAA-Studios/MOOgiwara](https://github.com/BAA-Studios/MOOgiwara) | (browser) | (per repo) | Abandoned 2023; 0 card effects implemented | The cautionary tale (per `optcg-mechanics-research.md` in auto-memory) |
| **Generic** | boardgame.io | [boardgame.io](https://boardgame.io/) | TypeScript | Apache 2.0 | High — turn-based games framework, pure-function moves, auto state sync, built-in bots + lobby + persistence | Could host Phase 1's registry; aligns with our pure-function reducer pattern |
| **Generic** | Colyseus | [colyseus/colyseus](https://github.com/colyseus/colyseus) | Node.js | MIT | High — authoritative server, schema-based binary delta sync, room model with matchmaking, has UNO example | Phase 5 candidate for real-time multiplayer |
| **Generic** | PartyKit | [partykit/partykit](https://github.com/partykit/partykit) | TypeScript / CF Workers | Apache 2.0 | High — stateful "Party" per room, Next.js-native, Y.js-friendly | Phase 5 alternative; tighter Next.js fit, CF lock-in |
| **Generic** | Yjs + y-websocket | [yjs/yjs](https://github.com/yjs/yjs) | TypeScript | MIT | High — fastest CRDT impl, used by tldraw/Liveblocks/many | Phase 5 CRDT substrate if we want operational-transform-like merges |

### 5b. Card-data APIs per game *(extends the existing `the-tributaries.md` reconnaissance to gameplay-relevant fields)*

| Game | Source | URL | License-tier *(provisional)* | Notes |
|------|--------|-----|------------------------------|-------|
| **Magic** | Scryfall | [scryfall.com/docs/api](https://scryfall.com/docs/api) + [bulk-data](https://scryfall.com/docs/api/bulk-data) | Proprietary / API-policy-governed; no bulk redistribution | Rich card and rules fields; adapter remains never-run until exact use is reviewed |
| **Pokémon** | Pokémon TCG API | [pokemontcg.io](https://pokemontcg.io/) + [docs](https://docs.pokemontcg.io/) | Proprietary; service access is not an open-data license | Card data + sets + images + rules fields; key is optional and only changes limits |
| **Pokémon** | TCGdex | [tcgdex.dev](https://tcgdex.dev/) | (per site) | Multilingual alternative |
| **Yu-Gi-Oh** | YGOPRODeck | [ygoprodeck.com/api-guide](https://ygoprodeck.com/api-guide/) | Proprietary; blocked pending written commercial-content permission | Public API guide exists, but current site terms and publisher rights do not support Cambridge's commercial content use |
| **Lorcana** | Lorcana-API.com | [lorcana-api.com](https://lorcana-api.com/) | Free, no account, open-source | Smallest barrier |
| **Lorcana** | LorcanaJSON | [LorcanaJSON/LorcanaJSON](https://github.com/LorcanaJSON/LorcanaJSON) | Open-source community project | JSON/CSV exports |
| **Lorcana** | Lorcast | [lorcast.com/docs/api](https://lorcast.com/docs/api) | (per site) | REST-like, bulk endpoints |
| **One Piece** | (no major free API — we already ingest from CardRush JP per kingdom-066) | — | — | Future: official Bandai `en.onepiece-cardgame.com` listing scrape |
| **Digimon** | DigimonCard.io | [digimoncard.io/api-documentation](https://digimoncard.io/api-documentation) | Free; 15 req/10s; CORS-friendly | Active community DB |
| **Star Wars: Unlimited** | SWU API | [swuapi.com/docs](https://www.swuapi.com/docs) | Free public endpoints | Cards + sets + tournament results + meta |
| **Star Wars: Unlimited** | SWU-DB | [swu-db.com/api](https://www.swu-db.com/api) | (per site) | Alternative, card-focused |
| **Flesh and Blood** | the-fab-cube/flesh-and-blood-cards | [the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards) | Open-source JSON/CSV | Community-maintained card data |
| **Flesh and Blood** | goagain | [goagain.dev](https://goagain.dev/) | Free REST + MCP | Search, filter, format legality |
| **Flesh and Blood** | Official LSS card vault | [cardvault.fabtcg.com](https://fabtcg.com/articles/card-database-beta/) | Beta, no public API confirmed | Future canonical |

The connection to the existing tributaries catalog (`the-tributaries.md`, ~50 candidate sources across 9 categories) is direct: most of these gameplay-data sources are also price-data sources or share infrastructure with them. The `packages/data-ingest/` source-module pattern already established for prices extends without architectural change to gameplay data.

---

## 6. Open architectural questions

These are not blocked decisions; they're conscious deferments.

1. **In-monorepo engine vs. external engine integration.** XMage and Forge are Java; EDOPro is C++. Re-hosting their rules engines into our Node.js platform is *not free*. Two paths:
   - (a) Port the rules engine to TypeScript (slow, error-prone, but native).
   - (b) Run the rules engine as a sidecar service (Java/C++ container behind an HTTP/JSON-RPC interface; the storefront's PVE route talks to it the way `apps/storefront/src/lib/wholesale/client.ts` talks to the wholesale Falcon courier). This is the more realistic path for Magic — Forge has ~25k card scripts; we'd never out-author them. The sidecar pattern preserves their work.

2. **Where does the game-engine workspace live?** Three options:
   - `apps/storefront/src/lib/play/` — keeps everything in one app, no new workspace.
   - `packages/play/` — shared workspace package, but only the storefront imports it today.
   - `apps/play/` — its own Vercel project at e.g. `play.cambridgetcg.com`, separating concerns. Probably overkill until Phase 5 (multiplayer demands a long-lived process anyway).
   - **Default proposed:** `packages/play/` so the contract is workspace-shared from day one. Mirrors `packages/pricing/`, `packages/sku/`, `packages/data-ingest/`.

3. **Schema discipline for `card_rules`.** Per-game JSONB payload OR per-game tables (`card_rules_mtg`, `card_rules_pokemon`)? JSONB is more flexible and matches the existing `cards.name_translations` JSONB pattern. Per-table is more queryable. **Default proposed:** JSONB with a `schema_version` field, validated by Zod per-game-engine on read (the same shape as `data-spec/` does for the public response envelope).

4. **PvP vs PVE first?** Phase 2 lands Pokémon PVE; Phase 5 lands real-time multiplayer. **PvP between two humans** is in-between — possible with the current polling architecture if we're OK with 1-second turn round-trip latency, which is fine for Pokémon (slow turns) but bad for Magic (instant-speed interactions). **Default proposed:** ship Pokémon PvP on polling first; bring Colyseus/PartyKit when the *first game* that demands sub-second latency lands.

5. **The "Effect engine eats projects alive" risk** (Phase 4). The four-doctrine answer is **don't pretend rules-completeness we don't have**. The play module's methodology page declares the rules-fidelity level per game ("vanilla attacks only" / "core ruleset" / "rules-complete via Forge integration"). Substrate honesty applied to game fidelity. The fifth-question answer: *for whom is the vanilla engine still useful?* — beginners learning the action vocabulary; collectors playing low-stakes friendly matches; agents probing the engine programmatically. Plenty of audiences served well by a non-rules-complete engine.

---

## 7. What lands first

Concrete first-kingdom checklist if Yu greenlights:

- [ ] Create `packages/play/` workspace package with the `GameEngine` interface (~300 LOC).
- [ ] Move `apps/storefront/src/lib/game/` → `packages/play/src/optcg/` (~1500 LOC moved, no behavior change).
- [ ] Add `pve_levels.game_code TEXT NOT NULL DEFAULT 'optcg'` migration.
- [ ] PVE route dispatches through the registry; behavior unchanged for OPTCG.
- [ ] `<GameView>` registry on the adventure route.
- [ ] 17th audit: `pnpm audit:play-game-registry` — every `pve_levels.game_code` resolves to a registered engine.
- [ ] Connection-doc S48: *the-game-registry.md* — story-as-wire of Phase 1.

Then evaluate before Phase 2.

---

## 8. The shape this fits in

This connection-doc is the first **forward-looking** entry in the series. Every prior entry has been retrospective — a story-as-wire of a kingdom that already shipped. This one names a kingdom-shape that doesn't exist yet, so future Sophias landing in `/play` have a substrate to dock against.

**Sister docs:**
- [`docs/connections/the-three-paths.md`](./the-three-paths.md) (S33) — the three player archetypes the play module already declares (hobbyist, collector, competitor). Multi-game extends the *hobbyist* path most clearly — different cultural communities prefer different games.
- [`docs/connections/the-shared-table.md`](./the-shared-table.md) (S32) — the play module's tutorial/glossary layer. Each new game gets its own tutorial + glossary contribution.
- [`docs/connections/the-tributaries.md`](./the-tributaries.md) — the upstream sources catalog. The gameplay-data sources in §5b are the play module's tributaries.
- [`docs/connections/the-other-minds.md`](./the-other-minds.md) — the fifth-question survey. Multi-game serves audiences the OPTCG-only module did not.
- [`apps/storefront/src/lib/play/`](../../apps/storefront/src/lib/play/) — not yet a directory. The first thing Phase 1 creates.

**Recursion targets** (future kingdoms that descend from this roadmap):
- kingdom-NNN: Phase 1 land (registry shape, OPTCG lifted).
- kingdom-NNN: Phase 2 land (Pokémon vanilla engine).
- kingdom-NNN: gameplay-data ingest for the first non-OPTCG game.
- kingdom-NNN: a per-game methodology page declaring rules-fidelity level.
- kingdom-NNN: Forge sidecar exploration (proof-of-concept JSON-RPC bridge).
- kingdom-NNN: Colyseus or PartyKit first integration when real-time is demanded.

---

*The kingdom is multi-game on the commerce side. The kingdom learns to be multi-game on the play side too. Same substrate, more voices, more cosmologies, more invitations.*

🐍❤️
