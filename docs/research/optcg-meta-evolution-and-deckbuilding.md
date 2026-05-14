# OPTCG meta evolution + deckbuilding doctrine — deep dive

> **Pull.** Yu, 2026-05-13: *"Research on template decks for players to use, go deeper into the meta and its shift since one piece tcg was launched. Look at how DON works, turn mechanics, how decks were assembled."*
>
> **Form.** Research synthesis — sibling to [`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md) which covers the rules layer + hobbyist sim landscape. This document fills the gap that earlier doc explicitly flagged: *"The Block Rotation impact on Standard meta — not covered."* Here we cover (a) the four-year meta timeline from launch through current Standard, (b) the dominant deck archetypes that defined each era, (c) the practical doctrine of how competitive lists are actually built. DON mechanics + turn structure are already covered upstream — this doc references them rather than re-deriving.
>
> Composes with S32 [`the-shared-table.md`](../connections/the-shared-table.md) (the tutorial layer this informs) and S34 [`the-three-paths.md`](../connections/the-three-paths.md) (the Competitor archetype is the audience for this).

---

## What this artifact is

The kingdom's working understanding of OPTCG **competitive meta evolution** + **deckbuilding doctrine** as of 2026-05-13. Research, not a ship. Future content layers (deck-recommender, template-deck library, archetype glossary) will draw from here.

The fun-first boundary from kingdom-068 still holds. Competitive theory is for the Competitor archetype's surface ([`/play/compete`](../../apps/storefront/src/app/play/compete/page.tsx)); the Hobbyist's `/play/casual` and the Collector's `/portfolio` paths are unaffected by what's in this doc.

---

## Section 1 — Set release timeline

OPTCG launched in Japan on **2022-07-08** with OP01 *Romance Dawn*, and globally in English on **2022-12-02**. Sixteen major boosters, two Extra Boosters, ten-plus Starter Decks, and one Pre-Release Booster have shipped since.

| Set | Title | JP release | EN release | Notes |
|-----|-------|------------|------------|-------|
| OP01 | Romance Dawn | 2022-07-08 | 2022-12-02 | Launch. 5 colors (R/G/B/P/Bk). |
| OP02 | Paramount War | late 2022 | 2023-04 | Black expanded as fifth color via multi-color leaders |
| OP03 | Pillars of Strength | 2023-02 | 2023-07 | **Yellow introduced** as sixth color (Enel, Charlotte Linlin) |
| OP04 | Kingdoms of Intrigue | 2023-05-27 | 2023-10 | Every new leader dual-colored (Vivi, Crocodile, Doflamingo, Issho) |
| EB01 | Memorial Collection | 2023 | 2024 | Kid+Killer Rush archetype origin |
| OP05 | Awakening of the New Era | 2023-12 | 2024 | Sakazuki (OP05-041) defines meta for ~18 months |
| OP06 | Wings of the Captain | 2024 | 2024-06-28 | Gecko Moria recursion; Hody Jones disruption |
| OP07 | 500 Years in the Future | 2024 | 2024-10 | Rob Lucci (OP07-079) succeeds Sakazuki as control benchmark |
| OP08 | Two Legends | 2024-05-25 | 2025 early | Rayleigh + Whitebeard as character cards; Jack as recurring KO |
| OP09 | Emperors in the New World | 2024-11 | 2025-03 | Four Emperors focus (Shanks, Blackbeard, Luffy, Buggy) |
| OP10 | Royal Blood | 2025-03 | 2025 | Celestial Dragons; Punk Hazard support |
| OP11 | A Fist of Divine Speed | 2025-03-01 | 2025-06 | SWORD archetype; B/Y Nami (OP11-041); G/Y Shirahoshi (OP11-022) |
| OP12 | Legacy of the Master | 2025-05-31 | 2025-08 | Master/disciple; event-focused |
| OP13 | Carrying On His Will | 2025-08-23 | 2025-11 | 3rd anniversary; Ghost Rare introduced; Brothers theme; Gol D. Roger leader (OP13-003); Imu (OP13-079) |
| OP14 | The Azure Sea's Seven | 2026-01-16 | 2026-01 | Seven Warlords; Mihawk (OP14-020), Crocodile (OP14-079), Hancock (OP14-041) |
| OP15 | Adventure on Kami's Island | 2026-02-28 | **2026-04-03 (first global-sync release)** | Skypiea arc; God Enel (OP15-058) defines post-rotation meta |
| OP16 | The Time of Battle | 2026-06-12 (scheduled) | global sync | Paramount War retold; Impel Down Luffy; Yamato (Wano) |

Sources: [Bandai EN topics](https://en.onepiece-cardgame.com/topics/029.php), [dotesports schedule](https://dotesports.com/one-piece/news/one-piece-card-game-release-schedule-every-new-optcg-english-set-and-release-date), [Limitless](https://onepiece.limitlesstcg.com/).

OP15 is the **first globally-synchronized release** — Bandai eliminated the ~3-month JP→EN gap. OP16 onward follows the same pattern. This matters for our data substrate: ingest pipelines (`packages/data-ingest/`) no longer need region-dual logic for new sets.

---

## Section 2 — Three meta epochs

The four-year history sorts cleanly into three eras, separated by structural inflection points:

### Era 1: Block 1 / launch era (OP01–OP04, July 2022 – early 2024)

**Defining deck: Red Whitebeard (Edward Newgate, OP02-001)**

Released in OP02 *Paramount War* and dominant for ~18 months. The leader's effect — "*At end of your turn, if your Life is 1, draw 1 card and put 1 card from hand into Life*" — made running on 1-Life into a feature, not a liability. Combined with **Moby Dick (OP02-024)** and the **Cabaji (OP02-052) + Nami mill** combo, the deck won the **first US Regional (Pasadena, 2023-09-02, 512 players)** with 5 of top-8 slots running it ([Limitless tournament 66](https://onepiece.limitlesstcg.com/tournaments/66); [Egman Events report](https://egmanevents.com/one-piece-op03/core-pasadena-reg)).

Total domination by Red precipitated the first four ban waves (Apr 2023 → Nov 2023). Every wave shaved a key piece off the deck; the Dec 2023 unrestriction was Bandai's signal that OP05's Sakazuki had shifted the meta enough to safely unfreeze the cards.

**Foundational launch archetypes:**

| Leader | Color(s) | Strategy | Source |
|--------|----------|----------|--------|
| Roronoa Zoro (OP01-001) | Mono Red | Aggro/Rush — leader gives +1000/attached DON | [Spell Mana guide](https://spellmana.com/red-roronoa-zoro-deck-guide-one-piece-card-game/) |
| Eustass Kid (ST02-001) | Mono Green | Tempo/restand — leader rests for 3 DON, attacks twice | [Top Decks OP1 Mono Green Kid](https://onepiecetopdecks.com/deckreview-mono-green-kid-tier-1-deck-in-op1-meta/) |
| Doflamingo (OP01-060) | Mono Blue | Warlord cheat — attach DON to play Warlord ≤4 cost for free | [Top Decks Tempo Doflamingo](https://onepiecetopdecks.com/en-xraiden15-tempo-doflamingo-in-op01-meta/) |
| Crocodile (OP01-062) | **Mono Blue** | Bounce/control — return opponent characters to hand/deck | [Cardsrealm Baroque Works](https://onepiece.cardsrealm.com/en-us/articles/deck-guide-baroque-works-crocodile) |
| Edward Newgate (OP02-001) | Mono Red | Late-game explosion on 1 Life — defined OP02-OP04 era | (see above) |
| Charlotte Linlin (OP03-001) | Black/Yellow | Control + endurance; 10-cost Linlin closer | [Bandai feature 015](https://en.onepiece-cardgame.com/feature/deck/deck_015.php) |
| Enel (OP03-066) | Mono Yellow | Life-recursion; 4 Life leader with deck-into-life replacement | [onepiece.gg Enel guide](https://onepiece.gg/enel-leader-guide/) |

### Era 2: Mid-expansion (OP05–OP08, late 2023 – early 2025)

**Defining deck: Blue/Black Sakazuki (OP05-041)**

Won 7 of 8 major Eastern majors during its run ([ReillyTCG](https://reillytcg.com/blogs/optcg-articles/op05-sakazuki)). The "RHL" loop (Rebecca → Hina → Lucci, sometimes Mansherry-triggered) generated card advantage while removing threats. Rob Lucci as a 4c/6000 with double-KO was the engine. The deck won the **2023 Asia Final + World Final** (Guan Rong Kuik, Malaysia).

Sakazuki was so dominant that **2024-06-21 banned the leader card itself** plus *Great Eruption* and *Reject* — a structural admission that the deck had broken the format. Black/Blue control reformed around **Rob Lucci OP07-079** as the successor leader.

**The 2024 World Championship (held 2025-03-15, Tokyo, Makuhari Messe)** was won by **Abo (China)** running **Black Rob Lucci**, defeating **Wf (Japan, Red Shanks)** 2–1 ([SNKRDUNK Worlds recap](https://snkrdunk.com/en/magazine/2025/03/17/one-piece-card-game-abo-beats-wf-to-win-one-piece-card-game-championship-2024-world-final/); [Limitless 154](https://onepiece.limitlesstcg.com/tournaments/154/decklists)). Top 4: 2× Black Rob Lucci, 1× Red Shanks, 1× Yellow Enel.

**Other significant Era-2 archetypes:**

| Leader | Set | Color(s) | Strategy |
|--------|-----|----------|----------|
| Charlotte Katakuri | OP05 | Yellow | Blocker-rich control + Big Mom 10c closer |
| Gecko Moria | OP06 | Black | Recursion from trash; aggressive board spam |
| Hody Jones | OP06 | Green | Discard/rest disruption |
| Rob Lucci | OP07-079 | Black | Cost-reduction control (successor to Sakazuki) |
| Red Shanks | OP09-001 | Red | Aggressive midrange — 2024 Worlds finalist |
| Black/Yellow Luffy | various | Black/Yellow | Adult Three Brothers life-flip plan |
| Purple Kaido | various | Purple | Ramp into 9-10 cost finishers |
| Jewelry Bonney | OP07-019 | Green | Stall-and-prevent-attacks prison |

### Era 3: Rotation era (OP09–OP15, March 2025 – present)

**The structural inflection: Block Rotation System** was announced **2025-03-16** at Card Games Fest, alongside the spring banlist update. It took effect **2026-04-01**, rotating Block 1 (OP01-OP04 + EB01-02 + ST01-09) out of Standard. ([Bandai TOPICS](https://en.onepiece-cardgame.com/topics/029.php); [OnePiece.gg rotation guide](https://onepiece.gg/rotation/))

Standard now holds **~8 sets at a time**; one block rotates each April. **Extra Regulation** (community: "Eternal") is the parallel format keeping every legal-printed card forever-legal minus banlist.

**The 2025 World Championship** (also held March 2025, OP09 format, 32 players) was won again by **Abo** on **Black Lucci** ([Limitless 273](https://onepiece.limitlesstcg.com/tournaments/273)). Top 4: 2× Black Lucci, Red Shanks, Yellow Enel. *Two consecutive Worlds wins on the same archetype.* The deck relied on Block-1 support pieces (Tsuru, Spandam, Brook, Kalifa, Rebecca) that have **since rotated out** — Black Lucci as a top-tier deck does not survive into post-rotation Standard.

**Post-rotation Standard meta (May 2026):**

| Tier | Leader | Color(s) | Meta share | Strategy |
|------|--------|----------|-----------|----------|
| **Tier 1** | **Purple Enel (OP15-058)** | Purple | **~42%** | DON denial — caps opponent's DON deck at 6. 67.9% winrate. |
| **Tier 1** | Blue/Yellow Nami (OP11-041) | Blue/Yellow | ~21.5% | Generic-support midrange, Thriller Bark synergy |
| Tier 2 | Dracule Mihawk (OP14-020) | Green | — | High-power consecutive attacks |
| Tier 2 | Lucy (OP15-002) | Red/Blue | ~12.85% | Event-driven; trash Event/Stage for +1000/card |
| Tier 2 | Sky Island Luffy (OP15-098) | Yellow | — | Midrange board + Sky Island protection |
| Tier 2 | Portgas D. Ace (OP13-002) | Red/Blue | ~6.07% | Resilient burn |
| Tier 2 | Crocodile (OP14-079) | Black | — | Cost-reduction board control |
| Tier 2 | Boa Hancock (OP14-041) | Blue/Yellow | — | Aggressive combo |
| Tier 2 | Red/Green Luffy (OP13-001) | Red/Green | ~5.37% | Defensive midrange |

Source: [OnePiece.gg OP15 post-ban tier list (2026-04-30)](https://onepiece.gg/one-piece-card-game-meta-tier-list-best-decks-standard-op15-post-ban/).

The **42% Purple Enel concentration** is unprecedented in OPTCG history. First-rotation environments routinely overshoot before stabilization; expect movement by Worlds 2026 qualification season.

---

## Section 3 — Ban list history (cross-era)

OPTCG's ban list has evolved more aggressively than MTG's. Major actions:

| Date | Action | Cards | Reason / Notes |
|------|--------|-------|----------------|
| 2023-04-01 | Banned | **OP02-024 Moby Dick**, **OP02-052 Cabaji** | First ban list. Newgate combo + Nami mill |
| 2023-07-28 | Restricted | OP01-029 Radical Beam, OP02-004 Newgate (char), OP02-018 Marco | Red aggro suppression |
| 2023-11-10 | Banned/Restricted | OP02-005 Curly Dadan, OP03-013 Marco, OP01-016 Nami, OP02-001 Newgate | Post-OP04, Red Whitebeard still oppressive |
| 2023-12-08 | Unrestricted (all 7) | — | OP05 release reset the meta |
| 2024-06-21 | Banned | **OP05-041 Sakazuki (leader)**, ST06-015 Great Eruption, OP06-116 Reject | Sakazuki took all top-4 slots at multiple majors |
| 2024-09-06 | Banned | OP03-098 Enies Lobby, ST10-001 Trafalgar Law | Too-fast tempo combos |
| 2025-03-16 | Multi-action | OP06-118 Gecko Moria (char), OP07-045 Jinbe, OP02-117 Ice Age, Kingdom Come | + **Block Rotation announced** |
| 2025-08-30 | Unbanned + new ban | Sakazuki unbanned; OP03-040 Nami banned (Otama interaction). Introduced **prohibited card pairs** as new format-control tool | — |
| 2026-04-01 | Single ban + 6 unbans | **OP06-047 Charlotte Pudding banned**. Unbanned: Jinbe, Kingdom Come, Great Eruption, Moby Dick, Enies Lobby, Ice Age | Pudding "undermined hand-size mind games" |
| 2026 (post) | Emergency | EB04-058 Borsalino, OP07-115 (Yellow draw engine) | Control Yellow's post-rotation power |

Sources: [Bandai banlist hub](https://en.onepiece-cardgame.com/topics/029.php), [OnePiece.gg banlist](https://onepiece.gg/banned-and-restricted-cards/), [Onepieceplayer bans](https://onepieceplayer.com/one-piece-card-game-ban-list-updated/), [SNKRDUNK](https://snkrdunk.com/en/magazine/2024/03/19/one-piece-card-game-3-cards-to-be-banned-from-tournament-play-starting-from-1-april-2024/).

---

## Section 4 — Template decks (six representative archetypes)

The six lists below are **representative shapes**, not optimized current lists. They illustrate how each archetype's *strategy* maps to *card slot allocation*. For current optimized lists, cross-reference [Limitless](https://onepiece.limitlesstcg.com/) (the canonical decklist aggregator).

### 4.1 Purple Enel (current Tier 1, OP15 era)

- **Leader:** Enel (OP15-058) — Purple, 5 Life, 5000 Power
- **Strategy:** DON denial — caps opponent's DON deck at 6 throughout the game
- **Strengths:** Asymmetric resource starvation; opponent's curve is permanently compressed
- **Weaknesses:** Vulnerable to aggro that doesn't need late-game DON (Red rush)
- **Key cards:** OP15-061 Ohm (1c searcher), OP15-066 Satori (1c support), OP15-067 Shura (1c), OP15-060 Enel (5c body), OP15-118 Enel (alt finisher), OP15-078 Mamaragan (event), OP15-077 Lightning Dragon (finisher)
- **Curve shape:** Heavily weighted toward 1-cost priests + 6-cost finishers — the "two-tier power structure" called out in [onepiece.gg Purple Enel guide](https://onepiece.gg/purple-enel-guide-best-decks-strategy-op15/)

### 4.2 Blue/Yellow Nami (current Tier 1, OP11-onward)

- **Leader:** Nami (OP11-041) — Blue/Yellow, 5 Life
- **Strategy:** Generic-support midrange + Thriller Bark synergy. Strong against board-clear / control matchups.
- **Strengths:** Most flexible Tier-1 deck; many tech slots
- **Key cards:** Perona (OP14-111), Gecko Moria (OP14-104) for Thriller Bark; Whitebeard (10c) as alt finisher
- **Sample counter density:** 12, with 0–4 flex copies of 2k-counter Events
- Source: [onepiece.gg B/Y Nami guide](https://onepiece.gg/blue-yellow-nami-guide-best-decks-strategy-eb03/)

### 4.3 Black Rob Lucci (2024 + 2025 Worlds winner; rotated)

- **Leader:** Rob Lucci (OP07-079) — Black, 5 Life, 5000 Power, Slash
- **Strategy:** Cost-reduction control. Trash top 2 from deck on strike; give opponent's character -1 cost during your turn.
- **Status:** **Rotation casualty** — relied on Block-1 support (Tsuru, Spandam, Brook, Kalifa, Rebecca) now out of Standard. Still legal in Extra Regulation.
- **Why it won twice:** Best-in-class against the rest of the format's threats; consistent removal + body trading
- **Historical significance:** Two consecutive Worlds wins on the same leader — the most-dominant single archetype in OPTCG history
- **Key engine cards (rotated):** Tsuru, Spandam, Lucci character, Jack (OP08 — recurring KO every turn), Rebecca (RHL combo piece)

### 4.4 Red Shanks (Worlds 2024 finalist; rotation-aware)

- **Leader:** Shanks (OP09-001) — Red
- **Strategy:** Aggressive midrange. Stack power, run opponent out of counters by turn 5.
- **Strengths:** Linear aggression, hard to disrupt
- **Weaknesses:** Vulnerable to Yellow Life manipulation (the matchup that beat it in Worlds 2024 finals)
- **Counter density:** 10–12 (aggro skew)

### 4.5 Yellow Enel (Block 1 + EB01 — illustrative)

- **Leader:** Enel (OP03-066) — Yellow, 4 Life (one fewer than standard 5)
- **Strategy:** Life-recursion. Place Trigger cards into Life Area, manipulate Life into a constructed second hand.
- **Trigger density:** 16–24 — Yellow's defining feature
- **Why it survived Block 1 rotation:** The Yellow Enel archetype reborn in OP15 as Purple Enel (different mechanic, same character)
- Source: [onepiece.gg Yellow Enel guide](https://onepiece.gg/yellow-enel-deck-guide-eb01/)

### 4.6 Red Zoro (foundational aggro — rotated)

- **Leader:** Roronoa Zoro (OP01-001) — Mono Red, 5 Life
- **Strategy:** Pure aggro/Rush. Leader gives all your Characters +1000 power per DON attached.
- **Why it mattered:** The "kindergarten" deck — every new player learns OPTCG by piloting Red Zoro. Pure attack math; minimal effect-stack management. The clearest entry point for the Hobbyist archetype.
- **Status:** Rotated April 2026. Now lives in Extra Regulation and as a teaching tool.

---

## Section 5 — DON economy theory

(Mechanics covered in [`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md) Section 2. This section is the *competitive* layer — what top players do with the determinism.)

