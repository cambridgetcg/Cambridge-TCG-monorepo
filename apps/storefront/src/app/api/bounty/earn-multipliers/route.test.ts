import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("PVE earnings preview boundary", () => {
  it("reports the reward pause without claiming eligibility", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({
      mode: "read_only",
      mutations_enabled: false,
      rewards_enabled: false,
      eligible: false,
    });
  });
});
