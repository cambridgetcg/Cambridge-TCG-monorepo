import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  planPrismStripeWebhookEvent,
  prismStripeInvoiceSubscriptionProblems,
  resolvePrismStripeFullRefund,
  resolvePrismStripePaidInvoice,
} from "./event-plan";

const mocks = vi.hoisted(() => ({
  priceProblems: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prism-signals/stripe", () => ({
  PRISM_STRIPE_CHECKOUT_METADATA_TYPE: "prism_signals_all_test_v1",
  prismStripePriceProblems: mocks.priceProblems,
}));

const attemptRef = "pf_checkout_attempt_123456789";
const metadata = {
  type: "prism_signals_all_test_v1",
  attempt_ref: attemptRef,
};
const config = {
  environment: "test",
  accountId: "acct_prismtest123",
  apiVersion: "2026-02-25.clover",
  priceId: "price_prismtest123",
  productId: "prod_prismtest123",
  currency: "gbp",
  unitAmountMinor: 500,
  interval: "month",
} as const;
const receivedAt = "2026-09-03T08:00:00.000Z";
const created = Date.parse("2026-09-03T07:59:00.000Z") / 1000;
const digest = "a".repeat(64);

function event(
  type: Stripe.Event.Type,
  object: unknown,
  overrides: Record<string, unknown> = {},
): Stripe.Event {
  return {
    id: "evt_prismtest123",
    object: "event",
    api_version: config.apiVersion,
    created,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    ...overrides,
  } as unknown as Stripe.Event;
}

function checkout(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_prismtest123",
    object: "checkout.session",
    livemode: false,
    customer: "cus_prismtest123",
    subscription: "sub_prismtest123",
    client_reference_id: attemptRef,
    metadata,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    payment_method_types: ["card"],
    currency: "gbp",
    amount_total: 500,
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_prismtest123",
    object: "invoice",
    livemode: false,
    customer: "cus_prismtest123",
    parent: {
      type: "subscription_details",
      subscription_details: {
        subscription: "sub_prismtest123",
        metadata,
      },
    },
    lines: {
      has_more: false,
      data: [
        {
          id: "il_prismtest123",
          object: "line_item",
          livemode: false,
          currency: "gbp",
          amount: 500,
          subtotal: 500,
          quantity: 1,
          period: {
            start: Date.parse("2026-09-03T07:00:00.000Z") / 1000,
            end: Date.parse("2026-10-03T07:00:00.000Z") / 1000,
          },
          pricing: {
            type: "price_details",
            unit_amount_decimal: "500",
            price_details: {
              price: config.priceId,
              product: config.productId,
            },
          },
        },
      ],
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
  } as unknown as Stripe.Invoice;
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_prismtest123",
    object: "subscription",
    livemode: false,
    customer: "cus_prismtest123",
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
      data: [
        {
          quantity: 1,
          current_period_start:
            Date.parse("2026-09-03T07:00:00.000Z") / 1000,
          current_period_end:
            Date.parse("2026-10-03T07:00:00.000Z") / 1000,
          price: { id: config.priceId },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function refund(overrides: Record<string, unknown> = {}) {
  return {
    id: "re_prismtest123",
    object: "refund",
    status: "succeeded",
    amount: 500,
    currency: "gbp",
    charge: "ch_prismtest123",
    payment_intent: "pi_prismtest123",
    created,
    ...overrides,
  } as unknown as Stripe.Refund;
}

function invoicePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "inpay_prismtest123",
    object: "invoice_payment",
    livemode: false,
    status: "paid",
    is_default: true,
    invoice: "in_prismtest123",
    payment: {
      type: "payment_intent",
      payment_intent: "pi_prismtest123",
    },
    currency: "gbp",
    amount_requested: 500,
    amount_paid: 500,
    ...overrides,
  } as unknown as Stripe.InvoicePayment;
}

function paymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi_prismtest123",
    object: "payment_intent",
    livemode: false,
    status: "succeeded",
    amount: 500,
    amount_received: 500,
    currency: "gbp",
    customer: "cus_prismtest123",
    payment_method_types: ["card"],
    ...overrides,
  } as unknown as Stripe.PaymentIntent;
}

