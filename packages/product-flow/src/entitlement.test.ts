import { describe, expect, it } from "vitest";

import {
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  PRODUCT_ENTITLEMENT_SCHEMA,
  PRODUCT_FLOW_LIMITS,
  PRODUCT_OFFER_NON_CLAIMS,
  ProductFlowContractError,
  createEmptyEntitlementSnapshotV1,
  evaluateAccessV1,
  parseEntitlementEventV1,
  parseEntitlementSnapshotV1,
  reduceEntitlementEventV1,
  reduceEntitlementEventsV1,
} from "./index";

const ref = (label: string) => `pf_${label.padEnd(16, "x")}`;
const ENTITLEMENT_REF = ref("entitlement-one");
const SUBJECT_REF = ref("subject-one");
const TEST_PRICE = ref("stripe-test-price");
const STARS_PRICE = ref("stars-test-price");
const LIVE_PRICE = ref("stripe-live-price");

function seed(environment: "test" | "production" = "test") {
  return createEmptyEntitlementSnapshotV1({
    environment,
    entitlement_ref: ENTITLEMENT_REF,
    subject_ref: SUBJECT_REF,
    offer_id: "example-signals",
    offer_version: 1,
  });
}

function baseEvent(
  type: string,
  id: string,
  occurredAt: string,
  environment: "test" | "production" = "test",
) {
  return {
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    event_id: ref(id),
    environment,
    type,
    occurred_at: occurredAt,
    entitlement_ref: ENTITLEMENT_REF,
    subject_ref: SUBJECT_REF,
    offer_id: "example-signals",
    offer_version: 1,
  };
}

function confirmationEvent(options: {
  type?: "payment_confirmed" | "renewal_confirmed";
  id?: string;
  occurredAt?: string;
  confirmedAt?: string;
  activeUntil?: string;
  environment?: "test" | "production";
  channel?: "web" | "telegram";
  rail?: "stripe_web" | "telegram_stars";
  priceRef?: string;
}) {
  const type = options.type ?? "payment_confirmed";
  const environment = options.environment ?? "test";
  const occurredAt = options.occurredAt ?? "2026-09-02T10:00:00.000Z";
  const channel = options.channel ?? "web";
  const rail = options.rail ?? "stripe_web";
  const priceRef = options.priceRef ?? TEST_PRICE;
  const activeUntil = options.activeUntil ?? "2026-10-02T10:00:00.000Z";
  return {
    ...baseEvent(type, options.id ?? type, occurredAt, environment),
    channel,
    rail,
    price_ref: priceRef,
    active_until: activeUntil,
    evidence: {
      kind: "provider_confirmation",
      source: "provider_webhook",
      environment,
      entitlement_ref: ENTITLEMENT_REF,
      subject_ref: SUBJECT_REF,
      offer_id: "example-signals",
      offer_version: 1,
      channel,
      rail,
      price_ref: priceRef,
      provider_event_ref: ref(`${options.id ?? type}-provider`),
      payment_ref: ref(`${options.id ?? type}-payment`),
      confirmed_at: options.confirmedAt ?? occurredAt,
      active_until: activeUntil,
    },
  };
}

function failedEvent(
  options: {
    id?: string;
    occurredAt?: string;
    environment?: "test" | "production";
    channel?: "web" | "telegram";
    rail?: "stripe_web" | "telegram_stars";
    priceRef?: string;
  } = {},
) {
  const environment = options.environment ?? "test";
  const occurredAt = options.occurredAt ?? "2026-09-15T10:00:00.000Z";
  const channel = options.channel ?? "web";
  const rail = options.rail ?? "stripe_web";
  const priceRef = options.priceRef ?? TEST_PRICE;
  return {
    ...baseEvent(
      "payment_failed",
      options.id ?? "payment-failed",
      occurredAt,
      environment,
    ),
    channel,
    rail,
    price_ref: priceRef,
    evidence: {
      kind: "provider_failure",
      source: "provider_webhook",
      environment,
      entitlement_ref: ENTITLEMENT_REF,
      subject_ref: SUBJECT_REF,
      offer_id: "example-signals",
      offer_version: 1,
      channel,
      rail,
      price_ref: priceRef,
      provider_event_ref: ref(`${options.id ?? "failed"}-provider`),
      payment_ref: ref(`${options.id ?? "failed"}-payment`),
      failed_at: occurredAt,
    },
  };
}

