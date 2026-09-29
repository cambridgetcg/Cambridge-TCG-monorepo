import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import RoadmapPage from "@/app/roadmap/page";
import { GET } from "@/app/api/v1/roadmap/route";
import { DATA_FOUNDATIONS, DELIVERY_STAGES, INTEGRATION_ROADMAP } from "./index";

vi.mock("@/lib/db", () => { throw new Error("The roadmap must not read a database"); });
vi.mock("@/lib/wholesale/client", () => { throw new Error("The roadmap must not import provider readers"); });
afterEach(() => vi.unstubAllGlobals());

describe("integration roadmap contract", () => {
  it("returns the authored plan with a review timestamp, separate from response time", async () => {
    const fetch = vi.fn(() => { throw new Error("No network from the planning endpoint"); });
    vi.stubGlobal("fetch", fetch);
    const response = GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body.data).toEqual(INTEGRATION_ROADMAP);
    expect(body.data.scope).toBe("planning_snapshot");
    expect(body._meta).toMatchObject({ endpoint: "/api/v1/roadmap", as_of: `${INTEGRATION_ROADMAP.reviewed_at}T00:00:00.000Z`, license: "NOASSERTION", sources: ["authored_integration_roadmap"] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is discoverable through the reviewed OpenAPI contract without authentication", async () => {
    const { GET: getOpenApi } = await import("@/app/api/openapi.json/route");
    const spec = await (await getOpenApi()).json();
    expect(spec.paths["/api/v1/roadmap"].get).toMatchObject({ operationId: "getIntegrationRoadmap", security: [], tags: ["discovery"] });
    expect(spec.paths["/api/v1/roadmap"].get.description).toContain(INTEGRATION_ROADMAP.schema);
  });

  it("connects each public foundation to its HTML anchor and an existing source page", () => {
    const html = renderToStaticMarkup(<RoadmapPage />);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('lang="en"');
    expect(new Set(DATA_FOUNDATIONS.map((area) => area.id)).size).toBe(4);
    for (const area of DATA_FOUNDATIONS) {
      expect(html).toContain(`id="${area.id}"`);
      expect(html).toContain(`href="${area.href}"`);
      expect(existsSync(resolve(process.cwd(), "src/app", area.href.slice(1), "page.tsx"))).toBe(true);
    }
    expect(html).toContain('href="/api/v1/roadmap"');
  });

  it("keeps milestones ordered, distinct and gated by evidence", () => {
    const seen = new Set<string>();
    for (const stage of DELIVERY_STAGES) {
      expect(seen.has(stage.id)).toBe(false);
      for (const dependency of stage.dependsOn) expect(seen.has(dependency)).toBe(true);
      expect(stage.gate.trim()).not.toBe("");
      expect(["Next", "Planned"]).toContain(stage.status);
      seen.add(stage.id);
    }
    expect(seen.size).toBe(5);
  });
});
