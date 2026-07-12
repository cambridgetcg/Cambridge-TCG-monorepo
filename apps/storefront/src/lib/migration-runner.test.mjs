import { describe, expect, it } from "vitest";
import {
  parseOnlyMigrationNames,
  withoutOwnedTransaction,
} from "../../scripts/migration-utils.mjs";

describe("migration runner transaction ownership", () => {
  it("preserves migration comments while removing a complete owned transaction", () => {
    const sql = "\uFEFF-- why this exists\n/* safety */\nBEGIN;\nSELECT 1;\nCOMMIT;\n";
    const stripped = withoutOwnedTransaction(sql, "0120_example.sql");
    expect(stripped).toContain("-- why this exists");
    expect(stripped).toContain("/* safety */");
    expect(stripped).toContain("SELECT 1;");
    expect(stripped).not.toMatch(/\b(?:BEGIN|COMMIT);/);
  });

  it("refuses a migration with only one transaction boundary", () => {
    expect(() => withoutOwnedTransaction("BEGIN; SELECT 1;", "bad.sql"))
      .toThrow(/only one transaction boundary/);
  });

  it("validates an explicit bounded migration list", () => {
    const available = ["0119_old.sql", "0120_one.sql", "0121_two.sql"];
    expect(parseOnlyMigrationNames("0121_two.sql,0120_one.sql", available)).toEqual([
      "0120_one.sql",
      "0121_two.sql",
    ]);
    expect(() => parseOnlyMigrationNames(undefined, available)).toThrow(/--only requires/);
    expect(() => parseOnlyMigrationNames("0122_unknown.sql", available)).toThrow(/Unknown/);
  });
});
