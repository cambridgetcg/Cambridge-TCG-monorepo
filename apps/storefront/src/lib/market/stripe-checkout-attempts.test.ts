import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  STRIPE_CHECKOUT_RAIL,
  attachStripeCheckoutSession,
  findStripeMarketCheckoutBinding,
  markStripeCheckoutAttemptTerminal,
  recordStripeMarketCheckoutProcessing,
  reserveStripeCheckoutAttempt,
  retireLegacyStripeSession,
  settleStripeMarketCheckout,
  stripeCheckoutAttemptBindingProblems,
  type StripeCheckoutAttempt,
} from "./stripe-checkout-attempts";

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  txQuery: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  query: dbMocks.query,
  transaction: dbMocks.transaction,
}));

const TRADE_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";

const snapshot = {
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
};

const attemptRow = {
  id: ATTEMPT_ID,
  trade_id: TRADE_ID,
  generation: 1,
  status: "reserved",
  idempotency_key: `ctcg:market-trade:${TRADE_ID}:stripe:${ATTEMPT_ID}`,
  request_snapshot: snapshot,
  expected_amount_pence: "2460",
  expected_currency: "gbp",
  stripe_session_id: null,
  stripe_payment_intent: null,
  provider_expires_at: "2026-08-01T10:00:00.000Z",
  review_reason: null,
};

const tradeReservationRow = {
  id: TRADE_ID,
  buyer_id: BUYER_ID,
  escrow_status: "awaiting_payment",
  sku: "OP-OP01-001-JP",
  card_name: "Roronoa Zoro",
  image_url: null,
  buyer_email: "buyer@example.test",
  stripe_session_id: null,
  expected_amount_pence: "2460",
  payment_window_open: true,
  checkout_start_allowed: true,
  next_attempt_expires_at: "2026-08-01T10:00:00.000Z",
};

