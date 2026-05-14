# OPTCG playmat layout + tournament rules + ban list — deep dive

> **Pull.** Yu, 2026-05-14: *"NOW LOOK INTO THE CARD POSITIONING!!!! THE OFFICIAL GUIDE, PLAY MAT LAYOUT, WEBSEARCH THE RULES FROM OFFICIAL TOURNAMENTS!!! BAN LISTS!!! PREVIOUS METAS!!!!!"*
>
> **Form.** Research synthesis, the third in the OPTCG family. Companions:
> - [`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md) — kingdom-068, rules + sim landscape (zones at the data-state level)
> - [`optcg-meta-evolution-and-deckbuilding.md`](./optcg-meta-evolution-and-deckbuilding.md) — meta arc OP01–OP15, six template decks, ban-list history through April 2026 (partial)
> - **this doc** — the **physical playmat** (where each zone sits on the table from a player's perspective), the **2026-current tournament/ban-list state** with primary-source citations, and an **engine-gap audit** naming which official rules our engine enforces vs. which it doesn't
>
> Composes with the multi-game roadmap (S47) and the registry kingdom (S48). The gap audit feeds the per-game rules-fidelity declaration each engine should publish.

---

## What this artifact is

The kingdom's working understanding of the **physical playmat layout** and **2026-current tournament rules** as of 2026-05-14, cited primary-source against Bandai's own PDFs:

1. **Comprehensive Rules** v1.2.0 (last updated 2026-01-16) — [`asia-en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf`](https://asia-en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf)
2. **Official Rule Manual** (last updated 2023-06-23, content stable) — [`en.onepiece-cardgame.com/pdf/rule_manual.pdf`](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf)
3. **Tournament Rules Manual** — [`en.onepiece-cardgame.com/pdf/tournament_rules_manual.pdf`](https://en.onepiece-cardgame.com/pdf/tournament_rules_manual.pdf)
4. **Floor Rules** v1.6.0 (last updated 2025-10-10) — [`en.onepiece-cardgame.com/pdf/floor_rule.pdf`](https://en.onepiece-cardgame.com/pdf/floor_rule.pdf)
5. **Banned/Restricted Cards** effective 2026-04-01 — [`en.onepiece-cardgame.com/topics/029.php`](https://en.onepiece-cardgame.com/topics/029.php)
6. **Block Rotation System** — [`en.onepiece-cardgame.com/rules/blockicon-card/`](https://en.onepiece-cardgame.com/rules/blockicon-card/)

PDFs were fetched, text-extracted via `pdftotext -layout`, and the relevant sections are quoted with line citations where applicable.

---

## Section 1 — The playmat: official zone layout

The Bandai-licensed playmat has **eight numbered zones** per player, plus the symmetrical opponent layout opposite. From the official Rule Manual, the zone list:

| # | Zone | Description (Bandai's wording) |
|---|------|--------------------------------|
| ❶ | **Character area** | "Where your Character cards are placed." Max 5. |
| ❷ | **Leader area** | "Where your single Leader card is placed. Your Leader card should remain face-up from the start of the game." |
| ❸ | **Stage area** | "Where your Stage cards are placed. A maximum of 1 card can be placed at a time." |
| ❹ | **Deck** | "Where your deck is placed." |
| ❺ | **Trash** | "Where Character cards that have been K.O.'d in battle and Event cards that have been activated are placed." |
| ❻ | **Cost area** | "Where DON!! cards from your DON!! deck are placed." (i.e. the active/rested DON pool) |
| ❼ | **DON!! deck** | "Where your DON!! deck is placed." |
| ❽ | **Life** | "Where cards equal to the Life value of your Leader are placed face-down." |

Per the manual: *"The Leader area, Character area, Stage area, and cost area are collectively referred to as the **field**."*

### Spatial arrangement (player-perspective)

From the diagram in the official Rule Manual:

```
═══════════════════════════════════════════════════════════════════ table edge / opponent side mirrored ═══

                                                                                            ╔══════════╗
                              ❶  CHARACTER AREA   (max 5 slots)                             ║          ║
                                                                                            ║ ❶ Char.  ║
   ╔════╗                       ┌─────┬─────┬─────┬─────┬─────┐                            ║   slot 1 ║
   ║ ❽  ║                       │     │     │     │     │     │                            ║          ║
   ║Life║                       │ C1  │ C2  │ C3  │ C4  │ C5  │                            ╚══════════╝
   ║stk │                       │     │     │     │     │     │
   ║face│                       └─────┴─────┴─────┴─────┴─────┘                            (Character area
   ║-dn │                                                                                    drawn as a single
   ╚════╝                                                                                    row of five slots;
                                                                                             official mats show
                                                                                             1–2 staggered rows
                                                                                             for visual room)


                              ❷ LEADER             ❸ STAGE              ❹ MAIN DECK
                              ┌─────┐              ┌─────┐               ┌─────┐
                              │     │              │     │               │ ░░░ │
                              │  L  │              │  S  │               │ ░░░ │  ← top of
                              │     │              │     │               │ ░░░ │    deck here
                              └─────┘              └─────┘               └─────┘
                              (face-up,            (max 1)               (face-down stack;
                               immobile)                                  open in only count,
                                                                          private in content)


   ╔════╗                       ❻ COST AREA (Active DON!! pool)                              ❺ TRASH
   ║ ❼  ║                       ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐         ┌─────┐
   ║DON!!║                       │ D  │ D  │ D  │ D  │ D  │ D  │ D  │ D  │ D  │ D  │         │ ░░░ │
   ║deck║                       │act │act │rst │rst │rst │att │att │att │att │att │         │ ░░░ │  ← K.O.'d
   ║face│                       └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘         │ ░░░ │    chars,
   ║-dn │                       (active = vertical; rested = horizontal;                     └─────┘    activated
   ╚════╝                        attached = physically placed under Leader/Character)                   events
                                                                                                       (face-up
                                                                                                       stack)

                                                       ◀  HAND (held in player's hand, not on mat)  ▶

═══════════════════════════════════════════════════════════════════ player edge ═══
```

Some characteristics that the diagram alone doesn't capture, sourced from Comprehensive Rules sections 3-3 through 3-10:

- **Leader area (3-6)** — open; Leader is face-up and **cannot be moved from this area** by any card effect or rule. The Leader stays put for the whole game.
- **Character area (3-7)** — open; face-up; **max 5** cards (3-7-6). If you play a sixth, you must trash one already there (3-7-6-1). The trash for the make-space rule is a *rule action*, not an effect, so it can't be replaced or intercepted (3-7-6-1-1).
- **Stage area (3-8)** — open; face-up; **max 1**; Stage cards enter as active by default.
- **Hand (3-4)** — secret to opponent. Owner may view and reorder freely. **No maximum hand size.** This is load-bearing to the OPTCG economy.
- **Deck (main, 3-2)** — top-of-deck-matters; private contents; *only the count* is visible to both players.
- **DON!! deck (3-3)** — face-down stack, but **open**: both players may freely view contents and order, and either player may reorder. (Surprising but true — the DON!! deck is not a secret resource.)
- **Cost area (3-9)** — open. Both players see the active/rested split. Players may reorder their own DON freely.
- **Trash (3-5)** — open; face-up stack; either player may view and reorder (with permission). Newly-trashed cards land **on top of** the existing stack (3-5-3, paraphrased).
- **Life area (3-10)** — **secret to BOTH players** unless an effect reveals. Face-down, neither player can check contents nor reorder. Unique-to-OPTCG: the resource that opposing decks attack *is hidden from the defender too* until a hit flips it.

### Engine note — what our code reflects today

Our `apps/storefront/src/lib/game/types.ts` lines 6-21 declares `CardZone` with these tokens: `leader | field | stage | hand | life | trash | don_active | don_rested | don_deck | deck`. Matches the official zones 1:1, with `field` standing in for the official "Character area" and DON broken into three sub-zones (active / rested / deck) instead of one merged area. Our model is correct; only the naming differs ("field" → "character area").

What our model does *not* yet enforce, that the official rules require:
- Character area cap of 5 with the "trash to make room" rule (`reducer.ts move_card` would happily put a sixth Character on field).
- Stage area cap of 1.
- Color matching between Leader and main deck (4 max copies but **only colors on the Leader card**).
- Leader area immutability (3-6-3).
- Hand secrecy from opponent in spectator views.
- Life-area secrecy from owner (we currently store `life: GameCard[]` server-side and the owner could in principle peek client-side; the client UI doesn't surface contents, but the model isn't constrained).

These are *Phase 4 rules-fidelity* concerns (per S47's roadmap). Phase 1 (the registry, S48) and Phase 2 (Pokémon shipping next) don't need them. But the gap is worth naming.

---

## Section 2 — Tournament rules (from `tournament_rules_manual.pdf`)

### 2.1 Deck construction (§2.1.1, p. 11)

Quoting directly:

> - **Leader card:** 1 card
> - **Deck:** A total of **50 cards**, made up of Character cards, Event cards and Stage cards.
> - Only cards of a color included on the Leader card can be included in a deck. Cards of a color not included on the Leader card cannot be added to a deck. A deck can contain no more than **4 cards with the same card number**.
> - **DON!! deck:** A total of **10 DON!! cards**.
>
> *No more than four copies of the same card can be included in a deck. **No side decks are permitted.***

The "no side decks" is doctrinal: OPTCG is a pure 1-deck format, distinct from MTG's sideboard model. Best-of-three play swaps no cards between games.

### 2.2 Tournament formats (§3.3, p. 14)

| Format | Definition |
|--------|-----------|
| **Constructed** | Players bring a tournament-legal deck. The default. |
| **Sealed** | Players receive specific event product during the players meeting and construct a legal deck from that product only. |
| **Draft** | Players receive **six booster packs** from a booster box and draft cards in pods of **four**. Following the draft, players construct their deck from their drafted pool. |

### 2.3 Tournament structure (§3.4)

- **Single-Elimination** — half eliminated per round; one undefeated player wins.
- **Swiss Rounds** — pairings by W/L record (3 points win, 1 draw, 0 loss); no eliminations; players may drop voluntarily.
- **Swiss + Single Elimination Top Cut Finals** — Swiss qualifying then bracket finals; used for **Level 3 Professional** events.

### 2.4 Match structure (§3.5, p. 16)

| Stage | Format | Match Time | Extra Time |
|-------|--------|------------|------------|
| Online Standard | **Best-of-one** (1 win needed) | **35 min** | 5 min |
| Standard (Qualifying) | **Best-of-one** | **30 min** | 5 min |
| Top Cut Finals | **Best-of-three** (2 wins) | **60 min** | 10 min |
| Championship Top 2 | **Best-of-three** (2 wins) | (per event) | (per event) |

This is unusual relative to MTG (BO3 from the start). OPTCG defaults BO1 through Swiss qualifying and only goes BO3 in the top cut. Match-decision under time runs by life-count tiebreaker per the floor rules (not quoted here in full; see Floor Rules v1.6.0).

### 2.5 Deck list requirements (§3.7-ish, p. 17)

- **All Championship level events require deck lists.** Decks must match the submitted list.
- Lists must include **collector number + full card name** (no shorthand).
- Players that fail deck-list rules may receive penalties up to Game Loss.

### 2.6 Materials, sleeves, proxies (Floor Rules v1.6.0)

- **No counterfeit cards** (photocopies, handmade substitutes) in any tournament — total ban.
- All cards in the main deck must be sleeved in the **same type of opaque sleeve**.
- **Up to two sleeves per card** are permitted.
- Misregistered, manufacturing-marked, or distinguishable-back cards are not permitted.

### Engine note — what our model enforces

- **Deck size ≥ 10** is the client check in `/play/page.tsx handleStartBattle`; the server's enforcement is the same minimum (`route.ts` line ~107: `playerDeck.length < 10`). The official deck size is **exactly 50 main + 1 leader + 10 DON**; our PVE accepts decks as small as 10 cards because the game-engine doesn't run the full life-deck-pool math the same way for PVE.
- **Max 4 copies** — not enforced. The deck-builder UI may impose this (deck-builder code not surveyed here); the PVE start does not.
- **Color-matching** — not enforced. A player can submit a deck of any colors against any Leader; the engine just runs the action loop.
- **Format legality / ban list** — not enforced. The engine doesn't read the ban list at all.

For PVE this is fine — the experience is "play with whatever deck you built." For future PvP / tournament-mode play, all four would need to land. They're not on Phase 1 or Phase 2 of the roadmap; they're Phase 4-adjacent.

---

## Section 3 — Banned & restricted list (current, effective 2026-04-01)

Source: [Bandai's official topic page](https://en.onepiece-cardgame.com/topics/029.php), fetched 2026-05-14.

### Current banned list

| Code | Name | Type | Status | Bandai's stated reason |
|------|------|------|--------|------------------------|
| **OP06-047** | Charlotte Pudding | Character | **Banned** | "It significantly undermines the mind games based on hand size which is the appeal of the ONE PIECE Card Game." (On-Play forces opponent to shuffle hand into deck and draw 5.) |
| (Prior bans pre-2026-04-01) | (see history table §3.3) | | | |

### Cards removed from restriction (un-banned/un-restricted, 2026-04-01)

| Code | Name |
|------|------|
| **OP07-045** | Jinbe |
| **EB01-059** | Kingdom Come |
| **ST06-015** | Great Eruption |
| **OP02-024** | Moby Dick |
| **OP03-098** | Enies Lobby |
| **OP02-117** | Ice Age |

Bandai's note: *"considering changes to the game environment"* — i.e. the April rotation removes the Block 1 substrate these cards were oppressive in. (OP02 and OP03 cards rotated out of Standard anyway via Block 1 rotation, so their unbans matter only for Extra Regulation.)

### 3.3 — Ban list history (cross-period summary)

Pulled from secondary sources (OnePiece.GG, OnePiecePlayer, Spell Mana) and cross-checked. Definitive history would require diffing each Bandai topic page across the past 30+ months; the summary below is current to 2026-04-01.

| Effective date | What changed | Notes |
|---|---|---|
| 2023-11-10 | OP03-013 Marco **restricted** | Lifted 2023-12-08 |
| 2024-06-21 | **OP05-041 Sakazuki** (Leader), **ST06-015 Great Eruption**, **OP06-116 Reject** all **banned** | Sakazuki dominated post-OP05 for ~6 months. Bandai issued a promo Sakazuki with different ability as replacement. |
| 2024-08 (pre-OP08) | **ST10-001 Trafalgar Law** (Leader), **OP03-098 Enies Lobby** **banned** | Trafalgar Law replaced with a promo version. |
| 2025-04-01 | 4 cards added to banned/restricted list | English + Japanese simultaneous. |
| 2025-08-30 | **Prohibited Pairs system** introduced | Some cards now flagged as "Card A" / "Card B" — if A is in deck, none from B can be; and vice versa. New mechanism for restraining oppressive *combinations* rather than single cards. |
| 2026-04-01 | **OP06-047 Charlotte Pudding banned**. Six prior restrictions lifted (Jinbe, Kingdom Come, Great Eruption, Moby Dick, Enies Lobby, Ice Age). | Coincided with Block 1 rotation. |

### 3.4 — Block rotation (effective 2026-04-01)

Source: [Bandai's rotation page](https://en.onepiece-cardgame.com/rules/blockicon-card/) + secondary aggregators.

Cards now carry a **block number** in the bottom-right corner. Standard format rotates annually; up to **8 blocks** are legal at any time, with Block 1 retiring April 2026.

| Block | Sets covered | Legal in Standard 2026-04-01+ |
|-------|--------------|-------------------------------|
| **Block 1** | OP01–OP04, ST01–ST09 | **No — rotated out (Eternal/Extra Regulation only)** |
| **Block 2** | OP05–OP08, EB01, ST10–ST14 | Yes |
| **Block 3** | OP09–OP12, ST15+ | Yes |
| **Block 4** | OP13–OP16 | Yes |

**Extra Regulation** format allows all blocks. Locals may run either format depending on player base.

**Exception:** there are **27 cards** with Manga Rare versions that remain permanently legal across all formats regardless of block. These are explicitly listed on the official rotation page.

### Engine note — ban list awareness

Our engine does not consult the ban list, the prohibited-pairs registry, or the block rotation. This is correct for the current scope (PVE only, with a 10-card minimum that hardly resembles a real deck), but it's a hard requirement for:
- **Deck-builder validation** — Phase 3 work. The deck-builder UI should refuse to save a deck containing banned cards in Standard format, and should warn on prohibited-pair violations.
- **PvP rooms** — when those open up to tournament-format play, the room-setup screen needs a format selector (Standard / Extra Regulation / Casual) with corresponding legality checks.
- **Future card_rules data** — when Phase 3 ships the gameplay-data ingest, each card row should carry `block_number` (1–4+) and a `restricted_in` field listing the formats it's banned/restricted in.

---

## Section 4 — Current meta (May 2026)

Source: [OnePiece.gg tier lists](https://onepiece.gg/tier-lists/), [OPTCG Top Decks](https://onepiecetopdecks.com/), [Limitless TCG](https://onepiece.limitlesstcg.com/). Post-rotation, post-Pudding-ban state.

### Tier 1 (current Standard, post 2026-04-01)

- **Purple Enel (OP15-058)** — the headline post-rotation deck. Unique DON!! limitation mechanic; powerful 6-cost threats. Heavy tournament representation.
- **Monkey D. Luffy (OP15-098)** — newer Leader, established as top-tier.
- **Lucy (OP15-002)** — Worlds-relevant aggro/midrange.

### Tier 2 (still competitive, mostly OP11-onward)

- **Blue/Yellow Nami (OP11-041)** — control/value, formerly Tier 1.
- **Dracule Mihawk (OP14-020)** — was arguably best deck pre-rotation; now has unfavorable matchups against the new Tier 1 trio.
- **Hancock (OP14-041)**, **Crocodile (OP14-079)** — Seven Warlords cards from OP14 still in play.

### What rotated out / fell off

- **Sakazuki (OP05-041)** — was banned in 2024; OP05 still legal (Block 2) but the leader is gone.
- **Rob Lucci (OP07-079)** — Block 2 legal, but the supporting black-control package partially rotated.
- **Red Shanks (OP09-001)** — Block 3 legal, less dominant in the new meta.
- **Red Zoro (OP01-025)** — rotated with Block 1.
- **Yellow Enel (OP03-???)** — original Yellow leader rotated; Purple Enel (OP15-058) is the successor.

The existing [`optcg-meta-evolution-and-deckbuilding.md`](./optcg-meta-evolution-and-deckbuilding.md) §4 has full template-deck breakdowns for Purple Enel, Blue/Yellow Nami, Black Rob Lucci, Red Shanks, Yellow Enel, and Red Zoro. That doc is now ~1 month stale relative to the April 2026 rotation but the archetype theory remains accurate.

### Engine note — meta-aware AI

The PVE engine's `generateAIDeck(setCode, catalog)` builds AI decks from a single set's catalog (typically OP01 for the entry-level levels). It does **not** synthesize meta-aware AI decks — the AI's deck quality is whatever a same-set shuffle produces. For Phase 4 (effect engine + meta-aware AI), the meta tier data above would be the input to a "build the AI a Tier-2 deck for level 10+" routine.

---

## Section 5 — Engine-gap audit (what we enforce vs what we don't)

A compact mapping from official rule → our engine, with status:

| Rule (source) | Engine status | Notes |
|---------------|--------------|-------|
| 8-zone playmat layout | ✅ Modeled | Zone vocabulary in `types.ts` matches 1:1 with naming caveat (field vs character_area). |
| Character area max 5 | ⚠️ Partial | Engine has `field: GameCard[]` with no cap. UI on `/play/adventure/[levelId]` shows 5 slots. Server doesn't enforce. |
| Stage area max 1 | ⚠️ Partial | Same — `stage: GameCard | null` constrains type but no server-side check on `move_card` to stage. |
| Leader is face-up + immobile | ✅ Modeled | `leader: GameCard | null`; never gets reassigned by `move_card`. |
| Hand has no max size | ✅ Modeled | `hand: GameCard[]` unbounded. |
| Life area secret to both players | ⚠️ Partial | Server stores life contents; client UI doesn't surface them; spectator-view leak risk if added later. |
| DON!! deck is open (visible to opponent) | ⚠️ Partial | UI shows count only; both-players-can-view-contents not surfaced (current count-display matches a common house rule). |
| Cost area is open | ✅ Modeled | UI shows active/rested DON to both players. |
| Trash is open + face-up + ordered | ✅ Modeled | `trash: GameCard[]`; UI's Game Log shows trash events. |
| Turn order: Refresh → Draw → DON → Main → End | ✅ Modeled | `phase` enum + `next_phase` action. |
| Player going first doesn't draw on turn 1 | ⚠️ Unverified | Need to check engine logic; the rule manual is explicit. |
| Player going first places only 1 DON on turn 1 | ⚠️ Unverified | Same — engine's `add_don` may not gate on turn 1 + first-player flag. |
| Combat: attacker > defender (defender wins ties) | ✅ Modeled | Reducer enforces (per existing kingdom-068 research). |
| Counter step | ⚠️ Partial | Engine has the `attack` action but Counter cards' grammar is not implemented (no effect engine yet). |
| Blocker keyword | ⚠️ Partial | Same — keyword exists in data, no enforcement. |
| Trigger keyword on life flip | ⚠️ Partial | Life-card-to-hand modeled (`take_damage`); Trigger effect-text not interpreted. |
| Deck construction: 1 Leader + 50 main + 10 DON | ❌ Not enforced | PVE accepts 10+ card decks. Tournament-format deck-builder would need this. |
| Deck construction: max 4 copies by card number | ❌ Not enforced | Same. |
| Deck construction: colors restricted to Leader's colors | ❌ Not enforced | Same. |
| Banned cards | ❌ Not enforced | Engine doesn't read the ban list. |
| Prohibited pairs | ❌ Not enforced | Same. |
| Block rotation (Standard vs Extra Regulation) | ❌ Not enforced | Same. |
| Best-of-one / best-of-three match structure | ❌ Not modeled | We have single-game rooms; no match concept. |
| Match time limits | ❌ Not modeled | No tournament round timer. |
| Deck list submission for Championship events | ❌ Not modeled | Out of scope until competitive PvP. |
| Sleeves + counterfeit policy | N/A | Physical concern; doesn't apply to digital VTT. |

**Summary:** the engine ships a faithful representation of the **game's substrate** (zones, phases, action vocabulary, basic combat) but is intentionally **rules-incomplete** at the *card-effect*, *deck-construction-format*, and *match-format* layers. This matches S47's Phase 4 boundary — effect-engine work is the layer that has historically eaten OSS TCG sims alive.

Per S47, the substrate-honest declaration is to publish a **rules-fidelity level** on the per-game methodology page. For OPTCG today: **"core ruleset, vanilla effect interpretation only"** — the engine plays turns and attacks and DON-pooling and life-card draws, but does not interpret card effects, does not enforce tournament deck construction, does not consult the ban list. That's what the Hobbyist and Beginner archetypes can use today (per S33 three-paths); Competitor-archetype play that demands rules-completeness is Phase 4 work.

---

## Section 6 — What to ingest into `card_rules` (Phase 3 preview)

When Phase 3 ships the gameplay-data ingest layer, OPTCG card rows should carry the following per-card fields beyond what the existing `cards` table already has:

| Field | Source | Type |
|-------|--------|------|
| `colors` | Bandai card text (hexagon bottom-left) | string[] (R/G/B/P/Bk/Y) |
| `power` | Bandai card text (Leader + Character only) | number |
| `cost` | Bandai card text (Character/Event/Stage) | number |
| `counter` | Bandai card text (Character only) | number (0, 1000, 2000) |
| `attribute` | Bandai card text | string (Slash, Strike, etc.) |
| `traits` | Bandai card text | string[] |
| `effect_text` | Bandai card text | string (raw text, with [Once Per Turn] / [On Play] / [Trigger] tags preserved) |
| `block_number` | Bandai card text (bottom-right) | 1 / 2 / 3 / 4 |
| `restricted_in` | Bandai ban list | string[] (formats this card is banned/restricted in) |
| `prohibited_pair_id` | Bandai prohibited-pairs registry | string \| null (pair identifier) |
| `manga_rare_eternal` | Bandai rotation list | boolean (the 27 Manga Rare exceptions) |

The upstream source candidates per the OPTCG entry in S47 §5b:
- **Official Bandai card list** at `en.onepiece-cardgame.com/cardlist/` — primary, no scrape ToS confirmed (need legal review).
- **CardRush JP** — already in our ingest pipeline; carries Japanese card text but not always parseable English effect-text.
- **OnePiece.gg API** — community-maintained, freer terms (need verification).
- **Limitless TCG** — tournament-results-oriented; may have card metadata too.

Phase 3 design defers the source choice. The schema above is the *shape* of what we'd write; the source decisions live with the kingdom that ships them.

---

## Section 7 — Sources

Primary (Bandai, official):
- [ONE PIECE CARD GAME — Rules hub](https://en.onepiece-cardgame.com/rules/)
- [Comprehensive Rules v1.2.0](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf) — last updated 2026-01-16
- [Official Rule Manual](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf) — last updated 2023-06-23
- [Tournament Rules Manual](https://en.onepiece-cardgame.com/pdf/tournament_rules_manual.pdf)
- [Floor Rules v1.6.0](https://en.onepiece-cardgame.com/pdf/floor_rule.pdf) — last updated 2025-10-10
- [Banned/Restricted Cards effective 2026-04-01](https://en.onepiece-cardgame.com/topics/029.php)
- [Block Rotation overview](https://en.onepiece-cardgame.com/rules/blockicon-card/)
- [Championship 2025-26 World Finals rules](https://www.onepiece-cardgame.com/pdf/cs25-26_world-final_rule_en.pdf)

Secondary (community, cross-checked):
- [OnePiece.gg — Tier lists + ban list aggregator](https://onepiece.gg/)
- [OnePieceTopDecks](https://onepiecetopdecks.com/)
- [Limitless TCG One Piece](https://onepiece.limitlesstcg.com/)
- [Spell Mana — ban list history](https://spellmana.com/banned-restricted-cards-one-piece-card-game/)
- [The Cardboard Chronicles — March 2026 ban list announcement](https://www.thecardboardchronicles.com/post/the-grand-line-shifts-the-march-2026-one-piece-tcg-ban-list-announcement)
- [TCGplayer — Ban list changes commentary](https://www.tcgplayer.com/content/article/Huge-One-Piece-Ban-List-Changes-Goodbye-Pudding-Hello-Kingdom-Come/6b67392c-38e3-4a9e-a938-c6d19f177128/)
- [Bang For Your Buck — Block 1 rotation guide](https://bangforyourbucktcg.com/blogs/tcg-insights/one-piece-tcg-block-1-rotation-guide-2026)
- [Affinity Games — 2026 Standard Rotation Guide](https://www.affinityccg.com/blogs/news/2026-one-piece-standard-rotation-guide)

---

## Section 8 — Recursion targets

What this research enables next (in roadmap-phase order from S47):

- **Now-available (Phase 1+):** the engine adapter's `formatActionForLog` can be extended with action-text fidelity to match the official rule manual's terminology ("Refresh phase" not "refreshed all cards" — that's a UI choice; we can match Bandai's exact phrasing now).
- **Phase 2 prerequisite (when first non-OPTCG engine lands):** a per-game methodology page (`/methodology/play/optcg`) declaring rules-fidelity level. The OPTCG entry is the section-5 gap audit above, distilled.
- **Phase 3 (gameplay-data ingest):** the `card_rules` schema sketch in §6 becomes a real migration when an OPTCG source module lands. Bandai's official card list is the primary source; license review needed before scraping.
- **Phase 4 (effect engine):** the effect-text grammar in [`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md) §4 is the foundation. Each [Trigger] / [On Play] / [Once Per Turn] / [Counter] tag needs interpreter wiring. The ban-list-enforcement check rides alongside.
- **Phase 5 (real-time PvP):** tournament-format selectors (Standard / Extra Regulation / Sealed / Draft), match-timer enforcement (35-min BO1 / 60-min BO3), deck-list submission for Championship-level rooms. The Floor Rules v1.6.0 + Tournament Rules Manual are the substrate for all of this.

The block-rotation table (§3.4) becomes the **input to a card-legality view** — when shipped, the deck-builder's "playable in Standard" filter is one query over `card_rules.block_number ∈ {2,3,4} AND restricted_in NOT LIKE '%Standard%'`.

---

*The kingdom now knows where the cards go on the table. It knows which cards are legal. It knows what the engine enforces and what it doesn't. The substrate beneath /play is named to a depth that lets future kingdoms work without re-deriving.*

🐍❤️
