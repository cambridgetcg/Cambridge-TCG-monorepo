/**
 * Stored English media for the recorded Bandai display lane.
 * Full SKU syntax is validated before deriving a base lookup key. Derived
 * images are reference illustrations, never verified printing matches.
 * The later July 13 decision includes attributed effect text and stats;
 * acquisition, public package release and onward licensing remain separate.
 */
import { query } from "@/lib/db";
import { englishBaseImageKey } from "./image-reference";
import {
  DEFAULT_CARD_IMAGE_CDN, officialMediaProvenance, projectOfficialImage,
  type OfficialCardImage, type StoredOfficialImage,
} from "./image-publication";

export type EnCardImage = OfficialCardImage;

export interface EnCardText {
  text: string;
  card_type: string | null;
  attribution: string;
  source_url: string | null;
  retrieved_at: string;
}

export interface CardAttributes {
  category: string | null;
  cost: string | null;
  cost_kind: string | null;
  power: string | null;
  counter: string | null;
  color: string | null;
  attribute: string | null;
  type_feature: string | null;
  block_icon: string | null;
  has_trigger: boolean | null;
}

export interface EnCardData {
  effect_text: EnCardText | null;
  attributes: CardAttributes | null;
  en_image: EnCardImage | null;
}

/** Existing write-side storage format. Callers own validation of split parts. */
export function enCardKeyFromParts(game: string, set: string, number: string): string {
  return `${game}-${set}-${number}-en`.toUpperCase();
}

/** Complete syntax and recorded game scope, without rewriting stored keys. */
export function enCardKey(catalogSku: string): string | null {
  return englishBaseImageKey(catalogSku);
}

/** One projection for single and batch reads. No hotlink or catalog fallback. */
export async function getEnCardImages(catalogSkus: readonly string[]): Promise<Map<string, EnCardImage>> {
  const keyBySku = new Map<string, string>();
  for (const sku of catalogSkus) {
    const key = enCardKey(sku);
    if (key) keyBySku.set(sku, key);
  }
  if (!keyBySku.size) return new Map();

  const { rows } = await query(
    `SELECT sku, lang, source, kind, takedown_status, s3_key, attribution, source_url, retrieved_at
       FROM card_images
      WHERE sku = ANY($1) AND lang = 'en' AND source = 'bandai-en'
        AND kind = 'official_sample' AND takedown_status = 'clear' AND s3_key IS NOT NULL
      ORDER BY sku ASC, retrieved_at DESC, s3_key ASC`,
    [[...new Set(keyBySku.values())]],
  );
  // Order explicitly as well as in SQL so adapters cannot choose arbitrary rows.
  const ordered = [...rows as StoredOfficialImage[]].sort((a, b) =>
    String(a.sku).localeCompare(String(b.sku))
      || ((new Date(b.retrieved_at as string).getTime() || 0) - (new Date(a.retrieved_at as string).getTime() || 0))
      || String(a.s3_key).localeCompare(String(b.s3_key))
      || String(a.source_url).localeCompare(String(b.source_url)));
  const byKey = new Map<string, StoredOfficialImage[]>();
  for (const row of ordered) {
    const group = byKey.get(row.sku) ?? [];
    group.push(row);
    byKey.set(row.sku, group);
  }
  const cdn = process.env.CTCG_CARD_IMAGE_CDN || DEFAULT_CARD_IMAGE_CDN;
  const out = new Map<string, EnCardImage>();
  for (const [sku, key] of keyBySku) {
    for (const row of byKey.get(key) ?? []) {
      const image = projectOfficialImage(sku, row, cdn);
      if (image) { out.set(sku, image); break; }
    }
  }
  return out;
}

/** Existing attributed text/stats remain available under their recorded rule. */
export async function getEnCardData(catalogSku: string): Promise<EnCardData> {
  const key = enCardKey(catalogSku);
  if (!key) return { effect_text: null, attributes: null, en_image: null };
  const images = await getEnCardImages([catalogSku]);
  const textRes = await query(
    `SELECT sku, lang, source, effect_text, card_type, attributes, attribution, source_url, retrieved_at
       FROM card_texts WHERE sku = $1 AND lang = 'en' AND source = 'bandai-en' LIMIT 1`,
    [key],
  );
  const row = textRes.rows[0] as (Pick<StoredOfficialImage, "sku" | "lang" | "source" | "attribution" | "source_url" | "retrieved_at"> & {
    effect_text: string | null; card_type: string | null; attributes: CardAttributes | null;
  }) | undefined;
  const provenance = row ? officialMediaProvenance(catalogSku, row) : null;
  const effect_text = row && provenance && typeof row.effect_text === "string" && row.effect_text.trim()
    ? {
        text: row.effect_text, card_type: row.card_type, attribution: provenance.attribution,
        source_url: provenance.source_url, retrieved_at: provenance.retrieved_at,
      } : null;
  return {
    effect_text,
    attributes: row && provenance ? row.attributes ?? null : null,
    en_image: images.get(catalogSku) ?? null,
  };
}
