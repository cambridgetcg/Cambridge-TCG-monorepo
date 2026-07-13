/**
 * EN card data — the read/write join key + read helpers for `card_texts`
 * and `card_images` (migration 0116, docs/EN-CARD-DATA.md).
 *
 * ── THE JOIN-KEY DECISION (one truth; write-side cites this) ──────────
 *
 * `card_texts.sku` / `card_images.sku` store the **language-and-variant-
 * stripped card identity, rendered as the uppercase EN sku base**:
 *
 *     <GAME_CODE>-<SET>-<NUMBER>-EN        e.g.  OP-OP01-001-EN
 *
 * Why this form and not something else:
 *
 *   1. **Not the raw catalogue sku.** `card_set_cards.sku` lives in two
 *      regimes (see `@/lib/games/sku-game`): legacy uppercase prefix-typed
 *      (`OP-OP01-001-JP-V11DZ`, where the first segment is a *set-family*
 *      prefix — OP/EB/ST/P for One Piece — not the game code) and
 *      canonical lowercase (`op-op01-001-ja`). EN skus mostly don't exist
 *      in `card_set_cards` yet, so keying on catalogue skus would leave
 *      the EN data unjoinable from JP rows.
 *   2. **Not variant-tailed.** Official EN rules text is identical across
 *      parallel prints, and the JP market page for any variant should
 *      find the card's EN text/base image. (Parallel-art images keep
 *      their variant tail appended — `OP-OP01-001-EN-P1` — so they are
 *      preserved without colliding with the base print; today's readers
 *      only look up the base key.)
 *   3. **Canonical game code, always** (`op`, never the legacy `EB`/`ST`
 *      prefixes), so one card has exactly one key regardless of which
 *      sku regime the catalogue row uses. This is the `stripped` oracle
 *      pattern from `packages/sku/src/oracle.ts` (Bandai games:
 *      `(game,set,number)` is the cross-language anchor) with `-EN`
 *      re-appended to stay honest that these rows are English-language
 *      facts, matching the table's `lang='en'` column.
 *   4. **Uppercase** to match the dominant legacy regime of the
 *      storefront catalogue (`OP-OP01-001-JP`), so operators eyeballing
 *      joins in psql see one case, and so a future backfill that mints
 *      real EN catalogue rows (`OP-OP01-001-EN`) collides with — i.e.
 *      naturally adopts — these keys.
 *
 * Derivation from a catalogue row (either regime):
 *   segments[1] = set, segments[2] = number, segments[0] → game code via
 *   the Atlas (canonical codes + legacyPrefixes). `OP-OP01-001-JP-V11DZ`,
 *   `op-op01-001-ja`, and `EB-EB04-061-JP` all resolve to their one EN
 *   key. SEALED-/unknown prefixes resolve to null (no EN data, honestly).
 *
 * The key helpers remain because the internal parser and the already-applied
 * migration use this shape. The public ingest route is paused.
 *
 * ── Substrate honesty ─────────────────────────────────────────────────
 *
 * Bandai has not given Cambridge documented permission to publish these
 * proprietary fields. Public reads therefore return only nulls and perform no
 * database query. This also guarantees that a stored publisher `source_url`
 * can never become a hotlink fallback.
 */

import { GAMES, GAME_CODES, type GameCode } from "@cambridge-tcg/sku";

/** Official English rules text for a card (never flavor text — the
 *  column doesn't exist, by policy). */
export interface EnCardText {
  /** Effect + trigger text, publisher-faithful. */
  text: string;
  /** Publisher card type/category (e.g. "CHARACTER", "EVENT"). */
  card_type: string | null;
  /** Copyright line — NOT NULL by schema; always render it. */
  attribution: string;
  /** Publisher page the text was read from. */
  source_url: string | null;
  /** ISO 8601 — when we fetched it. */
  retrieved_at: string;
}

/** English image shape reserved for a future rights-cleared publication rule. */
export interface EnCardImage {
  /** Serveable URL from a reviewed Cambridge-controlled host. */
  url: string;
  /** Copyright line — NOT NULL by schema; always render near the image. */
  attribution: string;
  /** 'official_sample' | 'community_api' | 'shop_scan' | 'seller_photo'. */
  kind: string;
  /** Publisher/source URL the image came from. */
  source_url: string | null;
  /** ISO 8601 — when we fetched it. */
  retrieved_at: string;
}

export interface EnCardData {
  effect_text: EnCardText | null;
  en_image: EnCardImage | null;
}

// First-segment → canonical game code, across both sku regimes.
// Canonical codes ("op") and legacy set-family prefixes ("OP", "EB",
// "ST", "P", "PRB", "DON", "PK", "FB", "SB") from the Atlas.
const SEGMENT_TO_GAME: Readonly<Record<string, GameCode>> = (() => {
  const map: Record<string, GameCode> = {};
  for (const code of GAME_CODES) {
    map[code.toUpperCase()] = code;
    for (const prefix of GAMES[code].legacyPrefixes ?? []) {
      map[prefix.toUpperCase()] = code;
    }
  }
  return map;
})();

const SEGMENT_RE = /^[A-Za-z0-9]+$/;

/**
 * Build the EN card key from already-split parts (write-side entry
 * point; the ingest cron feeds `CanonicalCard.game/set/number` here).
 */
export function enCardKeyFromParts(
  game: string,
  set: string,
  number: string,
): string {
  return `${game}-${set}-${number}-en`.toUpperCase();
}

/**
 * Derive the EN card key from a catalogue sku of either regime.
 * Returns null when the sku can't carry one (SEALED-, unknown prefix,
 * malformed) — meaning "no EN data", never an error.
 */
export function enCardKey(catalogSku: string): string | null {
  const segs = (catalogSku || "").trim().split("-");
  if (segs.length < 4) return null;
  const game = SEGMENT_TO_GAME[segs[0]!.toUpperCase()];
  if (!game) return null;
  const set = segs[1]!;
  const number = segs[2]!;
  if (!SEGMENT_RE.test(set) || !SEGMENT_RE.test(number)) return null;
  return enCardKeyFromParts(game, set, number);
}

/**
 * Public Bandai EN publication boundary.
 *
 * Do not query stored rows until documented source permission, self-hosting,
 * and field-level publication rules all exist. Attribution and a takedown
 * field are safeguards; neither grants publication rights.
 */
export async function getEnCardData(catalogSku: string): Promise<EnCardData> {
  void catalogSku;
  return { effect_text: null, en_image: null };
}