OPTCG's DON ramp is **fully deterministic**:

- **Player 1**: 1 DON turn 1, +2 each subsequent turn → 1, 3, 5, 7, 9, 10, 10, …
- **Player 2**: 2 DON turn 1 (no Turn-1 penalty), +2 each turn → 2, 4, 6, 8, 10, 10, …

There is **no mana screw** and **no mana flood**. Every player knows the exact resource ceiling on every turn from move zero. This collapses MTG's "21–24 land" discussion into a non-issue and shifts deckbuilding pressure *entirely onto the cost curve*.

**Practical curve distribution** (from [TCG Protectors 2026 build guide](https://tcgprotectors.com/blogs/one-piece-deck-guides/how-to-build-one-piece-tcg-deck-2026)):

| Cost band | Typical count | Role |
|-----------|---------------|------|
| 1–3 DON | 16–24 cards | Searchers, hand counters, early blockers |
| 4–5 DON | 12–18 cards | Value engines and tempo plays — the deck's engine room |
| 6–7 DON | 6–10 cards | Pressure threats, premium removal |
| 8–10 DON | 2–4 cards | Finishers ("Boss Monsters"); hard-cap at 4 |

**The DON-trade tension**: every DON spent attacking is one that can't be held back for a Counter-Event. This is OPTCG's defining strategic dilemma — analogous to MTG's "tap out vs hold up" but **deterministic on both sides**, which means it becomes a pure information-game.

---

## Section 6 — Color archetype theory

Six colors, each with a mechanical identity. The 2026 dominant pairs map to specific dual-color leader frames.

| Color | Mechanical identity | Pace | Signature leader |
|-------|--------------------|------|------------------|
| **Red** | Aggro/Rush; high power, low cost, swing at Life | Fast | Roronoa Zoro (OP01-001) |
| **Green** | Rest/tap effects + DON ramp | Mid | Eustass Kid (ST02-001) |
| **Blue** | Hand draw + bounce + library manipulation | Slow | Doflamingo (OP01-060) |
| **Purple** | DON manipulation pushed to the extreme — *"the best Purple decks land 7- or 9-cost characters as soon as turn two"* | Variable (ramp + finisher) | Purple Kaido / Purple Enel (OP15) |
| **Black** | Removal + cost reduction; toolbox | Mid-slow | Sakazuki (OP05-041, banned-then-unbanned) / Rob Lucci (OP07-079) |
| **Yellow** | Life manipulation + Triggers | Late-pivot | Enel (OP03 / OP15) |

**Dual-color pairs** unlock cross-mechanics:

| Pair | Unlocks | Example |
|------|---------|---------|
| Red/Green | Aggressive bodies + DON-ramp to land mid-cost finishers faster | Chopper, Red/Green Smoker |
| Blue/Black | Bounce + remove (canonical "answers" pair) | Blue/Black Sakazuki (OP05 era) |
| Red/Blue | Aggression + draw + -power debuff stacking | Vivi (OP04), Lucy (OP15) |
| Red/Black | Aggressive Red + Black removal | Red/Black Sabo (OP13) |
| Black/Purple | Removal + DON-ramp — lands 10-cost finishers early | Black/Purple Luffy |
| Blue/Yellow | Draw + Life manipulation | Nami (OP11) |

Sources: [dotesports color guide](https://dotesports.com/one-piece/news/one-piece-card-game-colors-explained-what-each-optcg-colour-does), [sabatcg colors guide](https://sabatcg.com/a-beginners-guide-to-one-piece-tcg-colors-what-each-color-specializes-in), [coolstuffinc](https://www.coolstuffinc.com/a/joshuaaden-seo-05072024-what-color-should-i-play-in-the-one-piece-trading-card-game).

---

## Section 7 — Counter density, Trigger density, Searcher density

Three orthogonal levers every list pulls.

### Counter density

Historical doctrine: "16 counters minimum." **2026 doctrine: 10–12** — faster decks make excess defense dead-weight.

Layered as:
- **Character-counters**: 2-cost, 4000-power bodies with +2000 counter (e.g., Sabo PRB02-014, Mr2 OP02-064, Otama PRB02-016, Zeus OP11-106). Searchable → consistent.
- **Blockers**: 2–4 cost characters with Blocker keyword; defensive midrange staple.
- **[Counter] Events**: e.g., *Gum Gum Giant Gavel* (+4000 effective), *Love Love Mellow* (+4000 + free draw). 4 copies common in defensive decks.

The "2k counter backbone" is real: the 2000-power counter is the staple. Searchable counters layered with [Counter] Events form the defensive ring.

**Aggro skew** (Red Shanks, Red Zoro): 8–10 counters total. **Control skew** (Black Lucci): 14–18 counters.

### Trigger density

[Trigger] effects fire from the Life Area when Life is flipped. Probabilistic — you don't choose when, but they're free.

| Color | Typical Trigger density |
|-------|------------------------|
| Yellow | 16–24 (defining feature) |
| Non-Yellow | 4–8 (upside utility) |

Yellow decks lean hardest — Victoria Cindry, Absalom, Dr. Hogback, Perona all let you play a Character from trash on Trigger, "*going wider on the field*."

### Searcher density (the #1 consistency variable)

Searchers look at the top 5 of your deck and tutor a typed card (e.g., "*reveal 1 {Straw Hat Crew} card, add to hand*").

Examples:
- **Nami** searches by trait (Alabasta, Straw Hat Crew)
- **Vivi (EB03-024)** is a 4-cost "play up to 1 {Alabasta} or {Straw Hat Crew} type Character card with a cost of 5 or less"
- **Shura, Upper Yard** (Yellow Enel's primary searcher)
- **Koala (OP12-086)** for Red/Black Sabo
- **Drake / Bonney** for Supernova decks

Standard count: **4–8 searchers**. High-consistency decks push **12–16**:
- Black Imu: 12 searcher slots (4× Shalria, 4× Five Elders event, 4× Saturn)
- Red/Black Sabo: 16–18 across Koala, Garp, Revolutionary HQ

**Searcher density is the single biggest predictor of deck consistency.** A deck with 16 searchers + a 4-of finisher effectively runs ~16 "virtual" finishers.

---

## Section 8 — Mulligan strategy, going first/second

OPTCG allows **one mulligan only**. Draw 5, optionally shuffle back and redraw 5. The second hand is kept regardless.

**Default keep criteria** (from [WhensNika general guide](https://www.patreon.com/posts/one-piece-card-87476586)):

1. A play for turn 1 OR turn 2 (a 1-cost or 2-cost character ideally a searcher)
2. A path into turn 3 (a 3-cost or a chain of cheaper plays)
3. At least one Counter for the first big attack

By turn 3 you'll have drawn 2 additional cards + taken at least 1 Life flip = 3 extra cards. So a hand with turns 1+2 covered is statistically fine.

**Going first vs going second**:
- **Going first**: 1 DON turn 1, no draw turn 1. Keep if you have a 1-cost play (preferably a searcher) and a curve into 3-cost.
- **Going second**: 2 DON turn 1, +1 draw turn 1 (advantage). Mulligan more aggressively for 2-cost or 3-cost plays; a missed 2-drop is more punishing because you have more DON to waste.

**Deck-specific exceptions**: "Kaido hard mulligans for Onigashima" — some lists demand a specific opening piece and will accept worse hands to find it.

---

## Section 9 — Practical deck-construction sequence

Synthesized from competitive guides (no single source publishes this exact ladder; it's the implicit shape across the corpus):

1. **Pick Leader** — color access, Life value (4/5), attribute (Slash/Strike/Special/Ranged/Wisdom), leader effect. Match to playstyle.
2. **Identify wincon** — aggro Life-zero, control deck-out, midrange board domination, ramp-into-finisher.
3. **Lock the top-end** — 2–4 copies of your finisher(s). For Kid/Whitebeard/Kaido decks this is the centerpiece.
4. **Build the curve backwards** — 6-cost engine → 4–5 cost value → 2–3 cost tempo → 1-cost searchers.
5. **Layer searchers** — 8–16 slots dedicated to consistency. Type-trait determines which.
6. **Counter density** — 10–12 in current meta (was 16+ in earlier eras), layered as character-counters + event-counters + blockers.
7. **Tech / flex slots** — 4–8 reserved for meta-specific answers. Most guides call out "0–4 copies of X" rather than locking in.
8. **Playtest, adjust** — iterate against expected meta.

---

## Section 10 — Tournament structure (BO1 vs BO3, sideboards)

OPTCG tournaments at **Regional / Championship Final / World Final** level use **Best-of-3** for elimination rounds ([Bandai Championship 2023 rules](https://en.onepiece-cardgame.com/pdf/rule_cs2023_worldfinal.pdf)).

"*Cards not used in decks are treated as sideboard cards, and between games players can exchange cards in their deck with cards in their sideboard.*"

**Locals and Swiss rounds are often Best-of-1** — no sideboard. The competitive scene's sideboard culture is therefore **less developed than MTG's**. Most published lists are "BO1 ready" with optional tech slots called out.

The **"0–4 copies" / "flex slot"** notation in onepiece.gg deck guides is OPTCG's substitute for a formal sideboard.

**Implication for our play module**: the Competitor archetype's surface ([`/play/compete`](../../apps/storefront/src/app/play/compete/page.tsx)) should default to BO1 (current OPTCG ranked norm) but support a BO3+sideboard mode for tournament practice.

---

## Section 11 — Honest corrections to the popular framing

A few premises I've heard repeated in casual discussion that the sources do **not** support:

1. **Crocodile in OP01 is Mono Blue, not Green.** The "Block 1 boss" framing fits — but as Blue control, not green stall. The Green Crocodile leaders trace to OP14 (Black) and ST21 era.
2. **OP02 did not introduce Big Mom or Kaido leaders.** Whitebeard yes (OP02-001). Big Mom (Charlotte Linlin OP03-001) and the Yellow color came in **OP03**; major Kaido leader cards trace mostly to starter decks and later sets.
3. **Vinsmoke Reiju is OP06, not OP04.** OP04 carries Vinsmoke *characters* (Sanji 4c blocker, Diable Jambe event) but not a Vinsmoke leader.
4. **Kid+Killer Rush belongs to EB01-era**, post-OP04, not OP04 itself.
5. **"Awakening" is the set's flavour name, not a keyword mechanic.** No source supports an "Awakening" keyword like Yu-Gi-Oh's. The set name refers to Devil-Fruit awakenings in the manga.
6. **Edward Newgate in OP08 is a Character, not a Leader** (OP08-043, 10c/12000). Gol D. Roger Leader debuts in OP13.
7. **"Bellamy banned" / "Cabaji limited in 2024"** — not supported. First bans (Apr 2023) were Moby Dick + Cabaji (Cabaji unbanned Aug 2025). No Bellamy or Chopper restriction in the documented 2024-2025 record I can source.
8. **OPTCG has no "rotation announcement before the OP05 era"** — Block Rotation was announced 2025-03-16, well into Era 2.

These corrections matter because the tutorial layer (`/api/v1/play/tutorial`, `/api/v1/play/glossary`) will be referenced by agents and AI assistants — substrate-honest framing here prevents downstream propagation.

---

## Section 12 — What's still missing from this research

This document is honest about what it doesn't cover:

1. **World Championship 2025 winner specifics**. Sources confirm Abo on Black Lucci, but the 2025 World Final (Paris, scheduled) decklist breakdown was not surfaced in this pass.
2. **USA/EU Regional results 2024-2026** — individual tournament winners. The [Limitless tournaments archive](https://onepiece.limitlesstcg.com/tournaments) is canonical; would require per-tournament extraction.
3. **Exact metagame percentages** for the OP06/OP07/OP08 era. Community consensus is broadly tracked, but hard meta-share % data is incomplete pre-rotation.
4. **The full keyword corpus** including newer set introductions (Banish nuances post-OP08, SWORD archetype mechanics, Ghost Rare specifics).
5. **Content creator landscape verification** — Mid Piece, TheLuffyTCG, Mabi TCG, Egman Events, OrangeSamuraiD confirmed active. "Bryson Heady / Drowning Coast / Storm Spawned / ChannelFireball OP" did not surface in indexed search and require direct verification.
6. **The current "ranked vs casual" platform-share** — what % of online OPTCG play happens on OPTCGSim vs MOOgiwara vs TTS vs paper. This shapes any platform's go-to-market.
7. **The Extra Regulation / Eternal format meta** — paper coverage exists but online ranking systems for Extra Regulation are unclear.
8. **Asia / Japan flagship tournament results 2024-2025** — surfaced via [Top Decks JP archive](https://onepiecetopdecks.com/) but not exhaustively mapped.

---

## Sources

The research drew from:

**Primary (Bandai)**:
- [Bandai EN homepage + topics](https://en.onepiece-cardgame.com/)
- [Bandai TOPICS — April 2026 banlist + rotation](https://en.onepiece-cardgame.com/topics/029.php)
- [Bandai Championship 2023 World Finals Rules PDF](https://en.onepiece-cardgame.com/pdf/rule_cs2023_worldfinal.pdf)
- [Bandai Yellow Enel feature deck](https://en.onepiece-cardgame.com/feature/deck/deck_028.php)
- [Bandai Charlotte Linlin feature deck (015)](https://en.onepiece-cardgame.com/feature/deck/deck_015.php)

**Tournament aggregators**:
- [Limitless TCG — One Piece](https://onepiece.limitlesstcg.com/)
- [Limitless Worlds 2024 decklists](https://onepiece.limitlesstcg.com/tournaments/154/decklists)
- [Limitless Worlds 2025](https://onepiece.limitlesstcg.com/tournaments/273)
- [One Piece Top Decks](https://onepiecetopdecks.com/)

**Strategy / deck guides**:
- [OnePiece.gg homepage](https://onepiece.gg/) (rotation, banlist, leader guides)
- [OnePiece.gg OP15 post-ban tier list](https://onepiece.gg/one-piece-card-game-meta-tier-list-best-decks-standard-op15-post-ban/)
- [OnePiece.gg Purple Enel guide](https://onepiece.gg/purple-enel-guide-best-decks-strategy-op15/)
- [OnePiece.gg Blue/Yellow Nami EB03 guide](https://onepiece.gg/blue-yellow-nami-guide-best-decks-strategy-eb03/)
- [OnePiece.gg Red/Black Sabo guide](https://onepiece.gg/red-black-sabo-guide/)
- [OnePiece.gg Black Imu guide](https://onepiece.gg/black-imu-guide-best-decks-strategy-op13/)
- [TCG Protectors — How to Build a One Piece TCG Deck 2026](https://tcgprotectors.com/blogs/one-piece-deck-guides/how-to-build-one-piece-tcg-deck-2026)
- [Spell Mana — Red Zoro guide](https://spellmana.com/red-roronoa-zoro-deck-guide-one-piece-card-game/)
- [Spell Mana — OP15 meta tier list](https://spellmana.com/one-piece-card-game-op15-meta-tier-list-optcg-best-decks/)
- [WhensNika OPTCG general guide (Patreon)](https://www.patreon.com/posts/one-piece-card-87476586)

**Color theory + colors-explained**:
- [dotesports — OPTCG colors explained](https://dotesports.com/one-piece/news/one-piece-card-game-colors-explained-what-each-optcg-colour-does)
- [sabatcg — beginner's guide to OPTCG colors](https://sabatcg.com/a-beginners-guide-to-one-piece-tcg-colors-what-each-color-specializes-in)
- [Coolstuffinc — what color should I play](https://www.coolstuffinc.com/a/joshuaaden-seo-05072024-what-color-should-i-play-in-the-one-piece-trading-card-game)

**News + banlist**:
- [Onepieceplayer.com — Moby Dick + Cabaji ban](https://onepieceplayer.com/moby-dick-cabaji-banned-op-03-global-release/)
- [Onepieceplayer.com — September 2024 bans](https://onepieceplayer.com/new-one-piece-card-game-bans-trafalgar-law-replaced-current-banlist/)
- [SNKRDUNK — Worlds 2024 recap](https://snkrdunk.com/en/magazine/2025/03/17/one-piece-card-game-abo-beats-wf-to-win-one-piece-card-game-championship-2024-world-final/)
- [SNKRDUNK — Block Rotation announcement](https://snkrdunk.com/en/magazine/2025/03/17/one-piece-card-game-rotation-to-be-introduced-to-tournament-play-from-april-2026/)
- [TCGplayer — 2026 Standard Rotation Guide](https://www.tcgplayer.com/content/article/2026-One-Piece-Standard-Rotation-Guide/c9aabe8a-cb1d-48bd-a1b2-ea04a71499a0/)
- [Bang For Your Buck TCG — Block 1 Rotation Guide](https://bangforyourbucktcg.com/blogs/tcg-insights/one-piece-tcg-block-1-rotation-guide-2026)

**Set-release coverage**:
- [dotesports — OPTCG set release schedule](https://dotesports.com/one-piece/news/one-piece-card-game-release-schedule-every-new-optcg-english-set-and-release-date)
- [TCG Corner — OP08 Two Legends](https://tcg-corner.com/blogs/news/op08-two-legends)
- [TCGplayer — OP14 Azure Sea's Seven](https://www.tcgplayer.com/content/article/Everything-We-Know-About-One-Piece-TCG-The-Azure-Sea-s-Seven-OP-14/2f01647c-6f64-42c0-899c-3ece7b73e2bb/)

**Game rules (for cross-reference)**:
- [Bandai Comprehensive Rules PDF](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf)
- [one-piece-tcg.com — Game Rules Guide](https://one-piece-tcg.com/guides/one-piece-tcg-game-rules-guide)
- [TCG Protectors — Game Rules 2026 explained](https://tcgprotectors.com/blogs/one-piece-player-guides/one-piece-card-game-rules-2026-explained)

---

## Recursion targets

For future research / engineering kingdoms:

→ **Template-deck library on the storefront** — `/play/decks/template/{leader-slug}` rendering each of the six template decks above (Purple Enel, B/Y Nami, Black Lucci, Red Shanks, Yellow Enel, Red Zoro). Decklists + curve chart + strategy summary + the matchup table. Composes with S32 (`the-shared-table.md` tutorial layer).

→ **Format-aware filtering on `/cards/[sku]`** — surface "Standard legal? Yes / No / Extra Regulation only" provenance based on the card's set block.

→ **Ban-list timeline endpoint** — `/api/v1/play/banlist-history` returning the typed timeline (date, action, cards, reason) for client rendering. Inverse-shape of the static table above.

→ **Meta-share tracker substrate** — periodic ingest from Limitless tournament results. The data-ingest substrate (kingdom-060/062) is the right foundation. Top-cut % by leader, normalized by event tier, surfaced as `/api/v1/play/meta/snapshot`.

→ **Searcher-density score** in the future Deck Builder — compute a numeric "consistency score" from the count of searcher-type characters + searcher-events. Visible to the user via `<Provenance>` (substrate honest about how it's computed).

→ **The Counter dialog** in the future engine — Section 5 of the existing mechanics doc names this as the design wall. Modeling it well requires the priority-passing protocol + async deadlines for the Asynchronous archetype.

→ **Archetype taxonomy in `packages/optcg-meta/`** — a typed-data package exporting the timeline + ban list + tier list as JSON. Storefront + admin + future ranked-play surfaces all consume from one source.

---

*This is the kingdom's working understanding of OPTCG competitive meta + deckbuilding as of 2026-05-13. Research, not a ship. The fun-first boundary still holds — skill is fun; money is play-to-earn; meta-awareness is a quality-of-life feature for the Competitor archetype but doesn't change what's actually played at `/play/casual` for the Hobbyist.*

*— Sophia (Opus 4.7, 1M context), 2026-05-13. Synthesized from four parallel research agents covering OP01-OP04 era, OP05-OP08 era, current rotation era, and deckbuilding doctrine. Cross-checked against [Limitless TCG](https://onepiece.limitlesstcg.com/), [OnePiece.gg](https://onepiece.gg/), [Bandai EN](https://en.onepiece-cardgame.com/), and [TCG Protectors](https://tcgprotectors.com/) corpora. Sibling research to [`optcg-mechanics-and-engine-design.md`](./optcg-mechanics-and-engine-design.md) (kingdom-068).*

🐍❤️
