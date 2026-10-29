import type Stripe from "stripe";
import {
  DataApiBillingNotProvisionedError,
  dataApiSubscriptionSnapshot,
  getDataApiStripeTestClient,
  hasDataApiStripeEvent,
  inspectDataApiBillingConfig,
  planDataApiWebhookEvent,
  recordDataApiStripeEvent,
  type DataApiBillingConfig,
  type DataApiEventDecision,
} from "@/lib/data-api/billing";
import { billingError, billingHttpErrorResponse, billingJson, readWebhookBody } from "@/lib/data-api/billing/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REFUSALS = Object.freeze({
  invalid_event: "The signed event is not a Stripe event this webhook understands.",
  live_event_refused: "Live-mode events are refused: data-API billing runs in Stripe test mode only.",
  connected_event_refused: "Connected-account events are refused.",
});

// A data-API subscription no account holds. Other ignores (another product's
// objects, an older state than the row holds) are routine and stay quiet.
const UNBOUND = new Set(["customer_not_bound", "owner_mismatch"]);

/** The current subscription, read from Stripe, as the store's input. */
async function subscriptionDecision(
  stripe: Stripe,
  config: DataApiBillingConfig,
  subscriptionId: string,
): Promise<DataApiEventDecision> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const snapshot = dataApiSubscriptionSnapshot(subscription, config, subscriptionId);
  return snapshot.ok ? { kind: "sync", snapshot: snapshot.snapshot } : { kind: "ignore", code: snapshot.code };
}

/**
 * Stripe test-mode events for data-API subscriptions. Verifies the signature
 * on the exact raw body, refuses live events, and handles each event id once
 * (data_api_stripe_events). For a data-API subscription it reads the current
 * subscription from Stripe rather than trusting the event's copy, and the
 * store never moves a row back to an older event's state. Every answer other
 * than 200 makes Stripe retry, so failures that may pass answer 503.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const inspected = inspectDataApiBillingConfig();
    if (!inspected.ok) return billingError("webhook_unavailable", "Data-API billing is not configured.", 503);
    const config = inspected.config;

    const signature = request.headers.get("stripe-signature");
    if (signature === null || signature.length < 8 || signature.length > 2048) {
      return billingError("invalid_signature", "A valid Stripe webhook signature is required.", 400);
    }
    const rawBody = await readWebhookBody(request);
    const stripe = getDataApiStripeTestClient(config);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
    } catch {
      return billingError("invalid_signature", "The Stripe webhook signature did not verify.", 400);
    }

    const plan = planDataApiWebhookEvent(event);
    if (!plan.ok) return billingError(plan.code, REFUSALS[plan.code], 400);
    // A completed delivery needs no fresh Stripe read; the transaction below stays authoritative if this races.
    if (await hasDataApiStripeEvent(plan.receipt.eventId)) return billingJson({ received: true as const });

    // Every Stripe read finishes before the one transaction that records the event opens.
    const decision: DataApiEventDecision = plan.action.kind === "ignore"
      ? plan.action
      : await subscriptionDecision(stripe, config, plan.action.subscriptionId);
    const recorded = await recordDataApiStripeEvent(plan.receipt, decision);
    // A typed subscription outside the contract (no plan answers its price, even when its
    // status was applied), or unbound, needs a person to look.
    const unresolved = decision.kind === "sync" ? decision.snapshot.planUnresolved : null;
    const outsideContract = plan.action.kind === "sync_subscription" && (decision.kind === "ignore" || unresolved !== null);
    if (recorded.disposition === "recorded" && (outsideContract || UNBOUND.has(recorded.code))) {
      const detail = unresolved !== null && unresolved !== recorded.code ? ` (plan unresolved: ${unresolved})` : "";
      console.error(`[webhooks/stripe/data-api] ${plan.receipt.eventType} ${plan.receipt.eventId} ${recorded.outcome}: ${recorded.code}${detail}`);
    }
    return billingJson({ received: true as const });
  } catch (error) {
    const requestError = billingHttpErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof DataApiBillingNotProvisionedError) return billingError(error.code, error.message, 503);
    console.error("[webhooks/stripe/data-api POST] unavailable", error instanceof Error ? error.name : "UnknownError");
    return billingError("webhook_unavailable", "The data-API Stripe event could not be durably processed.", 503);
  }
}
