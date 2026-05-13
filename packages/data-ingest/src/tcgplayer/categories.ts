/**
 * TCGplayer categoryId → Cambridge GameCode map.
 *
 * TCGplayer's `categoryId` is an integer identifying a game family (MTG=1,
 * Pokémon=3, One Piece=68, ...). This file maps from their ids to our
 * `GameCode` so the normalizer can build a canonical SKU.
 *
 * **Anticipate-then-confirm.** Each entry carries a `confirmed: boolean`
 * flag (the same pattern as `CARDRUSH_SUBDOMAINS` from kingdom-064 and
 * `SET_FORMATS` from kingdom-078). Speculative entries are registered so
 * URLs / catalog walks targeting that category don't silently 404; the
 * first successful seed-set run promotes them to `confirmed: true`.
 *
 * ── Source of truth ─────────────────────────────────────────────────
 *
 * TCGplayer publishes the canonical category list via `GET /catalog/categories`.
 * Until we have a running ingest we hard-code the ids that matter for our
 * 11 declared games (per `the-tributaries.md` §2.1). The audit
 * `pnpm audit:tcgplayer-mapping` reports drift between this map and the
 * upstream.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN).
 */

import type { GameCode } from "@cambridge-tcg/sku";

export interface TcgplayerCategoryEntry {
  /** Cambridge TCG game code. */
  game: GameCode;
  /** Human-readable name (mirrors TCGplayer's). */
  name: string;
  /** Whether a real seed-set run has confirmed this category's productId
   *  shape. New entries default to false; first successful seed promotes. */
  confirmed: boolean;
  /** Optional note (e.g. for languages, regional variants). */
  note?: string;
}

/**
 * TCGplayer category ids → Cambridge GameCode. Hand-maintained; the audit
 * surfaces drift.
 *
 * The integer keys mirror the upstream ids. When TCGplayer adds a new
 * category for a future game, add an entry here with `confirmed: false`,
 * then the next seed-set walk promotes it.
 */
export const TCGPLAYER_CATEGORIES: Record<number, TcgplayerCategoryEntry> = {
  // ── Confirmed core games (Cambridge TCG's primary coverage) ──────
  1: { game: "mtg", name: "Magic: The Gathering", confirmed: false, note: "Largest TCGplayer catalog; ~100K printings" },
  3: { game: "pkm", name: "Pokémon", confirmed: false, note: "Includes Pokémon TCG Live, regional sets" },
  // One Piece TCG
  68: { game: "op", name: "One Piece Card Game", confirmed: false, note: "TCGplayer's primary OP catalog" },
  // Yu-Gi-Oh!
  2: { game: "ygo", name: "YuGiOh", confirmed: false, note: "Konami-published printings" },
  // Dragon Ball Super CCG (Bandai legacy product line)
  72: { game: "dbs", name: "Dragon Ball Super CCG", confirmed: false, note: "DBSCG (legacy line, not Fusion World)" },
  // Dragon Ball Super Fusion World (newer Bandai line)
  85: { game: "dbf", name: "Dragon Ball Super Card Game Fusion World", confirmed: false, note: "DBF Fusion World" },
  // Disney Lorcana
  79: { game: "lgr", name: "Lorcana TCG", confirmed: false, note: "Ravensburger; major TCGplayer category" },
  // Flesh and Blood
  62: { game: "fab", name: "Flesh & Blood TCG", confirmed: false, note: "LSS" },
  // Digimon Card Game (current Bandai)
  63: { game: "dmw", name: "Digimon Card Game", confirmed: false, note: "Bandai's 2020+ revival" },
  // Cardfight!! Vanguard
  16: { game: "vng", name: "Cardfight Vanguard", confirmed: false },
  // Weiß Schwarz (multiple printings; primarily English here)
  61: { game: "wei", name: "Weiss Schwarz", confirmed: false, note: "English partner printings; JP via Bushiroad" },
  // Battle Spirits Saga (Bandai)
  81: { game: "bsr", name: "Battle Spirits Saga", confirmed: false },
};

/**
 * Reverse map: GameCode → TCGplayer categoryId. Useful for the seed CLI
 * (operator runs `seed-set --game op` and we resolve to category=68).
 */
export function categoryForGame(game: GameCode): number | null {
  for (const [id, entry] of Object.entries(TCGPLAYER_CATEGORIES)) {
    if (entry.game === game) return Number(id);
  }
  return null;
}

/**
 * Lookup with substrate-honest absence — returns null on unknown id rather
 * than throwing. Normalizer uses this to decide between an ok-record and
 * a quarantine row.
 */
export function gameForCategory(categoryId: number): GameCode | null {
  return TCGPLAYER_CATEGORIES[categoryId]?.game ?? null;
}

/**
 * The fixed set of sub-types TCGplayer uses across all games. New
 * sub-types should be added explicitly (and the variant map updated)
 * rather than auto-accepted.
 */
export const TCGPLAYER_KNOWN_SUB_TYPES = new Set<string>([
  "Normal",
  "Foil",
  "Reverse Holofoil",
  "Holofoil",
  "1st Edition",
  "1st Edition Holofoil",
  "Unlimited",
  "Unlimited Holofoil",
]);

/**
 * Map TCGplayer's sub-type label to Cambridge's variant tail (or empty
 * string for non-foil base). The variant tail is the optional last
 * segment of our canonical SKU.
 *
 * Returns null for unknown sub-types — normalizer quarantines those with
 * an actionable reason naming the unknown value.
 */
export function variantTailForSubType(subType: string): string | null {
  switch (subType) {
    case "Normal":
      return "";
    case "Foil":
      return "foil";
    case "Reverse Holofoil":
      return "rev";
    case "Holofoil":
      // Pokémon-specific holo variant. We don't yet split holo from base
      // in Cambridge's SKU — they're displayed as the same SKU. Future
      // recursion target: extend SKU to include holo tail.
      return "";
    case "1st Edition":
      return "1st";
    case "1st Edition Holofoil":
      return "1st-holo";
    case "Unlimited":
      return "";
    case "Unlimited Holofoil":
      return "holo";
    default:
      return null;
  }
}
