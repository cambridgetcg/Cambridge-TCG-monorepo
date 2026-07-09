import { describe, it, expect } from "vitest";
import {
  planScrapeBatches,
  DIRECT_SCRAPE_CONCURRENCY,
  CARDRUSH_SUBDOMAINS,
} from "../cardrush/index";

const direct = (n: number) => `d${n}`;
const proxied = (n: number) => `p${n}`;
const isParallel = (s: string) => s.startsWith("d");

describe("planScrapeBatches", () => {
  it("groups consecutive direct entries up to the window", () => {
    const entries = [direct(1), direct(2), direct(3), direct(4), direct(5)];
    expect(planScrapeBatches(entries, isParallel, 4)).toEqual([
      ["d1", "d2", "d3", "d4"],
      ["d5"],
    ]);
  });

  it("keeps proxied entries strictly sequential (singleton batches)", () => {
    const entries = [proxied(1), proxied(2), proxied(3)];
    expect(planScrapeBatches(entries, isParallel, 4)).toEqual([
      ["p1"],
      ["p2"],
      ["p3"],
    ]);
  });

  it("splits mixed lists at every access-mode boundary", () => {
    const entries = [direct(1), direct(2), proxied(1), direct(3), proxied(2), proxied(3), direct(4)];
    expect(planScrapeBatches(entries, isParallel, 4)).toEqual([
      ["d1", "d2"],
      ["p1"],
      ["d3"],
      ["p2"],
      ["p3"],
      ["d4"],
    ]);
  });

  it("preserves order and yields every entry exactly once", () => {
    const entries = Array.from({ length: 23 }, (_, i) =>
      i % 3 === 0 ? proxied(i) : direct(i),
    );
    const flat = planScrapeBatches(entries, isParallel, DIRECT_SCRAPE_CONCURRENCY).flat();
    expect(flat).toEqual(entries);
  });

  it("treats window < 1 as fully sequential", () => {
    const entries = [direct(1), direct(2)];
    expect(planScrapeBatches(entries, isParallel, 0)).toEqual([["d1"], ["d2"]]);
    expect(planScrapeBatches(entries, isParallel, -3)).toEqual([["d1"], ["d2"]]);
  });

  it("handles the empty watch-list", () => {
    expect(planScrapeBatches([], isParallel, 4)).toEqual([]);
  });
});

describe("registry access assumptions the planner relies on", () => {
  it("cardrush-pokemon.jp is the only confirmed unlocker host (stays sequential)", () => {
    const confirmedUnlocker = Object.entries(CARDRUSH_SUBDOMAINS)
      .filter(([, e]) => e.confirmed && e.access === "bright-data-unlocker")
      .map(([host]) => host);
    expect(confirmedUnlocker).toEqual(["cardrush-pokemon.jp"]);
  });

  it("op and dbf ride direct-access hosts (eligible for the parallel window)", () => {
    expect(CARDRUSH_SUBDOMAINS["cardrush-op.jp"].access).toBe("direct");
    expect(CARDRUSH_SUBDOMAINS["cardrush-db.jp"].access).toBe("direct");
  });
});
