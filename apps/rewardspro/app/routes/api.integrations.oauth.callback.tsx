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
import {
  oauthSettingsErrorPath,
  oauthSettingsSuccessPath,
} from "~/navigation/routes";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Get OAuth parameters from query string
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const requestedProvider = url.searchParams.get("provider");

  // Handle OAuth errors from provider
  if (error) {
    console.error(`[OAuth Callback] Provider error: ${error} - ${errorDescription}`);
    return redirect(
      oauthSettingsErrorPath(error, {
        errorDescription,
        provider: requestedProvider,
      }),
    );
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("[OAuth Callback] Missing code or state parameter");
    return redirect(
      oauthSettingsErrorPath("missing_parameters", {
        provider: requestedProvider,
      }),
    );
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
        oauthSettingsErrorPath(result.error || "oauth_failed", {
          provider: result.provider || requestedProvider,
        }),
      );
    }

    console.log(
      `[OAuth Callback] Successfully connected ${result.provider} for shop: ${result.shop}`
    );

    // Build success redirect URL
    const successUrl = oauthSettingsSuccessPath(
      result.provider as IntegrationProvider,
    );
    return redirect(successUrl);
  } catch (err) {
    console.error("[OAuth Callback] Unexpected error:", err);
    return redirect(
      oauthSettingsErrorPath(
        err instanceof Error ? err.message : "oauth_callback_failed",
        { provider: requestedProvider },
      ),
    );
  }
}

// No action handler - OAuth callbacks are GET only
export async function action() {
  return redirect(oauthSettingsErrorPath("method_not_allowed"));
}
