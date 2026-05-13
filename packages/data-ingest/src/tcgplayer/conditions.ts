/**
 * TCGplayer condition label → Cambridge condition map.
 *
 * TCGplayer's API returns condition as a human-readable string ("Near Mint",
 * "Lightly Played", ...) per `skuId`. Cambridge's open vocabulary is short
 * lower-case codes (nm / lp / mp / hp / damaged / sealed / unspecified) so
 * cross-source comparison is trivial.
 *
 * **Substrate-honest mapping:** an unmapped condition (TCGplayer adds a new
 * tier, or a sealed-product category uses a different label) quarantines the
 * row with an actionable reason naming what to add here.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN) §4.1.
 */

/** Cambridge condition vocabulary. */
export type CambridgeCondition =
  | "nm"
  | "lp"
  | "mp"
  | "hp"
  | "damaged"
  | "sealed"
  | "unspecified";

/**
 * TCGplayer's documented condition labels mapped to Cambridge codes.
 *
 * Notes on the mapping:
 *   - "Near Mint" + "Mint" both → 'nm'. (TCGplayer rarely uses "Mint" outside
 *     graded; we treat both as the same tier for ungraded singles.)
 *   - "Damaged" → 'damaged'. TCGplayer doesn't usually distinguish heavily-
 *     damaged from lightly-damaged within "Damaged".
 *   - "Unopened" → 'sealed'. TCGplayer flags sealed product (booster boxes,
 *     ETBs) with this label.
 *
 * Add entries when TCGplayer ships new labels. The normalizer returns
 * `{ ok: false, reason: "unmapped tcgplayer condition '<label>'; add to ..." }`
 * for misses — operator sees the next-action in the quarantine row.
 */
export const TCGPLAYER_CONDITION_MAP: Record<string, CambridgeCondition> = {
  // Singles
  "Near Mint": "nm",
  "Mint": "nm",
  "Lightly Played": "lp",
  "Moderately Played": "mp",
  "Heavily Played": "hp",
  "Damaged": "damaged",
  "Poor": "damaged",

  // Foil tier labels (TCGplayer historically used "Near Mint Foil" etc.;
  // mostly deprecated in favour of sub_type=Foil + condition="Near Mint",
  // but keep the legacy mappings for resilience).
  "Near Mint Foil": "nm",
  "Lightly Played Foil": "lp",
  "Moderately Played Foil": "mp",
  "Heavily Played Foil": "hp",
  "Damaged Foil": "damaged",

  // Sealed
  "Unopened": "sealed",
  "Sealed": "sealed",
};

/**
 * Whether a condition label is currently in our map. Useful for the
 * normalizer's substrate-honest branching.
 */
export function isKnownTcgplayerCondition(label: string): boolean {
  return label in TCGPLAYER_CONDITION_MAP;
}
