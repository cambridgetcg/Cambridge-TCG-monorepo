import type Stripe from "stripe";
import { DATA_API_SUBSCRIPTION_TYPE, isDataApiSubscriptionObject } from "@/lib/payments/checkout-session-kind";
import { planForPrice, type DataApiBillingConfig, type DataApiPaidPlanId } from "./config.server";

/**
 * What the data-API webhook does with a verified Stripe event. Pure: no
 * database, environment or network. The route verifies the signature, asks
 * this module what the event concerns, retrieves the subscription it names
 * from Stripe (so a late or out-of-order event never writes stale state) and
 * hands the result to the store, which applies it in one transaction.
 */

/** Stripe's subscription statuses, as 0142's CHECK lists them. */
export const DATA_API_SUBSCRIPTION_STATUSES = [
  "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused",
] as const;
export type DataApiSubscriptionStatus = (typeof DATA_API_SUBSCRIPTION_STATUSES)[number];

/** The statuses that can entitle; past_due, unpaid, incomplete and paused fall back to free until
 * Stripe says otherwise. The entitlement itself has one rule, lib/data-api/entitlements.ts (these
 * statuses and a paid period that has not ended); events.test.ts pins this list to that rule. */
export const DATA_API_ENTITLING_STATUSES: readonly DataApiSubscriptionStatus[] = Object.freeze(["active", "trialing"]);

/** After these Stripe bills no more; 0142's erasure guard waits for one. */
export const DATA_API_ENDED_STATUSES: readonly DataApiSubscriptionStatus[] = Object.freeze(["canceled", "incomplete_expired"]);

export const DATA_API_HANDLED_EVENT_TYPES = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const);

const IDS = Object.freeze({
  event: /^evt_[A-Za-z0-9]{8,128}$/,
  eventType: /^[a-z][a-z0-9_.]{0,127}$/,
  subscription: /^sub_[A-Za-z0-9]{8,128}$/,
  customer: /^cus_[A-Za-z0-9]{8,64}$/,
  user: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
});

export interface DataApiEventReceipt {
  readonly eventId: string;
  readonly eventType: string;
  /** Stripe's time for the event; a subscription row never moves back past it. */
  readonly providerCreatedAt: string;
}

export type DataApiWebhookAction =
  | { readonly kind: "ignore"; readonly code: string }
  | { readonly kind: "sync_subscription"; readonly subscriptionId: string };

export type DataApiWebhookPlan =
  | { readonly ok: false; readonly code: "invalid_event" | "live_event_refused" | "connected_event_refused" }
  | { readonly ok: true; readonly receipt: DataApiEventReceipt; readonly action: DataApiWebhookAction };

function epochSeconds(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 253_402_300_799) return null;
  return new Date(value * 1000).toISOString();
}

function providerId(value: unknown, pattern: RegExp): string | null {
  const id = typeof value === "object" && value !== null ? (value as { id?: unknown }).id : value;
  return typeof id === "string" && pattern.test(id) ? id : null;
}

const ignore = (code: string): DataApiWebhookAction => Object.freeze({ kind: "ignore", code });

function actionFor(type: string, object: unknown): DataApiWebhookAction {
  if (!(DATA_API_HANDLED_EVENT_TYPES as readonly string[]).includes(type)) return ignore("unhandled_event_type");
  if (typeof object !== "object" || object === null) return ignore("event_object_missing");
  const value = object as Record<string, unknown> & { metadata?: Stripe.Metadata | null };

  if (type === "checkout.session.completed") {
    // Typed sessions only: every other Checkout belongs to another flow.
    if (value.metadata?.type !== DATA_API_SUBSCRIPTION_TYPE) return ignore("not_data_api_object");
    if (value.mode !== "subscription") return ignore("checkout_not_subscription");
    const subscriptionId = providerId(value.subscription, IDS.subscription);
    return subscriptionId ? { kind: "sync_subscription", subscriptionId } : ignore("checkout_without_subscription");
  }
  if (type === "invoice.payment_failed") {
    if (!isDataApiSubscriptionObject(value)) return ignore("not_data_api_object");
    const parent = value.parent as { subscription_details?: { subscription?: unknown } | null } | null | undefined;
    const subscriptionId = providerId(parent?.subscription_details?.subscription ?? value.subscription, IDS.subscription);
    return subscriptionId ? { kind: "sync_subscription", subscriptionId } : ignore("invoice_without_subscription");
  }
  // customer.subscription.created / updated / deleted
  if (value.metadata?.type !== DATA_API_SUBSCRIPTION_TYPE) return ignore("not_data_api_object");
  const subscriptionId = providerId(value.id, IDS.subscription);
  return subscriptionId ? { kind: "sync_subscription", subscriptionId } : ignore("invalid_subscription_id");
}

