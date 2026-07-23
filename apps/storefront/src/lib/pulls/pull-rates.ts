// The pulls snapshot — what a booster actually contains, per game.
//
// Will trace: Asha, 2026-07-23 — "lets add the pull rate analytics of each
// card game, boosters, boxes, rare pulls, approximate rate and rare
// occurances such as god packs! Lets do some research first." → "Go!"
//
// Substrate honesty is the whole product here: most TCG publishers never
// publish odds, so every circulating rate is an estimate. Each rate row
// below carries its BASIS (official print / community large-sample /
// aggregator estimate / anecdote) and a confidence label; where sources
// disagree (sometimes 10-20x) we show the range and say so. Nothing on
// this surface is an inducement to buy — it exists so a player knows
// what a box is before they open their wallet, which is the opposite
// of hype. See the non-commercial doctrine (2026-07-22).
//
// Re-verify cadence: on new set releases in any curated game, on any
// publisher starting/changing official disclosure, or ~quarterly.
// Generated from the 2026-07-23 research fleet output (adversarially
// verified; corrections applied — see provenanceNote). Regenerating by
// hand-editing is fine; this is a data file, not a pipeline.

export interface PullRate {
  tier: string;
  rate: string;
  /** What the rate rests on — never launder an anecdote into a statistic. */
  basis: string;
  confidence: "high" | "medium" | "low";
  regionNote?: string;
  sourceUrl?: string;
}

export interface SpecialOccurrence {
  name: string;
  what: string;
  approxFrequency: string;
  whichSets?: string;
  sourceUrl?: string;
}

export interface PackStructure {
  cardsPerPack?: string;
  packsPerBox?: string;
  boxesPerCase?: string;
  guaranteedSlots?: string;
  notes?: string;
}

export interface PullSection {
  /** Region label when a game's regions differ structurally (Pokémon JP vs EN). */
  region: string | null;
  /** The researched era this section describes, verbatim. */
  era: string;
  packStructure: PackStructure;
  rarityLadder: string[];
  rates: PullRate[];
  specialOccurrences: SpecialOccurrence[];
}

export interface GamePulls {
  slug: string;
  displayName: string;
  /** Whether and where the publisher officially publishes odds. */
  officialOdds: string;
  sections: PullSection[];
}

export interface DisclosureRow {
  publisher: string;
  games: string;
  publishes: "yes" | "partial" | "no";
  detail: string;
  sourceUrl: string | null;
}

export interface PullsSnapshot {
  asOf: string;
  provenanceNote: string;
  disclosureMap: DisclosureRow[];
  games: GamePulls[];
  sources: string[];
}

