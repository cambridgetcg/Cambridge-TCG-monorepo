import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));

import { ENTITLING_SUBSCRIPTION } from "../entitlements";
import { readDataApiBillingConfig } from "./config.server";
import {
  DATA_API_ENDED_STATUSES,
  DATA_API_ENTITLING_STATUSES,
  DATA_API_SUBSCRIPTION_STATUSES,
  dataApiSubscriptionSnapshot,
  planDataApiWebhookEvent,
} from "./events";

const config = readDataApiBillingConfig({
  DATA_API_STRIPE_SECRET_KEY: "rk_test_fixture_dataapi_0000001",
  DATA_API_STRIPE_WEBHOOK_SECRET: "whsec_fixture_dataapi_00000001",
  DATA_API_STRIPE_PRICE_PRO: "price_dataapipro0001",
  DATA_API_STRIPE_PRICE_BUSINESS: "price_dataapibiz0001",
});
const USER = "8b7f0d2e-3c1a-4f5e-9a6b-1c2d3e4f5a6b";
const typed = { type: "data_api_subscription", plan: "pro", user_id: USER };

function event(type: string, object: unknown, overrides: Record<string, unknown> = {}): Stripe.Event {
  return { id: "evt_dataapiunit0001", object: "event", api_version: "2026-02-25.clover", created: 1_793_000_000, livemode: false,
    pending_webhooks: 1, request: null, type, data: { object }, ...overrides } as unknown as Stripe.Event;
}
function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return { id: "sub_dataapiunit0001", object: "subscription", livemode: false, customer: "cus_dataapiunit0001", metadata: typed,
    status: "active", cancel_at_period_end: false,
    items: { object: "list", has_more: false, data: [{ quantity: 1, current_period_end: 1_795_000_000, price: { id: "price_dataapipro0001" } }] },
    ...overrides } as unknown as Stripe.Subscription;
}

describe("planDataApiWebhookEvent", () => {
  it("refuses live and connected-account events outright", () => {
    expect(planDataApiWebhookEvent(event("customer.subscription.updated", subscription(), { livemode: true }))).toEqual({ ok: false, code: "live_event_refused" });
    expect(planDataApiWebhookEvent(event("customer.subscription.updated", subscription(), { account: "acct_connected0001" }))).toEqual({ ok: false, code: "connected_event_refused" });
    for (const overrides of [{ id: "evt_1" }, { livemode: undefined }, { created: -1 }, { object: "list" }, { type: "Not A Type" }]) {
      expect(planDataApiWebhookEvent(event("customer.subscription.updated", subscription(), overrides))).toEqual({ ok: false, code: "invalid_event" });
    }
  });

  it("records Stripe's time for the event, not the time it arrived", () => {
    const plan = planDataApiWebhookEvent(event("customer.subscription.updated", subscription()));
    expect(plan).toMatchObject({ ok: true, receipt: { eventId: "evt_dataapiunit0001", eventType: "customer.subscription.updated", providerCreatedAt: new Date(1_793_000_000_000).toISOString() } });
  });

  it("syncs only Checkout Sessions typed data_api_subscription, in subscription mode", () => {
    const session = { object: "checkout.session", mode: "subscription", subscription: "sub_dataapiunit0001", metadata: typed };
    expect(planDataApiWebhookEvent(event("checkout.session.completed", session))).toMatchObject({ ok: true, action: { kind: "sync_subscription", subscriptionId: "sub_dataapiunit0001" } });
    expect(planDataApiWebhookEvent(event("checkout.session.completed", { ...session, subscription: { id: "sub_dataapiunit0001" } }))).toMatchObject({ action: { kind: "sync_subscription" } });
    for (const [object, code] of [
      [{ ...session, metadata: { type: "prism_signals_all_test_v1" } }, "not_data_api_object"],
      [{ ...session, metadata: {} }, "not_data_api_object"],
      [{ ...session, metadata: null }, "not_data_api_object"],
      [{ ...session, mode: "payment" }, "checkout_not_subscription"],
      [{ ...session, subscription: null }, "checkout_without_subscription"],
    ] as const) {
      expect(planDataApiWebhookEvent(event("checkout.session.completed", object))).toMatchObject({ ok: true, action: { kind: "ignore", code } });
    }
  });

  it.each(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"])("syncs a typed subscription on %s and ignores others", (type) => {
    expect(planDataApiWebhookEvent(event(type, subscription()))).toMatchObject({ action: { kind: "sync_subscription", subscriptionId: "sub_dataapiunit0001" } });
    expect(planDataApiWebhookEvent(event(type, subscription({ metadata: { type: "platinum_subscription" } })))).toMatchObject({ action: { kind: "ignore", code: "not_data_api_object" } });
  });

  it("follows a failed invoice to its typed subscription, in the pinned and older shapes", () => {
    const pinned = { object: "invoice", parent: { type: "subscription_details", subscription_details: { subscription: "sub_dataapiunit0001", metadata: typed } } };
    const older = { object: "invoice", subscription: "sub_dataapiunit0001", subscription_details: { metadata: typed } };
    for (const invoice of [pinned, older]) {
      expect(planDataApiWebhookEvent(event("invoice.payment_failed", invoice))).toMatchObject({ action: { kind: "sync_subscription", subscriptionId: "sub_dataapiunit0001" } });
    }
    expect(planDataApiWebhookEvent(event("invoice.payment_failed", { object: "invoice", parent: { subscription_details: { subscription: "sub_dataapiunit0001", metadata: {} } } })))
      .toMatchObject({ action: { kind: "ignore", code: "not_data_api_object" } });
  });

  it("records other event types as ignored rather than acting on them", () => {
    for (const type of ["invoice.paid", "charge.refunded", "charge.dispute.created", "checkout.session.expired", "customer.created"]) {
      expect(planDataApiWebhookEvent(event(type, { metadata: typed }))).toMatchObject({ ok: true, action: { kind: "ignore", code: "unhandled_event_type" } });
    }
  });
});

