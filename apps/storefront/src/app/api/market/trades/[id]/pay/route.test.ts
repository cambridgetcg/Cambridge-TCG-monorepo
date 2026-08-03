import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import {
  attachStripeCheckoutSession,
  markStripeCheckoutAttemptForReview,
  markStripeCheckoutAttemptTerminal,
  reserveStripeCheckoutAttempt,
} from "@/lib/market/stripe-checkout-attempts";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/format", () => ({ formatDateTime: vi.fn(() => "deadline") }));
vi.mock("@/lib/market/stripe-checkout-attempts", () => ({
  STRIPE_CHECKOUT_RAIL: "stripe_checkout",
  attachStripeCheckoutSession: vi.fn(),
  getStripeCheckoutAttempt: vi.fn(),
  isMarketPaymentAttemptMigrationMissing: vi.fn(() => false),
  markStripeCheckoutAttemptForReview: vi.fn(),
  markStripeCheckoutAttemptTerminal: vi.fn(),
  normalizeCheckoutSiteUrl: vi.fn((value: string) => value.replace(/\/+$/, "")),
  reserveStripeCheckoutAttempt: vi.fn(),
  retireLegacyStripeSession: vi.fn(),
  stripeCheckoutAttemptBindingProblems: vi.fn(() => []),
}));

const TRADE_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const trade = {
  id: TRADE_ID,
  buyer_id: BUYER_ID,
  escrow_status: "awaiting_payment",
  price: "12.30",
  quantity: 2,
  payment_expires_at: "2099-08-01T10:00:00.000Z",
  card_name: "Roronoa Zoro",
  image_url: null,
};
const attempt = {
  id: ATTEMPT_ID,
  tradeId: TRADE_ID,
  generation: 1,
  status: "reserved" as const,
  idempotencyKey: `ctcg:market-trade:${TRADE_ID}:stripe:${ATTEMPT_ID}`,
  request: {
    version: "stripe_checkout/v2" as const,
    client_reference_id: `ctcg-market-trade:${TRADE_ID}:${ATTEMPT_ID}`,
    product_name: "Roronoa Zoro",
    product_description: "P2P trade — OP-OP01-001-JP",
    image_url: null,
    customer_email: "buyer@example.test",
    shipping_allowed_countries: ["GB", "US"],
    adaptive_pricing_enabled: false as const,
    success_url: `https://example.test/account/trades?paid=${TRADE_ID}`,
    cancel_url: "https://example.test/account/trades",
  },
  expectedAmountPence: 2460,
  expectedCurrency: "gbp" as const,
  stripeSessionId: null,
  stripePaymentIntent: null,
  providerExpiresAt: "2099-08-01T09:00:00.000Z",
  reviewReason: null,
};

const stripeSession = {
  id: "cs_test_one",
  status: "open",
  url: "https://checkout.stripe.test/one",
  mode: "payment",
  amount_total: 2460,
  currency: "gbp",
  client_reference_id: attempt.request.client_reference_id,
  metadata: {
    type: "market_trade_payment",
    trade_id: TRADE_ID,
    payment_attempt_id: ATTEMPT_ID,
    settlement_rail: "stripe_checkout",
  },
} as unknown as Stripe.Checkout.Session;

const stripeMocks = {
  create: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
};

function context() {
  return { params: Promise.resolve({ id: TRADE_ID }) };
}

function request() {
  return new Request(`https://example.test/api/market/trades/${TRADE_ID}/pay`, {
    method: "POST",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: BUYER_ID, email: "buyer@example.test" },
    expires: "2099-01-01T00:00:00.000Z",
  } as never);
  vi.mocked(query).mockResolvedValue({ rows: [trade], rowCount: 1 });
  vi.mocked(getStripe).mockReturnValue({
    checkout: { sessions: stripeMocks },
  } as never);
  vi.mocked(reserveStripeCheckoutAttempt).mockResolvedValue({
    ok: true,
    kind: "attempt",
    attempt,
    reused: false,
  });
  vi.mocked(attachStripeCheckoutSession).mockResolvedValue(true);
  stripeMocks.create.mockResolvedValue(stripeSession);
  stripeMocks.expire.mockResolvedValue({ ...stripeSession, status: "expired", url: null });
});

