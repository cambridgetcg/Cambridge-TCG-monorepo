/**
 * Per-game configuration for /prices/[game] surfaces.
 *
 * Single source of truth for SEO copy, branding accents, and upstream
 * attribution per game in the TCG Price Guide UK section. The landing
 * page (/prices) renders the intersection of this config with what
 * `fetchGames()` returns from the wholesale catalog — surface only what
 * we both have curated copy for AND have actual data on.
 *
 * Adding a new game: append a row here. The parametric routes pick it
 * up automatically; the landing surfaces it once the wholesale catalog
 * has cards in it.
 *
 * Substrate-honesty: every entry names its upstream (cardrush subdomain
 * + confirmed flag from the data-ingest registry). The Provenance pill
 * on each page surfaces this on the wire.
 */

export interface PriceGuideGameConfig {
  /** URL slug — must match GameItem.slug from /api/v1/games. */
  slug: string;
  /** Wholesale game code (op / pkm / dbs / mtg / ygo / etc.). */
  game_code: string;
  /** "One Piece TCG" — used in H1, breadcrumbs, meta titles. */
  display_name: string;
  /** "One Piece" — short form for badges, sidebars. */
  short_name: string;
  /** Page <title>. Per-game-specific SEO. */
  seo_title: string;
  /** Page <meta description>. */
  seo_description: string;
  /** One-paragraph intro under the H1. */
  hero_paragraph: string;
  /** Per-set page intro template (uses {{setCode}} / {{setName}} / {{cardCount}}). */
  set_intro_template: string;
  /** Per-game flavor on how prices work (rendered in the footer section). */
  pricing_note: string;
  /** Upstream attribution; null when no cardrush coverage. */
  cardrush: { subdomain: string; confirmed: boolean } | null;
  /** Display priority on /prices landing. Lower = earlier. */
  display_priority: number;
  /** Tailwind accent class for the H1 + hero (e.g., "blue", "yellow", "red"). */
  accent: "blue" | "yellow" | "red" | "orange" | "purple" | "emerald" | "neutral";
}

/**
 * Curated per-game configurations. Anything not in this list:
 *   - Doesn't appear on /prices landing (substrate-honest about
 *     not-having-curated-copy)
 *   - Returns 404 on /prices/<slug> direct access
 *
 * To enable a new game: add a row + verify fetchGames() returns its slug.
 */