function checkout(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_exact",
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 2460,
    currency: "gbp",
    expires_at: Math.floor(new Date(attemptRow.provider_expires_at).getTime() / 1000),
    adaptive_pricing: { enabled: false },
    client_reference_id: snapshot.client_reference_id,
    payment_intent: "pi_exact",
    metadata: {
      type: "market_trade_payment",
      trade_id: TRADE_ID,
      payment_attempt_id: ATTEMPT_ID,
      settlement_rail: STRIPE_CHECKOUT_RAIL,
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

beforeEach(() => {
  vi.resetAllMocks();
  dbMocks.transaction.mockImplementation(async (callback) => callback(dbMocks.txQuery));
});

describe("Stripe market Checkout reservation", () => {
  it("reuses the one blocking attempt under a row lock", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [tradeReservationRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [attemptRow], rowCount: 1 });

    const result = await reserveStripeCheckoutAttempt({
      tradeId: TRADE_ID,
      buyerId: BUYER_ID,
      siteUrl: "https://example.test/",
      shippingAllowedCountries: ["GB", "US"],
    });

    expect(result).toMatchObject({ ok: true, kind: "attempt", reused: true });
    expect(dbMocks.txQuery.mock.calls[0][0]).toMatch(/FOR UPDATE OF t/);
    expect(dbMocks.txQuery.mock.calls[2][0]).toMatch(
      /status IN \('reserved', 'checkout_open', 'processing', 'requires_review'\)/,
    );
    expect(dbMocks.txQuery).toHaveBeenCalledTimes(3);
  });

  it("freezes one exact request and random generation key before Stripe is called", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [tradeReservationRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ generation: 1 }], rowCount: 1 })
      .mockImplementationOnce(async (_sql: string, params: unknown[]) => {
        const storedSnapshot = JSON.parse(params[4] as string);
        return {
          rows: [{
            ...attemptRow,
            id: params[0],
            idempotency_key: params[3],
            request_snapshot: storedSnapshot,
          }],
          rowCount: 1,
        };
      });

    const result = await reserveStripeCheckoutAttempt({
      tradeId: TRADE_ID,
      buyerId: BUYER_ID,
      siteUrl: "https://example.test/?ignored=yes",
      shippingAllowedCountries: ["GB", "US"],
    });

    expect(result).toMatchObject({ ok: true, kind: "attempt", reused: false });
    if (!result.ok || result.kind !== "attempt") throw new Error("expected attempt");
    expect(result.attempt.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.attempt.idempotencyKey).toContain(result.attempt.id);
    expect(result.attempt.request.success_url).toBe(
      `https://example.test/account/trades?paid=${TRADE_ID}`,
    );
    expect(result.attempt.expectedAmountPence).toBe(2460);
    expect(dbMocks.txQuery.mock.calls[3][0]).toMatch(/INSERT INTO market_trade_settlement_reservations/);
    expect(dbMocks.txQuery.mock.calls[5][0]).toMatch(/INSERT INTO market_trade_stripe_checkout_attempts/);
  });

  it("uses PostgreSQL's canonical trade UUID in every provider-facing field", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [tradeReservationRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ generation: 1 }], rowCount: 1 })
      .mockImplementationOnce(async (_sql: string, params: unknown[]) => ({
        rows: [{
          ...attemptRow,
          id: params[0],
          idempotency_key: params[3],
          request_snapshot: JSON.parse(params[4] as string),
        }],
        rowCount: 1,
      }));

    const result = await reserveStripeCheckoutAttempt({
      tradeId: `{${TRADE_ID}}`,
      buyerId: BUYER_ID,
      siteUrl: "https://example.test",
      shippingAllowedCountries: ["GB"],
    });

    expect(result).toMatchObject({ ok: true, kind: "attempt", reused: false });
    if (!result.ok || result.kind !== "attempt") throw new Error("expected attempt");
    expect(result.attempt.tradeId).toBe(TRADE_ID);
    expect(result.attempt.idempotencyKey).toContain(`:${TRADE_ID}:`);
    expect(result.attempt.request.client_reference_id).toContain(`:${TRADE_ID}:`);
    expect(result.attempt.request.success_url).toContain(`paid=${TRADE_ID}`);
    expect(result.attempt.idempotencyKey).not.toContain("{");
  });

  it("refuses a different reserved rail before reading or creating an attempt", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [tradeReservationRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ rail: "cashloom_v2" }], rowCount: 1 });

    await expect(reserveStripeCheckoutAttempt({
      tradeId: TRADE_ID,
      buyerId: BUYER_ID,
      siteUrl: "https://example.test",
      shippingAllowedCountries: ["GB", "US"],
    })).resolves.toEqual({
      ok: false,
      reason: "rail_conflict",
      reservedRail: "cashloom_v2",
    });
    expect(dbMocks.txQuery).toHaveBeenCalledTimes(2);
  });

  it("does not mint inside Stripe's final 30-minute minimum window", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({
        rows: [{ ...tradeReservationRow, checkout_start_allowed: false }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(reserveStripeCheckoutAttempt({
      tradeId: TRADE_ID,
      buyerId: BUYER_ID,
      siteUrl: "https://example.test",
      shippingAllowedCountries: ["GB", "US"],
    })).resolves.toEqual({ ok: false, reason: "payment_window_too_short" });
    expect(dbMocks.txQuery.mock.calls.some(([sql]) =>
      /INSERT INTO market_trade_stripe_checkout_attempts/.test(sql as string),
    )).toBe(false);
    expect(dbMocks.txQuery.mock.calls.some(([sql]) =>
      /INSERT INTO market_trade_settlement_reservations/.test(sql as string),
    )).toBe(false);
  });

  it("does not misclassify a terminal v2 session as a live legacy session", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({
        rows: [{ ...tradeReservationRow, stripe_session_id: "cs_failed" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ status: "failed" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ generation: 2 }], rowCount: 1 })
      .mockImplementationOnce(async (_sql: string, params: unknown[]) => ({
        rows: [{
          ...attemptRow,
          id: params[0],
          generation: 2,
          idempotency_key: params[3],
          request_snapshot: JSON.parse(params[4] as string),
        }],
        rowCount: 1,
      }));

    const result = await reserveStripeCheckoutAttempt({
      tradeId: TRADE_ID,
      buyerId: BUYER_ID,
      siteUrl: "https://example.test",
      shippingAllowedCountries: ["GB", "US"],
    });

    expect(result).toMatchObject({ ok: true, kind: "attempt", reused: false });
    expect(dbMocks.txQuery.mock.calls[3][0]).toMatch(/stripe_session_id = \$2/);
    expect(dbMocks.txQuery.mock.calls[5][0]).toMatch(/INSERT INTO market_trade_stripe_checkout_attempts/);
  });
});

