import { createHash } from "node:crypto";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  readConfig: vi.fn(),
  getClient: vi.fn(),
  accountProblems: vi.fn(),
  priceProblems: vi.fn(),
  preflight: vi.fn(),
  process: vi.fn(),
  retrieveAccount: vi.fn(),
  retrieveEvent: vi.fn(),
  listInvoicePayments: vi.fn(),
  retrievePaymentIntent: vi.fn(),
  retrieveSubscription: vi.fn(),
  retrieveInvoice: vi.fn(),
  observeCheckout: vi.fn(),
  applyInvoicePaid: vi.fn(),
  observeInvoiceFailed: vi.fn(),
  applyCancel: vi.fn(),
  applyResume: vi.fn(),
  observeStatus: vi.fn(),
  applyDeleted: vi.fn(),
  applyIncompleteExpired: vi.fn(),
  applyRefund: vi.fn(),
  requiresReview: vi.fn(),
  ignore: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prism-signals/stripe", () => ({
  PRISM_STRIPE_CHECKOUT_METADATA_TYPE: "prism_signals_all_test_v1",
  readPrismStripeSandboxConfig: mocks.readConfig,
  getPrismStripeTestClient: mocks.getClient,
  prismStripeAccountProblems: mocks.accountProblems,
  prismStripePriceProblems: mocks.priceProblems,
  preflightPrismStripeWebhookReceipt: mocks.preflight,
  processPrismStripeWebhookAtomically: mocks.process,
}));

const WEBHOOK_SECRET = "whsec_valid_fixture_signing_value_for_tests_only";
const config = {
  environment: "test",
  apiVersion: "2026-02-25.clover",
  webhookSecret: WEBHOOK_SECRET,
  webhookProcessingEnabled: true,
  accountId: "acct_prismtest123",
  priceId: "price_prismtest123",
  productId: "prod_prismtest123",
  currency: "gbp",
  unitAmountMinor: 500,
  interval: "month",
};
const actualStripe = new Stripe(
  "sk_test_prism_route_test_key_123456789",
  { apiVersion: "2026-02-25.clover" },
);
const attemptRef = "pf_checkout_attempt_123456789";
const metadata = {
  type: "prism_signals_all_test_v1",
  attempt_ref: attemptRef,
};
let latestSignedEvent: Stripe.Event | null = null;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function payload(
  type: Stripe.Event.Type,
  object: unknown,
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    id: "evt_prismroute123",
    object: "event",
    api_version: config.apiVersion,
    created: nowSeconds(),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    ...overrides,
  });
}

function signedRequest(
  body: string,
  signedBody = body,
  options: { signature?: string | null; contentLength?: string } = {},
): Request {
  try {
    latestSignedEvent = JSON.parse(body) as Stripe.Event;
  } catch {
    latestSignedEvent = null;
  }
  const headers = new Headers({ "content-type": "application/json" });
  const signature = options.signature === undefined
    ? actualStripe.webhooks.generateTestHeaderString({
        payload: signedBody,
        secret: WEBHOOK_SECRET,
      })
    : options.signature;
  if (signature !== null) headers.set("stripe-signature", signature);
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  return new Request(
    "https://cambridgetcg.com/api/webhooks/stripe/prism-signals",
    { method: "POST", headers, body },
  );
}

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_prismroute123",
    object: "checkout.session",
    livemode: false,
    customer: "cus_prismroute123",
    subscription: "sub_prismroute123",
    client_reference_id: attemptRef,
    metadata,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    payment_method_types: ["card"],
    currency: "gbp",
    amount_total: 500,
    ...overrides,
  };
}

