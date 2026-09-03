import {
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  PRODUCT_OFFER_NON_CLAIMS,
  createEmptyEntitlementSnapshotV1,
  type ProductEnvironment,
  type ProductFlowOpaqueRef,
} from "@cambridge-tcg/product-flow";
import { describe, expect, it } from "vitest";

import {
  PRODUCT_FLOW_RUNTIME_PROVIDER_REGISTRY,
  STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
  STRIPE_SUBSCRIPTION_MAPPING_SCHEMA,
  TELEGRAM_STARS_CALLBACK_SCHEMA,
  TELEGRAM_STARS_MAPPING_SCHEMA,
  InMemoryProductFlowRuntimeStoreV1,
  ProductFlowRuntimeError,
  type ProductFlowRuntimeStoreV1,
  applyEntitlementEventV1,
  evaluateDeliveryAccessV1,
  getEntitlementEventEffectV1,
  normalizeStripeSubscriptionCallbackV1,
  normalizeTelegramStarsCallbackV1,
  parseStripeSubscriptionMappingV1,
  parseTelegramStarsMappingV1,
} from "./index";
import { runProductFlowRuntimeStoreConformanceV1 } from "./testing";

const ref = (label: string): ProductFlowOpaqueRef =>
  `pf_${label.padEnd(16, "x")}` as ProductFlowOpaqueRef;

function stripeMapping(environment: ProductEnvironment = "test") {
  return {
    schema: STRIPE_SUBSCRIPTION_MAPPING_SCHEMA,
    provider: "stripe_subscriptions",
    environment,
    entitlement_ref: ref("entitlement-one"),
    subject_ref: ref("subject-one"),
    offer_id: "prism-signals",
    offer_version: 1,
    price_ref: ref("stripe-price"),
  };
}

function telegramMapping(environment: ProductEnvironment = "test") {
  return {
    schema: TELEGRAM_STARS_MAPPING_SCHEMA,
    provider: "telegram_stars",
    environment,
    entitlement_ref: ref("telegram-entitle"),
    subject_ref: ref("telegram-subject"),
    offer_id: "prism-signals",
    offer_version: 1,
    price_ref: ref("stars-price"),
    invoice_payload_ref: ref("invoice-payload"),
    amount_stars: 250,
  };
}

function stripeCallback(
  kind:
    | "browser_return"
    | "checkout_session_completed"
    | "invoice_paid_initial"
    | "invoice_paid_renewal"
    | "invoice_payment_failed"
    | "subscription_cancel_at_period_end"
    | "subscription_resumed"
    | "subscription_ended"
    | "refund_created",
  id: string,
  occurredAt: string,
) {
  return {
    schema: STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
    kind,
    event_id: ref(id),
    occurred_at: occurredAt,
  };
}

function stripePaid(
  kind:
    | "invoice_paid_initial"
    | "invoice_paid_renewal" = "invoice_paid_initial",
  options: {
    id?: string;
    occurred_at?: string;
    active_until?: string;
    provider_event_ref?: ProductFlowOpaqueRef;
    payment_ref?: ProductFlowOpaqueRef;
  } = {},
) {
  const occurredAt = options.occurred_at ?? "2026-09-02T10:00:00.000Z";
  return {
    ...stripeCallback(kind, options.id ?? kind, occurredAt),
    provider_event_ref:
      options.provider_event_ref ?? ref(`${options.id ?? kind}-provider`),
    payment_ref: options.payment_ref ?? ref(`${options.id ?? kind}-payment`),
    confirmed_at: occurredAt,
    active_until: options.active_until ?? "2026-10-02T10:00:00.000Z",
  };
}

function telegramInvoiceBase(
  kind: "precheckout_approved" | "successful_payment" | "refunded_payment",
  id: string,
  occurredAt: string,
) {
  return {
    schema: TELEGRAM_STARS_CALLBACK_SCHEMA,
    kind,
    event_id: ref(id),
    occurred_at: occurredAt,
    currency: "XTR",
    invoice_payload_ref: telegramMapping().invoice_payload_ref,
    amount_stars: 250,
  };
}

