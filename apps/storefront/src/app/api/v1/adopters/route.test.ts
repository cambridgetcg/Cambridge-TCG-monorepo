import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/adopters rights boundary", () => {
  it("separates CC0 registry specifications from implementation rights", async () => {
    const response = await GET();
    const body = await response.json();
    const standards = Object.values(body.data.standards) as Array<
      Record<string, unknown>
    >;

    expect(body.data.adopter_entry_default_license).toBe("NOASSERTION");
    expect(body._meta.sources).toEqual(["ctcg-derived"]);
    expect(body._meta.license).toBe("CC0-1.0");
    for (const standard of standards) {
      expect(standard.spec_license).toBe("CC0-1.0");
      expect(standard.implementation_license).toBe("NOASSERTION");
      expect(standard).not.toHaveProperty("license");
    }
  });
});
