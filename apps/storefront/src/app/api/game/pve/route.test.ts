import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveActor: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/game/pve-actor", () => ({
  LEGACY_PVE_GUEST_COOKIE: "ctcg-guest-id",
  resolveActor: mocks.resolveActor,
}));

import { GET } from "./route";

beforeEach(() => {
  mocks.query.mockReset();
  mocks.resolveActor.mockReset();
});

describe("PVE status privacy boundary", () => {
  it("ignores guest identity and retires the legacy guest cookie", async () => {
    mocks.resolveActor.mockResolvedValue(null);
    mocks.query.mockResolvedValue({ rows: [] });

    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({
      isGuest: false,
      guest_persistence_enabled: false,
      activeGame: null,
      mode: "read_only",
      mutations_enabled: false,
      rewards_enabled: false,
    });
    expect(body.levels).toEqual([]);
    expect(response.headers.get("set-cookie")).toContain("ctcg-guest-id=");
    expect(response.headers.get("set-cookie")).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[0]).not.toContain("SELECT *");
    expect(mocks.query.mock.calls[0]?.[0]).not.toContain("ai_deck");
    expect(mocks.query.mock.calls[0]?.[0]).not.toContain("first_clear_points");
    expect(mocks.query.mock.calls[0]?.[0]).not.toContain("repeat_points");
  });
});
