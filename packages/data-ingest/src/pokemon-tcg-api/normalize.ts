import type { NormalizeResult } from "../types";
import type { CanonicalCard } from "../canonical";
import type { PokemonTcgCard } from "./types";

/**
 * Extract the collector number from Pokémon TCG API's `number` field.
 * Sometimes "025" plain, sometimes "025/202", sometimes "SWSH025" (promos).
 * Returns lowercased, zero-padded to 3 chars where numeric.
 */
function extractNumber(raw: string): string {
  // Take everything before the slash if present.
  const before = raw.split("/")[0].trim();
  // If purely numeric, zero-pad to 3.
  if (/^\d+$/.test(before)) return before.padStart(3, "0");
  // Otherwise keep alphanumeric prefix/suffix as-is, lowercase.
  return before.toLowerCase();
}

function pickImage(card: PokemonTcgCard): string | undefined {
  return card.images?.large ?? card.images?.small;
}

export function normalizePokemonTcg(raw: PokemonTcgCard): NormalizeResult<CanonicalCard> {
  if (!raw.id) return { ok: false, reason: "missing pokemon-tcg-api id" };
  if (!raw.set?.id) return { ok: false, reason: `card ${raw.id} missing set.id` };
  if (!raw.number) return { ok: false, reason: `card ${raw.id} missing number` };

  const set = raw.set.id.toLowerCase();
  const number = extractNumber(raw.number);
  // v2 of pokemontcg.io doesn't expose per-language printings; the catalog is
  // primarily EN. When a future endpoint adds language, the normalizer routes here.
  const lang = "en";

  const record: CanonicalCard = {
    sku: `pkm-${set}-${number}-${lang}`,
    game: "pkm",
    set,
    number,
    lang,
    name: raw.name,
    type: raw.supertype,
    rarity: raw.rarity,
    // Promote the illustrator to a first-class credit (was only in extra).
    // Attribution: source is pokemon-tcg-api; displayable-with-credit, never
    // republished raw on a CC0 surface. extra.artist kept as a breadcrumb.
    artist: raw.artist ?? undefined,
    image_url: pickImage(raw),
    upstream_id: raw.id,
    extra: {
      pokemon_tcg_api_id: raw.id,
      set_name: raw.set.name ?? null,
      set_series: raw.set.series ?? null,
      set_release_date: raw.set.releaseDate ?? null,
      subtypes: raw.subtypes?.join(",") ?? null,
      hp: raw.hp ?? null,
      types: raw.types?.join(",") ?? null,
      artist: raw.artist ?? null,
      raw_number: raw.number,
    },
  };

  return { ok: true, record };
}
