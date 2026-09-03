#!/usr/bin/env tsx

import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import Stripe from "stripe";

export const PRISM_STRIPE_PREFLIGHT_API_VERSION =
  "2026-02-25.clover" as const;
export const PRISM_STRIPE_PREFLIGHT_WEBHOOK_URL =
  "https://cambridgetcg.com/api/webhooks/stripe/prism-signals" as const;
export const PRISM_STRIPE_PREFLIGHT_WEBHOOK_EVENTS = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.paid",
  "invoice.payment_failed",
  "refund.created",
  "refund.updated",
] as const);

const EXPECTED_CURRENCY = "gbp" as const;
const EXPECTED_AMOUNT_MINOR = 500 as const;
const EXPECTED_INTERVAL = "month" as const;

export interface PrismStripeProviderPreflightEnvironmentV1 {
  readonly PRISM_STRIPE_POSTURE?: string;
  readonly PRISM_STRIPE_SECRET_KEY?: string;
  readonly PRISM_STRIPE_WEBHOOK_SECRET?: string;
  readonly PRISM_STRIPE_ACCOUNT_ID?: string;
  readonly PRISM_STRIPE_API_VERSION?: string;
  readonly PRISM_STRIPE_ALL_PRICE_ID?: string;
  readonly PRISM_STRIPE_EXPECTED_PRODUCT_ID?: string;
  readonly PRISM_STRIPE_PORTAL_CONFIGURATION_ID?: string;
  readonly PRISM_STRIPE_WEBHOOK_ENDPOINT_ID?: string;
}

export interface PrismStripeProviderPreflightConfigV1 {
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly accountId: string;
  readonly productId: string;
  readonly priceId: string;
  readonly portalConfigurationId: string;
  readonly webhookEndpointId: string;
  readonly apiVersion: typeof PRISM_STRIPE_PREFLIGHT_API_VERSION;
}

export type PrismStripeProviderPreflightConfigurationFailureV1 =
  | "posture_not_test"
  | "restricted_test_key_required"
  | "webhook_secret_required"
  | "account_id_required"
  | "product_id_required"
  | "price_id_required"
  | "portal_configuration_id_required"
  | "webhook_endpoint_id_required"
  | "api_version_mismatch";

export class PrismStripeProviderPreflightConfigurationError extends Error {
  readonly code: PrismStripeProviderPreflightConfigurationFailureV1;

  constructor(code: PrismStripeProviderPreflightConfigurationFailureV1) {
    super(`PRISM Stripe provider preflight configuration failed: ${code}.`);
    this.name = "PrismStripeProviderPreflightConfigurationError";
    this.code = code;
  }
}

const CONFIG_PATTERNS = Object.freeze({
  // The activation credential is deliberately stricter than the runtime's
  // transitional sk_test_ support: the final deployed key must be restricted.
  secretKey: /^rk_test_[A-Za-z0-9_]{16,240}$/,
  webhookSecret: /^whsec_[A-Za-z0-9_]{16,240}$/,
  accountId: /^acct_[A-Za-z0-9]{8,64}$/,
  productId: /^prod_[A-Za-z0-9]{8,64}$/,
  priceId: /^price_[A-Za-z0-9]{8,64}$/,
  portalConfigurationId: /^bpc_[A-Za-z0-9]{8,64}$/,
  webhookEndpointId: /^we_[A-Za-z0-9]{8,64}$/,
});

function configuredValue(
  environment: PrismStripeProviderPreflightEnvironmentV1,
  key: keyof PrismStripeProviderPreflightEnvironmentV1,
): string {
  return environment[key]?.trim() ?? "";
}

function requirePattern(
  value: string,
  pattern: RegExp,
  code: PrismStripeProviderPreflightConfigurationFailureV1,
): void {
  if (!pattern.test(value)) {
    throw new PrismStripeProviderPreflightConfigurationError(code);
  }
}

