import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/play/starters rights boundary", () => {
  it("aligns the catalog with the mixed-rights detail response", async () => {
    const response = await GET(
      new Request("https://cambridgetcg.example/api/v1/play/starters"),
    );
    const body = await response.json();

    expect(body._meta.sources).toEqual([
      "ctcg-derived",
      "starter-deck-source-pages",
    ]);
    expect(body._meta.source_license).toEqual(["cc0", "proprietary"]);
    expect(body._meta.license).toBe("NOASSERTION");
    for (const starter of body.data.starters) {
      expect(starter.rights).toEqual({
        cambridge_authored_commentary: "CC0-1.0",
        source_derived_product_and_deck_facts: "NOASSERTION",
      });
    }
  });
});
