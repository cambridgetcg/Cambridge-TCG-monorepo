import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { SKU_IDENTITY_SCHEMA, skuIdentity } from "../../../sku/src/identity";

const validate = new Ajv2020().compile(SKU_IDENTITY_SCHEMA);

describe("shared SKU identity schema", () => {
  it.each(["op-op01-001-ja", "PK-SV2A-011-JP-V4K5", "op-op01-001-en-alt-art"])("describes normalized identity for %s", input => {
    const identity = skuIdentity(input);
    expect(identity).not.toBeNull();
    expect(validate(identity), JSON.stringify(validate.errors)).toBe(true);
    expect(identity?.raw_sku).toBe(input);
    expect(identity?.scope).toBe("syntax_only");
  });
  it("rejects misleading scope and undeclared properties", () => {
    const identity = skuIdentity("op-op01-001-ja");
    expect(validate({ ...identity, scope: "verified_printing" })).toBe(false);
    expect(validate({ ...identity, game: "unknown" })).toBe(false);
    expect(validate({ ...identity, secret: "unexpected-field" })).toBe(false);
    expect(validate({ ...identity, lang: "Japanese" })).toBe(false);
  });
});
