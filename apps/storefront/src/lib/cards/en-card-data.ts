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
 * Write-side: the bandai-en ingest cron
 * (`app/api/cron/ingest/bandai-en/route.ts`) builds the same key from
 * `CanonicalCard.game/set/number` via `enCardKeyFromParts`.
 *
 * ── Substrate honesty ─────────────────────────────────────────────────
 *
 * Reads degrade to `{ effect_text: null, en_image: null }` when migration
 * 0116 hasn't applied or the tables are empty — a card without EN data is
 * a normal state, never an error. Only images with
 * `takedown_status = 'clear'` are ever served (EN-CARD-DATA §7: takedowns
 * honoured fast; the row survives for the audit trail, the pixels don't).
 */

import { query } from "@/lib/db";
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

/** Best clear English image for a card. */
export interface EnCardImage {
  /** Serveable URL: our mirror when `s3_key` exists, else the
   *  publisher's own gallery URL. */
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

// TODO(EN-CARD-DATA §5): S3 mirroring. The `ctcg-card-images` bucket
// does not exist yet (needs Yu — rollout §6.5a), so `s3_key` is NULL on
// every row and we serve the publisher's own gallery URL (official
// samples, credited). When the bucket lands: mirror at ingest, set
// `s3_key = {lang}/{game}/{set}/{CARD_NO}[_variant].{ext}` (+ thumb/
// prefix), add the host below to next.config.ts remotePatterns, and
// this helper starts preferring the mirror automatically.
const EN_IMAGE_BUCKET_HOST = "ctcg-card-images.s3.us-east-1.amazonaws.com";

function enImageUrl(
  s3Key: string | null,
  sourceUrl: string | null,
): string | null {
  if (s3Key) return `https://${EN_IMAGE_BUCKET_HOST}/${s3Key}`;
  return sourceUrl;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

/**
 * Fetch the EN text + best clear EN image for a catalogue sku.
 *
 * "Best" image: `official_sample` first (publisher-served, cleanest
 * provenance — EN-CARD-DATA §5), then newest. Rows under takedown are
 * never candidates. Both lookups degrade to null pre-migration/pre-
 * ingest.
 */
export async function getEnCardData(catalogSku: string): Promise<EnCardData> {
  const key = enCardKey(catalogSku);
  if (!key) return { effect_text: null, en_image: null };

  try {
    const [textRes, imageRes] = await Promise.all([
      query(
        `SELECT effect_text, card_type, attribution, source_url, retrieved_at
           FROM card_texts
          WHERE sku = $1 AND lang = 'en'
          LIMIT 1`,
        [key],
      ),
      query(
        `SELECT source_url, s3_key, attribution, kind, retrieved_at
           FROM card_images
          WHERE sku = $1 AND lang = 'en' AND takedown_status = 'clear'
          ORDER BY (kind = 'official_sample') DESC, retrieved_at DESC
          LIMIT 1`,
        [key],
      ),
    ]);

    const t = textRes.rows[0];
    const effect_text: EnCardText | null =
      t && typeof t.effect_text === "string" && t.effect_text.length > 0
        ? {
            text: t.effect_text,
            card_type: t.card_type ?? null,
            attribution: t.attribution,
            source_url: t.source_url ?? null,
            retrieved_at: toIso(t.retrieved_at),
          }
        : null;

    const i = imageRes.rows[0];
    const url = i ? enImageUrl(i.s3_key ?? null, i.source_url ?? null) : null;
    const en_image: EnCardImage | null =
      i && url
        ? {
            url,
            attribution: i.attribution,
            kind: i.kind,
            source_url: i.source_url ?? null,
            retrieved_at: toIso(i.retrieved_at),
          }
        : null;

    return { effect_text, en_image };
  } catch {
    // Migration 0116 not applied (or a read hiccup) — the card simply
    // has no EN data yet. Callers render the JP-only surface unchanged.
    return { effect_text: null, en_image: null };
  }
}
