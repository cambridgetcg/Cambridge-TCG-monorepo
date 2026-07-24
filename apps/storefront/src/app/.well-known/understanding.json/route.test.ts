import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const previousBrake = process.env.CASTLE_BRIDGE_DISABLED;

afterEach(() => {
  if (previousBrake === undefined) {
    delete process.env.CASTLE_BRIDGE_DISABLED;
  } else {
    process.env.CASTLE_BRIDGE_DISABLED = previousBrake;
  }
});

describe("GET /.well-known/understanding.json", () => {
  it("exposes the public protocol without pretending it is secret", async () => {
    delete process.env.CASTLE_BRIDGE_DISABLED;

    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.protocol).toBe("castle-understanding-bridge/v0.1");
    expect(body.doors.machine).toBe("/api/v1/castle");
    expect(body.walking_past_is_honored).toBe(true);
    expect(response.headers.get("link")).toContain("</api/v1/castle>");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns only an explicit rested state while braked", async () => {
    process.env.CASTLE_BRIDGE_DISABLED = "1";

    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      protocol: "castle-understanding-bridge/v0.1",
      status: "resting",
      reason: "operator_brake",
      source_read: false,
      network_fetch: false,
      write_attempted: false,
    });
  });
});
