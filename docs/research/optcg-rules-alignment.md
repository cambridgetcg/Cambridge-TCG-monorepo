# OPTCG rules alignment — official Bandai rules vs the CTCG engine

**Date:** 2026-07-17. **Will:** Asha — *"Lets dive into deck building and game
mechanics too! Just wanna make sure it aligns with what bandai says as the
rules. research first?"*

**Method:** four research agents over the official sources, three audit agents
over our code, then primary-source spot-verification of every surprising
claim by reading the Comprehensive Rules PDF directly. Every rule cited below
carries its official rule number.

**Sources (all Bandai official):**
- Comprehensive Rules **v1.2.0, last updated 1/16/2026** —
  `en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf?20260116`
- Rule Manual + rules hub — `en.onepiece-cardgame.com/rules/`
- Official Banned/Restricted page — `en.onepiece-cardgame.com/news/restriction.html`
- Official Rules Q&A — `en.onepiece-cardgame.com/rules/faq/`

**Relationship to prior research:** builds on
[`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md)
(kingdom-069 era) and **supersedes it on two points**, both verified against
the CR v1.2.0 PDF text:

1. **First-turn battle.** CR 6-5-6-1 verbatim: *"Neither player can battle on
   their first turn."* No attacks on game turn 1 **or** game turn 2 — the
   restriction is symmetric, not first-player-only.
2. **Block rotation.** No rotation exists in the official game. CR 5-1-2
   defines one constructed ruleset; the only official restriction mechanism is
   the Banned/Restricted page. The `BLOCK_ROTATION_OUT_OF_STANDARD` table in
   `deck-legality.ts` (OP01–OP04 "rotated out of Standard 2026-04-01", citing a
   "TCG Protectors 2026 summary") has **no official source we could find**.

---

## Part 1 — what the engine already gets right

Verified aligned with the CR (32 points across the three audits; highlights):

- Deck shape: 1 Leader + exactly 50 (checker) + 10 DON!! (5-1-2, engine `donDeck: 10`).
- 4-copy limit concept (5-1-2-3) in checker and deck-builder UI caps.
- Color-intersection rule correctly *written* in `checkDeckLegality` (5-1-2-2),
  including multicolor identity (2-3-5) — see Part 2 for why it's dead in prod.
- Turn phases in official order: Refresh → Draw → DON!! → Main → End (6-1-1).
- First player skips first draw (6-3-1) and gets 1 DON!! on turn 1 (6-4-1);
  DON!! placement respects a short DON!! deck (6-4-2/6-4-3).
- Cost payment = rest that many active DON!! (6-5-3-1) on the human path.
- Attack targets: opponent Leader, or **rested** Characters only (7-1-1-2).
- Summoning sickness for Characters (11-1-2 family) — enforced via `turnPlayed`.
- Damage math: ties favor the attacker (7-1-4); life card to hand on leader hit;
  win on 0-life + leader damage (1-2-1-1-1).
- 5-Character area cap; leader life drives life-card count (5-2-1-7).
- Mandatory attribution on card text/images (house legal rule, not Bandai's).

## Part 2 — the gaps

### Tier 1 — WRONG RULES (engine plays a different game; small fixes, engine-level)

| # | Official (CR) | Ours today |
|---|---|---|
| 1 | **6-2-3**: every Refresh, ALL DON!! given to Leader/Characters return to the cost area **rested**; **6-5-5-2**: +1000 per given DON!! lasts *"during your turn"* | `attachedDon` never returns — boosts are permanent and compound (`reducer.ts` begin_turn/refresh_all never touch it) |
| 2 | **6-5-5-4**: when a card with given DON!! leaves its area (incl. KO), its DON!! go to the cost area rested | KO zeroes `attachedDon` — DON!! are destroyed; the 10-DON economy shrinks |
| 3 | Official Q&A: given DON!! cannot be voluntarily returned/transferred during Main | `detach_don` allows it anytime, and returns the DON!! **active** |
| 4 | **6-5-6-1**: *"Neither player can battle on their first turn"* | Only the first player is blocked, only on turn 1 (`validate.ts`); P2 may attack on turn 2 |
| 5 | **1-2-1-1-2 + 1-2-2-2**: defeat when you have **0 cards in your deck**, judged at rule processing | We only lose on drawing from an empty deck (Magic's rule) |
| 6 | One constructed format + banlist; **no rotation** | `BLOCK_ROTATION_OUT_OF_STANDARD` invents a Standard rotation and flags OP01–OP04 decks illegal — which would condemn our own official starters |
| 7 | **5-2-1** setup order: decks → leaders → first/second → draw 5 + mulligan → life | `guides/how-to-play` teaching copy narrates life set-up before hands |

### Tier 2 — deck building (the ask): missing or dead enforcement

- **Banlist missing entirely.** Official bans effective 2026-04-10: OP06-047
  Charlotte Pudding, OP03-040 Nami, OP06-086 Gecko Moria, ST10-001 Trafalgar
  Law, OP06-116 Reject; plus three banned **pairs** (OP07-115+EB04-058,
  OP11-040+OP11-067, OP11-040+OP08-069). Small data table + checker rule.
- **Color rule dead in production.** The checker implements 5-1-2-2 but the
  validate route hardcodes `colors: []` / `missing_color_data`. The data now
  exists twice over: `card-stats.ts` (107 starter cards) and
  `card_texts.attributes` JSONB (bandai-en ingest). Wire either and the rule
  comes alive.
- **Copy limit keyed wrong.** CR 5-1-2-3 keys the 4-copy limit to **card
  number**; our counting keys on sku — alt-art variants of one number could
  slip past 4.
- **Deck-builder UI barely validates**: 50 treated as a max (not exact), no
  color rule, no banlist, no category checks; you can save an illegal deck
  with no warning.
- **Deck-check input vocabulary**: page asks for card numbers, lookup matches
  sku — and the placeholder's example first line is a Leader (would be
  rejected if typed as shown).
- **Game-start presentation** (5-2-1-1): decks must be legal when presented;
  the game-start path accepts any 10–101 cards. Fine for practice mode
  (labelled), must gate when durable battles return.
- 5-1-2-4 effect-based construction overrides (e.g. cards allowing >4 copies):
  no mechanism — Phase-4 adjacent, note only.

### Tier 3 — missing rituals (playable *without* effect interpretation)

- **Mulligan** (5-2-1-6): draw 5, then each player once may redraw the full
  hand, first player deciding first. Ours has none — and our setup deals life
  **before** hands, which must flip to support it (5-2-1-7: life is dealt
  after, top of deck to the **bottom** of the life pile).
- **Counter step** (7-1-3): defender trashes hand cards to add their printed
  Counter value for the battle. Counter values are **printed data we already
  carry** in card-stats — this is playable vanilla, no effect interpretation
  needed, and it's the heart of OPTCG's interactivity. (Counter-timing
  *events* stay Phase 4.)
- **First/second choice** (5-2-1-4/5): winner of the toss should *choose*;
  we coin-flip the assignment. In solo practice: let the player choose.
- **Stage replacement** (6-5-3): playing a new Stage replaces the old (old →
  trash); we reject with "stage occupied".
- **AI cost honesty**: AI still pays heuristic costs when stats are missing;
  with the stats corpus it should pay printed costs always (and never
  under-pay).

### Tier 4 — Phase 4, effects interpretation (today: disclosed scope cuts)

Block step + [Blocker] (7-1-2, 10-1-4), [Trigger] on life damage (7-1-4,
10-1-5), [Rush]/[Double Attack]/[Banish] (10-1-x), [When Attacking]/[On
Play]/[On K.O.]/[Activate: Main] timing (8-x), start-of-game leader effects
(5-2-1-5-1), effect-based win conditions (1-2-5). Every surface currently
says "card effects aren't interpreted yet" — the honesty holds until this
tier ships.

## Part 3 — recommended build order

1. **Wave 1 — play the right game** (Tier 1): DON!! lifecycle (return at
   refresh rested, turn-scoped +1000, return on leaving field, remove
   voluntary detach), symmetric first-turn battle ban, deck-out at 0 cards,
   remove the invented rotation, fix teaching copy. Small diffs, engine
   tests for each rule number.
2. **Wave 2 — deck building truthful** (Tier 2): banlist data + rule, revive
   the color rule from card-stats/attributes, number-keyed copy counting,
   exact-50 in the builder with a visible legality panel, deck-check input fix.
3. **Wave 3 — the missing rituals** (Tier 3): setup order + mulligan,
   vanilla counter step, first/second choice, stage replacement, AI printed
   costs.
4. **Wave 4 — Phase 4**: the effect grammar (`effect-tokens.ts` was built for
   this), keywords, triggers — the wave that also unpauses durable PVE.

*Rules text © BANDAI; cited here under the house nominative-use rule with
source URLs. This document records alignment as of CR v1.2.0 (2026-01-16) and
the 2026-04-10 banlist — re-verify both when Bandai revises.*
