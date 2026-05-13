import type { NormalizeResult } from "../types";
import type { CanonicalCard } from "../canonical";
import type { YgoCard, YgoCardSet } from "./types";

/**
 * YGOPRODeck card_sets[i].set_code is like "LOB-EN001" / "MP23-EN032".
 * Split into (set_code, lang, number).
 *
 *   "LOB-EN001"   → { set: "lob", lang: "en", number: "001" }
 *   "MP23-EN032"  → { set: "mp23", lang: "en", number: "032" }
 *   "DUOV-JP001"  → { set: "duov", lang: "ja", number: "001" }
 *   "RABB-FR001"  → { set: "rabb", lang: "fr", number: "001" }
 */
interface ParsedSetCode {
  set: string;
  lang: string;
  number: string;
}

const LANG_CODE_MAP: Record<string, string> = {
  EN: "en",
  JP: "ja",
  KR: "ko",
  FR: "fr",
  DE: "de",
  IT: "it",
  SP: "es",
  PT: "pt",
  AE: "ae", // Arabic English
};

function parseSetCode(set_code: string): ParsedSetCode | null {
  // <SET>-<2-3 letter lang><digits>
  const m = set_code.match(/^([A-Z0-9]+)-([A-Z]{2,3})(\d+)$/);
  if (!m) return null;
  const [, set, langRaw, num] = m;
  const lang = LANG_CODE_MAP[langRaw] ?? langRaw.toLowerCase();
  return { set: set.toLowerCase(), lang, number: num };
}

/**
 * One YGOPRODeck card produces multiple CanonicalCards — one per printing.
 * Returning a single NormalizeResult requires the runner to fan out; for
 * v1, we collapse to the first printing and emit the rest to `extra.printings`.
 *
 * Future iteration: extend the contract to allow `NormalizeResult<C[]>` so
 * one raw → many canonical is first-class. For now, names the limitation
 * honestly and ships the simpler path.
 */
export function normalizeYgo(raw: YgoCard): NormalizeResult<CanonicalCard> {
  if (!raw.id) return { ok: false, reason: "missing passcode" };
  if (!raw.card_sets || raw.card_sets.length === 0) {
    return { ok: false, reason: `card ${raw.id} has no card_sets (unprinted)` };
  }

  // Take the first parseable printing as the canonical representative.
  let primary: ParsedSetCode | null = null;
  let primarySet: YgoCardSet | null = null;
  for (const cs of raw.card_sets) {
    const parsed = parseSetCode(cs.set_code);
    if (parsed) {
      primary = parsed;
      primarySet = cs;
      break;
    }
  }
  if (!primary || !primarySet) {
    return {
      ok: false,
      reason: `card ${raw.id} has no parseable set_code among ${raw.card_sets.length} printings`,
    };
  }

  const image = raw.card_images?.[0]?.image_url;
  const passcode = String(raw.id).padStart(8, "0");

  // Collect all other printings as a stringified list in extra.
  const all_printings = raw.card_sets
    .map((cs) => `${cs.set_code}|${cs.set_rarity_code ?? ""}`)
    .join(";");

  const record: CanonicalCard = {
    sku: `ygo-${primary.set}-${primary.lang}${primary.number}-${primary.lang}`,
    game: "ygo",
    set: primary.set,
    number: `${primary.lang}${primary.number}`, // canonical includes lang prefix since YGO set codes do
    lang: primary.lang,
    name: raw.name,
    type: raw.type,
    rarity: primarySet.set_rarity,
    oracle_text: raw.desc,
    image_url: image,
    upstream_id: passcode,
    extra: {
      passcode,
      archetype: raw.archetype ?? null,
      attribute: raw.attribute ?? null,
      race: raw.race ?? null,
      atk: raw.atk ?? null,
      def: raw.def ?? null,
      level: raw.level ?? null,
      primary_set_name: primarySet.set_name ?? null,
      all_printings,
      printing_count: raw.card_sets.length,
    },
  };

  return { ok: true, record };
}