/**
 * Read the expected sandbox identity without ever falling back to a generic
 * Stripe credential. The webhook secret is checked for presence/shape only:
 * Stripe does not return an existing endpoint's signing secret for comparison.
 */
export function readPrismStripeProviderPreflightConfig(
  environment: PrismStripeProviderPreflightEnvironmentV1 =
    process.env as PrismStripeProviderPreflightEnvironmentV1,
): PrismStripeProviderPreflightConfigV1 {
  if (
    configuredValue(environment, "PRISM_STRIPE_POSTURE") !== "stripe-test-v1"
  ) {
    throw new PrismStripeProviderPreflightConfigurationError("posture_not_test");
  }

  const secretKey = configuredValue(environment, "PRISM_STRIPE_SECRET_KEY");
  const webhookSecret = configuredValue(
    environment,
    "PRISM_STRIPE_WEBHOOK_SECRET",
  );
  const accountId = configuredValue(environment, "PRISM_STRIPE_ACCOUNT_ID");
  const productId = configuredValue(
    environment,
    "PRISM_STRIPE_EXPECTED_PRODUCT_ID",
  );
  const priceId = configuredValue(environment, "PRISM_STRIPE_ALL_PRICE_ID");
  const portalConfigurationId = configuredValue(
    environment,
    "PRISM_STRIPE_PORTAL_CONFIGURATION_ID",
  );
  const webhookEndpointId = configuredValue(
    environment,
    "PRISM_STRIPE_WEBHOOK_ENDPOINT_ID",
  );
  const apiVersion = configuredValue(environment, "PRISM_STRIPE_API_VERSION");

  requirePattern(
    secretKey,
    CONFIG_PATTERNS.secretKey,
    "restricted_test_key_required",
  );
  requirePattern(
    webhookSecret,
    CONFIG_PATTERNS.webhookSecret,
    "webhook_secret_required",
  );
  requirePattern(accountId, CONFIG_PATTERNS.accountId, "account_id_required");
  requirePattern(productId, CONFIG_PATTERNS.productId, "product_id_required");
  requirePattern(priceId, CONFIG_PATTERNS.priceId, "price_id_required");
  requirePattern(
    portalConfigurationId,
    CONFIG_PATTERNS.portalConfigurationId,
    "portal_configuration_id_required",
  );
  requirePattern(
    webhookEndpointId,
    CONFIG_PATTERNS.webhookEndpointId,
    "webhook_endpoint_id_required",
  );
  if (apiVersion !== PRISM_STRIPE_PREFLIGHT_API_VERSION) {
    throw new PrismStripeProviderPreflightConfigurationError(
      "api_version_mismatch",
    );
  }

  return Object.freeze({
    secretKey,
    webhookSecret,
    accountId,
    productId,
    priceId,
    portalConfigurationId,
    webhookEndpointId,
    apiVersion: PRISM_STRIPE_PREFLIGHT_API_VERSION,
  });
}

export type PrismStripeProviderPreflightCheckNameV1 =
  | "operator_account_identity"
  | "operator_product_contract"
  | "operator_price_contract"
  | "operator_portal_contract"
  | "operator_webhook_contract"
  | "runtime_account_read"
  | "runtime_price_read"
  | "runtime_portal_configuration_read"
  | "events_read"
  | "subscriptions_read"
  | "invoices_read"
  | "invoice_payments_read"
  | "payment_intents_read";

export type PrismStripeProviderPreflightEvidenceV1 =
  | "verified"
  | "authorized_empty"
  | "authorized_nonempty";

export type PrismStripeProviderPreflightFailureV1 =
  | "authentication_rejected"
  | "permission_denied"
  | "resource_not_found"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_request_failed"
  | "provider_response_invalid"
  | "api_version_mismatch"
  | "live_object_returned"
  | "account_mismatch"
  | "product_mismatch"
  | "price_mismatch"
  | "portal_mismatch"
  | "webhook_mismatch";

