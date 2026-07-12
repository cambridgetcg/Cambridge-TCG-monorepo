import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRoom: vi.fn(),
  performAction: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/game/engine", () => ({
  getRoom: mocks.getRoom,
  performAction: mocks.performAction,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getRoom.mockResolvedValue({
    id: "room-1",
    game_state: { currentTurn: "user-1" },
  });
  mocks.query.mockResolvedValue({ rows: [{ exists: 1 }], rowCount: 1 });
});

describe("human action route agent-room boundary", () => {
  it("rejects before inspecting a body or mutating an agent match", async () => {
    const request = {
      json: vi.fn(() => {
        throw new Error("body must not be inspected");
      }),
    } as unknown as Request;

    const response = await POST(request, {
      params: Promise.resolve({ code: "ABC123" }),
    });

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Agent match writes are paused on every route.",
    });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM agent_matches"),
      ["room-1"],
    );
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.performAction).not.toHaveBeenCalled();
  });
});
