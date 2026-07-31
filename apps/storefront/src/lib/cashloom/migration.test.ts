import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../drizzle/0127_cashloom_settlement.sql", import.meta.url),
  "utf8",
);

function tableDefinition(table: string): string {
  const match = migration.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`),
  );
  if (!match?.[1]) throw new Error(`Missing ${table} definition.`);
  return match[1];
}

describe("CashLoom settlement migration boundary", () => {
  it("stores only a declared public key pin in the account profile", () => {
    const profile = tableDefinition("cashloom_settlement_profiles");

    expect(profile).toMatch(/merchant_key_id TEXT NOT NULL/);
    expect(profile).toContain("^sha256:[0-9a-f]{64}$");
    expect(profile).toMatch(/user_id UUID PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(profile).not.toMatch(/private_key|seed|wallet_address|endpoint|provider_account/i);
  });

  it("keeps the handoff insert-only and free of settlement state", () => {
    const handoff = tableDefinition("market_trade_cashloom_handoffs");

    expect(handoff).toMatch(/trade_id UUID PRIMARY KEY REFERENCES market_trades\(id\) ON DELETE CASCADE/);
    expect(handoff).toMatch(/canonical_json TEXT NOT NULL/);
    expect(handoff).toMatch(/octet_length\(canonical_json\) <= 16384/);
    expect(handoff).not.toMatch(
      /payment_status|escrow_status|payout_status|txid|confirmation|private_key|seed|wallet_address/i,
    );
    expect(migration).toMatch(
      /BEFORE UPDATE ON market_trade_cashloom_handoffs[\s\S]*reject_cashloom_handoff_update\(\)/,
    );
  });

  it("does not rewrite the live trade or processor state machine", () => {
    expect(migration).not.toMatch(/^\s*(?:BEGIN|COMMIT)\s*;/im);
    expect(migration).not.toMatch(/(?:ALTER|UPDATE|DELETE FROM)\s+market_trades/i);
    expect(migration).not.toMatch(/stripe_payment|buyer_paid|seller_paid/i);
  });
});
