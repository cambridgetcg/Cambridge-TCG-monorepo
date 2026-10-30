/**
 * Configuration for the Japanese official sample-image lane.
 *
 * Yu chose, on 2026-10-30, to self-host Japanese official sample images as
 * the English ones are: copied to Cambridge's own bucket with credit and
 * takedown (docs/decisions/2026-10-30-japanese-official-images.md). Reading
 * these lists and uploading are two separate outward acts, each needing Yu's
 * word for that act. Nothing here runs either; the manual tools
 * (apps/storefront/scripts/ingest-official-ja.mjs and
 * upload-official-images.mjs) do, and only when a person runs them.
 *
 * Hosts, paths, series ids and credit lines were read from the 2026-10-30
 * captures of OP-01 (?series=550101) and FB10 (category 584010). Both hosts
 * answered robots.txt with 404, which sets no rule; the tools read it again
 * every run.
 */

import type { BandaiJpGameConfig, BandaiJpGameKey } from "./types";

/** The recorded display decision this lane runs under. */
export const BANDAI_JP_POLICY = "cambridge.official-ja-media/2026-10-30";

/** Every request this lane makes says who it is, how to reach us and the
 * decision it runs under. */
export const BANDAI_JP_USER_AGENT =
  "CambridgeTCG-official-media/1.0 (+https://cambridgetcg.com/legal/card-images; contact@cambridgetcg.com; permission cambridge.official-ja-media/2026-10-30)";

/** The User-Agent's product token (RFC 9309), as robots.txt groups name it (lower case). */
export const OFFICIAL_MEDIA_ROBOTS_PRODUCT = "cambridgetcg-official-media";

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(2, "0")}`);

export const BANDAI_JP_GAMES: Record<BandaiJpGameKey, BandaiJpGameConfig> = {
  op: {
    game: "op",
    label: "One Piece Card Game (JP)",
    host: "www.onepiece-cardgame.com",
    dom: "modal-page",
    // Boosters 5501NN (OP-01 … OP-17), extra boosters 5502NN, premium
    // boosters 5503NN, as the 2026-10-30 series <select> listed them.
    series: [...range("5501", 1, 17), ...range("5502", 1, 5), ...range("5503", 1, 2)],
    series_url: (series_id) =>
      `https://www.onepiece-cardgame.com/cardlist/?series=${encodeURIComponent(series_id)}`,
    image_path: "/images/cardlist/card/",
    image_ext: "png",
    credit: "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション",
    notes:
      "Captured 2026-10-30: ?series=550101 rendered 154 blocks (33 parallels, no _r ids) on one page, " +
      "each block id equal to its image's basename. Images /images/cardlist/card/{CARD_NO}[_pN].png?<cache>. " +
      "JP and EN parallel numbers differ (on OP01-001, -013 and -016 JP lists _p2 where EN lists _p1; whether they show the same art is unchecked), so only base prints are collected.",
  },
  dbf: {
    game: "dbf",
    label: "Dragon Ball Super Fusion World (JP)",
    host: "www.dbs-cardgame.com",
    dom: "list-detail",
    // 5840NN (FB01 … FB11), 5841NN, 5842NN, 5843NN and 584901, as the
    // 2026-10-30 category dropdown listed them.
    series: [...range("5840", 1, 11), ...range("5841", 1, 12), ...range("5842", 1, 2), "584301", "584901"],
    series_url: (series_id) =>
      `https://www.dbs-cardgame.com/fw/jp/cardlist/?search=true&category%5B%5D=${encodeURIComponent(series_id)}`,
    image_path: "/fw/images/cards/card/jp/",
    image_ext: "webp",
    credit: "©バード・スタジオ／集英社 ©バード・スタジオ／集英社・東映アニメーション ©Bandai Namco Entertainment Inc.",
    notes:
      "Captured 2026-10-30: category 584010 (FB10) listed 162 items (39 parallels) and said so in its result count. " +
      "Images /fw/images/cards/card/jp/{CARD_NO}[_f][_pN].webp; the JP and EN FB10 file sets are identical. " +
      "Detail pages are never read. A category with no items (an English id, or an empty series) renders no result count.",
  },
};
