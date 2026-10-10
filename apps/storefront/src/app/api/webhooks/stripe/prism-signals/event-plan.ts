import type Stripe from "stripe";
import {
  PRISM_STRIPE_CHECKOUT_METADATA_TYPE,
  prismStripePriceProblems,
  type PrismStripeSandboxConfigV1,
} from "@/lib/prism-signals/stripe";

const PROVIDER_IDS = Object.freeze({
  event: /^evt_[A-Za-z0-9]{8,128}$/,
  checkout: /^cs_test_[A-Za-z0-9]{8,128}$/,
  customer: /^cus_[A-Za-z0-9]{8,64}$/,
  subscription: /^sub_[A-Za-z0-9]{8,128}$/,
  invoice: /^in_[A-Za-z0-9]{8,128}$/,
  refund: /^re_[A-Za-z0-9]{8,128}$/,
  paymentIntent: /^pi_[A-Za-z0-9]{8,128}$/,
  attempt: /^pf_[A-Za-z0-9_-]{16,64}$/,
  digest: /^[0-9a-f]{64}$/,
});

export interface PrismStripeWebhookReceiptV1 {
  readonly environment: "test";
  readonly stripeEventId: string;
  readonly stripeAccountId: string;
  readonly apiVersion: string;
  readonly eventType: string;
  readonly livemode: false;
  readonly payloadSha256: string;
  readonly providerCreatedAt: string;
  readonly receivedAt: string;
}

interface PrismStripeInvoiceFactV1 {
  readonly invoiceId: string;
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly attemptRef: string;
  readonly priceId: string;
  readonly productId: string;
  readonly currency: "gbp";
  readonly amountMinor: number;
  readonly quantity: 1;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly billingReason: "subscription_create" | "subscription_cycle";
}

export type PrismStripeWebhookActionV1 =
  | {
      readonly kind: "checkout_session_completed";
      readonly sessionId: string;
      readonly customerId: string;
      readonly subscriptionId: string;
      readonly attemptRef: string;
      readonly status: "complete";
      readonly completedAt: string;
    }
  | ({
      readonly kind: "invoice_paid_lookup";
      readonly grantKind: "initial" | "renewal";
      readonly confirmedAt: string;
    } & PrismStripeInvoiceFactV1)
  | ({
      readonly kind: "invoice_payment_failed";
      readonly failedAt: string;
    } & PrismStripeInvoiceFactV1)
  | {
      readonly kind: "subscription_cancel_at_period_end";
      readonly subscriptionId: string;
      readonly customerId: string;
      readonly attemptRef: string;
      readonly priceId: string;
      readonly status: Stripe.Subscription.Status;
      readonly periodStart: string;
      readonly periodEnd: string;
      readonly statusAt: string;
    }
  | {
      readonly kind: "subscription_resumed";
      readonly subscriptionId: string;
      readonly customerId: string;
      readonly attemptRef: string;
      readonly priceId: string;
      readonly status: Stripe.Subscription.Status;
      readonly periodStart: string;
      readonly periodEnd: string;
      readonly statusAt: string;
    }
  | {
      readonly kind: "subscription_status_observed";
      readonly subscriptionId: string;
      readonly customerId: string;
      readonly attemptRef: string;
      readonly priceId: string;
      readonly status: Stripe.Subscription.Status;
      readonly cancelAtPeriodEnd: boolean;
      readonly periodStart: string;
      readonly periodEnd: string;
      readonly statusAt: string;
    }
  | {
      readonly kind: "subscription_deleted";
      readonly subscriptionId: string;
      readonly customerId: string;
      readonly attemptRef: string;
      readonly priceId: string;
      readonly status: "canceled";
      readonly cancelAtPeriodEnd: boolean;
      readonly periodStart: string;
      readonly periodEnd: string;
      readonly statusAt: string;
      readonly endedAt: string;
    }
  | {
      readonly kind: "subscription_incomplete_expired";
      readonly subscriptionId: string;
      readonly customerId: string;
      readonly attemptRef: string;
      readonly priceId: string;
      readonly status: "incomplete_expired";
      readonly cancelAtPeriodEnd: false;
      readonly periodStart: string;
      readonly periodEnd: string;
      readonly statusAt: string;
    }
  | {
      readonly kind: "full_refund_lookup";
      readonly refundId: string;
      readonly paymentIntentId: string;
      readonly amountRefundedMinor: number;
      readonly currency: "gbp";
      readonly refundedAt: string;
    }
  | {
      readonly kind: "requires_review";
      readonly code: string;
    }
  | {
      readonly kind: "ignored";
      readonly code: string;
    };

