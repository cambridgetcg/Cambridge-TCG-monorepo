/**
 * Generic OAuth Callback Route for Third-Party Integrations
 *
 * Handles OAuth callbacks from any integrated provider (Klaviyo, Gorgias, etc.)
 * Validates state, exchanges code for tokens, and stores credentials.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { handleOAuthCallback } from "~/services/integrations/oauth-handler.server";
import type { IntegrationProvider } from "@prisma/client";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Get OAuth parameters from query string
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle OAuth errors from provider
  if (error) {
    console.error(`[OAuth Callback] Provider error: ${error} - ${errorDescription}`);
    return redirect(
      `/app/settings/integrations?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || "")}`
    );
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("[OAuth Callback] Missing code or state parameter");
    return redirect("/app/settings/integrations?error=missing_parameters");
  }

  try {
    // Handle the callback using our generic handler
    const result = await handleOAuthCallback({
      code,
      state,
    });

    if (!result.success) {
      console.error("[OAuth Callback] Handler returned error:", result.error);
      return redirect(
        `/app/settings/integrations?error=${encodeURIComponent(result.error || "oauth_failed")}`
      );
    }

    console.log(
      `[OAuth Callback] Successfully connected ${result.provider} for shop: ${result.shop}`
    );

    // Build success redirect URL
    const successUrl = getSuccessRedirectUrl(result.provider as IntegrationProvider, result.shop || "");
    return redirect(successUrl);
  } catch (err) {
    console.error("[OAuth Callback] Unexpected error:", err);
    return redirect(
      `/app/settings/integrations?error=${encodeURIComponent(
        err instanceof Error ? err.message : "oauth_callback_failed"
      )}`
    );
  }
}

/**
 * Get the redirect URL after successful OAuth connection
 */
function getSuccessRedirectUrl(
  provider: IntegrationProvider,
  _shop: string
): string {
  // Map providers to their settings pages
  const providerPages: Record<string, string> = {
    KLAVIYO: "/app/marketing/klaviyo",
    GORGIAS: "/app/settings/integrations/gorgias",
    // Add more provider-specific pages as needed
  };

  const basePath = providerPages[provider] || "/app/settings/integrations";
  return `${basePath}?connected=true&provider=${provider}`;
}

// No action handler - OAuth callbacks are GET only
export async function action() {
  return redirect("/app/settings/integrations?error=method_not_allowed");
}
