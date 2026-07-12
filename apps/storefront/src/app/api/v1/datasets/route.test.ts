import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/datasets", () => {
  it("wraps the registry in a CC0 envelope with parallel source_license", async () => {
    const response = GET(new Request("https://example.test/api/v1/datasets"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body._meta.endpoint).toBe("/api/v1/datasets");
    // The catalog metadata (our own dataset descriptions) is first-party CC0.
    expect(body._meta.license).toBe("CC0-1.0");
    expect(body._meta.sources).toEqual(["cambridge-tcg.dataset-registry"]);
    expect(body._meta.source_license).toEqual(["cc0"]);
    // Parity is the invariant the envelope + redistribution audit both rely on.
    expect(body._meta.source_license).toHaveLength(body._meta.sources.length);
    expect(Array.isArray(body.data.datasets)).toBe(true);
    expect(body.data.datasets.length).toBeGreaterThan(0);
  });

  it("states each dataset's TRUE licence — sold-comps CC0, card catalogue NOASSERTION", async () => {
    const response = GET(new Request("https://example.test/api/v1/datasets"));
    const body = await response.json();
    const byId = Object.fromEntries(
      body.data.datasets.map((d: { id: string }) => [d.id, d]),
    );

    expect(byId["sold-comps"].license).toBe("CC0-1.0");
    expect(byId["sold-comps"].tier).toBe("cc0");

    // The mixed-rights catalogue must NEVER be relabelled CC0 — this mirrors
    // the redistribution audit's Check 3 on /data/catalog.jsonl.
    expect(byId["card-catalog"].license).toBe("NOASSERTION");
    expect(byId["card-catalog"].tier).toBe("noassertion");
  });

  it("no dataset in the catalog falsely claims CC0 for mixed-upstream data", async () => {
    const response = GET(new Request("https://example.test/api/v1/datasets"));
    const body = await response.json();
    for (const d of body.data.datasets) {
      if (d.tier === "noassertion") {
        expect(d.license).not.toBe("CC0-1.0");
      }
      if (d.license === "CC0-1.0") {
        expect(d.tier).toBe("cc0");
      }
    }
  });

  it("?format=jsonld returns a valid schema.org DataCatalog graph for crawlers", async () => {
    const response = GET(
      new Request("https://example.test/api/v1/datasets?format=jsonld"),
    );
    const graph = await response.json();

    expect(response.headers.get("content-type")).toContain("application/ld+json");
    expect(response.headers.get("x-content-license")).toBe("CC0-1.0");
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@type"]).toBe("DataCatalog");
    expect(Array.isArray(graph.dataset)).toBe(true);
    expect(graph.dataset.length).toBeGreaterThan(0);
    for (const d of graph.dataset) {
      expect(d["@type"]).toBe("Dataset");
      expect(typeof d.name).toBe("string");
      expect(typeof d.license).toBe("string");
      expect(Array.isArray(d.distribution)).toBe(true);
    }
  });
});
