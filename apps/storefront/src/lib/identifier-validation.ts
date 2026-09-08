import {
  buildSku,
  GAME_CODES,
  GAMES,
  isConfirmedGameCode,
  normalizeSku,
  parseSku,
  SkuBuildError,
  type GameCode,
  type SkuInput,
  type SkuParts,
} from "@cambridge-tcg/sku";

export const IDENTIFIER_MAX_LENGTH = 256;
export const IDENTIFIER_BODY_MAX_BYTES = 1024;
export const PUBLIC_IDENTIFIER_GAME_CODES = GAME_CODES.filter((code) => code !== "tst");

export type IdentifierGameStatus = "known" | "anticipated" | "internal";

/** Registry declaration, not a fresh catalog lookup. */
export function identifierGameStatus(code: GameCode): IdentifierGameStatus {
  return code === "tst" ? "internal" : isConfirmedGameCode(code) ? "known" : "anticipated";
}

export interface IdentifierValidationResult {
  identifier: string;
  status: "strict_canonical" | "normalization_suggested" | "invalid";
  strict_parse_valid: boolean;
  normalized_identifier: string | null;
  /** Parts describe the normalized candidate, when available. */
  parts: SkuParts | null;
  game: { code: GameCode; name: string; status: IdentifierGameStatus } | null;
  language: { code: string; listed_for_game: boolean } | null;
  variant_tokens: string[];
  annotations: string[];
  scope: "syntax_only";
}

/** A bounded, pure adapter: the package alone decides grammar and normalization.
 * Input is preserved, including whitespace. The API checks length before calling.
 */
export function validateIdentifier(identifier: string): IdentifierValidationResult {
  if (identifier.length > IDENTIFIER_MAX_LENGTH) {
    throw new RangeError(`Identifier must be at most ${IDENTIFIER_MAX_LENGTH} characters.`);
  }
  const strict = parseSku(identifier);
  const normalized = normalizeSku(identifier);
  const parts = normalized === null ? null : parseSku(normalized);
  const status = strict && normalized === identifier
    ? "strict_canonical"
    : parts ? "normalization_suggested" : "invalid";
  const game = parts ? {
    code: parts.game,
    name: GAMES[parts.game].name,
    status: identifierGameStatus(parts.game),
  } : null;
  const language = parts ? {
    code: parts.lang,
    listed_for_game: GAMES[parts.game].languages.includes(parts.lang),
  } : null;
  const annotations: string[] = [];
  if (status === "invalid") {
    annotations.push("No accepted structure or recognized normalization. Check the registered game code and each required segment; missing identity is never guessed.");
  }
  if (identifier !== identifier.trim()) {
    annotations.push("Whitespace is preserved and is not accepted by the SKU package. Edit the input yourself if those spaces were unintended.");
  }
  if (status === "normalization_suggested") {
    annotations.push("This is the package's normalization suggestion, not a replacement of your input or an identity match.");
  }
  if (game?.status === "known") {
    annotations.push("The bundled registry marks this game as known to the catalog. No current catalog lookup was made for this game or identifier.");
  } else if (game?.status === "anticipated") {
    annotations.push("This game is registered/anticipated in the bundled registry, not marked as having catalog rows there. This is not a claim about whether the game exists in the world.");
  } else if (game?.status === "internal") {
    annotations.push("tst is an internal test code, not a public catalog game.");
  }
  if (language && !language.listed_for_game) {
    annotations.push("This language is unlisted for the game in the bundled registry. The parser accepts two-letter shape, not an ISO registry; unlisted does not mean syntactically invalid.");
  }
  if (parts?.variant) {
    annotations.push("Variant tokens have valid structure; they do not prove that this printing exists. Token order is preserved by the package.");
  }
  return {
    identifier,
    status,
    strict_parse_valid: strict !== null,
    normalized_identifier: normalized,
    parts,
    game,
    language,
    variant_tokens: parts?.variant?.split("-") ?? [],
    annotations,
    scope: "syntax_only",
  };
}

export type IdentifierBuilderFields = Omit<SkuInput, "game"> & { game: string };
export type IdentifierBuildResult =
  | { ok: true; identifier: string; validation: IdentifierValidationResult }
  | { ok: false; field: SkuBuildError["field"] | "identifier"; message: string };

/** Return the package's first field error without inventing a parallel grammar. */
export function buildIdentifier(fields: IdentifierBuilderFields): IdentifierBuildResult {
  let identifier: string;
  try {
    identifier = buildSku({ ...fields, game: fields.game as GameCode });
  } catch (error) {
    if (!(error instanceof SkuBuildError)) throw error;
    return {
      ok: false,
      field: error.field,
      // The package's error text calls this ISO validation, but only shape is checked.
      message: error.field === "lang" ? "Language must be two letters; ISO membership is not checked." : error.message,
    };
  }
  if (identifier.length > IDENTIFIER_MAX_LENGTH) {
    return { ok: false, field: "identifier", message: `The built identifier exceeds this tool's ${IDENTIFIER_MAX_LENGTH}-character limit.` };
  }
  return { ok: true, identifier, validation: validateIdentifier(identifier) };
}
