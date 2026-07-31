import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { releaseHolder } from "@/lib/stock/reservations";
import { recordOrderFromStripeSession } from "@/lib/orders/record";
import {
  findStripeMarketCheckoutBinding,
  markStripeCheckoutAttemptTerminal,
  recordStripeMarketCheckoutProcessing,
  retireLegacyStripeSession,
  settleStripeMarketCheckout,
} from "@/lib/market/stripe-checkout-attempts";
import { POST } from "./route";

vi.mock("@/lib/wholesale/client", () => ({ reportSale: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/membership/db", () => ({ processOrderRewards: vi.fn() }));
vi.mock("@/lib/social/db", () => ({ postActivity: vi.fn(), awardAchievement: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stock/reservations", () => ({
  commitCartToSale: vi.fn(),
  releaseHolder: vi.fn(),
  holderForStripeSession: vi.fn((id: string) => id),
}));
vi.mock("@/lib/orders/record", () => ({ recordOrderFromStripeSession: vi.fn() }));
vi.mock("@/lib/market/stripe-checkout-attempts", () => ({
  findStripeMarketCheckoutBinding: vi.fn(),
  markStripeCheckoutAttemptTerminal: vi.fn(),
  recordStripeMarketCheckoutProcessing: vi.fn(),
  retireLegacyStripeSession: vi.fn(),
  settleStripeMarketCheckout: vi.fn(),
}));

const TRADE_ID = "11111111-1111-4111-8111-111111111111";

const session = {
  id: "cs_market_exact",
  object: "checkout.session",
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: 2460,
  currency: "gbp",
  payment_intent: "pi_market_exact",
  metadata: {
    type: "market_trade_payment",
    trade_id: TRADE_ID,
    payment_attempt_id: "33333333-3333-4333-8333-333333333333",
    settlement_rail: "stripe_checkout",
  },
} as unknown as Stripe.Checkout.Session;

function request() {
  return new Request("https://example.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "signed" },
    body: "signed-body",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  vi.mocked(getStripe).mockReturnValue({
    webhooks: {
      constructEvent: vi.fn(() => ({
        id: "evt_market_exact",
        type: "checkout.session.completed",
        data: { object: session },
      })),
    },
  } as never);
  vi.mocked(settleStripeMarketCheckout).mockResolvedValue({
    ok: true,
    applied: false,
    trade: null,
  });
  vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValue(null);
});

describe("Stripe webhook market payment authority", () => {
  it("delegates a paid market session to the exact-binding settlement DAL", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(settleStripeMarketCheckout).toHaveBeenCalledWith(session, null);
  });

  it("lets a local v2 binding outrank removed metadata and never enters retail fulfilment", async () => {
    const stripped = { ...session, metadata: null } as Stripe.Checkout.Session;
    vi.mocked(getStripe).mockReturnValueOnce({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_market_stripped",
          type: "checkout.session.completed",
          data: { object: stripped },
        })),
      },
    } as never);
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "v2",
      tradeId: TRADE_ID,
      attemptId: "33333333-3333-4333-8333-333333333333",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(settleStripeMarketCheckout).toHaveBeenCalledWith(stripped, null);
    expect(recordOrderFromStripeSession).not.toHaveBeenCalled();
  });

  it("records stripped-metadata unpaid completion against the locally bound v2 attempt", async () => {
    const processing = {
      ...session,
      metadata: null,
      payment_status: "unpaid",
    } as Stripe.Checkout.Session;
    vi.mocked(getStripe).mockReturnValueOnce({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_market_processing_stripped",
          type: "checkout.session.completed",
          data: { object: processing },
        })),
      },
    } as never);
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "v2",
      tradeId: TRADE_ID,
      attemptId: "33333333-3333-4333-8333-333333333333",
    });
    vi.mocked(recordStripeMarketCheckoutProcessing).mockResolvedValueOnce({
      ok: false,
      reason: "wrong metadata type",
      reviewRecorded: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(recordStripeMarketCheckoutProcessing).toHaveBeenCalledWith(processing);
    expect(recordOrderFromStripeSession).not.toHaveBeenCalled();
  });

  it("lets an authoritative legacy binding outrank forged v2 metadata while unpaid", async () => {
    const legacyProcessing = {
      ...session,
      payment_status: "unpaid",
      metadata: {
        type: "market_trade_payment",
        trade_id: TRADE_ID,
        payment_attempt_id: "99999999-9999-4999-8999-999999999999",
      },
    } as Stripe.Checkout.Session;
    vi.mocked(getStripe).mockReturnValueOnce({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_legacy_processing_forged_v2",
          type: "checkout.session.completed",
          data: { object: legacyProcessing },
        })),
      },
    } as never);
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "legacy",
      tradeId: TRADE_ID,
      attemptId: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(recordStripeMarketCheckoutProcessing).not.toHaveBeenCalled();
    expect(recordOrderFromStripeSession).not.toHaveBeenCalled();
  });

  it.each([
    ["checkout.session.expired", "expired"],
    ["checkout.session.async_payment_failed", "failed"],
  ] as const)("routes stripped-metadata %s through the local v2 binding", async (eventType, status) => {
    const terminalSession = {
      ...session,
      metadata: null,
      status: status === "expired" ? "expired" : "complete",
      payment_status: "unpaid",
    } as Stripe.Checkout.Session;
    vi.mocked(getStripe).mockReturnValueOnce({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: `evt_market_${status}_stripped`,
          type: eventType,
          data: { object: terminalSession },
        })),
      },
    } as never);
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "v2",
      tradeId: TRADE_ID,
      attemptId: "33333333-3333-4333-8333-333333333333",
    });
    vi.mocked(markStripeCheckoutAttemptTerminal).mockResolvedValueOnce({
      ok: false,
      reason: "wrong metadata type",
      reviewRecorded: true,
    });
    vi.mocked(releaseHolder).mockResolvedValueOnce({ ok: true, released: 0 });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(markStripeCheckoutAttemptTerminal).toHaveBeenCalledWith(
      terminalSession,
      status,
      expect.stringContaining("Signed checkout.session"),
    );
  });

  it("acknowledges a durable binding rejection without advancing another branch", async () => {
    vi.mocked(settleStripeMarketCheckout).mockResolvedValueOnce({
      ok: false,
      reason: "wrong amount",
      reviewRecorded: true,
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, payment_review: true });
  });

  it("returns non-2xx when the settlement database write fails so Stripe retries", async () => {
    vi.mocked(settleStripeMarketCheckout).mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Market trade payment recording failed" });
  });

  it("retires an exact pre-v2 session on signed Stripe expiry", async () => {
    const legacy = {
      ...session,
      id: "cs_legacy_expired",
      status: "expired",
      payment_status: "unpaid",
      metadata: {
        type: "market_trade_payment",
        trade_id: TRADE_ID,
        payment_attempt_id: "99999999-9999-4999-8999-999999999999",
      },
    } as Stripe.Checkout.Session;
    vi.mocked(getStripe).mockReturnValueOnce({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_legacy_expired",
          type: "checkout.session.expired",
          data: { object: legacy },
        })),
      },
    } as never);
    vi.mocked(retireLegacyStripeSession).mockResolvedValueOnce({
      ok: true,
      applied: true,
      trade: null,
    });
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "legacy",
      tradeId: TRADE_ID,
      attemptId: null,
    });
    vi.mocked(releaseHolder).mockResolvedValueOnce({ ok: true, released: 0 });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(retireLegacyStripeSession).toHaveBeenCalledWith({
      tradeId: TRADE_ID,
      stripeSessionId: legacy.id,
      status: "expired",
    });
    expect(markStripeCheckoutAttemptTerminal).not.toHaveBeenCalled();
  });

  it.each([
    ["checkout.session.expired", "expired"],
    ["checkout.session.async_payment_failed", "failed"],
  ] as const)("acknowledges duplicate legacy %s terminal evidence", async (eventType, status) => {
    const legacy = {
      ...session,
      id: `cs_legacy_${status}`,
      status: eventType === "checkout.session.expired" ? "expired" : "complete",
      payment_status: "unpaid",
      metadata: { type: "market_trade_payment", trade_id: TRADE_ID },
    } as Stripe.Checkout.Session;
    vi.mocked(getStripe).mockReturnValueOnce({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: `evt_legacy_${status}_duplicate`,
          type: eventType,
          data: { object: legacy },
        })),
      },
    } as never);
    vi.mocked(retireLegacyStripeSession).mockResolvedValueOnce({
      ok: true,
      applied: false,
      trade: null,
    });
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "legacy_terminal",
      tradeId: TRADE_ID,
      attemptId: null,
    });
    vi.mocked(releaseHolder).mockResolvedValueOnce({ ok: true, released: 0 });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(retireLegacyStripeSession).toHaveBeenCalledWith({
      tradeId: TRADE_ID,
      stripeSessionId: legacy.id,
      status,
    });
  });

  it("acknowledges a durable v2 terminal mismatch but retries an unknown attempt", async () => {
    const expired = {
      ...session,
      status: "expired",
      payment_status: "unpaid",
    } as Stripe.Checkout.Session;
    vi.mocked(getStripe).mockReturnValueOnce({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_v2_expired_review",
          type: "checkout.session.expired",
          data: { object: expired },
        })),
      },
    } as never);
    vi.mocked(markStripeCheckoutAttemptTerminal).mockResolvedValueOnce({
      ok: false,
      reason: "wrong amount",
      reviewRecorded: true,
    });
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "v2",
      tradeId: TRADE_ID,
      attemptId: "33333333-3333-4333-8333-333333333333",
    });
    vi.mocked(releaseHolder).mockResolvedValueOnce({ ok: true, released: 0 });

    const reviewed = await POST(request());
    expect(reviewed.status).toBe(200);
    expect(await reviewed.json()).toEqual({ received: true, payment_review: true });

    vi.mocked(getStripe).mockReturnValueOnce({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_v2_expired_unknown",
          type: "checkout.session.expired",
          data: { object: expired },
        })),
      },
    } as never);
    vi.mocked(markStripeCheckoutAttemptTerminal).mockResolvedValueOnce({
      ok: false,
      reason: "unknown Stripe Checkout attempt",
      reviewRecorded: false,
    });
    vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValueOnce({
      kind: "v2",
      tradeId: TRADE_ID,
      attemptId: "33333333-3333-4333-8333-333333333333",
    });

    const unknown = await POST(request());
    expect(unknown.status).toBe(500);
    expect(releaseHolder).toHaveBeenCalledTimes(1);
  });
});
