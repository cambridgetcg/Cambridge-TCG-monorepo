import { describe, expect, it } from "vitest";
import { IMAGE_REFERENCE_SCHEMA } from "./image-reference";
import {
  createSameLanguageImageReference, isSameLanguageImageReference, sameLanguageBaseImageKey,
  SAME_LANGUAGE_IMAGE_REFERENCE_CONTRACT, SAME_LANGUAGE_IMAGE_REFERENCE_SCHEMA,
} from "./same-language-image-reference";

describe("same-language image reference", () => {
  it.each([
    ["OP-OP01-001-JP", "OP-OP01-001-JA"],
    ["op-op01-001-ja-p1", "OP-OP01-001-JA"],
    ["EB-EB01-001-JP", "OP-EB01-001-JA"],
    ["FB-FB10-001-JP-P1", "DBF-FB10-001-JA"],
    ["OP-OP01-001-JP-V11DZ", "OP-OP01-001-JA"],
  ])("derives the Japanese base key %s → %s", (sku, key) => {
    expect(sameLanguageBaseImageKey(sku)).toBe(key);
  });

  it.each(["op-op01-001-en", "pkm-sv1-001-ja", "op-op01-001-ko", "OP-OP01-001-JP ", "SEALED-OP01-BOX-JP", ""])("has no Japanese key for %j", (sku) => {
    expect(sameLanguageBaseImageKey(sku)).toBeNull();
  });

  it("binds a request to its own-language base row, keeping both raw keys", () => {
    const reference = createSameLanguageImageReference("OP-OP01-001-JP-V11DZ", "OP-OP01-001-JA")!;
    expect(reference).toEqual({
      requested_sku: "OP-OP01-001-JP-V11DZ", requested_canonical_sku: "op-op01-001-ja-v11dz",
      depicted_sku: "OP-OP01-001-JA", depicted_canonical_sku: "op-op01-001-ja",
      language: "ja", relationship: "reference", scope: "syntax_only", reason: "same_language_base_reference",
    });
    expect(isSameLanguageImageReference(reference)).toBe(true);
    expect(isSameLanguageImageReference(JSON.parse(JSON.stringify(reference)))).toBe(true);
    expect(isSameLanguageImageReference({ ...reference, reason: "english_base_reference" })).toBe(false);
    expect(isSameLanguageImageReference({ ...reference, extra: 1 })).toBe(false);
  });

  it("never binds an English key, a variant row or another card", () => {
    // The English projector likewise refuses a JA key: a Japanese key never equals an English one.
    expect(createSameLanguageImageReference("OP-OP01-001-JP", "OP-OP01-001-EN")).toBeNull();
    expect(createSameLanguageImageReference("OP-OP01-001-JP", "OP-OP01-001-JA-P2")).toBeNull();
    expect(createSameLanguageImageReference("OP-OP01-001-JP", "OP-OP01-002-JA")).toBeNull();
    expect(createSameLanguageImageReference("op-op01-001-en", "OP-OP01-001-JA")).toBeNull();
  });

  it("is a new schema beside ImageReference v1, which keeps its const reason", () => {
    expect(IMAGE_REFERENCE_SCHEMA.properties.reason).toEqual({ const: "english_base_reference" });
    expect(SAME_LANGUAGE_IMAGE_REFERENCE_SCHEMA.$id).toBe("https://cambridgetcg.com/spec/v1/SameLanguageImageReference.schema.json");
    expect(SAME_LANGUAGE_IMAGE_REFERENCE_SCHEMA.additionalProperties).toBe(false);
    expect(SAME_LANGUAGE_IMAGE_REFERENCE_SCHEMA.properties.language).toMatchObject({ enum: ["ja"] });
    expect(SAME_LANGUAGE_IMAGE_REFERENCE_SCHEMA.properties.reason).toEqual({ const: "same_language_base_reference" });
    expect(SAME_LANGUAGE_IMAGE_REFERENCE_CONTRACT).toMatchObject({ games: ["op", "dbf"], languages: ["ja"], scope: "syntax_only" });
    const reference = createSameLanguageImageReference("FB-FB10-001-JP-P1", "DBF-FB10-001-JA")!;
    expect(Object.keys(reference).sort()).toEqual([...SAME_LANGUAGE_IMAGE_REFERENCE_SCHEMA.required].sort());
  });
});
