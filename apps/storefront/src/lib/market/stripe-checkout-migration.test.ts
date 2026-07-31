import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../drizzle/0133_market_trade_payment_attempts.sql", import.meta.url),
  "utf8",
);

describe("market trade payment-attempt migration", () => {
  it("makes the executable rail one-per-trade and immutable", () => {
    expect(migration).toMatch(
      /market_trade_settlement_reservations \([\s\S]*trade_id UUID PRIMARY KEY REFERENCES market_trades/,
    );
    expect(migration).toMatch(/CHECK \(rail = 'stripe_checkout'\)/);
    expect(migration).toMatch(/CONSTRAINT market_trade_settlement_rail_supported/);
    expect(migration).toMatch(
      /BEFORE UPDATE ON market_trade_settlement_reservations[\s\S]*reject_market_trade_settlement_rail_change\(\)/,
    );
    expect(migration).toMatch(/market_trade_settlement_reservations_no_direct_delete/);
    expect(migration).toMatch(/market_trade_stripe_attempts_no_direct_delete/);
    expect(migration).not.toMatch(/CHECK \(rail IN \([^)]*cashloom/i);
  });

  it("stores a generation-scoped exact provider binding", () => {
    expect(migration).toMatch(/UNIQUE \(trade_id, generation\)/);
    expect(migration).toMatch(/idempotency_key TEXT NOT NULL UNIQUE/);
    expect(migration).toMatch(/request_snapshot JSONB NOT NULL/);
    expect(migration).toMatch(/expected_amount_pence BIGINT NOT NULL/);
    expect(migration).toMatch(/expected_currency TEXT NOT NULL CHECK \(expected_currency = 'gbp'\)/);
    expect(migration).toMatch(/stripe_session_id TEXT UNIQUE/);
    expect(migration).toMatch(/provider_expires_at TIMESTAMPTZ NOT NULL/);
    expect(migration).toMatch(/idx_market_trade_stripe_attempt_client_reference/);
    expect(migration).toMatch(/request_snapshot->>'client_reference_id'/);
  });

  it("allows only one chargeable, processing, ambiguous, or review-held attempt", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_market_trade_stripe_one_blocking_attempt[\s\S]*WHERE status IN \('reserved', 'checkout_open', 'processing', 'requires_review'\)/,
    );
    expect(migration).toMatch(/status IN \([\s\S]*'expired',[\s\S]*'failed',[\s\S]*'requires_review'/);
  });

  it("keeps CashLoom handoff preparation non-executing", () => {
    expect(migration).toMatch(/Preparing the existing[\s\S]*CashLoom handoff does not create a reservation/);
    expect(migration).not.toMatch(/cashloom_settlement_profiles|market_trade_cashloom_handoffs/);
  });

  it("retains idempotent terminal evidence for pre-v2 Sessions", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS market_trade_legacy_stripe_terminal_events/);
    expect(migration).toMatch(/stripe_session_id TEXT PRIMARY KEY/);
    expect(migration).toMatch(/terminal_status TEXT NOT NULL CHECK \(terminal_status IN \('expired', 'failed'\)\)/);
    expect(migration).toMatch(/market_trade_legacy_terminal_no_update/);
    expect(migration).toMatch(/market_trade_legacy_terminal_no_direct_delete/);
  });

  it("supports a fair, leased reconciliation queue", () => {
    expect(migration).toMatch(/last_reconciled_at TIMESTAMPTZ/);
    expect(migration).toMatch(
      /idx_market_trade_stripe_attempts_reconcile[\s\S]*last_reconciled_at ASC NULLS FIRST, updated_at ASC/,
    );
  });
});
