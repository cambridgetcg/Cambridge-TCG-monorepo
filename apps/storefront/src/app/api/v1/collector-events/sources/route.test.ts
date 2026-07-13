import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/collector-events/sources", () => {
  it("publishes publication decisions with exact rights evidence", async () => {
    const response = GET();
    const body = await response.json();
    const byId = Object.fromEntries(
      body.data.sources.map((source: { id: string }) => [source.id, source]),
    );

    expect(body._meta.freshness_seconds).toBe(604800);
    expect(body.data.counts_by_publication_mode).toMatchObject({
      "minimal-facts-only": expect.any(Number),
      "open-geodata": expect.any(Number),
      "link-only": expect.any(Number),
    });
    expect(byId.src_ukcs_cambridge_11.rights_review).toMatchObject({
      publication_mode: "minimal-facts-only",
      copied_descriptive_prose_or_media: false,
      rights_evidence_source_ids: ["src_ukcs_terms"],
    });
    expect(byId.src_postcode_cb4_2qt.rights_review.rights_evidence_source_ids).toEqual([
      "src_postcodes_licence",
    ]);
    expect(JSON.stringify(body)).not.toContain('"reuse_mode"');
    expect(JSON.stringify(body)).not.toContain('"copied_text"');
  });
});
