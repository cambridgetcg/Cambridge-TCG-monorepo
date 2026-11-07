import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The data-API admission (Yu, 2026-10-28) is its own record: with it present
// and every data-API and PRISM switch turned on, each retired paid admission
// still answers as it did before.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  placeOrder: vi.fn(),
  getLot: vi.fn(),
  beginLotPurchase: vi.fn(),
  placeBid: vi.fn(),
  getAuction: vi.fn(),
  prismReserve: vi.fn(),
  prismClient: vi.fn(),
  getStripe: vi.fn(),
  loadCartRows: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/market/db", () => ({
  placeOrder: mocks.placeOrder, getUserOrders: vi.fn(), cancelOrder: vi.fn(), TrustGateError: class extends Error {},
  resolveCatalogCard: vi.fn(), countDuplicateOpenAsks: vi.fn(),
}));
vi.mock("@/lib/market/lots", () => ({ getLot: mocks.getLot, beginLotPurchase: mocks.beginLotPurchase }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/auction/db", () => ({ getAuction: mocks.getAuction, placeBid: mocks.placeBid, getBidHistory: vi.fn() }));
vi.mock("@/lib/auction/email", () => ({ sendOutbidEmail: vi.fn() }));
vi.mock("@/lib/prism-signals/stripe", () => ({
  reservePrismStripeCheckoutAttempt: mocks.prismReserve,
  getPrismStripeTestClient: mocks.prismClient,
}));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.getStripe }));
vi.mock("@/lib/b2b/cart", () => ({ loadCartRows: mocks.loadCartRows }));
vi.mock("@/lib/wholesale/client", () => ({ fetchCard: vi.fn() }));
vi.mock("@/lib/stock/reservations", () => ({ reserveCartItems: vi.fn(), holderForStripeSession: vi.fn() }));

import { DATA_API_PAID_PLANS, NEW_PAID_COMMERCE_RETIRED, NEW_PAID_COMMERCE_RETIRED_CODE } from "./commercial-retirement";
import { p2pCommitmentPauseResponse } from "./production-gates";
import { dataApiCheckoutIntake, dataApiPlansPublished } from "@/lib/data-api/posture";
import { POST as marketOrder } from "@/app/api/market/orders/route";
import { POST as lotBuy } from "@/app/api/market/lots/[id]/buy/route";
import { POST as auctionBid } from "@/app/api/auctions/[id]/bids/route";
import { POST as membershipSubscribe } from "@/app/api/membership/subscribe/route";
import { POST as retailCheckout } from "@/app/api/checkout/route";
import { POST as prismCheckout } from "@/app/api/prism-signals/stripe/checkout/route";
import { POST as dataApiCheckout } from "@/app/api/data-api/checkout/route";
import { startCheckout as b2bCheckout } from "@/lib/b2b/checkout";

const json = (url: string, body: unknown, headers: Record<string, string> = {}) => new Request(url, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "8b7f0d2e-3c1a-4f5e-9a6b-1c2d3e4f5a6b", email: "member@example.test" } });
  // Every switch that could plausibly reopen something, turned on.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("P2P_COMMITMENT_MODE", "reviewed-adult-human-review-v1");
  vi.stubEnv("DATA_API_CHECKOUT_INTAKE", "test");
  vi.stubEnv("DATA_API_PLANS_PUBLISHED", "on");
  vi.stubEnv("DATA_API_STRIPE_SECRET_KEY", "rk_test_fixture_dataapi_0000001");
  vi.stubEnv("DATA_API_STRIPE_WEBHOOK_SECRET", "whsec_fixture_dataapi_00000001");
  vi.stubEnv("DATA_API_STRIPE_PRICE_PRO", "price_dataapipro0001");
  vi.stubEnv("DATA_API_STRIPE_PRICE_BUSINESS", "price_dataapibiz0001");
  vi.stubEnv("PRISM_STRIPE_CHECKOUT_INTAKE", "enabled");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture_main_000000001");
});
afterEach(() => vi.unstubAllEnvs());