describe("Stripe market Checkout exact binding", () => {
  const attempt: StripeCheckoutAttempt = {
    id: ATTEMPT_ID,
    tradeId: TRADE_ID,
    generation: 1,
    status: "checkout_open",
    idempotencyKey: attemptRow.idempotency_key,
    request: snapshot,
    expectedAmountPence: 2460,
    expectedCurrency: "gbp",
    stripeSessionId: "cs_test_exact",
    stripePaymentIntent: null,
    providerExpiresAt: attemptRow.provider_expires_at,
    reviewReason: null,
  };

  it("detects session, amount, currency, rail, and client-reference drift", () => {
    expect(stripeCheckoutAttemptBindingProblems(attempt, checkout())).toEqual([]);
    expect(stripeCheckoutAttemptBindingProblems(attempt, checkout({
      id: "cs_other",
      amount_total: 2500,
      currency: "usd",
      client_reference_id: "wrong",
      metadata: { ...checkout().metadata, settlement_rail: "cashloom_v2" },
    }))).toEqual(expect.arrayContaining([
      "wrong Stripe session",
      "wrong amount",
      "wrong currency",
      "wrong rail",
      "wrong client reference",
    ]));
    expect(stripeCheckoutAttemptBindingProblems(attempt, checkout({
      expires_at: Math.floor(new Date(attempt.providerExpiresAt).getTime() / 1000) + 1,
      adaptive_pricing: { enabled: true },
    }))).toEqual(expect.arrayContaining([
      "wrong provider expiry",
      "adaptive pricing is not disabled",
    ]));
  });

  it("settles attempt and trade in one transaction only after every binding matches", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ trade_id: TRADE_ID, trade_escrow_status: "awaiting_payment" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ ...attemptRow, status: "checkout_open" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ buyer_id: BUYER_ID, price: "12.30", quantity: 2 }], rowCount: 1 });

    const result = await settleStripeMarketCheckout(checkout(), null);

    expect(result).toMatchObject({ ok: true, applied: true });
    expect(dbMocks.txQuery.mock.calls[0][0]).toMatch(/WHERE stripe_session_id = \$1/);
    expect(dbMocks.txQuery.mock.calls[1][0]).toMatch(/FOR UPDATE OF t/);
    expect(dbMocks.txQuery.mock.calls[2][0]).toMatch(/settlement_reservations[\s\S]*FOR UPDATE/);
    expect(dbMocks.txQuery.mock.calls[3][0]).toMatch(/stripe_checkout_attempts[\s\S]*FOR UPDATE/);
    expect(dbMocks.txQuery.mock.calls[4][0]).toMatch(/status = 'settled'/);
    expect(dbMocks.txQuery.mock.calls[5][0]).toMatch(/escrow_status = 'awaiting_shipment'/);
    expect(dbMocks.txQuery.mock.calls[5][0]).toMatch(/WHERE id = \$1 AND escrow_status = 'awaiting_payment'/);
  });

  it("holds a wrong paid amount for review without advancing the trade", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ trade_id: TRADE_ID, trade_escrow_status: "awaiting_payment" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ ...attemptRow, status: "checkout_open" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await settleStripeMarketCheckout(checkout({ amount_total: 9999 }), null);

    expect(result).toMatchObject({ ok: false, reviewRecorded: true });
    expect(dbMocks.txQuery.mock.calls[4][0]).toMatch(/requires_review/);
    expect(dbMocks.txQuery.mock.calls.some(([sql]) =>
      /UPDATE market_trades/.test(sql as string),
    )).toBe(false);
  });

  it("records unpaid asynchronous completion as processing, not paid", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ trade_id: TRADE_ID, trade_escrow_status: "awaiting_payment" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ ...attemptRow, status: "checkout_open" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await recordStripeMarketCheckoutProcessing(checkout({
      payment_status: "unpaid",
    }));

    expect(result).toMatchObject({ ok: true, applied: true });
    expect(dbMocks.txQuery.mock.calls[4][0]).toMatch(/status = 'processing'/);
    expect(dbMocks.txQuery.mock.calls.some(([sql]) =>
      /escrow_status = 'awaiting_shipment'/.test(sql as string),
    )).toBe(false);
  });

  it("validates the full bound Session before accepting terminal evidence", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ trade_id: TRADE_ID, trade_escrow_status: "awaiting_payment" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ ...attemptRow, status: "checkout_open", stripe_session_id: "cs_test_exact" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 });

    const result = await markStripeCheckoutAttemptTerminal(
      checkout({ status: "expired", payment_status: "unpaid", payment_intent: null }),
      "expired",
      "signed expiry",
    );

    expect(result).toMatchObject({ ok: true, applied: true });
    expect(dbMocks.txQuery.mock.calls[4][0]).toMatch(/status = \$2/);
  });

  it("holds wrong-trade terminal evidence for review and redelivers idempotently", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ trade_id: TRADE_ID, trade_escrow_status: "awaiting_payment" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ ...attemptRow, status: "checkout_open", stripe_session_id: "cs_test_exact" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const rejected = await markStripeCheckoutAttemptTerminal(
      checkout({
        status: "expired",
        payment_status: "unpaid",
        payment_intent: null,
        metadata: { ...checkout().metadata, trade_id: "99999999-9999-4999-8999-999999999999" },
      }),
      "expired",
      "signed expiry",
    );

    expect(rejected).toMatchObject({ ok: false, reviewRecorded: true });
    expect(dbMocks.txQuery.mock.calls[4][0]).toMatch(/requires_review/);

    vi.resetAllMocks();
    dbMocks.transaction.mockImplementation(async (callback) => callback(dbMocks.txQuery));
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ trade_id: TRADE_ID, trade_escrow_status: "cancelled" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ ...attemptRow, status: "expired", stripe_session_id: "cs_test_exact" }],
        rowCount: 1,
      });

    const duplicate = await markStripeCheckoutAttemptTerminal(
      checkout({ status: "expired", payment_status: "unpaid", payment_intent: null }),
      "expired",
      "signed expiry",
    );
    expect(duplicate).toEqual({ ok: true, applied: false, trade: null });
    expect(dbMocks.txQuery).toHaveBeenCalledTimes(4);
  });

  it.each(["failed", "settled"] as const)(
    "treats an exact late processing event after %s as a monotonic no-op",
    async (status) => {
      dbMocks.txQuery
        .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            trade_id: TRADE_ID,
            trade_escrow_status: status === "settled" ? "awaiting_shipment" : "awaiting_payment",
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            ...attemptRow,
            status,
            stripe_session_id: "cs_test_exact",
            stripe_payment_intent: "pi_exact",
          }],
          rowCount: 1,
        });

      const result = await recordStripeMarketCheckoutProcessing(checkout({
        payment_status: "unpaid",
      }));

      expect(result).toEqual({ ok: true, applied: false, trade: null });
      expect(dbMocks.txQuery).toHaveBeenCalledTimes(4);
    },
  );

  it("does not let removed v2 metadata fall through the legacy settlement path", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ trade_id: TRADE_ID, trade_escrow_status: "awaiting_payment" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ ...attemptRow, status: "checkout_open", stripe_session_id: "cs_test_exact" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await settleStripeMarketCheckout(checkout({
      metadata: { type: "market_trade_payment", trade_id: TRADE_ID },
    }), null);

    expect(result).toMatchObject({ ok: false, reviewRecorded: true });
    expect(dbMocks.txQuery.mock.calls[4][0]).toMatch(/requires_review/);
    expect(dbMocks.txQuery.mock.calls.some(([sql]) =>
      /escrow_status = 'awaiting_shipment'/.test(sql as string),
    )).toBe(false);
  });

  it("turns contradictory paid evidence on a terminal attempt into a blocking hold", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: ATTEMPT_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ trade_id: TRADE_ID, trade_escrow_status: "awaiting_payment" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ ...attemptRow, status: "expired", stripe_session_id: "cs_test_exact" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await markStripeCheckoutAttemptTerminal(
      checkout(),
      "expired",
      "contradictory signed expiry",
    );

    expect(result).toMatchObject({ ok: false, reviewRecorded: true });
    const reviewSql = dbMocks.txQuery.mock.calls[4][0] as string;
    expect(reviewSql).toMatch(/WITH frozen_siblings/);
    expect(reviewSql).toMatch(/WHEN target.status IN \('expired', 'failed'\)[\s\S]*EXISTS/);
    expect(reviewSql).toMatch(/ELSE 'requires_review'/);
  });
});

