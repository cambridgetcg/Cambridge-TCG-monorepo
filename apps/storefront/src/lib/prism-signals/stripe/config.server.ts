import "server-only";
import { PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR } from "@cambridge-tcg/prism-signals-core";

export const PRISM_STRIPE_TEST_POSTURE = "stripe-test-v1" as const;
export const PRISM_STRIPE_API_VERSION = "2026-02-25.clover" as const;
export const PRISM_STRIPE_KEY_PERMISSION_ATTESTATION =
  "prism-runtime-rk-v1" as const;
export const PRISM_STRIPE_CURRENCY = "gbp" as const;
export const PRISM_STRIPE_INTERVAL = "month" as const;

export type PrismStripeConfigurationReason =
  | "not_configured"
  | "invalid_configuration";

export interface PrismStripeEnvironmentV1 {
  readonly PRISM_STRIPE_POSTURE?: string;
  readonly PRISM_STRIPE_SECRET_KEY?: string;
  readonly PRISM_STRIPE_KEY_PERMISSION_ATTESTATION?: string;
  readonly PRISM_STRIPE_WEBHOOK_SECRET?: string;
  readonly PRISM_STRIPE_ACCOUNT_ID?: string;
  readonly PRISM_STRIPE_API_VERSION?: string;
  readonly PRISM_STRIPE_ALL_PRICE_ID?: string;
  readonly PRISM_STRIPE_EXPECTED_PRODUCT_ID?: string;
  readonly PRISM_STRIPE_PORTAL_CONFIGURATION_ID?: string;
  readonly PRISM_STRIPE_REFERENCE_SECRET?: string;
  readonly PRISM_STRIPE_CHECKOUT_INTAKE?: string;
  readonly PRISM_STRIPE_WEBHOOK_PROCESSING?: string;
}

export interface PrismStripeSandboxConfigV1 {
  readonly posture: typeof PRISM_STRIPE_TEST_POSTURE;
  readonly environment: "test";
  readonly apiVersion: typeof PRISM_STRIPE_API_VERSION;
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly accountId: string;
  readonly priceId: string;
  readonly productId: string;
  readonly portalConfigurationId: string | null;
  readonly referenceSecret: string;
  readonly checkoutIntakeEnabled: boolean;
  readonly webhookProcessingEnabled: boolean;
  readonly currency: typeof PRISM_STRIPE_CURRENCY;
  readonly unitAmountMinor: typeof PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR;
  readonly interval: typeof PRISM_STRIPE_INTERVAL;
}

export class PrismStripeConfigurationError extends Error {
  readonly code: PrismStripeConfigurationReason;

  constructor(code: PrismStripeConfigurationReason, message: string) {
    super(message);
    this.name = "PrismStripeConfigurationError";
    this.code = code;
  }
}

const PATTERNS = Object.freeze({
  secretKey: /^rk_test_[A-Za-z0-9_]{16,240}$/,
  webhookSecret: /^whsec_[A-Za-z0-9_]{16,240}$/,
  accountId: /^acct_[A-Za-z0-9]{8,64}$/,
  priceId: /^price_[A-Za-z0-9]{8,64}$/,
  productId: /^prod_[A-Za-z0-9]{8,64}$/,
  portalConfigurationId: /^bpc_[A-Za-z0-9]{8,64}$/,
  referenceSecret: /^[\x21-\x7e]{32,512}$/,
});

function processEnvironment(): PrismStripeEnvironmentV1 {
  return {
    PRISM_STRIPE_POSTURE: process.env.PRISM_STRIPE_POSTURE,
    PRISM_STRIPE_SECRET_KEY: process.env.PRISM_STRIPE_SECRET_KEY,
    PRISM_STRIPE_KEY_PERMISSION_ATTESTATION:
      process.env.PRISM_STRIPE_KEY_PERMISSION_ATTESTATION,
    PRISM_STRIPE_WEBHOOK_SECRET: process.env.PRISM_STRIPE_WEBHOOK_SECRET,
    PRISM_STRIPE_ACCOUNT_ID: process.env.PRISM_STRIPE_ACCOUNT_ID,
    PRISM_STRIPE_API_VERSION: process.env.PRISM_STRIPE_API_VERSION,
    PRISM_STRIPE_ALL_PRICE_ID: process.env.PRISM_STRIPE_ALL_PRICE_ID,
    PRISM_STRIPE_EXPECTED_PRODUCT_ID:
      process.env.PRISM_STRIPE_EXPECTED_PRODUCT_ID,
    PRISM_STRIPE_PORTAL_CONFIGURATION_ID:
      process.env.PRISM_STRIPE_PORTAL_CONFIGURATION_ID,
    PRISM_STRIPE_REFERENCE_SECRET: process.env.PRISM_STRIPE_REFERENCE_SECRET,
    PRISM_STRIPE_CHECKOUT_INTAKE: process.env.PRISM_STRIPE_CHECKOUT_INTAKE,
    PRISM_STRIPE_WEBHOOK_PROCESSING:
      process.env.PRISM_STRIPE_WEBHOOK_PROCESSING,
  };
}

