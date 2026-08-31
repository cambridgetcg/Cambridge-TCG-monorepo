import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { query } from "@/lib/db";
import {
  findStripeMarketCheckoutBinding,
  markStripeCheckoutAttemptTerminal,
  recordStripeMarketCheckoutProcessing,
  settleStripeMarketCheckout,
} from "@/lib/market/stripe-checkout-attempts";
import { getStripe } from "@/lib/stripe";
import { recordOrderFromStripeSession } from "./record";
import { reconcileStripeOrders } from "./reconcile";

vi.mock("@/lib/market/stripe-checkout-attempts", () => ({
  findStripeMarketCheckoutBinding: vi.fn(),
  markStripeCheckoutAttemptTerminal: vi.fn(),
  recordStripeMarketCheckoutProcessing: vi.fn(),
  settleStripeMarketCheckout: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("./record", () => ({ recordOrderFromStripeSession: vi.fn() }));

const stripeMocks = {
  list: vi.fn(),
  retrieve: vi.fn(),
};

function checkout(
  id: string,
  metadata: Record<string, string> = {},
): Stripe.Checkout.Session {
  return {
    id,
    object: "checkout.session",
    status: "complete",
    payment_status: "paid",
    mode: "payment",
    amount_total: 2460,
    currency: "gbp",
    metadata,
  } as unknown as Stripe.Checkout.Session;
}

function onePage(...sessions: Stripe.Checkout.Session[]) {
  stripeMocks.list.mockResolvedValueOnce({ data: sessions, has_more: false });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(getStripe).mockReturnValue({
    checkout: { sessions: stripeMocks },
  } as never);
  vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
  vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Stripe order reconciliation ownership", () => {
  it("settles a paid market trade with its shipping payload and never records a retail order", async () => {
    const listed = checkout("cs_market", {
      type: "market_trade_payment",
      trade_id: "11111111-1111-4111-8111-111111111111",
      payment_attempt_id: "22222222-2222-4222-8222-222222222222",
    });
    const detail = {
      ...listed,
      collected_information: {
        business_name: null,
        individual_name: null,
        shipping_details: {
          name: "Ada Lovelace",
          address: {
            line1: "1 Market Street",
            line2: "Flat 2",
            city: "Cambridge",
            state: "Cambridgeshire",
            postal_code: "CB1 1AA",
            country: "GB",
          },
        },
      },
    } as Stripe.Checkout.Session;
    onePage(listed);
    stripeMocks.retrieve.mockResolvedValueOnce(detail);
    vi.mocked(settleStripeMarketCheckout).mockResolvedValueOnce({
      ok: true,
      applied: true,
      trade: { id: listed.metadata?.trade_id },
    });

    const summary = await reconcileStripeOrders();

    expect(stripeMocks.retrieve).toHaveBeenCalledWith(listed.id, {
      expand: ["line_items"],
    });
    expect(settleStripeMarketCheckout).toHaveBeenCalledWith(detail, {
      name: "Ada Lovelace",
      line1: "1 Market Street",
      line2: "Flat 2",
      city: "Cambridge",
      state: "Cambridgeshire",
      postal_code: "CB1 1AA",
      country: "GB",
    });
    expect(recordOrderFromStripeSession).not.toHaveBeenCalled();
    expect(summary).toEqual({
      scanned: 1,
      paid: 1,
      recorded: 0,
      marketAttemptsScanned: 0,
      marketApplied: 1,
      marketProcessing: 0,
      marketTerminal: 0,
      review: 0,
      skipped: 0,
      errors: 0,
    });
  });

  it("skips both dedicated tagged sessions and wholesale B2B sessions before retail retrieval", async () => {
    onePage(
      checkout("cs_auction", { type: "auction_payment" }),
      checkout("cs_b2b", { b2b_channel: "wholesale" }),
      checkout("cs_future", { type: "unknown_future_flow" }),
    );

    const summary = await reconcileStripeOrders();

    expect(stripeMocks.retrieve).not.toHaveBeenCalled();
    expect(settleStripeMarketCheckout).not.toHaveBeenCalled();
    expect(recordOrderFromStripeSession).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      scanned: 3,
      paid: 3,
      recorded: 0,
      marketAttemptsScanned: 0,
      marketApplied: 0,
      marketProcessing: 0,
      marketTerminal: 0,
      review: 0,
      skipped: 3,
      errors: 0,
    });
  });

  it("keeps untagged retail reconciliation unchanged", async () => {
    const listed = checkout("cs_retail", { skus: "[]" });
    const detail = { ...listed, customer_email: "buyer@example.test" } as Stripe.Checkout.Session;
    onePage(listed);
    stripeMocks.retrieve.mockResolvedValueOnce(detail);
    vi.mocked(recordOrderFromStripeSession).mockResolvedValueOnce({
      created: true,
      sessionId: detail.id,
      userId: null,
      email: "buyer@example.test",
      totalGbp: 24.6,
    });

    const summary = await reconcileStripeOrders();

    expect(recordOrderFromStripeSession).toHaveBeenCalledWith(detail);
    expect(settleStripeMarketCheckout).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      scanned: 1,
      paid: 1,
      recorded: 1,
      marketAttemptsScanned: 0,
      marketApplied: 0,
      marketProcessing: 0,
      marketTerminal: 0,
      review: 0,
      skipped: 0,
      errors: 0,
    });
  });

  it("routes a locally bound Session with stripped metadata to market, never retail", async () => {
    const listed = checkout("cs_market_stripped");
    const detail = { ...listed, metadata: null } as Stripe.Checkout.Session;
    onePage(listed);
    stripeMocks.retrieve.mockResolvedValueOnce(detail);
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "v2",
      tradeId: "11111111-1111-4111-8111-111111111111",
      attemptId: "22222222-2222-4222-8222-222222222222",
    });
    vi.mocked(settleStripeMarketCheckout).mockResolvedValueOnce({
      ok: true,
      applied: false,
      trade: null,
    });

    const summary = await reconcileStripeOrders();

    expect(settleStripeMarketCheckout).toHaveBeenCalledWith(detail, null);
    expect(recordOrderFromStripeSession).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ marketApplied: 0, skipped: 1, errors: 0 });
  });

  it("separates durable market review from an unrecorded reconciliation error", async () => {
    const held = checkout("cs_market_review", { type: "market_trade_payment" });
    const unowned = checkout("cs_market_unknown", { type: "market_trade_payment" });
    onePage(held, unowned);
    stripeMocks.retrieve.mockResolvedValueOnce(held).mockResolvedValueOnce(unowned);
    vi.mocked(settleStripeMarketCheckout)
      .mockResolvedValueOnce({
        ok: false,
        reason: "wrong amount",
        reviewRecorded: true,
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: "unknown Stripe Checkout attempt",
        reviewRecorded: false,
      });

    const summary = await reconcileStripeOrders();

    expect(recordOrderFromStripeSession).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      scanned: 2,
      paid: 2,
      recorded: 0,
      marketAttemptsScanned: 0,
      marketApplied: 0,
      marketProcessing: 0,
      marketTerminal: 0,
      review: 1,
      skipped: 0,
      errors: 1,
    });
  });

  it("observes bound market attempts regardless of Session creation age", async () => {
    const paid = checkout("cs_old_paid", {
      type: "market_trade_payment",
      payment_attempt_id: "11111111-1111-4111-8111-111111111111",
    });
    const expired = {
      ...checkout("cs_old_expired", {
        type: "market_trade_payment",
        payment_attempt_id: "22222222-2222-4222-8222-222222222222",
      }),
      status: "expired",
      payment_status: "unpaid",
    } as Stripe.Checkout.Session;
    const processing = {
      ...checkout("cs_old_processing", {
        type: "market_trade_payment",
        payment_attempt_id: "33333333-3333-4333-8333-333333333333",
      }),
      payment_status: "unpaid",
    } as Stripe.Checkout.Session;
    vi.mocked(query).mockResolvedValueOnce({
      rows: [paid, expired, processing].map(({ id }) => ({ stripe_session_id: id })),
      rowCount: 3,
    });
    stripeMocks.retrieve
      .mockResolvedValueOnce(paid)
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(processing);
    onePage();
    vi.mocked(settleStripeMarketCheckout).mockResolvedValueOnce({
      ok: true, applied: true, trade: { id: "trade" },
    });
    vi.mocked(markStripeCheckoutAttemptTerminal).mockResolvedValueOnce({
      ok: true, applied: true, trade: null,
    });
    vi.mocked(recordStripeMarketCheckoutProcessing).mockResolvedValueOnce({
      ok: true, applied: true, trade: null,
    });

    const summary = await reconcileStripeOrders();

    expect(vi.mocked(query).mock.calls[0][0]).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(vi.mocked(query).mock.calls[0][0]).toMatch(/last_reconciled_at ASC NULLS FIRST/);
    expect(vi.mocked(query).mock.calls[0][0]).toMatch(/SET last_reconciled_at = NOW\(\)/);
    expect(stripeMocks.retrieve).toHaveBeenCalledTimes(3);
    expect(stripeMocks.retrieve).toHaveBeenNthCalledWith(1, paid.id, {
      expand: ["line_items", "payment_intent"],
    });
    expect(markStripeCheckoutAttemptTerminal).toHaveBeenCalledWith(
      expired,
      "expired",
      expect.stringContaining("reconciliation"),
    );
    expect(recordStripeMarketCheckoutProcessing).toHaveBeenCalledWith(processing);
    expect(summary).toMatchObject({
      scanned: 0,
      marketAttemptsScanned: 3,
      marketApplied: 1,
      marketProcessing: 1,
      marketTerminal: 1,
      errors: 0,
    });
  });
});
