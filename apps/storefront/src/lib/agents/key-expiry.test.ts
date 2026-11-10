import { describe, expect, it } from "vitest";
import {
  expiredAgentKeySql,
  isExpiryAfterCreationViolation,
  KEY_EXPIRY_CHOICE_ERROR,
  KEY_EXPIRY_PRESETS,
  keyExpiresAtSql,
  keyExpiryBinds,
  keyExpiryDateRange,
  liveAgentKeySql,
  OPERATOR_KEY_EXPIRY_DEFAULT,
  parseKeyExpiry,
  unexpiredAgentKeySql,
} from "./key-expiry";

// 2026-11-10 at 23:30 UTC: late in the day, so "tomorrow" is near.
const NOW = new Date("2026-11-10T23:30:00.000Z");

describe("parseKeyExpiry", () => {
  it.each([
    ["7d", { kind: "days", days: 7 }],
    ["30d", { kind: "days", days: 30 }],
    ["90d", { kind: "days", days: 90 }],
    ["365d", { kind: "days", days: 365 }],
    ["never", { kind: "never" }],
  ])("accepts %s", (value, expiry) => {
    expect(parseKeyExpiry(value, NOW)).toEqual({ ok: true, expiry });
  });

  it("offers exactly the four presets, and pre-selects 90 days for operators without the server applying it", () => {
    expect(KEY_EXPIRY_PRESETS.map((preset) => preset.value)).toEqual(["7d", "30d", "90d", "365d"]);
    expect(OPERATOR_KEY_EXPIRY_DEFAULT).toBe("90d");
    expect(parseKeyExpiry(undefined, NOW)).toEqual({ ok: false, error: KEY_EXPIRY_CHOICE_ERROR });
  });

  it.each(["2026-11-11", "2027-01-28", "2027-11-11"])(
    "accepts the date %s, from tomorrow to 366 days ahead (UTC)",
    (date) => {
      expect(parseKeyExpiry(date, NOW)).toEqual({ ok: true, expiry: { kind: "date", date } });
    },
  );

  it.each([
    ["today", "2026-11-10"],
    ["yesterday", "2026-11-09"],
    ["the distant past", "1999-01-01"],
    ["367 days ahead", "2027-11-12"],
    ["years ahead", "2030-01-01"],
  ])("refuses %s with the range it allows", (_label, date) => {
    expect(parseKeyExpiry(date, NOW)).toEqual({
      ok: false,
      error: "Choose a date from 2026-11-11 to 2027-11-11 (UTC); the key stops working at 00:00 UTC on that date.",
    });
  });

  it.each([
    ["an empty string", ""],
    ["a bare number string", "90"],
    ["a different case", "90D"],
    ["a different case of never", "Never"],
    ["padding", " 90d"],
    ["a trailing space", "never "],
    ["another unit", "1y"],
    ["an unoffered preset", "60d"],
    ["zero days", "0d"],
    ["an impossible date", "2027-02-30"],
    ["a month 13", "2027-13-01"],
    ["an unpadded date", "2027-1-28"],
    ["a timestamp", "2027-01-28T00:00:00Z"],
    ["a date with a time zone", "2027-01-28+01:00"],
  ])("refuses %s", (_label, value) => {
    expect(parseKeyExpiry(value, NOW)).toEqual({ ok: false, error: KEY_EXPIRY_CHOICE_ERROR });
  });

  it.each([
    ["a number", 90],
    ["zero", 0],
    ["null", null],
    ["undefined", undefined],
    ["a boolean", true],
    ["an object", { kind: "never" }],
    ["an array", ["90d"]],
  ])("refuses %s", (_label, value) => {
    expect(parseKeyExpiry(value, NOW)).toEqual({ ok: false, error: KEY_EXPIRY_CHOICE_ERROR });
  });

  it("reads tomorrow by UTC, not by the server's local day", () => {
    // 00:30 UTC on 2026-11-11 is still 2026-11-10 in the Americas.
    const justAfterMidnight = new Date("2026-11-11T00:30:00.000Z");
    expect(parseKeyExpiry("2026-11-11", justAfterMidnight)).toMatchObject({ ok: false });
    expect(parseKeyExpiry("2026-11-12", justAfterMidnight)).toMatchObject({ ok: true });
  });
});

