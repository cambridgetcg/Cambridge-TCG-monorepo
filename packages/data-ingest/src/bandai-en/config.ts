/**
 * Per-game configuration for the shared Bandai EN-cardlist skeleton.
 *
 * One Piece and DBS Fusion World have local fixtures for the two observed DOM
 * families. The other three entries are unverified configuration sketches.
 * `implemented` means the offline parser shape is fixture-backed; it does not
 * permit or enable a live reader. The SourceModule read path is blocked for
 * every game until Cambridge records written collection permission.
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
      "Observed once on 2026-07-11 and retained as a local fixture: ?series=N rendered every " +
      "card block server-side on one page (no pagination; OP-01 = 154 blocks " +
      "incl. parallels); ?series= (empty) renders the series <select> with " +
      "zero card blocks — used for discovery. Images 600×838 PNG under " +
      "/images/cardlist/card/{CARD_NO}[_pN].png with a cache-version query. " +
      "No live fetch is allowed without written permission.",
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
      "cost would be 1 list + ~160 detail fetches at 1 req/2s. Retained as " +
      "local fixtures; no live fetch is allowed without written permission.",
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
      "STUB — the source split, URL, and selectors are unverified. Resolve " +
      "field-level permissions before choosing any API or publisher-site path.",
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
      "STUB — base URL and selectors are unverified (NA vs APAC program " +
      "split); per-title franchise copyright lines vary by card. Resolve " +
      "permission and attribution scope before implementing.",
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
      "STUB — base URL and selectors are unverified. Written permission must " +
      "exist before any live verification or reader is enabled.",
  },
};

/** Config lookup; total over BandaiEnGameKey so callers never null-check. */
export function bandaiEnConfig(game: BandaiEnGameKey): BandaiEnGameConfig {
  return BANDAI_EN_GAMES[game];
}
