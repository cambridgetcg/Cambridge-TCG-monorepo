import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
  createPrismStripeCliResourceReader,
  formatPrismStripeProviderPreflightReport,
  PRISM_STRIPE_PREFLIGHT_API_VERSION,
  PRISM_STRIPE_PREFLIGHT_PERMISSION_ATTESTATION,
  PRISM_STRIPE_PREFLIGHT_WEBHOOK_EVENTS,
  PRISM_STRIPE_PREFLIGHT_WEBHOOK_URL,
  PrismStripeProviderPreflightConfigurationError,
  readPrismStripeProviderPreflightConfig,
  runPrismStripeProviderPreflight,
  type PrismStripeProviderPreflightConfigV1,
  type PrismStripeProviderPreflightEnvironmentV1,
  type PrismStripeOperatorResourceReaderV1,
  type PrismStripeCliExecutorV1,
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
    PRISM_STRIPE_KEY_PERMISSION_ATTESTATION:
      PRISM_STRIPE_PREFLIGHT_PERMISSION_ATTESTATION,
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
  runtimeProduct?: unknown;
  runtimeEndpoint?: unknown;
  events?: unknown;
  subscriptions?: unknown;
  invoices?: unknown;
  invoicePayments?: unknown;
  paymentIntents?: unknown;
} = {}) {
  const read = <T>(override: unknown, fallback: T) =>
    vi.fn().mockImplementation(async () => {
      const result = override ?? fallback;
      if (result instanceof Error) throw result;
      return result;
    });
  const permissionDenied = () =>
    Object.assign(new Error("restricted key permission denied"), {
      statusCode: 403,
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
    runtimeProduct: read(overrides.runtimeProduct, permissionDenied()),
    runtimeEndpoint: read(overrides.runtimeEndpoint, permissionDenied()),
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
    products: { retrieve: mocks.runtimeProduct },
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
    webhookEndpoints: { retrieve: mocks.runtimeEndpoint },
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
      permissionAttestation: PRISM_STRIPE_PREFLIGHT_PERMISSION_ATTESTATION,
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
    [
      { PRISM_STRIPE_KEY_PERMISSION_ATTESTATION: "unreviewed" },
      "permission_attestation_required",
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

describe("PRISM Stripe authenticated CLI resource adapter", () => {
  it("uses bounded test-mode argv and strips inherited API/runtime secrets", async () => {
    const inheritedApiKey = `sk_live_${"x".repeat(32)}`;
    const inheritedRuntimeKey = `rk_test_${"y".repeat(32)}`;
    const calls: Array<{
      executable: string;
      argv: readonly string[];
      options: Parameters<PrismStripeCliExecutorV1>[2];
    }> = [];
    const executor: PrismStripeCliExecutorV1 = vi.fn(
      async (executable, argv, options) => {
        calls.push({ executable, argv, options });
        return JSON.stringify({ object: "operator_fixture" });
      },
    );
    const reader = createPrismStripeCliResourceReader(config(), {
      executor,
      environment: {
        HOME: "/bounded/home",
        PATH: "/bounded/bin",
        STRIPE_API_KEY: inheritedApiKey,
        PRISM_STRIPE_SECRET_KEY: inheritedRuntimeKey,
        PRISM_STRIPE_WEBHOOK_SECRET: `whsec_${"z".repeat(32)}`,
        UNRELATED_DEPLOYMENT_SECRET: "must-not-reach-child",
      },
    });

    await reader.retrieveAccount();
    await reader.retrieveProduct(IDS.product);
    await reader.retrievePrice(IDS.price);
    await reader.retrievePortalConfiguration(IDS.portal);
    await reader.retrieveWebhookEndpoint(IDS.endpoint);

    expect(calls.map((call) => call.argv[1])).toEqual([
      "/v1/account",
      `/v1/products/${IDS.product}`,
      `/v1/prices/${IDS.price}`,
      `/v1/billing_portal/configurations/${IDS.portal}`,
      `/v1/webhook_endpoints/${IDS.endpoint}`,
    ]);
    for (const call of calls) {
      expect(call.executable).toBe("stripe");
      expect(call.argv).toHaveLength(6);
      expect(call.argv[0]).toBe("get");
      expect(call.argv.slice(2)).toEqual([
        "--stripe-version",
        PRISM_STRIPE_PREFLIGHT_API_VERSION,
        "--color",
        "off",
      ]);
      expect(call.argv).not.toContain("--live");
      expect(call.argv).not.toContain("--api-key");
      expect(call.argv.every((argument) => argument.length < 200)).toBe(true);
      expect(call.options.maxOutputBytes).toBe(2 * 1024 * 1024);
      expect(call.options.timeoutMs).toBe(30_000);
      expect(call.options.environment).toMatchObject({
        HOME: "/bounded/home",
        PATH: "/bounded/bin",
      });
      expect(call.options.environment).not.toHaveProperty("STRIPE_API_KEY");
      expect(call.options.environment).not.toHaveProperty(
        "PRISM_STRIPE_SECRET_KEY",
      );
      expect(call.options.environment).not.toHaveProperty(
        "PRISM_STRIPE_WEBHOOK_SECRET",
      );
      expect(call.options.environment).not.toHaveProperty(
        "UNRELATED_DEPLOYMENT_SECRET",
      );
    }
    const serializedCalls = JSON.stringify(calls);
    expect(serializedCalls).not.toContain(inheritedApiKey);
    expect(serializedCalls).not.toContain(inheritedRuntimeKey);
    expect(serializedCalls).not.toContain("must-not-reach-child");
  });

  it("rejects non-JSON CLI output without reflecting it", async () => {
    const sensitiveOutput = `not-json rk_test_${"q".repeat(32)}`;
    const reader = createPrismStripeCliResourceReader(config(), {
      executor: async () => sensitiveOutput,
      environment: {},
    });
    let observed: unknown;
    try {
      await reader.retrieveAccount();
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(Error);
    expect((observed as Error).message).toBe("stripe_cli_response_invalid");
    expect((observed as Error).message).not.toContain(sensitiveOutput);
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
    expect(report.checks).toHaveLength(16);
    expect(report.deferred_writes).toEqual([
      "checkout_session_create_requires_mutation",
      "portal_session_create_requires_fixture_customer",
      "other_surplus_permissions_require_dashboard_attestation",
    ]);
    expect(check(report, "dashboard_permission_attestation")).toEqual({
      name: "dashboard_permission_attestation",
      passed: true,
      evidence: "declared_v1_not_api_introspected",
    });
    expect(check(report, "runtime_product_read_denied")).toEqual({
      name: "runtime_product_read_denied",
      passed: true,
      evidence: "permission_denied_as_expected",
    });
    expect(check(report, "runtime_webhook_endpoint_read_denied")).toEqual({
      name: "runtime_webhook_endpoint_read_denied",
      passed: true,
      evidence: "permission_denied_as_expected",
    });
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
    expect(mocks.runtimeProduct).toHaveBeenCalledWith(IDS.product);
    expect(mocks.runtimeEndpoint).toHaveBeenCalledWith(IDS.endpoint);
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

  it("rejects a runtime key with surplus Product or Webhook Endpoint read", async () => {
    const fixture = fakeStripe({
      runtimeProduct: response({
        id: IDS.product,
        object: "product",
        active: true,
        livemode: false,
      }),
      runtimeEndpoint: response({
        id: IDS.endpoint,
        object: "webhook_endpoint",
        livemode: false,
      }),
    });

    const report = await runPrismStripeProviderPreflight(
      fixture.stripe,
      config(),
      fixture.operator,
    );
    expect(report.passed).toBe(false);
    expect(check(report, "runtime_product_read_denied")).toEqual({
      name: "runtime_product_read_denied",
      passed: false,
      failure: "surplus_permission_present",
    });
    expect(check(report, "runtime_webhook_endpoint_read_denied")).toEqual({
      name: "runtime_webhook_endpoint_read_denied",
      passed: false,
      failure: "surplus_permission_present",
    });
    expect(check(report, "operator_product_contract")).toMatchObject({
      passed: true,
    });
    expect(check(report, "operator_webhook_contract")).toMatchObject({
      passed: true,
    });
  });

  it("requires an actual 403 rather than treating absence as denied permission", async () => {
    const notFound = Object.assign(new Error("not found"), { statusCode: 404 });
    const fixture = fakeStripe({ runtimeProduct: notFound });
    const report = await runPrismStripeProviderPreflight(
      fixture.stripe,
      config(),
      fixture.operator,
    );
    expect(report.passed).toBe(false);
    expect(check(report, "runtime_product_read_denied")).toEqual({
      name: "runtime_product_read_denied",
      passed: false,
      failure: "resource_not_found",
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
      runtimeProduct: denial,
      runtimeEndpoint: denial,
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
    expect(output.split("\n")).toHaveLength(21);
    for (const value of sensitive) expect(output).not.toContain(value);
    expect(output).not.toContain("provider detail");
    expect(output).toContain("permission_denied");
    expect(output).toContain(
      "dashboard_permission_attestation: declared_v1_not_api_introspected",
    );
    expect(output).toContain(
      "other_surplus_permissions_require_dashboard_attestation",
    );
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