function telegramSuccess(
  options: {
    id?: string;
    occurred_at?: string;
    expires_at?: string;
    first?: boolean;
    payment_ref?: ProductFlowOpaqueRef;
  } = {},
) {
  const id = options.id ?? "telegram-success";
  const occurredAt = options.occurred_at ?? "2026-09-02T10:00:00.000Z";
  return {
    ...telegramInvoiceBase("successful_payment", id, occurredAt),
    provider_event_ref: ref(`${id}-provider`),
    payment_ref: options.payment_ref ?? ref(`${id}-payment`),
    confirmed_at: occurredAt,
    subscription_expiration_at:
      options.expires_at ?? "2026-10-02T10:00:00.000Z",
    is_recurring: true,
    is_first_recurring: options.first ?? true,
  };
}

function offer() {
  return {
    schema: "cambridgetcg.product-offer/1",
    brand: {
      name: "Cambridge TCG",
      product_name: "PRISM Signals",
      byline: "PRISM Signals by Cambridge TCG",
    },
    id: "prism-signals",
    version: 1,
    status: "test",
    environment: "test",
    audience: "Collectors evaluating a closed beta test.",
    delivery: {
      web: { availability: "test", url: "/prism-signals" },
      telegram: {
        availability: "test",
        bot_username: "PrismSignalsBot",
        start_parameter: "prism_beta",
      },
    },
    rails: [
      {
        rail: "stripe_web",
        channel: "web",
        availability: "test",
        price_ref: stripeMapping().price_ref,
      },
      {
        rail: "telegram_stars",
        channel: "telegram",
        availability: "test",
        price_ref: telegramMapping().price_ref,
      },
      { rail: "paypal_web", channel: "web", availability: "off" },
      { rail: "crypto_web", channel: "web", availability: "off" },
    ],
    rights: { purpose: "subscriber_derived_signal", decision: "granted" },
    links: {
      terms: "/prism-signals/terms",
      support: "/support",
      methodology: "/methodology/prism-signals",
    },
    non_claims: [...PRODUCT_OFFER_NON_CLAIMS],
  };
}

describe("provider configuration", () => {
  it("strictly validates Stripe and Telegram mapping contracts", () => {
    expect(parseStripeSubscriptionMappingV1(stripeMapping())).toEqual(
      stripeMapping(),
    );
    expect(parseTelegramStarsMappingV1(telegramMapping())).toEqual(
      telegramMapping(),
    );
    expect(() =>
      parseStripeSubscriptionMappingV1({
        ...stripeMapping(),
        raw_customer_id: "cus_raw",
      }),
    ).toThrow(ProductFlowRuntimeError);
    expect(() =>
      parseTelegramStarsMappingV1({
        ...telegramMapping(),
        amount_stars: 0,
      }),
    ).toThrow(ProductFlowRuntimeError);
    expect(() =>
      parseTelegramStarsMappingV1({
        ...telegramMapping(),
        amount_stars: 10_001,
      }),
    ).toThrow(ProductFlowRuntimeError);
  });

  it("advertises normalizers without claiming connections and disables deferred rails", () => {
    expect(PRODUCT_FLOW_RUNTIME_PROVIDER_REGISTRY).toEqual([
      expect.objectContaining({
        provider: "stripe_subscriptions",
        status: "normalizer_only",
      }),
      expect.objectContaining({
        provider: "telegram_stars",
        status: "normalizer_only",
        deferred_callbacks: ["bot_subscription_updated"],
      }),
      expect.objectContaining({ provider: "paypal", status: "disabled" }),
      expect.objectContaining({ provider: "crypto", status: "disabled" }),
    ]);
    expect(Object.isFrozen(PRODUCT_FLOW_RUNTIME_PROVIDER_REGISTRY)).toBe(true);
    const telegramEntry = PRODUCT_FLOW_RUNTIME_PROVIDER_REGISTRY.find(
      (entry) => entry.provider === "telegram_stars",
    );
    expect(telegramEntry).toBeDefined();
    expect(Object.isFrozen(telegramEntry?.deferred_callbacks)).toBe(true);
  });
});