export type PrismStripeWebhookPlanV1 =
  | {
      readonly ok: false;
      readonly code:
        | "invalid_event_envelope"
        | "live_event_rejected"
        | "api_version_rejected"
        | "connected_event_rejected";
    }
  | {
      readonly ok: true;
      readonly receipt: PrismStripeWebhookReceiptV1;
      readonly action: PrismStripeWebhookActionV1;
    };

function epochSeconds(value: unknown): string | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 253_402_300_799
  ) {
    return null;
  }
  const date = new Date(value * 1000);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

function metadataAttemptRef(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const metadata = value as Record<string, unknown>;
  const keys = Object.keys(metadata).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "attempt_ref" ||
    keys[1] !== "type" ||
    metadata.type !== PRISM_STRIPE_CHECKOUT_METADATA_TYPE ||
    typeof metadata.attempt_ref !== "string" ||
    !PROVIDER_IDS.attempt.test(metadata.attempt_ref)
  ) {
    return null;
  }
  return metadata.attempt_ref;
}

function stringProviderId(
  value: unknown,
  pattern: RegExp,
): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function invoiceFact(
  invoice: Stripe.Invoice,
  config: PrismStripeSandboxConfigV1,
): PrismStripeInvoiceFactV1 | null {
  const invoiceId = stringProviderId(invoice.id, PROVIDER_IDS.invoice);
  const customerId = stringProviderId(invoice.customer, PROVIDER_IDS.customer);
  const details = invoice.parent?.type === "subscription_details"
    ? invoice.parent.subscription_details
    : null;
  const subscriptionId = stringProviderId(
    details?.subscription,
    PROVIDER_IDS.subscription,
  );
  const attemptRef = metadataAttemptRef(details?.metadata);
  const line = invoice.lines.has_more === false && invoice.lines.data.length === 1
    ? invoice.lines.data[0]
    : undefined;
  const price = line?.pricing?.type === "price_details"
    ? line.pricing.price_details?.price
    : null;
  const priceId = stringProviderId(price, /^price_[A-Za-z0-9]{8,64}$/);
  const productId = line?.pricing?.price_details?.product;
  const periodStart = epochSeconds(line?.period.start);
  const periodEnd = epochSeconds(line?.period.end);
  const billingReason = invoice.billing_reason === "subscription_create" ||
      invoice.billing_reason === "subscription_cycle"
    ? invoice.billing_reason
    : null;

  if (
    invoice.object !== "invoice" ||
    invoice.livemode !== false ||
    invoiceId === null ||
    customerId === null ||
    subscriptionId === null ||
    attemptRef === null ||
    line === undefined ||
    line.livemode !== false ||
    priceId !== config.priceId ||
    productId !== config.productId ||
    invoice.currency !== config.currency ||
    line.currency !== config.currency ||
    line.quantity !== 1 ||
    line.amount !== config.unitAmountMinor ||
    line.subtotal !== config.unitAmountMinor ||
    line.pricing?.unit_amount_decimal !== String(config.unitAmountMinor) ||
    periodStart === null ||
    periodEnd === null ||
    Date.parse(periodStart) >= Date.parse(periodEnd) ||
    billingReason === null ||
    invoice.collection_method !== "charge_automatically" ||
    invoice.automatic_tax.enabled !== false
  ) {
    return null;
  }

  return Object.freeze({
    invoiceId,
    subscriptionId,
    customerId,
    attemptRef,
    priceId,
    productId,
    currency: config.currency,
    amountMinor: config.unitAmountMinor,
    quantity: 1,
    periodStart,
    periodEnd,
    billingReason,
  });
}

