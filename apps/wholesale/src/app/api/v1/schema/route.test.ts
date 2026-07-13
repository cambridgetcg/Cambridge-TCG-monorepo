import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/api/v1/schema", () => {
  it("describes the price collection as a zero-row status surface", async () => {
    const response = await GET();
    const schema = await response.json();
    const operation = schema.paths["/api/v1/prices"].get;
    const unavailable = operation.responses["503"];
    const body = unavailable.content["application/json"].schema;

    expect(operation.security).toEqual([]);
    expect(operation.description).toContain("HTTP 503 status document");
    expect(Object.keys(operation.responses)).toEqual(["503"]);
    expect(body.properties.total.const).toBe(0);
    expect(body.properties.count.const).toBe(0);
    expect(body.properties.items.maxItems).toBe(0);
    expect(schema.components.schemas).not.toHaveProperty("PriceItem");
  });

  it("does not promise a card response from the single-SKU price route", async () => {
    const response = await GET();
    const schema = await response.json();
    const operation = schema.paths["/api/v1/prices/{sku}"].get;
    const unavailable = operation.responses["503"];
    const body = unavailable.content["application/json"].schema;

    expect(operation.security).toEqual([]);
    expect(operation.description).toContain("returns no card fields");
    expect(Object.keys(operation.responses)).toEqual(["503"]);
    expect(body.properties.status.const).toBe("unavailable");
    expect(body.properties.publication_status.const).toBe("blocked");
    expect(body.properties).not.toHaveProperty("price_gbp");
    expect(body.properties).not.toHaveProperty("image_url");
  });
});
