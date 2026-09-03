import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import { getPrismSignalsBetaInterest } from "@/lib/prism-signals/beta-interest.server";
import {
  PRISM_STRIPE_CHECKOUT_METADATA_TYPE,
  PrismStripeStoreError,
  attachPrismStripeCheckoutSession,
  getPrismStripeTestClient,
  prismStripeAccountProblems,
  prismStripePriceProblems,
  readPrismStripeSandboxConfig,
  reservePrismStripeCheckoutAttempt,
  type PrismStripeCheckoutParamsV1,
} from "@/lib/prism-signals/stripe";
import {
  prismStripeError,
  prismStripeHttpErrorResponse,
  prismStripeJson,
  readPrismStripeEmptyJson,
  requirePrismStripeSameOrigin,
} from "../http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REDIRECT_SCHEMA = "cambridgetcg.prism-stripe-redirect/1" as const;

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return (
    actual.length === canonical.length &&
    actual.every((key, index) => key === canonical[index])
  );
}

function exactCheckoutMetadata(
  value: object | null | undefined,
  attemptRef: string,
): boolean {
  const metadata = value as
    | { readonly type?: unknown; readonly attempt_ref?: unknown }
    | null
    | undefined;
  return (
    metadata !== null &&
    metadata !== undefined &&
    exactKeys(metadata, ["attempt_ref", "type"]) &&
    metadata.type === PRISM_STRIPE_CHECKOUT_METADATA_TYPE &&
    metadata.attempt_ref === attemptRef
  );
}

/** Defense in depth at the final provider boundary: no account PII can drift in. */
function checkoutParamsAreSafe(
  params: PrismStripeCheckoutParamsV1,
  expected: {
    readonly attemptRef: string;
    readonly priceId: string;
    readonly origin: string;
  },
): boolean {
  const allowedKeys = [
    "cancel_url",
    "client_reference_id",
    "expires_at",
    "line_items",
    "metadata",
    "mode",
    "payment_method_types",
    "subscription_data",
    ...(params.customer === undefined ? [] : ["customer"]),
    "success_url",
  ];
  if (!exactKeys(params, allowedKeys)) return false;
  if (
    params.mode !== "subscription" ||
    !Array.isArray(params.payment_method_types) ||
    params.payment_method_types.length !== 1 ||
    params.payment_method_types[0] !== "card" ||
    params.client_reference_id !== expected.attemptRef ||
    !exactCheckoutMetadata(params.metadata, expected.attemptRef) ||
    !exactCheckoutMetadata(
      params.subscription_data?.metadata,
      expected.attemptRef,
    ) ||
    !exactKeys(params.subscription_data ?? {}, ["metadata"]) ||
    !Array.isArray(params.line_items) ||
    params.line_items.length !== 1 ||
    !exactKeys(params.line_items[0] ?? {}, ["price", "quantity"]) ||
    params.line_items[0]?.price !== expected.priceId ||
    params.line_items[0]?.quantity !== 1 ||
    !Number.isSafeInteger(params.expires_at) ||
    (params.customer !== undefined && !/^cus_[A-Za-z0-9]{8,}$/.test(params.customer))
  ) {
    return false;
  }

  try {
    const success = new URL(params.success_url ?? "");
    const cancel = new URL(params.cancel_url ?? "");
    return (
      success.origin === expected.origin &&
      success.username === "" &&
      success.password === "" &&
      success.port === "" &&
      success.pathname === "/prism-signals/checkout/return" &&
      success.search === "" &&
      success.hash === "" &&
      cancel.origin === expected.origin &&
      cancel.username === "" &&
      cancel.password === "" &&
      cancel.port === "" &&
      cancel.pathname === "/prism-signals/account" &&
      cancel.search === "" &&
      cancel.hash === ""
    );
  } catch {
    return false;
  }
}

function stripeCheckoutParams(
  params: PrismStripeCheckoutParamsV1,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: params.mode,
    payment_method_types: [...params.payment_method_types],
    client_reference_id: params.client_reference_id,
    line_items: params.line_items.map((item) => ({
      price: item.price,
      quantity: item.quantity,
    })),
    success_url: params.success_url,
    cancel_url: params.cancel_url,
    expires_at: params.expires_at,
    metadata: { ...params.metadata },
    subscription_data: { metadata: { ...params.subscription_data.metadata } },
    ...(params.customer === undefined ? {} : { customer: params.customer }),
  };
}

