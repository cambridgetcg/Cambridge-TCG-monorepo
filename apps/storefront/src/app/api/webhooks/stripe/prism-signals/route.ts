import { createHash } from "node:crypto";
import type Stripe from "stripe";
import {
  getPrismStripeTestClient,
  preflightPrismStripeWebhookReceipt,
  prismStripeAccountProblems,
  processPrismStripeWebhookAtomically,
  readPrismStripeSandboxConfig,
  type PrismStripeWebhookActionsV1,
  type PrismStripeWebhookDecisionV1,
} from "@/lib/prism-signals/stripe";
import {
  prismStripeError,
  prismStripeHttpErrorResponse,
  prismStripeJson,
  readPrismStripeRawWebhookBody,
} from "@/app/api/prism-signals/stripe/http";
import {
  planPrismStripeWebhookEvent,
  prismStripeSubscriptionSnapshot,
  resolvePrismStripeFullRefund,
  resolvePrismStripePaidInvoice,
  type PrismStripeWebhookActionV1,
} from "./event-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AtomicWork = (
  actions: PrismStripeWebhookActionsV1,
) => Promise<PrismStripeWebhookDecisionV1> | PrismStripeWebhookDecisionV1;

function completedWebhookResult(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const result = value as {
    readonly disposition?: unknown;
    readonly outcome?: unknown;
  };
  return (
    (result.disposition === "processed" || result.disposition === "duplicate") &&
    (result.outcome === "processed" ||
      result.outcome === "ignored" ||
      result.outcome === "requires_review")
  );
}

const PROVIDER_IDS = Object.freeze({
  invoice: /^in_[A-Za-z0-9]{8,128}$/,
  paymentIntent: /^pi_[A-Za-z0-9]{8,128}$/,
  subscription: /^sub_[A-Za-z0-9]{8,128}$/,
});

function providerString(
  value: unknown,
  pattern: RegExp,
): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function eventObjectIdentity(event: Stripe.Event): string | null {
  const value = event.data.object as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const object = value as { readonly object?: unknown; readonly id?: unknown };
  return typeof object.object === "string" && typeof object.id === "string"
    ? `${object.object}:${object.id}`
    : null;
}

function sameProviderEvent(
  signed: Stripe.Event,
  retrieved: Stripe.Event,
): boolean {
  return (
    retrieved.id === signed.id &&
    retrieved.object === "event" &&
    retrieved.api_version === signed.api_version &&
    retrieved.created === signed.created &&
    retrieved.livemode === signed.livemode &&
    retrieved.type === signed.type &&
    eventObjectIdentity(retrieved) === eventObjectIdentity(signed)
  );
}

function reviewWork(code: string): AtomicWork {
  return (actions) => actions.requiresReview(code);
}

function directWork(action: PrismStripeWebhookActionV1): AtomicWork {
  if (action.kind === "requires_review") return reviewWork(action.code);
  if (action.kind === "ignored") {
    return (actions) => actions.ignore(action.code);
  }
  if (action.kind === "checkout_session_completed") {
    return (actions) =>
      actions.observeCheckoutCompleted({
        attemptRef: action.attemptRef,
        sessionId: action.sessionId,
        customerId: action.customerId,
        subscriptionId: action.subscriptionId,
        status: action.status,
        completedAt: action.completedAt,
      });
  }
  if (action.kind === "invoice_payment_failed") {
    return (actions) =>
      actions.observeInvoicePaymentFailed({
        attemptRef: action.attemptRef,
        invoiceId: action.invoiceId,
        subscriptionId: action.subscriptionId,
        customerId: action.customerId,
        priceId: action.priceId,
        productId: action.productId,
        currency: action.currency,
        amountMinor: action.amountMinor,
        quantity: action.quantity,
        periodStart: action.periodStart,
        periodEnd: action.periodEnd,
        failedAt: action.failedAt,
      });
  }
  if (action.kind === "subscription_cancel_at_period_end") {
    return (actions) =>
      actions.applyCancelAtPeriodEnd({
        subscriptionId: action.subscriptionId,
        customerId: action.customerId,
        attemptRef: action.attemptRef,
        priceId: action.priceId,
        status: action.status,
        periodStart: action.periodStart,
        periodEnd: action.periodEnd,
        statusAt: action.statusAt,
      });
  }
  if (action.kind === "subscription_resumed") {
    return (actions) =>
      actions.applySubscriptionResumed({
        subscriptionId: action.subscriptionId,
        customerId: action.customerId,
        attemptRef: action.attemptRef,
        priceId: action.priceId,
        status: action.status,
        periodStart: action.periodStart,
        periodEnd: action.periodEnd,
        statusAt: action.statusAt,
      });
  }
  if (action.kind === "subscription_deleted") {
    return (actions) =>
      actions.applySubscriptionDeleted({
        subscriptionId: action.subscriptionId,
        customerId: action.customerId,
        attemptRef: action.attemptRef,
        priceId: action.priceId,
        status: action.status,
        periodStart: action.periodStart,
        periodEnd: action.periodEnd,
        statusAt: action.statusAt,
        endedAt: action.endedAt,
      });
  }
  return reviewWork("provider_lookup_required");
}

