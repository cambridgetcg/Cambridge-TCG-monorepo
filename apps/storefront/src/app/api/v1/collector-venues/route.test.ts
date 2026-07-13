import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/collector-venues", () => {
  it("retains geometry attribution beside every emitted venue point", async () => {
    const response = GET();
    const body = await response.json();

    expect(body.data.count).toBe(4);
    expect(body.data.venues.every((venue: { geometry: unknown }) => venue.geometry)).toBe(true);
    expect(body.data.attribution.join(" ")).toContain("Royal Mail");
    expect(body.data.attribution.join(" ")).toContain("NRS");
    expect(body._meta.sources).toContain("src_postcodes_licence");
  });
});