describe("Stripe subscription normalization and application", () => {
  it("never grants from a browser return or Checkout Session completion", async () => {
    for (const kind of [
      "browser_return",
      "checkout_session_completed",
    ] as const) {
      const store = new InMemoryProductFlowRuntimeStoreV1();
      const event = normalizeStripeSubscriptionCallbackV1(
        stripeMapping(),
        stripeCallback(kind, kind, "2026-09-02T09:00:00.000Z"),
      );
      expect(event.type).toBe("browser_return");
      const result = await applyEntitlementEventV1(store, event);
      expect(result.effect).toBe("observation_only");
      expect(result.snapshot).toMatchObject({
        status: "inactive",
        reason: "no_confirmed_payment",
        active_until: null,
      });
    }
  });

  it("provisions only from paid invoice evidence and extends on renewal", async () => {
    const store = new InMemoryProductFlowRuntimeStoreV1();
    const first = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      stripePaid(),
    );
    const active = await applyEntitlementEventV1(store, first);
    expect(active.snapshot).toMatchObject({
      status: "active",
      reason: "payment_confirmed",
      active_until: "2026-10-02T10:00:00.000Z",
    });

    const renewal = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      stripePaid("invoice_paid_renewal", {
        id: "stripe-renewal",
        occurred_at: "2026-09-25T10:00:00.000Z",
        active_until: "2026-11-02T10:00:00.000Z",
      }),
    );
    const renewed = await applyEntitlementEventV1(store, renewal);
    expect(renewed.snapshot).toMatchObject({
      status: "active",
      reason: "renewal_confirmed",
      active_until: "2026-11-02T10:00:00.000Z",
    });
  });

  it("does not erase paid-through time after invoice.payment_failed", async () => {
    const store = new InMemoryProductFlowRuntimeStoreV1();
    const initial = await applyEntitlementEventV1(
      store,
      normalizeStripeSubscriptionCallbackV1(stripeMapping(), stripePaid()),
    );
    const failedAt = "2026-09-20T10:00:00.000Z";
    const failed = normalizeStripeSubscriptionCallbackV1(stripeMapping(), {
      ...stripeCallback("invoice_payment_failed", "failed", failedAt),
      provider_event_ref: ref("failed-provider"),
      payment_ref: ref("failed-payment"),
      failed_at: failedAt,
    });
    const result = await applyEntitlementEventV1(store, failed);
    expect(result.effect).toBe("observation_only");
    expect(result.snapshot.status).toBe("active");
    expect(result.snapshot.active_until).toBe(initial.snapshot.active_until);
  });

  it("keeps cancelled access to period end and denies it at expiry", async () => {
    const store = new InMemoryProductFlowRuntimeStoreV1();
    await applyEntitlementEventV1(
      store,
      normalizeStripeSubscriptionCallbackV1(stripeMapping(), stripePaid()),
    );
    const cancelledAt = "2026-09-20T10:00:00.000Z";
    const cancellation = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      {
        ...stripeCallback(
          "subscription_cancel_at_period_end",
          "cancel",
          cancelledAt,
        ),
        provider_event_ref: ref("cancel-provider"),
        subscription_ref: ref("subscription"),
        status_at: cancelledAt,
      },
    );
    const cancelled = await applyEntitlementEventV1(store, cancellation);
    expect(cancelled.snapshot.cancel_at_period_end).toBe(true);
    expect(
      evaluateDeliveryAccessV1(offer(), cancelled.snapshot, {
        environment: "test",
        evaluated_at: "2026-10-02T09:59:59.999Z",
      }),
    ).toMatchObject({
      web: { allowed: true },
      telegram: { allowed: true },
    });
    expect(
      evaluateDeliveryAccessV1(offer(), cancelled.snapshot, {
        environment: "test",
        evaluated_at: "2026-10-02T10:00:00.000Z",
      }),
    ).toMatchObject({
      web: { allowed: false, reason: "expired" },
      telegram: { allowed: false, reason: "expired" },
    });
  });

  it("normalizes verified resume and clears only an active scheduled cancellation", async () => {
    const store = new InMemoryProductFlowRuntimeStoreV1();
    await applyEntitlementEventV1(
      store,
      normalizeStripeSubscriptionCallbackV1(stripeMapping(), stripePaid()),
    );
    const cancelledAt = "2026-09-20T10:00:00.000Z";
    await applyEntitlementEventV1(
      store,
      normalizeStripeSubscriptionCallbackV1(stripeMapping(), {
        ...stripeCallback(
          "subscription_cancel_at_period_end",
          "resume-test-cancel",
          cancelledAt,
        ),
        provider_event_ref: ref("resume-test-cancel-provider"),
        subscription_ref: ref("resume-test-subscription"),
        status_at: cancelledAt,
      }),
    );
    const resumedAt = "2026-09-20T10:00:00.001Z";
    const resumedEvent = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      {
        ...stripeCallback(
          "subscription_resumed",
          "subscription-resumed",
          resumedAt,
        ),
        provider_event_ref: ref("subscription-resumed-provider"),
        subscription_ref: ref("resume-test-subscription"),
        status_at: resumedAt,
      },
    );
    expect(resumedEvent.type).toBe("subscription_resumed");
    const resumed = await applyEntitlementEventV1(store, resumedEvent);
    expect(resumed.snapshot).toMatchObject({
      status: "active",
      cancel_at_period_end: false,
    });
  });

  it("rejects partial refunds and correlates a full reversal to its payment", async () => {
    const paidCallback = stripePaid();
    expect(() =>
      normalizeStripeSubscriptionCallbackV1(stripeMapping(), {
        ...stripeCallback(
          "refund_created",
          "partial-refund",
          "2026-09-20T10:00:00.000Z",
        ),
        provider_event_ref: ref("partial-provider"),
        refund_extent: "partial",
        payment_ref: paidCallback.payment_ref,
        refunded_at: "2026-09-20T10:00:00.000Z",
      }),
    ).toThrow(/partial Stripe refund/);

    const store = new InMemoryProductFlowRuntimeStoreV1();
    await applyEntitlementEventV1(
      store,
      normalizeStripeSubscriptionCallbackV1(stripeMapping(), paidCallback),
    );
    const refund = normalizeStripeSubscriptionCallbackV1(stripeMapping(), {
      ...stripeCallback(
        "refund_created",
        "full-refund",
        "2026-09-20T10:00:00.000Z",
      ),
      provider_event_ref: ref("full-refund-provider"),
      refund_extent: "full",
      payment_ref: paidCallback.payment_ref,
      refunded_at: "2026-09-20T10:00:00.000Z",
    });
    const ended = await applyEntitlementEventV1(store, refund);
    expect(ended.snapshot).toMatchObject({
      status: "ended",
      reason: "refunded",
      active_until: null,
    });
  });

  it("fails closed for an uncorrelated full reversal and ends on subscription end", async () => {
    const unrelatedStore = new InMemoryProductFlowRuntimeStoreV1();
    const originalGrant = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      stripePaid(),
    );
    await applyEntitlementEventV1(unrelatedStore, originalGrant);
    const refundedAt = "2026-09-20T10:00:00.000Z";
    const unrelated = normalizeStripeSubscriptionCallbackV1(stripeMapping(), {
      ...stripeCallback("refund_created", "unrelated-refund", refundedAt),
      provider_event_ref: ref("unrelated-provider"),
      refund_extent: "full",
      payment_ref: ref("some-other-payment"),
      refunded_at: refundedAt,
    });
    await expect(
      applyEntitlementEventV1(unrelatedStore, unrelated),
    ).rejects.toMatchObject({
      code: "transition_rejected",
    });
    const preserved = await applyEntitlementEventV1(
      unrelatedStore,
      originalGrant,
    );
    expect(preserved).toMatchObject({
      disposition: "duplicate",
      snapshot: { status: "active" },
    });

    const endedStore = new InMemoryProductFlowRuntimeStoreV1();
    await applyEntitlementEventV1(
      endedStore,
      normalizeStripeSubscriptionCallbackV1(stripeMapping(), stripePaid()),
    );
    const endedAt = "2026-09-21T10:00:00.000Z";
    const endedEvent = normalizeStripeSubscriptionCallbackV1(stripeMapping(), {
      ...stripeCallback("subscription_ended", "subscription-ended", endedAt),
      provider_event_ref: ref("ended-provider"),
      subscription_ref: ref("subscription"),
      status_at: endedAt,
    });
    const ended = await applyEntitlementEventV1(endedStore, endedEvent);
    expect(ended.snapshot).toMatchObject({
      status: "ended",
      reason: "subscription_ended",
    });
  });
});

