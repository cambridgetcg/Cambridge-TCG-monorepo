import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../drizzle/0128_cashloom_payment_preparation.sql", import.meta.url),
  "utf8",
);

describe("CashLoom payment-preparation migration boundary", () => {
  it("stores one retained content-addressed buyer preparation per trade and handoff", () => {
    expect(migration).toMatch(/preparation_id TEXT PRIMARY KEY/);
    expect(migration).toMatch(/trade_id UUID NOT NULL UNIQUE[\s\S]*ON DELETE RESTRICT/);
    expect(migration).toMatch(
      /FOREIGN KEY \(trade_id, handoff_id, terms_hash\)[\s\S]*REFERENCES market_trade_cashloom_handoffs[\s\S]*ON DELETE RESTRICT/,
    );
    expect(migration).toMatch(/prepared_by UUID NOT NULL[\s\S]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/UNIQUE \(prepared_by, idempotency_key_hash\)/);
    expect(migration).toMatch(
      /disclosure_notice_version = 'cashloom-preparation-retention-v1'/,
    );
  });

  it("rejects evidence rewrites and deletion at the database boundary", () => {
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON market_trade_cashloom_payment_preparations[\s\S]*reject_cashloom_payment_preparation_mutation\(\)/,
    );
  });

  it("rechecks buyer authority and the closed payment window on every insert", () => {
    expect(migration).toMatch(/BEFORE INSERT ON market_trade_cashloom_payment_preparations/);
    expect(migration).toMatch(/NEW\.prepared_by <> trade_buyer_id/);
    expect(migration).toMatch(/trade_state <> 'awaiting_payment'/);
    expect(migration).toMatch(/trade_payment_expires_at <= NOW\(\)/);
  });

  it("contains no provider, custody, settlement, payout, or live-trade mutation fields", () => {
    const table = migration.match(
      /CREATE TABLE IF NOT EXISTS market_trade_cashloom_payment_preparations \(([\s\S]*?)\n\);/,
    )?.[1] ?? "";
    expect(table).not.toMatch(
      /stripe|provider|wallet|private_key|seed|payment_intent|session_id|escrow_status|payout_status|settled_at/i,
    );
    expect(migration).not.toMatch(/(?:ALTER|UPDATE|DELETE FROM)\s+market_trades/i);
  });
});