export type PrismStripeProviderPreflightCheckV1 = Readonly<
  | {
      name: PrismStripeProviderPreflightCheckNameV1;
      passed: true;
      evidence: PrismStripeProviderPreflightEvidenceV1;
    }
  | {
      name: PrismStripeProviderPreflightCheckNameV1;
      passed: false;
      failure: PrismStripeProviderPreflightFailureV1;
    }
>;

export interface PrismStripeProviderPreflightReportV1 {
  readonly kind: "prism_stripe_provider_preflight_v1";
  readonly passed: boolean;
  readonly checks: readonly PrismStripeProviderPreflightCheckV1[];
  readonly deferred_writes: typeof PRISM_STRIPE_PREFLIGHT_DEFERRED_WRITES;
}

type ResponseWithVersion = {
  readonly lastResponse?: {
    readonly apiVersion?: string;
  };
};

export interface PrismStripeOperatorResourceReaderV1 {
  /** These methods run through the logged-in test/sandbox operator channel. */
  readonly retrieveAccount: () => Promise<Stripe.Account>;
  readonly retrieveProduct: (id: string) => Promise<Stripe.Product>;
  readonly retrievePrice: (id: string) => Promise<Stripe.Price>;
  readonly retrievePortalConfiguration: (
    id: string,
  ) => Promise<Stripe.BillingPortal.Configuration>;
  readonly retrieveWebhookEndpoint: (
    id: string,
  ) => Promise<Stripe.WebhookEndpoint>;
}

function responseHasExpectedApiVersion(
  response: ResponseWithVersion,
  config: PrismStripeProviderPreflightConfigV1,
): boolean {
  return response.lastResponse?.apiVersion === config.apiVersion;
}

function providerFailure(error: unknown): PrismStripeProviderPreflightFailureV1 {
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : null;
  if (statusCode === 401) return "authentication_rejected";
  if (statusCode === 403) return "permission_denied";
  if (statusCode === 404) return "resource_not_found";
  if (statusCode === 429) return "rate_limited";
  if (statusCode !== null && statusCode >= 500) return "provider_unavailable";
  return "provider_request_failed";
}

function passed(
  name: PrismStripeProviderPreflightCheckNameV1,
  evidence: PrismStripeProviderPreflightEvidenceV1 = "verified",
): PrismStripeProviderPreflightCheckV1 {
  return Object.freeze({ name, passed: true as const, evidence });
}

function failed(
  name: PrismStripeProviderPreflightCheckNameV1,
  failure: PrismStripeProviderPreflightFailureV1,
): PrismStripeProviderPreflightCheckV1 {
  return Object.freeze({ name, passed: false as const, failure });
}

async function contractProbe<T extends ResponseWithVersion>(input: {
  readonly name: PrismStripeProviderPreflightCheckNameV1;
  readonly config: PrismStripeProviderPreflightConfigV1;
  readonly request: () => Promise<T>;
  readonly valid: (response: T) => boolean;
  readonly mismatch: PrismStripeProviderPreflightFailureV1;
}): Promise<PrismStripeProviderPreflightCheckV1> {
  try {
    const response = await input.request();
    if (!responseHasExpectedApiVersion(response, input.config)) {
      return failed(input.name, "api_version_mismatch");
    }
    return input.valid(response)
      ? passed(input.name)
      : failed(input.name, input.mismatch);
  } catch (error) {
    return failed(input.name, providerFailure(error));
  }
}

async function operatorContractProbe<T>(input: {
  readonly name: PrismStripeProviderPreflightCheckNameV1;
  readonly request: () => Promise<T>;
  readonly valid: (response: T) => boolean;
  readonly mismatch: PrismStripeProviderPreflightFailureV1;
}): Promise<PrismStripeProviderPreflightCheckV1> {
  try {
    const response = await input.request();
    return input.valid(response)
      ? passed(input.name)
      : failed(input.name, input.mismatch);
  } catch (error) {
    return failed(input.name, providerFailure(error));
  }
}

