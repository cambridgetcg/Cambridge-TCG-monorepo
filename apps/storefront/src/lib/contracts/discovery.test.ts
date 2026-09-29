import { describe, expect, it, vi } from "vitest";
import { GET as getRooms } from "@/app/api/v1/rooms/route";
import { GET as getContract } from "@/app/api/v1/contracts/card-data/route";
import { GET as getSchema } from "@/app/spec/v1/[schema]/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { getPublicRoomDirectory } from "@/lib/rooms/directory";
import { PUBLIC_SCHEMAS } from "./schemas";
import { CARD_DATA_CONTRACT } from "./card-data";
import { discoveryResources, publicSitemap } from "@/lib/public-discovery";

vi.mock("server-only", () => ({}));

describe("public room and card contract discovery", () => {
  it("serves the same allowlisted rooms as the visitor map, without contributor context", async () => {
    const response = getRooms();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual(getPublicRoomDirectory());
    expect(body.data.rooms).toHaveLength(8);
    expect(body.data.trails).toHaveLength(3);
    expect(JSON.stringify(body.data)).not.toMatch(/modulePaths|proposedCanonicalPath|editorialState|\/admin|\/Users\//);
    expect(body._meta.as_of).toBe("2026-09-29T00:00:00.000Z");
  });

  it("preserves identity scope, native units and source access rules in the contract", async () => {
    const body = await getContract().json();
    expect(body.data).toEqual(CARD_DATA_CONTRACT);
    expect(body.data.identity.example).toMatchObject({ raw_sku: "PK-SV2A-011-JP-V4K5", canonical_sku: "pkm-sv2a-011-ja-v4k5", scope: "syntax_only" });
    expect(body.data.prices.legacy_gbp).toMatchObject({ currency: "GBP", unit: "major" });
    expect(body.data.prices.native_observations.amount_type).toBe("positive decimal string");
    expect(body.data.prices.native_observations.access).toContain("member data key");
    expect(body.data).not.toHaveProperty("observations");
  });

  it.each(Object.entries(PUBLIC_SCHEMAS))("serves %s at its exact declared $id", async (name, schema) => {
    const url = new URL(schema.$id);
    expect(url.pathname).toBe(`/spec/v1/${name}`);
    const response = await getSchema(new Request(url), { params: Promise.resolve({ schema: name }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/schema+json");
    expect(await response.json()).toEqual(schema);
  });

  it.each(["__proto__", "constructor", "../../private", "Unknown.schema.json"])("rejects unlisted schema %s", async (name) => {
    const response = await getSchema(new Request("https://example.test/spec"), { params: Promise.resolve({ schema: name }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown_schema" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("connects contracts to OpenAPI, curated discovery and human references", async () => {
    const spec = await (await getOpenApi()).json();
    const resources = discoveryResources();
    for (const path of ["/api/v1/rooms", "/api/v1/contracts/card-data"]) {
      expect(spec.paths[path].get.security).toEqual([]);
      expect(resources.find((r) => r.path === path)).toMatchObject({ auth: "public", provenance: "static", contract: "envelope" });
    }
    expect(spec.components.schemas.Money).toEqual(PUBLIC_SCHEMAS["Money.schema.json"]);
    expect(spec.components.schemas.MemberPriceObservation).toEqual(PUBLIC_SCHEMAS["MemberPriceObservation.schema.json"]);
    expect(spec.components.schemas.ResponseMeta).toEqual(PUBLIC_SCHEMAS["Meta.schema.json"]);
    const sitemap = publicSitemap();
    for (const path of ["/map", "/standards/card-data", "/guides/read-a-card"]) {
      expect(sitemap.some((entry) => entry.url === `https://cambridgetcg.com${path}`)).toBe(true);
    }
  });
});
