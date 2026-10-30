/**
 * Shapes for the Japanese official sample-image lane (bandai-jp). The lane
 * reads image addresses and card identifiers from Bandai's Japanese card
 * lists, and nothing else: no rules text, stats, rulings or set rows.
 */

/** The two Japanese card lists the lane reads (Yu, 2026-10-30). */
export type BandaiJpGameKey = "op" | "dbf";

/** Per-game configuration. Every value was read from the 2026-10-30 captures. */
export interface BandaiJpGameConfig {
  game: BandaiJpGameKey;
  label: string;
  /** The one host the lane reads for this game: pages and images. */
  host: string;
  /** "modal-page" (One Piece) or "list-detail" (Fusion World), as bandai-en names them. */
  dom: "modal-page" | "list-detail";
  /** Series ids read by a full run, in order. A run never reads outside this list. */
  series: readonly string[];
  series_url: (series_id: string) => string;
  /** Image path prefix on `host`. */
  image_path: string;
  image_ext: "png" | "webp";
  /** The site footer's copyright lines, verbatim (full-width ／ and ・ kept). */
  credit: string;
  notes: string;
}

/** One card's image address, as one list page shows it. */
export interface BandaiJpImageBlock {
  game: BandaiJpGameKey;
  /** The publisher's own card id, e.g. "OP01-001_p2" or "FB10-001_p1". */
  card_id: string;
  /** "OP01-001", "FB10-001". */
  card_number: string;
  /** Bare suffix ("p2", "r1") or null for the base print. */
  suffix: string | null;
  /** The card name as the list shows it (an identifier, never rules text). */
  name: string;
  /** Absolute https image URL, with its cache query where the page has one. */
  image_url: string;
}

/** A block or ref the lane refused to read as an image, and why. */
export interface BandaiJpQuarantine {
  card_id: string;
  reason: string;
}

/** One list page, parsed: its blocks, or the drift that stopped it. */
export type BandaiJpParsedPage =
  | { kind: "ok"; blocks: BandaiJpImageBlock[]; quarantined: BandaiJpQuarantine[] }
  | { kind: "drift"; reason: string };

/** A card_images row candidate (drizzle 0116), before any upload. */
export interface BandaiJpImageRow {
  sku: string;
  lang: "ja";
  kind: "official_sample";
  source: "bandai-jp";
  source_url: string;
  attribution: string;
  license_note: string;
  retrieved_at: string;
}
