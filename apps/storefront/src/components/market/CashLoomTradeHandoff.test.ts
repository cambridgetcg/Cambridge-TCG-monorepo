import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CashLoomTradeHandoff.tsx", import.meta.url), "utf8");

describe("CashLoom trade handoff preparation UI contract", () => {
  it("uses one stable client retry key and the dedicated participant route", () => {
    expect(source).toMatch(/useRef<\{ scope: string; key: string \} \| null>/);
    expect(source).toMatch(/crypto\.randomUUID\(\)/);
    expect(source).toContain("retryScope");
    expect(source).toContain("/cashloom/preparation");
    expect(source).toContain('expected_preparation_state: "none"');
    expect(source).toContain('disclosure_notice_version: "cashloom-preparation-retention-v1"');
  });

  it("states the local receipt boundary before and after mutation", () => {
    expect(source).toContain("Prepared locally · no payment");
    expect(source).toContain("host-local account evidence");
    expect(source).toContain("none sent or selected");
    expect(source).toContain("not created or observed");
    expect(source).toContain("Both trade");
    expect(source).toContain("retention and erasure policy is still under review");
    expect(source).not.toMatch(/CashLoom payment (?:sent|complete|confirmed)/i);
  });
});