describe("Telegram Stars normalization and application", () => {
  it("requires exact XTR invoice payload and amount at pre-checkout without granting", async () => {
    const valid = telegramInvoiceBase(
      "precheckout_approved",
      "precheckout",
      "2026-09-02T09:00:00.000Z",
    );
    const event = normalizeTelegramStarsCallbackV1(telegramMapping(), valid);
    expect(event.type).toBe("precheckout_approved");
    const result = await applyEntitlementEventV1(
      new InMemoryProductFlowRuntimeStoreV1(),
      event,
    );
    expect(result.effect).toBe("observation_only");
    expect(result.snapshot.status).toBe("inactive");
    expect(result.snapshot.active_until).toBeNull();

    for (const mismatch of [
      { currency: "GBP" },
      { amount_stars: 249 },
      { amount_stars: 10_001 },
      { invoice_payload_ref: ref("wrong-payload") },
    ]) {
      expect(() =>
        normalizeTelegramStarsCallbackV1(telegramMapping(), {
          ...valid,
          ...mismatch,
        }),
      ).toThrow(ProductFlowRuntimeError);
    }
  });

  it("maps first recurring success to confirmation and later success to renewal", async () => {
    const store = new InMemoryProductFlowRuntimeStoreV1();
    const first = normalizeTelegramStarsCallbackV1(
      telegramMapping(),
      telegramSuccess(),
    );
    expect(first.type).toBe("payment_confirmed");
    await applyEntitlementEventV1(store, first);

    const renewal = normalizeTelegramStarsCallbackV1(
      telegramMapping(),
      telegramSuccess({
        id: "telegram-renewal",
        occurred_at: "2026-09-25T10:00:00.000Z",
        expires_at: "2026-11-02T10:00:00.000Z",
        first: false,
      }),
    );
    expect(renewal.type).toBe("renewal_confirmed");
    const renewed = await applyEntitlementEventV1(store, renewal);
    expect(renewed.snapshot.active_until).toBe("2026-11-02T10:00:00.000Z");

    expect(() =>
      normalizeTelegramStarsCallbackV1(telegramMapping(), {
        ...telegramSuccess({ id: "one-time" }),
        is_recurring: false,
      }),
    ).toThrow(/one-time Stars payment/);
  });

  it("binds a refunded payment to the original Telegram charge mapping", async () => {
    const store = new InMemoryProductFlowRuntimeStoreV1();
    const success = telegramSuccess();
    await applyEntitlementEventV1(
      store,
      normalizeTelegramStarsCallbackV1(telegramMapping(), success),
    );
    const refundedAt = "2026-09-20T10:00:00.000Z";
    const refund = normalizeTelegramStarsCallbackV1(telegramMapping(), {
      ...telegramInvoiceBase("refunded_payment", "stars-refund", refundedAt),
      provider_event_ref: ref("stars-refund-provider"),
      original_payment_ref: success.payment_ref,
      refunded_at: refundedAt,
    });
    const result = await applyEntitlementEventV1(store, refund);
    expect(result.snapshot).toMatchObject({
      status: "ended",
      reason: "refunded",
    });
  });
});

