import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/prices/[sku]", () => {
  it("returns status only without a card row", async () => {
    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.publication_status).toBe("blocked");
    expect(serialized).not.toMatch(
      /price_gbp|channel_price|cardrush_jpy|image_url|card_number/,
    );
  });
});
