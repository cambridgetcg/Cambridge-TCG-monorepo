import { describe, expect, it } from "vitest";
import { resolveGameToken, skuIdentity } from "../identity";

describe("SKU identity candidates", () => {
  it("preserves storage identifiers while normalizing legacy syntax", () => {
    expect(skuIdentity("PK-SV2A-011-JP-V4K5")).toEqual({
      raw_sku: "PK-SV2A-011-JP-V4K5", canonical_sku: "pkm-sv2a-011-ja-v4k5",
      game: "pkm", set: "sv2a", number: "011", lang: "ja", variant: "v4k5", scope: "syntax_only",
    });
    expect(skuIdentity("pkm-svobf-en-006")?.canonical_sku).toBe("pkm-svobf-006-en");
  });
  it("rejects missing identity and unknown games without inventing segments", () => {
    for (const value of ["P-001-JP", "unknown-set-001-en", "op--001-ja", "op-op01-001-ja-"])
      expect(skuIdentity(value)).toBeNull();
  });
  it("keeps significant zeros and variant order; language is syntax only", () => {
    expect(skuIdentity("op-op01-001-zz-foil-alt")?.canonical_sku).toBe("op-op01-001-zz-foil-alt");
    expect(skuIdentity("op-op01-1-ja")?.canonical_sku).not.toBe(skuIdentity("op-op01-001-ja")?.canonical_sku);
  });
});

describe("game tokens", () => {
  it.each(["op", "OP", "one-piece", "onepiece", "One Piece TCG", "EB"])("resolves explicit alias %s", (token) => {
    expect(resolveGameToken(token)).toBe("op");
  });
  it("does not confuse similarly named games or accept prefixes", () => {
    expect(resolveGameToken("pokemon")).toBe("pkm");
    expect(resolveGameToken("pokemon-pocket")).toBe("pkp");
    expect(resolveGameToken("dragon-ball-super")).toBe("dbs");
    for (const token of ["one", "pok", "unknown", "constructor", "__proto__", ""])
      expect(resolveGameToken(token)).toBeNull();
  });
});
