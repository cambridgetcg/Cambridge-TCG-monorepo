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
import { runPveReconciliationSweep } from "./pve-sweep";

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

  it("keeps the recovery sweep read-only while rewards are paused", async () => {
    await expect(runPveReconciliationSweep()).resolves.toEqual({
      reconciled: 0,
      failures: 0,
      paused: true,
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
