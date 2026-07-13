import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveActor: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/game/pve-actor", () => ({
  resolveActor: mocks.resolveActor,
}));
import { POST } from "./route";

beforeEach(() => {
  mocks.query.mockReset();
  mocks.resolveActor.mockReset();
});

describe("PVE mutation boundary", () => {
  it("pauses every action before auth, params, body, or database work", async () => {
    const request = {
      json: vi.fn(() => {
        throw new Error("body must not be inspected");
      }),
    } as unknown as Request;

    const response = await POST(request, {
      params: new Promise(() => {}),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).toBe("86400");
    expect(body).toMatchObject({
      mode: "read_only",
      mutations_enabled: false,
      rewards_enabled: false,
    });
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.resolveActor).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
