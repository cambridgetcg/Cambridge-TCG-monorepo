/**
 * OAuth Initiation Route for Third-Party Integrations
 *
 * Starts the OAuth flow by generating an authorization URL and redirecting
 * the user to the provider's authorization page.
 *
 * Route: GET /api/integrations/oauth/start?provider=KLAVIYO
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect, json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { initiateOAuth } from "~/services/integrations/oauth-handler.server";
import type { IntegrationProvider } from "@prisma/client";
import { oauthSettingsErrorPath } from "~/navigation/routes";

// Valid OAuth providers
const OAUTH_PROVIDERS: IntegrationProvider[] = [
  "KLAVIYO",
  "GORGIAS",
  "ZENDESK",
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") as IntegrationProvider | null;
  const returnUrl = url.searchParams.get("returnUrl");

  // Validate provider
  if (!provider) {
    return json({ error: "Provider is required" }, { status: 400 });
  }

  if (!OAUTH_PROVIDERS.includes(provider)) {
    return json(
      { error: `Provider ${provider} does not support OAuth` },
      { status: 400 }
    );
  }

  try {
    console.log(`[OAuth Start] Initiating OAuth for ${provider}, shop: ${session.shop}`);

    // Build redirect URI for OAuth callback
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/integrations/oauth/callback`;

    // Initiate OAuth flow
    const result = await initiateOAuth({
      shop: session.shop,
      provider,
      redirectUri,
      returnUrl: returnUrl || undefined,
    });

    if (!result.success || !result.authorizationUrl) {
      console.error(`[OAuth Start] Failed to initiate OAuth:`, result.error);
      return redirect(
        oauthSettingsErrorPath(result.error || "oauth_init_failed", {
          provider,
        }),
      );
    }

    console.log(`[OAuth Start] Redirecting to authorization URL for ${provider}`);

    // Redirect to provider's authorization page
    return redirect(result.authorizationUrl);
  } catch (error) {
    console.error("[OAuth Start] Unexpected error:", error);
    return redirect(
      oauthSettingsErrorPath(
        error instanceof Error ? error.message : "oauth_init_failed",
        { provider },
      ),
    );
  }
}

// No POST - OAuth initiation is GET only (redirect-based)
export async function action() {
  return json({ error: "Method not allowed" }, { status: 405 });
}