type LivemodeListResponse = ResponseWithVersion & {
  readonly object?: unknown;
  readonly data?: unknown;
  readonly has_more?: unknown;
};

async function listPermissionProbe(input: {
  readonly name: PrismStripeProviderPreflightCheckNameV1;
  readonly config: PrismStripeProviderPreflightConfigV1;
  readonly request: () => Promise<LivemodeListResponse>;
}): Promise<PrismStripeProviderPreflightCheckV1> {
  try {
    const response = await input.request();
    if (!responseHasExpectedApiVersion(response, input.config)) {
      return failed(input.name, "api_version_mismatch");
    }
    if (
      response.object !== "list" ||
      !Array.isArray(response.data) ||
      response.data.length > 1 ||
      typeof response.has_more !== "boolean"
    ) {
      return failed(input.name, "provider_response_invalid");
    }
    if (
      response.data.some(
        (item) =>
          typeof item !== "object" ||
          item === null ||
          !("livemode" in item) ||
          item.livemode !== false,
      )
    ) {
      return failed(input.name, "live_object_returned");
    }
    return passed(
      input.name,
      response.data.length === 0 ? "authorized_empty" : "authorized_nonempty",
    );
  } catch (error) {
    return failed(input.name, providerFailure(error));
  }
}

function providerId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  ) {
    return value.id;
  }
  return null;
}

function exactEventAllowlist(actual: readonly string[]): boolean {
  if (actual.length !== PRISM_STRIPE_PREFLIGHT_WEBHOOK_EVENTS.length) {
    return false;
  }
  const expected = new Set<string>(PRISM_STRIPE_PREFLIGHT_WEBHOOK_EVENTS);
  return actual.every((event) => expected.delete(event)) && expected.size === 0;
}

function validProduct(
  product: Stripe.Product,
  config: PrismStripeProviderPreflightConfigV1,
): boolean {
  return (
    product.id === config.productId &&
    product.active === true &&
    product.livemode === false
  );
}

function validPrice(
  price: Stripe.Price,
  config: PrismStripeProviderPreflightConfigV1,
): boolean {
  return (
    price.id === config.priceId &&
    price.active === true &&
    price.livemode === false &&
    providerId(price.product) === config.productId &&
    price.currency === EXPECTED_CURRENCY &&
    price.unit_amount === EXPECTED_AMOUNT_MINOR &&
    price.billing_scheme === "per_unit" &&
    price.type === "recurring" &&
    price.recurring?.interval === EXPECTED_INTERVAL &&
    price.recurring.interval_count === 1 &&
    price.recurring.usage_type === "licensed"
  );
}

function validPortal(
  portal: Stripe.BillingPortal.Configuration,
  config: PrismStripeProviderPreflightConfigV1,
): boolean {
  return (
    portal.id === config.portalConfigurationId &&
    portal.active === true &&
    portal.livemode === false &&
    portal.features.payment_method_update.enabled === true &&
    portal.features.invoice_history.enabled === true &&
    portal.features.subscription_cancel.enabled === true &&
    portal.features.subscription_cancel.mode === "at_period_end" &&
    portal.features.subscription_update.enabled === false &&
    portal.features.customer_update.enabled === false
  );
}

function validWebhookEndpoint(
  endpoint: Stripe.WebhookEndpoint,
  config: PrismStripeProviderPreflightConfigV1,
): boolean {
  return (
    endpoint.id === config.webhookEndpointId &&
    endpoint.livemode === false &&
    endpoint.status === "enabled" &&
    endpoint.application === null &&
    endpoint.url === PRISM_STRIPE_PREFLIGHT_WEBHOOK_URL &&
    endpoint.api_version === config.apiVersion &&
    exactEventAllowlist(endpoint.enabled_events)
  );
}