function providerStatusEvent(
  type: "cancel_at_period_end" | "subscription_ended",
  id: string,
  occurredAt: string,
) {
  return {
    ...baseEvent(type, id, occurredAt),
    channel: "web",
    rail: "stripe_web",
    price_ref: TEST_PRICE,
    evidence: {
      kind: "provider_status",
      source: "provider_webhook",
      environment: "test",
      entitlement_ref: ENTITLEMENT_REF,
      subject_ref: SUBJECT_REF,
      offer_id: "example-signals",
      offer_version: 1,
      channel: "web",
      rail: "stripe_web",
      price_ref: TEST_PRICE,
      provider_event_ref: ref(`${id}-provider`),
      payment_or_subscription_ref: ref(`${id}-subscription`),
      status_at: occurredAt,
    },
  };
}

function refundEvent(
  id = "refunded",
  occurredAt = "2026-09-20T10:00:00.000Z",
  paymentRef = ref("payment_confirmed-payment"),
) {
  return {
    ...baseEvent("refunded", id, occurredAt),
    channel: "web",
    rail: "stripe_web",
    price_ref: TEST_PRICE,
    evidence: {
      kind: "provider_reversal",
      source: "provider_api",
      environment: "test",
      entitlement_ref: ENTITLEMENT_REF,
      subject_ref: SUBJECT_REF,
      offer_id: "example-signals",
      offer_version: 1,
      channel: "web",
      rail: "stripe_web",
      price_ref: TEST_PRICE,
      provider_event_ref: ref(`${id}-provider`),
      payment_ref: paymentRef,
      confirmed_at: occurredAt,
    },
  };
}

function testOffer() {
  return {
    schema: "cambridgetcg.product-offer/1",
    brand: {
      name: "Cambridge TCG",
      product_name: "Example Signals",
      byline: "Example Signals by Cambridge TCG",
    },
    id: "example-signals",
    version: 1,
    status: "test",
    environment: "test",
    audience: "Collectors evaluating a clearly labelled test.",
    delivery: {
      web: { availability: "test", url: "/example-signals" },
      telegram: {
        availability: "test",
        bot_username: "ExampleSignalsBot",
        start_parameter: "example_test",
      },
    },
    rails: [
      {
        rail: "stripe_web",
        channel: "web",
        availability: "test",
        price_ref: TEST_PRICE,
      },
      {
        rail: "telegram_stars",
        channel: "telegram",
        availability: "test",
        price_ref: STARS_PRICE,
      },
      { rail: "paypal_web", channel: "web", availability: "off" },
      { rail: "crypto_web", channel: "web", availability: "off" },
    ],
    rights: { purpose: "subscriber_derived_signal", decision: "granted" },
    links: {
      terms: "/example-signals/terms",
      support: "/example-signals/support",
      methodology: "/methodology/example-signals",
    },
    non_claims: [...PRODUCT_OFFER_NON_CLAIMS],
  };
}

function liveOffer() {
  const offer = testOffer();
  offer.status = "live";
  offer.environment = "production";
  offer.delivery.web.availability = "live";
  offer.delivery.telegram.availability = "live";
  offer.rails = [
    {
      rail: "stripe_web",
      channel: "web",
      availability: "live",
      price_ref: LIVE_PRICE,
    },
    { rail: "telegram_stars", channel: "telegram", availability: "off" },
    { rail: "paypal_web", channel: "web", availability: "off" },
    { rail: "crypto_web", channel: "web", availability: "off" },
  ];
  return offer;
}

