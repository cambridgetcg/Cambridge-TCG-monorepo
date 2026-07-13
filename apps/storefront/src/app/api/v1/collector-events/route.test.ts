import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/collector-events", () => {
  it("publishes a mixed-rights, explicitly incomplete source-backed list", async () => {
    const response = GET(new Request("https://example.test/api/v1/collector-events"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body._meta.endpoint).toBe("/api/v1/collector-events");
    expect(body._meta.license).toBe("NOASSERTION");
    expect(body._meta.source_license).toBeUndefined();
    expect(body._meta.freshness_seconds).toBe(604800);
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(body.data.comprehensive).toBe(false);
    expect(body.data.count).toBe(4);
    expect(body.data.bounded_static_seed).toBe(true);
    expect(body.data.pagination).toBeNull();
    expect(body.data.events.every((event: { field_sources: object }) => event.field_sources)).toBe(true);
  });

  it("filters by organisation and rejects invalid dates", async () => {
    const allResponse = GET(new Request("https://example.test/api/v1/collector-events"));
    const all = await allResponse.json();
    const organisationId = all.data.events[0].organisation_relations[0].organisation_id;
    const filteredResponse = GET(
      new Request(
        `https://example.test/api/v1/collector-events?organisation_id=${organisationId}`,
      ),
    );
    const filtered = await filteredResponse.json();
    expect(filtered.data.count).toBeGreaterThan(0);
    expect(
      filtered.data.events.every((event: { organisation_relations: Array<{ organisation_id: string }> }) =>
        event.organisation_relations.some(
          (relation: { organisation_id: string }) => relation.organisation_id === organisationId,
        ),
      ),
    ).toBe(true);

    const invalid = GET(
      new Request("https://example.test/api/v1/collector-events?from=2026-02-30"),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_INPUT");
  });

  it("returns no irrelevant evidence for an empty filtered collection", async () => {
    const response = GET(
      new Request("https://example.test/api/v1/collector-events?nation=Scotland"),
    );
    const body = await response.json();
    expect(body.data.events).toEqual([]);
    expect(body._meta.sources).toEqual([]);
  });
});
