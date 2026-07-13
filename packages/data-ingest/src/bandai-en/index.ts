/**
 * bandai-en — internal parser for Bandai's English cardlist pages.
 *
 * One Piece ("modal-page") and DBS Fusion World ("list-detail") have
 * fixture-backed parsers. Digimon, Union Arena, and Battle Spirits Saga are
 * unverified configuration sketches. The production ingest route is paused.
 *
 * The parser can recognize official English names, effect text, and publisher
 * image references. Parser capability is not a publication grant.
 *
 * Card data and images are publisher-owned. Cambridge has no recorded written
 * permission covering collection into the service or public display.
 * `redistribute: false` therefore means no parsed field may reach a public
 * response. Attribution records provenance; it does not grant permission.
 *
 * A conservative rate limit remains documented for any future permitted
 * reader. The production route does not invoke it. A missing robots rule is
 * not permission to fetch or publish.
 *
 * See `docs/connections/the-tributaries.md` (bandai-en row; the mobile
 * app-only `bandai-tcg` slot is a different, still-blocked upstream).
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { CanonicalCard } from "../canonical";
import type { BandaiEnCard, BandaiEnGameKey } from "./types";
import { normalizeBandaiEn } from "./normalize";

/** Reserved identifying User-Agent if a future permission allows live reads. */
export const BANDAI_EN_USER_AGENT =
  "cambridgetcg-ingest/1.0 (contact: via cambridgetcg.com/contact)";

export interface BandaiEnReadOptions {
  /** Reserved game selector for a future permitted reader. */
  game?: BandaiEnGameKey;
  /** Explicit series ids reserved for a future permitted reader. */
  series?: string[];
  /** Future cap on series pages for bounded smoke runs or backfills. */
  max_series?: number;
  /** Future cap on yielded cards for bounded smoke runs or backfills. */
  max_cards?: number;
}

export type BandaiEnContext = IngestContext & { bandai_en?: BandaiEnReadOptions };

export const bandaiEn: SourceModule<BandaiEnCard, CanonicalCard> = {
  meta: {
    id: "bandai-en",
    name: "Bandai EN cardlists",
    description:
      "Internal parser for proprietary Bandai English cardlist fields. One Piece and DBS Fusion World fixture parsing is implemented; production ingest and all public publication are paused pending documented permission.",
    upstream: "https://en.onepiece-cardgame.com",
    catalog_section: "the-tributaries.md#bandai-en-official-english-cardlists",
    access: "scrape",
    license: "proprietary",
    redistribute: false,
    freshness: "catalog",
    canonical_effort: "medium",
    status: "blocked",
    games: ["op", "dbf", "dmw", "una", "bsr"],
    tos_notes:
      "Bandai content is proprietary and redistribution is false. No written Cambridge permission is recorded for collection, storage, display, hotlinking, mirroring, or redistribution. Missing robots rules observed for One Piece on 2026-07-11 and DBS Fusion World on 2026-07-13 are not permission. The planned Cambridge image bucket does not exist. Production ingest and public readers are paused; parser tests use local fixtures. Policy: docs/EN-CARD-DATA.md.",
    rate_limit: { rps: 0.5, burst: 1 },
    welcome:
      "Bandai EN cardlists are represented by internal, fixture-tested parsers. " +
      "The content remains Bandai and franchise-rightsholder property: Cambridge " +
      "records no permission to collect or publish it, so the production ingest " +
      "route and public reader are paused. Migration 0116 remains as an applied " +
      "storage record, but storage and attribution do not create publication rights.",
  },

  async *read(ctx: BandaiEnContext): AsyncIterable<RawRow<BandaiEnCard>> {
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "bandai-en",
      kind: "error",
      detail: {
        reason:
          "Bandai EN reading is paused because Cambridge has no documented source permission.",
        action:
          "Record written permission and a reviewed collection/publication rule before enabling any live reader.",
      },
    });
    return;
  },

  normalize: normalizeBandaiEn,
};
