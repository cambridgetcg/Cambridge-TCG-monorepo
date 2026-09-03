import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
  formatPrismStripeProviderPreflightReport,
  PRISM_STRIPE_PREFLIGHT_API_VERSION,
  PRISM_STRIPE_PREFLIGHT_WEBHOOK_EVENTS,
  PRISM_STRIPE_PREFLIGHT_WEBHOOK_URL,
  PrismStripeProviderPreflightConfigurationError,
  readPrismStripeProviderPreflightConfig,
  runPrismStripeProviderPreflight,
  type PrismStripeProviderPreflightConfigV1,
  type PrismStripeProviderPreflightEnvironmentV1,
  type PrismStripeOperatorResourceReaderV1,
} from "../../../../scripts/prism-stripe-provider-preflight";

const IDS = Object.freeze({
  account: "acct_prismpreflight1",
  product: "prod_prismpreflight1",
  price: "price_prismpreflight1",
  portal: "bpc_prismpreflight1",
  endpoint: "we_prismpreflight1",
});

function environment(
  overrides: Partial<PrismStripeProviderPreflightEnvironmentV1> = {},
): PrismStripeProviderPreflightEnvironmentV1 {
  return {
    PRISM_STRIPE_POSTURE: "stripe-test-v1",
    PRISM_STRIPE_SECRET_KEY: `rk_test_${"r".repeat(32)}`,
    PRISM_STRIPE_WEBHOOK_SECRET: `whsec_${"w".repeat(32)}`,
    PRISM_STRIPE_ACCOUNT_ID: IDS.account,
    PRISM_STRIPE_API_VERSION: PRISM_STRIPE_PREFLIGHT_API_VERSION,
    PRISM_STRIPE_ALL_PRICE_ID: IDS.price,
    PRISM_STRIPE_EXPECTED_PRODUCT_ID: IDS.product,
    PRISM_STRIPE_PORTAL_CONFIGURATION_ID: IDS.portal,
    PRISM_STRIPE_WEBHOOK_ENDPOINT_ID: IDS.endpoint,
    ...overrides,
  };
}

function config(): PrismStripeProviderPreflightConfigV1 {
  return readPrismStripeProviderPreflightConfig(environment());
}

function response<T extends object>(
  value: T,
  apiVersion: string = PRISM_STRIPE_PREFLIGHT_API_VERSION,
) {
  return {
    ...value,
    lastResponse: { apiVersion },
  };
}

function list(
  data: readonly object[] = [],
  apiVersion: string = PRISM_STRIPE_PREFLIGHT_API_VERSION,
) {
  return response(
    {
      object: "list" as const,
      data: [...data],
      has_more: false,
      url: "/v1/redacted",
    },
    apiVersion,
  );
}

function fakeStripe(overrides: {
  account?: unknown;
  product?: unknown;
  price?: unknown;
  portal?: unknown;
  endpoint?: unknown;
  events?: unknown;
  subscriptions?: unknown;
  invoices?: unknown;
  invoicePayments?: unknown;
  paymentIntents?: unknown;
} = {}) {
  const read = <T>(override: unknown, fallback: T) =>
    vi.fn().mockImplementation(async () => {
      if (override instanceof Error) throw override;
      return override ?? fallback;
    });

  const mocks = {
    account: read(
      overrides.account,
      response({ id: IDS.account, object: "account" }),
    ),
    product: read(
      overrides.product,
      response({
        id: IDS.product,
        object: "product",
        active: true,
        livemode: false,
      }),
    ),
    price: read(
      overrides.price,
      response({
        id: IDS.price,
        object: "price",
        active: true,
        livemode: false,
        product: IDS.product,
        currency: "gbp",
        unit_amount: 500,
        billing_scheme: "per_unit",
        type: "recurring",
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
      }),
    ),
    portal: read(
      overrides.portal,
      response({
        id: IDS.portal,
        object: "billing_portal.configuration",
        active: true,
        livemode: false,
        application: null,
        features: {
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
          subscription_update: { enabled: false },
          customer_update: { enabled: false },
        },
      }),
    ),
    endpoint: read(
      overrides.endpoint,
      response({
        id: IDS.endpoint,
        object: "webhook_endpoint",
        livemode: false,
        status: "enabled",
        application: null,
        url: PRISM_STRIPE_PREFLIGHT_WEBHOOK_URL,
        api_version: PRISM_STRIPE_PREFLIGHT_API_VERSION,
        enabled_events: [...PRISM_STRIPE_PREFLIGHT_WEBHOOK_EVENTS].reverse(),
      }),
    ),
    events: read(overrides.events, list()),
    subscriptions: read(overrides.subscriptions, list()),
    invoices: read(overrides.invoices, list()),
    invoicePayments: read(overrides.invoicePayments, list()),
    paymentIntents: read(overrides.paymentIntents, list()),
    forbiddenMutation: vi.fn(() => {
      throw new Error("mutation must not be called");
    }),
  };

  const stripe = {
    accounts: { retrieve: mocks.account, update: mocks.forbiddenMutation },
    prices: { retrieve: mocks.price, create: mocks.forbiddenMutation },
    billingPortal: {
      configurations: {
        retrieve: mocks.portal,
        update: mocks.forbiddenMutation,
      },
      sessions: { create: mocks.forbiddenMutation },
    },
    events: { list: mocks.events },
    subscriptions: {
      list: mocks.subscriptions,
      update: mocks.forbiddenMutation,
    },
    invoices: { list: mocks.invoices, create: mocks.forbiddenMutation },
    invoicePayments: { list: mocks.invoicePayments },
    paymentIntents: {
      list: mocks.paymentIntents,
      create: mocks.forbiddenMutation,
    },
  } as unknown as Stripe;

  const operator = {
    retrieveAccount: mocks.account,
    retrieveProduct: mocks.product,
    retrievePrice: mocks.price,
    retrievePortalConfiguration: mocks.portal,
    retrieveWebhookEndpoint: mocks.endpoint,
  } as unknown as PrismStripeOperatorResourceReaderV1;

  return { stripe, operator, mocks };
}