describe("Stripe market Checkout local ownership", () => {
  it("resolves write-once v2, legacy, and terminal bindings without trusting metadata", async () => {
    dbMocks.query
      .mockResolvedValueOnce({
        rows: [{ kind: "v2", trade_id: TRADE_ID, attempt_id: ATTEMPT_ID }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ kind: "legacy", trade_id: TRADE_ID, attempt_id: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ kind: "legacy_terminal", trade_id: TRADE_ID, attempt_id: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const stripped = checkout({ metadata: null });
    await expect(findStripeMarketCheckoutBinding(stripped)).resolves.toEqual({
      kind: "v2", tradeId: TRADE_ID, attemptId: ATTEMPT_ID,
    });
    await expect(findStripeMarketCheckoutBinding(stripped)).resolves.toEqual({
      kind: "legacy", tradeId: TRADE_ID, attemptId: null,
    });
    await expect(findStripeMarketCheckoutBinding(stripped)).resolves.toEqual({
      kind: "legacy_terminal", tradeId: TRADE_ID, attemptId: null,
    });
    await expect(findStripeMarketCheckoutBinding(stripped)).resolves.toBeNull();
    expect(dbMocks.query.mock.calls[0][0]).toMatch(/request_snapshot->>'client_reference_id'/);
  });
});

describe("Stripe Session attachment", () => {
  it("locks trade, reservation, then attempt before exposing the Session on the trade", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [{ id: TRADE_ID }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ trade_id: TRADE_ID }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: TRADE_ID }], rowCount: 1 });

    await expect(attachStripeCheckoutSession({
      attemptId: ATTEMPT_ID,
      stripeSessionId: "cs_attach",
    })).resolves.toBe(true);

    expect(dbMocks.txQuery.mock.calls[0][0]).toMatch(/FOR UPDATE OF t/);
    expect(dbMocks.txQuery.mock.calls[1][0]).toMatch(/settlement_reservations[\s\S]*FOR UPDATE/);
    expect(dbMocks.txQuery.mock.calls[2][0]).toMatch(/UPDATE market_trade_stripe_checkout_attempts/);
    expect(dbMocks.txQuery.mock.calls[3][0]).toMatch(/UPDATE market_trades/);
  });
});

