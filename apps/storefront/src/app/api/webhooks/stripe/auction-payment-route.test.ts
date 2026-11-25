import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({ query: vi.fn(), calculateSellerPayout: vi.fn() }));
vi.mock("@/lib/wholesale/client", () => ({ reportSale: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/membership/db", () => ({ processOrderRewards: vi.fn() }));
vi.mock("@/lib/social/db", () => ({ postActivity: vi.fn(), awardAchievement: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stock/reservations", () => ({ commitCartToSale: vi.fn(), releaseHolder: vi.fn(), holderForStripeSession: vi.fn() }));
vi.mock("@/lib/orders/record", () => ({ recordOrderFromStripeSession: vi.fn() }));
vi.mock("@/lib/market/stripe-checkout-attempts", () => ({
  findStripeMarketCheckoutBinding: vi.fn(async () => null), markStripeCheckoutAttemptTerminal: vi.fn(),
  recordStripeMarketCheckoutProcessing: vi.fn(), retireLegacyStripeSession: vi.fn(), settleStripeMarketCheckout: vi.fn(),
}));
vi.mock("@/lib/auction/db", () => ({ calculateSellerPayout: mocks.calculateSellerPayout }));
vi.mock("@/lib/auction/email", () => ({ sendAuctionSellerPaidEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/auction/lifecycle-log", () => ({ logAuctionTransition: vi.fn() }));
vi.mock("@/lib/escrow/trust-engine", () => ({ calculateTrustScore: vi.fn(async () => 0) }));
vi.mock("@/lib/notifications/db", () => ({ notify: vi.fn(async () => {}) }));

import { getStripe } from "@/lib/stripe";
import { POST } from "./route";

const deliver = (over: Record<string, unknown> = {}) => {
  const session = {
    id: "cs_auction", object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid",
    amount_total: 5000, currency: "gbp", payment_intent: "pi_auction", metadata: { type: "auction_payment", auction_id: "a1" }, ...over,
  } as unknown as Stripe.Checkout.Session;
  vi.mocked(getStripe).mockReturnValue({
    webhooks: { constructEvent: vi.fn(() => ({ id: "evt_auction", type: "checkout.session.completed", data: { object: session } })) },
  } as never);
  return POST(new Request("https://example.test/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "signed" }, body: "signed-body" }));
};
const stamps = () => mocks.query.mock.calls.filter(([sql]) => /^\s*UPDATE auctions\b/.test(sql as string)) as [string, unknown[]][];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  mocks.calculateSellerPayout.mockResolvedValue({ payout: 45 });
  mocks.query.mockImplementation(async (sql: string) =>
    /^\s*UPDATE auctions\b/.test(sql)
      ? { rows: [{ id: "a1", winner_user_id: "w", seller_user_id: "s", is_consignment: false, current_price: "50.00", title: "Lot" }], rowCount: 1 }
      : { rows: [], rowCount: 0 });
});

// The seller's payout rule reads this stamp (lib/payouts/owed.ts), and nothing else sets it.
describe("Stripe webhook: the winner's payment for an auction", () => {
  it("records it once, on an ended auction only, and works out the payout", async () => {
    expect((await deliver()).status).toBe(200);
    expect(stamps()).toHaveLength(1);
    const [sql, params] = stamps()[0];
    expect(sql).toMatch(/SET status = 'paid'/);
    expect(sql).toMatch(/\bpaid_at = NOW\(\)/);
    expect(sql).toMatch(/WHERE id = \$1 AND status = 'ended'/);
    expect(params[0]).toBe("a1");
    expect(mocks.calculateSellerPayout).toHaveBeenCalledWith("a1");
  });
  it("records nothing for a session that is not paid", async () => {
    expect((await deliver({ payment_status: "unpaid" })).status).toBe(200);
    expect(stamps()).toEqual([]);
  });
});