describe("keyExpiryDateRange", () => {
  it("runs from tomorrow to 366 days after today, in UTC", () => {
    expect(keyExpiryDateRange(NOW)).toEqual({ min: "2026-11-11", max: "2027-11-11" });
  });

  it("crosses a year end and a leap day", () => {
    expect(keyExpiryDateRange(new Date("2027-12-31T23:59:59.999Z"))).toEqual({
      min: "2028-01-01",
      max: "2028-12-31",
    });
    expect(keyExpiryDateRange(new Date("2028-02-28T00:00:00.000Z"))).toEqual({
      min: "2028-02-29",
      max: "2029-02-28",
    });
  });
});

describe("the insert's expiry", () => {
  it("binds a lifetime, a date, or neither", () => {
    expect(keyExpiryBinds({ kind: "days", days: 30 })).toEqual([30, null]);
    expect(keyExpiryBinds({ kind: "date", date: "2027-01-28" })).toEqual([null, "2027-01-28"]);
    expect(keyExpiryBinds({ kind: "never" })).toEqual([null, null]);
  });

  it("computes on the database's clock: 24-hour days from NOW(), a date at 00:00 UTC, else NULL", () => {
    const sql = keyExpiresAtSql(6, 7).replace(/\s+/g, " ");
    expect(sql).toBe(
      "CASE WHEN $6::int IS NOT NULL THEN NOW() + make_interval(hours => 24 * $6::int) " +
        "WHEN $7::date IS NOT NULL THEN $7::date::timestamp AT TIME ZONE 'UTC' END",
    );
  });

  it("recognises only the expiry CHECK's violation", () => {
    expect(isExpiryAfterCreationViolation({ code: "23514", constraint: "agent_keys_expiry_after_creation" })).toBe(true);
    expect(isExpiryAfterCreationViolation({ code: "23514", constraint: "agent_keys_tier_values" })).toBe(false);
    expect(isExpiryAfterCreationViolation({ code: "23505", constraint: "agent_keys_expiry_after_creation" })).toBe(false);
    expect(isExpiryAfterCreationViolation(new Error("agent_keys_expiry_after_creation"))).toBe(false);
    expect(isExpiryAfterCreationViolation(null)).toBe(false);
  });
});

describe("the one rule for a live key", () => {
  it.each([
    ["k", "k."],
    ["k2", "k2."],
    ["agent_keys", "agent_keys."],
    ["", ""],
  ])("with alias %j", (alias, prefix) => {
    expect(liveAgentKeySql(alias)).toBe(
      `(${prefix}revoked_at IS NULL AND (${prefix}expires_at IS NULL OR ${prefix}expires_at > NOW()))`,
    );
    expect(unexpiredAgentKeySql(alias)).toBe(`(${prefix}expires_at IS NULL OR ${prefix}expires_at > NOW())`);
    // Expired is exactly not unexpired: one boundary, the expires_at instant itself.
    expect(expiredAgentKeySql(alias)).toBe(`(NOT ${unexpiredAgentKeySql(alias)})`);
  });

  it("defaults to the alias k", () => {
    expect(liveAgentKeySql()).toBe(liveAgentKeySql("k"));
    expect(expiredAgentKeySql()).toBe(expiredAgentKeySql("k"));
  });

  it.each(["k; DROP TABLE agent_keys", "k.x", "K", "1k", "k k"])("refuses the alias %j", (alias) => {
    expect(() => liveAgentKeySql(alias)).toThrow("invalid SQL alias");
  });
});
