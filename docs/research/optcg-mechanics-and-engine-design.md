# OPTCG mechanics + engine design — deep dive

> **Pull.** Yu, 2026-05-12: *"Do a deep dive into the game mechanics. Read the official docs and card descriptions, extract the understanding. Websearch to see if people build hobbyist version for play already. Understand how it is designed and implemented, from choosing card, abiding to the rules, shuffling, everything."*
>
> **Form.** Research synthesis — not a connection-doc, not a methodology page, not a story-as-wire. The artifact is the *understanding* of OPTCG mechanics from official sources + the survey of how hobbyists have actually built playable simulators + the design implications for our play module. Lives at `docs/research/` (new directory, sibling to `docs/connections/` / `docs/principles/`).
>
> Composes with S32 [`the-shared-table.md`](../connections/the-shared-table.md) (inclusive tutorials layer — twelve keyword glossary entries) and S34 [`the-three-paths.md`](../connections/the-three-paths.md) (three archetypes — competitor archetype is who would need a real engine first). Informs future kingdoms; does not itself ship a runtime.

---

## What this artifact is

This document is the kingdom's working understanding of OPTCG (One Piece Trading Card Game) game mechanics as of 2026-05-12, plus a survey of how third-party hobbyists have actually implemented playable simulators. It is research, not a ship. Future kingdoms that build a real match engine will start here.

The fun-first boundary from the previous kingdom still holds: this document plans the playable engine, but doesn't yet ship one. **Skill is fun; money is play-to-earn; engine choices are made for fun-first first.**

---

## Section 1 — Game state, by zone

OPTCG has **nine zones** per player, plus shared turn-level state. From the official Q&A and the cross-checked third-party rule summaries:

| Zone | Visibility | Order | Initial content | Card-state granularity |
|------|-----------|-------|-----------------|------------------------|
| **Leader Area** | public | n/a | 1 Leader card | active/rested (vertical/horizontal); attached DON; attached counters; turn-effect modifiers |
| **Character Area** | public | unordered (cap **5**) | empty | per-character: active/rested, attached DON, attached items, summoning sickness flag, [Once Per Turn] used flag |
| **Stage Area** | public | unordered (cap **1**) | empty | active/rested |
| **Hand** | private to owner | unordered, no max | 5 cards drawn + 1 mulligan opportunity | n/a |
| **Deck** | private | top-of-deck-mattering | 50 - 5 (life) - 5 (hand) = 40 cards | n/a |
| **Life Pile** | private (face-down) | top-of-pile-mattering | equal to Leader's Life value (typically 4–5) | n/a |
| **Trash** | public, ordered | most-recent on top | empty | n/a |
| **DON!! Deck** | private | n/a | 10 DON!! cards | n/a |
| **Cost Area (Active DON pool)** | public | unordered | empty | active/rested; or attached-to-leader-or-character |

Plus shared turn-state:
- Whose turn it is
- Phase within the turn
- The current declared attack (if in Battle step)
- The counter-stack mid-resolution (if any)
- Effect-resolution queue (auto-effects triggered, waiting to resolve)

**The Life Pile is private but face-down on the table** — its count is public; its contents are not (unless an effect reveals them). When the Leader is hit by a successful attack, the top card flips up; its Trigger (if any) is optionally resolved free; the card enters Hand. This is the platform's most-distinctive resource: *taking damage gives you cards*.

**Hand has no maximum size** — distinguishing OPTCG from MTG (7) and Hearthstone (10). This is load-bearing for the game economy (life flips add to hand without discarding).

**DON!! sit in three states** when in play:
- **Active** in the Cost Area (vertical; available to pay or attach)
- **Rested** in the Cost Area (horizontal; spent until refresh)
- **Attached** to a Leader or Character (granting +1000 power that turn; returns to Cost Area Rested at end of turn)

