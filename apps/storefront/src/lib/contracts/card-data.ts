import { SKU_IDENTITY_CONTRACT, SKU_IDENTITY_SCHEMA, skuIdentity } from "@cambridge-tcg/sku";
import { MONEY_SCHEMA, NATIVE_PRICE_OBSERVATION_SCHEMA, MEMBER_PRICE_OBSERVATION_SCHEMA, PRICE_OBSERVATION_CONTRACT } from "@cambridge-tcg/data-spec";
import { createImageReference, IMAGE_REFERENCE_CONTRACT, IMAGE_REFERENCE_SCHEMA } from "@/lib/cards/image-reference";
import { createCardNumberImageReference, CARD_NUMBER_IMAGE_REFERENCE_CONTRACT, CARD_NUMBER_IMAGE_REFERENCE_SCHEMA } from "@/lib/cards/card-number-image-reference";

/** Describes existing response semantics. No source access or price publication. */
export const CARD_DATA_CONTRACT = {
  schema: "cambridgetcg.card-data-contract/1",
  reviewed_at: "2026-09-29",
  documentation: "/standards/card-data",
  identity: {
    ...SKU_IDENTITY_CONTRACT,
    example: skuIdentity("PK-SV2A-011-JP-V4K5"),
    example_scope: "Normalization example only; no catalog lookup or source-product mapping is asserted.",
    validation: { method: "POST", path: "/api/v1/identifiers/validate", documentation: "/standards/validator" },
    compatibility: "Legacy sku fields and lookup URLs remain unchanged. Search matches and card composition add identity with raw and normalized values.",
  },
  images: {
    english_base_reference: {
      ...IMAGE_REFERENCE_CONTRACT,
      status: "implemented",
      example: createImageReference("OP-OP01-001-JP-V11DZ", "OP-OP01-001-EN"),
      example_scope: "Illustrative syntax relationship only; no image row, catalog record or provider was queried.",
      representation: "Eligible English reference images carry image_url, image_attribution and image_reference together in market and universal-card responses. Universal sparse density omits all three fields. A retained catalog fallback has no English-reference claim and leaves image_reference null.",
      missing: "A null reference means this projection establishes no eligible English base-image relationship; it does not prove that card art does not exist.",
    },
    practice_card_number_reference: {
      ...CARD_NUMBER_IMAGE_REFERENCE_CONTRACT,
      status: "implemented",
      example: createCardNumberImageReference("op", "ST01-001", "OP-ST01-001-EN-P1"),
      example_scope: "Illustrative card-number request and selected English parallel key; no image row or provider was queried.",
      representation: "Starter reads use image_url, image_attribution and image_reference. Game-ready cards preserve the same values as imageUrl, imageAttribution and imageReference. The encoded practice deck remains complete when catalog/media enrichment is unavailable.",
      compatibility: "The existing ImageReference schema remains English-base-only. CardNumberImageReference is a separate shape for card-number requests, including the selected reprint or parallel suffix; it does not synthesize a requested printing SKU.",
    },
    rights: "Image identity and publication are separate checks. A valid ImageReference, self-hosted URL or attribution does not establish image rights or permission for downstream reuse.",
    planned_scope: "A complete cross-source ImageRecord, verified printing crosswalk and rights-evidence contract remain planned; this implemented reference shape does not provide them.",
  },
  prices: {
    legacy_gbp: {
      amount_type: "finite number or null",
      unit: "major",
      currency: "GBP",
      missing: "null is not zero; inspect endpoint source and publication status",
    },
    native_observations: {
      ...PRICE_OBSERVATION_CONTRACT,
      amount_type: "positive decimal string",
      unit: "major",
      conversion: "none; preserve native source currency and precision",
      identity: PRICE_OBSERVATION_CONTRACT.identity,
      timestamps: "sourceUpdatedAt describes the source; retrievedAt describes retrieval; pagination asOf is not price freshness.",
      endpoint: "/api/v1/member-prices",
      access: "account-owned member data key and permitted source/use; not public price publication",
    },
    comparability: "Compare only compatible identity, printing, language, finish, condition, metric, currency and time. Unknown dimensions remain unknown.",
    rights: "Schema validity, storage, authentication and transformation do not establish publication or reuse rights.",
  },
  schemas: {
    sku_identity: SKU_IDENTITY_SCHEMA,
    image_reference: IMAGE_REFERENCE_SCHEMA,
    card_number_image_reference: CARD_NUMBER_IMAGE_REFERENCE_SCHEMA,
    money: MONEY_SCHEMA,
    native_price_observation: NATIVE_PRICE_OBSERVATION_SCHEMA,
    member_price_observation: MEMBER_PRICE_OBSERVATION_SCHEMA,
  },
} as const;
