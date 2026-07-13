import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/collector-events/map.geojson", () => {
  it("serves standards-native GeoJSON with approximation and rights headers", async () => {
    const response = GET(
      new Request("https://example.test/api/v1/collector-events/map.geojson"),
    );
    const map = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/geo+json");
    expect(response.headers.get("x-content-license")).toBe("NOASSERTION");
    expect(response.headers.get("x-coordinate-precision")).toContain("not-venue-entrance");
    expect(map.type).toBe("FeatureCollection");
    expect(map.comprehensive).toBe(false);
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(map.input_event_count).toBe(4);
    expect(map.feature_count).toBe(4);
    expect(map.unlocated_count).toBe(0);
    expect(map.features).toHaveLength(4);
    expect(map.features.every((feature: { properties: { coordinate_warning: string } }) =>
      feature.properties.coordinate_warning.includes("not a venue entrance"),
    )).toBe(true);
  });

  it("shares strict event filters", async () => {
    const scotland = GET(
      new Request(
        "https://example.test/api/v1/collector-events/map.geojson?nation=Scotland",
      ),
    );
    expect((await scotland.json()).features).toHaveLength(0);

    const invalid = GET(
      new Request(
        "https://example.test/api/v1/collector-events/map.geojson?from=2026-02-30",
      ),
    );
    expect(invalid.status).toBe(400);
  });
});
