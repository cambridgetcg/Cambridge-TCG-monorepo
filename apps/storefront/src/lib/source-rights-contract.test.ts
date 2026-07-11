import { describe, expect, it } from "vitest";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { EXAMPLES } from "@/lib/examples";
import { GUIDES } from "@/lib/guides";
import { MANIFEST } from "@/lib/manifest";

function manifestDescription(id: string): string {
  const resource = Object.values(MANIFEST.resources)
    .flat()
    .find((candidate) => candidate.id === id);
  if (!resource) throw new Error(`missing manifest resource ${id}`);
  return resource.description;
}

describe("public source-rights contracts", () => {
  it("keeps OpenAPI mixed price responses aligned with runtime NOASSERTION", async () => {
    const response = await getOpenApi();
    const spec = (await response.json()) as {
      paths: Record<string, { get: { description: string } }>;
    };

    expect(spec.paths["/api/v1/prices/games/{game}"].get.description)
      .toContain("NOASSERTION");
    expect(spec.paths["/api/v1/prices/games/{game}/sets/{set}"].get.description)
      .toContain("NOASSERTION");
  });

  it("does not advertise catalog-backed manifest resources as CC0 payloads", () => {
    for (const id of [
      "storefront.search.cards",
      "storefront.federation.identify_at",
      "storefront.buy_the_kingdom",
    ]) {
      expect(manifestDescription(id)).toContain("NOASSERTION");
    }
  });

  it("tells guide and example readers to preserve rather than invent rights", () => {
    const firstRequest = GUIDES.find((guide) => guide.slug === "first-request");
    const citation = GUIDES.find((guide) => guide.slug === "cite-cambridge-tcg");
    const welcomeExample = EXAMPLES.find((example) => example.endpoint_id === "welcome");

    expect(JSON.stringify(firstRequest)).toContain("NOASSERTION");
    expect(JSON.stringify(citation)).toContain("absence means undeclared, not CC0");
    expect(JSON.stringify(citation)).not.toContain("Catalog and price data from Cambridge TCG (https://cambridgetcg.com) — CC0-1.0");
    expect(JSON.stringify(welcomeExample)).toContain("Absence means undeclared, not CC0");
  });
});