describe("entitlement event parsing", () => {
  it("requires bound provider evidence for every positive confirmation", () => {
    const missing = confirmationEvent({});
    delete (missing as { evidence?: unknown }).evidence;
    expect(() => parseEntitlementEventV1(missing)).toThrow(
      ProductFlowContractError,
    );

    const mismatched = confirmationEvent({});
    mismatched.evidence.environment = "production";
    expect(() => parseEntitlementEventV1(mismatched)).toThrow(
      ProductFlowContractError,
    );

    const browserClaim = {
      ...baseEvent(
        "browser_return",
        "return-with-evidence",
        "2026-09-02T10:00:00.000Z",
      ),
      channel: "web",
      rail: "stripe_web",
      price_ref: TEST_PRICE,
      evidence: confirmationEvent({}).evidence,
    };
    expect(() => parseEntitlementEventV1(browserClaim)).toThrow(
      ProductFlowContractError,
    );
  });

  it("binds confirmation to offer scope and the exact granted period", () => {
    const wrongOffer = confirmationEvent({});
    wrongOffer.offer_id = "another-product";
    expect(() => parseEntitlementEventV1(wrongOffer)).toThrow(
      ProductFlowContractError,
    );

    const enlargedWrapper = confirmationEvent({});
    enlargedWrapper.active_until = "2027-10-02T10:00:00.000Z";
    expect(() => parseEntitlementEventV1(enlargedWrapper)).toThrow(
      ProductFlowContractError,
    );

    const mismatches = [
      ["entitlement_ref", ref("another-entitlement")],
      ["subject_ref", ref("another-subject")],
      ["offer_id", "another-product"],
      ["offer_version", 2],
      ["active_until", "2027-10-02T10:00:00.000Z"],
    ] as const;
    for (const [field, value] of mismatches) {
      const mismatchedEvidence = confirmationEvent({});
      Object.assign(mismatchedEvidence.evidence, { [field]: value });
      expect(() => parseEntitlementEventV1(mismatchedEvidence), field).toThrow(
        ProductFlowContractError,
      );
    }
  });

  it("requires provider-bound reversal evidence for refunds", () => {
    const missing = baseEvent(
      "refunded",
      "refund-no-proof",
      "2026-09-20T10:00:00.000Z",
    );
    expect(() => parseEntitlementEventV1(missing)).toThrow(
      ProductFlowContractError,
    );

    const mismatched = refundEvent();
    mismatched.evidence.price_ref = STARS_PRICE;
    expect(() => parseEntitlementEventV1(mismatched)).toThrow(
      ProductFlowContractError,
    );
    expect(parseEntitlementEventV1(refundEvent()).type).toBe("refunded");
  });

  it("requires provider-bound status evidence for cancellation and end", () => {
    for (const type of [
      "cancel_at_period_end",
      "subscription_ended",
    ] as const) {
      expect(() =>
        parseEntitlementEventV1(
          baseEvent(type, `${type}-bare`, "2026-09-20T10:00:00.000Z"),
        ),
      ).toThrow(ProductFlowContractError);
      expect(
        parseEntitlementEventV1(
          providerStatusEvent(
            type,
            `${type}-bound`,
            "2026-09-20T10:00:00.000Z",
          ),
        ).type,
      ).toBe(type);
    }
  });

  it("allows Telegram pre-checkout only on Telegram Stars", () => {
    const valid = {
      ...baseEvent(
        "precheckout_approved",
        "stars-precheckout",
        "2026-09-02T09:00:00.000Z",
      ),
      channel: "telegram",
      rail: "telegram_stars",
      price_ref: STARS_PRICE,
    };
    expect(parseEntitlementEventV1(valid).type).toBe("precheckout_approved");

    expect(() =>
      parseEntitlementEventV1({ ...valid, rail: "stripe_web" }),
    ).toThrow(ProductFlowContractError);
    expect(() => parseEntitlementEventV1({ ...valid, channel: "web" })).toThrow(
      ProductFlowContractError,
    );
  });

  it("rejects raw PII/provider-shaped references and unknown fields", () => {
    const event = confirmationEvent({});
    event.evidence.payment_ref = "customer@example.com";
    expect(() => parseEntitlementEventV1(event)).toThrow(
      ProductFlowContractError,
    );

    const unknown = { ...confirmationEvent({}), raw_payload: "secret" };
    expect(() => parseEntitlementEventV1(unknown)).toThrow(
      ProductFlowContractError,
    );
  });
});

