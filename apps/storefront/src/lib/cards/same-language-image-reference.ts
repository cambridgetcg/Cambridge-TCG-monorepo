import { SKU_IDENTITY_SCHEMA, skuIdentity } from "@cambridge-tcg/sku";

/** Describes a selected image row in the requested SKU's own language.
 * Neither key verifies the depicted physical printing or publication rights.
 * Additive beside ImageReference v1, which stays English-base-only. */
export interface SameLanguageImageReference {
  requested_sku: string;
  requested_canonical_sku: string;
  depicted_sku: string;
  depicted_canonical_sku: string;
  language: "ja";
  relationship: "reference";
  scope: "syntax_only";
  reason: "same_language_base_reference";
}

export const SAME_LANGUAGE_IMAGE_REFERENCE_CONTRACT = {
  version: "cambridge.same-language-image-reference.v1",
  relationship: "reference",
  scope: "syntax_only",
  reason: "same_language_base_reference",
  games: ["op", "dbf"],
  languages: ["ja"],
  meaning: "A reference to the selected base-image row in the requested SKU's own language. Requested and depicted raw keys are preserved alongside their normalized syntax candidates.",
  limitations: "No exact-printing, source-image, authenticity or publication-rights verification. A requested parallel or other variant still depicts the base print. Only the recorded One Piece and Fusion World Japanese base-image policy is supported.",
  validation: "createSameLanguageImageReference checks full SKU syntax, supported game and language, and the depicted same-language base key. JSON Schema checks structural shape only; it does not enforce those cross-field relationships.",
} as const;

export const SAME_LANGUAGE_IMAGE_REFERENCE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/SameLanguageImageReference.schema.json",
  title: "Same-language base image reference",
  description: SAME_LANGUAGE_IMAGE_REFERENCE_CONTRACT.validation,
  type: "object",
  additionalProperties: false,
  required: ["requested_sku", "requested_canonical_sku", "depicted_sku", "depicted_canonical_sku", "language", "relationship", "scope", "reason"],
  properties: {
    requested_sku: { type: "string", minLength: 1, description: "Unchanged requested identifier." },
    requested_canonical_sku: { type: "string", pattern: SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern },
    depicted_sku: { type: "string", minLength: 1, description: "Unchanged identifier from the selected image row, not a verified physical-printing identity." },
    depicted_canonical_sku: { type: "string", pattern: SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern },
    language: { enum: ["ja"], description: "The language both identifiers name." },
    relationship: { const: "reference" },
    scope: { const: "syntax_only" },
    reason: { const: "same_language_base_reference" },
  },
} as const;

/** Validate the complete input before applying the recorded same-language
 * policy. The uppercase base key is the Japanese image-table storage format. */
export function sameLanguageBaseImageKey(rawSku: string): string | null {
  if (typeof rawSku !== "string" || /\s/.test(rawSku)) return null;
  const identity = skuIdentity(rawSku);
  if (!identity || !SAME_LANGUAGE_IMAGE_REFERENCE_CONTRACT.games.some((game) => game === identity.game)
    || !SAME_LANGUAGE_IMAGE_REFERENCE_CONTRACT.languages.some((lang) => lang === identity.lang)) return null;
  return `${identity.game}-${identity.set}-${identity.number}-${identity.lang}`.toUpperCase();
}

/** Bind one requested identifier to an actual selected same-language row.
 * Null means no supported, internally consistent reference exists; the
 * caller must not publish that image for this request. */
export function createSameLanguageImageReference(requestedSku: string, depictedSku: string): SameLanguageImageReference | null {
  if (typeof depictedSku !== "string" || /\s/.test(depictedSku)) return null;
  const expected = sameLanguageBaseImageKey(requestedSku);
  if (!expected) return null;
  const requested = skuIdentity(requestedSku);
  const depicted = skuIdentity(depictedSku);
  if (!requested || !depicted || depicted.canonical_sku !== expected.toLowerCase() || depicted.lang !== "ja") return null;
  return {
    requested_sku: requested.raw_sku,
    requested_canonical_sku: requested.canonical_sku,
    depicted_sku: depicted.raw_sku,
    depicted_canonical_sku: depicted.canonical_sku,
    language: "ja",
    relationship: "reference",
    scope: "syntax_only",
    reason: "same_language_base_reference",
  };
}

/** Validate an unknown wire value, including resolver consistency and exact fields. */
export function isSameLanguageImageReference(value: unknown): value is SameLanguageImageReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.requested_sku !== "string" || typeof record.depicted_sku !== "string") return false;
  const expected = createSameLanguageImageReference(record.requested_sku, record.depicted_sku);
  if (!expected || Object.keys(record).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([key, field]) => Object.hasOwn(record, key) && record[key] === field);
}
