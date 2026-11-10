import { describe, expect, it } from "vitest";
import {
  KEY_EXPIRY_NEVER,
  keyExpiryDateRange,
  OPERATOR_KEY_EXPIRY_DEFAULT,
  parseKeyExpiry,
} from "@/lib/agents/key-expiry";
import {
  formatKeyInstant,
  KEY_EXPIRY_CHOICE_FIELD,
  KEY_EXPIRY_CHOICES,
  KEY_EXPIRY_DATE_CHOICE,
  KEY_EXPIRY_DATE_FIELD,
  KEY_EXPIRY_INITIAL_CHOICE,
  keyCountsLabel,
  keyExpiryFromForm,
  keyInstantIso,
  keyListState,
} from "./key-expiry-ui";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("the expiry choice the forms offer", () => {
  it("offers the four presets, a date and never, with 90 days pre-selected", () => {
    expect(KEY_EXPIRY_CHOICES.map((choice) => choice.value)).toEqual([
      "7d",
      "30d",
      "90d",
      "365d",
      KEY_EXPIRY_DATE_CHOICE,
      KEY_EXPIRY_NEVER,
    ]);
    expect(KEY_EXPIRY_INITIAL_CHOICE).toBe(OPERATOR_KEY_EXPIRY_DEFAULT);
    expect(KEY_EXPIRY_INITIAL_CHOICE).toBe("90d");
  });

  it("sends only values the server's parser accepts", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    for (const choice of KEY_EXPIRY_CHOICES) {
      if (choice.value === KEY_EXPIRY_DATE_CHOICE) continue;
      const wire = keyExpiryFromForm(form({ [KEY_EXPIRY_CHOICE_FIELD]: choice.value }));
      expect(parseKeyExpiry(wire, now).ok, choice.value).toBe(true);
    }
    const { min, max } = keyExpiryDateRange(now);
    for (const date of [min, max]) {
      const wire = keyExpiryFromForm(form({ [KEY_EXPIRY_CHOICE_FIELD]: KEY_EXPIRY_DATE_CHOICE, [KEY_EXPIRY_DATE_FIELD]: date }));
      expect(wire).toBe(date);
      expect(parseKeyExpiry(wire, now)).toEqual({ ok: true, expiry: { kind: "date", date } });
    }
  });

  it("never turns the date choice itself, a missing date or a missing choice into a value", () => {
    expect(keyExpiryFromForm(form({ [KEY_EXPIRY_CHOICE_FIELD]: KEY_EXPIRY_DATE_CHOICE }))).toBe("");
    expect(keyExpiryFromForm(form({ [KEY_EXPIRY_CHOICE_FIELD]: KEY_EXPIRY_DATE_CHOICE, [KEY_EXPIRY_DATE_FIELD]: "  " }))).toBe("");
    expect(keyExpiryFromForm(form({}))).toBe("");
    // The server refuses each of them, and refuses "date" too.
    for (const wire of ["", KEY_EXPIRY_DATE_CHOICE]) expect(parseKeyExpiry(wire).ok).toBe(false);
    // A date typed with a preset still selected is ignored: the select decides.
    expect(keyExpiryFromForm(form({ [KEY_EXPIRY_CHOICE_FIELD]: "30d", [KEY_EXPIRY_DATE_FIELD]: "2027-01-28" }))).toBe("30d");
  });
});

describe("how the page words a key's end", () => {
  it("gives the exact second in UTC, from a Date or a string", () => {
    expect(formatKeyInstant("2027-01-28T15:04:07.912Z")).toBe("2027-01-28 15:04:07 UTC");
    expect(formatKeyInstant(new Date("2027-01-28T00:00:00Z"))).toBe("2027-01-28 00:00:00 UTC");
    expect(formatKeyInstant("2027-03-28T01:30:00+01:00")).toBe("2027-03-28 00:30:00 UTC");
    expect(keyInstantIso("2027-01-28T15:04:07.912Z")).toBe("2027-01-28T15:04:07.912Z");
    expect(keyInstantIso("not a time")).toBeUndefined();
    expect(formatKeyInstant("not a time")).toBe("not a time");
  });

  it("lets revocation win over expiry, and reads only an explicit true as expired", () => {
    expect(keyListState({ revoked_at: "2026-11-01T00:00:00Z", expired: true })).toBe("revoked");
    expect(keyListState({ revoked_at: null, expired: true })).toBe("expired");
    expect(keyListState({ revoked_at: null, expired: false })).toBe("live");
    expect(keyListState({ revoked_at: null, expired: "true" as unknown as boolean })).toBe("live");
  });

  it("counts live, expired and revoked keys, naming only states some key is in", () => {
    const live = { revoked_at: null, expired: false };
    const expired = { revoked_at: null, expired: true };
    const revoked = { revoked_at: "2026-11-01T00:00:00Z", expired: false };
    expect(keyCountsLabel([live, live, expired, revoked, revoked, revoked])).toBe("2 live, 1 expired, 3 revoked");
    expect(keyCountsLabel([expired])).toBe("0 live, 1 expired");
    expect(keyCountsLabel([live, revoked])).toBe("1 live, 1 revoked");
    expect(keyCountsLabel([])).toBe("0 live");
  });
});
