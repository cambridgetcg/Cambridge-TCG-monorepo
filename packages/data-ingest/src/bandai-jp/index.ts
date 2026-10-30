/**
 * bandai-jp — Japanese official sample images (One Piece, Fusion World).
 *
 * Yu chose on 2026-10-30 to self-host these as the English ones are
 * ("Self-host like English"; docs/decisions/2026-10-30-japanese-official-images.md).
 * Both Japanese footers refuse reproduction without permission; Cambridge
 * records Yu's decision, not Bandai's permission.
 *
 * This module is a registry entry and a pure normalizer, never a reader:
 * `read()` emits one error and yields nothing, and there is no cron. The
 * manual tool apps/storefront/scripts/ingest-official-ja.mjs reads the
 * lists, and only when a person runs it with Yu's word for that run; it
 * defaults to counting. Only image addresses and identifiers are read.
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { BandaiJpImageBlock, BandaiJpImageRow } from "./types";
import { normalizeBandaiJpImage } from "./keys";

export { BANDAI_JP_GAMES, BANDAI_JP_POLICY, BANDAI_JP_USER_AGENT, OFFICIAL_MEDIA_ROBOTS_PRODUCT } from "./config";
export { bandaiJpImageKey, bandaiJpObjectKey, normalizeBandaiJpImage, CARD_NUMBER_RE } from "./keys";
export { parseBandaiJpPage, parseFusionWorldJpImages, parseOnePieceJpImages } from "./parse";
export type * from "./types";

export const bandaiJp: SourceModule<BandaiJpImageBlock & { retrieved_at: string }, BandaiJpImageRow> = {
  meta: {
    id: "bandai-jp",
    name: "Bandai JP official sample images",
    description:
      "Image addresses of official Japanese sample images from Bandai's One Piece and Fusion World card lists, for self-hosting with credit under Yu's decision of 2026-10-30. A manual tool only: no cron and no live reader.",
    upstream: "https://www.onepiece-cardgame.com",
    catalog_section: "the-tributaries.md#312-bandai-jp-official-sample-images",
    access: "scrape",
    license: "proprietary",
    redistribute: false,
    freshness: "catalog",
    canonical_effort: "low",
    status: "blocked",
    games: ["op", "dbf"],
    tos_notes:
      "Footers, read 2026-10-30: www.onepiece-cardgame.com 「このwebサイトに記載されているすべての画像・テキスト・データの無断転用、転載をお断りします。」; www.dbs-cardgame.com/fw/jp 「※当サイトに掲載されている画像、文章、データ等の無断使用・複製・転載を禁じます。」 Both refuse reproduction without permission, and no Bandai permission is recorded. Yu decided on 2026-10-30 to self-host these images with credit and takedown, under his 2026-07-13 rationale for English (docs/decisions/2026-10-30-japanese-official-images.md). robots.txt answered 404 on both hosts; the tool reads it every run, as User-Agent CambridgeTCG-official-media/1.0 naming that decision, at least 2 s apart per host. Reading the lists and the S3 upload each need Yu's word for that run. Display on Cambridge pages, the universal card API (image_same_language) and the JSON behind the market pages; never in exports, the member API or /api/v1/market/*.",
    rate_limit: { rps: 0.5, burst: 1 },
    welcome:
      "Bandai, your Japanese card lists show each card's official sample image. " +
      "Under our owner's decision we keep a credited copy of a card's base image on our own host, " +
      "so a Japanese card on our pages can be identified by your official Japanese sample image, beside your copyright line, " +
      "labelled as not verified against the printed card. " +
      "We read your lists slowly, under our own name, honour your robots.txt, " +
      "and take an image down on request.",
  },

  async *read(ctx: IngestContext): AsyncIterable<RawRow<BandaiJpImageBlock & { retrieved_at: string }>> {
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "bandai-jp",
      kind: "error",
      detail: {
        reason: "bandai-jp has no live reader: the Japanese lists are read only by a manual tool, run with Yu's word.",
        action: "See docs/decisions/2026-10-30-japanese-official-images.md.",
      },
    });
    return;
  },

  normalize: normalizeBandaiJpImage,
};
