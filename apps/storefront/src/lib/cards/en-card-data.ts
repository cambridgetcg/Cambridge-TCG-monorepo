/**
 * Stored official media for the recorded Bandai display lanes.
 * Full SKU syntax is validated before deriving a base lookup key. Derived
 * images are reference illustrations, never verified printing matches.
 * The later July 13 decision includes attributed effect text and stats;
 * acquisition, public package release and onward licensing remain separate.
 *
 * Two image lanes, each read by its own function with its own fixed SQL pair
 * and projector (official-image-lanes.ts): the English base reference
 * (getEnCardImages) and, since Yu's decision of 2026-10-30, a Japanese
 * request's own-language base image (getSameLanguageImages), which
 * OFFICIAL_IMAGES_JA=off turns off. ImageReference v1 is unchanged.
 */
import { query } from "@/lib/db";
import { englishBaseImageKey } from "./image-reference";
import { sameLanguageBaseImageKey } from "./same-language-image-reference";
import {
  DEFAULT_CARD_IMAGE_CDN, officialMediaProvenance, projectOfficialImage, projectSameLanguageImage,
  type OfficialCardImage, type SameLanguageCardImage, type StoredOfficialImage,
} from "./image-publication";

export type EnCardImage = OfficialCardImage;
export type { SameLanguageCardImage };

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
  /** A Japanese request's own-language base image, or null. */
  same_language_image: SameLanguageCardImage | null;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Existing write-side storage format. Callers own validation of split parts. */
export function enCardKeyFromParts(game: string, set: string, number: string): string {
  return `${game}-${set}-${number}-en`.toUpperCase();
}

/** Complete syntax and recorded game scope, without rewriting stored keys. */
export function enCardKey(catalogSku: string): string | null {
  return englishBaseImageKey(catalogSku);
}

/** The one switch for the Japanese lane, read on every call (on Vercel a
 * changed value reaches only a new deployment). On unless set to "off". It
 * hides Japanese images from every reader; it deletes no object, purges no
 * cache and does not touch the manual tools. */
export function officialImagesJaOn(env: Env = process.env): boolean {
  return env.OFFICIAL_IMAGES_JA?.trim().toLowerCase() !== "off";
}

const cardImageCdn = () => process.env.CTCG_CARD_IMAGE_CDN || DEFAULT_CARD_IMAGE_CDN;

/** Order explicitly as well as in SQL so adapters cannot choose arbitrary
 * rows: newest retrieval first per key, then object key, then source URL. */
function rowsByKey(rows: readonly StoredOfficialImage[]): Map<string, StoredOfficialImage[]> {
  const ordered = [...rows].sort((a, b) =>
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
  return byKey;
}

/** A lane's failure is logged by error name only and answers no images, so
 * it never takes the other lane down. */
const laneUnavailable = (lane: string) => (error: unknown) => {
  console.error(`[official-images] ${lane} images unavailable`, error instanceof Error ? error.name : "unknown");
  return new Map<string, never>();
};

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
  const byKey = rowsByKey(rows as StoredOfficialImage[]);
  const cdn = cardImageCdn();
  const out = new Map<string, EnCardImage>();
  for (const [sku, key] of keyBySku) {
    for (const row of byKey.get(key) ?? []) {
      const image = projectOfficialImage(sku, row, cdn);
      if (image) { out.set(sku, image); break; }
    }
  }
  return out;
}

/** A Japanese request's own-language base image (Yu, 2026-10-30): the
 * clear, self-hosted bandai-jp row for the same card's base print. A
 * requested variant is shown its base print (the reference keeps both SKUs).
 * The switch is read before any key or query. */
export async function getSameLanguageImages(catalogSkus: readonly string[], env: Env = process.env): Promise<Map<string, SameLanguageCardImage>> {
  if (!officialImagesJaOn(env)) return new Map();
  const keyBySku = new Map<string, string>();
  for (const sku of catalogSkus) {
    const key = sameLanguageBaseImageKey(sku);
    if (key) keyBySku.set(sku, key);
  }
  if (!keyBySku.size) return new Map();

  const { rows } = await query(
    `SELECT sku, lang, source, kind, takedown_status, s3_key, attribution, source_url, retrieved_at, license_note
       FROM card_images
      WHERE sku = ANY($1) AND lang = 'ja' AND source = 'bandai-jp'
        AND kind = 'official_sample' AND takedown_status = 'clear' AND s3_key IS NOT NULL
      ORDER BY sku ASC, retrieved_at DESC, s3_key ASC`,
    [[...new Set(keyBySku.values())]],
  );
  const byKey = rowsByKey(rows as StoredOfficialImage[]);
  const cdn = cardImageCdn();
  const out = new Map<string, SameLanguageCardImage>();
  for (const [sku, key] of keyBySku) {
    for (const row of byKey.get(key) ?? []) {
      const image = projectSameLanguageImage(sku, row, cdn);
      if (image) { out.set(sku, image); break; }
    }
  }
  return out;
}

/** The image a surface shows for a requested SKU: the same-language image
 * when there is one, else the English base reference; its language field says which. */
export type OfficialImageChoice = SameLanguageCardImage | (EnCardImage & { language: "en" });

export function chooseOfficialImage(en: EnCardImage | null | undefined, sameLanguage: SameLanguageCardImage | null | undefined): OfficialImageChoice | null {
  if (sameLanguage) return sameLanguage;
  return en ? { ...en, language: "en" } : null;
}

/** Both lanes for a batch, each caught on its own: a failed Japanese read
 * leaves the English images, and the reverse. */
export async function getOfficialCardImages(catalogSkus: readonly string[], env: Env = process.env): Promise<Map<string, OfficialImageChoice>> {
  const [en, sameLanguage] = await Promise.all([
    getEnCardImages(catalogSkus).catch(laneUnavailable("en")),
    getSameLanguageImages(catalogSkus, env).catch(laneUnavailable("ja")),
  ]);
  const out = new Map<string, OfficialImageChoice>();
  for (const sku of catalogSkus) {
    const choice = chooseOfficialImage(en.get(sku), sameLanguage.get(sku));
    if (choice) out.set(sku, choice);
  }
  return out;
}

/** Existing attributed text/stats remain available under their recorded rule.
 * Text stays English (card_texts, bandai-en); only the image has a Japanese lane. */
export async function getEnCardData(catalogSku: string, env: Env = process.env): Promise<EnCardData> {
  const key = enCardKey(catalogSku);
  if (!key) return { effect_text: null, attributes: null, en_image: null, same_language_image: null };
  const images = await getEnCardImages([catalogSku]);
  const sameLanguage = await getSameLanguageImages([catalogSku], env).catch(laneUnavailable("ja"));
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
    same_language_image: sameLanguage.get(catalogSku) ?? null,
  };
}