export interface PrismStripeSubscriptionSnapshotV1 {
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly attemptRef: string;
  readonly priceId: string;
  readonly status: Stripe.Subscription.Status;
  readonly cancelAtPeriodEnd: boolean;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export function prismStripeSubscriptionSnapshot(
  subscription: Stripe.Subscription,
  config: PrismStripeSandboxConfigV1,
): PrismStripeSubscriptionSnapshotV1 | null {
  const subscriptionId = stringProviderId(
    subscription.id,
    PROVIDER_IDS.subscription,
  );
  const customerId = stringProviderId(
    subscription.customer,
    PROVIDER_IDS.customer,
  );
  const attemptRef = metadataAttemptRef(subscription.metadata);
  const item = subscription.items.has_more === false &&
      subscription.items.data.length === 1
    ? subscription.items.data[0]
    : undefined;
  const periodStart = epochSeconds(item?.current_period_start);
  const periodEnd = epochSeconds(item?.current_period_end);
  const lifecyclePriceProblems = item
    ? prismStripePriceProblems(item.price, config).filter(
        (problem) => problem !== "price_not_active",
      )
    : ["not_recurring"];
  if (
    subscription.object !== "subscription" ||
    subscription.livemode !== false ||
    subscriptionId === null ||
    customerId === null ||
    attemptRef === null ||
    subscription.currency !== config.currency ||
    subscription.collection_method !== "charge_automatically" ||
    subscription.pause_collection !== null ||
    subscription.schedule !== null ||
    subscription.trial_start !== null ||
    subscription.trial_end !== null ||
    ![
      "incomplete",
      "incomplete_expired",
      "trialing",
      "active",
      "past_due",
      "canceled",
      "unpaid",
      "paused",
    ].includes(subscription.status) ||
    typeof subscription.cancel_at_period_end !== "boolean" ||
    item === undefined ||
    item.quantity !== 1 ||
    lifecyclePriceProblems.length > 0 ||
    periodStart === null ||
    periodEnd === null ||
    Date.parse(periodStart) >= Date.parse(periodEnd)
  ) {
    return null;
  }
  return Object.freeze({
    subscriptionId,
    customerId,
    attemptRef,
    priceId: item.price.id,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    periodStart,
    periodEnd,
  });
}

export function prismStripeInvoiceSubscriptionProblems(
  subscription: Stripe.Subscription,
  invoice: Extract<
    PrismStripeWebhookActionV1,
    { readonly kind: "invoice_paid_lookup" | "invoice_payment_failed" }
  >,
  config: PrismStripeSandboxConfigV1,
): readonly string[] {
  const fact = prismStripeSubscriptionSnapshot(subscription, config);
  if (fact === null) return Object.freeze(["invalid_subscription"]);
  const problems: string[] = [];
  if (fact.subscriptionId !== invoice.subscriptionId) {
    problems.push("wrong_subscription");
  }
  if (fact.customerId !== invoice.customerId) problems.push("wrong_customer");
  if (fact.attemptRef !== invoice.attemptRef) problems.push("wrong_attempt");
  if (fact.priceId !== invoice.priceId) problems.push("wrong_price");
  if (
    fact.periodStart !== invoice.periodStart ||
    fact.periodEnd !== invoice.periodEnd
  ) {
    problems.push("wrong_period");
  }
  if (
    invoice.kind === "invoice_paid_lookup" &&
    subscription.status !== "active"
  ) {
    problems.push("subscription_not_active");
  }
  return Object.freeze(problems);
}

export type PrismStripeResolvedPaidInvoiceV1 = Readonly<{
  subscriptionId: string;
  customerId: string;
  invoiceId: string;
  paymentIntentId: string;
  priceId: string;
  currency: "gbp";
  amountPaidMinor: number;
  quantity: 1;
  periodStart: string;
  periodEnd: string;
  confirmedAt: string;
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
}>;

function exactPaidInvoicePayment(
  payment: Stripe.InvoicePayment | undefined,
  expected: Readonly<{
    invoiceId: string;
    paymentIntentId?: string;
    currency: string;
    amountMinor: number;
  }>,
): string | null {
  const invoiceId = stringProviderId(payment?.invoice, PROVIDER_IDS.invoice);
  const paymentIntentId = stringProviderId(
    payment?.payment.payment_intent,
    PROVIDER_IDS.paymentIntent,
  );
  if (
    payment?.object !== "invoice_payment" ||
    payment.livemode !== false ||
    payment.status !== "paid" ||
    payment.is_default !== true ||
    payment.payment.type !== "payment_intent" ||
    invoiceId !== expected.invoiceId ||
    paymentIntentId === null ||
    (expected.paymentIntentId !== undefined &&
      paymentIntentId !== expected.paymentIntentId) ||
    payment.currency !== expected.currency ||
    payment.amount_requested !== expected.amountMinor ||
    payment.amount_paid !== expected.amountMinor
  ) {
    return null;
  }
  return paymentIntentId;
}

function paymentIntentIsExact(
  paymentIntent: Stripe.PaymentIntent,
  expected: Readonly<{
    paymentIntentId: string;
    customerId: string;
    currency: string;
    amountMinor: number;
  }>,
): boolean {
  return (
    paymentIntent.object === "payment_intent" &&
    paymentIntent.id === expected.paymentIntentId &&
    paymentIntent.livemode === false &&
    paymentIntent.status === "succeeded" &&
    paymentIntent.amount === expected.amountMinor &&
    paymentIntent.amount_received === expected.amountMinor &&
    paymentIntent.currency === expected.currency &&
    stringProviderId(paymentIntent.customer, PROVIDER_IDS.customer) ===
      expected.customerId &&
    Array.isArray(paymentIntent.payment_method_types) &&
    paymentIntent.payment_method_types.length === 1 &&
    paymentIntent.payment_method_types[0] === "card"
  );
}

export function resolvePrismStripePaidInvoice(
  action: Extract<
    PrismStripeWebhookActionV1,
    { readonly kind: "invoice_paid_lookup" }
  >,
  input: Readonly<{
    invoicePayments: readonly Stripe.InvoicePayment[];
    invoicePaymentsHasMore: boolean;
    paymentIntent: Stripe.PaymentIntent;
    subscription: Stripe.Subscription;
    config: PrismStripeSandboxConfigV1;
  }>,
):
  | Readonly<{ ok: true; invoice: PrismStripeResolvedPaidInvoiceV1 }>
  | Readonly<{ ok: false; code: string }> {
  if (input.invoicePaymentsHasMore || input.invoicePayments.length !== 1) {
    return Object.freeze({ ok: false, code: "ambiguous_paid_invoice_payment" });
  }
  const paymentIntentId = exactPaidInvoicePayment(input.invoicePayments[0], {
    invoiceId: action.invoiceId,
    currency: input.config.currency,
    amountMinor: input.config.unitAmountMinor,
  });
  if (paymentIntentId === null) {
    return Object.freeze({ ok: false, code: "invalid_paid_invoice_payment" });
  }
  if (
    !paymentIntentIsExact(input.paymentIntent, {
      paymentIntentId,
      customerId: action.customerId,
      currency: input.config.currency,
      amountMinor: input.config.unitAmountMinor,
    })
  ) {
    return Object.freeze({ ok: false, code: "paid_payment_intent_mismatch" });
  }
  const subscription = prismStripeSubscriptionSnapshot(
    input.subscription,
    input.config,
  );
  if (
    subscription === null ||
    prismStripeInvoiceSubscriptionProblems(
      input.subscription,
      action,
      input.config,
    ).length > 0
  ) {
    return Object.freeze({
      ok: false,
      code: "paid_invoice_subscription_mismatch",
    });
  }
  return Object.freeze({
    ok: true,
    invoice: Object.freeze({
      subscriptionId: action.subscriptionId,
      customerId: action.customerId,
      invoiceId: action.invoiceId,
      paymentIntentId,
      priceId: action.priceId,
      currency: action.currency,
      amountPaidMinor: action.amountMinor,
      quantity: action.quantity,
      periodStart: action.periodStart,
      periodEnd: action.periodEnd,
      confirmedAt: action.confirmedAt,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    }),
  });
}

export type PrismStripeResolvedFullRefundV1 = Readonly<{
  attemptRef: string;
  subscriptionId: string;
  customerId: string;
  invoiceId: string;
  refundId: string;
  paymentIntentId: string;
  priceId: string;
  productId: string;
  currency: "gbp";
  quantity: 1;
  periodStart: string;
  periodEnd: string;
  confirmedAt: string;
  subscriptionStatus: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  refundedAt: string;
  amountRefundedMinor: number;
}>;

/**
 * Correlates a full Charge refund through the current InvoicePayment API,
 * exact paid invoice, and exact subscription. All provider I/O happens before
 * this pure validator and before the DAL transaction.
 */
export function resolvePrismStripeFullRefund(
  action: Extract<
    PrismStripeWebhookActionV1,
    { readonly kind: "full_refund_lookup" }
  >,
  input: Readonly<{
    invoicePayments: readonly Stripe.InvoicePayment[];
    invoicePaymentsHasMore: boolean;
    invoice: Stripe.Invoice;
    paymentIntent: Stripe.PaymentIntent;
    subscription: Stripe.Subscription;
    config: PrismStripeSandboxConfigV1;
  }>,
):
  | Readonly<{ ok: true; refund: PrismStripeResolvedFullRefundV1 }>
  | Readonly<{ ok: false; code: string }> {
  if (input.invoicePaymentsHasMore || input.invoicePayments.length !== 1) {
    return Object.freeze({ ok: false, code: "ambiguous_refund_invoice_payment" });
  }
  const invoiceId = stringProviderId(
    input.invoicePayments[0]?.invoice,
    PROVIDER_IDS.invoice,
  );
  const paymentIntentId = exactPaidInvoicePayment(input.invoicePayments[0], {
    invoiceId: invoiceId ?? "",
    paymentIntentId: action.paymentIntentId,
    currency: input.config.currency,
    amountMinor: input.config.unitAmountMinor,
  });
  if (invoiceId === null || paymentIntentId === null) {
    return Object.freeze({ ok: false, code: "invalid_refund_invoice_payment" });
  }

  const fact = invoiceFact(input.invoice, input.config);
  const confirmedAt = epochSeconds(input.invoice.status_transitions.paid_at);
  if (
    fact === null ||
    fact.invoiceId !== invoiceId ||
    input.invoice.status !== "paid" ||
    input.invoice.amount_paid !== input.config.unitAmountMinor ||
    input.invoice.amount_due !== input.config.unitAmountMinor ||
    input.invoice.amount_remaining !== 0 ||
    input.invoice.total !== input.config.unitAmountMinor ||
    confirmedAt === null
  ) {
    return Object.freeze({ ok: false, code: "invalid_refund_invoice" });
  }
  if (
    !paymentIntentIsExact(input.paymentIntent, {
      paymentIntentId,
      customerId: fact.customerId,
      currency: input.config.currency,
      amountMinor: input.config.unitAmountMinor,
    })
  ) {
    return Object.freeze({ ok: false, code: "refund_payment_intent_mismatch" });
  }
  const invoiceAction: Extract<
    PrismStripeWebhookActionV1,
    { readonly kind: "invoice_payment_failed" }
  > = {
    kind: "invoice_payment_failed" as const,
    ...fact,
    failedAt: action.refundedAt,
  };
  const subscription = prismStripeSubscriptionSnapshot(
    input.subscription,
    input.config,
  );
  if (
    subscription === null ||
    prismStripeInvoiceSubscriptionProblems(
      input.subscription,
      invoiceAction,
      input.config,
    ).length > 0
  ) {
    return Object.freeze({ ok: false, code: "refund_subscription_mismatch" });
  }
  return Object.freeze({
    ok: true,
    refund: Object.freeze({
      attemptRef: fact.attemptRef,
      subscriptionId: fact.subscriptionId,
      customerId: fact.customerId,
      invoiceId,
      refundId: action.refundId,
      paymentIntentId,
      priceId: fact.priceId,
      productId: fact.productId,
      currency: fact.currency,
      quantity: fact.quantity,
      periodStart: fact.periodStart,
      periodEnd: fact.periodEnd,
      confirmedAt,
      subscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      refundedAt: action.refundedAt,
      amountRefundedMinor: action.amountRefundedMinor,
    }),
  });
}

function review(code: string): PrismStripeWebhookActionV1 {
  return Object.freeze({ kind: "requires_review" as const, code });
}

function previousCancelAtPeriodEnd(event: Stripe.Event): boolean | null {
  const value = event.data.previous_attributes as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = (value as Record<string, unknown>).cancel_at_period_end;
  return typeof candidate === "boolean" ? candidate : null;
}

export function planPrismStripeWebhookEvent(
  event: Stripe.Event,
  input: {
    readonly config: PrismStripeSandboxConfigV1;
    readonly payloadSha256: string;
    readonly receivedAt: string;
  },
): PrismStripeWebhookPlanV1 {
  const scopedEvent = event as Stripe.Event & {
    readonly account?: string | null;
    readonly context?: string | null;
  };
  const receivedMs = Date.parse(input.receivedAt);
  const createdAt = epochSeconds(event.created);
  if (
    event.object !== "event" ||
    !PROVIDER_IDS.event.test(event.id) ||
    !PROVIDER_IDS.digest.test(input.payloadSha256) ||
    !Number.isFinite(receivedMs) ||
    new Date(receivedMs).toISOString() !== input.receivedAt ||
    createdAt === null ||
    Date.parse(createdAt) > receivedMs + 5 * 60 * 1000 ||
    !/^[a-z][a-z0-9_.]{0,127}$/.test(event.type)
  ) {
    return Object.freeze({ ok: false, code: "invalid_event_envelope" });
  }
  if (event.livemode !== false) {
    return Object.freeze({ ok: false, code: "live_event_rejected" });
  }
  if (event.api_version !== input.config.apiVersion) {
    return Object.freeze({ ok: false, code: "api_version_rejected" });
  }
  // This endpoint is for direct events from the configured account, not
  // Connect or organisation-context forwarding.
  if (
    (scopedEvent.account !== undefined && scopedEvent.account !== null) ||
    (scopedEvent.context !== undefined && scopedEvent.context !== null)
  ) {
    return Object.freeze({ ok: false, code: "connected_event_rejected" });
  }

  const receipt: PrismStripeWebhookReceiptV1 = Object.freeze({
    environment: "test",
    stripeEventId: event.id,
    stripeAccountId: input.config.accountId,
    apiVersion: input.config.apiVersion,
    eventType: event.type,
    livemode: false,
    payloadSha256: input.payloadSha256,
    providerCreatedAt: createdAt,
    receivedAt: input.receivedAt,
  });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sessionId = stringProviderId(session.id, PROVIDER_IDS.checkout);
    const customerId = stringProviderId(session.customer, PROVIDER_IDS.customer);
    const subscriptionId = stringProviderId(
      session.subscription,
      PROVIDER_IDS.subscription,
    );
    const attemptRef = metadataAttemptRef(session.metadata);
    const completedAt = epochSeconds(event.created);
    const action =
      session.object === "checkout.session" &&
      session.livemode === false &&
      sessionId !== null &&
      customerId !== null &&
      subscriptionId !== null &&
      attemptRef !== null &&
      session.client_reference_id === attemptRef &&
      session.mode === "subscription" &&
      session.status === "complete" &&
      session.payment_status === "paid" &&
      Array.isArray(session.payment_method_types) &&
      session.payment_method_types.length === 1 &&
      session.payment_method_types[0] === "card" &&
      session.currency === input.config.currency &&
      session.amount_total === input.config.unitAmountMinor &&
      completedAt !== null
        ? Object.freeze({
            kind: "checkout_session_completed" as const,
            sessionId,
            customerId,
            subscriptionId,
            attemptRef,
            status: "complete" as const,
            completedAt,
          })
        : review("invalid_checkout_session");
    return Object.freeze({ ok: true, receipt, action });
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const fact = invoiceFact(invoice, input.config);
    if (fact === null) {
      return Object.freeze({
        ok: true,
        receipt,
        action: review("invalid_subscription_invoice"),
      });
    }
    if (event.type === "invoice.paid") {
      const confirmedAt = epochSeconds(invoice.status_transitions.paid_at);
      if (
        invoice.status !== "paid" ||
        invoice.amount_paid !== input.config.unitAmountMinor ||
        invoice.amount_due !== input.config.unitAmountMinor ||
        invoice.amount_remaining !== 0 ||
        invoice.total !== input.config.unitAmountMinor ||
        confirmedAt === null
      ) {
        return Object.freeze({
          ok: true,
          receipt,
          action: review("invalid_paid_invoice"),
        });
      }
      return Object.freeze({
        ok: true,
        receipt,
        action: Object.freeze({
          kind: "invoice_paid_lookup" as const,
          ...fact,
          grantKind:
            fact.billingReason === "subscription_create"
              ? ("initial" as const)
              : ("renewal" as const),
          confirmedAt,
        }),
      });
    }

    if (
      invoice.status !== "open" ||
      invoice.amount_paid !== 0 ||
      invoice.amount_remaining <= 0
    ) {
      return Object.freeze({
        ok: true,
        receipt,
        action: review("invalid_failed_invoice"),
      });
    }
    return Object.freeze({
      ok: true,
      receipt,
      action: Object.freeze({
        kind: "invoice_payment_failed" as const,
        ...fact,
        failedAt: createdAt,
      }),
    });
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const fact = prismStripeSubscriptionSnapshot(subscription, input.config);
    if (fact === null) {
      return Object.freeze({
        ok: true,
        receipt,
        action: review("invalid_subscription_snapshot"),
      });
    }
    if (event.type === "customer.subscription.updated") {
      const previousCancel = previousCancelAtPeriodEnd(event);
      if (!subscription.cancel_at_period_end) {
        if (
          subscription.status === "canceled" ||
          subscription.status === "incomplete_expired" ||
          subscription.status === "unpaid" ||
          subscription.status === "paused" ||
          subscription.status === "trialing"
        ) {
          return Object.freeze({
            ok: true,
            receipt,
            action: review("invalid_subscription_resume_status"),
          });
        }
        if (previousCancel !== true) {
          return Object.freeze({
            ok: true,
            receipt,
            action: Object.freeze({
              kind: "subscription_status_observed" as const,
              ...fact,
              status: subscription.status,
              cancelAtPeriodEnd: false,
              statusAt: createdAt,
            }),
          });
        }
        return Object.freeze({
          ok: true,
          receipt,
          action: Object.freeze({
            kind: "subscription_resumed" as const,
            ...fact,
            status: subscription.status,
            statusAt: createdAt,
          }),
        });
      }
      if (
        subscription.status === "canceled" ||
        subscription.status === "incomplete_expired"
      ) {
        return Object.freeze({
          ok: true,
          receipt,
          action: review("invalid_scheduled_cancel_status"),
        });
      }
      if (previousCancel !== false) {
        return Object.freeze({
          ok: true,
          receipt,
          action: Object.freeze({
            kind: "subscription_status_observed" as const,
            ...fact,
            status: subscription.status,
            cancelAtPeriodEnd: true,
            statusAt: createdAt,
          }),
        });
      }
      return Object.freeze({
        ok: true,
        receipt,
        action: Object.freeze({
          kind: "subscription_cancel_at_period_end" as const,
          ...fact,
          status: subscription.status,
          statusAt: createdAt,
        }),
      });
    }

    if (
      subscription.status === "incomplete_expired" &&
      subscription.cancel_at_period_end === false
    ) {
      return Object.freeze({
        ok: true,
        receipt,
        action: Object.freeze({
          kind: "subscription_incomplete_expired" as const,
          ...fact,
          status: "incomplete_expired" as const,
          cancelAtPeriodEnd: false as const,
          statusAt: createdAt,
        }),
      });
    }

    const endedAt = epochSeconds(subscription.ended_at);
    if (subscription.status !== "canceled" || endedAt === null) {
      return Object.freeze({
        ok: true,
        receipt,
        action: review("invalid_deleted_subscription"),
      });
    }
    return Object.freeze({
      ok: true,
      receipt,
      action: Object.freeze({
        kind: "subscription_deleted" as const,
        ...fact,
        status: "canceled" as const,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        statusAt: createdAt,
        endedAt,
      }),
    });
  }