const STRIPE_CLI_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function stripeCliGet(path: string, apiVersion: string): Promise<unknown> {
  const cliEnvironment = { ...process.env };
  // An inherited STRIPE_API_KEY could silently override the authenticated
  // sandbox profile. The operator probe intentionally uses that profile only.
  delete cliEnvironment.STRIPE_API_KEY;
  return new Promise((resolve, reject) => {
    execFile(
      "stripe",
      [
        "get",
        path,
        "--stripe-version",
        apiVersion,
        "--color",
        "off",
      ],
      {
        encoding: "utf8",
        env: cliEnvironment,
        maxBuffer: STRIPE_CLI_MAX_OUTPUT_BYTES,
        timeout: 30_000,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error("stripe_cli_read_failed"));
          return;
        }
        try {
          const parsed: unknown = JSON.parse(stdout);
          if (typeof parsed !== "object" || parsed === null) {
            reject(new Error("stripe_cli_response_invalid"));
            return;
          }
          resolve(parsed);
        } catch {
          reject(new Error("stripe_cli_response_invalid"));
        }
      },
    );
  });
}

/**
 * Product and Webhook Endpoint reads live on the authenticated operator
 * channel so the deployed rk_test_ never needs those unrelated permissions.
 * The CLI defaults to sandbox/test mode; this code has no --live branch.
 */
export function createPrismStripeCliResourceReader(
  config: PrismStripeProviderPreflightConfigV1,
): PrismStripeOperatorResourceReaderV1 {
  return Object.freeze({
    retrieveAccount: async () =>
      (await stripeCliGet("/v1/account", config.apiVersion)) as Stripe.Account,
    retrieveProduct: async (id: string) =>
      (await stripeCliGet(
        `/v1/products/${encodeURIComponent(id)}`,
        config.apiVersion,
      )) as Stripe.Product,
    retrievePrice: async (id: string) =>
      (await stripeCliGet(
        `/v1/prices/${encodeURIComponent(id)}`,
        config.apiVersion,
      )) as Stripe.Price,
    retrievePortalConfiguration: async (id: string) =>
      (await stripeCliGet(
        `/v1/billing_portal/configurations/${encodeURIComponent(id)}`,
        config.apiVersion,
      )) as Stripe.BillingPortal.Configuration,
    retrieveWebhookEndpoint: async (id: string) =>
      (await stripeCliGet(
        `/v1/webhook_endpoints/${encodeURIComponent(id)}`,
        config.apiVersion,
      )) as Stripe.WebhookEndpoint,
  });
}

export const PRISM_STRIPE_PREFLIGHT_DEFERRED_WRITES = Object.freeze([
  "checkout_session_create_requires_mutation",
  "portal_session_create_requires_fixture_customer",
] as const);

