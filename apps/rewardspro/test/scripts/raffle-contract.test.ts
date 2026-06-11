/**
 * Raffle contract shape — pin the table-ownership rules so a future
 * edit can't silently weaken them.
 */
import { describe, it, expect } from "vitest";
import { raffleContract } from "../../scripts/raffle-contract";

describe("raffleContract — typed canonical for the raffles submodule", () => {
  it("declares ownership rules for raffleEntry, raffleWinner, raffleInstantWin", () => {
    const tables = raffleContract.ownership.map((o) => o.tableName).sort();
    expect(tables).toEqual(["raffleEntry", "raffleInstantWin", "raffleWinner"]);
  });

  it("raffleEntry mutations allow entry creation, draw winner-marking, and shop teardown", () => {
    // Calibrated against real first-run: drawing legitimately marks
    // `isWinner: true` inside the draw transaction; shop-data-cleanup
    // is the teardown path on app uninstall.
    const rule = raffleContract.ownership.find(
      (o) => o.tableName === "raffleEntry"
    )!;
    expect(rule.allowedSources.sort()).toEqual([
      "app/services/raffle-drawing.server.ts",
      "app/services/raffle-entry.server.ts",
      "app/services/shop-data-cleanup.server.ts",
    ]);
  });

  it("raffleWinner mutations allow drawing + prize-delivery + shop teardown", () => {
    const rule = raffleContract.ownership.find(
      (o) => o.tableName === "raffleWinner"
    )!;
    expect(rule.allowedSources.sort()).toEqual([
      "app/services/raffle-drawing.server.ts",
      "app/services/raffle-prize-delivery.server.ts",
      "app/services/shop-data-cleanup.server.ts",
    ]);
  });

  it("raffleInstantWin allows config (management) + counter writes (instant-win)", () => {
    const rule = raffleContract.ownership.find(
      (o) => o.tableName === "raffleInstantWin"
    )!;
    expect(rule.allowedSources.sort()).toEqual([
      "app/services/raffle-instant-win.server.ts",
      "app/services/raffle-management.server.ts",
    ]);
  });

  it("every ownership rule has a non-empty reason", () => {
    for (const rule of raffleContract.ownership) {
      expect(rule.reason.length).toBeGreaterThan(20);
    }
  });
});