function trimmed(
  env: PrismStripeEnvironmentV1,
  key: keyof PrismStripeEnvironmentV1,
): string {
  return env[key]?.trim() ?? "";
}

function invalid(message: string): never {
  throw new PrismStripeConfigurationError("invalid_configuration", message);
}

function enabledOnly(value: string): boolean {
  return value === "enabled";
}

type PrismStripeSwitchState = "enabled" | "disabled" | "invalid";

function switchState(value: string): PrismStripeSwitchState {
  return value === "enabled" || value === "disabled" ? value : "invalid";
}

/**
 * Load the dedicated PRISM test account. There is deliberately no live-key
 * branch and no fallback to the storefront's other Stripe integration.
 */
export function readPrismStripeSandboxConfig(
  environment?: PrismStripeEnvironmentV1,
): PrismStripeSandboxConfigV1 {
  const env = environment ?? processEnvironment();
  const posture = trimmed(env, "PRISM_STRIPE_POSTURE");
  if (!posture) {
    throw new PrismStripeConfigurationError(
      "not_configured",
      "PRISM Stripe sandbox is not configured.",
    );
  }
  if (posture !== PRISM_STRIPE_TEST_POSTURE) {
    return invalid("PRISM Stripe accepts only its explicit test posture.");
  }

  const secretKey = trimmed(env, "PRISM_STRIPE_SECRET_KEY");
  const keyPermissionAttestation = trimmed(
    env,
    "PRISM_STRIPE_KEY_PERMISSION_ATTESTATION",
  );
  const webhookSecret = trimmed(env, "PRISM_STRIPE_WEBHOOK_SECRET");
  const accountId = trimmed(env, "PRISM_STRIPE_ACCOUNT_ID");
  const apiVersion = trimmed(env, "PRISM_STRIPE_API_VERSION");
  const priceId = trimmed(env, "PRISM_STRIPE_ALL_PRICE_ID");
  const productId = trimmed(env, "PRISM_STRIPE_EXPECTED_PRODUCT_ID");
  const portalConfigurationId = trimmed(
    env,
    "PRISM_STRIPE_PORTAL_CONFIGURATION_ID",
  );
  const referenceSecret = trimmed(env, "PRISM_STRIPE_REFERENCE_SECRET");

  if (!PATTERNS.secretKey.test(secretKey)) {
    return invalid(
      "PRISM Stripe requires a dedicated restricted rk_test_ key.",
    );
  }
  if (keyPermissionAttestation !== PRISM_STRIPE_KEY_PERMISSION_ATTESTATION) {
    return invalid(
      `PRISM Stripe key permissions must be attested as ${PRISM_STRIPE_KEY_PERMISSION_ATTESTATION}.`,
    );
  }
  if (!PATTERNS.webhookSecret.test(webhookSecret)) {
    return invalid("PRISM Stripe requires a dedicated whsec_ signing secret.");
  }
  if (!PATTERNS.accountId.test(accountId)) {
    return invalid("PRISM Stripe requires one expected acct_ account id.");
  }
  if (apiVersion !== PRISM_STRIPE_API_VERSION) {
    return invalid(`PRISM Stripe API version must be ${PRISM_STRIPE_API_VERSION}.`);
  }
  if (!PATTERNS.priceId.test(priceId)) {
    return invalid("PRISM Stripe requires one expected price_ id.");
  }
  if (!PATTERNS.productId.test(productId)) {
    return invalid("PRISM Stripe requires one expected prod_ id.");
  }
  if (!PATTERNS.referenceSecret.test(referenceSecret)) {
    return invalid("PRISM Stripe reference secret must contain 32-512 ASCII characters.");
  }

  return Object.freeze({
    posture: PRISM_STRIPE_TEST_POSTURE,
    environment: "test",
    apiVersion: PRISM_STRIPE_API_VERSION,
    secretKey,
    webhookSecret,
    accountId,
    priceId,
    productId,
    portalConfigurationId: PATTERNS.portalConfigurationId.test(
      portalConfigurationId,
    )
      ? portalConfigurationId
      : null,
    referenceSecret,
    checkoutIntakeEnabled: enabledOnly(
      trimmed(env, "PRISM_STRIPE_CHECKOUT_INTAKE"),
    ),
    webhookProcessingEnabled: enabledOnly(
      trimmed(env, "PRISM_STRIPE_WEBHOOK_PROCESSING"),
    ),
    currency: PRISM_STRIPE_CURRENCY,
    unitAmountMinor: PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR,
    interval: PRISM_STRIPE_INTERVAL,
  });
}

