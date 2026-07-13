import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth }));

import { resolveActor } from "./pve-actor";

beforeEach(() => {
  auth.mockReset();
});

describe("PVE actor boundary", () => {
  it("does not mint a guest identity", async () => {
    auth.mockResolvedValue(null);
    await expect(resolveActor(true)).resolves.toBeNull();
  });

  it("uses only the authenticated account", async () => {
    auth.mockResolvedValue({ user: { id: "user-1", name: "Yu" } });
    await expect(resolveActor()).resolves.toEqual({
      userId: "user-1",
      name: "Yu",
      isGuest: false,
    });
  });
});
