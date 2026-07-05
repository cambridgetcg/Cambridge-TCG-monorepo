import { describe, it, expect } from "vitest";
import { splitChunkAcrossGames } from "../fair-share";

describe("splitChunkAcrossGames", () => {
  it("splits the production chunk evenly across three games", () => {
    expect(splitChunkAcrossGames(2000, 3)).toEqual([667, 667, 666]);
  });

  it("gives a single game the whole chunk (local-pkm-snapshot lane)", () => {
    expect(splitChunkAcrossGames(8000, 1)).toEqual([8000]);
  });

  it("always sums to exactly the total", () => {
    for (const total of [0, 1, 5, 20, 1999, 2000, 11430]) {
      for (const parts of [1, 2, 3, 4, 7]) {
        const alloc = splitChunkAcrossGames(total, parts);
        expect(alloc.reduce((s, n) => s + n, 0)).toBe(total);
        expect(alloc).toHaveLength(parts);
      }
    }
  });

  it("differs by at most one slot between any two games", () => {
    for (const total of [1, 20, 1999, 2000]) {
      for (const parts of [2, 3, 5]) {
        const alloc = splitChunkAcrossGames(total, parts);
        expect(Math.max(...alloc) - Math.min(...alloc)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("puts the remainder on the earliest (direct-host-first) games", () => {
    expect(splitChunkAcrossGames(5, 3)).toEqual([2, 2, 1]);
    expect(splitChunkAcrossGames(1, 3)).toEqual([1, 0, 0]);
  });

  it("handles degenerate inputs", () => {
    expect(splitChunkAcrossGames(100, 0)).toEqual([]);
    expect(splitChunkAcrossGames(100, -1)).toEqual([]);
    expect(splitChunkAcrossGames(0, 3)).toEqual([0, 0, 0]);
    expect(splitChunkAcrossGames(-5, 2)).toEqual([0, 0]);
    // fractional totals floor (maxCards can arrive as parsed user input)
    expect(splitChunkAcrossGames(7.9, 2)).toEqual([4, 3]);
  });
});