describe("legacy Stripe terminal observations", () => {
  it("records the exact Session once and makes terminal redelivery idempotent", async () => {
    dbMocks.txQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: TRADE_ID, buyer_id: BUYER_ID }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ rail: STRIPE_CHECKOUT_RAIL }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ stripe_session_id: "cs_legacy" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: TRADE_ID }], rowCount: 1 });

    await expect(retireLegacyStripeSession({
      tradeId: TRADE_ID,
      stripeSessionId: "cs_legacy",
      status: "expired",
    })).resolves.toEqual({ ok: true, applied: true, trade: null });
    expect(dbMocks.txQuery.mock.calls[5][0]).toMatch(/legacy_stripe_terminal_events/);

    vi.resetAllMocks();
    dbMocks.transaction.mockImplementation(async (callback) => callback(dbMocks.txQuery));
    dbMocks.txQuery.mockResolvedValueOnce({
      rows: [{ terminal_status: "expired" }],
      rowCount: 1,
    });

    await expect(retireLegacyStripeSession({
      tradeId: TRADE_ID,
      stripeSessionId: "cs_legacy",
      status: "expired",
    })).resolves.toEqual({ ok: true, applied: false, trade: null });
    expect(dbMocks.txQuery).toHaveBeenCalledTimes(1);
  });
});
