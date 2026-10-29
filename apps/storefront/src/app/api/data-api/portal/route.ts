import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import {
  DataApiBillingNotProvisionedError,
  dataApiPortalConfigurationProblems,
  findDataApiCustomer,
  getDataApiStripeTestClient,
  inspectDataApiBillingConfig,
} from "@/lib/data-api/billing";
import {
  billingError,
  billingHttpErrorResponse,
  billingJson,
  readEmptyBillingBody,
  requireBillingSameOrigin,
} from "@/lib/data-api/billing/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REDIRECT_SCHEMA = "cambridgetcg.data-api-billing-redirect/1" as const;

function providerId(value: string | { readonly id: string }): string {
  return typeof value === "string" ? value : value.id;
}

function validPortalSession(
  session: Stripe.BillingPortal.Session,
  expected: { readonly customerId: string; readonly configurationId: string; readonly returnUrl: string },
): boolean {
  let url: URL;
  try {
    url = new URL(session.url);
  } catch {
    return false;
  }
  return (
    session.livemode === false
    && session.customer === expected.customerId
    && providerId(session.configuration) === expected.configurationId
    && session.return_url === expected.returnUrl
    && url.protocol === "https:" && url.username === "" && url.password === "" && url.port === ""
    && url.hostname === "billing.stripe.com"
  );
}

/**
 * Opens Stripe's billing portal for the account's own data-API customer, so a
 * subscriber can change or cancel. It does not depend on checkout intake:
 * cancelling an existing subscription stays possible while checkout is closed.
 * Every session is pinned to DATA_API_STRIPE_PORTAL_CONFIGURATION, after PRISM,
 * never the test account's default, and the configuration is retrieved first
 * and must offer only the two plans' prices, no quantity change, and
 * cancellation at period end (dataApiPortalConfigurationProblems).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    requireBillingSameOrigin(request);
    await readEmptyBillingBody(request);
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return billingError("authentication_required", "Sign in to manage your data-API plan.", 401);

    const inspected = inspectDataApiBillingConfig();
    if (!inspected.ok) return billingError("portal_unavailable", "Data-API billing is not configured.", 503);
    const config = inspected.config;
    const configurationId = config.portalConfigurationId;
    if (configurationId === null) return billingError("portal_unavailable", "The data-API billing portal is not configured.", 503);

    const customerId = await findDataApiCustomer(userId);
    if (customerId === null) {
      return billingError("portal_not_available", "This account has no data-API billing record to manage.", 409);
    }

    const returnUrl = `${new URL(request.url).origin}/account/data`;
    const stripe = getDataApiStripeTestClient(config);
    const configuration = await stripe.billingPortal.configurations.retrieve(configurationId, { expand: ["features.subscription_update.products"] });
    const problems = dataApiPortalConfigurationProblems(configuration, config);
    if (problems.length > 0) {
      console.error("[data-api/portal POST] the portal configuration did not verify", problems.join(","));
      return billingError("portal_configuration_mismatch", "The data-API billing portal configuration did not verify.", 503);
    }
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, configuration: configurationId, return_url: returnUrl });
    if (!validPortalSession(portal, { customerId, configurationId, returnUrl })) {
      return billingError("portal_session_mismatch", "The Stripe billing portal session did not verify.", 503);
    }
    return billingJson({ schema: REDIRECT_SCHEMA, kind: "portal" as const, url: portal.url });
  } catch (error) {
    const requestError = billingHttpErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof DataApiBillingNotProvisionedError) return billingError(error.code, error.message, 503);
    console.error("[data-api/portal POST] unavailable", error instanceof Error ? error.name : "UnknownError");
    return billingError("portal_unavailable", "The data-API billing portal is unavailable right now.", 503);
  }
}
