import { describe, expect, it } from "vitest";
import { usableTimeZone, zonedTimeToUtc } from "~/utils/zoned-time";

describe("zonedTimeToUtc", () => {
  it("reads a date and time as wall-clock time in the given zone", () => {
    expect(zonedTimeToUtc("2026-12-01", "09:00", "America/New_York")?.toISOString()).toBe("2026-12-01T14:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-01", "09:00", "America/New_York")?.toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-01", "09:00", "Europe/London")?.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "09:00", "Europe/London")?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "09:00", "Asia/Kolkata")?.toISOString()).toBe("2026-12-01T03:30:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "22:00", "Pacific/Auckland")?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "09:00", "UTC")?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("uses the offset in force on the day, either side of a clock change", () => {
    // New York moves its clocks back at 2:00 AM on 1 November 2026
    expect(zonedTimeToUtc("2026-10-31", "09:00", "America/New_York")?.toISOString()).toBe("2026-10-31T13:00:00.000Z");
    expect(zonedTimeToUtc("2026-11-01", "09:00", "America/New_York")?.toISOString()).toBe("2026-11-01T14:00:00.000Z");
    // London moves them forward at 1:00 AM on 29 March 2026
    expect(zonedTimeToUtc("2026-03-28", "06:00", "Europe/London")?.toISOString()).toBe("2026-03-28T06:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-29", "06:00", "Europe/London")?.toISOString()).toBe("2026-03-29T05:00:00.000Z");
    // Times whose clock change falls between the time read as UTC and the real moment
    expect(zonedTimeToUtc("2026-03-08", "06:00", "America/New_York")?.toISOString()).toBe("2026-03-08T10:00:00.000Z");
    expect(zonedTimeToUtc("2026-09-26", "22:00", "Pacific/Auckland")?.toISOString()).toBe("2026-09-26T10:00:00.000Z");
  });

  it("returns null for a date or time that doesn't exist or isn't in the picker's format", () => {
    expect(zonedTimeToUtc("2026-02-30", "09:00", "UTC")).toBeNull();
    expect(zonedTimeToUtc("2026-12-01", "25:00", "UTC")).toBeNull();
    expect(zonedTimeToUtc("", "09:00", "UTC")).toBeNull();
    expect(zonedTimeToUtc("2026-12-01T09:00:00Z", "09:00", "UTC")).toBeNull();
    expect(zonedTimeToUtc("2026-12-01", "9am", "UTC")).toBeNull();
  });
});

describe("usableTimeZone", () => {
  it("keeps a zone the runtime knows and falls back to UTC otherwise", () => {
    expect(usableTimeZone("Europe/London")).toBe("Europe/London");
    expect(usableTimeZone("Not/A_Zone")).toBe("UTC");
    expect(usableTimeZone("")).toBe("UTC");
    expect(usableTimeZone(null)).toBe("UTC");
  });
});
