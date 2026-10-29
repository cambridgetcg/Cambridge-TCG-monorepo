import { describe, expect, it } from "vitest";
import { isNotProvisioned, undefinedColumnName } from "./provisioning";

const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const COLUMNS = ["derivation", "source_set_key"];

describe("not-provisioned errors", () => {
  it.each([
    ['column "derivation" does not exist', "derivation"],
    ["column o.source_set_key does not exist", "source_set_key"],
    ['column "source_set_key" of relation "member_price_observations" does not exist', "source_set_key"],
    ["column r.Derivation does not exist", "Derivation"],
    ["undefined column", null],
    ["relation \"x\" does not exist", null],
  ])("reads the column PostgreSQL names in %j", (message, column) => {
    expect(undefinedColumnName(pg("42703", message))).toBe(column);
  });

  it("counts a missing table, or a missing column the caller names, and nothing else", () => {
    expect(isNotProvisioned(pg("42P01", 'relation "market_indices" does not exist'), COLUMNS)).toBe(true);
    expect(isNotProvisioned(pg("42703", "column o.source_set_key does not exist"), COLUMNS)).toBe(true);
    expect(isNotProvisioned(pg("42703", "column o.amount does not exist"), COLUMNS)).toBe(false);
    expect(isNotProvisioned(pg("42703", "column r.Derivation does not exist"), COLUMNS)).toBe(false);
    expect(isNotProvisioned(pg("42883", "function market_sources_valid(text[]) does not exist"), COLUMNS)).toBe(false);
    expect(isNotProvisioned({ message: 'column "derivation" does not exist' }, COLUMNS)).toBe(false);
    expect(isNotProvisioned(null, COLUMNS)).toBe(false);
  });
});
