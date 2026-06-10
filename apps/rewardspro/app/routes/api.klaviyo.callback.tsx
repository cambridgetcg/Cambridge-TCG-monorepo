/**
 * Klaviyo OAuth Callback Route
 *
 * Handles the OAuth callback from Klaviyo after merchant authorization.
 * Exchanges the authorization code for access and refresh tokens.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  parseOAuthState,
  exchangeCodeForTokens,
  storeOAuthTokens,
  buildRedirectUri,
  retrievePkceVerifier,
} from "~/services/klaviyo-oauth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Get OAuth parameters from query string
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle OAuth errors from Klaviyo
  if (error) {
    console.error(`[Klaviyo OAuth] Error from Klaviyo: ${error} - ${errorDescription}`);
    return redirect(`/app/marketing/klaviyo?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || "")}`);
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("[Klaviyo OAuth] Missing code or state parameter");
    return redirect("/app/marketing/klaviyo?error=missing_parameters");
  }

  // Parse and validate state
  const stateData = parseOAuthState(state);
  if (!stateData || !stateData.shop) {
    console.error("[Klaviyo OAuth] Invalid state parameter");
    return redirect("/app/marketing/klaviyo?error=invalid_state");
  }

  const { shop, returnUrl } = stateData;
  console.log(`[Klaviyo OAuth] Processing callback for shop: ${shop}`);

  // Retrieve PKCE verifier (stored during authorization URL generation)
  const pkceData = retrievePkceVerifier(state);
  if (!pkceData || !pkceData.verifier) {
    console.error("[Klaviyo OAuth] PKCE verifier not found for state");
    return redirect("/app/marketing/klaviyo?error=pkce_verifier_missing");
  }

  // Verify shop matches
  if (pkceData.shop !== shop) {
    console.error("[Klaviyo OAuth] Shop mismatch in PKCE data");
    return redirect("/app/marketing/klaviyo?error=shop_mismatch");
  }

  try {
    // Build redirect URI (must match what was used in authorization request)
    const appUrl = `${url.protocol}//${url.host}`;
    const redirectUri = buildRedirectUri(appUrl);

    // Exchange authorization code for tokens (with PKCE verifier)
    const tokens = await exchangeCodeForTokens(code, redirectUri, pkceData.verifier);
    console.log(`[Klaviyo OAuth] Token exchange successful for shop: ${shop}`);

    // Store tokens securely
    await storeOAuthTokens(shop, tokens);
    console.log(`[Klaviyo OAuth] Tokens stored for shop: ${shop}`);

    // Redirect back to Klaviyo settings page with success message
    const successUrl = returnUrl || "/app/marketing/klaviyo";
    return redirect(`${successUrl}?connected=true`);
  } catch (err) {
    console.error("[Klaviyo OAuth] Token exchange failed:", err);
    return redirect(`/app/marketing/klaviyo?error=token_exchange_failed`);
  }
}
