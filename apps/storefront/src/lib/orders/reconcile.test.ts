import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { reconcileStripeOrders } from "./reconcile";

const stripeMocks = vi.hoisted(() => ({
  list: vi.fn(),
  retrieve: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        list: stripeMocks.list,
        retrieve: stripeMocks.retrieve,
      },
    },
  }),
}));

vi.mock("./record", () => ({
  recordOrderFromStripeSession: stripeMocks.record,
}));

function checkoutSession(
  id: string,
  metadata: Stripe.Metadata | null,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id,
    object: "checkout.session",
    created: Math.floor(Date.parse("2026-07-06T13:00:00.000Z") / 1_000),
    metadata,
    status: "complete",
    payment_status: "paid",
    ...overrides,
  } as Stripe.Checkout.Session;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("reconcileStripeOrders", () => {
  it("never sends named or B2B Checkout sessions to customer_orders", async () => {
    const retail = checkoutSession("cs_retail", {
      skus: JSON.stringify([{ sku: "OP-OP01-001-JP", qty: 1 }]),
    });
    const sessions = [
      checkoutSession("cs_market", { type: "market_trade_payment", trade_id: "trade-1" }),
      checkoutSession("cs_auction", { type: "auction_payment", auction_id: "auction-1" }),
      checkoutSession("cs_future", { type: "future_named_flow" }),
      checkoutSession("cs_b2b", { b2b_channel: "wholesale" }),
      checkoutSession("cs_unpaid", null, { status: "open", payment_status: "unpaid" }),
      retail,
    ];
    stripeMocks.list.mockResolvedValueOnce({ data: sessions, has_more: false });
    stripeMocks.retrieve.mockResolvedValueOnce(retail);
    stripeMocks.record.mockResolvedValueOnce({ created: true });

    const result = await reconcileStripeOrders();

    expect(result).toEqual({
      scanned: 6,
      paid: 5,
      recorded: 1,
      skipped: 0,
      nonRetailSkipped: 4,
      errors: 0,
    });
    expect(stripeMocks.retrieve).toHaveBeenCalledTimes(1);
    expect(stripeMocks.retrieve).toHaveBeenCalledWith("cs_retail", {
      expand: ["line_items", "collected_information"],
    });
    expect(stripeMocks.record).toHaveBeenCalledTimes(1);
    expect(stripeMocks.record).toHaveBeenCalledWith(retail);
  });

  it("keeps retail reconciliation idempotency accounting intact", async () => {
    const retail = checkoutSession("cs_existing", {
      skus: JSON.stringify([{ sku: "OP-OP01-001-JP", qty: 1 }]),
    });
    stripeMocks.list.mockResolvedValueOnce({ data: [retail], has_more: false });
    stripeMocks.retrieve.mockResolvedValueOnce(retail);
    stripeMocks.record.mockResolvedValueOnce({ created: false });

    await expect(reconcileStripeOrders()).resolves.toMatchObject({
      paid: 1,
      recorded: 0,
      skipped: 1,
      nonRetailSkipped: 0,
    });
  });
});
