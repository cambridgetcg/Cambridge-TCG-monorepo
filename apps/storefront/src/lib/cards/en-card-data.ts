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
 * IMAGES: official publisher art is published under the recorded rule (see
 * getEnCardData below) — self-hosted on a Cambridge host, takedown-clear, and
 * always carrying its copyright line. A stored publisher `source_url` is NEVER
 * served (the query requires s3_key), so it can never become a hotlink.
 * TEXT: effect_text stays withheld pending its own rule; getEnCardData returns
 * effect_text:null.
 */

import { GAMES, GAME_CODES, type GameCode } from "@cambridge-tcg/sku";
import { query } from "@/lib/db";

/**
 * Cambridge-controlled public host for self-hosted official card images.
 * A row publishes ONLY via its s3_key on this host — never the stored
 * publisher `source_url` (that would be a hotlink). See the getEnCardData
 * query + docs/EN-CARD-DATA.md.
 */
const CARD_IMAGE_CDN = (
  process.env.CTCG_CARD_IMAGE_CDN ||
  "https://ctcg-card-images.s3.us-east-1.amazonaws.com"
).replace(/\/$/, "");

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
 * Public official-image publication rule (recorded 2026-07-13, docs/EN-CARD-DATA.md
 * + /legal/card-images). The owner's decision: publish OFFICIAL publisher card
 * images (from the publisher's own card database), self-hosted on a Cambridge-
 * controlled host, with the copyright line always attached, under the
 * nominative-fair-use / marketplace rationale — you must show the card to trade
 * it, and the art is identified as the publisher's, not ours.
 *
 * The field-level rule is enforced structurally by the query, not by hope:
 *   - kind = 'official_sample' — only publisher-official art, never shop scans.
 *   - s3_key IS NOT NULL       — only images self-hosted on our host; the stored
 *                                publisher source_url is NEVER served (no hotlink).
 *   - takedown_status = 'clear'— a disputed/removed row can never publish.
 *   - card_images.attribution is NOT NULL by schema, so every released image
 *     carries its copyright line by construction.
 * Text (effect_text) stays withheld — this rule covers images only.
 */
export async function getEnCardData(catalogSku: string): Promise<EnCardData> {
  const key = enCardKey(catalogSku);
  if (!key) return { effect_text: null, en_image: null };

  const { rows } = await query(
    `SELECT s3_key, kind, attribution, source_url, retrieved_at
       FROM card_images
      WHERE sku = $1 AND lang = 'en' AND kind = 'official_sample'
        AND takedown_status = 'clear' AND s3_key IS NOT NULL
      ORDER BY retrieved_at DESC
      LIMIT 1`,
    [key],
  );
  const row = rows[0] as
    | { s3_key: string; kind: string; attribution: string; source_url: string | null; retrieved_at: unknown }
    | undefined;

  const en_image: EnCardImage | null = row
    ? {
        // Always the self-hosted URL; NEVER row.source_url.
        url: `${CARD_IMAGE_CDN}/${row.s3_key}`,
        attribution: row.attribution,
        kind: row.kind,
        source_url: row.source_url,
        retrieved_at:
          row.retrieved_at instanceof Date
            ? row.retrieved_at.toISOString()
            : String(row.retrieved_at),
      }
    : null;
  return { effect_text: null, en_image };
}

/**
 * Batch official-image lookup for a page of catalogue SKUs (the grid path —
 * one query, not N). Same field-level rule as getEnCardData. Returns a map
 * keyed by the ORIGINAL catalogue sku (only entries that have a published
 * official image); missing skus simply aren't in the map.
 */
export async function getEnCardImages(
  catalogSkus: readonly string[],
): Promise<Map<string, EnCardImage>> {
  const keyBySku = new Map<string, string>();
  const keys = new Set<string>();
  for (const sku of catalogSkus) {
    const key = enCardKey(sku);
    if (key) {
      keyBySku.set(sku, key);
      keys.add(key);
    }
  }
  if (keys.size === 0) return new Map();

  const { rows } = await query(
    `SELECT sku, s3_key, kind, attribution, source_url, retrieved_at
       FROM card_images
      WHERE sku = ANY($1) AND lang = 'en' AND kind = 'official_sample'
        AND takedown_status = 'clear' AND s3_key IS NOT NULL`,
    [Array.from(keys)],
  );

  const byKey = new Map<string, EnCardImage>();
  for (const r of rows as Array<{
    sku: string; s3_key: string; kind: string; attribution: string; source_url: string | null; retrieved_at: unknown;
  }>) {
    if (byKey.has(r.sku)) continue;
    byKey.set(r.sku, {
      url: `${CARD_IMAGE_CDN}/${r.s3_key}`,
      attribution: r.attribution,
      kind: r.kind,
      source_url: r.source_url,
      retrieved_at:
        r.retrieved_at instanceof Date ? r.retrieved_at.toISOString() : String(r.retrieved_at),
    });
  }

  const out = new Map<string, EnCardImage>();
  for (const [sku, key] of keyBySku) {
    const img = byKey.get(key);
    if (img) out.set(sku, img);
  }
  return out;
}
