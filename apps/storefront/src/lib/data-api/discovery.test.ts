import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: dbQuery, transaction: vi.fn() }));
import * as reference from "@/app/api/v1/market/reference/route";
import * as history from "@/app/api/v1/market/reference/history/route";
import * as indices from "@/app/api/v1/market/indices/route";
import * as premiums from "@/app/api/v1/market/premiums/route";
import * as exported from "@/app/api/v1/market/export/route";
import * as usage from "@/app/api/v1/account/usage/route";
import * as plans from "@/app/api/v1/plans/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { assessResponse, expectedFor } from "../../../scripts/deploy-verify-contract";
import { DATA_API_OPENAPI_PATHS, publishedDataApiPaths } from "./openapi";

const routes = { "/api/v1/market/reference": reference, "/api/v1/market/reference/history": history, "/api/v1/market/indices": indices,
  "/api/v1/market/premiums": premiums, "/api/v1/market/export": exported, "/api/v1/account/usage": usage } as const;
const request = (path: string) => new Request(`https://cambridgetcg.com${path}`);
afterEach(() => vi.unstubAllEnvs());

describe("discovery waits for publication", () => {
  it("registers each operation exactly while its route serves: the reads with DATA_API_READS, the catalogue with DATA_API_PLANS_PUBLISHED", async () => {
    const readPaths = Object.keys(DATA_API_OPENAPI_PATHS).filter(path => path !== "/api/v1/plans");
    expect(readPaths).toEqual([...Object.keys(routes)]);
    for (const [reads, plansOn, expected] of [
      [undefined, undefined, []], ["on", undefined, readPaths], [undefined, "on", ["/api/v1/plans"]], ["on", "on", Object.keys(DATA_API_OPENAPI_PATHS)],
    ] as const) {
      vi.unstubAllEnvs();
      if (reads) vi.stubEnv("DATA_API_READS", reads);
      if (plansOn) vi.stubEnv("DATA_API_PLANS_PUBLISHED", plansOn);
      expect(Object.keys(publishedDataApiPaths())).toEqual(expected);
      const spec = await (await getOpenApi()).json();
      for (const path of Object.keys(DATA_API_OPENAPI_PATHS)) expect(Boolean(spec.paths[path]), `${path} reads=${reads} plans=${plansOn}`).toBe((expected as readonly string[]).includes(path));
      // Row schemas describe the reads' results and arrive with them.
      expect(Boolean(spec.components.schemas.MarketReferencePrice)).toBe(reads === "on");
      expect(spec.tags.some((tag: { name: string }) => tag.name === "market-data")).toBe(expected.length > 0);
      // A route that does not serve is not advertised: an unpublished read answers 404.
      for (const path of readPaths) expect((await routes[path as keyof typeof routes].GET(request(path))).status).toBe(reads === "on" ? 401 : 404);
    }
    vi.unstubAllEnvs();
    const unpublished = await (await getOpenApi()).json();
    vi.stubEnv("DATA_API_READS", "on");
    vi.stubEnv("DATA_API_PLANS_PUBLISHED", "on");
    const published = await (await getOpenApi()).json();
    expect(published.paths["/api/v1/member-prices"]).toEqual(unpublished.paths["/api/v1/member-prices"]);
    for (const [path, operation] of Object.entries(DATA_API_OPENAPI_PATHS)) {
      expect(published.paths[path]).toEqual(JSON.parse(JSON.stringify(operation)));
      expect(published.paths[path].get.security).toEqual(path === "/api/v1/plans" ? [] : [{ MemberDataKey: [] }]);
    }
    expect(published.components.schemas.MarketReferencePrice.$id).toBe("https://cambridgetcg.com/spec/v1/MarketReferencePrice.schema.json");
    expect(published.tags.map((tag: { name: string }) => tag.name)).toContain("market-data");
    expect(JSON.stringify(published.paths["/api/v1/market/export"])).toContain("not licensed for AI training");
  });

  it("meets deploy-verify's member-key contract once the manifest lists the routes, without touching storage", async () => {
    vi.stubEnv("DATA_API_READS", "on");
    vi.stubEnv("DATA_API_PLANS_PUBLISHED", "on");
    for (const [path, route] of Object.entries(routes)) {
      const resource = { id: `storefront.data_api.${path}`, path, host: "storefront" as const, methods: ["GET"], auth: "member-key" };
      expect(expectedFor(resource).codes).toEqual([401]);
      expect((await assessResponse(resource, await route.GET(request(path)))).passed, path).toBe(true);
    }
    expect(dbQuery).not.toHaveBeenCalled();
    const catalogue = { id: "storefront.data_api.plans", path: "/api/v1/plans", host: "storefront" as const, methods: ["GET"], auth: "public" };
    expect((await assessResponse(catalogue, await plans.GET())).passed).toBe(true);
  });
});
