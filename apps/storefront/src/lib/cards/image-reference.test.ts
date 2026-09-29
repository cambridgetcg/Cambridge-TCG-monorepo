import { describe, expect, it } from "vitest";
import { SKU_IDENTITY_SCHEMA, skuIdentity } from "@cambridge-tcg/sku";
import { createImageReference, englishBaseImageKey, IMAGE_REFERENCE_CONTRACT, IMAGE_REFERENCE_SCHEMA } from "./image-reference";

describe("English base image keys", () => {
  it.each([
    ["OP-OP01-001-JP-V11DZ", "OP-OP01-001-EN"],
    ["op-op01-001-ja-v11dz", "OP-OP01-001-EN"],
    ["op-op01-001-en", "OP-OP01-001-EN"],
    ["EB-EB04-061-JP", "OP-EB04-061-EN"],
    ["op-op01-en-001", "OP-OP01-001-EN"],
    ["OP-OP01-001-ENG", "OP-OP01-001-EN"],
    ["FB-FB01-001-JP-P1", "DBF-FB01-001-EN"],
    ["dbf-fb01-001-en", "DBF-FB01-001-EN"],
    ["op-op01-001-zz-foil-alt", "OP-OP01-001-EN"],
  ])("resolves complete shared syntax %s without claiming a printing", (raw, expected) => {
    expect(englishBaseImageKey(raw)).toBe(expected);
  });

  it.each([
    "", "OP-OP01-001-", "op-op01-001-ja-", "op-op01-001--p1",
    "op-op01-001-japanese", "op-op01-001-en-foo/", "op-op01-001-en-alt--foil",
    " op-op01-001-en", "op-op01-001-en ", "op--001-en", "P-001-JP",
    "SEALED-OP01-BOX-JP", "unknown-op01-001-en",
  ])("rejects malformed complete identifier %j", (raw) => {
    expect(englishBaseImageKey(raw)).toBeNull();
    expect(createImageReference(raw, "OP-OP01-001-EN")).toBeNull();
  });

  it.each(["pkm-sv2a-011-ja", "PK-SV2A-011-JP-V4K5", "mtg-otj-001-en", "dbs-bt01-001-en", "tst-set-001-en"])(
    "does not turn a registered but unsupported game into an English mapping: %s", (raw) => {
      expect(skuIdentity(raw)).not.toBeNull();
      expect(englishBaseImageKey(raw)).toBeNull();
    },
  );

  it("preserves significant collector-number zeros", () => {
    expect(englishBaseImageKey("op-op01-001-ja")).toBe("OP-OP01-001-EN");
    expect(englishBaseImageKey("op-op01-1-ja")).toBe("OP-OP01-1-EN");
    expect(createImageReference("op-op01-001-ja", "OP-OP01-1-EN")).toBeNull();
  });
});

describe("per-request image relationships", () => {
  it("preserves requested and selected raw keys with their separate syntax candidates", () => {
    expect(createImageReference("OP-OP01-001-JP-V11DZ", "OP-OP01-001-EN")).toEqual({
      requested_sku: "OP-OP01-001-JP-V11DZ",
      requested_canonical_sku: "op-op01-001-ja-v11dz",
      depicted_sku: "OP-OP01-001-EN",
      depicted_canonical_sku: "op-op01-001-en",
      relationship: "reference", scope: "syntax_only", reason: "english_base_reference",
    });
  });

  it("keeps an English base syntax match reference-only", () => {
    const reference = createImageReference("op-op01-001-en", "OP-OP01-001-EN");
    expect(reference?.requested_canonical_sku).toBe(reference?.depicted_canonical_sku);
    expect(reference?.relationship).toBe("reference");
    expect(reference?.scope).toBe("syntax_only");
  });

  it("does not collapse requested opaque variant order or leak a previous request", () => {
    const first = createImageReference("op-op01-001-ja-foil-alt", "OP-OP01-001-EN");
    const second = createImageReference("op-op01-001-ja-alt-foil", "OP-OP01-001-EN");
    expect(first?.requested_canonical_sku).toBe("op-op01-001-ja-foil-alt");
    expect(second?.requested_canonical_sku).toBe("op-op01-001-ja-alt-foil");
    expect(first?.depicted_sku).toBe(second?.depicted_sku);
    expect(first).not.toBe(second);
  });

  it("preserves a selected legacy alias while checking its canonical base", () => {
    expect(createImageReference("EB-EB04-061-JP", "EB-EB04-061-EN")).toMatchObject({
      requested_sku: "EB-EB04-061-JP", requested_canonical_sku: "op-eb04-061-ja",
      depicted_sku: "EB-EB04-061-EN", depicted_canonical_sku: "op-eb04-061-en",
    });
  });

  it.each([
    "OP-OP01-001-EN-P1", "OP-OP01-001-JP", "OP-OP01-002-EN", "OP-OP02-001-EN",
    "DBF-OP01-001-EN", "OP-OP01-001-EN-", "OP-OP01-001-EN-foo/", "OP-OP01-001-EN ",
    "OP-OP01-001-", "OP-OP01-001-japanese", "", "SEALED-OP01-BOX-EN",
  ])("refuses a mismatched or malformed selected image key %j", (depicted) => {
    expect(createImageReference("OP-OP01-001-JP-V11DZ", depicted)).toBeNull();
  });

  it("publishes a bounded schema that fixes reference-only semantics and reuses canonical syntax", () => {
    expect(IMAGE_REFERENCE_SCHEMA.properties.requested_canonical_sku.pattern).toBe(SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern);
    expect(IMAGE_REFERENCE_SCHEMA.properties.depicted_canonical_sku.pattern).toBe(SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern);
    expect(IMAGE_REFERENCE_SCHEMA.properties.relationship).toEqual({ const: "reference" });
    expect(IMAGE_REFERENCE_SCHEMA.properties.scope).toEqual({ const: "syntax_only" });
    expect(IMAGE_REFERENCE_SCHEMA.properties.reason).toEqual({ const: "english_base_reference" });
    expect(IMAGE_REFERENCE_SCHEMA.additionalProperties).toBe(false);
    expect(IMAGE_REFERENCE_CONTRACT.games).toEqual(["op", "dbf"]);
    const reference = createImageReference("OP-OP01-001-JP-V11DZ", "OP-OP01-001-EN")!;
    expect(Object.keys(reference).sort()).toEqual([...IMAGE_REFERENCE_SCHEMA.required].sort());
    const canonicalPattern = new RegExp(SKU_IDENTITY_SCHEMA.properties.canonical_sku.pattern);
    expect(canonicalPattern.test(reference.requested_canonical_sku)).toBe(true);
    expect(canonicalPattern.test(reference.depicted_canonical_sku)).toBe(true);
  });
});