describe("atomic runtime and access behavior", () => {
  it("passes the reusable store conformance suite", async () => {
    await runProductFlowRuntimeStoreConformanceV1(
      () => new InMemoryProductFlowRuntimeStoreV1(),
    );
  });

  it("rejects a duplicate event whose entitlement projection is missing", async () => {
    const event = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      stripePaid(),
    );
    const empty = createEmptyEntitlementSnapshotV1({
      environment: event.environment,
      entitlement_ref: event.entitlement_ref,
      subject_ref: event.subject_ref,
      offer_id: event.offer_id,
      offer_version: event.offer_version,
    });
    const inconsistentStore: ProductFlowRuntimeStoreV1 = {
      async transaction(work) {
        return work({
          async lockEntitlement() {
            return empty;
          },
          async appendUniqueEvent() {
            return {
              disposition: "duplicate",
              matched_by: ["event_id", "provider_event_ref", "grant_identity"],
              existing_event: event,
            };
          },
          async persistEntitlement() {
            throw new Error("duplicate path must not persist");
          },
        });
      },
    };
    await expect(
      applyEntitlementEventV1(inconsistentStore, event),
    ).rejects.toMatchObject({
      name: "ProductFlowRuntimeError",
      code: "store_invariant",
      path: "$snapshot.processed_event_ids",
    });
  });

  it("serializes concurrent same-entitlement applies in transaction order", async () => {
    const store = new InMemoryProductFlowRuntimeStoreV1();
    const initial = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      stripePaid(),
    );
    const renewal = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      stripePaid("invoice_paid_renewal", {
        id: "concurrent-renewal",
        occurred_at: "2026-09-25T10:00:00.000Z",
        active_until: "2026-11-02T10:00:00.000Z",
      }),
    );
    const [first, second] = await Promise.all([
      applyEntitlementEventV1(store, initial),
      applyEntitlementEventV1(store, renewal),
    ]);
    expect(first.snapshot.reason).toBe("payment_confirmed");
    expect(second.snapshot.reason).toBe("renewal_confirmed");
    expect(store.inspectStateV1().snapshots[0]?.active_until).toBe(
      "2026-11-02T10:00:00.000Z",
    );
  });

  it("rolls back every late observation-only callback without poisoning access", async () => {
    const mapping = stripeMapping();
    const grant = normalizeStripeSubscriptionCallbackV1(mapping, stripePaid());
    const lateAt = "2026-09-02T09:00:00.000Z";
    const telegramScope = {
      ...telegramMapping(),
      entitlement_ref: mapping.entitlement_ref,
      subject_ref: mapping.subject_ref,
    };
    const observations = [
      {
        schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
        event_id: ref("late-checkout"),
        environment: "test",
        type: "checkout_started",
        occurred_at: lateAt,
        entitlement_ref: mapping.entitlement_ref,
        subject_ref: mapping.subject_ref,
        offer_id: mapping.offer_id,
        offer_version: mapping.offer_version,
        channel: "web",
        rail: "stripe_web",
        price_ref: mapping.price_ref,
      },
      normalizeStripeSubscriptionCallbackV1(
        mapping,
        stripeCallback("browser_return", "late-browser-two", lateAt),
      ),
      normalizeTelegramStarsCallbackV1(
        telegramScope,
        telegramInvoiceBase("precheckout_approved", "late-precheckout", lateAt),
      ),
      normalizeStripeSubscriptionCallbackV1(mapping, {
        ...stripeCallback("invoice_payment_failed", "late-failure", lateAt),
        provider_event_ref: ref("late-failure-provider"),
        payment_ref: ref("late-failure-payment"),
        failed_at: lateAt,
      }),
    ];

    for (const observation of observations) {
      expect(getEntitlementEventEffectV1(observation)).toBe("observation_only");
      const store = new InMemoryProductFlowRuntimeStoreV1();
      await applyEntitlementEventV1(store, grant);
      await expect(
        applyEntitlementEventV1(store, observation),
      ).rejects.toMatchObject({ code: "transition_rejected" });
      const preserved = await applyEntitlementEventV1(store, grant);
      expect(preserved.snapshot.status).toBe("active");
      expect(store.inspectStateV1().events).toHaveLength(1);
    }
  });

  it("scopes event, provider, and entitlement uniqueness by environment", async () => {
    const store = new InMemoryProductFlowRuntimeStoreV1();
    const callback = stripePaid();
    const testResult = await applyEntitlementEventV1(
      store,
      normalizeStripeSubscriptionCallbackV1(stripeMapping("test"), callback),
    );
    const productionResult = await applyEntitlementEventV1(
      store,
      normalizeStripeSubscriptionCallbackV1(
        stripeMapping("production"),
        callback,
      ),
    );
    expect(testResult.disposition).toBe("applied");
    expect(productionResult.disposition).toBe("applied");
    expect(store.inspectStateV1()).toMatchObject({
      events: [{ environment: "production" }, { environment: "test" }],
      snapshots: [{ environment: "production" }, { environment: "test" }],
    });
  });

  it("rolls back out-of-order observations and persists internal revocation", async () => {
    const outOfOrderStore = new InMemoryProductFlowRuntimeStoreV1();
    const originalGrant = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      stripePaid(),
    );
    await applyEntitlementEventV1(outOfOrderStore, originalGrant);
    const oldReturn = normalizeStripeSubscriptionCallbackV1(
      stripeMapping(),
      stripeCallback(
        "browser_return",
        "old-return",
        "2026-09-02T09:00:00.000Z",
      ),
    );
    await expect(
      applyEntitlementEventV1(outOfOrderStore, oldReturn),
    ).rejects.toMatchObject({
      code: "transition_rejected",
    });
    const preserved = await applyEntitlementEventV1(
      outOfOrderStore,
      originalGrant,
    );
    expect(preserved.snapshot.status).toBe("active");

    const revokeStore = new InMemoryProductFlowRuntimeStoreV1();
    await applyEntitlementEventV1(
      revokeStore,
      normalizeStripeSubscriptionCallbackV1(stripeMapping(), stripePaid()),
    );
    const revoked = await applyEntitlementEventV1(revokeStore, {
      schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
      event_id: ref("internal-revoke"),
      environment: "test",
      type: "revoked",
      occurred_at: "2026-09-20T10:00:00.000Z",
      entitlement_ref: stripeMapping().entitlement_ref,
      subject_ref: stripeMapping().subject_ref,
      offer_id: "prism-signals",
      offer_version: 1,
    });
    expect(revoked.snapshot).toMatchObject({
      status: "ended",
      reason: "revoked",
    });
  });
});
