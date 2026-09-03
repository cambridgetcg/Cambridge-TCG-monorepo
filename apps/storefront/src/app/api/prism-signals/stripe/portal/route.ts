import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import {
  findPrismStripePortalBinding,
  getPrismStripeTestClient,
  prismStripeAccountProblems,
  prismStripePortalConfigurationProblems,
  readPrismStripeSandboxConfig,
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

function providerId(value: string | { readonly id: string }): string {
  return typeof value === "string" ? value : value.id;
}

function validPortalSession(
  session: Stripe.BillingPortal.Session,
  expected: {
    readonly customerId: string;
    readonly configurationId: string;
    readonly returnUrl: string;
  },
): boolean {
  let url: URL;
  try {
    url = new URL(session.url);
  } catch {
    return false;
  }
  return (
    session.livemode === false &&
    session.customer === expected.customerId &&
    providerId(session.configuration) === expected.configurationId &&
    session.return_url === expected.returnUrl &&
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.hostname === "billing.stripe.com"
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
        "Sign in to manage your own PRISM Signals subscription.",
        401,
      );
    }

    const config = readPrismStripeSandboxConfig();
    const binding = await findPrismStripePortalBinding({
      userId: session.user.id,
      config,
    });
    if (binding === null) {
      return prismStripeError(
        "portal_not_available",
        "No owner-bound PRISM Signals sandbox customer is available.",
        409,
      );
    }

    const stripe = getPrismStripeTestClient(config);
    const [account, portal] = await Promise.all([
      stripe.accounts.retrieve(),
      stripe.billingPortal.configurations.retrieve(
        binding.portalConfigurationId,
      ),
    ]);
    if (
      prismStripeAccountProblems(account, config).length > 0 ||
      prismStripePortalConfigurationProblems(portal, config).length > 0
    ) {
      return prismStripeError(
        "portal_configuration_mismatch",
        "The PRISM Signals sandbox portal configuration did not verify.",
        503,
      );
    }

    const returnUrl = `${new URL(request.url).origin}/prism-signals/account`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: binding.customerId,
      configuration: binding.portalConfigurationId,
      return_url: returnUrl,
    });
    if (
      !validPortalSession(portalSession, {
        customerId: binding.customerId,
        configurationId: binding.portalConfigurationId,
        returnUrl,
      })
    ) {
      return prismStripeError(
        "portal_session_mismatch",
        "The PRISM Signals sandbox portal session did not verify.",
        503,
      );
    }

    return prismStripeJson({
      schema: REDIRECT_SCHEMA,
      kind: "portal" as const,
      url: portalSession.url,
    });
  } catch (error) {
    const requestError = prismStripeHttpErrorResponse(error);
    if (requestError) return requestError;
    console.error(
      "[prism-signals/stripe/portal POST] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return prismStripeError(
      "portal_unavailable",
      "The PRISM Signals sandbox billing portal is not available right now.",
      503,
    );
  }
}
