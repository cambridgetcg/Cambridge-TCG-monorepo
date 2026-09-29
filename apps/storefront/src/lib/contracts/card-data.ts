import { SKU_IDENTITY_CONTRACT, SKU_IDENTITY_SCHEMA, skuIdentity } from "@cambridge-tcg/sku";
import { MONEY_SCHEMA, NATIVE_PRICE_OBSERVATION_SCHEMA, MEMBER_PRICE_OBSERVATION_SCHEMA, PRICE_OBSERVATION_CONTRACT } from "@cambridge-tcg/data-spec";

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
    money: MONEY_SCHEMA,
    native_price_observation: NATIVE_PRICE_OBSERVATION_SCHEMA,
    member_price_observation: MEMBER_PRICE_OBSERVATION_SCHEMA,
  },
} as const;
