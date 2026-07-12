import { describe, expect, it, vi } from "vitest";
import {
  DELETE as deleteState,
  GET as getState,
} from "./[content_hash]/route";
import { GET, POST } from "./route";

describe("/api/v1/carry-this closed boundary", () => {
  it("publishes status without participant rows", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toMatchObject({
      status: "carried-state-disabled",
      persistence_enabled: false,
      public_read_enabled: false,
      rows: [],
    });
  });

  it("rejects a write before inspecting its body", async () => {
    const request = {
      json: vi.fn(() => {
        throw new Error("body must not be inspected");
      }),
    } as unknown as Request;

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(request.json).not.toHaveBeenCalled();
    expect(body.error.details).toMatchObject({
      body_inspected: false,
      database_accessed: false,
    });
  });

  it("does not inspect a path hash or token on per-hash methods", async () => {
    for (const method of [getState, deleteState]) {
      const response = await method();
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error.details).toMatchObject({
        participant_identifier_inspected: false,
        write_token_inspected: false,
        database_accessed: false,
      });
    }
  });
});