function plan(providerEvent: Stripe.Event) {
  return planPrismStripeWebhookEvent(providerEvent, {
    config: config as never,
    receivedAt,
    payloadSha256: digest,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.priceProblems.mockReturnValue([]);
});

describe("PRISM Stripe signed-event planner", () => {
  it.each([
    ["bad event id", { id: "not-an-event" }, "invalid_event_envelope"],
    ["future event", { created: created + 601 }, "invalid_event_envelope"],
    ["live event", { livemode: true }, "live_event_rejected"],
    ["wrong API version", { api_version: "2025-01-01.acacia" }, "api_version_rejected"],
    ["Connect event", { account: config.accountId }, "connected_event_rejected"],
  ] as const)("rejects %s before a receipt can be formed", (_label, drift, code) => {
    const result = plan(event("checkout.session.completed", checkout(), drift));
    expect(result).toEqual({ ok: false, code });
  });

  it("forms a bounded receipt and review outcome for unknown signed types", () => {
    const result = plan(event("payment_intent.succeeded", { object: "payment_intent" }));
    expect(result).toMatchObject({
      ok: true,
      receipt: {
        environment: "test",
        stripeEventId: "evt_prismtest123",
        stripeAccountId: config.accountId,
        apiVersion: config.apiVersion,
        eventType: "payment_intent.succeeded",
        livemode: false,
        payloadSha256: digest,
        providerCreatedAt: "2026-09-03T07:59:00.000Z",
        receivedAt,
      },
      action: { kind: "requires_review", code: "unsupported_event_type" },
    });
  });

  it("extracts Checkout binding facts without granting", () => {
    const result = plan(event("checkout.session.completed", checkout()));
    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "checkout_session_completed",
        sessionId: "cs_test_prismtest123",
        customerId: "cus_prismtest123",
        subscriptionId: "sub_prismtest123",
        attemptRef,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/grant|entitlement|active_until/);
  });

  it.each([
    ["foreign metadata", { metadata: { type: "other", attempt_ref: attemptRef } }],
    ["extra metadata", { metadata: { ...metadata, user_id: "user-a" } }],
    ["unpaid", { payment_status: "unpaid" }],
    ["delayed method", { payment_method_types: ["bacs_debit"] }],
    ["wrong amount", { amount_total: 999 }],
  ] as const)("routes malformed Checkout (%s) to durable review", (_label, drift) => {
    const result = plan(event("checkout.session.completed", checkout(drift)));
    expect(result).toMatchObject({
      ok: true,
      action: { kind: "requires_review", code: "invalid_checkout_session" },
    });
  });

  it("extracts the initial invoice.paid as the only positive authority fact", () => {
    const result = plan(event("invoice.paid", invoice()));
    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "invoice_paid_lookup",
        grantKind: "initial",
        invoiceId: "in_prismtest123",
        subscriptionId: "sub_prismtest123",
        customerId: "cus_prismtest123",
        attemptRef,
        currency: "gbp",
        amountMinor: 500,
        quantity: 1,
        periodStart: "2026-09-03T07:00:00.000Z",
        periodEnd: "2026-10-03T07:00:00.000Z",
        confirmedAt: "2026-09-03T07:59:00.000Z",
      },
    });
  });

  it("classifies only subscription_cycle as renewal", () => {
    const result = plan(
      event("invoice.paid", invoice({ billing_reason: "subscription_cycle" })),
    );
    expect(result).toMatchObject({
      ok: true,
      action: { kind: "invoice_paid_lookup", grantKind: "renewal" },
    });
  });

  it.each([
    ["extra invoice line", { lines: { ...invoice().lines, data: [...invoice().lines.data, invoice().lines.data[0]] } }],
    ["discounted amount", { amount_paid: 400 }],
    ["manual collection", { collection_method: "send_invoice" }],
    ["automatic tax", { automatic_tax: { enabled: true } }],
    ["unsupported billing reason", { billing_reason: "subscription_update" }],
  ] as const)("routes non-exact paid invoice (%s) to review", (_label, drift) => {
    const result = plan(event("invoice.paid", invoice(drift)));
    expect(result).toMatchObject({
      ok: true,
      action: { kind: "requires_review" },
    });
  });

  it("records payment failure as observation-only evidence", () => {
    const failed = invoice({
      status: "open",
      amount_paid: 0,
      amount_remaining: 500,
      status_transitions: { paid_at: null },
    });
    const result = plan(event("invoice.payment_failed", failed));
    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "invoice_payment_failed",
        invoiceId: "in_prismtest123",
        failedAt: "2026-09-03T07:59:00.000Z",
      },
    });
  });

  it("requires the remotely retrieved subscription to match and be active", () => {
    const result = plan(event("invoice.paid", invoice()));
    if (!result.ok || result.action.kind !== "invoice_paid_lookup") {
      throw new Error("Expected a paid-invoice plan.");
    }
    expect(
      prismStripeInvoiceSubscriptionProblems(
        subscription(),
        result.action,
        config as never,
      ),
    ).toEqual([]);
    expect(
      prismStripeInvoiceSubscriptionProblems(
        subscription({ status: "past_due" }),
        result.action,
        config as never,
      ),
    ).toContain("subscription_not_active");
    expect(
      prismStripeInvoiceSubscriptionProblems(
        subscription({
          items: {
            has_more: false,
            data: [{
              ...subscription().items.data[0],
              current_period_end:
                Date.parse("2026-11-03T07:00:00.000Z") / 1000,
            }],
          },
        }),
        result.action,
        config as never,
      ),
    ).toContain("wrong_period");
  });

  it("requires one remotely verified paid default InvoicePayment before grant", () => {
    const planned = plan(event("invoice.paid", invoice()));
    if (!planned.ok || planned.action.kind !== "invoice_paid_lookup") {
      throw new Error("Expected a paid-invoice lookup plan.");
    }
    expect(
      resolvePrismStripePaidInvoice(planned.action, {
        invoicePayments: [invoicePayment()],
        invoicePaymentsHasMore: false,
        paymentIntent: paymentIntent(),
        subscription: subscription(),
        config: config as never,
      }),
    ).toMatchObject({
      ok: true,
      invoice: {
        invoiceId: "in_prismtest123",
        paymentIntentId: "pi_prismtest123",
        amountPaidMinor: 500,
        status: "active",
      },
    });
  });

  it.each([
    ["out-of-band/no payment", [], false, "ambiguous_paid_invoice_payment"],
    ["multiple payments", [invoicePayment(), invoicePayment()], false, "ambiguous_paid_invoice_payment"],
    ["paginated ambiguity", [invoicePayment()], true, "ambiguous_paid_invoice_payment"],
    ["unpaid payment", [invoicePayment({ status: "open" })], false, "invalid_paid_invoice_payment"],
    ["non-default payment", [invoicePayment({ is_default: false })], false, "invalid_paid_invoice_payment"],
  ] as const)("does not grant for %s", (_label, payments, hasMore, code) => {
    const planned = plan(event("invoice.paid", invoice()));
    if (!planned.ok || planned.action.kind !== "invoice_paid_lookup") {
      throw new Error("Expected a paid-invoice lookup plan.");
    }
    expect(
      resolvePrismStripePaidInvoice(planned.action, {
        invoicePayments: payments,
        invoicePaymentsHasMore: hasMore,
        paymentIntent: paymentIntent(),
        subscription: subscription(),
        config: config as never,
      }),
    ).toEqual({ ok: false, code });
  });

  it("does not grant when the mapped PaymentIntent is not exact and succeeded", () => {
    const planned = plan(event("invoice.paid", invoice()));
    if (!planned.ok || planned.action.kind !== "invoice_paid_lookup") {
      throw new Error("Expected a paid-invoice lookup plan.");
    }
    expect(
      resolvePrismStripePaidInvoice(planned.action, {
        invoicePayments: [invoicePayment()],
        invoicePaymentsHasMore: false,
        paymentIntent: paymentIntent({ status: "requires_payment_method" }),
        subscription: subscription(),
        config: config as never,
      }),
    ).toEqual({ ok: false, code: "paid_payment_intent_mismatch" });
  });

  it("extracts cancel-at-period-end and terminal deletion separately", () => {
    const canceledSubscription = subscription({ cancel_at_period_end: true });
    const canceledLater = plan(
      event(
        "customer.subscription.updated",
        canceledSubscription,
        {
          data: {
            object: canceledSubscription,
            previous_attributes: { cancel_at_period_end: false },
          },
        },
      ),
    );
    expect(canceledLater).toMatchObject({
      ok: true,
      action: { kind: "subscription_cancel_at_period_end", attemptRef },
    });

    const deleted = plan(
      event(
        "customer.subscription.deleted",
        subscription({
          status: "canceled",
          cancel_at_period_end: true,
          ended_at: created,
        }),
      ),
    );
    expect(deleted).toMatchObject({
      ok: true,
      action: {
        kind: "subscription_deleted",
        endedAt: "2026-09-03T07:59:00.000Z",
      },
    });
  });

  it("emits explicit verified resume when cancel-at-period-end is false", () => {
    const resumedSubscription = subscription();
    const result = plan(
      event("customer.subscription.updated", resumedSubscription, {
        data: {
          object: resumedSubscription,
          previous_attributes: { cancel_at_period_end: true },
        },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "subscription_resumed",
        subscriptionId: "sub_prismtest123",
        attemptRef,
        status: "active",
        statusAt: "2026-09-03T07:59:00.000Z",
      },
    });
  });

  it.each(["active", "incomplete"] as const)(
    "durably ignores unrelated %s subscription updates without a cancel transition",
    (status) => {
      const result = plan(
        event(
          "customer.subscription.updated",
          subscription({ status, cancel_at_period_end: false }),
        ),
      );
      expect(result).toMatchObject({
        ok: true,
        action: {
          kind: "ignored",
          code: "subscription_update_without_cancel_transition",
        },
      });
    },
  );

  it("does not mistake a terminal subscription update for resumption", () => {
    const result = plan(
      event(
        "customer.subscription.updated",
        subscription({ status: "canceled", cancel_at_period_end: false }),
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "requires_review",
        code: "invalid_subscription_resume_status",
      },
    });
  });

  it("requires an exact succeeded Refund before provider correlation", () => {
    const full = plan(event("refund.created", refund()));
    expect(full).toMatchObject({
      ok: true,
      action: {
        kind: "full_refund_lookup",
        refundId: "re_prismtest123",
        paymentIntentId: "pi_prismtest123",
        amountRefundedMinor: 500,
        refundedAt: "2026-09-03T07:59:00.000Z",
      },
    });

    const partial = plan(
      event("refund.created", refund({ amount: 100 })),
    );
    expect(partial).toMatchObject({
      ok: true,
      action: {
        kind: "requires_review",
        code: "partial_refund_unsupported",
      },
    });

    const pending = plan(
      event("refund.created", refund({ status: "pending" })),
    );
    expect(pending).toMatchObject({
      ok: true,
      action: { kind: "requires_review", code: "refund_not_succeeded" },
    });

    const succeededUpdate = plan(
      event("refund.updated", refund({ status: "succeeded" }), {
        created: created + 30,
      }),
    );
    expect(succeededUpdate).toMatchObject({
      ok: true,
      action: {
        kind: "full_refund_lookup",
        refundId: "re_prismtest123",
        refundedAt: "2026-09-03T07:59:30.000Z",
      },
    });

    expect(plan(event("charge.refunded", { object: "charge" }))).toMatchObject({
      ok: true,
      action: {
        kind: "ignored",
        code: "charge_refunded_superseded_by_refund_event",
      },
    });
  });

  it("correlates a full refund through exactly one paid InvoicePayment", () => {
    const planned = plan(event("refund.created", refund()));
    if (!planned.ok || planned.action.kind !== "full_refund_lookup") {
      throw new Error("Expected a full-refund lookup plan.");
    }
    expect(
      resolvePrismStripeFullRefund(planned.action, {
        invoicePayments: [invoicePayment()],
        invoicePaymentsHasMore: false,
        invoice: invoice(),
        paymentIntent: paymentIntent(),
        subscription: subscription(),
        config: config as never,
      }),
    ).toEqual({
      ok: true,
      refund: {
        subscriptionId: "sub_prismtest123",
        invoiceId: "in_prismtest123",
        refundId: "re_prismtest123",
        paymentIntentId: "pi_prismtest123",
        priceId: config.priceId,
        refundedAt: "2026-09-03T07:59:00.000Z",
        amountRefundedMinor: 500,
      },
    });
  });

  it.each([
    ["missing", [], false],
    ["multiple", [invoicePayment(), invoicePayment()], false],
    ["paginated", [invoicePayment()], true],
  ] as const)("routes %s InvoicePayment correlation to review", (_label, payments, hasMore) => {
    const planned = plan(event("refund.created", refund()));
    if (!planned.ok || planned.action.kind !== "full_refund_lookup") {
      throw new Error("Expected a full-refund lookup plan.");
    }
    expect(
      resolvePrismStripeFullRefund(planned.action, {
        invoicePayments: payments,
        invoicePaymentsHasMore: hasMore,
        invoice: invoice(),
        paymentIntent: paymentIntent(),
        subscription: subscription(),
        config: config as never,
      }),
    ).toMatchObject({
      ok: false,
      code: "ambiguous_refund_invoice_payment",
    });
  });

  it("does not resolve a historical refund against a newer subscription period", () => {
    const planned = plan(event("refund.created", refund()));
    if (!planned.ok || planned.action.kind !== "full_refund_lookup") {
      throw new Error("Expected a full-refund lookup plan.");
    }
    const result = resolvePrismStripeFullRefund(planned.action, {
      invoicePayments: [invoicePayment()],
      invoicePaymentsHasMore: false,
      invoice: invoice(),
      paymentIntent: paymentIntent(),
      subscription: subscription({
        items: {
          has_more: false,
          data: [{
            ...subscription().items.data[0],
            current_period_start:
              Date.parse("2026-10-03T07:00:00.000Z") / 1000,
            current_period_end:
              Date.parse("2026-11-03T07:00:00.000Z") / 1000,
          }],
        },
      }),
      config: config as never,
    });
    expect(result).toEqual({
      ok: false,
      code: "refund_subscription_mismatch",
    });
  });
});