describe("POST /api/market/trades/[id]/pay", () => {
  it("collapses concurrent callers onto one attempt key and one Checkout session", async () => {
    const [first, second] = await Promise.all([
      POST(request(), context()),
      POST(request(), context()),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual({ url: stripeSession.url });
    expect(await second.json()).toEqual({ url: stripeSession.url });
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(stripeMocks.create).toHaveBeenCalledTimes(2);
    const keys = stripeMocks.create.mock.calls.map((call) => call[1].idempotencyKey);
    expect(new Set(keys)).toEqual(new Set([attempt.idempotencyKey]));
    expect(stripeMocks.create.mock.calls[0][0]).toEqual(stripeMocks.create.mock.calls[1][0]);
  });

  it("uses the canonical database UUID rather than the route's textual spelling", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: `{${TRADE_ID}}` }),
    });

    expect(response.status).toBe(200);
    expect(reserveStripeCheckoutAttempt).toHaveBeenCalledWith(expect.objectContaining({
      tradeId: TRADE_ID,
    }));
    expect(stripeMocks.create.mock.calls[0][0].metadata).toMatchObject({
      trade_id: TRADE_ID,
      payment_attempt_id: ATTEMPT_ID,
    });
  });

  it("reuses an exact open stored session without creating another", async () => {
    vi.mocked(reserveStripeCheckoutAttempt).mockResolvedValueOnce({
      ok: true,
      kind: "attempt",
      attempt: { ...attempt, status: "checkout_open", stripeSessionId: stripeSession.id },
      reused: true,
    });
    stripeMocks.retrieve.mockResolvedValueOnce(stripeSession);

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: stripeSession.url });
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });

  it("does not rotate an attempt when provider retrieval is ambiguous", async () => {
    vi.mocked(reserveStripeCheckoutAttempt).mockResolvedValueOnce({
      ok: true,
      kind: "attempt",
      attempt: { ...attempt, status: "checkout_open", stripeSessionId: stripeSession.id },
      reused: true,
    });
    stripeMocks.retrieve.mockRejectedValueOnce(new Error("network timeout"));

    const response = await POST(request(), context());

    expect(response.status).toBe(503);
    expect(stripeMocks.create).not.toHaveBeenCalled();
    expect(markStripeCheckoutAttemptTerminal).not.toHaveBeenCalled();
  });

  it("does not reuse an unbound key after its provider-expiry safety horizon", async () => {
    vi.mocked(reserveStripeCheckoutAttempt).mockResolvedValueOnce({
      ok: true,
      kind: "attempt",
      attempt: {
        ...attempt,
        providerExpiresAt: "2020-01-01T00:00:00.000Z",
      },
      reused: true,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("checkout_requires_review");
    expect(markStripeCheckoutAttemptForReview).toHaveBeenCalledWith(
      attempt.id,
      expect.stringContaining("reconciliation"),
    );
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });

  it("rotates only after Stripe explicitly reports the bound session expired", async () => {
    const oldAttempt = { ...attempt, status: "checkout_open" as const, stripeSessionId: "cs_old" };
    const nextAttempt = { ...attempt, id: "44444444-4444-4444-8444-444444444444" };
    vi.mocked(reserveStripeCheckoutAttempt)
      .mockResolvedValueOnce({ ok: true, kind: "attempt", attempt: oldAttempt, reused: true })
      .mockResolvedValueOnce({ ok: true, kind: "attempt", attempt: nextAttempt, reused: false });
    stripeMocks.retrieve.mockResolvedValueOnce({
      ...stripeSession,
      id: "cs_old",
      status: "expired",
      url: null,
    });
    vi.mocked(markStripeCheckoutAttemptTerminal).mockResolvedValueOnce({
      ok: true,
      applied: true,
      trade: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(markStripeCheckoutAttemptTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cs_old" }),
      "expired",
      expect.stringContaining("expired"),
    );
    expect(stripeMocks.create).toHaveBeenCalledTimes(1);
    expect(stripeMocks.create.mock.calls[0][1].idempotencyKey).toBe(nextAttempt.idempotencyKey);
  });

  it("refuses to extend Checkout past the real final payment window", async () => {
    vi.mocked(reserveStripeCheckoutAttempt).mockResolvedValueOnce({
      ok: false,
      reason: "payment_window_too_short",
    });

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("checkout_window_too_short");
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });
});
