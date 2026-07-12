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

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * CanonicalCard has one artist field. Prefer Scryfall's card-level credit;
 * otherwise join unique face credits in printed face order. The face mapping
 * itself stays explicit in `extra.scryfall_face_credits_json` below.
 */
function canonicalArtist(card: ScryfallCard): string | undefined {
  const cardArtist = nonEmpty(card.artist);
  if (cardArtist) return cardArtist;

  const artists: string[] = [];
  const seen = new Set<string>();
  for (const face of card.card_faces ?? []) {
    const artist = nonEmpty(face.artist);
    if (artist && !seen.has(artist)) {
      artists.push(artist);
      seen.add(artist);
    }
  }
  return artists.length > 0 ? artists.join(" // ") : undefined;
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
    // Internal provenance only. Scryfall is redistribute:false; neither this
    // credit nor the face-level credits below imply public display permission.
    artist: canonicalArtist(raw),
    oracle_text: raw.oracle_text,
    image_url: pickImage(raw),
    upstream_id: raw.id,
    extra: {
      oracle_id: raw.oracle_id ?? null,
      released_at: raw.released_at ?? null,
      scryfall_set: raw.set,
      scryfall_number: raw.collector_number,
      scryfall_lang: raw.lang,
      // CanonicalCard.extra is scalar-valued. JSON keeps ordered ids and face
      // records structured without widening that shared contract. The `_json`
      // suffix makes the decoding requirement explicit.
      artist_ids_json: raw.artist_ids
        ? JSON.stringify(
            raw.artist_ids
              .map((id) => nonEmpty(id))
              .filter((id): id is string => id !== undefined),
          )
        : null,
      // Same artwork across printings shares one illustration_id → "same art"
      // clustering (the alt-art treasure-hunt axis) without any new upstream call.
      illustration_id: raw.illustration_id ?? null,
      // One CanonicalCard represents the whole printing, so retain the ordered
      // face mapping here. Explicit nulls distinguish missing upstream fields
      // from a fabricated card-level attribution.
      scryfall_face_credits_json: raw.card_faces
        ? JSON.stringify(
            raw.card_faces.map((face, position) => ({
              position,
              name: face.name,
              artist: nonEmpty(face.artist) ?? null,
              artist_id: nonEmpty(face.artist_id) ?? null,
              illustration_id: nonEmpty(face.illustration_id) ?? null,
            })),
          )
        : null,
    },
  };
  if (variant) record.variant = variant;

  return { ok: true, record };
}
