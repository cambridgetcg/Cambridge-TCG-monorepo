import "server-only";
import { DATA_API_PLAN_IDS, type DataApiPlanId } from "../plans";
import { dataApiCheckoutIntake, type DataApiCheckoutIntake } from "../posture";

/**
 * Data-API billing configuration, Stripe test mode only
 * (docs/plans/tcg-data-platform/paid-data-api.md §6; DATA_API_PAID_PLANS in
 * lib/release/commercial-retirement.ts). There is deliberately no live-key
 * branch and no fallback to the storefront's other Stripe integrations: a key
 * that is not rk_test_ or sk_test_ leaves billing unavailable, never live.
 */

export const DATA_API_STRIPE_API_VERSION = "2026-02-25.clover" as const;

/** Every plan but free is sold by subscription (0142's plan_id CHECK). */
export type DataApiPaidPlanId = Exclude<DataApiPlanId, "free">;
export const DATA_API_PAID_PLAN_IDS: readonly DataApiPaidPlanId[] = Object.freeze(
  DATA_API_PLAN_IDS.filter((id): id is DataApiPaidPlanId => id !== "free"),
);

export type DataApiBillingConfigurationReason = "not_configured" | "invalid_configuration";

export interface DataApiBillingEnvironment {
  readonly DATA_API_STRIPE_SECRET_KEY?: string;
  readonly DATA_API_STRIPE_WEBHOOK_SECRET?: string;
  readonly DATA_API_STRIPE_PRICE_PRO?: string;
  readonly DATA_API_STRIPE_PRICE_BUSINESS?: string;
  readonly DATA_API_STRIPE_PORTAL_CONFIGURATION?: string;
  readonly DATA_API_CHECKOUT_INTAKE?: string;
}

export interface DataApiBillingConfig {
  readonly environment: "test";
  readonly apiVersion: typeof DATA_API_STRIPE_API_VERSION;
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly prices: Readonly<Record<DataApiPaidPlanId, string>>;
  /** The billing portal configuration every portal session is pinned to
   * (bpc_...), or null while unset: the portal then opens for no one, and
   * checkout sells nothing a subscriber could not manage there. */
  readonly portalConfigurationId: string | null;
  readonly intake: DataApiCheckoutIntake;
}

export class DataApiBillingConfigurationError extends Error {
  readonly code: DataApiBillingConfigurationReason;

  constructor(code: DataApiBillingConfigurationReason, message: string) {
    super(message);
    this.name = "DataApiBillingConfigurationError";
    this.code = code;
  }
}

const PATTERNS = Object.freeze({
  secretKey: /^(?:rk|sk)_test_[A-Za-z0-9_]{16,240}$/,
  webhookSecret: /^whsec_[A-Za-z0-9_]{16,240}$/,
  priceId: /^price_[A-Za-z0-9]{8,64}$/,
  portalConfigurationId: /^bpc_[A-Za-z0-9]{8,64}$/,
});

const CREDENTIAL_KEYS = [
  "DATA_API_STRIPE_SECRET_KEY",
  "DATA_API_STRIPE_WEBHOOK_SECRET",
  "DATA_API_STRIPE_PRICE_PRO",
  "DATA_API_STRIPE_PRICE_BUSINESS",
] as const;

function processEnvironment(): DataApiBillingEnvironment {
  return {
    DATA_API_STRIPE_SECRET_KEY: process.env.DATA_API_STRIPE_SECRET_KEY,
    DATA_API_STRIPE_WEBHOOK_SECRET: process.env.DATA_API_STRIPE_WEBHOOK_SECRET,
    DATA_API_STRIPE_PRICE_PRO: process.env.DATA_API_STRIPE_PRICE_PRO,
    DATA_API_STRIPE_PRICE_BUSINESS: process.env.DATA_API_STRIPE_PRICE_BUSINESS,
    DATA_API_STRIPE_PORTAL_CONFIGURATION: process.env.DATA_API_STRIPE_PORTAL_CONFIGURATION,
    DATA_API_CHECKOUT_INTAKE: process.env.DATA_API_CHECKOUT_INTAKE,
  };
}