function checkoutSessionIsSafe(
  session: Stripe.Checkout.Session,
  expected: {
    readonly attemptRef: string;
    readonly currency: string;
    readonly unitAmountMinor: number;
  },
): boolean {
  let url: URL;
  try {
    url = new URL(session.url ?? "");
  } catch {
    return false;
  }
  return (
    /^cs_test_[A-Za-z0-9]{8,128}$/.test(session.id) &&
    session.livemode === false &&
    session.mode === "subscription" &&
    session.status === "open" &&
    session.payment_status === "unpaid" &&
    Array.isArray(session.payment_method_types) &&
    session.payment_method_types.length === 1 &&
    session.payment_method_types[0] === "card" &&
    session.client_reference_id === expected.attemptRef &&
    exactCheckoutMetadata(session.metadata, expected.attemptRef) &&
    session.currency === expected.currency &&
    session.amount_total === expected.unitAmountMinor &&
    Number.isSafeInteger(session.expires_at) &&
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.hostname === "checkout.stripe.com"
  );
}

function storeErrorResponse(error: PrismStripeStoreError): Response {
  if (error.code === "not_eligible") {
    return prismStripeError(
      "beta_interest_required",
      "An active PRISM Signals beta request is required for sandbox Checkout.",
      403,
    );
  }
  if (error.code === "already_active") {
    return prismStripeError(
      "already_subscribed",
      "PRISM Signals All is already active for this account.",
      409,
    );
  }
  if (
    error.code === "checkout_conflict" ||
    error.code === "binding_conflict"
  ) {
    return prismStripeError(
      "checkout_requires_review",
      "This Checkout attempt needs review before it can continue.",
      409,
    );
  }
  return prismStripeError(
    "checkout_unavailable",
    "PRISM Signals sandbox Checkout is not available right now.",
    error.status >= 500 ? error.status : 503,
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    requirePrismStripeSameOrigin(request);
    await readPrismStripeEmptyJson(request);

    const session = await auth();
    if (!session?.user?.id) {
      return prismStripeError(
        "authentication_required",
        "Sign in to start your own PRISM Signals sandbox Checkout.",
        401,
      );
    }

    const config = readPrismStripeSandboxConfig();
    if (
      !config.checkoutIntakeEnabled ||
      !config.webhookProcessingEnabled ||
      config.portalConfigurationId === null
    ) {
      return prismStripeError(
        "checkout_paused",
        "New PRISM Signals sandbox Checkout is paused.",
        503,
      );
    }

    const interest = await getPrismSignalsBetaInterest(session.user.id);
    if (interest === null) {
      return prismStripeError(
        "beta_interest_required",
        "An active PRISM Signals beta request is required for sandbox Checkout.",
        403,
      );
    }

    const stripe = getPrismStripeTestClient(config);
    const [account, price] = await Promise.all([
      stripe.accounts.retrieve(),
      stripe.prices.retrieve(config.priceId),
    ]);
    if (
      prismStripeAccountProblems(account, config).length > 0 ||
      prismStripePriceProblems(price, config).length > 0
    ) {
      return prismStripeError(
        "price_configuration_mismatch",
        "The PRISM Signals sandbox Price did not verify.",
        503,
      );
    }

    const origin = new URL(request.url).origin;
    const reservation = await reservePrismStripeCheckoutAttempt({
      userId: session.user.id,
      origin,
      occurredAt: new Date().toISOString(),
      config,
    });
    const { attempt } = reservation;
    if (
      !checkoutParamsAreSafe(attempt.checkoutParams, {
        attemptRef: attempt.attemptRef,
        priceId: config.priceId,
        origin,
      })
    ) {
      return prismStripeError(
        "checkout_contract_mismatch",
        "The PRISM Signals sandbox Checkout contract did not verify.",
        503,
      );
    }

    const providerParams = stripeCheckoutParams(attempt.checkoutParams);
    const checkout = await stripe.checkout.sessions.create(
      providerParams,
      { idempotencyKey: attempt.idempotencyKey },
    );
    if (
      !checkoutSessionIsSafe(checkout, {
        attemptRef: attempt.attemptRef,
        currency: config.currency,
        unitAmountMinor: config.unitAmountMinor,
      })
    ) {
      return prismStripeError(
        "checkout_session_mismatch",
        "The PRISM Signals sandbox Checkout session did not verify.",
        503,
      );
    }

    await attachPrismStripeCheckoutSession({
      config,
      attemptRef: attempt.attemptRef,
      sessionId: checkout.id,
      expiresAtEpochSeconds: checkout.expires_at,
    });

    return prismStripeJson({
      schema: REDIRECT_SCHEMA,
      kind: "checkout" as const,
      url: checkout.url,
    });
  } catch (error) {
    const requestError = prismStripeHttpErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof PrismStripeStoreError) {
      return storeErrorResponse(error);
    }
    console.error(
      "[prism-signals/stripe/checkout POST] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return prismStripeError(
      "checkout_unavailable",
      "PRISM Signals sandbox Checkout is not available right now.",
      503,
    );
  }
}
