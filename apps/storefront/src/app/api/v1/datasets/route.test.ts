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
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Array.isArray(body.data.datasets)).toBe(true);
    expect(body.data.datasets.length).toBeGreaterThan(0);
  });

  it("marks sold comps and the bulk catalog as paused status surfaces", async () => {
    const response = GET(new Request("https://example.test/api/v1/datasets"));
    const body = await response.json();
    const byId = Object.fromEntries(
      body.data.datasets.map((d: { id: string }) => [d.id, d]),
    );

    for (const id of ["sold-comps", "card-catalog", "agent-ladder"]) {
      expect(byId[id].license).toBe("NOASSERTION");
      expect(byId[id].tier).toBe("noassertion");
      expect(byId[id].availability).toBe("paused");
      expect(byId[id].records_published).toBe(false);
      expect(byId[id].distributions).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "status" })]),
      );
    }

    expect(byId["uk-collector-events"].license).toBe("NOASSERTION");
    expect(byId["uk-collector-events"].tier).toBe("noassertion");
    expect(byId["uk-collector-events"].availability).toBe("available");
    expect(byId["uk-collector-events"].records_published).toBe(true);
    expect(byId["uk-collector-events"].source_rights.length).toBeGreaterThan(0);
    expect(byId["uk-collector-events"].distributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ encoding_format: "text/calendar" }),
        expect.objectContaining({ encoding_format: "application/geo+json" }),
      ]),
    );
  });

  it("keeps mixed or undeclared record rights at NOASSERTION", async () => {
    const response = GET(new Request("https://example.test/api/v1/datasets"));
    const body = await response.json();
    const byId = Object.fromEntries(
      body.data.datasets.map((d: { id: string }) => [d.id, d]),
    );
    for (const id of ["coverage", "sources-registry", "uk-collector-events"]) {
      expect(byId[id].license).toBe("NOASSERTION");
      expect(byId[id].tier).toBe("noassertion");
      expect(byId[id].source_rights.length).toBeGreaterThan(0);
    }
    expect(byId["known-gaps"].license).toBe("CC0-1.0");
    expect(byId["known-gaps"].source_rights).toEqual([
      expect.objectContaining({
        source: "cambridge-tcg.known-gaps-registry",
        license: "cc0",
      }),
    ]);
  });

  it("?format=jsonld returns a valid schema.org DataCatalog graph for crawlers", async () => {
    const response = GET(
      new Request("https://example.test/api/v1/datasets?format=jsonld"),
    );
    const graph = await response.json();

    expect(response.headers.get("content-type")).toContain("application/ld+json");
    expect(response.headers.get("x-content-license")).toBe("CC0-1.0");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@type"]).toBe("DataCatalog");
    expect(Array.isArray(graph.dataset)).toBe(true);
    expect(graph.dataset.length).toBeGreaterThan(0);
    const ids = graph.dataset.map((d: { "@id": string }) => d["@id"]);
    expect(ids).not.toContain("https://cambridgetcg.com/datasets#sold-comps");
    expect(ids).not.toContain("https://cambridgetcg.com/datasets#card-catalog");
    expect(ids).not.toContain("https://cambridgetcg.com/datasets#agent-ladder");
    for (const d of graph.dataset) {
      expect(d["@type"]).toBe("Dataset");
      expect(typeof d.name).toBe("string");
      if (d["@id"] === "https://cambridgetcg.com/datasets#known-gaps") {
        expect(d.license).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
      } else {
        expect(d.license).toBeUndefined();
        expect(typeof d.usageInfo).toBe("string");
        expect(d.conditionsOfAccess).toContain("No response-wide reuse licence");
      }
      expect(Array.isArray(d.distribution)).toBe(true);
    }
    const eventDataset = graph.dataset.find(
      (d: { "@id": string }) => d["@id"].endsWith("#uk-collector-events"),
    );
    expect(eventDataset.license).toBeUndefined();
    expect(eventDataset.usageInfo).toBe(
      "https://cambridgetcg.com/methodology/collector-events",
    );
    expect(eventDataset.conditionsOfAccess).toContain("No response-wide reuse licence");
  });
});