// Vercel sometimes stores values with trailing whitespace.
function trimmed(env: DataApiBillingEnvironment, key: (typeof CREDENTIAL_KEYS)[number]): string {
  return env[key]?.trim() ?? "";
}

function invalid(message: string): never {
  throw new DataApiBillingConfigurationError("invalid_configuration", message);
}

/** The test-mode configuration, or a DataApiBillingConfigurationError. Messages name
 * the variable at fault, never its value. */
export function readDataApiBillingConfig(environment?: DataApiBillingEnvironment): DataApiBillingConfig {
  const env = environment ?? processEnvironment();
  const values = Object.fromEntries(CREDENTIAL_KEYS.map(key => [key, trimmed(env, key)])) as Record<(typeof CREDENTIAL_KEYS)[number], string>;
  if (CREDENTIAL_KEYS.every(key => values[key] === "")) {
    throw new DataApiBillingConfigurationError("not_configured", "Data-API billing is not configured.");
  }
  if (!PATTERNS.secretKey.test(values.DATA_API_STRIPE_SECRET_KEY)) {
    return invalid("DATA_API_STRIPE_SECRET_KEY must be a test-mode key (rk_test_ or sk_test_); live keys are refused.");
  }
  if (!PATTERNS.webhookSecret.test(values.DATA_API_STRIPE_WEBHOOK_SECRET)) {
    return invalid("DATA_API_STRIPE_WEBHOOK_SECRET must be a whsec_ signing secret.");
  }
  const prices = { pro: values.DATA_API_STRIPE_PRICE_PRO, business: values.DATA_API_STRIPE_PRICE_BUSINESS };
  if (!PATTERNS.priceId.test(prices.pro)) return invalid("DATA_API_STRIPE_PRICE_PRO must be a price_ id.");
  if (!PATTERNS.priceId.test(prices.business)) return invalid("DATA_API_STRIPE_PRICE_BUSINESS must be a price_ id.");
  if (prices.pro === prices.business) return invalid("The Pro and Business plans need different price ids.");
  // Optional, unlike the rest: unset, billing still verifies events, and the portal and checkout stay shut.
  const portalConfigurationId = env.DATA_API_STRIPE_PORTAL_CONFIGURATION?.trim() ?? "";
  if (portalConfigurationId !== "" && !PATTERNS.portalConfigurationId.test(portalConfigurationId)) {
    return invalid("DATA_API_STRIPE_PORTAL_CONFIGURATION must be a bpc_ portal configuration id.");
  }

  return Object.freeze({
    environment: "test",
    apiVersion: DATA_API_STRIPE_API_VERSION,
    secretKey: values.DATA_API_STRIPE_SECRET_KEY,
    webhookSecret: values.DATA_API_STRIPE_WEBHOOK_SECRET,
    prices: Object.freeze(prices),
    portalConfigurationId: portalConfigurationId === "" ? null : portalConfigurationId,
    // posture.ts reads only DATA_API_CHECKOUT_INTAKE from what it is given.
    intake: dataApiCheckoutIntake(environment === undefined ? process.env : (env as unknown as NodeJS.ProcessEnv)),
  });
}

export type DataApiBillingConfigInspection =
  | { readonly ok: true; readonly config: DataApiBillingConfig }
  | { readonly ok: false; readonly reason: DataApiBillingConfigurationReason };

export function inspectDataApiBillingConfig(environment?: DataApiBillingEnvironment): DataApiBillingConfigInspection {
  try {
    return Object.freeze({ ok: true as const, config: readDataApiBillingConfig(environment) });
  } catch (error) {
    if (!(error instanceof DataApiBillingConfigurationError)) throw error;
    return Object.freeze({ ok: false as const, reason: error.code });
  }
}

/** The plan a configured price id sells, or null for any other price. */
export function planForPrice(config: DataApiBillingConfig, priceId: unknown): DataApiPaidPlanId | null {
  if (typeof priceId !== "string") return null;
  return DATA_API_PAID_PLAN_IDS.find(plan => config.prices[plan] === priceId) ?? null;
}