/** Execute only provider GET/list requests. No object is created or mutated. */
export async function runPrismStripeProviderPreflight(
  runtimeStripe: Stripe,
  config: PrismStripeProviderPreflightConfigV1,
  operator: PrismStripeOperatorResourceReaderV1,
): Promise<PrismStripeProviderPreflightReportV1> {
  const checks = await Promise.all([
    operatorContractProbe({
      name: "operator_account_identity",
      request: () => operator.retrieveAccount(),
      valid: (account) => account.id === config.accountId,
      mismatch: "account_mismatch",
    }),
    operatorContractProbe({
      name: "operator_product_contract",
      request: () => operator.retrieveProduct(config.productId),
      valid: (product) => validProduct(product, config),
      mismatch: "product_mismatch",
    }),
    operatorContractProbe({
      name: "operator_price_contract",
      request: () => operator.retrievePrice(config.priceId),
      valid: (price) => validPrice(price, config),
      mismatch: "price_mismatch",
    }),
    operatorContractProbe({
      name: "operator_portal_contract",
      request: () =>
        operator.retrievePortalConfiguration(config.portalConfigurationId),
      valid: (portal) => validPortal(portal, config),
      mismatch: "portal_mismatch",
    }),
    operatorContractProbe({
      name: "operator_webhook_contract",
      request: () => operator.retrieveWebhookEndpoint(config.webhookEndpointId),
      valid: (endpoint) => validWebhookEndpoint(endpoint, config),
      mismatch: "webhook_mismatch",
    }),
    contractProbe({
      name: "runtime_account_read",
      config,
      request: () => runtimeStripe.accounts.retrieve(),
      valid: (account) => account.id === config.accountId,
      mismatch: "account_mismatch",
    }),
    contractProbe({
      name: "runtime_price_read",
      config,
      request: () => runtimeStripe.prices.retrieve(config.priceId),
      valid: (price) => validPrice(price, config),
      mismatch: "price_mismatch",
    }),
    contractProbe({
      name: "runtime_portal_configuration_read",
      config,
      request: () =>
        runtimeStripe.billingPortal.configurations.retrieve(
          config.portalConfigurationId,
        ),
      valid: (portal) => validPortal(portal, config),
      mismatch: "portal_mismatch",
    }),
    listPermissionProbe({
      name: "events_read",
      config,
      request: () => runtimeStripe.events.list({ limit: 1 }),
    }),
    listPermissionProbe({
      name: "subscriptions_read",
      config,
      request: () =>
        runtimeStripe.subscriptions.list({ limit: 1, status: "all" }),
    }),
    listPermissionProbe({
      name: "invoices_read",
      config,
      request: () => runtimeStripe.invoices.list({ limit: 1 }),
    }),
    listPermissionProbe({
      name: "invoice_payments_read",
      config,
      request: () => runtimeStripe.invoicePayments.list({ limit: 1 }),
    }),
    listPermissionProbe({
      name: "payment_intents_read",
      config,
      request: () => runtimeStripe.paymentIntents.list({ limit: 1 }),
    }),
  ]);

  return Object.freeze({
    kind: "prism_stripe_provider_preflight_v1" as const,
    passed: checks.every((check) => check.passed),
    checks: Object.freeze(checks),
    deferred_writes: PRISM_STRIPE_PREFLIGHT_DEFERRED_WRITES,
  });
}

/** Human-readable and deliberately bounded: it contains no provider values. */
export function formatPrismStripeProviderPreflightReport(
  report: PrismStripeProviderPreflightReportV1,
): string {
  const lines = [
    `PRISM Stripe provider preflight: ${report.passed ? "PASS" : "FAIL"}`,
    ...report.checks.map((check) =>
      check.passed
        ? `- PASS ${check.name}: ${check.evidence}`
        : `- FAIL ${check.name}: ${check.failure}`,
    ),
    ...report.deferred_writes.map((limitation) => `- DEFERRED ${limitation}`),
  ];
  return lines.join("\n");
}

function configurationFailureReport(
  code:
    | PrismStripeProviderPreflightConfigurationFailureV1
    | "provider_request_failed",
): string {
  return [
    "PRISM Stripe provider preflight: FAIL",
    `- FAIL configuration: ${code}`,
  ].join("\n");
}

async function main(): Promise<void> {
  try {
    const config = readPrismStripeProviderPreflightConfig();
    const stripe = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion,
      maxNetworkRetries: 2,
      telemetry: false,
      appInfo: {
        name: "Cambridge TCG PRISM provider preflight",
        version: "1",
      },
    });
    const report = await runPrismStripeProviderPreflight(
      stripe,
      config,
      createPrismStripeCliResourceReader(config),
    );
    process.stdout.write(`${formatPrismStripeProviderPreflightReport(report)}\n`);
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    const code:
      | PrismStripeProviderPreflightConfigurationFailureV1
      | "provider_request_failed" =
      error instanceof PrismStripeProviderPreflightConfigurationError
        ? error.code
        : "provider_request_failed";
    process.stdout.write(`${configurationFailureReport(code)}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  void main();
}
