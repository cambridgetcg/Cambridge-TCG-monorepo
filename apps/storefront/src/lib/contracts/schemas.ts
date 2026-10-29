import {
  MONEY_SCHEMA, NATIVE_PRICE_OBSERVATION_SCHEMA, MEMBER_PRICE_OBSERVATION_SCHEMA,
  ENVELOPE_SCHEMA, META_SCHEMA, ERROR_BODY_SCHEMA, PROVENANCE_SCHEMA,
} from "@cambridge-tcg/data-spec";
import { CARD_NAME_SCHEMA, SKU_IDENTITY_SCHEMA } from "@cambridge-tcg/sku";
import { IMAGE_REFERENCE_SCHEMA } from "@/lib/cards/image-reference";
import { CARD_NUMBER_IMAGE_REFERENCE_SCHEMA } from "@/lib/cards/card-number-image-reference";

/** Only reviewed static schemas may be served. No paths derived from user input. */
export const PUBLIC_SCHEMAS = {
  "SkuIdentity.schema.json": SKU_IDENTITY_SCHEMA,
  "ImageReference.schema.json": IMAGE_REFERENCE_SCHEMA,
  "CardNumberImageReference.schema.json": CARD_NUMBER_IMAGE_REFERENCE_SCHEMA,
  "Money.schema.json": MONEY_SCHEMA,
  "NativePriceObservation.schema.json": NATIVE_PRICE_OBSERVATION_SCHEMA,
  "MemberPriceObservation.schema.json": MEMBER_PRICE_OBSERVATION_SCHEMA,
  "Envelope.schema.json": ENVELOPE_SCHEMA,
  "Meta.schema.json": META_SCHEMA,
  "ErrorBody.schema.json": ERROR_BODY_SCHEMA,
  "Provenance.schema.json": PROVENANCE_SCHEMA,
  "CardName.schema.json": CARD_NAME_SCHEMA,
} as const;
