import { SKU_IDENTITY_SCHEMA, skuIdentity } from "@cambridge-tcg/sku";

/** Describes the selected image row's relationship to a requested identifier.
 * Neither key verifies the depicted physical printing or publication rights. */
export interface ImageReference {
  requested_sku: string;
  requested_canonical_sku: string;
  depicted_sku: string;
  depicted_canonical_sku: string;
  relationship: "reference";
  scope: "syntax_only";
  reason: "english_base_reference";
}

export const IMAGE_REFERENCE_CONTRACT = {
  version: "cambridge.image-reference.v1",
  relationship: "reference",
  scope: "syntax_only",
  reason: "english_base_reference",
  games: ["op", "dbf"],
  meaning: "A reference to the selected English base-image row. Requested and depicted raw keys are preserved alongside their normalized syntax candidates.",
  limitations: "No exact-printing, source-image, authenticity or publication-rights verification. Matching canonical keys still produce a reference. Only the recorded One Piece and Fusion World English-base mapping policy is supported.",
  validation: "createImageReference checks full SKU syntax, supported game and the depicted English base key. JSON Schema checks structural shape only; it does not enforce those cross-field relationships.",
} as const;

/** The public shape is additive; publication decisions remain with the caller. */
export const IMAGE_REFERENCE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/ImageReference.schema.json",
  title: "English base image reference",
  description: IMAGE_REFERENCE_CONTRACT.validation,
  type: "object",
  additionalProperties: false,
  required: ["requested_sku", "requested_canonical_sku", "depicted_sku", "depicted_canonical_sku", "relationship", "scope", "reason"],
  properties: {
    requested_sku: { type: "string", minLength: 1, description: "Unchanged requested identifier." },
    requested_canonical_sku: { type: "string", pattern: SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern },
    depicted_sku: { type: "string", minLength: 1, description: "Unchanged identifier from the selected image row, not a verified physical-printing identity." },
    depicted_canonical_sku: { type: "string", pattern: SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern },
    relationship: { const: "reference" },
    scope: { const: "syntax_only" },
    reason: { const: "english_base_reference" },
  },
} as const;

/** Validate the complete input before applying the recorded English-base policy.
 * The uppercase base key preserves the existing EN image-table storage format. */
export function englishBaseImageKey(rawSku: string): string | null {
  const identity = skuIdentity(rawSku);
  if (!identity || !IMAGE_REFERENCE_CONTRACT.games.some((game) => game === identity.game)) return null;
  return `${identity.game}-${identity.set}-${identity.number}-en`.toUpperCase();
}

/** Bind one requested identifier to an actual selected image-row identifier.
 * Null means no supported, internally consistent reference can be established;
 * the caller must not publish that image as a reference for this request. */
export function createImageReference(requestedSku: string, depictedSku: string): ImageReference | null {
  const expected = englishBaseImageKey(requestedSku);
  if (!expected) return null;
  const requested = skuIdentity(requestedSku);
  const depicted = skuIdentity(depictedSku);
  if (!requested || !depicted || depicted.canonical_sku !== expected.toLowerCase()) return null;
  return {
    requested_sku: requested.raw_sku,
    requested_canonical_sku: requested.canonical_sku,
    depicted_sku: depicted.raw_sku,
    depicted_canonical_sku: depicted.canonical_sku,
    relationship: "reference",
    scope: "syntax_only",
    reason: "english_base_reference",
  };
}
