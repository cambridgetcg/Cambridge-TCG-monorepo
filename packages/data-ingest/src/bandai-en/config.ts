/**
 * Per-game configuration for the shared Bandai EN-cardlist skeleton.
 *
 * One Piece has a fixture captured from a DOM shape observed on 2026-07-11.
 * The other four are unverified configuration sketches. `implemented` means
 * the offline parser shape is represented; it does not mean a live reader is
 * permitted or enabled. The SourceModule read path is blocked for every game
 * until Cambridge records written collection permission.
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
    series_url: (series_id) =>
      `https://www.dbs-cardgame.com/fw/en/cardlist/?search=true&category=${encodeURIComponent(series_id)}`,
    attribution: "©BIRD STUDIO/SHUEISHA, TOEI ANIMATION ©BANDAI CO., LTD.",
    implemented: false,
    notes:
      "STUB — the exact URL and selectors are unverified. If written collection " +
      "permission is obtained, verify the series parameter, card blocks, and " +
      "image shape before changing this configuration.",
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
      "STUB — the source split, URL, and selectors are unverified. Resolve " +
      "field-level permissions before choosing any API or publisher-site path.",
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
      "STUB — base URL and selectors are unverified (NA vs APAC program " +
      "split); per-title franchise copyright lines vary by card. Resolve " +
      "permission and attribution scope before implementing.",
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
      "STUB — base URL and selectors are unverified. Written permission must " +
      "exist before any live verification or reader is enabled.",
  },
};

/** Config lookup; total over BandaiEnGameKey so callers never null-check. */
export function bandaiEnConfig(game: BandaiEnGameKey): BandaiEnGameConfig {
  return BANDAI_EN_GAMES[game];
}
