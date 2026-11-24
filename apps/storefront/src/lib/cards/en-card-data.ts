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
 * request's own-language base image (getSameLanguageImages), which stays off
 * unless OFFICIAL_IMAGES_JA=show. ImageReference v1 is unchanged.
 */
import { query } from "@/lib/db";
import { dbTimestamp } from "@cambridge-tcg/db/timestamp";
import { englishBaseImageKey } from "./image-reference";
import type { OfficialMediaState } from "./media-reasons";
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
  /** Whether an official image, and the rules text, is here; if not, why. */
  image_state: OfficialMediaState;
  text_state: Exclude<OfficialMediaState, "switched_off">;
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
 * changed value reaches only a new deployment). Off unless set to "show":
 * showing Japanese images waits for the owner's separate word, and no value
 * that meant anything before 2026-11-24 turns them on. While off, no reader
 * shows one; it deletes no object, purges no cache and does not touch the
 * manual tools. */
export function officialImagesJaOn(env: Env = process.env): boolean {
  return env.OFFICIAL_IMAGES_JA?.trim() === "show";
}

const cardImageCdn = () => process.env.CTCG_CARD_IMAGE_CDN || DEFAULT_CARD_IMAGE_CDN;

/** Order explicitly as well as in SQL so adapters cannot choose arbitrary
 * rows: newest retrieval first per key, then object key, then source URL. */
function rowsByKey(rows: readonly StoredOfficialImage[]): Map<string, StoredOfficialImage[]> {
  const ordered = [...rows].sort((a, b) =>
    String(a.sku).localeCompare(String(b.sku))
      || ((dbTimestamp(b.retrieved_at)?.getTime() ?? 0) - (dbTimestamp(a.retrieved_at)?.getTime() ?? 0))
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

/** A failed read is logged by error name only and gives null, so it never
 * takes the other lane down and never reads as "no image". */
const unavailable = (what: string) => (error: unknown): null => {
  console.error(`[official-images] ${what} unavailable`, error instanceof Error ? error.name : "unknown");
  return null;
};

/** Held pictures whose rows all failed our own checks: a fault to look at, so
 * it is logged, by count only. From 2026-09-29 to 2026-11 every row failed. */
function logRefused(lane: string, images: ReadonlyMap<string, unknown>): void {
  const refused = [...images.values()].filter((image) => image === null).length;
  if (refused) console.error(`[official-images] ${lane}: ${refused} of ${images.size} held pictures failed the checks`);
}

/** One projection for single and batch reads. No hotlink or catalog fallback.
 * A SKU with no row is absent; a SKU whose rows all failed the checks is null. */
export async function getEnCardImages(catalogSkus: readonly string[]): Promise<Map<string, EnCardImage | null>> {
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
  const out = new Map<string, EnCardImage | null>();
  for (const [sku, key] of keyBySku) {
    for (const row of byKey.get(key) ?? []) {
      const image = projectOfficialImage(sku, row, cdn);
      out.set(sku, image);
      if (image) break;
    }
  }
  logRefused("en", out);
  return out;
}

/** A Japanese request's own-language base image (Yu, 2026-10-30): the
 * clear, self-hosted bandai-jp row for the same card's base print. A
 * requested variant is shown its base print (the reference keeps both SKUs).
 * The switch is read before any key or query. */
export async function getSameLanguageImages(catalogSkus: readonly string[], env: Env = process.env): Promise<Map<string, SameLanguageCardImage | null>> {
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
  const out = new Map<string, SameLanguageCardImage | null>();
  for (const [sku, key] of keyBySku) {
    for (const row of byKey.get(key) ?? []) {
      const image = projectSameLanguageImage(sku, row, cdn);
      out.set(sku, image);
      if (image) break;
    }
  }
  logRefused("ja", out);
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
    getEnCardImages(catalogSkus).catch(unavailable("en images")),
    getSameLanguageImages(catalogSkus, env).catch(unavailable("ja images")),
  ]);
  const out = new Map<string, OfficialImageChoice>();
  for (const sku of catalogSkus) {
    const choice = chooseOfficialImage(en?.get(sku), sameLanguage?.get(sku));
    if (choice) out.set(sku, choice);
  }
  return out;
}

/** Existing attributed text/stats remain available under their recorded rule.
 * Text stays English (card_texts, bandai-en); only the image has a Japanese
 * lane. Each read is caught on its own, and a failed one is its own state. */
export async function getEnCardData(catalogSku: string, env: Env = process.env): Promise<EnCardData> {
  const key = enCardKey(catalogSku);
  if (!key) return { effect_text: null, attributes: null, en_image: null, same_language_image: null, image_state: "no_lane", text_state: "no_lane" };
  const images = await getEnCardImages([catalogSku]).catch(unavailable("en images"));
  const sameLanguage = await getSameLanguageImages([catalogSku], env).catch(unavailable("ja images"));
  const text = await query(
    `SELECT sku, lang, source, effect_text, card_type, attributes, attribution, source_url, retrieved_at
       FROM card_texts WHERE sku = $1 AND lang = 'en' AND source = 'bandai-en' LIMIT 1`,
    [key],
  ).catch(unavailable("en text"));
  const row = text?.rows[0] as (Pick<StoredOfficialImage, "sku" | "lang" | "source" | "attribution" | "source_url" | "retrieved_at"> & {
    effect_text: string | null; card_type: string | null; attributes: CardAttributes | null;
  }) | undefined;
  const provenance = row ? officialMediaProvenance(catalogSku, row) : null;
  const effect_text = row && provenance && typeof row.effect_text === "string" && row.effect_text.trim()
    ? {
        text: row.effect_text, card_type: row.card_type, attribution: provenance.attribution,
        source_url: provenance.source_url, retrieved_at: provenance.retrieved_at,
      } : null;
  const enImage = images?.get(catalogSku), jaImage = sameLanguage?.get(catalogSku);
  return {
    effect_text,
    attributes: row && provenance ? row.attributes ?? null : null,
    en_image: enImage ?? null,
    same_language_image: jaImage ?? null,
    image_state: enImage || jaImage ? "shown"
      : !images || !sameLanguage || enImage === null || jaImage === null ? "unreadable"
      : sameLanguageBaseImageKey(catalogSku) && !officialImagesJaOn(env) ? "switched_off"
      : "none",
    text_state: effect_text ? "shown" : !text || (row && !provenance) ? "unreadable" : "none",
  };
}
