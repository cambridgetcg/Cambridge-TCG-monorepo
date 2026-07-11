/**
 * Per-game configuration for the shared Bandai EN-cardlist skeleton.
 *
 * One Piece is implemented (DOM verified live 2026-07-11). The other
 * four ride the same fetch/parse core once their DOM is verified —
 * docs/EN-CARD-DATA.md §2 confirms all five share the Bandai cardlist
 * skeleton (server-rendered blocks, `.../card/{CARD_NO}.png|webp`
 * images, `_p1` parallel suffixes), but "same skeleton" is a claim
 * about the *family*, not a verified claim about each site's exact
 * selectors. Each stub's `notes` names what the first implementation
 * run must verify. Substrate honesty: `implemented: false` means
 * read() emits an actionable error and yields nothing.
 */

import type { BandaiEnGameConfig, BandaiEnGameKey } from "./types";

export const BANDAI_EN_GAMES: Record<BandaiEnGameKey, BandaiEnGameConfig> = {
  op: {
    game: "op",
    label: "One Piece Card Game (EN)",
    base_url: "https://en.onepiece-cardgame.com",
    series_url: (series_id) =>
      `https://en.onepiece-cardgame.com/cardlist/?series=${encodeURIComponent(series_id)}`,
    attribution: "©Eiichiro Oda/Shueisha, Toei Animation ©BANDAI CO., LTD.",
    implemented: true,
    notes:
      "Verified live 2026-07-11: no robots.txt (404); ?series=N renders every " +
      "card block server-side on one page (no pagination; OP-01 = 154 blocks " +
      "incl. parallels); ?series= (empty) renders the series <select> with " +
      "zero card blocks — used for discovery. Images 600×838 PNG under " +
      "/images/cardlist/card/{CARD_NO}[_pN].png with a cache-version query.",
  },
  dbf: {
    game: "dbf",
    label: "Dragon Ball Super Fusion World (EN)",
    base_url: "https://www.dbs-cardgame.com/fw/en",
    series_url: (series_id) =>
      `https://www.dbs-cardgame.com/fw/en/cardlist/?search=true&category=${encodeURIComponent(series_id)}`,
    attribution: "©BIRD STUDIO/SHUEISHA, TOEI ANIMATION ©BANDAI CO., LTD.",
    implemented: false,
    notes:
      "STUB — same Bandai skeleton per docs/EN-CARD-DATA.md §2 (600×838 WEBP). " +
      "First implementation run must verify: robots.txt, series-param name, " +
      "card-block selectors, and the exact cardlist URL shape.",
  },
  dmw: {
    game: "dmw",
    label: "Digimon Card Game (EN)",
    base_url: "https://world.digimoncard.com",
    series_url: (series_id) =>
      `https://world.digimoncard.com/cardlist/?search=true&category=${encodeURIComponent(series_id)}`,
    attribution: "©Akiyoshi Hongo, Toei Animation ©BANDAI CO., LTD.",
    implemented: false,
    notes:
      "STUB — docs/EN-CARD-DATA.md §2 routes Digimon *text* through the " +
      "digimoncard.io API and only the official PNGs through this scrape; " +
      "decide API-vs-scrape split before implementing. Verify robots.txt " +
      "and selectors on first run.",
  },
  una: {
    game: "una",
    label: "UNION ARENA (EN)",
    base_url: "https://apac.unionarena-tcg.com",
    series_url: (series_id) =>
      `https://apac.unionarena-tcg.com/cardlist/?search=true&series=${encodeURIComponent(series_id)}`,
    attribution: "©BANDAI CO., LTD.",
    implemented: false,
    notes:
      "STUB — official EN cardlist uses ?search=true&series=N per " +
      "docs/EN-CARD-DATA.md §2 (600×837 PNG). Base URL unverified (NA vs " +
      "APAC program split); per-title franchise copyright lines vary by " +
      "card — resolve attribution granularity before implementing.",
  },
  bsr: {
    game: "bsr",
    label: "Battle Spirits Saga (EN)",
    base_url: "https://www.battlespiritssaga.com",
    series_url: (series_id) =>
      `https://www.battlespiritssaga.com/cardlist/?search=true&category=${encodeURIComponent(series_id)}`,
    attribution: "©BANDAI CO., LTD.",
    implemented: false,
    notes:
      "STUB — same Bandai skeleton per docs/EN-CARD-DATA.md §2, which also " +
      "says: verify robots on first run. Base URL and selectors unverified.",
  },
};

/** Config lookup; total over BandaiEnGameKey so callers never null-check. */
export function bandaiEnConfig(game: BandaiEnGameKey): BandaiEnGameConfig {
  return BANDAI_EN_GAMES[game];
}
