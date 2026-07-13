import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/prices/movers", () => {
  it("returns status only without archive-derived values", async () => {
    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({
      publication_status: "blocked",
      count: 0,
      movers: [],
    });
    expect(serialized).not.toMatch(
      /price_then|price_now|channel_price|pct_change|image_url/,
    );
  });
});
