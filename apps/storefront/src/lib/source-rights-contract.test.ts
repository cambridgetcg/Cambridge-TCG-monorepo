import { describe, expect, it } from "vitest";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { EXAMPLES } from "@/lib/examples";
import { GUIDES } from "@/lib/guides";
import { MANIFEST } from "@/lib/manifest";
import {
  LEGACY_WHOLESALE_FIELD_PUBLICATION_ENABLED,
  withholdUnreviewedWholesaleFields,
} from "@/lib/public-wholesale-fields";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function manifestResource(id: string) {
  const resource = Object.values(MANIFEST.resources)
    .flat()
    .find((candidate) => candidate.id === id);
  if (!resource) throw new Error(`missing manifest resource ${id}`);
  return resource;
}

function manifestDescription(id: string): string {
  return manifestResource(id).description;
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
    expect(spec.paths["/api/at/{date}/card/{sku}"].get.description)
      .toContain("does not reconstruct historical price or structural state");
    expect(spec.paths["/api/v1/federation/at/{date}/{hash}"].get.description)
      .toContain("requested date does not affect the hash");
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

  it("does not promise access to raw quarantine payloads", () => {
    const list = manifestDescription("wholesale.ingest_quarantine.list");
    const detail = manifestDescription("wholesale.ingest_quarantine.detail");

    expect(list).toContain("never returns raw_payload itself");
    expect(list).toContain("detail door is closed");
    expect(detail).toContain("HTTP 503");
    expect(detail).toContain("before authentication or database access");
    expect(detail).not.toContain("GET returns the row");
  });

  it("describes wholesale price routes as public status-only boundaries", () => {
    for (const id of ["wholesale.prices.list", "wholesale.prices.single"]) {
      const resource = manifestResource(id);
      expect(resource.description).toContain("HTTP 503");
      expect(resource.description).toContain("before authentication or database access");
      expect(resource.auth).toBe("public");
      expect(resource.provenance).toBe("static");
    }
  });

  it("does not describe structural federation hashes as price-dependent", () => {
    const current = manifestDescription("storefront.federation.identify");
    const dated = manifestDescription("storefront.federation.identify_at");

    expect(current).toContain("Price and capture-date inputs are fixed to null");
    expect(current).toContain("price-dependent scheme are not resolvable");
    expect(dated).toContain("does not reconstruct historical prices");
    expect(dated).toContain("requested date does not affect the hash");
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

  it("withholds legacy price and image sentinels instead of substituting zero", () => {
    const projected = withholdUnreviewedWholesaleFields({
      price_gbp: 1234.56,
      channel_price: 2345.67,
      image_url: "https://www.cardrush-op.jp/sentinel.jpg",
      sku: "sentinel",
    });

    expect(LEGACY_WHOLESALE_FIELD_PUBLICATION_ENABLED).toBe(false);
    expect(projected).toEqual({
      price_gbp: null,
      channel_price: null,
      image_url: null,
      sku: "sentinel",
    });
  });

  it("keeps public history routes free of legacy archive reads", () => {
    for (const file of [
      "src/app/api/v1/cards/[sku]/cardrush-history/route.ts",
      "../wholesale/src/app/api/v1/cardrush/history/[sku]/route.ts",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/priceArchive|price_archive|fetchCardrushHistory/);
      expect(source).toMatch(/503|SOURCE_UNAVAILABLE/);
    }
  });
});