async function expectRetired(response: Response) {
  expect(response.status).toBe(410);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(JSON.stringify(body)).toContain(NEW_PAID_COMMERCE_RETIRED_CODE);
}

describe("data-API admission is separate and reopens nothing", () => {
  it("keeps new paid commerce retired beside a test-only data-API record", () => {
    expect(NEW_PAID_COMMERCE_RETIRED).toBe(true);
    expect(DATA_API_PAID_PLANS).toEqual({
      scope: "data-api-subscriptions", mode: "test-only", livePayments: false,
      decidedBy: "Yu", decidedOn: "2026-10-28", decision: "docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md",
    });
    expect(Object.isFrozen(DATA_API_PAID_PLANS)).toBe(true);
    expect(dataApiCheckoutIntake()).toBe("test");
    expect(dataApiPlansPublished()).toBe(true);
  });

  it("marketplace orders and lot purchases still answer 410 before the DAL", async () => {
    await expectRetired(p2pCommitmentPauseResponse()!);
    await expectRetired(await marketOrder(json("https://cambridgetcg.com/api/market/orders", { side: "ask", sku: "op-op01-001-en", price: 5, quantity: 1 })));
    await expectRetired(await lotBuy(json("https://cambridgetcg.com/api/market/lots/lot-1/buy", {}), { params: Promise.resolve({ id: "lot-1" }) }));
    expect(mocks.placeOrder).not.toHaveBeenCalled();
    expect(mocks.getLot).not.toHaveBeenCalled();
    expect(mocks.beginLotPurchase).not.toHaveBeenCalled();
  });

  it("auction bids still answer 410 before the DAL", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    await expectRetired(await auctionBid(json(`https://cambridgetcg.com/api/auctions/${id}/bids`, { amount: 10 }), { params: Promise.resolve({ id }) }));
    expect(mocks.getAuction).not.toHaveBeenCalled();
    expect(mocks.placeBid).not.toHaveBeenCalled();
  });

  it("membership and retail checkout still answer 410", async () => {
    const membership = await membershipSubscribe();
    expect(membership.status).toBe(410);
    const retail = await retailCheckout(json("https://cambridgetcg.com/api/checkout", { items: [] }));
    expect(retail.status).toBe(410);
    await expect(retail.json()).resolves.toMatchObject({ error: { code: "DEPRECATED" } });
  });

  it("PRISM checkout still answers 410 without reserving or calling Stripe", async () => {
    await expectRetired(await prismCheckout(json("https://cambridgetcg.com/api/prism-signals/stripe/checkout", {}, {
      origin: "https://cambridgetcg.com", "sec-fetch-site": "same-origin",
    })));
    expect(mocks.prismReserve).not.toHaveBeenCalled();
    expect(mocks.prismClient).not.toHaveBeenCalled();
  });

  it("data-API test checkout stays closed to a member, admitting only operators (users.role = 'admin')", async () => {
    // The session above is a member's: no admin role. A Stripe test card must not buy it a paid plan.
    const response = await dataApiCheckout(json("https://cambridgetcg.com/api/data-api/checkout", { plan: "business" }, {
      origin: "https://cambridgetcg.com", "sec-fetch-site": "same-origin",
    }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "DATA_API_CHECKOUT_CLOSED" } });
  });

  it("B2B checkout still stops before cart, price, stock or Stripe work", async () => {
    // A server action, not an HTTP route: it answers purchases_paused rather than a status.
    await expect(b2bCheckout("8b7f0d2e-3c1a-4f5e-9a6b-1c2d3e4f5a6b", "buyer@example.test")).resolves.toMatchObject({ ok: false, reason: "purchases_paused" });
    expect(mocks.loadCartRows).not.toHaveBeenCalled();
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
});
