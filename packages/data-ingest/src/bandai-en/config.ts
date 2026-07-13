/**
 * Per-game configuration for the shared Bandai EN-cardlist skeleton.
 *
 * One Piece is implemented (DOM verified live 2026-07-11; "modal-page"
 * family) and DBS Fusion World is implemented (verified 2026-07-13;
 * "list-detail" family — the verification that split the skeleton into
 * two DOM families, see parse.ts). The other three ride the same
 * fetch/parse core once their DOM is verified — docs/EN-CARD-DATA.md
 * §2 confirms all five share the Bandai cardlist *family*
 * (server-rendered pages, `.../card/{CARD_NO}.png|webp` images, `_p1`
 * parallel suffixes), but dbf proved "same family" does not mean "same
 * selectors": each stub's `notes` names what its first implementation
 * run must verify, and its `dom` value is the *presumed* family.
 * Substrate honesty: `implemented: false` means read() emits an
 * actionable error and yields nothing.
 */

import type { BandaiEnGameConfig, BandaiEnGameKey } from "./types";

export const BANDAI_EN_GAMES: Record<BandaiEnGameKey, BandaiEnGameConfig> = {
  op: {
    game: "op",
    label: "One Piece Card Game (EN)",
    base_url: "https://en.onepiece-cardgame.com",
    dom: "modal-page",
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
    dom: "list-detail",
    series_url: (series_id) =>
      `https://www.dbs-cardgame.com/fw/en/cardlist/?search=true&category%5B%5D=${encodeURIComponent(series_id)}`,
    detail_url: (card_no, p) =>
      `https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=${encodeURIComponent(card_no)}` +
      (p ? `&p=${encodeURIComponent(p)}` : ""),
    // Verbatim the site footer's three copyright lines (top to bottom),
    // fetched 2026-07-13 — the footer credits Bandai Namco Entertainment
    // Inc., not "BANDAI CO., LTD.", so we carry their exact lines.
    attribution:
      "©BIRD STUDIO/SHUEISHA ©BIRD STUDIO/SHUEISHA, TOEI ANIMATION ©Bandai Namco Entertainment Inc.",
    implemented: true,
    notes:
      "Verified live 2026-07-13: no robots.txt (404 on www.dbs-cardgame.com). " +
      "NOT the op modal DOM — 'list-detail' family: ?search=true&category[]=N " +
      "renders every cardItem thumbnail server-side on one page (pager is a " +
      "client-side JS shell; FB10 = 162 items, FB01 = 163, incl. parallels), " +
      "each linking to detail.php?card_no=FBnn-nnn[&p=_pN] where the card " +
      "data lives (server-rendered, ~10 KB). category[]= (empty) renders the " +
      "series data-val dropdown with zero items — used for discovery. Images " +
      "WEBP under /fw/images/cards/card/en/{CARD_NO}[_f|_b][_pN].webp — " +
      "_f/_b front/back on double-faced leaders only, parallel tail last. " +
      "No flavor text in the DOM; Q&A rulings block never captured. Footer " +
      "copyright lines captured verbatim into `attribution`. Full-series " +
      "cost: 1 list + ~160 detail fetches ≈ 5.5 min at 1 req/2s.",
  },
  dmw: {
    game: "dmw",
    label: "Digimon Card Game (EN)",
    base_url: "https://world.digimoncard.com",
    dom: "modal-page", // presumed — unverified, see notes
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
    dom: "modal-page", // presumed — unverified, see notes
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
    dom: "modal-page", // presumed — unverified, see notes
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
