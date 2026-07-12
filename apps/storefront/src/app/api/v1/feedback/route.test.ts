import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("/api/v1/feedback closed boundary", () => {
  it("publishes status without reports", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toMatchObject({
      status: "feedback-disabled",
      persistence_enabled: false,
      rows: [],
    });
  });

  it("rejects before inspecting or logging caller content", async () => {
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
      logged: false,
      database_accessed: false,
    });
  });
});
