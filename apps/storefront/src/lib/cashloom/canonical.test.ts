import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Id } from "./canonical";

describe("browser-safe CashLoom canonical helpers", () => {
  it("preserves locale-independent canonical bytes", () => {
    expect(canonicalJson({ z: 1, a: 2, A: 3, 10: 4, 2: 5 })).toBe(
      '{"10":4,"2":5,"A":3,"a":2,"z":1}',
    );
  });

  it("matches the platform SHA-256 implementation without importing Node at runtime", () => {
    const canonical = canonicalJson({ purpose: "dojo", findings: [] });
    const expected = createHash("sha256").update(canonical, "utf8").digest("hex");

    expect(sha256Id(canonical)).toBe(`sha256:${expected}`);
    expect(sha256Id("")).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("rejects non-JSON and lossy numeric inputs", () => {
    expect(() => canonicalJson(1.5)).toThrow(/safe integers/);
    expect(() => canonicalJson(undefined)).toThrow(/only JSON values/);
  });
});
