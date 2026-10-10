import { describe, expect, it } from "vitest";
import { SKU_IDENTITY_SCHEMA } from "@cambridge-tcg/sku";
import { createImageReference } from "./image-reference";
import {
  CARD_NUMBER_IMAGE_REFERENCE_SCHEMA, createCardNumberImageReference,
  englishCardNumberKey, isCardNumberImageReference,
} from "./card-number-image-reference";

describe("One Piece card-number references", () => {
  it.each([
    ["OP01-001", "OP-OP01-001-EN"],
    ["OP01-001", "OP-OP01-001-EN-P1"],
    ["op01-001", "op-op01-001-en-r1"],
    ["EB01-009", "EB-EB01-009-EN-R1"],
    ["ST15-002", "OP-ST15-002-EN-P12"],
    ["P-001", "OP-P-001-EN-R2"],
  ])("preserves request %s and selected row %s without inventing a requested SKU", (cardNumber, depictedSku) => {
    const reference = createCardNumberImageReference("op", cardNumber, depictedSku)!;
    expect(reference).toMatchObject({
      requested_game: "op", requested_card_number: cardNumber,
      requested_canonical_card_number: cardNumber.toLowerCase(), depicted_sku: depictedSku,
      relationship: "reference", scope: "syntax_only", reason: "english_card_number_reference",
    });
    expect(reference).not.toHaveProperty("requested_sku");
    expect(isCardNumberImageReference(reference)).toBe(true);
    expect(englishCardNumberKey("op", cardNumber)).toBe(`OP-${cardNumber.toUpperCase()}-EN`);
  });

  it("keeps variant semantics confined to the separate practice contract", () => {
    const depicted = "OP-OP01-001-EN-R1";
    expect(createCardNumberImageReference("op", "OP01-001", depicted)?.depicted_canonical_sku).toBe("op-op01-001-en-r1");
    expect(createImageReference("OP-OP01-001-JP", depicted)).toBeNull();
    expect(createCardNumberImageReference("op", "OP01-001", "OP-OP01-001-EN")?.relationship).toBe("reference");
  });

  it.each(["", " OP01-001", "OP01-001 ", "OP01-001\n", "OP01-001\r", "OP01\n-001", "OP01-001-P1", "OP-OP01-001-EN", "OP01", "OP01--001", "OP01-001/", "ST15-20-001"])(
    "rejects an incomplete or altered card-number request %j", (cardNumber) => {
      expect(englishCardNumberKey("op", cardNumber)).toBeNull();
      expect(createCardNumberImageReference("op", cardNumber, "OP-OP01-001-EN-P1")).toBeNull();
    },
  );

  it.each(["dbf", "pkm", "OP", "onepiece", "", "op "])("keeps the requested game boundary explicit: %j", (game) => {
    expect(englishCardNumberKey(game, "OP01-001")).toBeNull();
    expect(createCardNumberImageReference(game, "OP01-001", "OP-OP01-001-EN")).toBeNull();
  });

  it.each([
    "OP-OP01-002-EN", "OP-OP02-001-EN", "OP-OP01-1-EN", "DBF-OP01-001-EN", "OP-OP01-001-JP",
    "OP-OP01-001-EN-ALT", "OP-OP01-001-EN-P1-R1", "OP-OP01-001-EN-R", "OP-OP01-001-EN-PX",
    "OP-OP01-001-EN-", "OP-OP01-001-EN-P1\n", "OP-OP01-001-EN\n", " OP-OP01-001-EN", "OP-OP01-001-EN ",
  ])("refuses a mismatched or unsupported depicted identifier %j", (depictedSku) => {
    expect(createCardNumberImageReference("op", "OP01-001", depictedSku)).toBeNull();
  });

  it("keeps number padding and raw variant spelling intact", () => {
    const reference = createCardNumberImageReference("op", "OP01-001", "OP-OP01-001-EN-P01")!;
    expect(reference.depicted_sku).toBe("OP-OP01-001-EN-P01");
    expect(reference.depicted_canonical_sku).toBe("op-op01-001-en-p01");
    expect(englishCardNumberKey("op", "OP01-1")).toBe("OP-OP01-1-EN");
  });

  it("declares a separate strict wire shape and reuses the canonical SKU syntax", () => {
    expect(CARD_NUMBER_IMAGE_REFERENCE_SCHEMA.$id).toBe("https://cambridgetcg.com/spec/v1/CardNumberImageReference.schema.json");
    expect(CARD_NUMBER_IMAGE_REFERENCE_SCHEMA.properties.depicted_canonical_sku.pattern).toBe(SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern);
    expect(CARD_NUMBER_IMAGE_REFERENCE_SCHEMA.additionalProperties).toBe(false);
    expect(CARD_NUMBER_IMAGE_REFERENCE_SCHEMA.properties.relationship).toEqual({ const: "reference" });
    const reference = createCardNumberImageReference("op", "OP01-001", "OP-OP01-001-EN-P1")!;
    expect(Object.keys(reference).sort()).toEqual([...CARD_NUMBER_IMAGE_REFERENCE_SCHEMA.required].sort());
  });
});

describe("unknown card-number reference validation", () => {
  const reference = createCardNumberImageReference("op", "OP01-001", "OP-OP01-001-EN-P1")!;
  it.each([
    null, [], "reference", {}, { ...reference, requested_sku: "OP-OP01-001-EN" },
    { ...reference, relationship: "exact" }, { ...reference, scope: "verified" },
    { ...reference, reason: "english_base_reference" }, { ...reference, requested_game: "dbf" },
    { ...reference, requested_card_number: "OP01-002" }, { ...reference, requested_canonical_card_number: "op01-002" },
    { ...reference, depicted_canonical_sku: "op-op01-001-en" }, { ...reference, depicted_sku: "OP-OP01-001-JP-P1" },
    { ...reference, depicted_sku: null }, { ...reference, requested_card_number: 1 },
  ])("rejects a stale, incomplete or widened wire value %j", (value) => {
    expect(isCardNumberImageReference(value)).toBe(false);
  });
  it("requires own fields, not inherited assertions", () => {
    expect(isCardNumberImageReference(Object.create(reference))).toBe(false);
    expect(isCardNumberImageReference(JSON.parse(JSON.stringify(reference)))).toBe(true);
  });
});
