import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sql = readFileSync(
  new URL("../../../../drizzle/0136_prism_stripe_sandbox.sql", import.meta.url),
  "utf8",
);

describe("PRISM Stripe sandbox migration contract", () => {
  it("creates every server-only authority table with test-only scope", () => {
    for (const table of [
      "product_flow_account_subjects",
      "product_flow_prism_stripe_invitations",
      "product_flow_entitlement_owners",
      "product_flow_stripe_checkout_attempts",
      "product_flow_stripe_subscriptions",
      "product_flow_stripe_invoice_grants",
      "product_flow_stripe_event_receipts",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql.match(/environment TEXT NOT NULL CHECK \(environment = 'test'\)/g))
      .toHaveLength(7);
    expect(sql).not.toMatch(/sk_test_|whsec_/);
    expect(sql).toContain("'subscription_resumed'");
    expect(sql).toContain("DROP CONSTRAINT product_flow_events_event_type_check");
  });

  it("freezes exact card-only Checkout metadata, parameters, and idempotency", () => {
    expect(sql).toContain("checkout_params ?& ARRAY[");
    expect(sql).toContain("'payment_method_types'");
    expect(sql).toContain("'[\"card\"]'::JSONB");
    expect(sql).toContain("'prism_signals_all_test_v1'");
    expect(sql).toContain("'attempt_ref', attempt_ref");
    expect(sql).toContain("UNIQUE (environment, idempotency_key)");
    expect(sql).toContain("EXTRACT(EPOCH FROM provider_expires_at)::BIGINT");
  });

  it("allows one current generation, prevents terminal reactivation, and cascades account erasure without deleting generic events", () => {
    expect(sql).toContain("idx_product_flow_one_current_owner");
    expect(sql).toContain("protect_product_flow_terminal_owner");
    expect(sql).toContain("terminal product flow entitlement owner is immutable");
    expect(sql).toContain("REFERENCES product_flow_account_subjects");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).not.toMatch(
      /REFERENCES product_flow_(?:events|entitlement_snapshots)[\s\S]{0,80}ON DELETE CASCADE/,
    );
  });

  it("requires a distinct expiring operator invitation and blocks unsafe account erasure", () => {
    expect(sql).toContain("scope = 'stripe_all_sandbox_v1'");
    expect(sql).toContain("status IN ('active', 'revoked')");
    expect(sql).toContain("invited_at < expires_at");
    expect(sql).toContain("protect_prism_stripe_active_account_erasure");
    expect(sql).toContain("%I.product_flow_stripe_subscriptions");
    expect(sql).toContain("TG_TABLE_SCHEMA");
    expect(sql).toContain("sub.status NOT IN (''canceled'', ''incomplete_expired'')");
    expect(sql).toContain("OR sub.reconciliation_status = ''required''");
  });

  it("binds exact paid invoices, payment intents, refunds, and digest receipts", () => {
    expect(sql).toContain("stripe_payment_intent_id TEXT NOT NULL");
    expect(sql).toContain("UNIQUE (environment, stripe_payment_intent_id)");
    expect(sql).toContain("idx_prism_stripe_refund_once");
    expect(sql).toContain("payload_sha256 TEXT NOT NULL");
    expect(sql).toContain("'requires_review'");
    expect(sql).toContain("amount_paid_minor INTEGER NOT NULL CHECK (amount_paid_minor = 500)");
    expect(sql).toContain("reconciliation_action = 'cancel_subscription'");
    expect(sql).toContain("reconciliation_reason IN ('refund_before_grant', 'full_refund')");
    expect(sql).toContain("idx_prism_stripe_refund_reconciliation_once");
  });
});
