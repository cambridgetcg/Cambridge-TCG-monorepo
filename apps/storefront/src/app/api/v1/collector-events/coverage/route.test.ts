import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/collector-events/coverage", () => {
  it("states the incomplete nation and rights boundary in-band", async () => {
    const response = GET();
    const body = await response.json();

    expect(body._meta.license).toBe("NOASSERTION");
    expect(body.data.comprehensive).toBe(false);
    expect(body._meta.freshness_seconds).toBe(604800);
    expect(body.data.counts.events).toBe(4);
    expect(body.data.counts.events_by_nation).toMatchObject({
      England: 4,
      Scotland: 0,
      Wales: 0,
      "Northern Ireland": 0,
    });
    expect(body.data.excluded_leads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_id: "src_london_card_show_terms" }),
        expect.objectContaining({ source_id: "src_ukcs_tickets_index" }),
      ]),
    );
    expect(body.data.gaps.join(" ")).toContain("not a directory of every UK");
  });
});
