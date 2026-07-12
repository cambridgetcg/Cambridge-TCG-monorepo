/**
 * Scryfall → CanonicalCard.
 *
 * Pure: same input → same output, no side effects. Failures return
 * `{ ok: false, reason }`; never throw.
 */

import type { NormalizeResult } from "../types";
import type { CanonicalCard } from "../canonical";
import type { ScryfallCard } from "./types";

/** Map Scryfall lang strings to ISO 639-1 where they differ. */
const LANG_MAP: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "pt",
  ja: "ja",
  ko: "ko",
  ru: "ru",
  zhs: "zh", // simplified
  zht: "zh", // traditional — collapsed; downstream uses `extra.script` if needed
  he: "he",
  la: "la",
  grc: "grc",
  ar: "ar",
  sa: "sa",
  ph: "ph", // Phyrexian
  qya: "qya", // Quenya
};

function deriveVariant(card: ScryfallCard): string | undefined {
  const tags: string[] = [];
  if (card.frame_effects?.includes("etched")) tags.push("etched");
  if (card.frame_effects?.includes("showcase")) tags.push("showcase");
  if (card.frame_effects?.includes("borderless")) tags.push("borderless");
  if (card.promo_types?.includes("boosterfun")) tags.push("bfun");
  if (card.promo_types?.includes("textured")) tags.push("textured");
  if (card.variation) tags.push("var");
  return tags.length === 0 ? undefined : tags.join("-");
}

function pickImage(card: ScryfallCard): string | undefined {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.image_uris?.large) return card.image_uris.large;
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return undefined;
}

export function normalizeScryfall(raw: ScryfallCard): NormalizeResult<CanonicalCard> {
  if (raw.digital === true) {
    return { ok: false, reason: "digital-only printing (MTGO/MTGA); paper-catalog only" };
  }
  if (!raw.set) {
    return { ok: false, reason: "missing set code" };
  }
  if (!raw.collector_number) {
    return { ok: false, reason: "missing collector_number" };
  }
  const lang = LANG_MAP[raw.lang] ?? raw.lang;
  if (!lang || lang.length === 0) {
    return { ok: false, reason: `unmapped lang '${raw.lang}'` };
  }

  const variant = deriveVariant(raw);
  const base = `mtg-${raw.set.toLowerCase()}-${raw.collector_number.toLowerCase()}-${lang}`;
  const sku = variant ? `${base}-${variant}` : base;

  const record: CanonicalCard = {
    sku,
    game: "mtg",
    set: raw.set.toLowerCase(),
    number: raw.collector_number.toLowerCase(),
    lang,
    name: raw.printed_name ?? raw.name,
    type: raw.type_line,
    rarity: raw.rarity,
    // Illustrator credit — Scryfall ships it on nearly every card. Attribution:
    // source is scryfall; displayable-with-credit, never republished raw on a
    // CC0 surface (Scryfall permits value-added display, not bulk repackaging).
    artist: raw.artist ?? undefined,
    oracle_text: raw.oracle_text,
    image_url: pickImage(raw),
    upstream_id: raw.id,
    extra: {
      oracle_id: raw.oracle_id ?? null,
      released_at: raw.released_at ?? null,
      scryfall_set: raw.set,
      scryfall_number: raw.collector_number,
      scryfall_lang: raw.lang,
      // Same artwork across printings shares one illustration_id → "same art"
      // clustering (the alt-art treasure-hunt axis) without any new upstream call.
      illustration_id: raw.illustration_id ?? null,
    },
  };
  if (variant) record.variant = variant;

  return { ok: true, record };
}
