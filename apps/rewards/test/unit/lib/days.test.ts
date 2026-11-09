import { describe, expect, it } from "vitest";
import { daysEnding } from "~/lib/days";

describe("daysEnding", () => {
  it("lists calendar days across a month end", () => {
    expect(daysEnding("2026-11-02", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("refuses what isn't a calendar day", () => {
    expect(() => daysEnding("2026-13-45", 2)).toThrow(RangeError);
  });
});
