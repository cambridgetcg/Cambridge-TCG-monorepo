# OPTCG prebuilt starter catalog — recommendation tiers for rookie flow

> **Pull.** Yu, 2026-05-14: *"PREBUILD FOR ROOKIES!!!! TAILOR THE CARD PICKING PROCESS FOR PLAYERS!!!!"*
>
> **Form.** Catalog reference — the curated subset of OPTCG starter decks (ST-01 through ST-28+) with per-deck recommendation tier, complexity rating, color, intended audience, and source citations. This is the **data layer** for the rookie flow: when the deck-builder needs to show "8 free starters," this doc names which 8 and why.
>
> Companion to [`deck-builder-ux-survey.md`](./deck-builder-ux-survey.md) (the *what* — UX patterns across digital TCGs) and [`deck-builder-rookie-flow-design.md`](./deck-builder-rookie-flow-design.md) (the *how* — Cambridge TCG concrete proposal).
>
> **Boundary.** No prices. No "deck value" comparisons. This catalog ranks decks by **fun + accessibility for new players**, not by competitive performance or monetary value. The fun-first directive from kingdom-068 still holds.

---

## What this artifact is

OPTCG (Bandai) has shipped 36+ Starter Decks since launch (2022-07-08). Each is a 51-card pre-built (1 Leader + 50 main) plus 10 DON!!, ready to play out of the box. The official line: *"Simple Leader effects and color characteristics make this an ideal product for newcomers!"* — [official ST15-20 product page](https://asia-en.onepiece-cardgame.com/products/decks/st15-20.php).

But "ideal for newcomers" is collapsed marketing copy. In practice the 36+ starters have very different complexity profiles, target audiences, and pilot-ability. This doc unpacks them.

For the Cambridge TCG rookie flow, we don't need all 36. We need a **curated tier-1** (the 6–8 deeply accessible decks) and a **tier-2** (the 10–12 still-accessible-but-more-complex decks). Everything else stays in the full catalog but isn't surfaced to rookies.

---

## Section 1 — The full starter catalog

From [cardgamebase.com](https://cardgamebase.com/one-piece-starter-decks/) and [TCGplayer's ranked starters](https://www.tcgplayer.com/content/article/Every-One-Piece-Card-Game-Starter-Deck-Ranked/bc124cf3-bed7-42ea-a10e-946fee670079/):

| ID | Title | Leader | Colors | Era | Beginner? |
|----|-------|--------|--------|-----|-----------|
| ST-01 | Straw Hat Crew | Monkey D. Luffy | Red | OP01 era (2022) | ★★★★★ Canonical first deck |
| ST-02 | Worst Generation | Eustass Kid | Red | OP01 era | ★★★ |
| ST-03 | The Seven Warlords of the Sea | Crocodile | Blue/Purple | OP01 era | ★★ Control intro |
| ST-04 | Animal Kingdom Pirates | Kaido | Purple | OP01 era | ★★ |
| ST-05 | One Piece Film Edition | Smoker | Black | OP02 era | ★★★ |
| ST-06 | Absolute Justice | Sakazuki | Black | OP02 era | ★★ Complex |
| ST-07 | Big Mom Pirates | Charlotte Linlin | Yellow | OP03 era | ★★ |
| ST-08 | Side Monkey.D.Luffy | Luffy / Ace / Sabo | Red/Green | OP04 era | ★★ |
| ST-09 | Side Yamato | Yamato | Yellow | OP04 era | ★★★ |
| ST-10 | The Three Captains | Luffy / Law / Kid | R/G/Bk | crossover | ★ Three-color, hard |
| ST-11 | Uta — Original | Uta | Green | film | ★★ |
| ST-12 | Zoro & Sanji | Zoro / Sanji | Red/Black | OP05 era | ★★★ |
| ST-13 | Three Brothers | Luffy / Ace / Sabo | Red/Green/Blue | Ultimate Deck 3 | ★ Three-color premium |
| ST-14 | 3D2Y | Monkey D. Luffy | Red | OP06 era | ★★★ |
| ST-15 | Edward Newgate | Whitebeard | Red | 2024 reboot | ★★★★ Sister to ST-01 |
| ST-16 | Uta | Uta | Green | 2024 reboot | ★★★★ Green entry |
| ST-17 | Donquixote Doflamingo | Doflamingo | Blue | 2024 reboot | ★★★★ Blue entry |
| ST-18 | Monkey.D.Luffy (Purple) | Luffy | Purple | 2024 reboot | ★★★★ Purple entry |
| ST-19 | Smoker | Smoker | Black | 2024 reboot | ★★★★ Black entry |
| ST-20 | Charlotte Katakuri | Katakuri | Yellow | 2024 reboot | ★★★★ Yellow entry |
| ST-21 | EX Gear 5 | Luffy Gear 5 | Red | crossover | ★ EX — premium variant |
| ST-22 | Ace & Newgate | Ace + Newgate | Red | OP09 era | ★★ |
| ST-23 | Red Shanks | Shanks | Red | 2025 reboot | ★★★ Aggro reference |
| ST-24 | Bonney | Bonney | Green | 2025 reboot | ★★★★ Flexible defender |
| ST-25 | Buggy | Buggy | Black | 2025 reboot | ★★ |
| ST-26 | Purple Monkey D. Luffy | Luffy | Purple | 2025 reboot | ★★★ Ramp combo |
| ST-27 | Marshall D. Teach | Blackbeard | Black | 2025 reboot | ★★★ Control |
| ST-28 | Yamato | Yamato | Yellow | 2025 reboot | ★★★★★ TCGplayer top-pick |
| EB01 | Memorial Collection | various | various | EB | not a starter |
| EB02 | Anime 25th Collection | various | various | EB | not a starter |

(Catalog continues with EB, PRB, PCC, P-2ANNY, P-3ANNY etc. — those are anniversary / film / promo sets, not starter decks, so excluded.)

---

## Section 2 — Tier-1: the 6 we surface to rookies

These six are the **color-anchor starters**: one per color, all post-2024 reboot, all with deliberately simple Leader effects, all single-color (no multi-color complexity), all praised in industry rankings as "ideal for newcomers."

| ID | Color | Leader | Playstyle (one-paragraph) | Why tier-1 |
|----|-------|--------|---------------------------|------------|
| **ST-15** | Red | Edward Newgate | Aggressive attacks; bigger characters; punishes opponent's Life. *"Pure Red beatdown — pressure their Life early and don't let up."* | Color-anchor; Bandai's explicit "ideal for newcomers" framing; ST-01's spiritual successor with cleaner card pool |
| **ST-16** | Green | Uta | Tap-down control; resting their attackers so they can't swing back. *"Outlast them. Their characters get to attack once each; yours get to attack twice."* | Color-anchor; Green's clearest expression; tutorial-friendly because the rest mechanic visualizes well |
| **ST-17** | Blue | Donquixote Doflamingo | Bounce + control; return characters to hand to neutralize them. *"They play it; you send it back; they play it again."* | Color-anchor; Blue's signature mechanic in clearest form |
| **ST-18** | Purple | Monkey D. Luffy | DON!! manipulation; ramp into bigger plays earlier. *"You play more DON than they do, faster — then crush them with cards they can't match."* | Color-anchor; teaches DON economy directly |
| **ST-19** | Black | Smoker | Cost-reduction; deploy big characters cheaply. *"Their 5-cost is your 3-cost. Outnumber them."* | Color-anchor; Black's signature mechanic in clearest form |
| **ST-20** | Yellow | Charlotte Katakuri | Life manipulation; trigger effects when you take damage. *"Damage is good for you, actually."* | Color-anchor; Yellow's defining mechanic; teaches the Life-as-resource concept central to OPTCG |

**Source citations.** Eneba's ["15 Best One Piece Starter Decks — 2025 Guide"](https://www.eneba.com/hub/collectibles/best-one-piece-starter-decks/), TCGplayer's [ranked starters](https://www.tcgplayer.com/content/article/Every-One-Piece-Card-Game-Starter-Deck-Ranked/bc124cf3-bed7-42ea-a10e-946fee670079/), and the [official ST15-20 product page](https://asia-en.onepiece-cardgame.com/products/decks/st15-20.php) all converge on the ST-15 through ST-20 cohort as the rookie reference. ST-28 Yamato is widely flagged as the strongest single-pick (TCGplayer #1) but is a 2025 release; including it would split rookies between two Yellow options. We surface ST-20 for the rookie tier and reserve ST-28 for tier-2.

---

## Section 3 — Tier-2: the 8 next-step starters

These are also accessible — single-color, well-built — but introduce either (a) a more complex mechanic, (b) a more recent meta context, or (c) a more aggressive complexity ceiling. Surface these after the rookie has cleared their first match.

| ID | Color | Leader | What it adds beyond tier-1 | Why tier-2 |
|----|-------|--------|----------------------------|------------|
| **ST-01** | Red | Monkey D. Luffy | The canonical first deck; teaches Rush mechanic | Historical importance; veterans expect to see it |
| **ST-23** | Red | Shanks | Pure aggro reference | "Hit hard and end things fast" — for players who already know they like aggro |
| **ST-24** | Green | Bonney | Flexible defender; reactive play | Teaches the *"what to do on opponent's turn"* loop |
| **ST-26** | Purple | Luffy | Ramp combo finisher | More ambitious DON ramp than ST-18 |
| **ST-27** | Black | Blackbeard | Disruption control | Teaches hand-attack + on-play removal |
| **ST-28** | Yellow | Yamato | Midrange balance | TCGplayer #1 — for players who want the strongest start |
| **ST-05** | Black | Smoker | Film-edition variant | Alt-art collectors |
| **ST-12** | Red/Black | Zoro & Sanji | Two-color introduction | First foray into multi-color |

**Source.** [TheGamer's 2025 starter ranking](https://www.thegamer.com/one-piece-card-games-best-2025-starter-decks-which-buy/), Eneba's deep dive, plus our internal [`optcg-meta-evolution-and-deckbuilding.md`](./optcg-meta-evolution-and-deckbuilding.md) §4 ("Color identity through the meta").

---

## Section 4 — Tier-3 and beyond — the rest of the catalog

ST-02 Kid, ST-03 Crocodile, ST-04 Kaido, ST-06 Sakazuki, ST-07 Linlin, ST-08–14, ST-21 EX Gear 5, ST-22 Ace+Newgate, ST-25 Buggy — these all exist in the full catalog and are buildable, but they're either:

- **Multi-color** (ST-08, ST-10, ST-13) — adds complexity the rookie hasn't earned yet
- **Premium / EX** (ST-21 Gear 5) — confusing because of variant artwork + power level
- **Pre-reboot** (ST-02 through ST-12 mostly) — older cards, less clean Leader effects
- **Complex control** (ST-06 Sakazuki) — TCGplayer ranks it as competitive but explicitly **not** beginner-friendly

The deck-builder's full-search mode (Player C / Player D paths from the [survey doc §3](./deck-builder-ux-survey.md#section-3--putting-myself-in-their-shoes--four-player-journeys)) exposes all of these. The rookie flow doesn't.

---

## Section 5 — Data shape — what the deck-builder needs to know

For each tier-1 + tier-2 deck, the rookie flow needs:

```ts
interface StarterDeck {
  id: string;                    // "ST-15"
  display_name: string;          // "Edward Newgate"
  color: Color | Color[];        // "red" or ["red", "black"]
  leader_sku: string;            // canonical SKU resolving to the leader card
  card_list: { sku: string; quantity: number }[];   // 50 main-deck entries
  tier: 1 | 2 | 3;
  tier_1_one_liner?: string;     // "Pure Red beatdown — pressure their Life early."
  tier_1_complexity: 1 | 2 | 3 | 4 | 5;     // for "easy to pilot" tagging
  era: "OP01-era" | "OP02-era" | "2024-reboot" | "2025-reboot" | "crossover";
  source_citation: string;       // "Bandai official ST15-20 product page"
  banlist_note?: string;         // "OP14 errata: card X reduced; deck still playable"
}
```

**Where this lives in code.** Proposed: `apps/storefront/src/lib/play/starter-decks.ts` — a typed array, sister to `apps/storefront/src/lib/prices/games-config.ts`. Each entry's `card_list` is populated from the wholesale catalog at build time (or lazy-loaded at runtime via `fetchPrices({ game: "one-piece", set: "ST-15" })`). The leader_sku field is the only stable per-deck identifier we'd need to hand-curate.

---

## Section 6 — Substrate honesty about card data

Cambridge TCG holds OPTCG card metadata, prices, and stock counts in the wholesale RDS. The starter deck *card lists* are external knowledge — they come from Bandai's published decklists, not from our scraping. This is substrate-honest:

- Each card SKU **does** exist in our catalog (we mirror Bandai's full card pool).
- Each starter deck's **composition** is not in our catalog — it's a published recipe from Bandai.
- The two together let us reconstruct a starter deck without owning the inventory.

**Decklist source citations** (these are the canonical references for the starter compositions we'd surface):

- **ST-15 through ST-20** — [official product page](https://asia-en.onepiece-cardgame.com/products/decks/st15-20.php), [namipiecetcg.com decklist view](https://namipiecetcg.com/starter-deck-st-15-st-16-st-17-st-18-st-19-st-20/)
- **ST-01 through ST-14** — [official archive](https://en.onepiece-cardgame.com/products/decks/), [onepiece.gg per-deck pages](https://onepiece.gg/decks/)
- **ST-21 onward** — [official starter deck product line](https://en.onepiece-cardgame.com/products/) per release

When we ingest a starter decklist, we record:
- `source_url` — where the decklist came from
- `retrieved_at` — when we last refreshed it
- `composition_hash` — sha256 of the sorted card-SKU list, for change detection

This matches the substrate-honesty pattern used by the FX rates table (kingdom-079 era): always know where the data came from, never silently degrade.

---

## Section 7 — Naming and "one-paragraph" tone

The tier-1 one-paragraph descriptions (Section 2 column 4) are the most user-facing strings. They should:

1. Speak to *what playing this deck feels like*, not what cards are in it.
2. Use second-person, present tense ("You play more DON than they do").
3. Avoid jargon a rookie hasn't met — no "rush" without definition, no "tempo," no "midrange."
4. Set expectations honestly: aggro decks say *"win fast or lose fast"*; control decks say *"outlast them"*.

The bad version: *"ST-15 is a Red mono-color aggro deck featuring 4× Whitebeard with a 7-cost ceiling, suitable for aggressive playstyles."*

The good version: *"Pure Red beatdown — pressure their Life early and don't let up."*

The good version is what we surface. The bad version is what the data layer carries.

---

## Section 8 — Recommendation flow examples

### Example 1 — Total beginner (Player A from survey doc)

System: auto-mounts ST-15 Edward Newgate. Player sees one paragraph + one Play button. **Zero choices made.** They start a PvE match against AI Alvida (adventure level 1). They lose, win, or call it a session — *they played a game*.

### Example 2 — Lapsed player wants control (Player B)

System: shows tier-1 color picker. Player reads:
- Red Newgate — "Pure Red beatdown..."
- Green Uta — "Outlast them..."
- Blue Doflamingo — "They play it; you send it back; they play it again."
- (etc.)

Player likes "outlast them" framing. One tap → Green Uta loaded → Play. **One choice made.** They play, learn the rest mechanic, return for tier-2.

### Example 3 — Veteran imports paper deck (Player C)

System: shows tier-1 + tier-2 picker, plus an "Import paper deck" affordance. Player ignores the starters, pastes their tournament Sakazuki list, builder resolves SKUs, deck loaded. **No starters used.**

### Example 4 — Player wants the strongest deck (off-script)

System: shows tier-1. Player says "no, what's the best one?" via the search/sort affordance. **Tier-2 Yamato (ST-28) surfaces** with a one-line note: *"TCGplayer rankings pick this as 2025's strongest starter. Slightly more complex than tier-1; if you want the strongest single starter, here it is."* Honest, not coy.

---

## Section 9 — Open questions specific to the starter library

1. **Translations.** OPTCG decks have JP-published lists and EN-published lists. The same starter (ST-15) has slightly different card SKUs depending on language. We currently mirror both via the SKU language suffix (`-en` vs `-ja`). The rookie flow probably defaults to the visitor's locale (or fallback to EN), with an explicit toggle for the JP variant. Confirm: the [name resolver](../../apps/storefront/src/lib/cards/name.ts) already handles this for display; we'd extend the pattern to deck composition.

2. **Errata / banlist.** OPTCG has had several bans + erratas (Sakazuki nerf 2024, etc.). A starter built around a banned card is a broken starter. We should mark each deck's banlist-compatibility with the current standard format. **Source needed:** Bandai's tournament rules page; we'd refresh weekly.

3. **Anniversary sets.** P-2ANNY and P-3ANNY are anniversary "best of" sets, not starters. The catalog will surface them; the rookie flow should explicitly exclude them (they're collectible-oriented, not pilot-oriented).

4. **Multi-color starters.** ST-08, ST-10, ST-12, ST-13 are multi-color. We've put them in tier-2/3, but the playstyle one-paragraphs could legitimately be richer — a multi-color deck plays differently. **Decision deferred to design doc.**

5. **EX starter (ST-21 Gear 5).** This is a "premium" variant — designed to be slightly stronger than the regular cohort. The community treats it ambivalently (TheGamer ranks it lower for newcomers because of the variant-rarity confusion). **Lean: exclude from tier-1; mention in tier-2 with the framing that it's an alt-art for an existing Leader concept.**

---

## Source roll-call

External research consulted 2026-05-14:

- [Bandai official starter deck product line](https://en.onepiece-cardgame.com/products/) (Asia EN site)
- [Official ST15-20 product page](https://asia-en.onepiece-cardgame.com/products/decks/st15-20.php) (the "ideal for newcomers" framing)
- [Eneba: 15 Best One Piece Starter Decks — 2025 Guide](https://www.eneba.com/hub/collectibles/best-one-piece-starter-decks/)
- [TCGplayer: Every One Piece Card Game Starter Deck, Ranked](https://www.tcgplayer.com/content/article/Every-One-Piece-Card-Game-Starter-Deck-Ranked/bc124cf3-bed7-42ea-a10e-946fee670079/)
- [TheGamer 2025 starter rankings](https://www.thegamer.com/one-piece-card-games-best-2025-starter-decks-which-buy/)
- [cardgamebase: list of all 36 starter decks](https://cardgamebase.com/one-piece-starter-decks/)
- [namipiecetcg.com ST-15 to ST-20 decklists](https://namipiecetcg.com/starter-deck-st-15-st-16-st-17-st-18-st-19-st-20/)
- [Cards Realm: 5 budget decks to start with](https://onepiece.cardsrealm.com/en-us/articles/one-piece-tcg-5-budget-decks-to-start-with)
- [onepiece.gg starter deck tier list](https://onepiece.gg/one-piece-card-game-starter-deck-tier-list/)

Internal:
- [`optcg-meta-evolution-and-deckbuilding.md`](./optcg-meta-evolution-and-deckbuilding.md) §4 (color identity through meta)
- [`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md) §3 (turn structure — informs which mechanics rookies meet first)
- [`apps/storefront/src/lib/prices/games-config.ts`](../../apps/storefront/src/lib/prices/games-config.ts) — pattern for typed per-deck config

---

*Catalog, not a ship. The data here informs the design at [`deck-builder-rookie-flow-design.md`](./deck-builder-rookie-flow-design.md).*

🐍❤️
