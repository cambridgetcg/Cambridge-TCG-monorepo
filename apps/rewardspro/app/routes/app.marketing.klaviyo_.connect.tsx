/**
 * Klaviyo OAuth Connect Route (flattened outside the Klaviyo UI route)
 *
 * Initiates the OAuth flow by redirecting merchants to Klaviyo's authorization page.
 * After authorization, Klaviyo redirects back to /api/klaviyo/callback
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import {
  generateAuthorizationUrl,
  buildRedirectUri,
  isOAuthConfigured,
} from "~/services/klaviyo-oauth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Rate-based model: All plans have access to Klaviyo integration

  // Check if OAuth is configured
  if (!isOAuthConfigured()) {
    console.error("[Klaviyo OAuth] OAuth credentials not configured");
    return redirect("/app/marketing/klaviyo?error=oauth_not_configured");
  }

  // Get the app URL from the request
  const url = new URL(request.url);
  const appUrl = `${url.protocol}//${url.host}`;
  const redirectUri = buildRedirectUri(appUrl);

  // Generate authorization URL with state
  const { url: authUrl } = generateAuthorizationUrl(
    shop,
    redirectUri,
    "/app/marketing/klaviyo"
  );

  console.log(`[Klaviyo OAuth] Initiating OAuth for shop: ${shop}`);
  console.log(`[Klaviyo OAuth] Redirect URI: ${redirectUri}`);

  // Redirect to Klaviyo authorization page
  return redirect(authUrl);
}
