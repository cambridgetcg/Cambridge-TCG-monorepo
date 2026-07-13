import { describe, expect, it } from "vitest";
import { COLLECTOR_EVENTS } from "@/lib/collector-events/registry";
import { GET } from "./route";

function fieldSourceIds(record: { field_sources: Record<string, string[]> }): string[] {
  return Object.values(record.field_sources).flat();
}

describe("GET /api/v1/collector-events/[id]", () => {
  it("joins complete evidence and retains geometry attribution", async () => {
    const event = COLLECTOR_EVENTS[0];
    const response = await GET(
      new Request(`https://example.test/api/v1/collector-events/${event.id}`),
      { params: Promise.resolve({ id: event.id }) },
    );
    const body = await response.json();
    const evidenceIds = new Set<string>(
      body.data.included.evidence_sources.map((source: { id: string }) => source.id),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(new Set(body._meta.sources)).toEqual(evidenceIds);
    for (const sourceId of fieldSourceIds(body.data.event)) {
      expect(evidenceIds.has(sourceId)).toBe(true);
    }
    for (const sourceId of fieldSourceIds(body.data.included.venue)) {
      expect(evidenceIds.has(sourceId)).toBe(true);
    }
    for (const organisation of body.data.included.organisations) {
      for (const sourceId of fieldSourceIds(organisation)) {
        expect(evidenceIds.has(sourceId)).toBe(true);
      }
    }
    expect(evidenceIds.has("src_companies_house_ukcs")).toBe(true);
    expect(evidenceIds.has("src_ukcs_terms")).toBe(true);
    expect(evidenceIds.has("src_postcodes_licence")).toBe(true);
    expect(body.data.attribution.join(" ")).toContain("Royal Mail");
  });

  it("returns the shared not-found envelope for an unknown id", async () => {
    const response = await GET(
      new Request("https://example.test/api/v1/collector-events/evt_missing"),
      { params: Promise.resolve({ id: "evt_missing" }) },
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });
});