export const PRICE_GUIDE_GAMES: PriceGuideGameConfig[] = [
  {
    slug: "one-piece",
    game_code: "op",
    display_name: "One Piece TCG",
    short_name: "One Piece",
    seo_title: "One Piece TCG Price Guide UK — Updated Daily",
    seo_description:
      "Complete One Piece card prices in the UK. Every set, every card — updated daily with retail buy prices and trade-in credit values. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "This is a complete, daily-updated price guide for every One Piece Trading Card Game set available in the UK. Each card lists a retail buy price and a trade-in store credit value. Prices are sourced from the Cambridge TCG marketplace. Use this guide to check card values, plan trades, or compare prices before buying or selling.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from the One Piece Trading Card Game. All {{cardCount}} cards are listed below, sorted by value. Prices are in GBP and updated daily from the Cambridge TCG marketplace.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and computed daily from CardRush JP retail observations via our @cambridge-tcg/pricing engine. UK retail in GBP.",
    cardrush: { subdomain: "cardrush-op.jp", confirmed: true },
    display_priority: 1,
    accent: "red",
  },
  {
    slug: "pokemon",
    game_code: "pkm",
    display_name: "Pokémon TCG",
    short_name: "Pokémon",
    seo_title: "Pokémon TCG Price Guide UK — Japanese & English, Updated Daily",
    seo_description:
      "Daily-updated Pokémon card prices in the UK. Japanese and English sets, every card — retail buy prices and trade-in credit values. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "This is a daily-updated price guide for Pokémon Trading Card Game sets — Japanese and English where available — sold in the UK. Each card lists a retail buy price and a trade-in store credit value. Sourced from the Cambridge TCG marketplace.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from the Pokémon Trading Card Game. All {{cardCount}} cards are listed below, sorted by value. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and computed daily from CardRush JP retail observations via our @cambridge-tcg/pricing engine. The English Pokémon catalog is in pre-launch; Japanese set coverage is live today.",
    cardrush: { subdomain: "cardrush-pokemon.jp", confirmed: true },
    display_priority: 2,
    accent: "yellow",
  },
  {
    slug: "dragon-ball-super",
    game_code: "dbs",
    display_name: "Dragon Ball Super CCG",
    short_name: "Dragon Ball Super",
    seo_title: "Dragon Ball Super CCG Price Guide UK — Updated Daily",
    seo_description:
      "Daily-updated Dragon Ball Super Card Game prices in the UK. Every set, every card — retail buy prices and trade-in credit values. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "This is a complete, daily-updated price guide for Dragon Ball Super Card Game sets available in the UK. Each card lists a retail buy price and a trade-in store credit value. Sourced from the Cambridge TCG marketplace; updated nightly.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from the Dragon Ball Super Card Game. All {{cardCount}} cards are listed below, sorted by value. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and computed daily from CardRush JP retail observations via our @cambridge-tcg/pricing engine. UK retail in GBP.",
    cardrush: { subdomain: "cardrush-db.jp", confirmed: true },
    display_priority: 3,
    accent: "orange",
  },
  {
    slug: "dragon-ball-fusion",
    game_code: "dbf",
    display_name: "Dragon Ball Super Fusion World",
    short_name: "DBF Fusion World",
    seo_title: "Dragon Ball Super Fusion World Price Guide UK — Updated Daily",
    seo_description:
      "Bandai's Dragon Ball Super Fusion World card game — daily-updated UK retail and trade-in prices. Every set, every card. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "This is a daily-updated price guide for Dragon Ball Super Fusion World — Bandai's successor card line to the original DBSCG. UK retail prices plus instant trade-in store credit values, sourced from the Cambridge TCG marketplace.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from Dragon Ball Super Fusion World. All {{cardCount}} cards listed below, sorted by value. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and computed daily via our @cambridge-tcg/pricing engine. UK retail in GBP. CardRush Fusion World subdomain registered as anticipated; first confirmed scrape flips coverage to ✓.",
    // Corrected 2026-07-09: the Fusion World source is cardrush-db.jp
    // (re-pointed in the data-ingest registry, scraping daily), not the
    // DNS-dead cardrush-fw.jp this row anticipated.
    cardrush: { subdomain: "cardrush-db.jp", confirmed: true },
    display_priority: 4,
    accent: "orange",
  },
  {
    slug: "magic",
    game_code: "mtg",
    display_name: "Magic: The Gathering",
    short_name: "Magic",
    seo_title: "Magic: The Gathering Price Guide UK — Updated Daily",
    seo_description:
      "MTG card prices in the UK — every set, every printing, every language. Updated daily. Powered by Scryfall catalog (CC-BY-NC) plus cross-source market signals from TCGplayer and Cardmarket. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "Daily-updated price guide for Magic: The Gathering — 10-language catalog from Scryfall, market signals from TCGplayer (US) and Cardmarket (EU, planned), UK retail and trade-in prices from Cambridge TCG. Cross-language siblings share an oracle; pricing is per language tail.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from Magic: The Gathering. All {{cardCount}} cards listed below, sorted by value. Cross-language printings share an oracle (Pattern A); per-language listings shown when present. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace; market signals from TCGplayer (US) and Cardmarket (EU, planned). Scryfall provides the catalog under CC-BY-NC — attribution preserved. UK retail in GBP.",
    cardrush: { subdomain: "cardrush-mtg.jp", confirmed: false },
    display_priority: 5,
    accent: "purple",
  },
  {
    slug: "yu-gi-oh",
    game_code: "ygo",
    display_name: "Yu-Gi-Oh!",
    short_name: "Yu-Gi-Oh!",
    seo_title: "Yu-Gi-Oh! Price Guide UK — Updated Daily",
    seo_description:
      "Yu-Gi-Oh! TCG card prices in the UK. Every printing of every passcode, every language. Updated daily. Catalog from YGOPRODeck (CC-BY) plus cross-source market signals. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "Daily-updated price guide for the Yu-Gi-Oh! Trading Card Game. Konami's 8-digit passcode is the global cross-language anchor; every printing across TCG and OCG regions resolves to one passcode. UK retail and trade-in prices from Cambridge TCG; catalog from YGOPRODeck.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from Yu-Gi-Oh!. All {{cardCount}} cards listed below, sorted by value. Each card's passcode links to all cross-printing siblings. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and updated daily. The Konami passcode anchors cross-language identity (Pattern B); YGOPRODeck provides the catalog (CC-BY). UK retail in GBP.",
    cardrush: { subdomain: "cardrush-ygo.jp", confirmed: false },
    display_priority: 6,
    accent: "purple",
  },
  {
    slug: "digimon",
    game_code: "dmw",
    display_name: "Digimon Card Game",
    short_name: "Digimon",
    seo_title: "Digimon Card Game Price Guide UK — Updated Daily",
    seo_description:
      "Daily-updated Digimon Card Game prices in the UK. Bandai's 2020+ revival. Every set, every card — retail buy and trade-in credit values. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "Daily-updated price guide for the Digimon Card Game — Bandai's modern revival. UK retail prices plus trade-in store credit. Cross-language siblings (JP and EN tracks share set codes, Pattern A) compose into one oracle per printing.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from the Digimon Card Game. All {{cardCount}} cards listed below, sorted by value. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and computed daily via our @cambridge-tcg/pricing engine. CardRush Digimon subdomain registered as anticipated; first confirmed scrape flips coverage.",
    cardrush: { subdomain: "cardrush-digimon.jp", confirmed: false },
    display_priority: 7,
    accent: "blue",
  },
  {
    slug: "lorcana",
    game_code: "lgr",
    display_name: "Disney Lorcana",
    short_name: "Lorcana",
    seo_title: "Disney Lorcana Price Guide UK — Updated Daily",
    seo_description:
      "Daily-updated Disney Lorcana TCG prices in the UK. Ravensburger's flagship card game. Every set, every card across EN/FR/DE. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "Daily-updated price guide for Disney Lorcana — Ravensburger's simultaneous global TCG. Three-language simultaneous release (EN/FR/DE) with matched numbering — cross-language siblings share an oracle (Pattern A). UK retail prices from the Cambridge TCG marketplace.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from Disney Lorcana. All {{cardCount}} cards listed below, sorted by value. EN/FR/DE printings collapse to one oracle. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and updated daily. Market signals from Cardmarket (EU, planned) and TCGplayer (US). UK retail in GBP.",
    cardrush: { subdomain: "cardrush-lorcana.jp", confirmed: false },
    display_priority: 8,
    accent: "purple",
  },
  {
    slug: "flesh-and-blood",
    game_code: "fab",
    display_name: "Flesh and Blood",
    short_name: "FaB",
    seo_title: "Flesh and Blood TCG Price Guide UK — Updated Daily",
    seo_description:
      "Daily-updated Flesh and Blood prices in the UK. LSS's premier competitive TCG. English-only catalog, complete coverage. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "Daily-updated price guide for Flesh and Blood — Legend Story Studios' premier competitive TCG. English-only catalog (Pattern D, single-language); cross-language siblings do not exist by construction. UK retail and trade-in prices from Cambridge TCG.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from Flesh and Blood. All {{cardCount}} cards listed below, sorted by value. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and updated daily. Market signals from TCGplayer (US) and Cardmarket (EU, planned). UK retail in GBP.",
    cardrush: { subdomain: "cardrush-fab.jp", confirmed: false },
    display_priority: 9,
    accent: "red",
  },
  {
    slug: "star-wars-unlimited",
    game_code: "swu",
    display_name: "Star Wars Unlimited",
    short_name: "Star Wars Unlimited",
    seo_title: "Star Wars Unlimited Price Guide UK — Updated Daily",
    seo_description:
      "Daily-updated Star Wars Unlimited prices in the UK. Fantasy Flight Games. Five-language simultaneous release (EN/FR/DE/ES/IT). Every set, every card. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "Daily-updated price guide for Star Wars Unlimited — Fantasy Flight's simultaneous global launch (EN/FR/DE/ES/IT). Matched numbering across languages (Pattern A); cross-language siblings share an oracle. UK retail prices from the Cambridge TCG marketplace.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from Star Wars Unlimited. All {{cardCount}} cards listed below. EN/FR/DE/ES/IT printings collapse to one oracle. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and updated daily. Catalog coverage anticipated (game code 'swu' is pre-registered; first ingest flips 'confirmed: true'). Market signals from TCGplayer and Cardmarket (planned).",
    cardrush: null,
    display_priority: 10,
    accent: "blue",
  },
  {
    slug: "vanguard",
    game_code: "vng",
    display_name: "Cardfight!! Vanguard",
    short_name: "Vanguard",
    seo_title: "Cardfight!! Vanguard Price Guide UK — Updated Daily",
    seo_description:
      "Daily-updated Cardfight!! Vanguard card prices in the UK. Bushiroad's flagship — Divinez-era boosters and special series. Retail buy and trade-in credit values. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "Daily-updated price guide for Cardfight!! Vanguard — Bushiroad's flagship card game, starting from the Divinez (DZ) era. Japanese printings first; UK retail prices plus trade-in store credit, sourced from the Cambridge TCG marketplace.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from Cardfight!! Vanguard. All {{cardCount}} cards listed below, sorted by value. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and computed daily from CardRush JP retail observations via our @cambridge-tcg/pricing engine. Coverage stood up 2026-07-09 starting with the DZ era; earlier eras follow as their set codes are confirmed.",
    cardrush: { subdomain: "cardrush-vanguard.jp", confirmed: false },
    display_priority: 11,
    accent: "blue",
  },
  {
    slug: "battle-spirits",
    game_code: "bsr",
    display_name: "Battle Spirits",
    short_name: "Battle Spirits",
    seo_title: "Battle Spirits Price Guide UK — Updated Daily",
    seo_description:
      "Daily-updated Battle Spirits card prices in the UK. Bandai's long-running JP game — Contract Saga eras and the 2026 renewal. Retail buy and trade-in credit values. Free price guide from Cambridge TCG.",
    hero_paragraph:
      "Daily-updated price guide for Battle Spirits — Bandai's long-running Japanese card game, covering the Contract Saga (契約編) eras and the 2026 renewal boosters. UK retail prices plus trade-in store credit, sourced from the Cambridge TCG marketplace.",
    set_intro_template:
      "Complete price list for {{setName}} ({{setCode}}) from Battle Spirits. All {{cardCount}} cards listed below, sorted by value. Prices in GBP, updated daily.",
    pricing_note:
      "Prices are sourced from the Cambridge TCG marketplace and computed daily from CardRush JP retail observations via our @cambridge-tcg/pricing engine. Coverage stood up 2026-07-09 from BS64 (Contract Saga) forward.",
    cardrush: { subdomain: "cardrush-bs.jp", confirmed: false },
    display_priority: 12,
    accent: "emerald",
  },
];