  if (event.type === "refund.created" || event.type === "refund.updated") {
    const refund = event.data.object as Stripe.Refund;
    const refundId = stringProviderId(refund.id, PROVIDER_IDS.refund);
    const paymentIntentId = stringProviderId(
      refund.payment_intent,
      PROVIDER_IDS.paymentIntent,
    );
    const refundCreatedAt = epochSeconds(refund.created);
    if (
      refund.object !== "refund" ||
      refundId === null ||
      paymentIntentId === null ||
      refund.status !== "succeeded" ||
      refund.currency !== input.config.currency ||
      refund.amount !== input.config.unitAmountMinor ||
      refundCreatedAt === null ||
      Date.parse(refundCreatedAt) > Date.parse(createdAt)
    ) {
      return Object.freeze({
        ok: true,
        receipt,
        action: review(
          refund.amount !== input.config.unitAmountMinor
            ? "partial_refund_unsupported"
            : "refund_not_succeeded",
        ),
      });
    }
    return Object.freeze({
      ok: true,
      receipt,
      action: Object.freeze({
        kind: "full_refund_lookup" as const,
        refundId,
        paymentIntentId,
        amountRefundedMinor: refund.amount,
        currency: input.config.currency,
        // refund.updated may be the first evidence that an asynchronous
        // refund actually succeeded; its signed Event time is authoritative.
        refundedAt: createdAt,
      }),
    });
  }

  if (event.type === "charge.refunded") {
    return Object.freeze({
      ok: true,
      receipt,
      action: Object.freeze({
        kind: "ignored" as const,
        code: "charge_refunded_superseded_by_refund_event",
      }),
    });
  }

  return Object.freeze({
    ok: true,
    receipt,
    action: review("unsupported_event_type"),
  });
}