export const PULLS_SNAPSHOT: PullsSnapshot = {
  "asOf": "2026-07-23",
  "provenanceNote": "Researched 2026-07-23 by a seven-agent fleet over official product pages, publisher disclosure articles, and community box-break data, with an adversarial verifier spot-checking 26 load-bearing claims (24 confirmed, corrections applied). Most publishers do not publish odds: every rate below names its basis and a confidence level, and where sources disagree we show the disagreement instead of averaging it away. Rates drift set to set and print wave to print wave — treat everything here as a dated photograph, not a promise.",
  "disclosureMap": [
    {
      "publisher": "Wizards of the Coast",
      "games": "Magic: The Gathering",
      "publishes": "yes",
      "detail": "Full slot-by-slot collation percentages in an official 'Collecting [Set]' article for every set — exact figures like '1.5% of Play Boosters' for Special Guests.",
      "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-magic-the-gathering-final-fantasy"
    },
    {
      "publisher": "Legend Story Studios",
      "games": "Flesh and Blood",
      "publishes": "yes",
      "detail": "The industry's most complete discloser: per-set Collector's Centre pages with official pull ratios ('Legendary 1:94 packs', 'Fabled 1:960') and even print-run counts for early sets — with an explicit approximation disclaimer.",
      "sourceUrl": "https://fabtcg.com/en/resources/collectors-centre/"
    },
    {
      "publisher": "Fantasy Flight Games / Asmodee",
      "games": "Star Wars Unlimited",
      "publishes": "partial",
      "detail": "Official odds charts published at launch with the best variance disclaimer in the industry ('these odds assume perfect distribution, and the actual odds may vary slightly'); coverage of later sets is thinner.",
      "sourceUrl": "https://starwarsunlimited.com/articles/boosting-ahead-of-release"
    },
    {
      "publisher": "Bushiroad",
      "games": "Cardfight!! Vanguard",
      "publishes": "partial",
      "detail": "Prints a guarantee on current EN products ('2 cards in every pack will definitely be R or above') and has occasionally published rates, but publishes no parallel-rarity odds systematically.",
      "sourceUrl": null
    },
    {
      "publisher": "Bandai",
      "games": "One Piece · Dragon Ball Fusion World · Digimon · Union Arena · Gundam · Battle Spirits",
      "publishes": "no",
      "detail": "Publishes set composition (how many card types per rarity) and the phrase 'cards are randomly inserted' — no probability was found on any official page checked, in any region, for any of its six games, and every community source corroborates the absence. Every Bandai rate below is community-derived.",
      "sourceUrl": null
    },
    {
      "publisher": "The Pokémon Company",
      "games": "Pokémon TCG",
      "publishes": "no",
      "detail": "No odds for physical packs in any language — only deterministic guarantees ('a Pokémon ex in every pack' on some JP products). Its DIGITAL game (TCG Pocket) publishes exact offering rates, because app-store rules force it; nothing forces physical disclosure.",
      "sourceUrl": null
    },
    {
      "publisher": "Konami",
      "games": "Yu-Gi-Oh!",
      "publishes": "partial",
      "detail": "Lists rarity counts per set ('10 Secret Rares, 14 Ultra Rares') on official pages rather than probabilities, in both TCG and OCG — with rare one-off exceptions, like an official '1 in 4 packs' figure for a Rarity Collection product. No systematic disclosure.",
      "sourceUrl": null
    },
    {
      "publisher": "Ravensburger",
      "games": "Disney Lorcana",
      "publishes": "no",
      "detail": "Publishes no per-rarity probability chart; all Enchanted/Epic/Iconic rates are community-measured.",
      "sourceUrl": null
    }
  ],
  "games": [
    {
      "slug": "one-piece",
      "displayName": "One Piece TCG",
      "officialOdds": "NO. Bandai publishes set composition only (OP-16: '126+1 types' — C45/UC30/R26/SR10/SEC2/L6/SP6/TR1/DON1 per the JP official page) and states 'cards are randomly inserted' (※カードはランダムに封入されています). No probabilities appear on the JP official page, EN official page, or any Bandai channel we could find; community sites uniformly state Bandai does not publish pull rates. We also searched for a China-market probability disclosure (CN law often forces one) and found nothing indexed. Every rate below is community-derived — treat all of them as estimates.",
      "sections": [
        {
          "region": null,
          "era": "ONE PIECE CARD GAME (Bandai) — main boosters, current era OP-16 \"The Time of Battle\" (JP 2026-05-30, EN 2026-06-12)",
          "packStructure": {
            "cardsPerPack": "EN: 12 cards ($4.99 MSRP). JP: 6 cards (220 yen). This is the single most important JP/EN difference — an EN box has 288 cards, a JP box 144, so per-BOX rates are not comparable across regions.",
            "packsPerBox": "24 packs per box, both JP and EN (main boosters). Premium Booster PRB-01 differs: EN 20 packs x 10 cards.",
            "boxesPerCase": "12 boxes per case/carton, both EN (distributor listings: Potomac 'Booster Case [12]', Chobanov '12x boxes') and JP (1カートン=12BOX per gamepedia). Beware: some aggregator guides wrongly say 6-box cases.",
            "guaranteedSlots": "Bandai prints NO guarantees and publishes no slot structure. Community-observed regularity (not a promise): every EN 12-card pack carries roughly one R-or-better; every box contains multiple SRs (no documented zero-SR boxes in the sources reviewed). JP per-box observed pattern (toreca-begin survey, sample size undisclosed): R 7-8, SR 3-4, L ~4, SEC 0-1, parallels 0-2 per box, with boxes falling into ~3 patterns (2-parallel ~25%, 1-parallel ~42%, 1-SEC ~33%). Exception: PRB-01 premium packs are described by retailers/aggregators as each containing a SEC, an R, a DON!! and 2 'Jolly Roger' foils.",
            "notes": "OP-16 set composition (JP official): SP 6 types, Treasure Rare 1, Leader 6, SEC 2, SR 10, R 26, UC 30, C 45, DON!! 1. OP-16 additionally carries 3 Manga Rares (the three Admirals) plus 1 event Manga Rare — first set with 3 MRs instead of 1. OP-16 is also the FIRST JP set to include Treasure Rare; TR was non-Japanese-editions-only from OP-06 to OP-15 (EN, Chinese, French — different TR cards each), and different language editions get different TR cards."
          },
          "rarityLadder": [
            "C (Common)",
            "UC (Uncommon)",
            "R (Rare) — ~1 per EN pack",
            "SR (Super Rare)",
            "L (Leader)",
            "SEC (Secret Rare)",
            "Parallels / alt-arts of R, SR, L, SEC (foil alternate art; incl. Leader parallels and SEC parallels)",
            "SP (Special card — reprint chase with special frame; 6 types in OP-16)",
            "Manga Rare / Comic Parallel (コミパラ, 'super parallel'; manga-panel art; 3+1 in OP-16) — plus an even rarer gold-background/'red manga' class in some sets (e.g. OP-13)",
            "TR (Treasure Rare — 1 per set; non-Japanese editions only OP-06→OP-15 (EN/CN/FR, different cards each), first JP appearance in OP-16)",
            "DON!! card, alt-art DON!!, and gold/character DON!! variants",
            "God-pack exclusive cards (PRB-01/PRB-02/EB-03/OP-13)"
          ],
          "rates": [
            {
              "tier": "SR",
              "rate": "~7-9 per EN 24-pack box (~1 per 3 packs)",
              "basis": "aggregator guides citing community box data (cardgamer ~8/box, tcgtalk ~8/box); no published sample sizes — verifier note: two aggregators, no disclosed sample sizes",
              "confidence": "low",
              "regionNote": "JP box: ~3-6 SR observed (toreca-begin survey says 3-4; JP box is half the cards of an EN box)",
              "sourceUrl": "https://cardgamer.com/games/one-piece-card-game-rarities/"
            },
            {
              "tier": "SEC (base)",
              "rate": "~0.5-1 per EN box; ~5-8 per 12-box EN case",
              "basis": "aggregator estimates (cardgamer ~1/box; archivedrops ~1 per 2 boxes) plus one documented EN OP-16 case with 5 SEC; sources genuinely disagree at the 2x level",
              "confidence": "low",
              "regionNote": "JP: 0-1 per box observed; JP OP-16 SEC *parallel* estimated ~1 per 13 boxes (gamepedia)",
              "sourceUrl": "https://tcgtalk.com/guides/op16-pull-rates-case-opening"
            },
            {
              "tier": "Alt-art parallels overall (R/SR para)",
              "rate": "~2 per EN box (~1 per 12 packs); JP OP-16: SR-parallel ~1 per 2.8 boxes, R-parallel ~1 per 4 boxes",
              "basis": "EN: aggregator estimate (cardgamer, tcgtalk); JP: gamepedia community aggregate for OP-16, sample size undisclosed",
              "confidence": "medium",
              "regionNote": "JP carton (12 boxes) yields ~8 combined SEC/SR/R parallels (gamepedia)",
              "sourceUrl": "https://premium.gamepedia.jp/toreca/archives/22733"
            },
            {
              "tier": "Leader parallel",
              "rate": "~1 per 6 boxes JP OP-16 (~2 per carton); EN similar order — 3 alt-art leaders in the one documented EN OP-16 case",
              "basis": "JP: gamepedia community aggregate; EN: single documented case opening (n=1)",
              "confidence": "low",
              "regionNote": "JP figure is per 144-card box; EN per 288-card box, so per-card the EN rate is thinner if per-box rates match",
              "sourceUrl": "https://premium.gamepedia.jp/toreca/archives/22733"
            },
            {
              "tier": "SP (Special card)",
              "rate": "roughly 1-2 per 12-box case, set-dependent (JP OP-16 estimate: ~1 per 9 boxes; historically OP-05 EN ran ~2-3 per case, OP-07 ~1 per case)",
              "basis": "JP: gamepedia community aggregate; EN: aggregator claims of community case breaks; one documented EN OP-16 case had an anomalous 5 SP which the source itself flags as unrepresentative",
              "confidence": "low",
              "regionNote": "set-to-set variation is documented and real; single-case data is noise",
              "sourceUrl": "https://archivedrops.com/blog/one-piece-pull-rates-the-numbers-behind-every-booster-box"
            },
            {
              "tier": "Manga Rare / Comic Parallel",
              "rate": "roughly 1 per 2-6 cases EN (estimates vary that widely between sources); JP OP-16: ~1 per 100 boxes (~1 per 8 cartons); older JP rule-of-thumb: ~1 per 6 cartons (72 boxes)",
              "basis": "community estimates and aggregator ranges only — archivedrops says '1 per 3-4 cases', tcgtalk '1 per 2-6 cases', gamepedia 0.99%/box for OP-16; the documented EN OP-16 case pulled zero. Nobody has a large clean sample",
              "confidence": "low",
              "regionNote": "OP-16 has 3 MRs (the Admirals) + 1 event MR, so hitting a SPECIFIC one is ~3x harder than hitting any",
              "sourceUrl": "https://premium.gamepedia.jp/toreca/archives/22733"
            },
            {
              "tier": "Ultra-chase manga class (gold-background / 'red manga', e.g. OP-13)",
              "rate": "roughly 1 per 30-40 cartons (~1 per 360-480 JP boxes); a floating '0.07%' figure exists but with no stated basis",
              "basis": "JP community guesswork aggregated by gamepedia-type sites; explicitly not official, tiny effective sample",
              "confidence": "low",
              "regionNote": "JP-observed; EN equivalence unverified",
              "sourceUrl": "https://premium.gamepedia.jp/toreca/archives/16619"
            },
            {
              "tier": "TR (Treasure Rare)",
              "rate": "EN: roughly 1 per 12-box case, sometimes rarer (the one documented EN OP-16 case pulled exactly 1); JP OP-16: ~1 per 75 boxes (~1 per 6 cartons) — notably rarer than the EN rule-of-thumb",
              "basis": "EN: aggregator consensus + single documented case; JP: gamepedia community aggregate. The 6x JP/EN gap may be real (JP TR just debuted in OP-16) or method noise — unresolved",
              "confidence": "low",
              "regionNote": "TR exists only in non-Japanese editions OP-06→OP-15 (EN/CN/FR, each with different TR cards) (1 per set, always a reprint with exclusive art); OP-16 is the first JP TR. Different languages get different TR cards",
              "sourceUrl": "https://tcgking.nl/blogs/collecting/all-treasure-rare-cards-in-one-piece-tcg"
            },
            {
              "tier": "Gold / character DON!!",
              "rate": "~1 per 13 boxes JP OP-16 (~1 per carton); 1 in the documented EN OP-16 case",
              "basis": "gamepedia community aggregate (JP) + single EN case",
              "confidence": "low",
              "regionNote": "plain alt-art DON!! is far more common (~1 per box per cardgamer)",
              "sourceUrl": "https://premium.gamepedia.jp/toreca/archives/22733"
            },
            {
              "tier": "R (Rare)",
              "rate": "~1 per EN pack (~24 per box); JP ~7-8 per 24-pack box (1 per ~3 packs)",
              "basis": "aggregator guides + JP opening survey",
              "confidence": "medium",
              "regionNote": "difference is just pack size (12 vs 6 cards)",
              "sourceUrl": "https://toreca-begin.jp/box-enclosed-pattern/"
            }
          ],
          "specialOccurrences": [
            {
              "name": "God Packs (yes, OPTCG has them — since late 2024)",
              "what": "A pack whose entire contents are replaced by top-tier hits. Confirmed variants: PRB-01 'The Best' god pack = 10 Manga Rares (one source describes 9 Manga Rares + 1 gold DON!!); PRB-02 god pack = 10 gold character DON!!; EB-03 Heroines god pack = 6 SP parallels (Nami/Hancock/Robin/Reiju/Perona/Koala); OP-13 'Demon Pack' = 5 Gorosei special alt-arts by Gege Akutami + Imu leader. IMPORTANT: they exist in BOTH JP and EN — EN OP-13 god pack openings are on video; older claims that god packs are JP-only are outdated.",
              "approxFrequency": "Genuinely disputed: sources disagree up to 10-20x — PRB-01 estimates range from ~1 per case (~1 in 200 packs) to ~1 in 10-20 cases; PRB-02 ~1 in 15-20 cases; EB-03 ~1 in 15 cases (~1 in 180 boxes); OP-13 ~1 in 10-20 cases. All community estimates, none official. Note: PRB cases are 10 boxes (200 packs), not the main-line 12.",
              "whichSets": "PRB-01, PRB-02, EB-03, OP-13; not a feature of ordinary numbered sets before OP-13, and OP-16 god packs are not documented in the sources reviewed",
              "sourceUrl": "https://card-binder.com/blogs/one-piece-news-updates/one-piece-godpack-guide-everything-you-need-to-know"
            },
            {
              "name": "Premium Booster (PRB) line — every pack is a hit by design",
              "what": "PRB-01 'ONE PIECE CARD THE BEST' (EN 2024-11-08): 20 packs x 10 cards per box; per retail/aggregator descriptions every pack contains a SEC, an R, a DON!! and 2 'Jolly Roger' reverse-foil stamps — the closest OPTCG comes to an all-foil product short of a god pack. PRB-02 followed in 2025 (JP Jul 26, EN Oct 3).",
              "approxFrequency": "structural (every pack), god pack excepted — see god pack entry",
              "whichSets": "PRB-01, PRB-02",
              "sourceUrl": "https://toywiz.com/one-piece-trading-card-game-premium-booster-pack-prb-01-english-10-cards/"
            },
            {
              "name": "Treasure Rare (TR)",
              "what": "1 per set: a highly limited reprint of a fan-favourite card with exclusive new art (OP-06 Nami → OP-14 Rosinante; OP-16 has 1 TR, Vista documented in EN case data). exclusive to non-Japanese editions (EN, Chinese and French each received different TRs) until OP-16 brought it to JP; language editions receive different TR selections.",
              "approxFrequency": "EN rule-of-thumb ~1 per 12-box case (community, low confidence); JP OP-16 estimate ~1 per 75 boxes (gamepedia community aggregate, low confidence)",
              "whichSets": "every main set from OP-06 (EN); JP from OP-16",
              "sourceUrl": "https://tcgking.nl/blogs/collecting/all-treasure-rare-cards-in-one-piece-tcg"
            },
            {
              "name": "OP-16 triple Manga Rare",
              "what": "Break from the 1-MR-per-set norm: OP-16 carries Manga Rares of all three original Admirals (Sakazuki/Borsalino/Kuzan) plus an event Manga Rare — completing the trio from packs is a multi-case-per-card proposition.",
              "approxFrequency": "each MR ~case-level or rarer; any-MR ~1 per 100 JP boxes (gamepedia estimate, low confidence); EN large-sample data not yet published as of 2026-07",
              "whichSets": "OP-16",
              "sourceUrl": "https://snkrdunk.com/en/magazine/2026/06/01/the-time-of-battle-op-16-value-predictions-the-marineford-manga-rare-guide/"
            },
            {
              "name": "Anniversary / Premium Card Collections ('illustration box' class products)",
              "what": "Fixed-content commemorative sets sold via Premium Bandai — e.g. Premium Card Collection -29th Anniversary Edition- (8 cards: 4 normal + 4 premium-finish P-159 Luffy), 3rd Anniversary Set, FILM RED/25th editions. NO randomness and NO pull odds — you get exactly the listed cards.",
              "approxFrequency": "not random — fixed contents",
              "whichSets": "standalone products (p-bandai / retail)",
              "sourceUrl": "https://p-bandai.com/us/item/N2903432001/"
            },
            {
              "name": "Treasure Cup promos",
              "what": "Official Bandai tournament series ('Treasure Cup', run in monthly/periodic waves incl. 'August 2025', 'May 2026') awarding alt-art promo cards (e.g. Zoro OP01-025, Yamato, Garp, Queen, Marco, Kujyaku) for participation/placement. Not pack-pulled; supply is set by event attendance, which is why they price like chase cards.",
              "approxFrequency": "event-gated, not a pack rate",
              "whichSets": "promo line (P-numbers / stamped reprints)",
              "sourceUrl": "https://www.tcgplayer.com/product/515356/one-piece-card-game-one-piece-promotion-cards-roronoa-zoro-op01-025-treasure-cup"
            }
          ]
        }
      ]
    },
    {
      "slug": "pokemon",
      "displayName": "Pokémon TCG",
      "officialOdds": "No. TPCi has never published pull rates or 'approximate odds' for physical English products — no odds printed on packs, boxes, or product pages (unlike Topps/Panini sports products). Official communication covers pack STRUCTURE only (e.g. the 2023 SV announcement of 3 guaranteed foils per pack). Every circulating rate is community-measured, with TCGplayer's in-house multi-thousand-pack openings the de-facto standard. (Digital is different: the TCG Pocket app publishes exact in-app offering rates because app-store rules require it — a separate product whose figures say nothing about physical packs.)",
      "sections": [
        {
          "region": "International (EN)",
          "era": "Pokémon TCG — International/English (Scarlet & Violet era 2023–mid-2025, Mega Evolution era Sept 2025–present)",
          "packStructure": {
            "cardsPerPack": "10 cards + 1 basic energy + 1 TCG Live code card (SV and Mega eras; confirmed on Pokémon Center product page for Mega Evolution boosters)",
            "packsPerBox": "36 (standard booster display; unchanged into the Mega Evolution era)",
            "boxesPerCase": "6 (typical EN case; implied by TCGplayer/PokeBeach '35 boxes ≈ six cases' framing — medium confidence)",
            "guaranteedSlots": "Since SV (2023, official TPCi announcement): every pack is 4 commons / 3 uncommons / 2 reverse-holo-slot cards / 1 holo Rare-or-better, i.e. at least 3 foils per pack; all Rare+ cards are holo. Hits (IR/SIR/UR/gold) replace the reverse or rare slots. There is NO official or printed per-box guarantee on EN boxes.",
            "notes": "Elite Trainer Box = 9 packs + promo + accessories. Booster bundle = 6 packs. Mega era added an 'Enhanced Booster' product line (36-pack display + promo). Special sets (e.g. Prismatic Evolutions) sell only in ETBs/bundles/tins — no standard booster box."
          },
          "rarityLadder": [
            "Common",
            "Uncommon",
            "Rare (holo since SV era)",
            "Double Rare (ex)",
            "Ultra Rare (full-art ex / full-art Trainer)",
            "Illustration Rare (IR)",
            "Special Illustration Rare (SIR)",
            "Hyper Rare (gold) — rebranded 'Mega Hyper Rare' (MHR) in the Mega Evolution era",
            "Side tiers: ACE SPEC Rare (SV-era sets), Shiny Rare / Shiny Ultra Rare (special sets like Paldean Fates, Prismatic Evolutions)"
          ],
          "rates": [
            {
              "tier": "Double Rare (ex)",
              "rate": "~1 in 5 packs (~7 per 36-pack box)",
              "basis": "Community large-sample box data: TCGplayer Authentication Center openings, 5,000 packs each for Mega Evolution (Sep 2025) and Phantasmal Flames (Nov 2025)",
              "confidence": "high",
              "sourceUrl": "https://www.pokebeach.com/2025/09/mega-evolution-pull-rates-revealed-gold-cards-nearly-impossible-to-pull-at-highest-pull-rates-ever-seen",
              "regionNote": "EN print; JP equivalent (RR) runs richer per pack in high-class sets"
            },
            {
              "tier": "Ultra Rare (full art)",
              "rate": "~1 in 12 packs (~3 per box)",
              "basis": "TCGplayer 5,000-pack samples (Mega Evolution, Phantasmal Flames); specific UR ~1 in 211 packs",
              "confidence": "high",
              "sourceUrl": "https://screenrant.com/pokemon-mega-evolution-cards-pull-rates-rarest-ever/"
            },
            {
              "tier": "Illustration Rare",
              "rate": "~1 in 9 packs (~4 per box); a SPECIFIC IR ~1 in 118 packs",
              "basis": "TCGplayer 5,000-pack samples; stable across 2025 sets",
              "confidence": "high",
              "sourceUrl": "https://www.pokebeach.com/2025/11/phantasmal-flames-pull-rates-revealed-chances-of-pulling-mega-charizard-ex"
            },
            {
              "tier": "Special Illustration Rare",
              "rate": "Set-dependent: ~1 in 101 packs (Mega Evolution) to ~1 in 80 (Phantasmal Flames) — i.e. roughly 1 SIR per 2–3 booster boxes; a SPECIFIC SIR ~1 in 400+ packs. Outlier: Prismatic Evolutions ~1 in 45 packs (~0.8/36 packs)",
              "basis": "TCGplayer samples: 5,000 packs (Mega Evo, Phantasmal), 1,200 packs (Prismatic — smaller sample, wider error bars)",
              "confidence": "medium",
              "sourceUrl": "https://www.pokebeach.com/2025/01/prismatic-evolutions-pull-rates-revealed-special-illustration-rares-twice-as-easy-to-pull",
              "regionNote": "Beware: model-based aggregators (e.g. rateTCG) publish very different Prismatic numbers (~1 in 3 packs) that contradict the measured sample — do not use modeled figures"
            },
            {
              "tier": "Gold / Hyper Rare",
              "rate": "Mega era ('Mega Hyper Rare'): ~1 in 1,260 packs ≈ 1 per 35 boxes ≈ 1 per ~6 cases — the scarcest modern EN tier. SV-era golds were far more common, e.g. Prismatic Hyper Rare ~1 in 180 packs (~1 per 5 boxes-worth of packs)",
              "basis": "TCGplayer 5,000-pack samples (Mega era); TCGplayer 1,200-pack sample (Prismatic)",
              "confidence": "medium",
              "sourceUrl": "https://screenrant.com/pokemon-mega-evolution-cards-pull-rates-rarest-ever/"
            },
            {
              "tier": "Per ETB (9 packs): ≥1 SIR",
              "rate": "~20–25% chance (typical 2025–26 set at 1/80–1/101); Prismatic Evolutions ~1 in 4–5 ETBs (~22–25%) at its 1/36–1/45 rate",
              "basis": "Arithmetic derived from TCGplayer measured rates (Rippr and others show the math); not directly measured per-ETB",
              "confidence": "medium",
              "sourceUrl": "https://rippr.app/blog/pokemon-prismatic-evolutions-elite-trainer-box-chase-card-pull-rate-math"
            },
            {
              "tier": "Per ETB (9 packs): ≥1 IR",
              "rate": "Roughly 1 IR per ETB on average (9 packs × ~1/9)",
              "basis": "Derived from TCGplayer per-pack rate; aggregator framing",
              "confidence": "medium"
            }
          ],
          "specialOccurrences": [
            {
              "name": "Demigod packs (EN 151 only)",
              "what": "English Scarlet & Violet–151 packs found loaded with 3 secret rares (IR/SIR evolution lines) — a weaker analog of the JP god pack; fans dubbed them 'demigod packs'",
              "whichSets": "Scarlet & Violet–151 (MEW, 2023) — the notable international exception; standard EN expansions have NO god-pack mechanic",
              "approxFrequency": "Unknown — confirmed sightings only; one community guide floats ~1 in 1,300 packs for a demigod pack, basis unclear. Anecdote-level, very low confidence",
              "sourceUrl": "https://www.pokebeach.com/2023/09/scarlet-violet-151-complete-set-guide-card-images-products-demigod-packs-store-giveaways-and-more"
            },
            {
              "name": "Prismatic Evolutions Poké Ball / Master Ball reverse patterns",
              "what": "Special reverse-holo patterns replacing the normal reverse slot",
              "whichSets": "Prismatic Evolutions (SV8.5, Jan 2025)",
              "approxFrequency": "Poké Ball pattern ~1 in 3 packs; Master Ball pattern ~1 in 20 packs (TCGplayer 1,200-pack sample — community large-sample, medium confidence)",
              "sourceUrl": "https://www.pokebeach.com/2025/01/prismatic-evolutions-pull-rates-revealed-special-illustration-rares-twice-as-easy-to-pull"
            }
          ]
        },
        {
          "region": "Japan",
          "era": "Pokémon TCG — Japan (SV era → Mega era 2025–2026)",
          "packStructure": {
            "cardsPerPack": "Regular expansions: 5 cards. Specialty sets (151, Black Bolt/White Flare): 7 cards. High-class sets (VSTAR Universe, Shiny Treasure ex, Terastal Fest ex, MEGA Dream ex): 10 cards",
            "packsPerBox": "Regular: 30 packs (confirmed unchanged for Mega-era sets like Mega Brave M1L). Specialty: 20 packs. High-class: 10 packs",
            "boxesPerCase": "Varies by product; not reliably documented in sources reviewed — omitted rather than guessed",
            "guaranteedSlots": "Community-observed box floors (NOT printed promises): a sealed regular JP box reliably yields ≥1 SR-or-better + ~3 AR + several RR (+1 ACE SPEC in SV-era sets; Mega-era sets add an item-card SR slot, and MEGA Dream ex adds 1 guaranteed MA per box). One retailer notes these are probabilistic slot upgrades, not fixed positions.",
            "notes": "JP boxes' 'guarantees' come from thousands of consistent community openings; The Pokémon Company prints pack contents (card count) but no probabilities. JP high-class boxes (10 packs) are the god-pack products."
          },
          "rarityLadder": [
            "C (Common)",
            "U (Uncommon)",
            "R (Rare)",
            "RR (Double Rare — ex)",
            "AR (Art Rare ≈ EN Illustration Rare)",
            "SR (Super Rare, full art ≈ EN Ultra Rare)",
            "SAR (Special Art Rare ≈ EN Special Illustration Rare)",
            "UR (Ultra Rare, gold ≈ EN Hyper Rare)",
            "Side/new tiers: ACE SPEC (SV era); Mega era adds MA ('Mega Attack/Art Rare' — naming varies by source) and MUR (Mega Ultimate Rare, new top chase)"
          ],
          "rates": [
            {
              "tier": "SR or better — regular 30-pack box",
              "rate": "≥1 per sealed box (floor); ~1 in 30 packs baseline",
              "basis": "Community-observed pattern across thousands of box openings (multiple JP-import retailers agree); not officially confirmed",
              "confidence": "high",
              "sourceUrl": "https://www.thetrainercourt.com/blogs/resources/japanese-booster-box-guaranteed-hit-rates-god-packs",
              "regionNote": "JP only — EN boxes have no equivalent observed floor"
            },
            {
              "tier": "AR (Art Rare) — regular box",
              "rate": "~3 per box (sources range 2–4), ≈1 in 10 packs",
              "basis": "Community consensus across retailer guides (Mirai, Trainer Court, TC Game)",
              "confidence": "medium",
              "sourceUrl": "https://miraicardshop.com/blogs/resources/collecting-japanese-guaranteed-hit-rates"
            },
            {
              "tier": "SAR — regular box",
              "rate": "Roughly 1 per 1–3 boxes; sources disagree noticeably (some guides claim more)",
              "basis": "Aggregator/retailer estimates, no published sample sizes — treat as directional",
              "confidence": "low",
              "sourceUrl": "https://tcgame.com.au/blogs/pokemon-tips/what-to-expect-inside-a-pack-and-box-of-japanese-pokemon-cards"
            },
            {
              "tier": "UR (gold) — regular box",
              "rate": "~0.15 per box (≈1 per 6–7 boxes); new Mega-era MUR ~0.05 per box (≈1 per 20 boxes)",
              "basis": "Single retailer estimate surfaced in search (Samurai Sword Tokyo); no sample size given",
              "confidence": "low",
              "sourceUrl": "https://samuraiswordtokyo.com/blogs/news/how-japanese-pokemon-pull-rates-work"
            },
            {
              "tier": "Terastal Fest ex (SV8a high-class, 10 packs × 10 cards)",
              "rate": "Per pack: RR ~9/10, AR ~3/10, ACE SPEC ~1/10, SR-or-better ~1/10 (≈1 per box guaranteed); SAR ~1 in 30+ packs (≈1 per 3 boxes)",
              "basis": "Community pull-rate compilation (PokéPatch); box floor claim consistent across retailers",
              "confidence": "medium",
              "sourceUrl": "https://pokepatch.com/2025/06/09/terastal-fest-ex-pull-rates-sv8a-japanese-pokemon-tcg-set/"
            },
            {
              "tier": "MEGA Dream ex (M2a high-class, Nov 28 2025)",
              "rate": "SAR ~1 in 27 packs; guaranteed per box: 1 MA + 1 item SR + 3 AR + ~9 RR; no SAR guaranteed per box",
              "basis": "Early retailer/community data (Samurai Sword Tokyo, Trainer Court, card-binder) — weeks-old set, small samples",
              "confidence": "low",
              "sourceUrl": "https://www.thetrainercourt.com/blogs/resources/japanese-booster-box-guaranteed-hit-rates-god-packs"
            }
          ],
          "specialOccurrences": [
            {
              "name": "GOD PACKS",
              "what": "A pack where every slot is a hit (AR-or-better, multiple SAR — e.g. Terastal Fest: 8–9 Eeveelution SARs; MEGA Dream: 1 AR + 5 MA + 4 SAR; VSTAR Universe: 9 AR or 5 AR + 5 SAR). Japan-only mechanic in specialty/high-class sets.",
              "whichSets": "Tag All Stars SM12a (first, 2019), Shiny Star V S4a, VMAX Climax S8b, VSTAR Universe S12a, Pokémon 151 SV2a, Shiny Treasure ex SV4a, Terastal Fest ex SV8a, Black Bolt SV11B / White Flare SV11W (2025), MEGA Dream ex M2a (Nov 2025). NOT in regular JP expansions and NOT in standard international sets.",
              "approxFrequency": "No official figures have ever existed — TPC/Creatures has never confirmed god packs or their odds. Community estimates vary widely by set AND by source: general expert guess ~1 in 600 packs (SNKRDUNK); 'ranges 1 in 500 to 1 in 1,000+' (community guides); one aggregator claims ~1 in 2,000 average. Per-set community-tracking figures: Shiny Treasure ex ~1 in 260 packs; VSTAR Universe ~1 per case (~1 in 200–250 packs per one guide); MEGA Dream ex early estimate 1 in 300–600 packs, i.e. very roughly 1 per several cases. ALL of these are low confidence — the honest consumer statement is 'somewhere between 1 in ~250 and 1 in ~2,000 packs depending on set; expect zero when buying a box.'",
              "sourceUrl": "https://snkrdunk.com/en/magazine/2025/01/21/everything-to-know-about-pokemon-tcg-god-packs/"
            },
            {
              "name": "Demigod packs (JP)",
              "what": "Reduced-tier loaded packs: Terastal Fest ex has a documented lower variant (reverse holos + 3 Eeveelution SARs) below its full 9-SAR god pack; 151 also had lesser loaded variants",
              "whichSets": "Terastal Fest ex SV8a (documented); Pokémon 151 SV2a",
              "approxFrequency": "Unknown; one community guide floats ~1 in 1,300 packs for a 151 demigod pack — basis unclear, very low confidence. TikTok-sourced claims of '1 in 10,000' for full Terastal god packs are anecdotes, not statistics.",
              "sourceUrl": "https://miraicardshop.com/blogs/resources/pokemon-tcg-japanese-god-packs"
            }
          ]
        }
      ]
    },
    {
      "slug": "dragon-ball",
      "displayName": "Dragon Ball Super Fusion World",
      "officialOdds": "No. Bandai publishes pack/box configuration and set composition (e.g. 2 SCR types per set) but no pull odds.",
      "sections": [
        {
          "region": null,
          "era": "Dragon Ball Super Card Game: Fusion World (FB01–FB07+, 2024–2026)",
          "packStructure": {
            "cardsPerPack": "12",
            "packsPerBox": "24 (288 cards/box)",
            "boxesPerCase": "12 (community convention for Bandai TCG cases; not stated on official FW product pages I saw)",
            "guaranteedSlots": "Every pack has a foil slot of R-or-better (community description; Bandai does not document slot rules). Structure identical to One Piece Card Game.",
            "notes": "JP and EN print runs share the same 12-card/24-pack architecture; EN sets release a few months after JP. Set composition is typically ~125 types: 5-6 Leaders, ~25 R, ~15-18 SR, 2 SCR, plus alt-art parallels (japan-figure.com FB07 breakdown)."
          },
          "rarityLadder": [
            "L (Leader — plus alt-art parallel versions)",
            "C (Common)",
            "UC (Uncommon)",
            "R (Rare, holo)",
            "SR (Super Rare)",
            "SCR (Secret Rare — top printed rarity; Fusion World has NO God Rare, unlike the DBS 'Masters' line)",
            "SCR★ (Secret Rare alt-art)",
            "SCR Super Alt-Art (gold-foil ultra chase, FB04 onward)",
            "Visual Alt-Art / Super Combo alt-arts (newer category, FB07)"
          ],
          "rates": [
            {
              "tier": "SR",
              "rate": "several per 24-pack box (community descriptions are qualitative; no reliable per-box count found)",
              "basis": "community/aggregator description, no large-sample dataset located",
              "confidence": "low",
              "sourceUrl": "https://neokyo.com/blog/dragon-ball-super-card-game-rarity-guide-introducing-the-differences-between-masters-and-fusion-world/"
            },
            {
              "tier": "SCR (base)",
              "rate": "not guaranteed per box; on the order of 1 per 1–3 boxes based on scattered anecdotes — no verifiable community sample found, treat as unknown-but-sub-1-per-box",
              "basis": "anecdote; explicitly NOT a statistic",
              "confidence": "low"
            },
            {
              "tier": "SCR★ alt-art / SCR Super Alt-Art (gold)",
              "rate": "Super Alt-Art treated by the market as a case-hit-or-rarer chase; no sampled rate exists publicly",
              "basis": "community anecdote; treated as at-or-beyond case-hit rarity — no measured sample exists",
              "confidence": "low",
              "sourceUrl": "https://japan-figure.com/blogs/news/dragon-ball-fusion-world-wish-for-shenron"
            },
            {
              "tier": "GDR (God Rare) — for contrast, DBS 'Masters' line only, NOT Fusion World",
              "rate": "~1 per 3–4 sealed cases (Masters BT16+ sets)",
              "basis": "aggregator estimate with no stated methodology",
              "confidence": "low",
              "regionNote": "Neokyo's rarity guide explicitly states GDR does not exist in Fusion World",
              "sourceUrl": "https://ogcards.com/blogs/dragon-ball-super-cards/dragon-ball-super-gdr-pull-rates"
            }
          ],
          "specialOccurrences": [
            {
              "name": "SCR Super Alt-Art (gold foil)",
              "what": "Gold-stamped super-alt-art version of an SCR (e.g. FB04 Son Goku SCR Super Alt-Art) — the set's top chase card",
              "approxFrequency": "unknown; community treats it as at-or-beyond case-hit rarity (low confidence, anecdote)",
              "whichSets": "FB04 'Ultra Limit' onward",
              "sourceUrl": "https://en.dragon-ball-official.com/news/01_2992.html"
            },
            {
              "name": "God packs — UNVERIFIED for Fusion World",
              "what": "A 'god packs are 1 in 12 boxes' line circulates on DBS fan pages but cannot be traced to any Fusion World source — it appears borrowed from One Piece's god-pack mechanic and is not a Fusion World fact. Beware circulating misinformation: at least one guide claims FB-10 'god rares' exist; Bandai's official FB10 announcement and product listings show the top Fusion World rarity is SCR Super Alt-Art, with no god-rare tier.",
              "approxFrequency": "no documented god-pack mechanic in Fusion World",
              "sourceUrl": "https://progamingcrew.com/blogs/dragon-ball-super-card-game/dragon-ball-super-card-game-pull-rates-all-sets"
            }
          ]
        }
      ]
    },
    {
      "slug": "digimon",
      "displayName": "Digimon Card Game",
      "officialOdds": "No. Official product pages state only '1 pack = 12 cards, 1 box = 24 packs' (EN); all rates above are community-collected.",
      "sections": [
        {
          "region": null,
          "era": "Digimon Card Game",
          "packStructure": {
            "cardsPerPack": "EN: 12. JP: 7 physical cards = 6 game cards + 1 index card",
            "packsPerBox": "24 in both regions (EN box = 288 game cards; JP box = 144 game cards + box topper)",
            "boxesPerCase": "12 (JP, per community case-level tracking)",
            "guaranteedSlots": "JP pack: 4 C + 1 U + 1 slot that is R, SR, SEC or Alternative Art (community-verified, highly consistent). EN pack mirrors this at double density. JP box additionally contains exactly 1 box topper and exactly one card that is either a SEC or an Alternative Art.",
            "notes": "The JP:EN relationship is clean — one EN box ≈ two JP boxes of game cards, and observed EN yields scale accordingly. EN boxes also include a box-topper pack (retailer/community knowledge, medium confidence)."
          },
          "rarityLadder": [
            "C (Common)",
            "U (Uncommon)",
            "R (Rare)",
            "SR (Super Rare)",
            "SEC (Secret Rare)",
            "Alternative Art / Parallel Art (foil parallels of R/SR/SEC and others)",
            "SP (Special Rare — ultra-rare parallel, e.g. special-foil reprint; rarest tier in boosters)"
          ],
          "rates": [
            {
              "tier": "SR (JP)",
              "rate": "3–4 per 24-pack JP box; 42 per 12-box case",
              "basis": "community large-sample box/case data (DigimonCardGame wiki pull-rates page, BT-15; ratios described as consistent across boxes)",
              "confidence": "high",
              "regionNote": "Japanese print",
              "sourceUrl": "https://digimoncardgame.fandom.com/wiki/BT-15:_Booster_Exceed_Apocalypse/Pull_Rates"
            },
            {
              "tier": "SEC (JP)",
              "rate": "4 per 12-box case ≈ 1 per 3 boxes (each box gets exactly one SEC-or-AltArt)",
              "basis": "community large-sample case data (wiki pull-rates page)",
              "confidence": "high",
              "regionNote": "Japanese print",
              "sourceUrl": "https://digimoncardgame.fandom.com/wiki/BT-15:_Booster_Exceed_Apocalypse/Pull_Rates"
            },
            {
              "tier": "Alternative Art (JP)",
              "rate": "8 per 12-box case ≈ 2 per 3 boxes",
              "basis": "community large-sample case data (wiki pull-rates page)",
              "confidence": "high",
              "regionNote": "Japanese print",
              "sourceUrl": "https://digimoncardgame.fandom.com/wiki/BT-15:_Booster_Exceed_Apocalypse/Pull_Rates"
            },
            {
              "tier": "SP (Special Rare, JP)",
              "rate": "50% chance per case → roughly 1 per 2 cases (~1 per 24 boxes)",
              "basis": "community case data (wiki pull-rates page)",
              "confidence": "medium",
              "regionNote": "Japanese print",
              "sourceUrl": "https://digimoncardgame.fandom.com/wiki/BT-15:_Booster_Exceed_Apocalypse/Pull_Rates"
            },
            {
              "tier": "SR / SEC (EN)",
              "rate": "≈7–8 SR per EN box and ≈2 SEC-or-AltArt per EN box (inferred from EN box = 2× JP game cards; consistent with community per-card probabilities: SR ~2%, SEC ~0.2%)",
              "basis": "inference from JP community data + digimonmeta per-card probability estimates; not a direct EN sample",
              "confidence": "medium",
              "regionNote": "English print",
              "sourceUrl": "https://digimonmeta.com/hello-rarities/"
            }
          ],
          "specialOccurrences": [
            {
              "name": "Box topper",
              "what": "1 promo/box-topper card (or topper pack in EN) per booster box",
              "approxFrequency": "1 per box, both regions",
              "sourceUrl": "https://digimoncardgame.fandom.com/wiki/BT-15:_Booster_Exceed_Apocalypse/Pull_Rates"
            },
            {
              "name": "SP special-foil parallels",
              "what": "Ultra-rare gold/special-stamp parallels seeded above SEC — the closest Digimon gets to a serialized-tier chase; no god-pack mechanic exists in Digimon",
              "approxFrequency": "~1 per 2 cases (JP, community data, medium confidence)",
              "whichSets": "modern main boosters (data point: BT-15; structure stable across nearby sets)"
            }
          ]
        }
      ]
    },
    {
      "slug": "union-arena",
      "displayName": "Union Arena",
      "officialOdds": "No. Official NA product pages list only titles, dates and $4.99 pack MSRP; no configuration odds.",
      "sections": [
        {
          "region": null,
          "era": "Union Arena",
          "packStructure": {
            "cardsPerPack": "8",
            "packsPerBox": "16 (EN displays and most JP boxes; some JP releases shipped as 20-pack boxes, e.g. UA07BT per Amazon listing)",
            "boxesPerCase": "not verified; community references 'case' hits without a documented box count",
            "guaranteedSlots": "1 foil card per pack per community guides; no official slot documentation",
            "notes": "The family outlier: smaller 8-card packs and 16-pack IP-licensed boxes (Jujutsu Kaisen, Hunter x Hunter, Demon Slayer, etc.). EN launched Sep 2024 with '1st edition' stamped printings. Same no-odds policy as the rest of the family."
          },
          "rarityLadder": [
            "C (Common)",
            "U (Uncommon)",
            "R (Rare)",
            "SR (Super Rare)",
            "SR★ (1-star alt-art parallel)",
            "★★ (2-star premium parallel)",
            "★★★ (3-star top parallel, newer sets)",
            "AP (Action Point) foil versions — chase utility cards",
            "(some guides also list 'UR/Union Rare' and 'SP' tiers — terminology is inconsistent across sources; treat with caution)"
          ],
          "rates": [
            {
              "tier": "SR",
              "rate": "~4 per 16-pack box",
              "basis": "anecdote (single-collector reports quoted in community guides); no large-sample data found",
              "confidence": "low",
              "sourceUrl": "https://capsulecorpgear.com/union-arena-guide/"
            },
            {
              "tier": "1-star (★) parallel",
              "rate": "~1 per box",
              "basis": "anecdote/community consensus ('boxes reliably deliver starred cards')",
              "confidence": "low",
              "sourceUrl": "https://tcgwaifu.com/guides/union-arena-rarity-guide"
            },
            {
              "tier": "AP foil",
              "rate": "~1 per case",
              "basis": "anecdote in community guide",
              "confidence": "low",
              "sourceUrl": "https://capsulecorpgear.com/union-arena-guide/"
            },
            {
              "tier": "2-star / 3-star parallels",
              "rate": "rarer than AP foils, i.e. sub-1-per-case; no sampled numbers exist publicly",
              "basis": "anecdote in community guide",
              "confidence": "low",
              "sourceUrl": "https://capsulecorpgear.com/union-arena-guide/"
            }
          ],
          "specialOccurrences": [
            {
              "name": "3-star (★★★) chase parallels",
              "what": "Top alt-art foil tier added in newer sets; functions as the set's case-hit-level chase",
              "approxFrequency": "under 1 per case (anecdote, low confidence)",
              "whichSets": "newer UA sets (2025+)"
            },
            {
              "name": "No god packs / no serialized cards",
              "what": "No god-pack or serialized mechanic documented for Union Arena in any source reviewed",
              "approxFrequency": "n/a"
            }
          ]
        }
      ]
    },
    {
      "slug": "gundam",
      "displayName": "Gundam Card Game",
      "officialOdds": "No. Official gundam-gcg.com product pages list titles, dates, $4.99 MSRP only; set composition (50C/36U/32R/12LR + alt-arts) comes from product marketing, not odds disclosure.",
      "sections": [
        {
          "region": null,
          "era": "Gundam Card Game (launched 2025: GD01 Newtype Rising → GD05 Freedom Ascension Jul 2026, EB01 extra booster)",
          "packStructure": {
            "cardsPerPack": "12 game cards + 1 resource/token card",
            "packsPerBox": "24",
            "boxesPerCase": "12 (community convention, cited by rarity guides)",
            "guaranteedSlots": "Per pack: 6 C, 4 U, 2 'rare-or-better' slots. LR, LR+, ++ gold foils AND alt-art lower rarities (C+/U+/R+) all compete for the premium seeding — so a C+ can be rarer than an LR.",
            "notes": "Distinguishing consumer point: extremely generous base completion — one documented GD01 box opening yielded complete playsets of all C/U/R (50/36/32 types) plus 8 of 12 LRs, because every pack carries 2 rare slots (48 R+ per box). JP and EN share the 12+1 configuration."
          },
          "rarityLadder": [
            "C (Common)",
            "U (Uncommon)",
            "R (Rare)",
            "LR (Legend Rare)",
            "SP (Special — premium alt-art reprint tier, added in GD03 Steel Requiem)",
            "'+' parallels (C+, U+, R+, LR+ — borderless alt-art foils)",
            "'++' gold-foil chase (typically LR++) — case-hit tier",
            "Foil/numbered resource-card variants (separate resource slot)"
          ],
          "rates": [
            {
              "tier": "R or better",
              "rate": "2 per pack / 48 per box (structural)",
              "basis": "community structural observation, corroborated by a documented full-box opening",
              "confidence": "high",
              "sourceUrl": "https://gundaniumgateway.blogspot.com/2025/08/gundam-card-game-newtype-rising-gd01.html"
            },
            {
              "tier": "LR",
              "rate": "several per box (one documented GD01 box: 8 LRs)",
              "basis": "single-box community opening (n=1) plus qualitative guide corroboration",
              "confidence": "medium",
              "sourceUrl": "https://gundaniumgateway.blogspot.com/2025/08/gundam-card-game-newtype-rising-gd01.html"
            },
            {
              "tier": "SP (GD03+)",
              "rate": "~1 per 2 boxes",
              "basis": "aggregator/shop blog estimate, presented without methodology — treat as rough",
              "confidence": "low",
              "sourceUrl": "https://shopcardsusa.com/blogs/news/gundam-card-game-card-rarities"
            },
            {
              "tier": "'++' gold foil",
              "rate": "roughly 1 of each per 12-box case ('case hit')",
              "basis": "community/aggregator estimate repeated across two independent rarity guides; no sampled dataset",
              "confidence": "low",
              "sourceUrl": "https://geekydomain.com/blogs/guides/gundam-tcg-rarity-guide"
            }
          ],
          "specialOccurrences": [
            {
              "name": "'++' case hits",
              "what": "Gold-foil premium versions (e.g. LR++) sharing the single premium slot; the market chase of each set",
              "approxFrequency": "~1 per case per variant (community estimate, low confidence)",
              "whichSets": "GD01 onward"
            },
            {
              "name": "SP reprint tier",
              "what": "Special alt-art reprints of existing cards seeded above LR",
              "approxFrequency": "~1 per 2 boxes (aggregator estimate, low confidence)",
              "whichSets": "GD03 Steel Requiem onward",
              "sourceUrl": "https://shopcardsusa.com/blogs/news/gundam-card-game-card-rarities"
            },
            {
              "name": "No god packs / no serialized cards found",
              "what": "No god-pack mechanic or serialized print documented in any source reviewed for GD01–GD04",
              "approxFrequency": "n/a"
            }
          ]
        }
      ]
    },
    {
      "slug": "battle-spirits",
      "displayName": "Battle Spirits",
      "officialOdds": "No. Official Saga product pages disclose configuration (12 cards/pack, 24 packs/box) and per-rarity type counts, never odds.",
      "sections": [
        {
          "region": null,
          "era": "Battle Spirits — Saga (EN, 2023–2025, DISCONTINUED) + classic JP line (ongoing)",
          "packStructure": {
            "cardsPerPack": "Saga: 12 (BSSB03 packs also include 1 core token card)",
            "packsPerBox": "Saga: 24",
            "boxesPerCase": "not stated on official pages I saw",
            "guaranteedSlots": "No official slot documentation; Saga sets print normal + holo versions of C/U/R, with X Rare and above seeded in the premium slot",
            "notes": "CRITICAL CONSUMER NOTE: Bandai officially ended Battle Spirits Saga development in March 2025 (official announcement; final event March 29, 2025; limited support window through March 2026). Sealed Saga product is now a dead game. The classic Japanese Battle Spirits line (2008–present) is a separate, JP-only product with a different rarity ladder and pack structure."
          },
          "rarityLadder": [
            "Saga (per official BSS06 page, 140 types): C ×60, U ×30, R ×14, X Rare ×12, Special Rare ×21, Saga Rare ×3 (top chase tier)",
            "Classic JP line: C, R (U discontinued since SD33), Master Rare, X-Rare, Secret (X-Rare alt/gold variant), XX-Rare, plus anniversary tiers (10thX-Rare etc.) and Rebirth (double-sided) variants"
          ],
          "rates": [
            {
              "tier": "Saga: X Rare / Special Rare / Saga Rare per box",
              "rate": "no trustworthy per-box numbers found — retailer copy citing '12–14 X Rares' refers to the number of X-Rare TYPES in the set, not box contents (verified against the BSSB03 product text). Expect a handful of X-Rare-or-better hits per box, Saga Rare well under 1 per box.",
              "basis": "absence of data + verified debunk of a commonly misread retailer line; qualitative community impression only",
              "confidence": "low",
              "regionNote": "English (Saga)",
              "sourceUrl": "https://www.gamenerdz.com/battle-spirits-saga-tcg-aquatic-invaders-booster-box-bssb03"
            },
            {
              "tier": "Classic JP: Master Rare",
              "rate": "~3 per box",
              "basis": "community wiki anecdote (Battle Spirits Wiki 'Card Rarity')",
              "confidence": "low",
              "regionNote": "Japanese classic line",
              "sourceUrl": "https://battle-spirits.fandom.com/wiki/Card_Rarity"
            },
            {
              "tier": "Classic JP: X-Rare",
              "rate": "2–3 per box, occasionally up to 6",
              "basis": "community wiki anecdote",
              "confidence": "low",
              "regionNote": "Japanese classic line",
              "sourceUrl": "https://battle-spirits.fandom.com/wiki/Card_Rarity"
            },
            {
              "tier": "Classic JP: XX-Rare",
              "rate": "not guaranteed per box — 'a single booster box may not even contain one' (usually only 2 XX types per set)",
              "basis": "community wiki anecdote",
              "confidence": "low",
              "regionNote": "Japanese classic line",
              "sourceUrl": "https://battle-spirits.fandom.com/wiki/Card_Rarity"
            }
          ],
          "specialOccurrences": [
            {
              "name": "Saga Rare (Saga BSS06)",
              "what": "Top chase tier (3 types in BSS06 'Generational Link')",
              "approxFrequency": "unknown; sub-1-per-box (no community sample located — the game died before large datasets formed)",
              "whichSets": "BSS06 (Dec 2024)",
              "sourceUrl": "https://battlespirits-saga.com/products/booster/bss06/"
            },
            {
              "name": "Secret Rares (classic JP)",
              "what": "Gold-pattern alt versions of X-Rares, harder to pull than base X-Rares",
              "approxFrequency": "unquantified; rarer than X-Rare (community wiki, anecdote)",
              "whichSets": "classic JP boosters (styling revised BS44, stamps removed BS52)",
              "sourceUrl": "https://battle-spirits.fandom.com/wiki/Card_Rarity"
            },
            {
              "name": "Game discontinuation (Saga)",
              "what": "Official end of development/support announced by Bandai — the Saga line receives no further sets or organized play",
              "approxFrequency": "n/a (March 2025; support window through March 2026)",
              "sourceUrl": "https://battlespirits-saga.com/news/announcements/004.php"
            }
          ]
        }
      ]
    },
    {
      "slug": "magic",
      "displayName": "Magic: The Gathering",
      "officialOdds": "YES, unusually thorough. WotC publishes slot-by-slot collation percentages per set in official 'Collecting [Set Name]' articles on magic.wizards.com (e.g. Collecting Foundations, Collecting Innistrad Remastered, Collecting Final Fantasy). These give exact percentages for every slot in Play and Collector Boosters. The one thing they refuse to make precise is serialized cards, always phrased as 'less than 1% of Collector Boosters' (Innistrad Remastered adds the absolute count: 500 serialized Edgar Markov). Caveat: percentages are production averages, not per-box guarantees.",
      "sections": [
        {
          "region": null,
          "era": "Magic: The Gathering (Play Booster era, 2024+)",
          "packStructure": {
            "cardsPerPack": "14 playable cards + 1 non-playable slot (65% token/ad, 30% art card, 5% signature art card) — official spec from WotC's 'What Are Play Boosters?' announcement",
            "packsPerBox": "30 packs per display since Aetherdrift (Feb 2025); was 36 packs for the 2024 Play Booster sets (MKM through Foundations). Change confirmed by official WPN article.",
            "boxesPerCase": "6 displays per case (distributor convention, not stated in the official articles I reviewed — medium confidence)",
            "guaranteedSlots": "Per pack: 6-7 commons; 3 uncommons; 1 rare/mythic slot; 1 non-foil wildcard (any rarity); 1 traditional-foil wildcard (any rarity); 1 land (20% foil). So 1 rare+ guaranteed, with ~17-21% chance of a 2nd rare+ from the wildcard slot and ~6-7% from the foil slot.",
            "notes": "Original 2024 spec: slot 7 was 87.5% common / 9.38% List C-U / 1.56% List R-M / 1.56% Special Guests. The List was quietly retired starting with Bloomburrow (July 2024) — de-archived reprints no longer appear; only the 10 Special Guests (SPG) remain, at 1.5% of Play Boosters (non-foil). Secret Lair is a separate direct-sale product and never appears in boosters; historically The List carried 'Universes Within' in-Magic-canon versions of some Secret Lair cards, a distinction that died with The List. Derived box math from official percentages: a 30-pack box yields 30 guaranteed rare+ plus roughly 6-8 more from wildcard/foil slots (~36-40 rare-or-better total) and roughly 4-6 mythics — derivation, medium-high confidence."
          },
          "rarityLadder": [
            "Common",
            "Uncommon",
            "Rare",
            "Mythic Rare",
            "— parallel treatments, not rarities: borderless / showcase / extended-art variants",
            "Special Guests (SPG, 10-card reprint slot per set)",
            "Serialized cards (Collector Booster only, numbered, set-specific)"
          ],
          "rates": [
            {
              "tier": "Mythic rare (rare slot)",
              "rate": "1 in 7 packs baseline (official). Foundations exact breakdown: main-set rare 78% + borderless rare 7.7% vs mythic 12.8% + borderless mythic 1.5% = 14.3% mythic. Final Fantasy: rare 80% + borderless rare 8% + artist rare 0.5% vs mythic 10% + borderless mythic 1% + artist mythic 0.5%.",
              "basis": "official print (WotC Play Booster announcement + per-set Collecting articles)",
              "confidence": "high",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-foundations"
            },
            {
              "tier": "Mythics per 30-pack box",
              "rate": "roughly 4-6 per box (rare slot ~14% x 30 ≈ 4.3, plus wildcard-slot mythics ~2.9% x 30 ≈ 0.9, plus foil slot)",
              "basis": "derivation from official Collecting-article percentages; matches community box-opening consensus of 5-6",
              "confidence": "medium",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-foundations"
            },
            {
              "tier": "Non-foil wildcard slot (Foundations)",
              "rate": "common 16.7%, uncommon 58.3%, rare 16.3%, mythic 2.6%, borderless C/U 1.8%/2.4%, borderless rare 1.6%, borderless mythic 0.3% — i.e. ~20.8% chance the wildcard is rare-or-better",
              "basis": "official print (Collecting Foundations)",
              "confidence": "high",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-foundations"
            },
            {
              "tier": "Traditional foil slot (Final Fantasy)",
              "rate": "foil common 55.75%, uncommon 35.9%, rare 5.5%, mythic 0.75%; Booster Fun foil C 0.1% / U 0.5% / R 1% / M 0.25%",
              "basis": "official print (Collecting Final Fantasy)",
              "confidence": "high",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-final-fantasy"
            },
            {
              "tier": "Borderless in Play Booster rare slot",
              "rate": "Foundations: borderless rare 7.7%, borderless mythic 1.5% of the rare slot; Innistrad Remastered wildcard slot: borderless common 3%, borderless uncommon 0.7%",
              "basis": "official print (per-set Collecting articles; varies by set — always check the set's article)",
              "confidence": "high",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-innistrad-remastered"
            },
            {
              "tier": "Special Guests (non-foil, Play Booster)",
              "rate": "1.5% of Play Boosters (~1 in 64; about 1 every 2+ boxes at 30 packs/box)",
              "basis": "official print (Collecting Foundations: 'In 1.5% of Play Boosters, 1 of these commons will be replaced with 1 of the 10 Special Guests cards')",
              "confidence": "high",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-foundations"
            },
            {
              "tier": "Serialized cards (Collector Booster only)",
              "rate": "'less than 1% of Collector Boosters' — WotC's standard phrasing, never more precise; Innistrad Remastered discloses 500 total serialized Edgar Markov copies",
              "basis": "official print, deliberately imprecise",
              "confidence": "high",
              "regionNote": "Can be language-gated: FINAL FANTASY's serialized Golden Chocobo appears only in English-language Collector Boosters. Foundations Japan Showcase cards in non-Japanese Collector Boosters print 2/3 English, 1/3 Japanese.",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-final-fantasy"
            },
            {
              "tier": "Collector Booster foil rare/mythic slot",
              "rate": "Innistrad Remastered: foil rare 86.2% / mythic 13.8%; Foundations special-treatment slot: borderless rare 34.5%, borderless mythic 6.8%, extended-art R/M 29.6%/3.6%, mana-foil R/M 8.4%/1.6%, foil Special Guests 5.5%",
              "basis": "official print (per-set Collecting articles)",
              "confidence": "high",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-innistrad-remastered"
            }
          ],
          "specialOccurrences": [
            {
              "name": "Special Guests (SPG)",
              "what": "10 premium Masters-level reprints per set with set-matched art; non-foil in Play Boosters, traditional foil in Collector Boosters. Since Bloomburrow, the ONLY extra-set cards in Play Boosters (The List retired).",
              "approxFrequency": "1.5% of Play Boosters (official); foil version 5.5% of Foundations' Collector Booster special slot (official)",
              "whichSets": "every Standard set since Lost Caverns of Ixalan",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-foundations"
            },
            {
              "name": "The List — RETIRED",
              "what": "Formerly a ~variable pool of de-archived reprints sharing slot 7 (9.38% C/U + 1.56% R/M in the 2024 spec). Quietly cancelled: 'Starting with Bloomburrow, de-archived cards... will no longer appear in Play Boosters.' Consumer takeaway for 2025-2026 product: no List cards, only Special Guests.",
              "approxFrequency": "0% in sets from Bloomburrow (July 2024) onward; 12.5% of slot 7 in early-2024 Play Booster sets",
              "whichSets": "MKM/OTJ/MH3-era Play Boosters (last with List); gone from Bloomburrow onward",
              "sourceUrl": "https://mtgrocks.com/wizards-has-canceled-the-list-in-mtg/"
            },
            {
              "name": "Serialized cards",
              "what": "Numbered (e.g. /500) double-rainbow-foil chase cards, Collector Boosters only — never in Play Boosters. Examples: Innistrad Remastered movie-poster Edgar Markov (500 copies), Aetherdrift serialized The Aetherspark, FINAL FANTASY Golden Chocobo (English CBs only).",
              "approxFrequency": "less than 1% of Collector Boosters (official phrasing; WotC does not publish tighter odds)",
              "whichSets": "most 2025-2026 premier sets, one headliner card each",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-innistrad-remastered"
            },
            {
              "name": "Bonus sheets (e.g. FINAL FANTASY Through the Ages)",
              "what": "Set-specific reprint sheet occupying a common slot; rarity mix published exactly (FF: uncommon 63.25%, rare 29.75%, mythic 7%)",
              "approxFrequency": "1 in 3 Play Boosters for FINAL FANTASY (official; set-dependent — not every set has one)",
              "whichSets": "select sets (FIN 2025; earlier: STA, BRO, etc.)",
              "sourceUrl": "https://magic.wizards.com/en/news/feature/collecting-final-fantasy"
            },
            {
              "name": "Secret Lair (for contrast)",
              "what": "Direct-to-consumer curated drops sold on WotC's own store; NOT randomized pack product and never inserted in boosters. Historically connected to boosters only via The List's 'Universes Within' reprints, a link that ended with The List's retirement.",
              "approxFrequency": "n/a — fixed-content purchase, no pull rates",
              "sourceUrl": "https://draftsim.com/mtg-the-list/"
            }
          ]
        }
      ]
    },
    {
      "slug": "flesh-and-blood",
      "displayName": "Flesh and Blood",
      "officialOdds": "YES, partially. LSS publishes per-set pull rates on fabtcg.com product pages and its Collector's Centre (e.g. 'Legendary 1 per 94 packs', 'Cold Foil 1 per 24 packs'), with an explicit disclaimer that rates are 'an approximate average across the entire production' and 'not guaranteed to exist in any given pack, display, or case.' The deliberate exception: Fabled rates are published as literally '1 per ??? packs' — LSS withholds the number, so all Fabled frequencies are community estimates.",
      "sections": [
        {
          "region": null,
          "era": "Flesh and Blood",
          "packStructure": {
            "cardsPerPack": "16 (15 playables + 1 token slot; since Uprising/FAB 2.0 the token slot is where cold foils appear, so they're removed before drafting)",
            "packsPerBox": "24 packs per display",
            "boxesPerCase": "4 displays per case (= 96 packs per case) — stated on official product pages",
            "guaranteedSlots": "High Seas (2025) official collation per pack: 1 Rainbow Foil premium slot; 2 cards Rare-or-higher (1 Rare + 1 Rare/Majestic); 11 Commons; 1 Basic; 1 'Basic / Expansion Slot / Marvel / Legendary' slot",
            "notes": "JP print runs genuinely differ: Japanese High Seas is a 9-cards-per-pack product with a 264-card set, marked 'not designed for booster draft and sealed deck' (official product page) — EN/FR is the 16-card draftable configuration. High Seas also introduced Treasure Packs: 1 per display (not sold separately), 3 cards, middle 'Treasure Slot' holds a Cold Foil or a Lost Treasure. Cold foil reprint policy: 1st-edition/set cold foils are never reprinted, which is why they carry case-hit status."
          },
          "rarityLadder": [
            "Common (C)",
            "Rare (R)",
            "Super Rare (SR — set-specific, e.g. Super Slam 2025)",
            "Majestic (M)",
            "Legendary (L)",
            "Fabled (F — top rarity, ~1 card per set)",
            "Marvel (V — special alt-art rarity introduced with FAB 2.0/Uprising; frequency intentionally varies per card)",
            "Foil axis on top of rarity: Rainbow Foil (1 per pack) < Cold Foil (premium, reprint-protected)"
          ],
          "rates": [
            {
              "tier": "Rainbow Foil (any)",
              "rate": "1 per pack",
              "basis": "official print (fabtcg.com FAB 2.0 article + every current product page)",
              "confidence": "high",
              "sourceUrl": "https://fabtcg.com/articles/fab-20/"
            },
            {
              "tier": "Cold Foil (any)",
              "rate": "1 per 24 packs (≈1 per display) in sets where cold foils sit in boosters (Uprising baseline; Super Slam 2025 confirms 1:24, pool of 47 cards: 1 Fabled, 14 Marvel, 5 Legendary, 13 Majestic, 1 Rare, 13 Common). In High Seas (2025), cold foils moved to the Treasure Pack instead (1 Treasure Pack per display).",
              "basis": "official print (FAB 2.0 article; Super Slam Collector's Centre; High Seas product page)",
              "confidence": "high",
              "sourceUrl": "https://fabtcg.com/collectors-centre/super-slam/"
            },
            {
              "tier": "Majestic",
              "rate": "non-foil ~1 per 4 packs (official: FAB 2.0 baseline and High Seas both 1:4); rainbow-foil Majestic 1 per 18-22 packs (High Seas 1:18, Super Slam 1:22)",
              "basis": "official print",
              "confidence": "high",
              "sourceUrl": "https://fabtcg.com/collectors-centre/high-seas/"
            },
            {
              "tier": "Legendary (rainbow/premium foil) — the '1 per case' class",
              "rate": "1 per 94-96 packs ≈ 1 per 4-box case (High Seas official: 1 per 96 packs; Super Slam official: 1 per 94 packs; Uprising-era: 1 per 80 packs)",
              "basis": "official print (per-set Collector's Centre pages)",
              "confidence": "high",
              "sourceUrl": "https://fabtcg.com/collectors-centre/high-seas/"
            },
            {
              "tier": "Legendary Cold Foil",
              "rate": "roughly 1 per 220-280 packs ≈ 1 per 2-3 cases (Uprising 1:220 official; Dynasty ~1:280 and Outsiders ~1:264 per community print-run analysis)",
              "basis": "official print for Uprising; community print-run math (The Realistic Collector) for later sets",
              "confidence": "medium",
              "sourceUrl": "https://therealisticcollector.com/2022/10/18/flesh-and-blood-tcg-complete-print-run-numbers-and-pull-rates/comment-page-1/"
            },
            {
              "tier": "Fabled (any foil)",
              "rate": "officially UNPUBLISHED — LSS prints '1 per ??? packs' on its own rate sheets. Community-accepted estimate ≈1 per 40 boxes (~1 per 10 cases), derived from print-run math and consensus, not from a controlled sample. Treat as low confidence.",
              "basis": "community estimate / print-run extrapolation (The Realistic Collector: '1:40 boxes... seems to be a commonly accepted number'); official sources explicitly withhold it",
              "confidence": "low",
              "sourceUrl": "https://therealisticcollector.com/2022/10/18/flesh-and-blood-tcg-complete-print-run-numbers-and-pull-rates/comment-page-1/"
            },
            {
              "tier": "Marvels",
              "rate": "High Seas official: 21 Marvels at 1 per 60 packs collectively; per-card frequency intentionally varies ('some are harder to find... all much rarer than a normal foil of their base rarity' — official FAB 2.0 statement), so no per-card rate exists",
              "basis": "official print (High Seas Collector's Centre + FAB 2.0 article)",
              "confidence": "high",
              "sourceUrl": "https://fabtcg.com/collectors-centre/high-seas/"
            },
            {
              "tier": "Rare",
              "rate": "1.42-1.83 non-foil rares per pack depending on set (Super Slam 1.42, High Seas 1.83, Uprising baseline 1.75), plus set-specific tiers (Super Slam: Super Rare 1 per 2.18 packs non-foil / 1 per 13 packs foil; 'Set' rarity 1:8; 'Expansion' 1:6)",
              "basis": "official print (per-set Collector's Centre pages)",
              "confidence": "high",
              "sourceUrl": "https://fabtcg.com/collectors-centre/super-slam/"
            }
          ],
          "specialOccurrences": [
            {
              "name": "Cold Foil Legendary/Fabled ('moment of joy' pulls)",
              "what": "Cold foils are FAB's marquee chase; the reprint policy guarantees set cold foils are never reprinted. Since Uprising they appear in the token slot (removed before drafting).",
              "approxFrequency": "any cold foil ≈1 per display (1:24 packs, official); legendary cold foil ≈1 per 2-3 cases (1:220 official Uprising, community-tracked since); fabled cold foil unpublished, community guess ~1 per 10 cases, low confidence",
              "whichSets": "booster sets with in-pack cold foils (e.g. Super Slam 2025); High Seas moved them to Treasure Packs",
              "sourceUrl": "https://fabtcg.com/articles/fab-20/"
            },
            {
              "name": "Treasure Packs + Lost Treasures (High Seas, 2025)",
              "what": "A sealed 3-card mini-pack, exactly 1 per booster display, never sold separately; middle Treasure Slot holds a Cold Foil or a Lost Treasure insert. 43 Lost Treasure inserts exist, 17 of them literal 1-of-1s.",
              "approxFrequency": "Treasure Pack: 1 per display (official). Lost Treasure inserts: ~1 per 1,000 Treasure Packs, i.e. ~1 per 1,000 displays (official)",
              "whichSets": "High Seas (June 2025)",
              "sourceUrl": "https://fabtcg.com/products/booster-set/high-seas/"
            },
            {
              "name": "Marvels",
              "what": "Purple-triangle special rarity for high-tier alt versions; introduced with Uprising/FAB 2.0; per-card frequency deliberately non-uniform",
              "approxFrequency": "collectively ~1 per 60 packs in High Seas (official); individual cards range widely with no published per-card odds",
              "whichSets": "all sets since Uprising (2022)",
              "sourceUrl": "https://fabtcg.com/collectors-centre/high-seas/"
            },
            {
              "name": "JP-specific product configuration",
              "what": "Japanese editions can be a different physical product: JP High Seas is 9 cards/pack, 264-card set, explicitly not draft-designed — so JP pull-per-pack figures are not comparable to EN/FR",
              "approxFrequency": "structural difference, not a rate",
              "whichSets": "High Seas JP (2025); check each set's product page",
              "sourceUrl": "https://fabtcg.com/products/booster-set/high-seas/"
            }
          ]
        }
      ]
    },
    {
      "slug": "yu-gi-oh",
      "displayName": "Yu-Gi-Oh!",
      "officialOdds": "Essentially no. Konami does not print pull odds on TCG or OCG packs, boxes, or product pages — verified directly on the official Alliance Insight pages (US + EU), which list rarity counts ('10 Secret Rares, 14 Ultra Rares...') but contain zero ratio language. This is unlike Pokemon-era odds-on-pack practice and has been Konami's consistent TCG posture historically. Two partial exceptions: (1) official social-media marketing occasionally states approximate ratios for collector products — e.g., the official @YuGiOh_TCG post giving 'approx. 1-in-4 packs' for Platinum Secret Rare in Rarity Collection II (May 2024) — and official copy sometimes states per-pack guarantees ('a guaranteed luxury Secret Rare in every pack', Quarter Century Stampede); (2) OCG box collation is so rigid that per-box foil counts (6 Super / 3 Ultra / 2 Secret / 1 Ultimate per 30-pack box) function as de facto known 'official-ish' quantities — but they are community-documented, never published as probabilities by Konami.",
      "sections": [
        {
          "region": null,
          "era": "Yu-Gi-Oh! (TCG international / OCG Japan-Asia)",
          "packStructure": {
            "cardsPerPack": "TCG core booster: 9 cards (8 + 1 guaranteed foil in the 9th slot, Super Rare or better, standard since Breakers of Shadow, 2016). OCG core booster: 5 cards (4 commons + 1 guaranteed Rare-or-better).",
            "packsPerBox": "TCG: 24 packs per booster box/display. OCG: 30 packs per box (verified for current sets, e.g. Supreme Darkness: '5 cards per pack and 30 packs per box').",
            "boxesPerCase": "TCG: 12 boxes per case (Cardmarket box-math convention: 'one case equals twelve booster boxes'). OCG: 24 boxes per carton (JP community carton-ratio tracking uses 1カートン = 24 BOX).",
            "guaranteedSlots": "TCG: every pack's 9th card is at least Super Rare; no per-box printed guarantees. OCG: every pack guarantees 1 R-or-higher; box collation is near-deterministic — a 30-pack box reliably yields ~12-13 foils: ~6 Super, ~3 Ultra, ~2 Secret, ~1 Ultimate(relief), plus 0-1 top-chase card (Holo/25th Secret era-dependent). OCG 1st-print boxes typically include a +1 bonus pack.",
            "notes": "The two games differ fundamentally: TCG rarity is probabilistic per-pack collation across a 24-pack box; OCG uses rigid per-box collation so JP players treat per-box foil counts as de facto known. Special/collector sets differ again: TCG Rarity Collection sets are all-foil 9-card packs (RA01/RA02) or 5-card packs (Rarity Collection 5, Apr 2026: 4 main-pool foils + 1 guaranteed variant-art card from a separate pool); Quarter Century Bonanza/Stampede used 5-card packs with 'a guaranteed luxury Secret Rare in every pack' (official Konami language). Some 2025 TCG side sets (e.g. Justice Hunters, Aug 2025) use a Deck-Build-style structure: 60-card set, Rare base, Collector's Rare + Starlight chase, sold in mini-boxes — not the core-booster pattern."
          },
          "rarityLadder": [
            "TCG (current era, low→high): Common → Rare (only in some set types) → Super Rare → Ultra Rare → Secret Rare → Ultimate Rare (embossed variant, revived ~2024 core sets) → Quarter Century Secret Rare (2023 – mid-2025 only) / Platinum Secret Rare (collector sets) → Collector's Rare (special sets) → Starlight Rare (top chase; called Ghost-style by collectors)",
            "OCG (low→high): Normal → Rare → Super Rare → Ultra Rare → Secret Rare → Ultimate Rare (relief; ~1 per box since Duelist Nexus 2023) → Quarter Century Secret Rare / 25thシク (2023 – early-2025) → Holographic Rare (traditional OCG top chase, ~2 per 24-box carton)",
            "Collector-set-exclusive TCG rarities: Platinum Secret Rare, Prismatic Ultimate Rare, Prismatic Collector's Rare (25th Anniversary Rarity Collection I/II, QC Bonanza/Stampede, Rarity Collection 5)"
          ],
          "rates": [
            {
              "tier": "TCG guaranteed foil slot (Super Rare or better)",
              "rate": "1 per pack (9th card), i.e. 24 foils per box",
              "basis": "Long-documented collation on fan wikis (standard since Breakers of Shadow, 2016) — community consensus, not official print",
              "confidence": "high",
              "regionNote": "TCG (INTL) only; OCG guarantees 1 R-or-better per 5-card pack instead",
              "sourceUrl": "https://yugioh.fandom.com/wiki/Booster_Pack"
            },
            {
              "tier": "TCG Ultra Rare",
              "rate": "~1 in 6 packs → ~3-4 per 24-pack box",
              "basis": "Fan-wiki collation figure (1:6 for the foil slot) corroborated by 2026 community box-opening data (tcgtalk, 10+ box sample: '~1 in 6, 3-4 per box')",
              "confidence": "medium",
              "regionNote": "TCG. OCG boxes yield ~3 Ultras per 30-pack box by rigid collation (higher confidence there)",
              "sourceUrl": "https://tcgtalk.com/guides/blazing-dominion-yugioh-pull-rates"
            },
            {
              "tier": "TCG Secret Rare",
              "rate": "~1 in 12 packs → ~2 per box (occasionally 3)",
              "basis": "Fan-wiki collation figure (1:12 foil slot) + community box data for Blazing Dominion 2026 (~2 per box); Konami publishes nothing",
              "confidence": "medium",
              "regionNote": "TCG. OCG: 2 Secrets per 30-pack box, near-deterministic (community-documented collation, medium-high confidence)",
              "sourceUrl": "https://tcgtalk.com/guides/blazing-dominion-yugioh-pull-rates"
            },
            {
              "tier": "Starlight Rare (TCG top chase, a.k.a. ghost-tier)",
              "rate": "Era-dependent: classic era (2019-2022) roughly 1 per 2 cases (~0.5 per 12-box case, i.e. 1 per ~24 boxes); 'about 1 per case' is the commonly repeated community shorthand; recent sets appear notably better — one 2026 community sample (Blazing Dominion, 10+ boxes) claims ~1 per 3 boxes",
              "basis": "Cardmarket box-math analysis for Phantom Rage ('0.5 starlight rare cards per case... an average of one per two cases') = aggregator estimate from community samples; the 1-per-3-boxes figure is a small community sneak-peek sample (tcgtalk) and should be treated as low confidence. Internet claims range as wide as '1 in 120 boxes' (content-farm, unreliable). No official figure exists.",
              "confidence": "low",
              "regionNote": "TCG-exclusive rarity (introduced Rising Rampage, 2019). OCG's equivalent top chase is Holographic Rare, which pulls at ~2 per 24-box carton"
            },
            {
              "tier": "Quarter Century Secret Rare — TCG core boosters (2023 to mid-2025)",
              "rate": "No large public EN sample located; community anecdotes cluster around 'roughly 1 per 4-6 boxes' for QCSR-era core sets, with the set's QCSR-only chase card far rarer (multiple cases). Do not treat any specific EN number as established.",
              "basis": "Anecdote / community chatter only — flagged explicitly as such; Konami's official Alliance Insight pages list QCSR availability (24 cards + 1 QCSR-only) but zero odds",
              "confidence": "low",
              "regionNote": "TCG. Officially wound down: Konami states Quarter Century Stampede and Alliance Insight (spring 2025) 'will be among the final releases to include Quarter Century Secret Rares'",
              "sourceUrl": "https://www.yugioh-card.com/en/products/alin/"
            },
            {
              "tier": "Quarter Century Secret Rare (25thシク) — OCG basic packs (Oct 2023 – Jan 2025)",
              "rate": "Conflicting JP community measurements: carton-level tracking for Rage of the Abyss reports ~10 QCSRs per 24-box carton (~1 per 2-3 boxes, varying ±2 depending on memorial secrets), while other JP blogs cite 'roughly 1 per 12 boxes' for basic packs of the era; special memorial QCSRs are much rarer (may not appear in a full carton)",
              "basis": "JP community carton measurements (ameblo carton-ratio tracker) vs JP blog estimates — genuinely unresolved spread, likely product-dependent and confounded by which QCSR subset is being counted",
              "confidence": "low",
              "regionNote": "OCG. In JP Rarity Collection (レアコレ) sets, 25thシク was effectively guaranteed 1 per box per JP community verification — a different product class from basic packs",
              "sourceUrl": "https://ameblo.jp/alhide/entry-12866626444.html"
            },
            {
              "tier": "Holographic Rare (OCG top chase)",
              "rate": "~2 per 24-box carton (~1 per 12 boxes)",
              "basis": "JP community carton-level measurement (community data, explicitly not official)",
              "confidence": "medium",
              "regionNote": "OCG only — this rarity does not exist in TCG core boosters",
              "sourceUrl": "https://ameblo.jp/alhide/entry-12866626444.html"
            },
            {
              "tier": "Ultimate Rare (relief/embossed)",
              "rate": "OCG: ~1 per 30-pack box (rigid collation, since the Duelist Nexus 2023 restructure). TCG: revived in core sets around Rage of the Abyss (Oct 2024) as a variant of Ultra Rares; no reliable EN per-box rate located — community anecdotes only",
              "basis": "OCG: community-documented stable box collation (yugioh-starter.com per-box tables: Super 6 / Ultra 3 / Secret 2 / Ultimate 1). TCG: rarity presence confirmed via Yugipedia set pages; rate is anecdote-level",
              "confidence": "medium",
              "regionNote": "OCG figure medium-high confidence; TCG figure not established",
              "sourceUrl": "https://yugioh-starter.com/whats-in-box/"
            },
            {
              "tier": "Platinum Secret Rare (TCG collector sets)",
              "rate": "Approx. 1 in 4 packs in Rarity Collection II (two chances per 9-card all-foil pack) — an OFFICIAL Konami figure, unusually",
              "basis": "Official publisher statement: Yu-Gi-Oh! TCG X/Twitter post, May 2024: 'Each extra-large, 9-card, all-foil pack has TWO different chances at this rarity (approx. 1-in-4 packs)'",
              "confidence": "high",
              "regionNote": "TCG collector products only (RA01/RA02, QC Bonanza/Stampede, Rarity Collection 5); rate is per that product, not core boosters",
              "sourceUrl": "https://x.com/YuGiOh_TCG/status/1793416613179588823"
            }
          ],
          "specialOccurrences": [
            {
              "name": "Starlight Rare",
              "what": "TCG-exclusive ultra-chase rarity (sparkle-foil over whole card); typically ~4-10 cards per core set as alternate versions of key Secrets/Ultras",
              "whichSets": "TCG core boosters since Rising Rampage (2019), continuing through 2025-2026 sets (Alliance Insight, Justice Hunters, Blazing Dominion) and Rarity Collection sets",
              "approxFrequency": "Historically ~1 per 1-2 cases (12-24 boxes) — aggregator/community estimate; recent 2025-2026 community samples suggest substantially better (~1 per 3 boxes claimed for Blazing Dominion from a 10+ box community sample; small sample, low confidence). Replaces an Ultra/Secret slot without reducing normal Secret yield."
            },
            {
              "name": "Quarter Century Secret Rare (25th-anniversary chase)",
              "what": "Champagne-gold speckled name + 25th-anniversary watermark; introduced April 2023 (TCG: Legendary Collection 25th Anniversary Edition), officially replacing Prismatic Secret Rare; featured across most OCG+TCG products 2023-2025",
              "whichSets": "TCG core boosters Duelist Nexus (2023) through Alliance Insight (May 2025); OCG basic packs Oct 2023 - Jan 2025; guaranteed 1/box in JP Rarity Collection; guaranteed-adjacent density in QC Bonanza/Stampede (5-card packs, 'guaranteed luxury Secret Rare in every pack', official)",
              "approxFrequency": "Core boosters: OCG carton data ~10 per 24 boxes (Rage of the Abyss) vs '~1 per 12 boxes' cited by other JP sources — unresolved, low confidence; TCG EN rate anecdotal (~1 per several boxes). Konami officially announced the rarity's retirement: Stampede + Alliance Insight 'among the final releases' with QCSRs.",
              "sourceUrl": "https://www.konami.com/games/eu/en/topics/18626/"
            },
            {
              "name": "Ultimate Rare revival (25th-anniversary era)",
              "what": "Embossed 'relief' rarity returned after long absence — OCG core sets carry Ultimate versions of Ultras since Duelist Nexus (2023); TCG core sets since ~Rage of the Abyss (2024); 25th Anniversary Rarity Collection introduced 'Prismatic'-style Ultimate Rares (raised 3D varnish) to TCG",
              "whichSets": "OCG basic packs 2023→present (~1 per box, collation); TCG core sets 2024→present; Prismatic Ultimate in RA collector sets incl. Rarity Collection 5 (Apr 2026)",
              "approxFrequency": "OCG: ~1 per 30-pack box (community-documented rigid collation, medium-high confidence). TCG: no established rate (anecdote only).",
              "sourceUrl": "https://yugioh-starter.com/whats-in-box/"
            },
            {
              "name": "Holographic Rare (OCG)",
              "what": "OCG's traditional top parallel (holographic cover-card treatment); has no TCG core-booster equivalent",
              "whichSets": "OCG basic packs, ongoing",
              "approxFrequency": "~2 per 24-box carton (~1 per 12 boxes) — JP community carton measurement, medium confidence",
              "sourceUrl": "https://ameblo.jp/alhide/entry-12866626444.html"
            },
            {
              "name": "Post-anniversary collector rarities (2025-2026)",
              "what": "After QCSR retirement, TCG chase structure = Starlight (core sets) + Platinum Secret / Prismatic Ultimate / Collector's Rare (collector sets); Rarity Collection 5 (Apr 2026) adds a guaranteed variant-art 5th-card slot per all-foil pack",
              "whichSets": "Justice Hunters (2025, Collector's Rare + Starlight), Blazing Dominion (2026, Starlight top chase), Rarity Collection 5 (2026)",
              "approxFrequency": "Rarity Collection 5: 1 variant-art card guaranteed per pack (official product structure); high-end upgrade odds not published for RA05 — the RA02 official 'approx 1-in-4 packs' Platinum figure is the only published reference point",
              "sourceUrl": "https://www.yugioh-world.com/2025/12/03/upcoming-tcg-product-release-yu-gi-oh-rarity-collection-5-launches-april-10-2026-with-new-variant-art-cards/"
            }
          ]
        }
      ]
    },
    {
      "slug": "lorcana",
      "displayName": "Disney Lorcana",
      "officialOdds": "No. Ravensburger publishes no per-rarity probability chart (confirmed by multiple aggregators, e.g. The Gamers Lodge: \"Ravensburger does not publish a per rarity probability chart\"). All Lorcana rates below are community-measured or aggregator estimates.",
      "sections": [
        {
          "region": null,
          "era": "Disney Lorcana",
          "packStructure": {
            "cardsPerPack": "12 (6 common, 3 uncommon, 2 rare-or-higher, 1 foil of any rarity)",
            "packsPerBox": "24",
            "boxesPerCase": "4 boxes = 96 packs (typical sealed case)",
            "guaranteedSlots": "2 rare-or-higher slots (Rare / Super Rare / Legendary) + 1 foil slot per pack; special rarities (Enchanted, Iconic, foil Epic) replace the foil slot",
            "notes": "Structure has been stable from Set 1 (The First Chapter, 2023) through Set 10 (Whispers in the Well, Nov 2025). Set 9 'Fabled' (Sept 2025) added two new rarities — Epic (18 per set) and Iconic (2 per set) — without changing the 12-card pack; Set 10 kept 18 Epic / 18 Enchanted / 2 Iconic in the secret-numbered range above 204. Illumineer's Troves (9 packs) are the other common sealed unit."
          },
          "rarityLadder": [
            "Common",
            "Uncommon",
            "Rare",
            "Super Rare",
            "Legendary",
            "Epic (introduced Set 9 'Fabled', Sept 2025)",
            "Enchanted (secret-numbered foil alt-art)",
            "Iconic (introduced Set 9, rarest tier, 2 per set)"
          ],
          "rates": [
            {
              "tier": "Legendary",
              "rate": "~18-19% of packs, i.e. roughly 4-5 per 24-pack box (Reign of Jafar 18.19%/pack, Fabled 19.49%/pack)",
              "basis": "Community large-sample self-report polls by u/Narzghal on r/Lorcana (479+ responses for Reign of Jafar, 700+ for Fabled), as compiled by The Gamers Lodge",
              "confidence": "medium",
              "sourceUrl": "https://thegamerslodge.com/blogs/lorcana/lorcana-pull-rates-a-clear-guide",
              "regionNote": "Single global English print run; no JP/EN split"
            },
            {
              "tier": "Enchanted",
              "rate": "Roughly 1 per 96-100 packs on average — ≥1 Enchanted in ~22% of boxes and ~62-64% of 4-box cases (Reign of Jafar: box 22.43%, case 63.79%; Fabled: box 21.59%, case 62.20%). So most boxes contain none; a case yields about one on average",
              "basis": "Community poll data (u/Narzghal trackers via The Gamers Lodge); the box/case/trove-level figures are internally consistent at ~1% per pack. Note: single-pack self-reports from the same polls run higher (1.2-2%/pack), almost certainly selection bias — trust the product-level numbers",
              "confidence": "medium",
              "sourceUrl": "https://thegamerslodge.com/blogs/lorcana/lorcana-pull-rates-a-clear-guide",
              "regionNote": "Aggregators report the rate as roughly stable from Set 1 through Set 8+"
            },
            {
              "tier": "Epic (2025+)",
              "rate": "DISPUTED: estimates range from ~1 in 16 packs (~1.5 per box) to ~1 in 100 packs (~1 per case). Sources conflict on both rate and which slot Epics occupy (rare slots vs foil slot); no large-sample tracker has settled it",
              "basis": "Aggregator estimate (lorcanacollectors.com: '1 in every 16 packs') vs fan estimate reported by Beckett ('one in every 100 packs'). Neither cites sample data — treat as a wide range, not a number",
              "confidence": "low",
              "sourceUrl": "https://lorcanacollectors.com/lorcana-pull-rates/",
              "regionNote": ""
            },
            {
              "tier": "Iconic (2025+)",
              "rate": "Extremely rare: roughly 1 per 15+ cases (~1 in 1,400-1,500 packs); community explicitly notes 'there haven't been consistent enough results to know the percentages'",
              "basis": "Aggregator estimate (lorcanacollectors: '1 in ~1,500 packs') + anecdotal reports compiled by Beckett ('often requiring 15+ cases to see just one'). Small sample by construction (2 cards per set) — order-of-magnitude only",
              "confidence": "low",
              "sourceUrl": "https://www.beckett.com/news/every-iconic-and-epic-card-in-disney-lorcana-fabled/",
              "regionNote": ""
            },
            {
              "tier": "Super Rare",
              "rate": "~1 per 2-3 packs (in the two rare-or-higher slots)",
              "basis": "Aggregator editorial synthesis (lorcanacollectors.com), no disclosed methodology",
              "confidence": "low",
              "sourceUrl": "https://lorcanacollectors.com/lorcana-pull-rates/",
              "regionNote": ""
            }
          ],
          "specialOccurrences": [
            {
              "name": "Enchanted",
              "what": "Secret-numbered (above the set's 204) full-foil alternate-art chase cards; appear only in the foil slot",
              "whichSets": "Every main set since The First Chapter (2023)",
              "approxFrequency": "~1 per 4-box case on average (~1 in ~96-100 packs); ~22% of boxes contain one — community poll data, medium confidence",
              "sourceUrl": "https://thegamerslodge.com/blogs/lorcana/lorcana-pull-rates-a-clear-guide"
            },
            {
              "name": "Iconic",
              "what": "Rarest tier: borderless full alt-art with custom 'lore star' foil pattern and 3D hot-stamp; only 2 per set (Fabled's are Mickey Mouse – Brave Little Prince and Minnie Mouse – Sweetheart Princess with connected artwork)",
              "whichSets": "Set 9 'Fabled' (Sept 2025) onward, incl. Set 10 'Whispers in the Well' (Nov 2025)",
              "approxFrequency": "Roughly 1 per 15+ cases (community estimate/anecdote, low confidence; no stable measured rate exists yet)",
              "sourceUrl": "https://rarecandy.com/blog/collectors-guide-lorcanas-new-card-rarities"
            },
            {
              "name": "Epic",
              "what": "New 2025 tier between Legendary and Enchanted: borderless 'open-air' frame, rainbow-foil treatment; 18 per set; alternate-art reprints with no gameplay-exclusive text",
              "whichSets": "Set 9 'Fabled' onward",
              "approxFrequency": "Disputed: ~1 in 16 to ~1 in 100 packs depending on source; low confidence",
              "sourceUrl": "https://lorcanacollectors.com/lorcana-pull-rates/"
            }
          ]
        }
      ]
    },
    {
      "slug": "star-wars-unlimited",
      "displayName": "Star Wars Unlimited",
      "officialOdds": "Yes, partially — the most transparent of the three. FFG's launch 'Booster Pack Breakdown' article published odds charts (with the caveat 'these odds assume perfect distribution, and the actual odds may vary slightly'); community sites transcribed them as: foil 1:1 pack, Legendary 1:8 packs, Hyperspace variant 2:3 packs, Hyperspace Rare/Legendary 1:15 packs, foil Hyperspace Rare/Legendary 1:50 packs, Showcase 1:288 packs. FFG's official 2026 article 'A Shift from What Was' states non-foil Prestige at 'about 1 in every 18 booster packs' and serialized Prestige print runs of 250/100/50 copies.",
      "sections": [
        {
          "region": null,
          "era": "Star Wars Unlimited",
          "packStructure": {
            "cardsPerPack": "16 (1 Leader, 1 Base with token reverse, 9 commons, 3 uncommons, 1 Rare-or-Legendary, 1 foil of any rarity)",
            "packsPerBox": "24",
            "boxesPerCase": "6 (retail cases are consistently sold as 6 displays across all sets)",
            "guaranteedSlots": "Leader + Base + 1 Rare/Legendary + 1 foil in every pack; from 'A Lawless Time' (Mar 2026) every pack also guarantees at least 1 Hyperspace card and 1 Hyperspace-foil card",
            "notes": "2026 structural shift (official, effective with 'A Lawless Time'): black-border foils removed; Hyperspace/Hyperspace-foil drop rates increased across all rarities; ~1:18 packs contains a non-foil Prestige variant. Separate premium 'Carbonite Edition' boosters: every card is special (foil/Hyperspace/Showcase/Prestige), incl. a guaranteed non-foil Prestige per pack, ~4+ Hyperspace cards, 6 Hyperspace-foils, 1 Hyperspace/Showcase leader; Showcase leader rates in Carbonite were 'significantly dialed back' vs the prior premium product."
          },
          "rarityLadder": [
            "Common",
            "Uncommon",
            "Rare",
            "Legendary",
            "— variants: Foil (any rarity)",
            "Hyperspace (borderless variant, any card)",
            "Hyperspace foil",
            "Showcase (Leaders only, alt-art + unique frame + special foil)",
            "Prestige (2026+, Carbonite-first; includes serialized versions)"
          ],
          "rates": [
            {
              "tier": "Foil (any rarity)",
              "rate": "1 per pack (the dedicated foil slot)",
              "basis": "Official publisher statement (FFG Booster Pack Breakdown)",
              "confidence": "high",
              "sourceUrl": "https://starwarsunlimited.com/articles/boosting-ahead-of-release",
              "regionNote": "Same product worldwide; EN and localized print runs share the stated odds"
            },
            {
              "tier": "Legendary",
              "rate": "~1 in 8 packs (~3 per 24-pack box)",
              "basis": "Official FFG odds chart (perfect-distribution caveat), transcribed by Card Gamer",
              "confidence": "high",
              "sourceUrl": "https://cardgamer.com/guides/star-wars-unlimited-spark-of-rebellion-pull-rates/",
              "regionNote": ""
            },
            {
              "tier": "Hyperspace variant (any)",
              "rate": "2 in 3 packs at launch era; guaranteed ≥1 per pack from 'A Lawless Time' (Mar 2026)",
              "basis": "Official (launch odds chart + FFG's 'A Shift from What Was' announcement)",
              "confidence": "high",
              "sourceUrl": "https://starwarsunlimited.com/articles/a-shift-from-what-was",
              "regionNote": ""
            },
            {
              "tier": "Hyperspace Rare or Legendary",
              "rate": "~1 in 15 packs (non-foil); foil Hyperspace Rare/Legendary ~1 in 50 packs",
              "basis": "Official FFG odds chart (launch era), transcribed by Card Gamer",
              "confidence": "high",
              "sourceUrl": "https://cardgamer.com/guides/star-wars-unlimited-spark-of-rebellion-pull-rates/",
              "regionNote": ""
            },
            {
              "tier": "Showcase Leader",
              "rate": "1 in 288 packs = ~1 per 12 boxes (2 per case on average is WRONG — it's ~1 per 2 cases) at launch; community/aggregator reporting says later 2024-2025 sets made Showcases 'much more common', but no official number was published for the changed rate",
              "basis": "Official FFG launch odds chart (1:288, high confidence for Spark of Rebellion era); the 'more common in later sets' claim is aggregator/community observation without published figures (low confidence)",
              "confidence": "medium",
              "sourceUrl": "https://cardgamer.com/guides/star-wars-unlimited-card-rarities/",
              "regionNote": ""
            },
            {
              "tier": "Prestige (non-foil, standard boosters)",
              "rate": "~1 in 18 packs from 'A Lawless Time' (Mar 2026) onward",
              "basis": "Official publisher statement: 'about 1 in every 18 booster packs will contain a non-foil Prestige variant'",
              "confidence": "high",
              "sourceUrl": "https://starwarsunlimited.com/articles/a-shift-from-what-was",
              "regionNote": ""
            }
          ],
          "specialOccurrences": [
            {
              "name": "Serialized Prestige",
              "what": "Numbered serialized versions of Prestige cards, found in Carbonite Edition boosters; global print runs are fixed counts, not ratios",
              "whichSets": "Carbonite Edition boosters; expanded rules stated for 'A Lawless Time' (Mar 2026) onward",
              "approxFrequency": "Print-run capped: most at 250 total copies worldwide, selected subsets at 100, and some at only 50 copies each (official publisher statement, high confidence)",
              "sourceUrl": "https://starwarsunlimited.com/articles/a-shift-from-what-was"
            },
            {
              "name": "Carbonite Edition boosters",
              "what": "Premium parallel booster line where every card is foil/Hyperspace/Showcase/Prestige; each pack has a guaranteed non-foil Prestige, ~1 Hyperspace-or-Showcase leader, multiple Hyperspace and Hyperspace-foil cards",
              "whichSets": "Introduced alongside 'A Lawless Time' (2026)",
              "approxFrequency": "Contents per pack are guaranteed by product design (official); Showcase leader rate within Carbonite 'significantly dialed back' with no published number",
              "sourceUrl": "https://starwarsunlimited.com/articles/a-shift-from-what-was"
            },
            {
              "name": "Showcase Leaders",
              "what": "Full-bleed alt-art Leader cards with unique frame and special foil — the original chase tier",
              "whichSets": "All sets since Spark of Rebellion (2024)",
              "approxFrequency": "1:288 packs (~1 per 12 boxes / ~1 per 2 cases) per official launch-era chart; later sets reportedly more generous (unquantified)",
              "sourceUrl": "https://cardgamer.com/guides/star-wars-unlimited-spark-of-rebellion-pull-rates/"
            }
          ]
        }
      ]
    },
    {
      "slug": "vanguard",
      "displayName": "Cardfight!! Vanguard",
      "officialOdds": "Partially and inconsistently. Current official EN product pages (Divinez era) publish a guarantee — '2 cards in every pack will definitely be R or above cards!!' — but no parallel-rarity odds. However, Bushiroad HAS published explicit percentages for some past sets: the official EN V-BT09 page lists 'Parallels (SP + RLR): ~1.28%, VR: ~9.38%, RRR: ~20.94%, RR: ~33.75%'. So the publisher sometimes prints odds, but not for current DZ sets — DZ-era parallel rates below are community/aggregator estimates only.",
      "sections": [
        {
          "region": null,
          "era": "Cardfight!! Vanguard",
          "packStructure": {
            "cardsPerPack": "7",
            "packsPerBox": "16 (official: '1 display contains 16 packs')",
            "boxesPerCase": "Carton size is NOT stable across sources: current JP retail listings show 12 boxes/carton for some DZ sets and 20 boxes/carton for others (same aggregator, different sets); older EN-era community threads cite 16 boxes/carton. Treat any per-carton rate as approximate. (Low confidence)",
            "guaranteedSlots": "2 of the 7 cards per pack guaranteed R or above (official, printed on EN product pages)",
            "notes": "Divinez era (DZ-BT01 'Fated Clash', Feb 2024 → DZ-BT14, Apr 2026). JP and EN releases share set codes and the same 7-card/16-pack structure; the EN editions additionally include exclusive EX/EXS BanG Dream! collaboration parallel cards not in the JP base seeding. A typical DZ main set is ~106-146 base cards (roughly 18-19 RRR / 22-24 RR / 22-24 R / 44-72 C) plus ~110-120 parallel cards (1 DSR, 5-6 SEC or SECV, ~17-18 FFR, ~44-48 FR, ~39-42 SR)."
          },
          "rarityLadder": [
            "C (Common)",
            "R (Rare)",
            "RR (Double Rare)",
            "RRR (Triple Rare) + themed variants (ORR/TRR)",
            "SR (Silver Rare — frameless, silver hot stamp)",
            "FR (Frame Rare)",
            "FFR (Full Frame Rare)",
            "SEC / SECV (Secret — hot-stamp treatment)",
            "DSR (Dress Secret Rare — top chase, usually 1 card type per set, e.g. CLAMP-illustrated)",
            "EX/EXS (EN-exclusive collab parallels)"
          ],
          "rates": [
            {
              "tier": "R or above",
              "rate": "Exactly 2 per 7-card pack (32 per box)",
              "basis": "Official publisher print on EN product pages ('2 cards in every pack will definitely be R or above cards!!')",
              "confidence": "high",
              "sourceUrl": "https://en.cf-vanguard.com/products/dzbt01/",
              "regionNote": "Stated on both current DZ and older V-era official EN pages; JP structure matches"
            },
            {
              "tier": "RRR / RR (per 16-pack box)",
              "rate": "~2 RRR and ~5 RR per box; SR ~6/box; FFR ~1/box (DZ-era sets, 2025-2026)",
              "basis": "JP aggregator's compiled research (anianitarou.com for DZ-BT11 and DZ-BT14) — explicitly labeled by the author as personal reference-only research, not shop-verified opening data",
              "confidence": "low",
              "sourceUrl": "https://anianitarou.com/%E3%83%B4%E3%82%A1%E3%83%B3%E3%82%AC%E3%83%BC%E3%83%89%E3%80%90%E6%AD%A6%E5%A5%8F%E7%83%88%E8%8F%AF%E3%80%91%E5%B0%81%E5%85%A5%E7%8E%87%E3%83%BB%E5%BD%93%E3%81%9F%E3%82%8A%E3%83%BB%E9%AB%98%E9%A1%8D/",
              "regionNote": "JP figures; EN assumed similar but unverified"
            },
            {
              "tier": "SEC (Secret)",
              "rate": "Roughly 2 per 20 boxes, i.e. ~1 per 8-12 boxes — most boxes contain none",
              "basis": "JP aggregator compiled research for 2025-2026 DZ sets (same reference-only caveat); consistent with older JP community descriptions of SEC as 'a few per carton'",
              "confidence": "low",
              "sourceUrl": "https://anianitarou.com/%E3%83%B4%E3%82%A1%E3%83%B3%E3%82%AC%E3%83%BC%E3%83%89%E3%80%90%E8%B5%AB%E6%9C%88%E3%83%8E%E4%BD%BF%E8%80%85%E3%80%91%E5%B0%81%E5%85%A5%E7%8E%87%E3%83%BB%E5%BD%93%E3%81%9F%E3%82%8A%E3%83%BB%E9%AB%98/",
              "regionNote": "JP data"
            },
            {
              "tier": "DSR (Dress Secret Rare)",
              "rate": "SOURCES DISAGREE, spanning an order of magnitude: JP community carton-tracking for the D era reports 0-1 per carton (some cartons contain none; possibly ~1 per 1-2 cartons), while one JP aggregator lists ~0.3-1 per box for 2026 DZ sets. We could not reconcile these; honest answer is 'somewhere between ~1 per 2 boxes and ~1 per 2 cartons, unknown', leaning rarer based on market prices and the D-era carton data",
              "basis": "Conflict between JP community carton openings/blog consensus (vanguard-gia / vg-vanguard, D-BT01 era) and JP aggregator personal research (anianitarou, DZ-BT11/BT14). Neither is publisher-verified",
              "confidence": "low",
              "sourceUrl": "https://vg-vanguard.com/%E3%83%B4%E3%82%A1%E3%83%B3%E3%82%AC%E3%83%BC%E3%83%89-%E4%BA%94%E5%A4%A7%E4%B8%96%E7%B4%80%E3%81%AE%E9%BB%8E%E6%98%8E/%E3%80%90%E5%B0%81%E5%85%A5%E7%8E%87%E3%81%BE%E3%81%A8%E3%82%81%E3%80%91%E3%83%B4%E3%82%A1%E3%83%B3%E3%82%AC%E3%83%BC%E3%83%89%E3%80%8C%E4%BA%94%E5%A4%A7%E4%B8%96%E7%B4%80%E3%81%AE%E9%BB%8E%E6%98%8E%E3%80%8D/",
              "regionNote": "JP data; EN DSR seeding unverified"
            },
            {
              "tier": "Parallels overall (historical official datum)",
              "rate": "V-era official example: SP+RLR parallels ~1.28% of cards (~1-1.5 per box), VR ~9.38%, RRR ~20.94%, RR ~33.75% (V-BT09, 2020)",
              "basis": "Official publisher print on the EN product page — included as proof Bushiroad has published real odds, not as a current-set rate",
              "confidence": "high",
              "sourceUrl": "https://en.cf-vanguard.com/products/vbt09/",
              "regionNote": "V-era EN product; do not extrapolate to DZ sets"
            }
          ],
          "specialOccurrences": [
            {
              "name": "DSR (Dress Secret Rare)",
              "what": "The single top-chase parallel — typically exactly 1 card type per set, with special guest artwork (e.g. CLAMP illustrations in DZ-BT01 'Fated Clash')",
              "whichSets": "OverDress era (2021) onward, incl. all Divinez DZ-BT main sets",
              "approxFrequency": "Disputed: between ~1 per 2 boxes (one aggregator, 2026 sets) and 0-1 per carton (JP community carton data, some cartons none) — low confidence either way",
              "sourceUrl": "https://en.cf-vanguard.com/products/dzbt01/"
            },
            {
              "name": "SEC / SECV (Secret)",
              "what": "Hot-stamped secret parallels; 5-6 card types per DZ set (SECV variants in later 2026 sets like DZ-BT12)",
              "whichSets": "Divinez DZ-BT sets (2024-2026)",
              "approxFrequency": "~2 per 20 boxes / ~1 per 8-12 boxes (JP aggregator personal research, low confidence)",
              "sourceUrl": "https://anianitarou.com/%E3%83%B4%E3%82%A1%E3%83%B3%E3%82%AC%E3%83%BC%E3%83%89%E3%80%90%E8%B5%AB%E6%9C%88%E3%83%8E%E4%BD%BF%E8%80%85%E3%80%91%E5%B0%81%E5%85%A5%E7%8E%87%E3%83%BB%E5%BD%93%E3%81%9F%E3%82%8A%E3%83%BB%E9%AB%98/"
            },
            {
              "name": "EN-exclusive EX/EXS collab cards",
              "what": "BanG Dream! collaboration parallel cards seeded only in English editions ('special EX rarities' per the official EN page); 6-110 types depending on set",
              "whichSets": "English Divinez sets (DZ-BT01 onward; DZ-BT10 lists 55 EX + 55 EXS; DZ-BT12 ties to Divinez DELUXE Finals bands)",
              "approxFrequency": "Regularly seeded — roughly several per box per aggregator figures, but per-box counts conflict between sources (low confidence)",
              "sourceUrl": "https://cardfight.fandom.com/wiki/DZ_Booster_Set_10:_Dragonsoul_Resonance"
            }
          ]
        }
      ]
    }
  ],
  "sources": [
    "https://magic.wizards.com/en/news/feature/collecting-magic-the-gathering-final-fantasy",
    "https://fabtcg.com/en/resources/collectors-centre/",
    "https://starwarsunlimited.com/articles/boosting-ahead-of-release",
    "https://en.onepiece-cardgame.com/",
    "https://www.pokemon-card.com/",
    "https://premium.gamepedia.jp/toreca/",
    "https://tcgtalk.com/",
    "https://www.tcgplayer.com/content/",
    "https://pokebeach.com/forums/",
    "https://cardgamer.com/"
  ]
};

/** One game by slug, or null. */
export function pullsForGame(slug: string): GamePulls | null {
  return PULLS_SNAPSHOT.games.find((g) => g.slug === slug) ?? null;
}