export type PrismStripeSandboxConfigInspectionV1 =
  | { readonly ok: true; readonly config: PrismStripeSandboxConfigV1 }
  | { readonly ok: false; readonly reason: PrismStripeConfigurationReason };

export function inspectPrismStripeSandboxConfig(
  environment?: PrismStripeEnvironmentV1,
): PrismStripeSandboxConfigInspectionV1 {
  try {
    return Object.freeze({
      ok: true as const,
      config: readPrismStripeSandboxConfig(environment),
    });
  } catch (error) {
    if (!(error instanceof PrismStripeConfigurationError)) throw error;
    return Object.freeze({ ok: false as const, reason: error.code });
  }
}

export type PrismStripeSandboxPublicPostureReason =
  | PrismStripeConfigurationReason
  | "portal_not_configured"
  | "portal_invalid_configuration"
  | "switch_invalid_configuration"
  | "intake_without_processing"
  | "configured_paused"
  | "processing_only"
  | "available";

export type PrismStripeSandboxPublicPostureV1 = Readonly<{
  configured: boolean;
  processing_available: boolean;
  checkout_available: boolean;
  portal_available: boolean;
  reason: PrismStripeSandboxPublicPostureReason;
}>;

/** Non-secret status safe for server-rendered public UI. */
export function prismStripeSandboxPublicPosture(
  environment?: PrismStripeEnvironmentV1,
): PrismStripeSandboxPublicPostureV1 {
  const env = environment ?? processEnvironment();
  const inspected = inspectPrismStripeSandboxConfig(env);
  if (!inspected.ok) {
    return Object.freeze({
      configured: false,
      processing_available: false,
      checkout_available: false,
      portal_available: false,
      reason: inspected.reason,
    });
  }

  const portalValue = trimmed(env, "PRISM_STRIPE_PORTAL_CONFIGURATION_ID");
  const processingState = switchState(
    trimmed(env, "PRISM_STRIPE_WEBHOOK_PROCESSING"),
  );
  const intakeState = switchState(
    trimmed(env, "PRISM_STRIPE_CHECKOUT_INTAKE"),
  );
  const processing = processingState === "enabled";

  // Portal syntax is assessed before switch ordering. Missing or malformed
  // portal configuration is therefore never mistaken for an ordinary paused
  // acquisition stage, regardless of either switch value.
  if (portalValue === "") {
    return Object.freeze({
      configured: true,
      processing_available: processing,
      checkout_available: false,
      portal_available: false,
      reason: "portal_not_configured",
    });
  }
  if (!PATTERNS.portalConfigurationId.test(portalValue)) {
    return Object.freeze({
      configured: true,
      processing_available: processing,
      checkout_available: false,
      portal_available: false,
      reason: "portal_invalid_configuration",
    });
  }
  if (processingState === "invalid" || intakeState === "invalid") {
    return Object.freeze({
      configured: true,
      processing_available: processing,
      checkout_available: false,
      portal_available: true,
      reason: "switch_invalid_configuration",
    });
  }
  if (processingState === "disabled" && intakeState === "enabled") {
    return Object.freeze({
      configured: true,
      processing_available: false,
      checkout_available: false,
      portal_available: true,
      reason: "intake_without_processing",
    });
  }

  const checkout = processingState === "enabled" && intakeState === "enabled";
  return Object.freeze({
    configured: true,
    processing_available: processing,
    checkout_available: checkout,
    portal_available: true,
    reason:
      processingState === "disabled"
        ? "configured_paused"
        : intakeState === "disabled"
          ? "processing_only"
          : "available",
  });
}