describe("entitlement reduction", () => {
  it("activates only on payment_confirmed or renewal_confirmed", () => {
    const untrusted = [
      {
        ...baseEvent(
          "checkout_started",
          "checkout",
          "2026-09-02T09:00:00.000Z",
        ),
        channel: "web",
        rail: "stripe_web",
        price_ref: TEST_PRICE,
      },
      {
        ...baseEvent("browser_return", "return", "2026-09-02T09:01:00.000Z"),
        channel: "web",
        rail: "stripe_web",
        price_ref: TEST_PRICE,
      },
      {
        ...baseEvent(
          "precheckout_approved",
          "precheckout",
          "2026-09-02T09:02:00.000Z",
        ),
        channel: "telegram",
        rail: "telegram_stars",
        price_ref: STARS_PRICE,
      },
      {
        ...baseEvent("channel_linked", "linked", "2026-09-02T09:03:00.000Z"),
        channel: "telegram",
      },
      failedEvent({ id: "failed", occurredAt: "2026-09-02T09:04:00.000Z" }),
    ];

    const beforePayment = reduceEntitlementEventsV1(seed(), untrusted);
    expect(beforePayment.status).toBe("inactive");
    expect(beforePayment.active_until).toBeNull();

    const active = reduceEntitlementEventV1(
      beforePayment,
      confirmationEvent({ occurredAt: "2026-09-02T10:00:00.000Z" }),
    );
    expect(active.status).toBe("active");
    expect(active.reason).toBe("payment_confirmed");
    expect(active.processed_provider_event_refs).toEqual([
      ...beforePayment.processed_provider_event_refs,
      confirmationEvent({}).evidence.provider_event_ref,
    ]);
    expect(active.confirmed_payment_refs).toEqual([
      confirmationEvent({}).evidence.payment_ref,
    ]);
    expect(Object.isFrozen(active)).toBe(true);
    expect(Object.isFrozen(active.processed_event_ids)).toBe(true);
  });

  it("extends access only on a later confirmed renewal", () => {
    const active = reduceEntitlementEventV1(seed(), confirmationEvent({}));
    const renewed = reduceEntitlementEventV1(
      active,
      confirmationEvent({
        type: "renewal_confirmed",
        id: "renewal-one",
        occurredAt: "2026-09-25T10:00:00.000Z",
        activeUntil: "2026-11-02T10:00:00.000Z",
      }),
    );
    expect(renewed.reason).toBe("renewal_confirmed");
    expect(renewed.active_until).toBe("2026-11-02T10:00:00.000Z");

    const nonExtending = reduceEntitlementEventV1(
      renewed,
      confirmationEvent({
        type: "renewal_confirmed",
        id: "renewal-short",
        occurredAt: "2026-10-01T10:00:00.000Z",
        activeUntil: "2026-10-15T10:00:00.000Z",
      }),
    );
    expect(nonExtending.status).toBe("blocked");
  });

  it("a failed renewal preserves only the already-paid active_until", () => {
    const active = reduceEntitlementEventV1(seed(), confirmationEvent({}));
    const afterFailure = reduceEntitlementEventV1(
      active,
      failedEvent({ occurredAt: "2026-09-20T10:00:00.000Z" }),
    );
    expect(afterFailure.status).toBe("active");
    expect(afterFailure.active_until).toBe(active.active_until);
    expect(afterFailure.reason).toBe("payment_confirmed");

    expect(
      evaluateAccessV1(testOffer(), afterFailure, {
        environment: "test",
        channel: "web",
        evaluated_at: "2026-10-02T10:00:00.000Z",
      }),
    ).toMatchObject({ allowed: false, reason: "expired" });
  });

  it("cancel_at_period_end keeps access before, but never at or after, active_until", () => {
    const active = reduceEntitlementEventV1(seed(), confirmationEvent({}));
    const cancelled = reduceEntitlementEventV1(
      active,
      providerStatusEvent(
        "cancel_at_period_end",
        "cancelled",
        "2026-09-10T10:00:00.000Z",
      ),
    );
    expect(cancelled.status).toBe("active");
    expect(cancelled.cancel_at_period_end).toBe(true);
    expect(cancelled.active_until).toBe(active.active_until);

    expect(
      evaluateAccessV1(testOffer(), cancelled, {
        environment: "test",
        channel: "telegram",
        evaluated_at: "2026-10-02T09:59:59.999Z",
      }),
    ).toMatchObject({ allowed: true, reason: "active" });
    expect(
      evaluateAccessV1(testOffer(), cancelled, {
        environment: "test",
        channel: "telegram",
        evaluated_at: "2026-10-02T10:00:00.000Z",
      }),
    ).toMatchObject({ allowed: false, reason: "expired" });
  });

  it("subscription end, confirmed refund, and internal revoke end access", () => {
    const cases = [
      providerStatusEvent(
        "subscription_ended",
        "ended",
        "2026-09-20T10:00:00.000Z",
      ),
      refundEvent(),
      baseEvent("revoked", "revoked", "2026-09-20T10:00:00.000Z"),
    ];
    for (const event of cases) {
      const ended = reduceEntitlementEventV1(
        reduceEntitlementEventV1(seed(), confirmationEvent({})),
        event,
      );
      expect(ended.status).toBe("ended");
      expect(ended.active_until).toBeNull();
      expect(
        evaluateAccessV1(testOffer(), ended, {
          environment: "test",
          channel: "web",
          evaluated_at: "2026-09-21T10:00:00.000Z",
        }).allowed,
      ).toBe(false);
    }
  });

  it("ends access only when a refund correlates to the current confirmed payment", () => {
    const payment = confirmationEvent({ id: "payment-a" });
    const active = reduceEntitlementEventV1(seed(), payment);

    const unrelatedRefund = reduceEntitlementEventV1(
      active,
      refundEvent("refund-b", "2026-09-20T10:00:00.000Z", ref("payment-b")),
    );
    expect(unrelatedRefund).toMatchObject({
      status: "blocked",
      reason: "invalid_transition",
    });
    expect(unrelatedRefund.reason).not.toBe("refunded");
    expect(unrelatedRefund.confirmed_payment_refs).toEqual(
      active.confirmed_payment_refs,
    );
    expect(unrelatedRefund.processed_provider_event_refs).toEqual(
      active.processed_provider_event_refs,
    );

    const refund = refundEvent(
      "refund-a",
      "2026-09-20T10:00:00.000Z",
      payment.evidence.payment_ref,
    );
    const correlatedRefund = reduceEntitlementEventV1(active, refund);
    expect(correlatedRefund).toMatchObject({
      status: "ended",
      reason: "refunded",
      active_until: null,
    });
    expect(correlatedRefund.processed_provider_event_refs).toContain(
      refund.evidence.provider_event_ref,
    );
  });

  it("does not let an older-period refund erase a later renewal", () => {
    const paymentA = confirmationEvent({ id: "period-a" });
    const active = reduceEntitlementEventV1(seed(), paymentA);
    const paymentB = confirmationEvent({
      type: "renewal_confirmed",
      id: "period-b",
      occurredAt: "2026-09-25T10:00:00.000Z",
      activeUntil: "2026-11-02T10:00:00.000Z",
    });
    const renewed = reduceEntitlementEventV1(active, paymentB);

    const oldPeriodRefund = reduceEntitlementEventV1(
      renewed,
      refundEvent(
        "refund-period-a",
        "2026-10-01T10:00:00.000Z",
        paymentA.evidence.payment_ref,
      ),
    );
    expect(oldPeriodRefund).toMatchObject({
      status: "blocked",
      reason: "invalid_transition",
    });

    const currentPeriodRefund = reduceEntitlementEventV1(
      renewed,
      refundEvent(
        "refund-period-b",
        "2026-10-01T10:00:00.000Z",
        paymentB.evidence.payment_ref,
      ),
    );
    expect(currentPeriodRefund).toMatchObject({
      status: "ended",
      reason: "refunded",
      active_until: null,
    });
  });

  it("blocks environment/scope crossings without copying them into the snapshot", () => {
    const crossed = reduceEntitlementEventV1(seed("test"), {
      ...baseEvent(
        "channel_linked",
        "production-link",
        "2026-09-02T09:00:00.000Z",
        "production",
      ),
      channel: "telegram",
    });
    expect(crossed).toMatchObject({
      environment: "test",
      status: "blocked",
      reason: "scope_mismatch",
      last_event_id: null,
    });
  });

  it("fails closed on out-of-order events", () => {
    const active = reduceEntitlementEventV1(seed(), confirmationEvent({}));
    const outOfOrder = reduceEntitlementEventV1(active, {
      ...baseEvent(
        "channel_linked",
        "late-old-event",
        "2026-09-02T09:00:00.000Z",
      ),
      channel: "telegram",
    });
    expect(outOfOrder).toMatchObject({
      status: "blocked",
      reason: "out_of_order",
    });
    expect(
      evaluateAccessV1(testOffer(), outOfOrder, {
        environment: "test",
        channel: "web",
        evaluated_at: "2026-09-03T10:00:00.000Z",
      }),
    ).toMatchObject({ allowed: false, reason: "entitlement_blocked" });
  });

  it("fails closed when distinct events claim the same timestamp", () => {
    const first = reduceEntitlementEventV1(seed(), {
      ...baseEvent(
        "channel_linked",
        "same-time-first",
        "2026-09-02T09:00:00.000Z",
      ),
      channel: "web",
    });
    const collision = reduceEntitlementEventV1(first, {
      ...baseEvent(
        "channel_linked",
        "same-time-second",
        "2026-09-02T09:00:00.000Z",
      ),
      channel: "telegram",
    });
    expect(collision).toMatchObject({
      status: "blocked",
      reason: "out_of_order",
    });
  });

  it("treats duplicate event ids as deterministic no-ops, even if replay payload differs", () => {
    const payment = confirmationEvent({ id: "idempotent-payment" });
    const active = reduceEntitlementEventV1(seed(), payment);
    const alteredReplay = {
      ...baseEvent("revoked", "idempotent-payment", "2026-09-30T10:00:00.000Z"),
    };
    expect(reduceEntitlementEventV1(active, alteredReplay)).toEqual(active);
  });

  it("blocks provider evidence replay hidden behind a fresh lifecycle event id", () => {
    const payment = confirmationEvent({ id: "original-evidence" });
    const active = reduceEntitlementEventV1(seed(), payment);

    const reusedProviderEvent = confirmationEvent({
      type: "renewal_confirmed",
      id: "fresh-event-one",
      occurredAt: "2026-09-25T10:00:00.000Z",
      activeUntil: "2026-11-02T10:00:00.000Z",
    });
    reusedProviderEvent.evidence.provider_event_ref =
      payment.evidence.provider_event_ref;
    expect(reduceEntitlementEventV1(active, reusedProviderEvent)).toMatchObject(
      { status: "blocked", reason: "invalid_transition" },
    );

    const reusedPayment = confirmationEvent({
      type: "renewal_confirmed",
      id: "fresh-event-two",
      occurredAt: "2026-09-25T10:00:00.000Z",
      activeUntil: "2026-11-02T10:00:00.000Z",
    });
    reusedPayment.evidence.payment_ref = payment.evidence.payment_ref;
    expect(reduceEntitlementEventV1(active, reusedPayment)).toMatchObject({
      status: "blocked",
      reason: "invalid_transition",
    });
  });

  it("blocks rather than dropping idempotency history after the bounded limit", () => {
    const ids = Array.from(
      { length: PRODUCT_FLOW_LIMITS.processed_event_ids },
      (_, index) => ref(`history-${index.toString().padStart(6, "0")}`),
    );
    const full = parseEntitlementSnapshotV1({
      ...seed(),
      last_event_at: "2026-09-02T09:00:00.000Z",
      last_event_id: ids.at(-1),
      processed_event_ids: ids,
    });
    const result = reduceEntitlementEventV1(full, {
      ...baseEvent(
        "channel_linked",
        "history-overflow",
        "2026-09-02T10:00:00.000Z",
      ),
      channel: "web",
    });
    expect(result).toMatchObject({
      status: "blocked",
      reason: "history_limit",
    });
  });
});