/** Refuses live and connected-account events outright; everything else is recorded with an action. */
export function planDataApiWebhookEvent(event: Stripe.Event): DataApiWebhookPlan {
  const envelope = event as unknown as Record<string, unknown>;
  if (envelope.livemode === true) return { ok: false, code: "live_event_refused" };
  if (envelope.account !== undefined && envelope.account !== null) return { ok: false, code: "connected_event_refused" };
  const providerCreatedAt = epochSeconds(envelope.created);
  if (
    envelope.object !== "event" || envelope.livemode !== false || typeof envelope.id !== "string" || !IDS.event.test(envelope.id)
    || typeof envelope.type !== "string" || !IDS.eventType.test(envelope.type) || providerCreatedAt === null
  ) {
    return { ok: false, code: "invalid_event" };
  }
  const data = envelope.data as { object?: unknown } | undefined;
  return {
    ok: true,
    receipt: Object.freeze({ eventId: envelope.id, eventType: envelope.type, providerCreatedAt }),
    action: actionFor(envelope.type, data?.object),
  };
}

/** Why a data-API subscription's plan cannot be read from its item. */
export type DataApiPlanUnresolvedCode =
  | "subscription_items_ambiguous" | "subscription_quantity_unsupported" | "subscription_price_unknown";

export interface DataApiSubscriptionSnapshot {
  readonly subscriptionId: string;
  readonly customerId: string;
  /** The account the Checkout was opened for (metadata.user_id). The store
   * checks it against the account that holds the customer. */
  readonly userId: string;
  /** From the subscription's price, never from metadata: a plan change in the portal moves the price.
   * null when no configured plan answers it (a retired price, say), and planUnresolved says why: the
   * store then moves the row it already has (status, period end, cancel flag) and keeps its plan,
   * never creating a row or changing a plan from it. */
  readonly planId: DataApiPaidPlanId | null;
  readonly planUnresolved: DataApiPlanUnresolvedCode | null;
  readonly status: DataApiSubscriptionStatus;
  readonly currentPeriodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
}

export type DataApiSubscriptionSnapshotResult =
  | { readonly ok: true; readonly snapshot: DataApiSubscriptionSnapshot }
  | { readonly ok: false; readonly code: string };

/** The data-API facts of a subscription retrieved from Stripe, or why it is outside the contract.
 * Status, cancel flag and period are read before the plan, so a subscription whose price no plan
 * answers still carries Stripe's word on whether it renewed or ended. */
export function dataApiSubscriptionSnapshot(
  subscription: Stripe.Subscription,
  config: DataApiBillingConfig,
  expectedId: string,
): DataApiSubscriptionSnapshotResult {
  const value = subscription as unknown as Record<string, unknown> & {
    metadata?: Stripe.Metadata | null;
    items?: { has_more?: unknown; data?: unknown };
  };
  const fail = (code: string) => ({ ok: false as const, code });
  if (value.object !== "subscription" || value.id !== expectedId) return fail("subscription_mismatch");
  if (value.livemode !== false) return fail("subscription_not_test_mode");
  if (value.metadata?.type !== DATA_API_SUBSCRIPTION_TYPE) return fail("not_data_api_object");
  const userId = typeof value.metadata.user_id === "string" ? value.metadata.user_id.toLowerCase() : "";
  if (!IDS.user.test(userId)) return fail("subscription_owner_missing");
  const customerId = providerId(value.customer, IDS.customer);
  if (customerId === null) return fail("subscription_customer_invalid");
  const status = value.status;
  if (typeof status !== "string" || !(DATA_API_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) {
    return fail("subscription_status_unknown");
  }
  if (typeof value.cancel_at_period_end !== "boolean") return fail("subscription_cancel_flag_missing");
  const items = Array.isArray(value.items?.data) ? (value.items.data as Record<string, unknown>[]) : [];
  const item = value.items?.has_more === false && items.length === 1 ? items[0]! : null;
  // The pinned API version keeps the period on the item; older objects kept it on the subscription.
  // With more than one item there is no single item period, so only the older top-level one is read.
  const periodEnd = item?.current_period_end ?? value.current_period_end;
  const currentPeriodEnd = periodEnd === null || periodEnd === undefined ? null : epochSeconds(periodEnd);
  if (periodEnd !== null && periodEnd !== undefined && currentPeriodEnd === null) return fail("subscription_period_invalid");
  const planId = item === null || item.quantity !== 1 ? null : planForPrice(config, providerId(item.price, /^price_[A-Za-z0-9]{8,64}$/));
  const planUnresolved: DataApiPlanUnresolvedCode | null = planId !== null ? null
    : item === null ? "subscription_items_ambiguous"
      : item.quantity !== 1 ? "subscription_quantity_unsupported"
        : "subscription_price_unknown";
  return {
    ok: true,
    snapshot: Object.freeze({
      subscriptionId: expectedId, customerId, userId, planId, planUnresolved,
      status: status as DataApiSubscriptionStatus, currentPeriodEnd, cancelAtPeriodEnd: value.cancel_at_period_end,
    }),
  };
}
