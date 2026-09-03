import { describe, expect, it, vi } from "vitest";
import type {
  ProductFlowRuntimeQueryV1,
  ProductFlowRuntimeTransactionRunnerV1,
} from "@/lib/product-flow-runtime/postgres.server";
import type { PrismStripeSandboxConfigV1 } from "./config.server";
import {
  PrismStripeStoreError,
  preflightPrismStripeWebhookReceipt,
  processPrismStripeWebhookAtomically,
} from "./index";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

const config: PrismStripeSandboxConfigV1 = {
  posture: "stripe-test-v1",
  environment: "test",
  apiVersion: "2026-02-25.clover",
  secretKey: `sk_test_${"a".repeat(32)}`,
  webhookSecret: `whsec_${"b".repeat(32)}`,
  accountId: "acct_prismtest123",
  priceId: "price_prismtest123",
  productId: "prod_prismtest123",
  portalConfigurationId: "bpc_prismtest123",
  referenceSecret: "reference-secret-with-at-least-32-chars",
  checkoutIntakeEnabled: true,
  webhookProcessingEnabled: true,
  currency: "gbp",
  unitAmountMinor: 500,
  interval: "month",
};

function receipt(receivedAt = "2026-09-03T08:00:00.000Z") {
  return {
    config,
    stripeEventId: "evt_prismtest123",
    stripeAccountId: config.accountId,
    apiVersion: config.apiVersion,
    eventType: "payment_intent.succeeded",
    livemode: false as const,
    payloadSha256: "a".repeat(64),
    providerCreatedAt: "2026-09-03T07:59:00.000Z",
    receivedAt,
  };
}

function runner(query: ProductFlowRuntimeQueryV1): ProductFlowRuntimeTransactionRunnerV1 {
  return async (work) => work(query);
}

describe("PRISM Stripe atomic receipt boundary", () => {
  it("preflights a completed exact receipt before provider lookups", async () => {
    const query: ProductFlowRuntimeQueryV1 = async () => ({
      rows: [{
        stripe_account_id: config.accountId,
        api_version: config.apiVersion,
        event_type: "payment_intent.succeeded",
        livemode: false,
        payload_sha256: "a".repeat(64),
        provider_created_at: "2026-09-03T07:59:00.000Z",
        received_at: "2026-09-03T08:00:00.000Z",
        outcome: "processed",
        outcome_code: "payment_observed",
      }],
      rowCount: 1,
    });
    await expect(
      preflightPrismStripeWebhookReceipt(
        receipt("2026-09-03T08:10:00.000Z"),
        { query },
      ),
    ).resolves.toEqual({
      disposition: "duplicate",
      outcome: "processed",
      code: "payment_observed",
    });
  });

  it("persists a bounded review outcome in the receipt transaction", async () => {
    const statements: string[] = [];
    const query: ProductFlowRuntimeQueryV1 = async (sql) => {
      statements.push(sql);
      if (sql.includes("INSERT INTO product_flow_stripe_event_receipts")) {
        return { rows: [{ stripe_event_id: "evt_prismtest123" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE product_flow_stripe_event_receipts")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    };
    const result = await processPrismStripeWebhookAtomically(
      receipt(),
      (actions) => actions.requiresReview("unsupported_event_type"),
      { runTransaction: runner(query) },
    );
    expect(result).toEqual({
      disposition: "processed",
      outcome: "requires_review",
      code: "unsupported_event_type",
    });
    expect(statements).toHaveLength(2);
  });

  it("accepts a later redelivery time for the same signed event and does not rerun work", async () => {
    const callback = vi.fn();
    const query: ProductFlowRuntimeQueryV1 = async (sql) => {
      if (sql.includes("INSERT INTO product_flow_stripe_event_receipts")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM product_flow_stripe_event_receipts")) {
        return {
          rows: [{
            stripe_account_id: config.accountId,
            api_version: config.apiVersion,
            event_type: "payment_intent.succeeded",
            livemode: false,
            payload_sha256: "a".repeat(64),
            provider_created_at: "2026-09-03T07:59:00.000Z",
            received_at: "2026-09-03T08:00:00.000Z",
            outcome: "requires_review",
            outcome_code: "unsupported_event_type",
          }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    };
    const result = await processPrismStripeWebhookAtomically(
      receipt("2026-09-03T08:05:00.000Z"),
      callback,
      { runTransaction: runner(query) },
    );
    expect(result.disposition).toBe("duplicate");
    expect(callback).not.toHaveBeenCalled();
  });

  it("rejects changed duplicate semantics and never calls provider work", async () => {
    const callback = vi.fn();
    const query: ProductFlowRuntimeQueryV1 = async (sql) => {
      if (sql.includes("INSERT INTO product_flow_stripe_event_receipts")) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [{
          stripe_account_id: config.accountId,
          api_version: config.apiVersion,
          event_type: "payment_intent.succeeded",
          livemode: false,
          payload_sha256: "b".repeat(64),
          provider_created_at: "2026-09-03T07:59:00.000Z",
          received_at: "2026-09-03T08:00:00.000Z",
          outcome: "processed",
          outcome_code: "ignored",
        }],
        rowCount: 1,
      };
    };
    await expect(
      processPrismStripeWebhookAtomically(receipt(), callback, {
        runTransaction: runner(query),
      }),
    ).rejects.toBeInstanceOf(PrismStripeStoreError);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not complete a receipt when callback work throws", async () => {
    const update = vi.fn();
    const query: ProductFlowRuntimeQueryV1 = async (sql) => {
      if (sql.includes("INSERT INTO product_flow_stripe_event_receipts")) {
        return { rows: [{ stripe_event_id: "evt_prismtest123" }], rowCount: 1 };
      }
      update();
      return { rows: [], rowCount: 1 };
    };
    await expect(
      processPrismStripeWebhookAtomically(
        receipt(),
        () => {
          throw new Error("projection failed");
        },
        { runTransaction: runner(query) },
      ),
    ).rejects.toThrow("projection failed");
    expect(update).not.toHaveBeenCalled();
  });
});