describe("evaluateAccessV1", () => {
  it("allows an active entitlement on either declared delivery channel", () => {
    const active = reduceEntitlementEventV1(seed(), confirmationEvent({}));
    for (const channel of ["web", "telegram"] as const) {
      const result = evaluateAccessV1(testOffer(), active, {
        environment: "test",
        channel,
        evaluated_at: "2026-09-03T10:00:00.000Z",
      });
      expect(result).toMatchObject({
        allowed: true,
        reason: "active",
        channel,
      });
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it("never crosses test and production", () => {
    const active = reduceEntitlementEventV1(seed(), confirmationEvent({}));
    expect(
      evaluateAccessV1(testOffer(), active, {
        environment: "production",
        channel: "web",
        evaluated_at: "2026-09-03T10:00:00.000Z",
      }),
    ).toMatchObject({ allowed: false, reason: "environment_mismatch" });
  });

  it("denies previews, paused offers, unavailable channels, and ungranted rights", () => {
    const active = reduceEntitlementEventV1(seed(), confirmationEvent({}));
    const railsOff = [
      { rail: "stripe_web", channel: "web", availability: "off" },
      { rail: "telegram_stars", channel: "telegram", availability: "off" },
      { rail: "paypal_web", channel: "web", availability: "off" },
      { rail: "crypto_web", channel: "web", availability: "off" },
    ];
    const cases = [
      [
        "offer_unavailable",
        { ...testOffer(), status: "preview", rails: railsOff },
      ],
      [
        "offer_unavailable",
        {
          ...testOffer(),
          status: "paused",
          delivery: {
            web: { availability: "off" },
            telegram: { availability: "off" },
          },
          rails: railsOff,
        },
      ],
      [
        "rights_not_granted",
        {
          ...testOffer(),
          rights: { purpose: "subscriber_derived_signal", decision: "denied" },
        },
      ],
      [
        "channel_unavailable",
        {
          ...testOffer(),
          delivery: {
            ...testOffer().delivery,
            telegram: { availability: "off" },
          },
          rails: testOffer().rails.map((rail) =>
            rail.rail === "telegram_stars"
              ? {
                  rail: "telegram_stars",
                  channel: "telegram",
                  availability: "off",
                }
              : rail,
          ),
        },
      ],
    ] as const;
    for (const [reason, offer] of cases) {
      expect(
        evaluateAccessV1(offer, active, {
          environment: "test",
          channel: reason === "channel_unavailable" ? "telegram" : "web",
          evaluated_at: "2026-09-03T10:00:00.000Z",
        }),
      ).toMatchObject({ allowed: false, reason });
    }
  });

  it("fails closed for an unknown live price reference", () => {
    const event = confirmationEvent({
      id: "unknown-live-price",
      environment: "production",
      occurredAt: "2026-09-02T10:00:00.000Z",
      activeUntil: "2026-10-02T10:00:00.000Z",
      priceRef: ref("unrecognized-price"),
    });
    const active = reduceEntitlementEventV1(seed("production"), event);
    expect(
      evaluateAccessV1(liveOffer(), active, {
        environment: "production",
        channel: "web",
        evaluated_at: "2026-09-03T10:00:00.000Z",
      }),
    ).toMatchObject({ allowed: false, reason: "unknown_price_ref" });
  });

  it("rejects unknown snapshot fields and impossible active shapes", () => {
    const unknown = { ...seed(), secret: "nope" };
    expect(() => parseEntitlementSnapshotV1(unknown)).toThrow(
      ProductFlowContractError,
    );
    expect(() =>
      parseEntitlementSnapshotV1({
        ...seed(),
        schema: PRODUCT_ENTITLEMENT_SCHEMA,
        status: "active",
        reason: "payment_confirmed",
      }),
    ).toThrow(ProductFlowContractError);
  });
});
