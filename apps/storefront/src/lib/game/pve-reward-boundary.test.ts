import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  earnPoints: vi.fn(),
  addCredit: vi.fn(),
  calculateBerriesEarn: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/membership/db", () => ({
  earnPoints: mocks.earnPoints,
  addCredit: mocks.addCredit,
}));
vi.mock("@/lib/bounty/earn", () => ({
  calculateBerriesEarn: mocks.calculateBerriesEarn,
}));

import { grantPveRewardsIdempotent } from "./rewards";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("PVE reward boundary", () => {
  it("rejects a direct grant before any read or write", async () => {
    await expect(
      grantPveRewardsIdempotent({
        gameId: "game-1",
        userId: "user-1",
        level: {
          id: 1,
          title: "Level 1",
          level_number: 1,
          first_clear_points: 100,
          repeat_points: 10,
          first_clear_credit: 0,
        },
        isFirstClear: true,
      }),
    ).rejects.toThrow("PVE battles and rewards are paused");

    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.earnPoints).not.toHaveBeenCalled();
    expect(mocks.addCredit).not.toHaveBeenCalled();
    expect(mocks.calculateBerriesEarn).not.toHaveBeenCalled();
  });

  it("leaves old unawarded wins untouched: no sweep exists, and the cron names none", () => {
    expect(existsSync(resolve(process.cwd(), "src/lib/game/pve-sweep.ts"))).toBe(false);
    const cron = readFileSync(resolve(process.cwd(), "src/app/api/cron/maintenance/route.ts"), "utf8");
    expect(cron).not.toMatch(/pve/i);
  });
});
