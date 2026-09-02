import { describe, expect, it } from "vitest";
import { detectAudience, listAudienceRules } from "./audience-detection";

describe("PRISM Signals audience routing", () => {
  it("classifies the branded preview and terms for traders", () => {
    expect(detectAudience("/prism-signals")).toBe("trader");
    expect(detectAudience("/prism-signals/terms")).toBe("trader");
  });

  it("declares the exact prefix once", () => {
    expect(
      listAudienceRules().filter((rule) => rule.prefix === "/prism-signals"),
    ).toEqual([{ prefix: "/prism-signals", audience: "trader" }]);
  });
});
