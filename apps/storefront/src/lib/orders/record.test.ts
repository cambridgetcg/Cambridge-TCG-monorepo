import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { recordOrderFromStripeSession } from "./record";

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: dbMocks.query }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("recordOrderFromStripeSession", () => {
  it.each([
    { type: "market_trade_payment", trade_id: "trade-1" },
    { type: "market_lot_payment", lot_trade_id: "lot-trade-1" },
    { type: "auction_payment", auction_id: "auction-1" },
    { type: "future_named_flow" },
    { b2b_channel: "wholesale" },
  ])("rejects non-retail metadata before any email lookup or insert: %o", async (metadata) => {
    const session = {
      id: "cs_non_retail",
      metadata,
    } as unknown as Stripe.Checkout.Session;

    await expect(recordOrderFromStripeSession(session)).rejects.toThrow("non-retail flow");
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});