The MOOgiwara reference implementation models DON as individual `Card` objects with an `isResting: boolean` field plus an `attachedDon: Vector<Card>` array on each character — denormalized. A cleaner model is **a single integer pair per player** (`don_active`, `don_rested`) plus per-character `attached_don_count` — but you lose per-DON identity, which doesn't matter (all 10 DON cards are identical).

---

## Section 2 — Turn structure, exact order

**Five phases per turn**, in this exact order (cross-checked against official Rule Overview Sheet and TCG Protectors 2026 summary):

1. **Refresh Phase**
   - All your Rested cards become Active.
   - All your attached DON!! return to Active in your Cost Area. (Note: attached DON returns to Cost Area Rested at *End* phase of the previous turn, then becomes Active at Refresh — so by Main phase you can use them again.)
   - Effects that trigger "at the start of your turn" / "during your refresh phase" resolve here.

2. **Draw Phase**
   - Draw 1 card from your deck.
   - **The player who goes first skips this phase on Turn 1.**
   - If your deck is empty when you must draw, you immediately lose (deck-out condition).

3. **DON!! Phase**
   - Add 2 DON!! cards from your DON!! Deck to your Cost Area (Active).
   - **Player 1 adds only 1 DON!! on Turn 1.** Player 2 adds 2 DON!! starting Turn 1. (Compensates Player 2 for going second.)
   - DON!! Deck has 10 cards; the cap is reached on Turn 5 (Player 1) or Turn 4.5 (Player 2). After cap, the DON!! Phase does nothing — the player has 10 DON.

4. **Main Phase**
   - **Any-order actions**, repeated until the player chooses to end:
     - Play a Character (pay Cost = rest that many DON!!). Subject to 5-character-area cap.
     - Play an Event (pay Cost; resolve effect; send to Trash).
     - Play a Stage (pay Cost; replaces existing Stage if any).
     - Attach DON!! to your Leader or one Character (the DON becomes "attached"; +1000 power for the rest of the turn).
     - Activate an `[Activate: Main]` ability (may have its own DON cost).
     - **Declare an attack** with an Active Leader or Active Character (rest the attacker; combat resolves; see Section 3).
   - **Summoning sickness:** a Character cannot attack on the turn it was played, unless it has the **Rush** keyword. The Leader also cannot attack on its controller's first turn (Turn 1 for Player 1).

