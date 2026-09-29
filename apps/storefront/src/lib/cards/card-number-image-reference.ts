import { SKU_IDENTITY_SCHEMA, skuIdentity } from "@cambridge-tcg/sku";

/** A practice card-number request has no asserted language or printing SKU. */
export interface CardNumberImageReference {
  requested_game: "op";
  requested_card_number: string;
  requested_canonical_card_number: string;
  depicted_sku: string;
  depicted_canonical_sku: string;
  relationship: "reference";
  scope: "syntax_only";
  reason: "english_card_number_reference";
}

export const CARD_NUMBER_IMAGE_REFERENCE_CONTRACT = {
  version: "cambridge.card-number-image-reference.v1",
  games: ["op"],
  relationship: "reference",
  scope: "syntax_only",
  reason: "english_card_number_reference",
  meaning: "An English image row associated by game, set and collector number with a One Piece practice request. Raw card number and depicted SKU are preserved; the depicted key may retain a pN parallel or rN reprint suffix.",
  limitations: "The request does not identify a printing or language. No exact-printing, source-image, illustrator, authenticity or publication-rights verification is performed. A reprint suffix is not a base-print claim.",
  validation: "The resolver checks complete card-number and SKU syntax, One Piece game, English depicted language and matching set/number. JSON Schema checks structural shape only; it does not enforce those cross-field relationships.",
} as const;

const CARD_NUMBER_PATTERN = "^[A-Za-z0-9]+-[A-Za-z0-9]+$";
const CARD_NUMBER_RE = new RegExp(CARD_NUMBER_PATTERN);

export const CARD_NUMBER_IMAGE_REFERENCE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/CardNumberImageReference.schema.json",
  title: "English practice card-number image reference",
  description: CARD_NUMBER_IMAGE_REFERENCE_CONTRACT.validation,
  type: "object",
  additionalProperties: false,
  required: ["requested_game", "requested_card_number", "requested_canonical_card_number", "depicted_sku", "depicted_canonical_sku", "relationship", "scope", "reason"],
  properties: {
    requested_game: { const: "op" },
    requested_card_number: { type: "string", pattern: CARD_NUMBER_PATTERN, not: { pattern: "\\s" }, description: "Unchanged SET-NUMBER request; no printing SKU or language is asserted." },
    requested_canonical_card_number: { type: "string", pattern: "^[a-z0-9]+-[a-z0-9]+$", not: { pattern: "\\s" }, description: "Lowercase syntax candidate; leading zeros remain significant." },
    depicted_sku: { type: "string", minLength: 1, description: "Unchanged selected image-row identifier, including any recorded parallel or reprint suffix." },
    depicted_canonical_sku: { type: "string", pattern: SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern },
    relationship: { const: "reference" },
    scope: { const: "syntax_only" },
    reason: { const: "english_card_number_reference" },
  },
} as const;

/** Internal storage lookup key only; it does not turn the request into a printing. */
export function englishCardNumberKey(game: string, cardNumber: string): string | null {
  if (game !== "op" || typeof cardNumber !== "string" || /\s/.test(cardNumber) || !CARD_NUMBER_RE.test(cardNumber)) return null;
  const parsed = skuIdentity(`op-${cardNumber}-en`);
  return parsed ? parsed.canonical_sku.toUpperCase() : null;
}

/** Keep the actual selected variant while checking the card-number relationship. */
export function createCardNumberImageReference(game: string, cardNumber: string, depictedSku: string): CardNumberImageReference | null {
  const expected = englishCardNumberKey(game, cardNumber);
  if (!expected || typeof depictedSku !== "string" || /\s/.test(depictedSku)) return null;
  const depicted = skuIdentity(depictedSku);
  if (!depicted || depicted.game !== "op" || depicted.lang !== "en"
    || `${depicted.game}-${depicted.set}-${depicted.number}-en`.toUpperCase() !== expected
    || (depicted.variant !== null && !/^[pr][0-9]+$/.test(depicted.variant))) return null;
  return {
    requested_game: "op",
    requested_card_number: cardNumber,
    requested_canonical_card_number: cardNumber.toLowerCase(),
    depicted_sku: depicted.raw_sku,
    depicted_canonical_sku: depicted.canonical_sku,
    relationship: "reference",
    scope: "syntax_only",
    reason: "english_card_number_reference",
  };
}

/** Validate an unknown wire value, including resolver consistency and exact fields. */
export function isCardNumberImageReference(value: unknown): value is CardNumberImageReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.requested_game !== "string" || typeof record.requested_card_number !== "string" || typeof record.depicted_sku !== "string") return false;
  const expected = createCardNumberImageReference(record.requested_game, record.requested_card_number, record.depicted_sku);
  if (!expected || Object.keys(record).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([key, field]) => Object.hasOwn(record, key) && record[key] === field);
}