/** Resolve a curated config by URL slug; undefined when not curated. */
export function getPriceGuideConfig(
  slug: string,
): PriceGuideGameConfig | undefined {
  return PRICE_GUIDE_GAMES.find((g) => g.slug === slug);
}

/** All slugs we've curated. */
export function listPriceGuideSlugs(): string[] {
  return PRICE_GUIDE_GAMES.map((g) => g.slug);
}

/**
 * Synthesize a substrate-honest fallback config from a catalog game when
 * we haven't curated bespoke copy yet. Lets the /prices/[game] route
 * render any game `fetchGames()` returns without requiring per-game
 * editorial effort up front. Sister's landing surfaces every game in
 * the catalog; this is what their /prices/[game] page renders as.
 *
 * Substrate-honest about uncurated-ness: the page header doesn't claim
 * a CardRush subdomain or a confirmed coverage flag; the Provenance pill
 * names "wholesale" generically; the SEO copy is templated from the
 * game's display name.
 */
export function synthesizeConfigFromCatalog(opts: {
  slug: string;
  display_name: string;
  game_code: string;
}): PriceGuideGameConfig {
  const { slug, display_name, game_code } = opts;
  return {
    slug,
    game_code,
    display_name,
    short_name: display_name,
    seo_title: `${display_name} Price Guide UK — Updated Daily`,
    seo_description: `Daily-updated ${display_name} card prices in the UK — every set, every card. Retail buy prices and trade-in credit values from Cambridge TCG.`,
    hero_paragraph: `This is a daily-updated price guide for ${display_name} sets available in the UK. Each card lists a retail buy price and a trade-in store credit value. Prices are sourced from the Cambridge TCG marketplace. Use this guide to check card values, plan trades, or compare prices before buying or selling.`,
    set_intro_template: `Complete price list for {{setName}} ({{setCode}}) from ${display_name}. All {{cardCount}} cards are listed below, sorted by value. Prices are in GBP and updated daily from the Cambridge TCG marketplace.`,
    pricing_note: `Prices are sourced from the Cambridge TCG marketplace and updated daily. UK retail in GBP.`,
    cardrush: null,
    display_priority: 999,
    accent: "neutral",
  };
}

/** Tailwind classes per accent — keyed by the typed accent values. */
export const ACCENT_CLASSES: Record<
  PriceGuideGameConfig["accent"],
  { text: string; bg: string; border: string }
> = {
  blue: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  yellow: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  orange: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  purple: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  neutral: { text: "text-neutral-300", bg: "bg-neutral-800", border: "border-neutral-700" },
};
