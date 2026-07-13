import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/collector-events/schema", () => {
  it("publishes only the Cambridge-authored CC0 contract", async () => {
    const response = GET();
    const body = await response.json();
    const sourceRights = body.data.schemas.source.properties.rights_review.properties;

    expect(body._meta.license).toBe("CC0-1.0");
    expect(body._meta.sources).toEqual(["cambridge-tcg.data-spec"]);
    expect(sourceRights.publication_mode).toBeDefined();
    expect(sourceRights.rights_evidence_source_ids).toBeDefined();
    expect(sourceRights.reuse_mode).toBeUndefined();
    expect(
      body.data.schemas.event.properties.field_sources.minProperties,
    ).toBe(1);
    expect(
      body.data.schemas.event.allOf[0].if.properties.status.enum,
    ).toEqual(["scheduled", "cancelled"]);
    expect(
      body.data.schemas.event.allOf[0].then.properties.schedule.type,
    ).toBe("object");
  });
});
