import { GAMES, normalizeAndParse } from "@cambridge-tcg/sku";

const LEGACY_LANGUAGE: Readonly<Record<string, string>> = {
  ja: "jp",
  zh: "cn",
  ko: "kr",
};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

/**
 * Every stored spelling a SKU may have, for an exact `sku = ANY(…)` read: the
 * caller's own, the canonical v1 form and the frozen uppercase-era forms
 * `normalizeSku()` accepts. Lookup tolerance, never a new identity claim. A
 * value that is not a SKU has one spelling, its own.
 */
export function skuSpellings(requested: string): string[] {
  const parts = normalizeAndParse(requested);
  if (!parts) return [requested];

  const legacyLanguage = LEGACY_LANGUAGE[parts.lang] ?? parts.lang;
  const tail = parts.variant ? `-${parts.variant}` : "";
  const legacyPrefixes = GAMES[parts.game].legacyPrefixes ?? [];
  const matchingPrefixes = legacyPrefixes
    .filter((prefix) => parts.set.toUpperCase().startsWith(prefix))
    .sort((left, right) => right.length - left.length);
  const longestMatch = matchingPrefixes[0]?.length ?? 0;
  const relevantLegacyPrefixes = matchingPrefixes.length > 0
    ? matchingPrefixes.filter((prefix) => prefix.length === longestMatch)
    : legacyPrefixes.length === 1
      ? [...legacyPrefixes]
      : [];

  const bases = unique([
    requested,
    parts.canonical,
    `${parts.game}-${parts.set}-${parts.number}-${legacyLanguage}${tail}`,
    `${parts.game}-${parts.set}-${legacyLanguage}-${parts.number}${tail}`,
    ...relevantLegacyPrefixes.flatMap((prefix) => {
      const lower = prefix.toLowerCase();
      return [
        `${lower}-${parts.set}-${parts.number}-${legacyLanguage}${tail}`,
        `${lower}-${parts.set}-${legacyLanguage}-${parts.number}${tail}`,
      ];
    }),
  ]);
  // PostgreSQL can use the raw-SKU btree for these exact candidates. Frozen
  // rows are lowercase or uppercase; the caller's exact spelling is also
  // retained so an already-known mixed-case row remains addressable.
  return unique(bases.flatMap((base) => [base, base.toLowerCase(), base.toUpperCase()]));
}
