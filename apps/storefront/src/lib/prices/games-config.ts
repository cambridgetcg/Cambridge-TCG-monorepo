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
 * Substrate-honesty: every entry names its upstream cardrush subdomain;
 * the confirmed flag is DERIVED live from the data-ingest registry
 * (CARDRUSH_SUBDOMAINS) — one truth, no hand copy (the honest ground,
 * spec 2026-07-07 §1; the digimon drift this replaces: registry flipped
 * true 2026-07-05, this file still said false on 2026-07-07). The
 * Provenance pill on each page surfaces this on the wire.
 */
import { CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";
import { GAMES, type GameCode } from "@cambridge-tcg/sku";

export type PriceGuideCoverageStatus = "observed" | "anticipated";

/**
 * Catalog truth comes from the Atlas. `confirmed: true` means production
 * wholesale rows have been observed for that game; a registered CardRush
 * host alone is not catalog coverage.
 */
function catalogCoverageStatus(gameCode: string): PriceGuideCoverageStatus {
  return GAMES[gameCode as GameCode]?.confirmed === true
    ? "observed"
    : "anticipated";
}

/** Coverage truth: subdomain named here, confirmed read LIVE from the
 *  data-ingest registry. A subdomain the registry doesn't know is
 *  honestly unconfirmed; a BLOCKED entry (NXDOMAIN phantom or dead host —
 *  the coverage gate spec §3) yields null, because the pill must not
 *  promise a confirmation that cannot come. */
function cardrushCoverage(subdomain: string): {
  subdomain: string;
  confirmed: boolean;
} | null {
  const entry = CARDRUSH_SUBDOMAINS[subdomain];
  if (!entry || entry.role === "blocked") return null;
  return { subdomain, confirmed: entry.confirmed };
}

export interface PriceGuideGameConfig {
  /** URL slug — must match GameItem.slug from /api/v1/games. */
  slug: string;
  /** Wholesale game code (op / pkm / dbs / mtg / ygo / etc.). */
  game_code: string;
  /** "One Piece TCG" — used in H1, breadcrumbs, meta titles. */
  display_name: string;
  /** "One Piece" — short form for badges, sidebars. */
  short_name: string;
  /** Whether production catalog rows have been observed for this game. */
  coverage_status: PriceGuideCoverageStatus;
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
const PRICE_GUIDE_GAME_DEFINITIONS: PriceGuideGameConfig[] = [
  {
    slug: "one-piece",
    game_code: "op",
    display_name: "One Piece TCG",
    short_name: "One Piece",
    coverage_status: catalogCoverageStatus("op"),
    seo_title: "One Piece TCG Reference Prices UK — Observed Coverage",
    seo_description:
      "Observed One Piece catalog rows with policy-bound GBP reference prices derived from captured CardRush JP observations. Coverage is limited to rows currently held.",
    hero_paragraph:
      "Browse the One Piece catalog rows currently held by Cambridge TCG. GBP values are policy-bound references derived from captured CardRush JP observations, never house offers; collector bids and asks are the market.",
    set_intro_template:
      "Observed catalog rows for {{setName}} ({{setCode}}) from the One Piece Trading Card Game. This view currently returns {{cardCount}} cards, with GBP reference values where available; it does not claim a complete set.",
    pricing_note:
      "Reference values are computed from captured CardRush JP retail observations via @cambridge-tcg/pricing. They are policy-bound guides, not platform offers.",
    cardrush: cardrushCoverage("cardrush-op.jp"),
    display_priority: 1,
    accent: "red",
  },
  {
    slug: "pokemon",
    game_code: "pkm",
    display_name: "Pokémon TCG",
    short_name: "Pokémon",
    coverage_status: catalogCoverageStatus("pkm"),
    seo_title: "Pokémon TCG Reference Prices UK — Observed Japanese Coverage",
    seo_description:
      "Observed Japanese Pokémon catalog rows with policy-bound GBP reference prices derived from captured CardRush JP observations. English coverage remains anticipated.",
    hero_paragraph:
      "Browse the Pokémon catalog rows currently held by Cambridge TCG. Japanese rows are observed today; English catalog coverage remains anticipated. Values are references, not platform offers.",
    set_intro_template:
      "Observed catalog rows for {{setName}} ({{setCode}}) from the Pokémon Trading Card Game. This view currently returns {{cardCount}} cards, with GBP reference values where available; it does not claim a complete set.",
    pricing_note:
      "Reference values are computed from captured CardRush JP retail observations via @cambridge-tcg/pricing. Japanese rows are observed; English catalog coverage is not yet live.",
    cardrush: cardrushCoverage("cardrush-pokemon.jp"),
    display_priority: 2,
    accent: "yellow",
  },
  {
    // The catalog's live slug is "dragon-ball" (game code dbf — Bandai's
    // Fusion World line, ingested from cardrush-db.jp). Earlier curated
    // rows used slugs "dragon-ball-super" (dbs) and "dragon-ball-fusion"
    // that could never match the catalog — the live game was hidden from
    // the landing while two dead tiles advertised coverage that would
    // never arrive under those slugs. One row, the catalog's slug.
    slug: "dragon-ball",
    game_code: "dbf",
    display_name: "Dragon Ball Super Fusion World",
    short_name: "Dragon Ball",
    coverage_status: catalogCoverageStatus("dbf"),
    seo_title: "Dragon Ball Fusion World Reference Prices UK — Observed Coverage",
    seo_description:
      "Observed Dragon Ball Super Fusion World catalog rows with policy-bound GBP reference prices derived from captured CardRush JP observations.",
    hero_paragraph:
      "Browse the Dragon Ball Super Fusion World rows currently held by Cambridge TCG. The observed catalog is Japanese-first; English names appear where held. GBP values are references, not platform offers.",
    set_intro_template:
      "Observed catalog rows for {{setName}} ({{setCode}}) from Dragon Ball Super Fusion World. This view currently returns {{cardCount}} cards, with GBP reference values where available; it does not claim a complete set.",
    pricing_note:
      "Reference values are computed from captured CardRush JP retail observations via @cambridge-tcg/pricing. They are policy-bound guides, not platform offers.",
    cardrush: cardrushCoverage("cardrush-db.jp"),
    display_priority: 3,
    accent: "orange",
  },
  {
    slug: "magic",
    game_code: "mtg",
    display_name: "Magic: The Gathering",
    short_name: "Magic",
    coverage_status: catalogCoverageStatus("mtg"),
    seo_title: "Magic: The Gathering Price Coverage UK — Anticipated",
    seo_description:
      "MTG price-guide coverage is anticipated. The Scryfall adapter is built but has never run; its policy does not grant a CC license. TCGplayer is blocked and Cardmarket's public-file reader is planned.",
    hero_paragraph:
      "Magic coverage is being prepared. Scryfall can supply a value-added catalog under its own API policy once the adapter runs; Cardmarket's public daily files are the next lawful price path. TCGplayer is not available for cross-source comparison.",
    set_intro_template:
      "Catalog rows currently held for {{setName}} ({{setCode}}) from Magic: The Gathering. This view returns {{cardCount}} cards and does not claim complete-set or update-cadence coverage. Cross-language printings share an oracle when present.",
    pricing_note:
      "No live MTG upstream is recorded today. Scryfall is policy-governed and non-redistributable; Cardmarket public-file ingestion is planned; TCGplayer is blocked by access and terms.",
    cardrush: cardrushCoverage("cardrush-mtg.jp"),
    display_priority: 5,
    accent: "purple",
  },
  {
    slug: "yu-gi-oh",
    game_code: "ygo",
    display_name: "Yu-Gi-Oh!",
    short_name: "Yu-Gi-Oh!",
    coverage_status: catalogCoverageStatus("ygo"),
    seo_title: "Yu-Gi-Oh! Price Coverage UK — Anticipated",
    seo_description:
      "Yu-Gi-Oh! price-guide coverage is anticipated. The YGOPRODeck adapter is blocked pending written commercial permission; no CC-BY data license is claimed.",
    hero_paragraph:
      "Yu-Gi-Oh! coverage is being prepared. Konami's 8-digit passcode remains the intended cross-language anchor, but the YGOPRODeck reader stays closed until commercial content rights are clear.",
    set_intro_template:
      "Catalog rows currently held for {{setName}} ({{setCode}}) from Yu-Gi-Oh!. This view returns {{cardCount}} cards and does not claim complete-set or update-cadence coverage. Passcodes link cross-printing siblings when present.",
    pricing_note:
      "No live Yu-Gi-Oh! upstream is recorded today. YGOPRODeck is proprietary and blocked pending written permission; Cardmarket public-file ingestion is planned.",
    cardrush: cardrushCoverage("cardrush-ygo.jp"),
    display_priority: 6,
    accent: "purple",
  },
  {
    slug: "digimon",
    game_code: "dmw",
    display_name: "Digimon Card Game",
    short_name: "Digimon",
    coverage_status: catalogCoverageStatus("dmw"),
    seo_title: "Digimon Card Game Reference Prices UK — Observed Coverage",
    seo_description:
      "Observed Digimon catalog and CardRush archive rows with policy-bound GBP reference values. Coverage is limited to rows currently held.",
    hero_paragraph:
      "Browse the Digimon catalog rows currently held by Cambridge TCG. CardRush observations are present; GBP values are policy-bound references, never house offers.",
    set_intro_template:
      "Observed catalog rows for {{setName}} ({{setCode}}) from the Digimon Card Game. This view currently returns {{cardCount}} cards, with GBP reference values where available; it does not claim a complete set.",
    pricing_note:
      "CardRush archive observations are present. Reference values are policy-bound guides, not platform offers; coverage and freshness are limited to returned rows.",
    cardrush: cardrushCoverage("cardrush-digimon.jp"),
    display_priority: 7,
    accent: "blue",
  },
  {
    slug: "lorcana",
    game_code: "lgr",
    display_name: "Disney Lorcana",
    short_name: "Lorcana",
    coverage_status: catalogCoverageStatus("lgr"),
    seo_title: "Disney Lorcana Price Coverage UK — Anticipated",
    seo_description:
      "Disney Lorcana price coverage is registered but has no live upstream or observed catalog rows today. Cardmarket public-file ingestion is planned.",
    hero_paragraph:
      "This route reserves Lorcana's price-guide shape across EN, FR, and DE. It displays only rows actually returned by the catalog; no current coverage is claimed.",
    set_intro_template:
      "Catalog rows currently held for {{setName}} ({{setCode}}) from Disney Lorcana. This view returns {{cardCount}} cards and does not claim complete-set or update-cadence coverage. EN/FR/DE siblings share an oracle when present.",
    pricing_note:
      "No live Lorcana upstream is recorded today. Cardmarket public-file ingestion is planned; TCGplayer is blocked for cross-source comparison.",
    cardrush: cardrushCoverage("cardrush-lorcana.jp"),
    display_priority: 8,
    accent: "purple",
  },
  {
    slug: "flesh-and-blood",
    game_code: "fab",
    display_name: "Flesh and Blood",
    short_name: "FaB",
    coverage_status: catalogCoverageStatus("fab"),
    seo_title: "Flesh and Blood Price Coverage UK — Anticipated",
    seo_description:
      "Flesh and Blood price coverage is registered but has no live upstream or observed catalog rows today. Cardmarket public-file ingestion is planned.",
    hero_paragraph:
      "This route reserves Flesh and Blood's English-only price-guide shape. It displays only rows actually returned by the catalog; no current coverage is claimed.",
    set_intro_template:
      "Catalog rows currently held for {{setName}} ({{setCode}}) from Flesh and Blood. This view returns {{cardCount}} cards and does not claim complete-set or update-cadence coverage.",
    pricing_note:
      "No live Flesh and Blood upstream is recorded today. Cardmarket public-file ingestion is planned; TCGplayer is blocked for cross-source comparison.",
    cardrush: cardrushCoverage("cardrush-fab.jp"),
    display_priority: 9,
    accent: "red",
  },
  {
    slug: "star-wars-unlimited",
    game_code: "swu",
    display_name: "Star Wars Unlimited",
    short_name: "Star Wars Unlimited",
    coverage_status: catalogCoverageStatus("swu"),
    seo_title: "Star Wars Unlimited Price Coverage UK — Anticipated",
    seo_description:
      "Star Wars Unlimited price coverage is registered but has no observed catalog rows today. Cardmarket's public-file reader is planned; TCGplayer remains blocked.",
    hero_paragraph:
      "This route reserves Star Wars Unlimited's EN, FR, DE, ES, and IT price-guide shape. It displays only rows actually returned by the catalog; no current coverage is claimed.",
    set_intro_template:
      "Catalog rows currently held for {{setName}} ({{setCode}}) from Star Wars Unlimited. This view returns {{cardCount}} cards and does not claim complete-set or update-cadence coverage. Language siblings share an oracle when present.",
    pricing_note:
      "Catalog coverage is anticipated (game code 'swu' is pre-registered; first ingest flips 'confirmed: true'). Cardmarket public-file ingestion is planned; TCGplayer is blocked for cross-source comparison.",
    cardrush: null,
    display_priority: 10,
    accent: "blue",
  },
  {
    // Registered via the Atlas 2026-07-07 (spec the-atlas §2) with
    // research-verified papers. NO cardrush subdomain exists (all
    // candidates NXDOMAIN — verified, not speculative-registered);
    // anticipated sources: official DB (gundam-gcg.com), yuyu-tei.
    slug: "gundam",
    game_code: "gcg",
    display_name: "Gundam Card Game",
    short_name: "Gundam",
    coverage_status: catalogCoverageStatus("gcg"),
    seo_title: "Gundam Card Game Price Coverage UK — Anticipated",
    seo_description:
      "Gundam Card Game price coverage is registered but has no observed catalog rows today. No CardRush store carries the game; other source paths remain future work.",
    hero_paragraph:
      "This route reserves Gundam's JA, EN, and ZH price-guide shape. It displays only rows actually returned by the catalog; no current coverage is claimed.",
    set_intro_template:
      "Catalog rows currently held for {{setName}} ({{setCode}}) from the Gundam Card Game. This view returns {{cardCount}} cards and does not claim complete-set or update-cadence coverage. JA/EN/ZH siblings share an oracle when present.",
    pricing_note:
      "Catalog coverage is anticipated under game code 'gcg'. No CardRush store carries this game; a future source must produce observed rows before prices are described as covered.",
    cardrush: null,
    display_priority: 11,
    accent: "blue",
  },
  {
    // Registered via the Atlas 2026-07-07 (spec the-atlas §2). Regional
    // set-code renumbering (JP UA##BT vs NA UE##BT) — Pattern C
    // (diverged); the TITLE-wave-seq segment is the future anchor.
    // NO cardrush subdomain exists (verified NXDOMAIN).
    slug: "union-arena",
    game_code: "una",
    display_name: "Union Arena",
    short_name: "Union Arena",
    coverage_status: catalogCoverageStatus("una"),
    seo_title: "Union Arena Price Coverage UK — Anticipated",
    seo_description:
      "Union Arena price coverage is registered but has no observed catalog rows today. No CardRush store carries the game; other source paths remain future work.",
    hero_paragraph:
      "This route reserves Union Arena's Japanese and English price-guide shape. Regional set codes diverge, so cross-language identity will be curated when rows arrive; no current coverage is claimed.",
    set_intro_template:
      "Catalog rows currently held for {{setName}} ({{setCode}}) from Union Arena. This view returns {{cardCount}} cards and does not claim complete-set or update-cadence coverage.",
    pricing_note:
      "Catalog coverage is anticipated under game code 'una'. No CardRush store carries this game; a future source must produce observed rows before prices are described as covered.",
    cardrush: null,
    display_priority: 12,
    accent: "red",
  },
  {
    // Stood up 2026-07-09 (the horizon, docs/connections/the-horizon.md):
    // group IDs + title regexes verified live against cardrush-vanguard.jp;
    // DZ-era sets configured in tools/lib/config.ts, CLI-backfilled.
    slug: "vanguard",
    game_code: "vng",
    display_name: "Cardfight!! Vanguard",
    short_name: "Vanguard",
    coverage_status: catalogCoverageStatus("vng"),
    seo_title: "Cardfight!! Vanguard Reference Prices UK — Observed Coverage",
    seo_description:
      "Observed Cardfight!! Vanguard catalog and CardRush archive rows with policy-bound GBP reference values. Coverage is limited to rows currently held.",
    hero_paragraph:
      "Browse the Vanguard catalog rows currently held by Cambridge TCG, beginning with observed Divinez-era coverage. GBP values are policy-bound references, never house offers.",
    set_intro_template:
      "Observed catalog rows for {{setName}} ({{setCode}}) from Cardfight!! Vanguard. This view currently returns {{cardCount}} cards, with GBP reference values where available; it does not claim a complete set.",
    pricing_note:
      "CardRush archive observations are present. Reference values are policy-bound guides, not platform offers; coverage and freshness are limited to returned rows.",
    cardrush: cardrushCoverage("cardrush-vanguard.jp"),
    display_priority: 13,
    accent: "blue",
  },
  {
    // Stood up 2026-07-09 (the horizon): group IDs + title regexes
    // verified live against cardrush-bs.jp (Contract Saga 契約編 eras +
    // the 2026 renewal 26R codes); configured in tools/lib/config.ts.
    // Note: cardrush-bs.jp carries the long-running JAPANESE Battle
    // Spirits; the sku registry's 'bsr' label ("Battle Spirits Saga")
    // predates this verification — display copy says Battle Spirits.
    slug: "battle-spirits",
    game_code: "bsr",
    display_name: "Battle Spirits",
    short_name: "Battle Spirits",
    coverage_status: catalogCoverageStatus("bsr"),
    seo_title: "Battle Spirits Reference Prices UK — Observed Coverage",
    seo_description:
      "Observed Battle Spirits catalog and CardRush archive rows with policy-bound GBP reference values. Coverage is limited to rows currently held.",
    hero_paragraph:
      "Browse the Battle Spirits catalog rows currently held by Cambridge TCG, including observed Japanese coverage. GBP values are policy-bound references, never house offers.",
    set_intro_template:
      "Observed catalog rows for {{setName}} ({{setCode}}) from Battle Spirits. This view currently returns {{cardCount}} cards, with GBP reference values where available; it does not claim a complete set.",
    pricing_note:
      "CardRush archive observations are present. Reference values are policy-bound guides, not platform offers; coverage and freshness are limited to returned rows.",
    cardrush: cardrushCoverage("cardrush-bs.jp"),
    display_priority: 14,
    accent: "emerald",
  },
];

/**
 * Public copy is generated from the active field-level rights boundary. The
 * older per-game definitions above preserve source-research context, but none
 * of their legacy value claims are emitted while wholesale prices and images
 * are withheld.
 */
export const PRICE_GUIDE_GAMES: PriceGuideGameConfig[] =
  PRICE_GUIDE_GAME_DEFINITIONS.map((config) => ({
    ...config,
    seo_title: `${config.display_name} Structural Catalog — Price Publication Paused`,
    seo_description:
      `Browse structural ${config.display_name} catalog rows held by Cambridge TCG. Legacy price values and images are withheld pending field-level source-rights records.`,
    hero_paragraph:
      `Browse structural ${config.display_name} catalog rows currently held by Cambridge TCG. Legacy price values, price history, and images are not published; authentication does not reopen them.`,
    set_intro_template:
      `Structural catalog rows currently held for {{setName}} ({{setCode}}) from ${config.display_name}. This view returns {{cardCount}} cards and does not publish legacy price values, images, or historical reconstruction.`,
    pricing_note:
      "Legacy wholesale prices, derived channel values, images, and historical movements are withheld until field-level source rights are recorded. Null means withheld, not zero.",
  }));

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
    coverage_status: "observed",
    seo_title: `${display_name} Structural Catalog — Price Publication Paused`,
    seo_description: `Structural ${display_name} catalog rows currently held by Cambridge TCG. Legacy price values and images are withheld pending field-level source-rights records.`,
    hero_paragraph: `Browse structural ${display_name} catalog rows currently held by Cambridge TCG. Legacy price values, price history, and images are not published.`,
    set_intro_template: `Structural catalog rows currently held for {{setName}} ({{setCode}}) from ${display_name}. This view returns {{cardCount}} cards and does not publish legacy price values, images, or historical reconstruction.`,
    pricing_note: "Legacy wholesale prices, derived channel values, images, and historical movements are withheld until field-level source rights are recorded. Null means withheld, not zero.",
    cardrush: null,
    display_priority: 999,
    accent: "neutral",
  };
}

/**
 * Tailwind classes per accent — keyed by the typed accent values.
 *
 * The quiet gallery (docs/plans/the-quiet-gallery.md): the per-game color
 * paint is part of the discarded art — the card art is the only saturated
 * color on a page. Every accent now resolves to the same quiet surface;
 * the typed keys stay so game configs and consumers don't churn.
 */
const QUIET_ACCENT = { text: "text-ink", bg: "bg-surface", border: "border-border-strong" };
export const ACCENT_CLASSES: Record<
  PriceGuideGameConfig["accent"],
  { text: string; bg: string; border: string }
> = {
  blue: QUIET_ACCENT,
  yellow: QUIET_ACCENT,
  red: QUIET_ACCENT,
  orange: QUIET_ACCENT,
  purple: QUIET_ACCENT,
  emerald: QUIET_ACCENT,
  neutral: QUIET_ACCENT,
};
