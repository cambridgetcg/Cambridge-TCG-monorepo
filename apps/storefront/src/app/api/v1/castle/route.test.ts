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

describe("GET /api/v1/castle", () => {
  it("serves a NOASSERTION, reference-only protocol envelope", async () => {
    delete process.env.CASTLE_BRIDGE_DISABLED;

    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body._meta.endpoint).toBe("/api/v1/castle");
    expect(body._meta.license).toBe("NOASSERTION");
    expect(body._meta.source_license).toBeUndefined();
    expect(body._meta.sources).toHaveLength(4);
    expect(body._meta.sources[0]).toMatch(
      /raw\.githubusercontent\.com\/cambridgetcg\/castle-gate\/[0-9a-f]{40}\/data\/castle-manifest\.json$/,
    );
    expect(body._meta.sources[1]).toContain(
      "/7cdbc9f35f408a5553c86f29ee45ac0d05f12930/packages/sdk-ts/package.json",
    );
    expect(body._meta.sources[2]).toContain(
      "/7cdbc9f35f408a5553c86f29ee45ac0d05f12930/packages/sdk-ts/src/correspondence.ts",
    );
    expect(body._meta.sources[3]).toContain(
      "/git/tags/ee28e3e1e8f841d316732058d76923c8bb4b7640",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body._meta.as_of).toBe("2026-07-23T19:12:05Z");
    expect(body.data.snapshot.forged_at).toBe("2026-07-07T21:45:49.583Z");
    expect(body.data).toMatchObject({
      protocol: "castle-understanding-bridge/v0.1",
      kind: "read_only_reference_bridge",
      crossing: {
        content_copied_into_cambridge: false,
        runtime_fetch_or_proxy: false,
      },
      authority: { automatic_action: "never", grants: [] },
    });
  });

  it("rests before any source read when the brake is set", async () => {
    process.env.CASTLE_BRIDGE_DISABLED = "1";

    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
    expect(body.error.details).toEqual({
      status: "resting",
      source_read: false,
      network_fetch: false,
      write_attempted: false,
    });
  });
});