describe("dataApiSubscriptionSnapshot", () => {
  it("takes the plan from the configured price, never from metadata", () => {
    const moved = subscription({ metadata: typed, items: { has_more: false, data: [{ quantity: 1, current_period_end: 1_795_000_000, price: { id: "price_dataapibiz0001" } }] } });
    expect(dataApiSubscriptionSnapshot(moved, config, "sub_dataapiunit0001")).toEqual({ ok: true, snapshot: {
      subscriptionId: "sub_dataapiunit0001", customerId: "cus_dataapiunit0001", userId: USER, planId: "business", planUnresolved: null,
      status: "active", currentPeriodEnd: new Date(1_795_000_000_000).toISOString(), cancelAtPeriodEnd: false,
    } });
  });

  it.each<[string, Record<string, unknown>, string, string | null]>([
    ["an unconfigured (retired) price", { items: { has_more: false, data: [{ quantity: 1, current_period_end: 1_795_000_000, price: { id: "price_retired000001" } }] } }, "subscription_price_unknown", new Date(1_795_000_000_000).toISOString()],
    ["two seats", { items: { has_more: false, data: [{ quantity: 2, current_period_end: 1_795_000_000, price: { id: "price_dataapipro0001" } }] } }, "subscription_quantity_unsupported", new Date(1_795_000_000_000).toISOString()],
    ["two items", { items: { has_more: false, data: [{ quantity: 1, price: { id: "price_dataapipro0001" } }, { quantity: 1, price: { id: "price_dataapibiz0001" } }] } }, "subscription_items_ambiguous", null],
    ["a paged item list", { items: { has_more: true, data: [{ quantity: 1, price: { id: "price_dataapipro0001" } }] } }, "subscription_items_ambiguous", null],
  ])("still carries Stripe's status, period and cancel flag for %s, with no plan", (_label, overrides, code, currentPeriodEnd) => {
    // A cancellation on a price no plan answers must still reach the row it ends.
    const result = dataApiSubscriptionSnapshot(subscription({ status: "canceled", cancel_at_period_end: true, ...overrides }), config, "sub_dataapiunit0001");
    expect(result).toEqual({ ok: true, snapshot: {
      subscriptionId: "sub_dataapiunit0001", customerId: "cus_dataapiunit0001", userId: USER, planId: null, planUnresolved: code,
      status: "canceled", currentPeriodEnd, cancelAtPeriodEnd: true,
    } });
  });

  it("reads the status before the price, in both orders of fault", () => {
    const retired = { items: { has_more: false, data: [{ quantity: 1, current_period_end: 1_795_000_000, price: { id: "price_retired000001" } }] } };
    // An unknown price never hides a cancellation...
    expect(dataApiSubscriptionSnapshot(subscription({ ...retired, status: "canceled" }), config, "sub_dataapiunit0001"))
      .toMatchObject({ ok: true, snapshot: { planId: null, planUnresolved: "subscription_price_unknown", status: "canceled" } });
    // ...and an unreadable status is refused whatever the price.
    expect(dataApiSubscriptionSnapshot(subscription({ ...retired, status: "cancelled" }), config, "sub_dataapiunit0001"))
      .toEqual({ ok: false, code: "subscription_status_unknown" });
    expect(dataApiSubscriptionSnapshot(subscription({ ...retired, cancel_at_period_end: undefined }), config, "sub_dataapiunit0001"))
      .toEqual({ ok: false, code: "subscription_cancel_flag_missing" });
    // An active subscription on the unknown price is carried too; the store refuses to grant from it.
    expect(dataApiSubscriptionSnapshot(subscription(retired), config, "sub_dataapiunit0001"))
      .toMatchObject({ ok: true, snapshot: { planId: null, planUnresolved: "subscription_price_unknown", status: "active" } });
  });

  it("reads an expanded customer and the older top-level period", () => {
    const older = subscription({ customer: { id: "cus_dataapiunit0001" }, current_period_end: 1_795_000_000,
      items: { has_more: false, data: [{ quantity: 1, price: { id: "price_dataapipro0001" } }] } });
    expect(dataApiSubscriptionSnapshot(older, config, "sub_dataapiunit0001")).toMatchObject({ ok: true, snapshot: { customerId: "cus_dataapiunit0001", planId: "pro", currentPeriodEnd: new Date(1_795_000_000_000).toISOString() } });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["another subscription", { id: "sub_otherone00001" }, "subscription_mismatch"],
    ["a live subscription", { livemode: true }, "subscription_not_test_mode"],
    ["another product's subscription", { metadata: { type: "prism_signals_all_test_v1" } }, "not_data_api_object"],
    ["no owner", { metadata: { type: "data_api_subscription", plan: "pro" } }, "subscription_owner_missing"],
    ["a malformed customer", { customer: "cus_1" }, "subscription_customer_invalid"],
    ["an unknown status", { status: "cancelled" }, "subscription_status_unknown"],
    ["no cancel flag", { cancel_at_period_end: null }, "subscription_cancel_flag_missing"],
    ["a malformed period", { items: { has_more: false, data: [{ quantity: 1, current_period_end: -5, price: { id: "price_dataapipro0001" } }] } }, "subscription_period_invalid"],
  ])("refuses %s", (_label, overrides, code) => {
    expect(dataApiSubscriptionSnapshot(subscription(overrides), config, "sub_dataapiunit0001")).toEqual({ ok: false, code });
  });
});

describe("subscription statuses", () => {
  it("names the statuses 0142 accepts, and those after which Stripe bills no more", () => {
    expect(DATA_API_SUBSCRIPTION_STATUSES).toHaveLength(8);
    expect(DATA_API_ENDED_STATUSES).toEqual(["canceled", "incomplete_expired"]);
  });

  it("can entitle exactly where the one entitlement rule (lib/data-api/entitlements.ts) says", () => {
    // Billing keeps this list only to refuse a grant from an unknown price; it must not drift from the reader's predicate.
    const listed = /s\.status IN \(([^)]*)\)/.exec(ENTITLING_SUBSCRIPTION)?.[1]?.split(",").map(status => status.trim().replace(/^'|'$/g, ""));
    expect(listed).toEqual([...DATA_API_ENTITLING_STATUSES]);
    expect(DATA_API_ENTITLING_STATUSES).toEqual(["active", "trialing"]);
  });
});
