import { describe, it, expect } from "vitest";
import { safe, safeCount, tableExists, isUnavailable, UNAVAILABLE } from "../queries";

describe("admin/queries — substrate-honest helpers", () => {
  describe("safe()", () => {
    it("returns the function's value when it succeeds", async () => {
      const result = await safe(
        () => Promise.resolve({ rows: [{ x: 1 }] }),
        { rows: [] as Array<{ x: number }> },
      );
      expect(result.rows[0]?.x).toBe(1);
    });

    it("returns the fallback when the function throws", async () => {
      const result = await safe(
        () => Promise.reject(new Error("boom")),
        { rows: [] as Array<{ x: number }> },
      );
      expect(result.rows).toEqual([]);
    });
  });

  describe("safeCount()", () => {
    it("returns the parsed integer when the query returns numeric n", async () => {
      const fakeQuery = (() => Promise.resolve({ rows: [{ n: 42 }] })) as never;
      const result = await safeCount(fakeQuery, "SELECT count(*) AS n FROM x");
      expect(result).toBe(42);
    });

    it("parses string n (postgres.js returns numeric as string)", async () => {
      const fakeQuery = (() => Promise.resolve({ rows: [{ n: "17" }] })) as never;
      const result = await safeCount(fakeQuery, "SELECT count(*) AS n FROM x");
      expect(result).toBe(17);
    });

    it("returns 0 when rows is empty", async () => {
      const fakeQuery = (() => Promise.resolve({ rows: [] })) as never;
      const result = await safeCount(fakeQuery, "SELECT count(*) AS n FROM x");
      expect(result).toBe(0);
    });

    it("returns UNAVAILABLE (-1) when the query throws", async () => {
      const failingQuery = (() => Promise.reject(new Error("table not found"))) as never;
      const result = await safeCount(failingQuery, "SELECT count(*) FROM x");
      expect(result).toBe(UNAVAILABLE);
      expect(result).toBe(-1);
    });
  });

  describe("tableExists()", () => {
    it("returns true when the probe finds the table", async () => {
      const fakeQuery = (() => Promise.resolve({ rows: [{ exists: true }] })) as never;
      const result = await tableExists(fakeQuery, "users");
      expect(result).toBe(true);
    });

    it("returns false when the probe reports missing", async () => {
      const fakeQuery = (() => Promise.resolve({ rows: [{ exists: false }] })) as never;
      const result = await tableExists(fakeQuery, "nonexistent");
      expect(result).toBe(false);
    });

    it("returns false when the probe throws", async () => {
      const fakeQuery = (() => Promise.reject(new Error("no connection"))) as never;
      const result = await tableExists(fakeQuery, "anything");
      expect(result).toBe(false);
    });
  });

  describe("isUnavailable()", () => {
    it("matches the UNAVAILABLE sentinel", () => {
      expect(isUnavailable(-1)).toBe(true);
      expect(isUnavailable(UNAVAILABLE)).toBe(true);
    });

    it("does not match non-sentinel values", () => {
      expect(isUnavailable(0)).toBe(false);
      expect(isUnavailable(1)).toBe(false);
      expect(isUnavailable(42)).toBe(false);
    });
  });
});
