/**
 * card_images keys for the Japanese lane.
 *
 * A key is the uppercase SKU of Bandai's own Japanese card id, in the
 * English key's form with JA: OP01-001 → OP-OP01-001-JA, OP01-001_p2 →
 * OP-OP01-001-JA-P2, FB10-001 with p=_p1 → DBF-FB10-001-JA-P1 (the _f front
 * marker stays in the filename only, as English keys keep it). The language
 * segment means a Japanese key can never equal an English one. The S3 object
 * is official/<key>.<ext>.
 */

import { buildSku, skuIdentity } from "@cambridge-tcg/sku";
import { BANDAI_JP_GAMES, BANDAI_JP_POLICY } from "./config";
import type { BandaiJpGameKey, BandaiJpImageBlock, BandaiJpImageRow } from "./types";
import type { NormalizeResult } from "../types";

/** "OP01-001" → set op01, number 001. */
export const CARD_NUMBER_RE = /^([A-Za-z0-9]+)-([A-Za-z0-9]+)$/;
/** A bare suffix: p2 (parallel), r1 (reprint). Fusion World refs carry parallels only. */
const SUFFIX_RE = /^[pr]\d+$/;

/** The key for one Japanese card id, or null when it is not a well-formed,
 * round-tripping Japanese SKU. `suffix` is bare ("p1"), never "_p1". */
export function bandaiJpImageKey(game: BandaiJpGameKey, cardNumber: string, suffix: string | null): string | null {
  const m = CARD_NUMBER_RE.exec(cardNumber);
  if (!m || (suffix !== null && !SUFFIX_RE.test(suffix))) return null;
  let key: string;
  try {
    key = buildSku({ game, set: m[1]!, number: m[2]!, lang: "ja", variant: suffix ?? undefined }).toUpperCase();
  } catch {
    return null;
  }
  const identity = skuIdentity(key);
  return identity && identity.lang === "ja" && identity.game === game && identity.canonical_sku.toUpperCase() === key ? key : null;
}

/** Where the uploaded copy lives in the bucket. */
export function bandaiJpObjectKey(game: BandaiJpGameKey, key: string): string {
  return `official/${key}.${BANDAI_JP_GAMES[game].image_ext}`;
}

/** One image block → its card_images row candidate. Pure. Only base prints
 * become rows: a parallel or reprint has no reviewed mapping to a requested
 * printing (JP and EN One Piece parallel numbers differ). */
export function normalizeBandaiJpImage(block: BandaiJpImageBlock & { retrieved_at: string }): NormalizeResult<BandaiJpImageRow> {
  const sku = bandaiJpImageKey(block.game, block.card_number, block.suffix);
  if (!sku) return { ok: false, reason: `${block.card_id}: no Japanese key` };
  if (block.suffix !== null) return { ok: false, reason: `${block.card_id}: variant-without-reviewed-mapping` };
  return {
    ok: true,
    record: {
      sku, lang: "ja", kind: "official_sample", source: "bandai-jp",
      source_url: block.image_url, attribution: BANDAI_JP_GAMES[block.game].credit,
      license_note: BANDAI_JP_POLICY, retrieved_at: block.retrieved_at,
    },
  };
}
