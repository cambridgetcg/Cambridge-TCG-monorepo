import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import { dataApiCheckoutIntake } from "@/lib/data-api/posture";
import { DATA_API_SUBSCRIPTION_TYPE } from "@/lib/payments/checkout-session-kind";
import {
  DataApiBillingNotProvisionedError,
  bindDataApiCustomer,
  dataApiPriceProblems,
  findDataApiCustomer,
  getDataApiStripeTestClient,
  inspectDataApiBillingConfig,
  listOpenDataApiSubscriptions,
} from "@/lib/data-api/billing";
import {
  billingError,
  billingHttpErrorResponse,
  billingJson,
  readCheckoutPlanBody,
  requireBillingSameOrigin,
} from "@/lib/data-api/billing/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_API_CHECKOUT_CLOSED_CODE = "DATA_API_CHECKOUT_CLOSED";
const REDIRECT_SCHEMA = "cambridgetcg.data-api-billing-redirect/1" as const;
const CUSTOMER_TYPE = "data_api_customer";
// A repeated request inside one window (a double click, a retry) reuses the
// same Checkout Session through Stripe's idempotency; the session expires an
// hour after its window opened, so always at least fifty minutes after creation.
const IDEMPOTENCY_WINDOW_SECONDS = 600;
const SESSION_LIFETIME_SECONDS = 3600;
const IDS = Object.freeze({
  customer: /^cus_[A-Za-z0-9]{8,64}$/,
  session: /^cs_test_[A-Za-z0-9]{8,128}$/,
});

function validCheckoutSession(
  session: Stripe.Checkout.Session,
  expected: { readonly customerId: string; readonly userId: string },
): session is Stripe.Checkout.Session & { url: string } {
  if (typeof session.url !== "string") return false;
  let url: URL;
  try {
    url = new URL(session.url);
  } catch {
    return false;
  }
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  return (
    session.object === "checkout.session"
    && session.livemode === false
    && IDS.session.test(session.id)
    && session.mode === "subscription"
    && customer === expected.customerId
    && session.client_reference_id === expected.userId
    && session.metadata?.type === DATA_API_SUBSCRIPTION_TYPE
    && url.protocol === "https:" && url.username === "" && url.password === "" && url.port === ""
    && url.hostname === "checkout.stripe.com"
  );
}

/** Test-mode checkout admits operators only: accounts whose users.role is this. */
const DATA_API_TEST_CHECKOUT_ROLE = "admin";

/**
 * Opens a test-mode subscription Checkout for a data-API plan. Closed (410)
 * unless DATA_API_CHECKOUT_INTAKE is "test", and then open only to operators
 * (users.role = 'admin') testing the round trip: on production a member could
 * otherwise pay with a Stripe test card and hold a paid plan's entitlement for
 * nothing. Every other account gets the same closed answer, since no plan is
 * on sale to it. Both refusals answer after validating the request and the
 * session (which reads the database), before any configuration or Stripe
 * call. Before a
 * customer or a session is created, the configured price is retrieved and
 * must be the plan's own (dataApiPriceProblems), and checkout stays shut while
 * no portal configuration is pinned.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    requireBillingSameOrigin(request);
    const plan = await readCheckoutPlanBody(request);
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return billingError("authentication_required", "Sign in to choose a data-API plan.", 401);
    // The session reads role from the users row on every request (database sessions, lib/auth/adapter.ts).
    if (dataApiCheckoutIntake() !== "test" || session?.user?.role !== DATA_API_TEST_CHECKOUT_ROLE) {
      return billingError(DATA_API_CHECKOUT_CLOSED_CODE, "Data-API checkout is closed. No paid data-API plan is on sale; the free plan is open to every account.", 410);
    }

    const inspected = inspectDataApiBillingConfig();
    // A subscriber changes or cancels through the pinned portal, so nothing is sold without it.
    if (!inspected.ok || inspected.config.portalConfigurationId === null) {
      return billingError("checkout_unavailable", "Data-API checkout is not configured.", 503);
    }
    const config = inspected.config;

    // One subscription at a time: changing plan or cancelling goes through the portal.
    if ((await listOpenDataApiSubscriptions(userId)).length > 0) {
      return billingError("subscription_exists", "This account already holds a data-API subscription. Change or cancel it in the billing portal.", 409);
    }

    const stripe = getDataApiStripeTestClient(config);
    // The environment names the price; Stripe says what it is. It is sold only as the catalogue's plan.
    const price = await stripe.prices.retrieve(config.prices[plan], { expand: ["product"] });
    const priceProblems = dataApiPriceProblems(price, plan, config);
    if (priceProblems.length > 0) {
      console.error("[data-api/checkout POST] the configured price did not verify", priceProblems.join(","));
      return billingError("checkout_price_mismatch", "The configured Stripe price did not verify.", 503);
    }

    let customerId = await findDataApiCustomer(userId);
    if (customerId === null) {
      const created = await stripe.customers.create(
        { metadata: { type: CUSTOMER_TYPE, user_id: userId } },
        { idempotencyKey: `data-api:test:customer:${userId}` },
      );
      if (created.livemode !== false || !IDS.customer.test(created.id)) {
        return billingError("checkout_unavailable", "The Stripe customer did not verify as test mode.", 503);
      }
      customerId = await bindDataApiCustomer(userId, created.id);
    }

    const origin = new URL(request.url).origin;
    const windowStart = Math.floor(Date.now() / 1000 / IDEMPOTENCY_WINDOW_SECONDS) * IDEMPOTENCY_WINDOW_SECONDS;
    const metadata = { type: DATA_API_SUBSCRIPTION_TYPE, plan, user_id: userId };
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: config.prices[plan], quantity: 1 }],
      success_url: `${origin}/account/data?billing=complete`,
      cancel_url: `${origin}/account/data?billing=cancelled`,
      expires_at: windowStart + SESSION_LIFETIME_SECONDS,
      metadata,
      subscription_data: { metadata },
    };
    // The key is the exact request, so it can only ever replay the same request.
    const idempotencyKey = `data-api:test:checkout:${createHash("sha256").update(JSON.stringify(params)).digest("hex")}`;
    const checkout = await stripe.checkout.sessions.create(params, { idempotencyKey });
    if (!validCheckoutSession(checkout, { customerId, userId })) {
      return billingError("checkout_session_mismatch", "The Stripe Checkout Session did not verify.", 503);
    }
    return billingJson({ schema: REDIRECT_SCHEMA, kind: "checkout" as const, url: checkout.url });
  } catch (error) {
    const requestError = billingHttpErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof DataApiBillingNotProvisionedError) return billingError(error.code, error.message, 503);
    console.error("[data-api/checkout POST] unavailable", error instanceof Error ? error.name : "UnknownError");
    return billingError("checkout_unavailable", "Data-API checkout is unavailable right now.", 503);
  }
}
