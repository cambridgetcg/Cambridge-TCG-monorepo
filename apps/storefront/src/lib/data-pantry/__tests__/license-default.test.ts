import { describe, expect, it } from "vitest";
import { envelope } from "../envelope";

describe("response-level licence defaults", () => {
  it("does not turn an omitted rights decision into a CC0 grant", () => {
    const result = envelope({
      data: { example: true },
      endpoint: "/api/v1/example",
      sources: ["mixed-or-unreviewed-source"],
    });

    expect(result._meta.license).toBe("NOASSERTION");
  });

  it("allows Cambridge-authored material to opt into CC0 explicitly", () => {
    const result = envelope({
      data: { methodology: true },
      endpoint: "/api/v1/methodology-example",
      sources: ["ctcg-derived"],
      source_license: ["cc0"],
      license: "CC0-1.0",
    });

    expect(result._meta.license).toBe("CC0-1.0");
    expect(result._meta.source_license).toEqual(["cc0"]);
  });
});