function check(
  report: Awaited<ReturnType<typeof runPrismStripeProviderPreflight>>,
  name: string,
) {
  return report.checks.find((candidate) => candidate.name === name);
}

describe("PRISM Stripe provider preflight configuration", () => {
  it("accepts only the complete dedicated restricted test posture", () => {
    const parsed = readPrismStripeProviderPreflightConfig(environment());
    expect(parsed).toMatchObject({
      accountId: IDS.account,
      productId: IDS.product,
      priceId: IDS.price,
      portalConfigurationId: IDS.portal,
      webhookEndpointId: IDS.endpoint,
      apiVersion: PRISM_STRIPE_PREFLIGHT_API_VERSION,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    [{ PRISM_STRIPE_POSTURE: "live" }, "posture_not_test"],
    [
      { PRISM_STRIPE_SECRET_KEY: `sk_test_${"s".repeat(32)}` },
      "restricted_test_key_required",
    ],
    [
      { PRISM_STRIPE_SECRET_KEY: `rk_live_${"r".repeat(32)}` },
      "restricted_test_key_required",
    ],
    [{ PRISM_STRIPE_WEBHOOK_SECRET: "" }, "webhook_secret_required"],
    [{ PRISM_STRIPE_ACCOUNT_ID: "acct_" }, "account_id_required"],
    [{ PRISM_STRIPE_EXPECTED_PRODUCT_ID: "price_wrong1" }, "product_id_required"],
    [{ PRISM_STRIPE_ALL_PRICE_ID: "prod_wrong1" }, "price_id_required"],
    [{ PRISM_STRIPE_PORTAL_CONFIGURATION_ID: "bpc_" }, "portal_configuration_id_required"],
    [{ PRISM_STRIPE_WEBHOOK_ENDPOINT_ID: "we_" }, "webhook_endpoint_id_required"],
    [{ PRISM_STRIPE_API_VERSION: "2025-01-01.acacia" }, "api_version_mismatch"],
  ] satisfies readonly [
    Partial<PrismStripeProviderPreflightEnvironmentV1>,
    string,
  ][])("rejects unsafe or incomplete input %#", (drift, expectedCode) => {
    try {
      readPrismStripeProviderPreflightConfig(environment(drift));
      throw new Error("expected configuration rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(
        PrismStripeProviderPreflightConfigurationError,
      );
      expect(
        (error as PrismStripeProviderPreflightConfigurationError).code,
      ).toBe(expectedCode);
    }
  });
});

describe("PRISM Stripe provider preflight", () => {
  it("verifies exact provider contracts and every read permission without mutations", async () => {
    const { stripe, operator, mocks } = fakeStripe({
      events: list([{ object: "event", livemode: false }]),
    });

    const report = await runPrismStripeProviderPreflight(
      stripe,
      config(),
      operator,
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(13);
    expect(report.deferred_writes).toEqual([
      "checkout_session_create_requires_mutation",
      "portal_session_create_requires_fixture_customer",
    ]);
    expect(check(report, "events_read")).toMatchObject({
      passed: true,
      evidence: "authorized_nonempty",
    });
    expect(check(report, "subscriptions_read")).toMatchObject({
      passed: true,
      evidence: "authorized_empty",
    });
    expect(mocks.events).toHaveBeenCalledWith({ limit: 1 });
    expect(mocks.subscriptions).toHaveBeenCalledWith({
      limit: 1,
      status: "all",
    });
    expect(mocks.invoices).toHaveBeenCalledWith({ limit: 1 });
    expect(mocks.invoicePayments).toHaveBeenCalledWith({ limit: 1 });
    expect(mocks.paymentIntents).toHaveBeenCalledWith({ limit: 1 });
    expect(mocks.product).toHaveBeenCalledWith(IDS.product);
    expect(mocks.endpoint).toHaveBeenCalledWith(IDS.endpoint);
    expect(mocks.forbiddenMutation).not.toHaveBeenCalled();
  });

  it("distinguishes an authorized empty Events list from permission denial", async () => {
    const emptyFixture = fakeStripe({ events: list() });
    const empty = await runPrismStripeProviderPreflight(
      emptyFixture.stripe,
      config(),
      emptyFixture.operator,
    );
    expect(check(empty, "events_read")).toEqual({
      name: "events_read",
      passed: true,
      evidence: "authorized_empty",
    });

    const deniedError = Object.assign(new Error("provider detail"), {
      statusCode: 403,
    });
    const deniedFixture = fakeStripe({ events: deniedError });
    const denied = await runPrismStripeProviderPreflight(
      deniedFixture.stripe,
      config(),
      deniedFixture.operator,
    );
    expect(denied.passed).toBe(false);
    expect(check(denied, "events_read")).toEqual({
      name: "events_read",
      passed: false,
      failure: "permission_denied",
    });
  });

  it("fails closed on contract, response-version, and list-mode drift", async () => {
    const { stripe, operator } = fakeStripe({
      price: response({
        id: IDS.price,
        active: true,
        livemode: true,
        product: IDS.product,
        currency: "gbp",
        unit_amount: 500,
        billing_scheme: "per_unit",
        type: "recurring",
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
      }),
      portal: response({
        id: IDS.portal,
        active: true,
        livemode: false,
        application: null,
        features: {
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          subscription_cancel: { enabled: true, mode: "immediately" },
          subscription_update: { enabled: true },
          customer_update: { enabled: false },
        },
      }),
      endpoint: response({
        id: IDS.endpoint,
        livemode: false,
        status: "enabled",
        application: null,
        url: `${PRISM_STRIPE_PREFLIGHT_WEBHOOK_URL}/wrong`,
        api_version: PRISM_STRIPE_PREFLIGHT_API_VERSION,
        enabled_events: ["*"],
      }),
      invoices: list([], "2025-01-01.acacia"),
      paymentIntents: list([{ livemode: true }]),
    });

    const report = await runPrismStripeProviderPreflight(
      stripe,
      config(),
      operator,
    );
    expect(report.passed).toBe(false);
    expect(check(report, "runtime_price_read")).toMatchObject({
      passed: false,
      failure: "price_mismatch",
    });
    expect(check(report, "runtime_portal_configuration_read")).toMatchObject({
      passed: false,
      failure: "portal_mismatch",
    });
    expect(check(report, "operator_webhook_contract")).toMatchObject({
      passed: false,
      failure: "webhook_mismatch",
    });
    expect(check(report, "invoices_read")).toMatchObject({
      passed: false,
      failure: "api_version_mismatch",
    });
    expect(check(report, "payment_intents_read")).toMatchObject({
      passed: false,
      failure: "live_object_returned",
    });
  });

  it("never places secrets, provider IDs, customer IDs, or provider messages in output", async () => {
    const sensitive = [
      `rk_test_${"r".repeat(32)}`,
      `whsec_${"w".repeat(32)}`,
      IDS.account,
      IDS.product,
      IDS.price,
      IDS.portal,
      IDS.endpoint,
      "cus_privatecustomer1",
    ];
    const denial = Object.assign(new Error(sensitive.join(" ")), {
      statusCode: 403,
      code: sensitive.join("-"),
    });
    const { stripe, operator } = fakeStripe({
      account: denial,
      product: denial,
      price: denial,
      portal: denial,
      endpoint: denial,
      events: denial,
      subscriptions: denial,
      invoices: denial,
      invoicePayments: denial,
      paymentIntents: denial,
    });

    const report = await runPrismStripeProviderPreflight(
      stripe,
      config(),
      operator,
    );
    const output = `${JSON.stringify(report)}\n${formatPrismStripeProviderPreflightReport(report)}`;

    expect(report.passed).toBe(false);
    expect(output.split("\n")).toHaveLength(17);
    for (const value of sensitive) expect(output).not.toContain(value);
    expect(output).not.toContain("provider detail");
    expect(output).toContain("permission_denied");
  });

  it("rejects malformed or over-broad list responses", async () => {
    const malformed = response({
      object: "list",
      data: [{ livemode: false }, { livemode: false }],
      has_more: true,
    });
    const fixture = fakeStripe({ invoicePayments: malformed });
    const report = await runPrismStripeProviderPreflight(
      fixture.stripe,
      config(),
      fixture.operator,
    );
    expect(check(report, "invoice_payments_read")).toEqual({
      name: "invoice_payments_read",
      passed: false,
      failure: "provider_response_invalid",
    });
  });
});