async function paidInvoiceWork(
  stripe: Stripe,
  config: ReturnType<typeof readPrismStripeSandboxConfig>,
  action: Extract<
    PrismStripeWebhookActionV1,
    { readonly kind: "invoice_paid_lookup" }
  >,
): Promise<AtomicWork> {
  const payments = await stripe.invoicePayments.list({
    invoice: action.invoiceId,
    status: "paid",
    limit: 2,
  });
  if (payments.has_more || payments.data.length !== 1) {
    return reviewWork("ambiguous_paid_invoice_payment");
  }
  const paymentIntentId = providerString(
    payments.data[0]?.payment.payment_intent,
    PROVIDER_IDS.paymentIntent,
  );
  if (paymentIntentId === null) {
    return reviewWork("invalid_paid_invoice_payment");
  }

  const [paymentIntent, subscription] = await Promise.all([
    stripe.paymentIntents.retrieve(paymentIntentId),
    stripe.subscriptions.retrieve(action.subscriptionId),
  ]);
  const resolved = resolvePrismStripePaidInvoice(action, {
    invoicePayments: payments.data,
    invoicePaymentsHasMore: payments.has_more,
    paymentIntent,
    subscription,
    config,
  });
  if (!resolved.ok) return reviewWork(resolved.code);
  return (actions) =>
    actions.applyInvoicePaid({
      attemptRef: action.attemptRef,
      invoiceId: action.invoiceId,
      subscriptionId: action.subscriptionId,
      customerId: action.customerId,
      priceId: action.priceId,
      productId: action.productId,
      currency: action.currency,
      amountMinor: action.amountMinor,
      quantity: action.quantity,
      periodStart: action.periodStart,
      periodEnd: action.periodEnd,
      grantKind: action.grantKind,
      confirmedAt: action.confirmedAt,
      paymentIntentId: resolved.invoice.paymentIntentId,
      status: resolved.invoice.status,
      cancelAtPeriodEnd: resolved.invoice.cancelAtPeriodEnd,
    });
}

