import { GAME_CODES, GAMES, type GameCode } from "./games";
import { normalizeAndParse } from "./normalize";

/** Published identifier grammar. Validation proves syntax, not a catalog row,
 * physical printing, source-product mapping or right to publish a price. */
export const SKU_IDENTITY_CONTRACT = {
  version: "cambridge.sku.v1",
  form: "<game>-<set>-<number>-<lang>[-<variant>]",
  scope: "syntax_only",
  game: "Registered game code from @cambridge-tcg/sku; registry presence is not catalog availability.",
  set_and_number: "Lowercase alphanumeric segments; leading zeros are significant.",
  language: "Two-letter shape; ISO membership and printing language are not verified.",
  variant: "Optional hyphen-joined lowercase alphanumeric tokens; order is preserved.",
  normalization: "Recognized legacy prefixes, language aliases and swapped number/language forms may yield a candidate. Stored identifiers remain unchanged.",
} as const;

/** Wire shape for skuIdentity(). Cross-field normalization must still be
 * checked by the package; schema validation alone establishes no identity. */
export const SKU_IDENTITY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/SkuIdentity.schema.json",
  title: "SKU identity syntax candidate",
  description: "Preserves a storage identifier alongside a normalized syntax candidate. No catalog existence, physical printing, source-product mapping or publication permission is implied. Cross-field consistency is checked by skuIdentity(), not this structural schema.",
  type: "object",
  additionalProperties: false,
  required: ["raw_sku", "canonical_sku", "game", "set", "number", "lang", "variant", "scope"],
  properties: {
    raw_sku: { type: "string", minLength: 1, description: "Unchanged storage or supplied identifier." },
    canonical_sku: { type: "string", pattern: `^(${GAME_CODES.join("|")})-[a-z0-9]+-[a-z0-9]+-[a-z]{2}(?:-[a-z0-9]+)*$` },
    game: { type: "string", enum: GAME_CODES },
    set: { type: "string", pattern: "^[a-z0-9]+$" },
    number: { type: "string", pattern: "^[a-z0-9]+$", description: "Leading zeros are significant." },
    lang: { type: "string", pattern: "^[a-z]{2}$", description: "Two-letter syntax only; ISO membership is not checked." },
    variant: { type: ["string", "null"], pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", description: "Opaque token order is preserved." },
    scope: { const: "syntax_only" },
  },
} as const;

export interface SkuIdentity {
  raw_sku: string;
  canonical_sku: string;
  game: GameCode;
  set: string;
  number: string;
  lang: string;
  variant: string | null;
  scope: "syntax_only";
}

/** A normalization candidate alongside the untouched storage identifier. */
export function skuIdentity(rawSku: string): SkuIdentity | null {
  const parsed = normalizeAndParse(rawSku);
  return parsed ? {
    raw_sku: rawSku,
    canonical_sku: parsed.canonical,
    game: parsed.game,
    set: parsed.set,
    number: parsed.number,
    lang: parsed.lang,
    variant: parsed.variant ?? null,
    scope: "syntax_only",
  } : null;
}

/** Exact, case-insensitive registry aliases only. No prefix/fuzzy matching.
 * Compact slugs retain legacy wholesale codes such as `onepiece`. */
export function resolveGameToken(token: string): GameCode | null {
  const value = token.trim().toLowerCase();
  if (!value) return null;
  const matches = GAME_CODES.filter((code) => {
    const game = GAMES[code];
    return [code, game.slug, game.slug.replaceAll("-", ""), game.name, game.brand,
      ...(game.legacyPrefixes ?? [])]
      .some((alias) => alias.toLowerCase() === value);
  });
  return matches.length === 1 ? matches[0]! : null;
}