function invoice(overrides: Record<string, unknown> = {}) {
  const created = nowSeconds();
  return {
    id: "in_prismroute123",
    object: "invoice",
    livemode: false,
    customer: "cus_prismroute123",
    parent: {
      type: "subscription_details",
      subscription_details: {
        subscription: "sub_prismroute123",
        metadata,
      },
    },
    lines: {
      has_more: false,
      data: [{
        id: "il_prismroute123",
        object: "line_item",
        livemode: false,
        currency: "gbp",
        amount: 500,
        subtotal: 500,
        quantity: 1,
        period: { start: created - 60, end: created + 30 * 24 * 60 * 60 },
        pricing: {
          type: "price_details",
          unit_amount_decimal: "500",
          price_details: { price: config.priceId, product: config.productId },
        },
      }],
    },
    billing_reason: "subscription_create",
    collection_method: "charge_automatically",
    automatic_tax: { enabled: false },
    currency: "gbp",
    status: "paid",
    amount_paid: 500,
    amount_due: 500,
    amount_remaining: 0,
    total: 500,
    status_transitions: { paid_at: created },
    ...overrides,
  };
}

function subscription(overrides: Record<string, unknown> = {}) {
  const created = nowSeconds();
  return {
    id: "sub_prismroute123",
    object: "subscription",
    livemode: false,
    customer: "cus_prismroute123",
    metadata,
    currency: "gbp",
    collection_method: "charge_automatically",
    pause_collection: null,
    schedule: null,
    trial_start: null,
    trial_end: null,
    status: "active",
    cancel_at_period_end: false,
    ended_at: null,
    items: {
      has_more: false,
      data: [{
        quantity: 1,
        current_period_start: created - 60,
        current_period_end: created + 30 * 24 * 60 * 60,
        price: { id: config.priceId },
      }],
    },
    ...overrides,
  };
}

function invoicePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "inpay_prismroute123",
    object: "invoice_payment",
    livemode: false,
    status: "paid",
    is_default: true,
    invoice: "in_prismroute123",
    payment: {
      type: "payment_intent",
      payment_intent: "pi_prismroute123",
    },
    currency: "gbp",
    amount_requested: 500,
    amount_paid: 500,
    ...overrides,
  };
}

function paymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi_prismroute123",
    object: "payment_intent",
    livemode: false,
    status: "succeeded",
    amount: 500,
    amount_received: 500,
    currency: "gbp",
    customer: "cus_prismroute123",
    payment_method_types: ["card"],
    ...overrides,
  };
}

function refund(overrides: Record<string, unknown> = {}) {
  return {
    id: "re_prismroute123",
    object: "refund",
    status: "succeeded",
    amount: 500,
    currency: "gbp",
    payment_intent: "pi_prismroute123",
    created: nowSeconds(),
    ...overrides,
  };
}

const actions = {
  observeCheckoutCompleted: mocks.observeCheckout,
  applyInvoicePaid: mocks.applyInvoicePaid,
  observeInvoicePaymentFailed: mocks.observeInvoiceFailed,
  applyCancelAtPeriodEnd: mocks.applyCancel,
  applySubscriptionResumed: mocks.applyResume,
  observeSubscriptionStatus: mocks.observeStatus,
  applySubscriptionDeleted: mocks.applyDeleted,
  applySubscriptionIncompleteExpired: mocks.applyIncompleteExpired,
  applyFullRefund: mocks.applyRefund,
  requiresReview: mocks.requiresReview,
  ignore: mocks.ignore,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.readConfig.mockReturnValue(config);
  mocks.accountProblems.mockReturnValue([]);
  mocks.priceProblems.mockReturnValue([]);
  mocks.preflight.mockResolvedValue(null);
  mocks.retrieveAccount.mockResolvedValue({ id: config.accountId });
  mocks.retrieveEvent.mockImplementation(async () => latestSignedEvent);
  mocks.listInvoicePayments.mockResolvedValue({
    has_more: false,
    data: [invoicePayment()],
  });
  mocks.retrievePaymentIntent.mockResolvedValue(paymentIntent());
  mocks.retrieveSubscription.mockResolvedValue(subscription());
  mocks.retrieveInvoice.mockResolvedValue(invoice());
  mocks.getClient.mockReturnValue({
    webhooks: actualStripe.webhooks,
    accounts: { retrieve: mocks.retrieveAccount },
    events: { retrieve: mocks.retrieveEvent },
    invoicePayments: { list: mocks.listInvoicePayments },
    paymentIntents: { retrieve: mocks.retrievePaymentIntent },
    subscriptions: { retrieve: mocks.retrieveSubscription },
    invoices: { retrieve: mocks.retrieveInvoice },
  });
  for (const method of [
    mocks.observeCheckout,
    mocks.applyInvoicePaid,
    mocks.observeInvoiceFailed,
    mocks.applyCancel,
    mocks.applyResume,
    mocks.observeStatus,
    mocks.applyDeleted,
    mocks.applyIncompleteExpired,
    mocks.applyRefund,
  ]) {
    method.mockResolvedValue({ outcome: "processed", code: "applied" });
  }
  mocks.requiresReview.mockImplementation((code) => ({
    outcome: "requires_review",
    code,
  }));
  mocks.ignore.mockImplementation((code) => ({ outcome: "ignored", code }));
  mocks.process.mockImplementation(async (_receipt, work) => {
    const decision = await work(actions);
    return { disposition: "processed", ...decision };
  });
});