5. **End Phase**
   - Effects that trigger "at end of turn" / "[End of Your Turn]" resolve here.
   - Any attached DON!! return to the Cost Area (entering as **Rested**, so they will need next turn's Refresh to become Active again).
   - Temporary +1000 boosts from attached DON expire.
   - Turn passes to the opponent.

---

## Section 3 — Combat resolution, four steps

Attack resolution is **four sequential steps**, each with its own substeps. This is OPTCG's most-interactive moment and the place every hobbyist sim has failed to ship cleanly (see Section 6).

### Step 1 — Attack declaration

- Attacker chooses an **Active** Leader or Character they control and **rests** it.
- Attacker chooses a target:
  - The opponent's **Leader** (always a legal target).
  - One of the opponent's **Rested** Characters. Active Characters are NOT legal targets.
- `[When Attacking]` effects on the attacker resolve here (e.g., "When Attacking, +1000 power this turn"). Auto-effects fire automatically; the attacker's controller chooses among options if multiple [When Attacking] effects.

### Step 2 — Block step

- The defender may rest one of their **Active** Characters that has the **Blocker** keyword to redirect the attack.
- The Blocker becomes the new target. Blocking is optional.
- Only one Blocker per attack (you can't stack Blockers).

### Step 3 — Counter step

- The defender may **discard Cards from their Hand** to add their **Counter value** to the defending unit's power for this combat:
  - Counter values are typically +1000 or +2000 (printed on the bottom-right of the card).
  - Events with `[Counter]` in their text can be played from hand by paying their DON!! cost, adding their Counter value + any bonus effect.
  - Multiple Counters stack additively.
  - Counters expire after this combat.
- This is the only step in OPTCG with a notion of **priority/timing-back-and-forth**: the defender may decline to counter, or may add one counter and ask if the attacker has any further effects, etc. The defender's controller decides when to pass.

### Step 4 — Damage step

- Compare Attacker's effective power vs. Defender's effective power.
- **The defender survives only if `defender_power > attacker_power` (strictly greater).** Ties favor the attacker. *This is the most-commonly-miscoded rule in hobbyist sims, including my prior tutorial which said `>=`. Corrected here.*
- If the attacker wins:
  - **If the target is a Character:** the Character is K.O.'d (sent to Trash); `[On K.O.]` effects resolve.
  - **If the target is the Leader:** the defender flips the top card of their **Life Pile** face-up. If it has a **Trigger**, the defender may resolve the Trigger effect for free. The Life card then enters the defender's Hand.
- If the defender wins or ties-in-defender's-favor (impossible — ties favor attacker), no damage.
- The **Double Attack** keyword on an attacker means the Leader takes **2 Life flips** when hit by this attack (not two separate attacks; it's one attack dealing two damage).

### Win conditions

- **Knockout (primary):** When the defender's Life Pile is at zero AND a successful attack hits the defender's Leader, the defender immediately loses. (Note: hitting a Leader when Life is at zero with NO successful damage doesn't end the game; the Counter step matters even at 0 Life.)
- **Deck Out:** When a player must draw but their deck is empty, they immediately lose.
- **Special Leader Conditions:** Some Leaders have alternative win conditions (e.g., the Nami Blue Leader from OP02 wins by emptying her own deck through specific effects).

---

## Section 4 — Card text grammar (the effect language)

OPTCG card effects are **English (or Japanese) prose** with a small set of structural markers. Effects fall into four categories per the comprehensive rules:

| Category | Trigger | Example |
|----------|---------|---------|
| **Auto-effects** | A game event (entering play, being K.O.'d, attacking, end of turn, etc.) automatically triggers; resolves once per trigger | `[On Play] Look at the top 5 cards of your deck...` |
| **Activated effects** | Player chooses to activate during the appropriate window; usually has a cost (rest the card, rest DON, etc.) | `[Activate: Main] [Once Per Turn] You may rest 1 of your DON!! to...` |
| **Permanent effects** | Continuous; always-on while card is in play | `Your Characters with type "Straw Hat Crew" gain +1000 power.` |
| **Replacement effects** | Modify what would otherwise happen | `If this Character would be K.O.'d, return it to your hand instead.` |

**Structural markers in card text:**

- `[On Play]` — auto-effect fires when the card enters play (typically Character or Stage being played).
- `[On K.O.]` — auto-effect fires when this Character is K.O.'d.
- `[When Attacking]` — auto-effect fires when this card declares an attack.
- `[End of Your Turn]` — auto-effect fires during the End phase.
- `[End of Your Opponent's Turn]` — auto-effect fires during the opponent's End phase.
- `[Activate: Main]` — activated effect available during your Main Phase.
- `[Counter]` — Event card playable from hand during the Counter step.
- `[Trigger]` — auto-effect activated from the Life pile when flipped.
- `[Once Per Turn]` — modifier limiting the effect to one activation per turn (resets on phase change).
- `[Your Turn]` / `[Opponent's Turn]` — scope modifier on a permanent effect.
- `[DON!! ×N]` — condition: effect active only if N or more DON!! are attached to this card.
- `[DON!! -N]` — cost: return N DON!! from this card to the Cost Area as Active (typically used as part of activated-effect cost).
- `[Rest]` — cost: rest this card to activate.

**Keywords (single-word effect modifiers):**

- **Rush** — May attack the turn it is played (overrides summoning sickness).
- **Blocker** — May redirect an attack onto itself (Step 2 of combat).
- **Double Attack** — When this attacks a Leader successfully, the Leader takes 2 Life flips.
- **Banish** — When a Life card would be added to hand from this attacker's damage, send it to Trash instead (skipping Trigger). Some sources also use "Banish" for a separate "removed from game" zone effect; the dominant 2026 meaning is the Life-trash modifier.

**Targeting language** in effect text:
- `up to 1 of your opponent's Characters with cost X or less` — chooser-specified target with constraint
- `1 of your Characters` — chooser's choice from owner's side
- `all` — automatic; no choice
- `random` — random selection (introduces RNG mid-game)

---

## Section 5 — Setup procedure, deck construction, mulligan

### Deck construction

- **1 Leader card** of the player's choice. Defines the **colors** the deck may include.
- **50 cards exactly** (Characters / Events / Stages), each card sharing **at least one color** with the Leader.
- **Max 4 copies** per card ID (alt-arts share the card ID with the base print; "OP01-001" and "OP01-001-AA" are the same card for copy-counting purposes).
- **10 DON!! cards** in a separate DON!! Deck (these are identical pseudo-cards; the deck is provided by the game, not constructed).
- **Total: 61 cards** before life is drawn.

**As of 2026-04-01, the Block Rotation System** has rotated cards from sets **OP01 through OP04** out of the **Standard format**. Other formats (Legacy, Limited Sealed, etc.) may include them. New sets continue to add to Standard.

### Game setup procedure

1. Both players reveal their Leader cards face-up.
2. Both players shuffle their 50-card deck.
3. Both players draw **5 cards** from the top of their deck (the starting hand).
4. **Mulligan opportunity (one only).** Each player may simultaneously decide to mulligan: shuffle the 5 cards back, draw 5 new ones. One mulligan only; the second hand is kept regardless.
5. Both players place cards from the top of their deck face-down into their **Life Pile**, equal to their Leader's printed Life value (typically 4–5).
6. Both players place their DON!! Deck of 10 face-down beside their playing area.
7. Determine first player via rock-paper-scissors (or other agreed method); winner chooses to go first or second.
8. The first player begins Turn 1 with no Draw phase (they don't draw) and only 1 DON!! in the DON!! Phase (instead of 2).

---

## Section 6 — The hobbyist landscape

Three implementations dominate the hobbyist OPTCG-online space; **all three** have learned hard lessons about effect resolution.

### OPTCGSim (Batsu Apps)
- **Closed-source**, native desktop app (Windows/Mac/Linux + mobile).
- The dominant tool. Most online play happens here. Used for unofficial ranked play with seasonal community rewards.
- **Trust-based**: no rules enforcement of card effects beyond zone moves and DON cost. Players resolve effects by social agreement.
- Comprehensive card coverage (all sets, all artworks).
- No commit-reveal on shuffles; trusted-client model; works because the community uses replay video for disputes.

### MOOgiwara (BAA-Studios, GitHub)
- **Open-source**, AGPL-v3. Browser-based, multiplayer via Socket.IO. Stack: TypeScript + Phaser 3 + Express + MongoDB.
- **Last commit 2023-06-09 (abandoned at ~30% MVP).**
- **0 card effects implemented.** The entire effect engine is 49 lines (`server/src/cards/card_engine.ts`) and handles only: pay DON cost, move card from hand to character area, emit zone-update events. The only attribute parsed from card text is `[Blocker]` via `.includes()`.
- **Stuck on the Counter step.** The team chose a Legends-of-Runeterra-style spell-stack model for counters; built the UI shell (`client/src/game/counter_stack.ts`); never wrote `resolve()`. The Counter step is OPTCG's most-interactive moment and the design wall.
- **Wire format is brittle.** Full-zone snapshots via stringly-typed Socket.IO events; `js-sdsl Vector` internal field names leak through the wire. Issue #38 ("Enumerated Packet Headers") still open.
- **Server-authoritative with cheat-logging**: `if (player.getUnrestedDonLeft() < card.cost) { console.log("Potential Player Cheating/Desync"); return; }` — logs and returns silently; never reconciles the client UI.
- **Card data shape is reusable.** 235-entry JSON dictionary covering OP01 + ST01–ST04 + promos, keyed by card ID, with the fields Bandai publishes. A scraper repo exists (`OPTCG-Metadata-Scaper`).

### Tabletop Simulator OPTCG mods
- Community-built mods on the commercial TTS platform.
- **Pure tabletop simulation** — zero rule enforcement. Players manipulate cards by hand. Closest digital approximation to playing in-person.
- The model the platform-trust-based OPTCGSim copies.

### Shared lessons

1. **No hobbyist has shipped a real card-effect engine for OPTCG.** Not one. The closest is MOOgiwara's empty `resolve()`. This is the **hardest single thing** to build: the language of card effects is open-ended natural language, and translating to a typed effect-token DSL requires per-card authoring (every printed card needs a structured rep).
2. **The Counter step is the design wall.** It's the only step with back-and-forth timing. Skipping it means social-agreement play. Modeling it means priority-passing + counter-stack + effect ordering.
3. **Trust-based works for hobbyists, not for ranked.** OPTCGSim's community runs ranked seasons by social trust + replay video. Any platform offering prizes (the future play-to-earn opt-in) cannot rely on social trust.
4. **Card-data scraping is the easy part.** Bandai publishes everything; scrapers exist. The data format is settled.
5. **Phaser-for-everything is a trap.** MOOgiwara's choice to render menus, deck builder, and lobby in Phaser (a canvas game engine) committed a lot of UI work to a non-DOM substrate. DOM is faster for non-game-canvas UI.
6. **Wire format choice is forever.** MOOgiwara cannot refactor away the `js-sdsl Vector` field names because the client depends on them. Pick the wire format with care; prefer **event-sourced** moves (each player action is a discrete event) over **state snapshots** (which leak internal representations).

---

## Section 7 — Design implications for our play module

If/when this platform ships a real OPTCG engine, the choices to make:

### Choice 1: Effect representation — data vs code

- **Data-driven** (typed effect tokens): every card's effect is a JSON shape like
  ```json
  [
    { "trigger": "onPlay", "action": "ko_opponent_character",
      "target": "choose", "filter": { "cost_lte": 4 } }
  ]
  ```
  A single resolver interprets every card. **Pro:** card data ships without code; non-engineers can author. **Con:** OPTCG's effect surface is wide (~50+ unique effect templates); the DSL must cover all of them.

- **Code-driven** (per-card handler functions): every card has a `.ts` file with `onPlay(state, ctx)`. **Pro:** maximum expressivity; any rule can be coded. **Con:** every card needs an engineer; 235 cards × 2 minutes each = 8 hours minimum for OP01 alone, and we're at OP10+.

- **Hybrid recommended:** 80% of cards covered by a typed-token DSL; an "escape hatch" code-handler for the 20% with complex interactions. This is the model Hearthstone and Eternal use.

### Choice 2: State representation — diff vs snapshot

- **Event sourcing** (each player action is an event; state is derived): aligns with the Scribe's bookshelf doctrine (S8). Replay system is free. Audit is free. Bandwidth is minimal (one event per action vs entire zone snapshot per change).
- **Snapshot streaming** (server sends full zone state on every change): MOOgiwara's approach. Simpler initially; brittle long-term.

**Recommend event sourcing.** The Scribe's `match_lifecycle_log` (S18) already records every move; the wire format should match.

### Choice 3: Rule enforcement — server-authoritative

- **Server-authoritative** is the only viable choice for ranked / prized play.
- Client sends intents; server validates against game state; server emits the canonical resulting event.
- Validation must cover: zone legality, cost payment, color matching, summoning sickness, [Once Per Turn] tracking, target-legality, counter-stack ordering, blocker eligibility.

### Choice 4: Shuffle — witnessed multi-party randomness for ranked

- For casual play: server-side `crypto.randomBytes`-seeded Fisher-Yates is fine.
- For ranked / prize play: **multi-party commit/reveal.** Each player commits to independently generated entropy before deck reveal; the server combines both values under a specified shuffle. Later reveal can reconstruct deck order, and one honest unpredictable contribution prevents the server or other player from choosing it alone. This does not prove all cheating absent; action validation and an externally retained transcript remain separate requirements.
- The bounty receipt code supplies hashing and replay primitives, but its current server-only entropy is not the ranked threat model.

### Choice 5: The Counter step

- The single most interactive moment. Needs a **priority-passing protocol**:
  - Server enters Counter Step state.
  - Defender has priority. Defender may discard a Counter card from hand OR pass.
  - Each discard adds to the counter stack. Server emits the new defender-power-this-combat.
  - Attacker may add effects (rare; most "When Attacking" effects already resolved).
  - When both players pass consecutively, Counter Step ends; Damage step begins.
- **Async-friendly variant:** each pass has a server-enforced deadline tied to the player's `response_window_hours`. A player who exceeds their deadline auto-passes.

### Choice 6: Async match support

- The Asynchronous from `the-other-minds.md` and S22 should compose with the engine: every turn the active player has up to their declared `response_window_hours` to act. After that, auto-pass.
- Async-friendly UI: the match doesn't need both players present simultaneously. State is persistent; pickup-where-you-left-off is the default.

### Choice 7: Card-data licensing

- The card *data* (names, text, costs, power values, art URLs) is **published by Bandai** but commercial reproduction requires their license.
- The card *art* is copyrighted by Bandai/Toei.
- Most hobbyist sims rely on tolerated fair use; a commercial platform should obtain proper licensing for ranked / prized play.

---

## Section 8 — Glossary of effect-text vocabulary

Beyond the twelve terms our current `/api/v1/play/glossary` carries, the comprehensive vocabulary includes:

| Term (EN) | Term (JA, romaji) | Category | Notes |
|-----------|-------------------|----------|-------|
| Mulligan | マリガン (marigan) | setup | One-time at game start |
| Don deck | ドンデッキ (don dekki) | zone | 10 identical DON!! |
| Cost area | コストエリア (kosuto eria) | zone | The active DON pool |
| Character area | キャラエリア (kyara eria) | zone | Max 5 |
| Stage area | ステージエリア | zone | Max 1 |
| Trash | トラッシュ | zone | Discard / graveyard |
| Refresh phase | リフレッシュフェイズ | phase | First phase |
| Don phase | ドンフェイズ | phase | Third phase |
| Battle phase | (subsumed in Main, but term used) | phase | OPTCG groups attack into Main; some sources call it Battle Phase |
| Summoning sickness | (no native term; called out implicitly) | rule | Can't attack turn played without Rush |
| Once Per Turn | (per turn no koka) | modifier | Effect modifier |
| Double Attack | ダブルアタック | keyword | 2 Life flips on hit |
| Banish | バニッシュ | keyword | Life→Trash instead of Hand |
| On Play | 登場時 (tōjō ji) | timing | "On entering play" |
| On K.O. | KO時 (KO ji) | timing | "On being defeated" |
| When Attacking | アタック時 | timing | "On declaring attack" |
| End of Your Turn | あなたのターン終了時 | timing | End-phase trigger |
| Activate: Main | メイン (mein) | timing | Main-phase activated |
| Trigger | トリガー | timing | Life-flip free effect |
| Counter | カウンター | timing | Discard during Step 3 |
| Power | パワー (pawā) | attribute | Combat number |
| Cost | コスト | attribute | DON to play |
| Life | ライフ | attribute | Leader's life total |
| Attribute | 属性 (zokusei) | attribute | Slash / Strike / Special / etc. |
| Type | タイプ | attribute | Faction (Straw Hat Crew / etc.) |
| Color | 色 (iro) | attribute | Red / Green / Blue / Purple / Black / Yellow |

The existing `/api/v1/play/glossary` carries 12 terms; **the full set is closer to 50+ terms**, which the glossary corpus should grow toward over time.

---

## Section 9 — What's still missing from this research

This document is honest about what it doesn't cover:

1. **The Comprehensive Rules PDF v1.2.0** was not directly read (binary fetch + no poppler-utils on this machine). All cited rule text comes from third-party rule summaries cross-checked. A future research pass should extract the PDF locally and reconcile.
2. **The complete keyword corpus** beyond what's listed. Newer sets (OP09+) introduce keywords this document doesn't cover. Bandai's Q&A page (https://en.onepiece-cardgame.com/rules/) hosts the canonical list.
3. **Tournament-specific rules** (sideboarding format, regional variations, deck registration timing). Tournament Rules Manual PDF available; not parsed here.
4. **Edge cases:** what happens when multiple [On K.O.] effects trigger simultaneously? Bandai publishes a "Q&A" series per set; resolving every edge case requires reading those.
5. **Specific card abilities** vs. general keyword behavior — many cards have unique non-keyword effects (e.g., "K.O. up to 1 of your opponent's Characters with 4000 power or less"). These need a per-card encoding.
6. **The Block Rotation impact** on Standard meta. Block 1 (OP01–OP04) rotated April 2026; the current legal pool starts at OP05.

---

## Sources

The web research drew from:

- [Official ONE PIECE CARD GAME — Rules](https://en.onepiece-cardgame.com/rules/) (Bandai)
- [Official Comprehensive Rules v1.2.0 PDF](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf) (binary; not directly read)
- [Official Q&A General Rules PDF](https://en.onepiece-cardgame.com/pdf/qa_rules.pdf)
- [Official Rule Manual PDF](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf)
- [TCG Protectors — One Piece Card Game Rules 2026](https://tcgprotectors.com/blogs/one-piece-player-guides/one-piece-card-game-rules-2026-explained)
- [one-piece-tcg.com — Complete Game Rules](https://one-piece-tcg.com/guides/one-piece-tcg-game-rules-guide)
- [OPTCGSim — Unofficial Practice Tool](https://optcgsim.com/) (closed-source hobbyist sim, dominant)
- [MOOgiwara — open-source multiplayer sim (GitHub, BAA-Studios)](https://github.com/BAA-Studios/MOOgiwara)
- [OPTCG.dev](https://optcg.dev/)

---

## Recursion targets

For future research / engineering kingdoms:

→ **Install poppler-utils on the dev machine** and re-fetch the Comprehensive Rules PDF; reconcile cross-checked findings against the official text.

→ **Card-data licensing conversation with Bandai** — required before shipping a real engine for prized play.

→ **Effect DSL design.** Sketch a typed effect-token JSON shape that covers the OP01–OP08 effect surface. Validate against random sampled cards.

→ **Witnessed multi-party shuffle protocol** for ranked. Reuse only the hashing/replay primitives from `apps/storefront/src/lib/provable-draw/`; add player entropy and externally retained match evidence.

→ **Async match engine** prototype. The Asynchronous's column `response_window_hours` becomes the per-turn deadline. The Counter step's priority-passing must be async-friendly.

→ **Card-data scrape on schedule.** Bandai releases new cards monthly. Whoever ships the engine needs an ingest pipeline (the data-ingest substrate from kingdom-060/062 is the right foundation).

→ **The Counter step's interactive design.** This is where every hobbyist sim has died. A clean priority-passing model, async-deadline-friendly, with clear UI affordances, is the highest-leverage thing to design first.

---

*This is the kingdom's working understanding of OPTCG as of 2026-05-12. Research, not a ship. The play module's fun-first boundary still holds; this document plans the playable engine that would, when shipped, serve the Competitor archetype and (under play-to-earn opt-in) the prize layer. **Skill is fun; money is play-to-earn; engine choices are made for fun-first first.***

*— Sophia (Opus 4.7, 1M context), 2026-05-13. Synthesized from official Bandai rule sources + cross-checked third-party summaries + sub-agent deep dive into MOOgiwara open-source codebase. Composes with S32 (the-shared-table.md — inclusive tutorials), S34 (the-three-paths.md — three player archetypes), and the play-to-earn future feature.*

🐍❤️
