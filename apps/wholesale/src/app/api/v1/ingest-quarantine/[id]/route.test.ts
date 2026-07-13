import { describe, expect, it } from "vitest";
import { GET, PATCH } from "./route";

describe("/api/v1/ingest-quarantine/[id]", () => {
  it.each([GET, PATCH])("keeps payloads and mutations behind an unimplemented operator boundary", async (handler) => {
    const response = await handler();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.access_status).toBe("blocked");
    expect(serialized).not.toMatch(/raw_payload|price_jpy|image_url/);
  });
});