async function fullRefundWork(
  stripe: Stripe,
  config: ReturnType<typeof readPrismStripeSandboxConfig>,
  action: Extract<
    PrismStripeWebhookActionV1,
    { readonly kind: "full_refund_lookup" }
  >,
): Promise<AtomicWork> {
  const payments = await stripe.invoicePayments.list({
    payment: {
      type: "payment_intent",
      payment_intent: action.paymentIntentId,
    },
    status: "paid",
    limit: 2,
  });
  if (payments.has_more || payments.data.length !== 1) {
    return reviewWork("ambiguous_refund_invoice_payment");
  }
  const invoiceId = providerString(
    payments.data[0]?.invoice,
    PROVIDER_IDS.invoice,
  );
  if (invoiceId === null) {
    return reviewWork("invalid_refund_invoice_payment");
  }

  const [invoice, paymentIntent] = await Promise.all([
    stripe.invoices.retrieve(invoiceId),
    stripe.paymentIntents.retrieve(action.paymentIntentId),
  ]);
  const subscriptionId = providerString(
    invoice.parent?.type === "subscription_details"
      ? invoice.parent.subscription_details?.subscription
      : null,
    PROVIDER_IDS.subscription,
  );
  if (subscriptionId === null) {
    return reviewWork("invalid_refund_invoice");
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const resolved = resolvePrismStripeFullRefund(action, {
    invoicePayments: payments.data,
    invoicePaymentsHasMore: payments.has_more,
    invoice,
    paymentIntent,
    subscription,
    config,
  });
  if (!resolved.ok) return reviewWork(resolved.code);
  return (actions) => actions.applyFullRefund(resolved.refund);
}

async function mutableSubscriptionWork(
  stripe: Stripe,
  config: ReturnType<typeof readPrismStripeSandboxConfig>,
  action: Extract<
    PrismStripeWebhookActionV1,
    {
      readonly kind:
        | "subscription_cancel_at_period_end"
        | "subscription_resumed"
        | "subscription_deleted";
    }
  >,
): Promise<AtomicWork> {
  const current = await stripe.subscriptions.retrieve(action.subscriptionId);
  const snapshot = prismStripeSubscriptionSnapshot(current, config);
  const expectedCancel =
    action.kind === "subscription_cancel_at_period_end"
      ? true
      : action.kind === "subscription_resumed"
        ? false
        : action.cancelAtPeriodEnd;
  const deletedTimeMatches =
    action.kind !== "subscription_deleted" ||
    (typeof current.ended_at === "number" &&
      current.ended_at * 1000 === Date.parse(action.endedAt));
  if (
    snapshot === null ||
    snapshot.subscriptionId !== action.subscriptionId ||
    snapshot.customerId !== action.customerId ||
    snapshot.attemptRef !== action.attemptRef ||
    snapshot.priceId !== action.priceId ||
    snapshot.status !== action.status ||
    snapshot.cancelAtPeriodEnd !== expectedCancel ||
    snapshot.periodStart !== action.periodStart ||
    snapshot.periodEnd !== action.periodEnd ||
    !deletedTimeMatches
  ) {
    return reviewWork("subscription_snapshot_superseded");
  }
  return directWork(action);
}

async function prepareAtomicWork(
  stripe: Stripe,
  config: ReturnType<typeof readPrismStripeSandboxConfig>,
  action: PrismStripeWebhookActionV1,
): Promise<AtomicWork> {
  if (action.kind === "invoice_paid_lookup") {
    return paidInvoiceWork(stripe, config, action);
  }
  if (action.kind === "full_refund_lookup") {
    return fullRefundWork(stripe, config, action);
  }
  if (
    action.kind === "subscription_cancel_at_period_end" ||
    action.kind === "subscription_resumed" ||
    action.kind === "subscription_deleted"
  ) {
    return mutableSubscriptionWork(stripe, config, action);
  }
  return directWork(action);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const config = readPrismStripeSandboxConfig();
    if (!config.webhookProcessingEnabled) {
      return prismStripeError(
        "webhook_processing_paused",
        "PRISM Signals Stripe webhook processing is paused.",
        503,
      );
    }

    const signature = request.headers.get("stripe-signature");
    if (signature === null || signature.length < 8 || signature.length > 2048) {
      return prismStripeError(
        "invalid_signature",
        "A valid Stripe webhook signature is required.",
        400,
      );
    }
    const rawBody = await readPrismStripeRawWebhookBody(request);
    const stripe = getPrismStripeTestClient(config);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.webhookSecret,
      );
    } catch {
      return prismStripeError(
        "invalid_signature",
        "The Stripe webhook signature did not verify.",
        400,
      );
    }

    const receivedAt = new Date().toISOString();
    const payloadSha256 = createHash("sha256")
      .update(rawBody, "utf8")
      .digest("hex");
    const plan = planPrismStripeWebhookEvent(event, {
      config,
      payloadSha256,
      receivedAt,
    });
    if (!plan.ok) {
      return prismStripeError(
        "webhook_event_rejected",
        "The signed Stripe event is outside the PRISM sandbox contract.",
        400,
      );
    }

    const receipt = {
      config,
      stripeEventId: plan.receipt.stripeEventId,
      stripeAccountId: plan.receipt.stripeAccountId,
      apiVersion: plan.receipt.apiVersion,
      eventType: plan.receipt.eventType,
      livemode: plan.receipt.livemode,
      payloadSha256: plan.receipt.payloadSha256,
      providerCreatedAt: plan.receipt.providerCreatedAt,
      receivedAt: plan.receipt.receivedAt,
    } as const;

    // An already completed exact receipt needs no fresh Stripe availability.
    // The later atomic insert remains authoritative when this read races.
    const duplicate = await preflightPrismStripeWebhookReceipt(receipt);
    if (duplicate !== null) {
      if (!completedWebhookResult(duplicate)) {
        throw new Error("PRISM Stripe preflight returned an invalid disposition.");
      }
      return prismStripeJson({ received: true as const });
    }

    const [account, retrievedEvent] = await Promise.all([
      stripe.accounts.retrieve(),
      stripe.events.retrieve(event.id),
    ]);
    if (
      prismStripeAccountProblems(account, config).length > 0 ||
      !sameProviderEvent(event, retrievedEvent)
    ) {
      return prismStripeError(
        "webhook_account_mismatch",
        "The PRISM Signals Stripe account or event did not verify.",
        503,
      );
    }

    // Every Stripe read/validation completes before this callback opens the
    // one database transaction containing receipt, mapping and entitlement.
    const work = await prepareAtomicWork(stripe, config, plan.action);
    const processed = await processPrismStripeWebhookAtomically(
      receipt,
      work,
    );
    if (!completedWebhookResult(processed)) {
      throw new Error("PRISM Stripe webhook returned an invalid disposition.");
    }

    return prismStripeJson({ received: true as const });
  } catch (error) {
    const requestError = prismStripeHttpErrorResponse(error);
    if (requestError) return requestError;
    console.error(
      "[webhooks/stripe/prism-signals POST] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return prismStripeError(
      "webhook_unavailable",
      "The PRISM Signals Stripe webhook could not be durably processed.",
      503,
    );
  }
}
