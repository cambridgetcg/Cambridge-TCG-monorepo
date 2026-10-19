import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ pointsConfig: { findUnique: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: db, databaseSchema: "rewardspro" }));

describe("points config logging", () => {
  it("prints nothing when the module loads or a shop's config is read", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.resetModules();
    // Production logs carried a block of "[PointsConfig] [MODULE_INIT] …" lines on every cold start
    const config = await import("~/services/points-config.server");

    db.pointsConfig.findUnique.mockResolvedValue(null);
    await expect(config.getPointsConfig("quiet.myshopify.com")).resolves.toMatchObject({ isEnabled: false });
    await expect(config.isPointsEnabled("quiet.myshopify.com")).resolves.toBe(false);
    await expect(config.getEnabledFeatures("quiet.myshopify.com")).resolves.toMatchObject({ pointsSystem: false });

    expect(log).not.toHaveBeenCalled();
  });

  it("still reports a failed lookup", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = await import("~/services/points-config.server");
    db.pointsConfig.findUnique.mockRejectedValue(new Error("connection refused"));

    await expect(config.isPointsEnabled("down.myshopify.com")).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith(expect.stringContaining("isPointsEnabled error for down.myshopify.com"), expect.any(Error));
  });
});