describe("dedicated PRISM Stripe sandbox webhook", () => {
  it("verifies the exact untouched raw body with Stripe before durable review", async () => {
    const raw = payload("payment_intent.created", { object: "payment_intent" });
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.process).toHaveBeenCalledOnce();
    expect(mocks.preflight).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: "evt_prismroute123",
        payloadSha256: createHash("sha256").update(raw).digest("hex"),
      }),
    );
    expect(mocks.retrieveEvent).toHaveBeenCalledWith("evt_prismroute123");
    expect(mocks.requiresReview).toHaveBeenCalledWith("unsupported_event_type");
    expect(mocks.process.mock.calls[0]?.[0]).toMatchObject({
      config,
      stripeEventId: "evt_prismroute123",
      stripeAccountId: config.accountId,
      apiVersion: config.apiVersion,
      eventType: "payment_intent.created",
      livemode: false,
      payloadSha256: createHash("sha256").update(raw).digest("hex"),
    });
  });

  it("rejects a body changed after signing before account or storage", async () => {
    const raw = payload("payment_intent.created", { object: "payment_intent" });
    const response = await POST(signedRequest(`${raw} `, raw));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_signature");
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("rejects missing and oversized requests before constructing an event", async () => {
    const raw = payload("payment_intent.created", {});
    const missing = await POST(signedRequest(raw, raw, { signature: null }));
    expect(missing.status).toBe(400);
    expect(mocks.getClient).not.toHaveBeenCalled();

    const oversized = await POST(
      signedRequest(raw, raw, { contentLength: String(256 * 1024 + 1) }),
    );
    expect(oversized.status).toBe(413);
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("fails before signature/body work when processing is explicitly paused", async () => {
    mocks.readConfig.mockReturnValue({
      ...config,
      webhookProcessingEnabled: false,
    });
    const response = await POST(signedRequest("not-json", "not-json"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "webhook_processing_paused",
    );
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it.each([
    ["live", { livemode: true }],
    ["wrong API", { api_version: "2025-01-01.acacia" }],
    ["Connect", { account: config.accountId }],
  ] as const)("rejects a signed %s event outside the test schema", async (_label, drift) => {
    const raw = payload("payment_intent.created", {}, drift);
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("webhook_event_rejected");
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("attests the configured account before any durable receipt", async () => {
    mocks.accountProblems.mockReturnValueOnce(["wrong_account"]);
    const raw = payload("payment_intent.created", {});
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "webhook_account_mismatch",
    );
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("rejects a signed event that the dedicated account cannot reproduce", async () => {
    const raw = payload("payment_intent.created", {});
    const request = signedRequest(raw);
    mocks.retrieveEvent.mockResolvedValueOnce({
      ...(latestSignedEvent as Stripe.Event),
      type: "payment_intent.succeeded",
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "webhook_account_mismatch",
    );
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("binds completed Checkout only as a non-granting observation", async () => {
    const raw = payload("checkout.session.completed", checkoutSession());
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(200);
    expect(mocks.observeCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptRef,
        sessionId: "cs_test_prismroute123",
        subscriptionId: "sub_prismroute123",
      }),
    );
    expect(mocks.applyInvoicePaid).not.toHaveBeenCalled();
  });

  it("proves InvoicePayment, PaymentIntent and active subscription before grant", async () => {
    const providerInvoice = invoice();
    const providerSubscription = subscription({
      items: {
        has_more: false,
        data: [{
          ...subscription().items.data[0],
          current_period_start: providerInvoice.lines.data[0].period.start,
          current_period_end: providerInvoice.lines.data[0].period.end,
        }],
      },
    });
    mocks.retrieveSubscription.mockResolvedValueOnce(providerSubscription);
    const raw = payload("invoice.paid", providerInvoice);
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(200);
    expect(mocks.listInvoicePayments).toHaveBeenCalledWith({
      invoice: "in_prismroute123",
      status: "paid",
      limit: 2,
    });
    expect(mocks.retrievePaymentIntent).toHaveBeenCalledWith(
      "pi_prismroute123",
    );
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith(
      "sub_prismroute123",
    );
    expect(mocks.applyInvoicePaid).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "in_prismroute123",
        paymentIntentId: "pi_prismroute123",
        amountMinor: 500,
        status: "active",
        cancelAtPeriodEnd: false,
      }),
    );
    expect(mocks.listInvoicePayments.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.process.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.retrievePaymentIntent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.process.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("carries remote scheduled cancellation through invoice.paid ordering", async () => {
    const providerInvoice = invoice();
    mocks.retrieveSubscription.mockResolvedValueOnce(subscription({
      cancel_at_period_end: true,
      items: {
        has_more: false,
        data: [{
          ...subscription().items.data[0],
          current_period_start: providerInvoice.lines.data[0].period.start,
          current_period_end: providerInvoice.lines.data[0].period.end,
        }],
      },
    }));
    const response = await POST(
      signedRequest(payload("invoice.paid", providerInvoice)),
    );
    expect(response.status).toBe(200);
    expect(mocks.applyInvoicePaid).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        cancelAtPeriodEnd: true,
      }),
    );
  });

  it("durably reviews an out-of-band paid invoice without provider payment", async () => {
    mocks.listInvoicePayments.mockResolvedValueOnce({
      has_more: false,
      data: [],
    });
    const response = await POST(signedRequest(payload("invoice.paid", invoice())));
    expect(response.status).toBe(200);
    expect(mocks.requiresReview).toHaveBeenCalledWith(
      "ambiguous_paid_invoice_payment",
    );
    expect(mocks.retrievePaymentIntent).not.toHaveBeenCalled();
    expect(mocks.applyInvoicePaid).not.toHaveBeenCalled();
  });

  it("records invoice.payment_failed as observation without granting", async () => {
    const failed = invoice({
      status: "open",
      amount_paid: 0,
      amount_remaining: 500,
      status_transitions: { paid_at: null },
    });
    const response = await POST(
      signedRequest(payload("invoice.payment_failed", failed)),
    );
    expect(response.status).toBe(200);
    expect(mocks.observeInvoiceFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "in_prismroute123",
        subscriptionId: "sub_prismroute123",
        amountMinor: 500,
      }),
    );
    expect(mocks.applyInvoicePaid).not.toHaveBeenCalled();
    expect(mocks.listInvoicePayments).not.toHaveBeenCalled();
  });

  it("applies scheduled cancellation and deletion through distinct actions", async () => {
    const period = subscription().items.data[0];
    const canceledLater = subscription({
      cancel_at_period_end: true,
      items: { has_more: false, data: [period] },
    });
    mocks.retrieveSubscription.mockResolvedValueOnce(canceledLater);
    const cancelResponse = await POST(
      signedRequest(
        payload("customer.subscription.updated", canceledLater, {
          data: {
            object: canceledLater,
            previous_attributes: { cancel_at_period_end: false },
          },
        }),
      ),
    );
    expect(cancelResponse.status).toBe(200);
    expect(mocks.applyCancel).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "sub_prismroute123",
        status: "active",
      }),
    );

    const resumed = subscription({
      cancel_at_period_end: false,
      items: { has_more: false, data: [period] },
    });
    mocks.retrieveSubscription.mockResolvedValueOnce(resumed);
    const resumeResponse = await POST(
      signedRequest(
        payload("customer.subscription.updated", resumed, {
          id: "evt_prismresume123",
          data: {
            object: resumed,
            previous_attributes: { cancel_at_period_end: true },
          },
        }),
      ),
    );
    expect(resumeResponse.status).toBe(200);
    expect(mocks.applyResume).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "sub_prismroute123",
        status: "active",
      }),
    );

    const endedAt = nowSeconds();
    const deleted = subscription({
      status: "canceled",
      cancel_at_period_end: true,
      ended_at: endedAt,
      items: { has_more: false, data: [period] },
    });
    mocks.retrieveSubscription.mockResolvedValueOnce(deleted);
    const deleteResponse = await POST(
      signedRequest(payload("customer.subscription.deleted", deleted)),
    );
    expect(deleteResponse.status).toBe(200);
    expect(mocks.applyDeleted).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "sub_prismroute123",
        status: "canceled",
        endedAt: new Date(endedAt * 1000).toISOString(),
      }),
    );

    const incompleteExpired = subscription({
      status: "incomplete_expired",
      cancel_at_period_end: false,
      ended_at: null,
      items: { has_more: false, data: [period] },
    });
    mocks.retrieveSubscription.mockResolvedValueOnce(incompleteExpired);
    const incompleteResponse = await POST(
      signedRequest(
        payload("customer.subscription.deleted", incompleteExpired, {
          id: "evt_incompleteexpired123",
        }),
      ),
    );
    expect(incompleteResponse.status).toBe(200);
    expect(mocks.applyIncompleteExpired).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "sub_prismroute123",
        status: "incomplete_expired",
      }),
    );
  });

  it("lets current provider truth win reverse-delivered equal-second updates", async () => {
    const period = subscription().items.data[0];
    const resumed = subscription({
      cancel_at_period_end: false,
      items: { has_more: false, data: [period] },
    });
    const canceled = subscription({
      cancel_at_period_end: true,
      items: { has_more: false, data: [period] },
    });
    mocks.retrieveSubscription.mockResolvedValue(resumed);
    const sameSecond = nowSeconds();

    const resumeResponse = await POST(
      signedRequest(
        payload("customer.subscription.updated", resumed, {
          id: "evt_resumecurrent123",
          created: sameSecond,
          data: {
            object: resumed,
            previous_attributes: { cancel_at_period_end: true },
          },
        }),
      ),
    );
    expect(resumeResponse.status).toBe(200);
    expect(mocks.applyResume).toHaveBeenCalledOnce();

    const staleCancelResponse = await POST(
      signedRequest(
        payload("customer.subscription.updated", canceled, {
          id: "evt_cancelstale123",
          created: sameSecond,
          data: {
            object: canceled,
            previous_attributes: { cancel_at_period_end: false },
          },
        }),
      ),
    );
    expect(staleCancelResponse.status).toBe(200);
    expect(mocks.requiresReview).toHaveBeenCalledWith(
      "subscription_snapshot_superseded",
    );
    expect(mocks.applyCancel).not.toHaveBeenCalled();
  });

  it("durably mirrors an unrelated incomplete update before any grant", async () => {
    const incomplete = subscription({
      status: "incomplete",
      cancel_at_period_end: false,
    });
    mocks.retrieveSubscription.mockResolvedValueOnce(incomplete);
    const response = await POST(
      signedRequest(
        payload("customer.subscription.updated", incomplete, {
          id: "evt_prismincomplete123",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.observeStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "incomplete",
        cancelAtPeriodEnd: false,
      }),
    );
    expect(mocks.applyResume).not.toHaveBeenCalled();
  });

  it("returns 5xx and creates no receipt when provider proof is unavailable", async () => {
    mocks.retrievePaymentIntent.mockRejectedValueOnce(new Error("Stripe down"));
    const response = await POST(signedRequest(payload("invoice.paid", invoice())));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("webhook_unavailable");
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("correlates a succeeded refund and carries the exact refund id", async () => {
    const providerInvoice = invoice();
    const providerSubscription = subscription({
      items: {
        has_more: false,
        data: [{
          ...subscription().items.data[0],
          current_period_start: providerInvoice.lines.data[0].period.start,
          current_period_end: providerInvoice.lines.data[0].period.end,
        }],
      },
    });
    mocks.retrieveInvoice.mockResolvedValueOnce(providerInvoice);
    mocks.retrieveSubscription.mockResolvedValueOnce(providerSubscription);
    const response = await POST(
      signedRequest(payload("refund.created", refund())),
    );
    expect(response.status).toBe(200);
    expect(mocks.listInvoicePayments).toHaveBeenCalledWith({
      payment: {
        type: "payment_intent",
        payment_intent: "pi_prismroute123",
      },
      status: "paid",
      limit: 2,
    });
    expect(mocks.retrieveInvoice).toHaveBeenCalledWith("in_prismroute123");
    expect(mocks.applyRefund).toHaveBeenCalledWith({
      attemptRef,
      refundId: "re_prismroute123",
      subscriptionId: "sub_prismroute123",
      customerId: "cus_prismroute123",
      invoiceId: "in_prismroute123",
      paymentIntentId: "pi_prismroute123",
      priceId: config.priceId,
      productId: config.productId,
      currency: "gbp",
      quantity: 1,
      periodStart: expect.stringMatching(/Z$/),
      periodEnd: expect.stringMatching(/Z$/),
      confirmedAt: expect.stringMatching(/Z$/),
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      refundedAt: expect.stringMatching(/Z$/),
      amountRefundedMinor: 500,
    });
  });

  it("durably reviews a partial refund without provider lookups", async () => {
    const response = await POST(
      signedRequest(payload("refund.created", refund({ amount: 100 }))),
    );
    expect(response.status).toBe(200);
    expect(mocks.requiresReview).toHaveBeenCalledWith(
      "partial_refund_unsupported",
    );
    expect(mocks.listInvoicePayments).not.toHaveBeenCalled();
    expect(mocks.applyRefund).not.toHaveBeenCalled();
  });

  it("ignores redundant charge.refunded only after a durable receipt", async () => {
    const response = await POST(
      signedRequest(payload("charge.refunded", { object: "charge" })),
    );
    expect(response.status).toBe(200);
    expect(mocks.ignore).toHaveBeenCalledWith(
      "charge_refunded_superseded_by_refund_event",
    );
    expect(mocks.process).toHaveBeenCalledOnce();
  });

  it("returns 5xx when atomic receipt/storage processing fails", async () => {
    mocks.process.mockRejectedValueOnce(new Error("database unavailable"));
    const raw = payload("payment_intent.created", {});
    const response = await POST(signedRequest(raw));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("webhook_unavailable");
    expect(JSON.stringify(body)).not.toContain("database unavailable");
  });

  it("returns 2xx after the DAL confirms an exact duplicate", async () => {
    mocks.process.mockResolvedValueOnce({
      disposition: "duplicate",
      outcome: "processed",
      code: "invoice_already_granted",
    });
    const raw = payload("payment_intent.created", {});
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it("short-circuits an exact completed replay before provider outages", async () => {
    mocks.preflight.mockResolvedValueOnce({
      disposition: "duplicate",
      outcome: "processed",
      code: "initial_invoice_granted",
    });
    mocks.retrieveAccount.mockRejectedValueOnce(new Error("Stripe unavailable"));
    mocks.listInvoicePayments.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    );
    const raw = payload("invoice.paid", invoice());
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
    expect(mocks.retrieveEvent).not.toHaveBeenCalled();
    expect(mocks.listInvoicePayments).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("fails closed on a changed receipt preflight without provider work", async () => {
    mocks.preflight.mockRejectedValueOnce(new Error("binding_conflict"));
    const raw = payload("invoice.paid", invoice());
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(503);
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
    expect(mocks.listInvoicePayments).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("does not return 2xx for an invalid DAL disposition", async () => {
    mocks.process.mockResolvedValueOnce({
      disposition: "processing",
      outcome: "processing",
      code: "not_complete",
    });
    const raw = payload("payment_intent.created", {});
    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(503);
  });
});
