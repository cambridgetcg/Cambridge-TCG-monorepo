/**
 * OAuth Handler Service
 *
 * Handles OAuth 2.0 authentication flows with PKCE support
 * for third-party integrations.
 */

import { randomBytes, createHash } from "crypto";
import prisma from "~/db.server";
import { createLogger } from "~/services/logger.server";
import { getAdapter, hasAdapter, storeOAuthTokens } from "./integration-manager.server";
import type { IntegrationProvider } from "@prisma/client";

const logger = createLogger("OAuthHandler");

// PKCE constants
const CODE_VERIFIER_LENGTH = 64;
const STATE_LENGTH = 32;
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ═══════════════════════════════════════════════════════════════════════════
// PKCE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a cryptographically secure code verifier for PKCE
 */
export function generateCodeVerifier(): string {
  return randomBytes(CODE_VERIFIER_LENGTH)
    .toString("base64url")
    .slice(0, CODE_VERIFIER_LENGTH);
}

/**
 * Generate code challenge from code verifier using S256 method
 */
export function generateCodeChallenge(codeVerifier: string): string {
  return createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
}

/**
 * Generate a cryptographically secure state parameter
 */
export function generateState(): string {
  return randomBytes(STATE_LENGTH).toString("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface OAuthStateData {
  shop: string;
  provider: IntegrationProvider;
  redirectUri: string;
  codeVerifier?: string;
  returnUrl?: string;
}

/**
 * Create and store OAuth state
 */
export async function createOAuthState(data: OAuthStateData): Promise<string> {
  const state = generateState();
  const expiresAt = new Date(Date.now() + STATE_EXPIRY_MS);

  await prisma.oAuthState.create({
    data: {
      state,
      shop: data.shop,
      provider: data.provider,
      redirectUri: data.redirectUri,
      codeVerifier: data.codeVerifier || null,
      metadata: data.returnUrl ? { returnUrl: data.returnUrl } : {},
      expiresAt,
    },
  });

  logger.debug("OAuth state created", {
    shop: data.shop,
    provider: data.provider,
    expiresAt,
  });

  return state;
}

/**
 * Validate and retrieve OAuth state
 */
export async function validateOAuthState(
  state: string
): Promise<OAuthStateData | null> {
  const oauthState = await prisma.oAuthState.findUnique({
    where: { state },
  });

  if (!oauthState) {
    logger.warn("OAuth state not found", { state: state.slice(0, 8) + "..." });
    return null;
  }

  // Check if expired
  if (oauthState.expiresAt < new Date()) {
    logger.warn("OAuth state expired", {
      state: state.slice(0, 8) + "...",
      expiredAt: oauthState.expiresAt,
    });
    // Clean up expired state
    await prisma.oAuthState.delete({ where: { state } }).catch(() => {});
    return null;
  }

  // Check if already used
  if (oauthState.used) {
    logger.warn("OAuth state already used", { state: state.slice(0, 8) + "..." });
    return null;
  }

  return {
    shop: oauthState.shop,
    provider: oauthState.provider as IntegrationProvider,
    redirectUri: oauthState.redirectUri,
    codeVerifier: oauthState.codeVerifier || undefined,
    returnUrl: (oauthState.metadata as { returnUrl?: string })?.returnUrl,
  };
}

/**
 * Mark OAuth state as used
 */
export async function markStateAsUsed(state: string): Promise<void> {
  await prisma.oAuthState.update({
    where: { state },
    data: { used: true },
  });
}

/**
 * Delete OAuth state
 */
export async function deleteOAuthState(state: string): Promise<void> {
  await prisma.oAuthState.delete({
    where: { state },
  }).catch(() => {
    // Ignore if already deleted
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHORIZATION FLOW
// ═══════════════════════════════════════════════════════════════════════════

export interface InitiateOAuthOptions {
  shop: string;
  provider: IntegrationProvider;
  redirectUri: string;
  returnUrl?: string;
}

export interface InitiateOAuthResult {
  success: boolean;
  authorizationUrl?: string;
  error?: string;
}

/**
 * Initiate OAuth authorization flow
 */
export async function initiateOAuth(
  options: InitiateOAuthOptions
): Promise<InitiateOAuthResult> {
  const { shop, provider, redirectUri, returnUrl } = options;

  // Validate adapter exists and supports OAuth
  if (!hasAdapter(provider)) {
    return {
      success: false,
      error: `No adapter registered for provider: ${provider}`,
    };
  }

  const adapter = getAdapter(provider);

  if (adapter.config.authType !== "oauth") {
    return {
      success: false,
      error: `${provider} does not use OAuth authentication`,
    };
  }

  try {
    // Generate auth URL using adapter
    const authResult = await adapter.generateAuthUrl(shop, redirectUri);

    // Store state with code verifier if PKCE is used
    await prisma.oAuthState.create({
      data: {
        state: authResult.state,
        shop,
        provider,
        redirectUri,
        codeVerifier: authResult.codeVerifier || null,
        metadata: returnUrl ? { returnUrl } : {},
        expiresAt: new Date(Date.now() + STATE_EXPIRY_MS),
      },
    });

    logger.info("OAuth flow initiated", {
      shop,
      provider,
      usePKCE: !!authResult.codeVerifier,
    });

    return {
      success: true,
      authorizationUrl: authResult.url,
    };
  } catch (error) {
    logger.error("Failed to initiate OAuth", {
      shop,
      provider,
      error,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CALLBACK HANDLING
// ═══════════════════════════════════════════════════════════════════════════

export interface OAuthCallbackParams {
  code: string;
  state: string;
  error?: string;
  errorDescription?: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  shop?: string;
  provider?: IntegrationProvider;
  returnUrl?: string;
  error?: string;
}

/**
 * Handle OAuth callback
 */
export async function handleOAuthCallback(
  params: OAuthCallbackParams
): Promise<OAuthCallbackResult> {
  const { code, state, error: oauthError, errorDescription } = params;

  // Handle OAuth error response
  if (oauthError) {
    logger.warn("OAuth provider returned error", {
      error: oauthError,
      description: errorDescription,
    });
    return {
      success: false,
      error: errorDescription || oauthError,
    };
  }

  // Validate state
  const stateData = await validateOAuthState(state);

  if (!stateData) {
    return {
      success: false,
      error: "Invalid or expired OAuth state",
    };
  }

  const { shop, provider, redirectUri, codeVerifier, returnUrl } = stateData;

  // Mark state as used immediately to prevent replay attacks
  await markStateAsUsed(state);

  // Get adapter
  if (!hasAdapter(provider)) {
    return {
      success: false,
      error: `No adapter for provider: ${provider}`,
    };
  }

  const adapter = getAdapter(provider);

  try {
    // Exchange code for tokens
    const tokens = await adapter.exchangeCodeForTokens(
      code,
      redirectUri,
      codeVerifier
    );

    // Store tokens securely
    await storeOAuthTokens(shop, provider, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      scopes: tokens.scopes,
    });

    logger.info("OAuth tokens stored successfully", {
      shop,
      provider,
      hasRefreshToken: !!tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    // Clean up state
    await deleteOAuthState(state);

    return {
      success: true,
      shop,
      provider,
      returnUrl,
    };
  } catch (error) {
    logger.error("Failed to exchange OAuth code", {
      shop,
      provider,
      error,
    });

    return {
      success: false,
      shop,
      provider,
      error: error instanceof Error ? error.message : "Token exchange failed",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN REFRESH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Refresh OAuth tokens for an integration
 * Note: This is typically called automatically by BaseIntegrationAdapter.getValidAccessToken()
 * but can be called manually if needed.
 */
export async function refreshIntegrationTokens(
  integrationId: string
): Promise<{ success: boolean; error?: string }> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration) {
    return { success: false, error: "Integration not found" };
  }

  if (!integration.refreshToken) {
    return { success: false, error: "No refresh token available" };
  }

  if (!hasAdapter(integration.provider)) {
    return { success: false, error: "No adapter for provider" };
  }

  const adapter = getAdapter(integration.provider);

  try {
    // The adapter's getValidAccessToken method handles refresh automatically
    const token = await adapter.getValidAccessToken(integration);

    if (!token) {
      return { success: false, error: "Token refresh failed" };
    }

    return { success: true };
  } catch (error) {
    logger.error("Manual token refresh failed", {
      integrationId,
      error,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REVOCATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Revoke OAuth tokens for an integration
 * Note: Not all providers support token revocation
 */
export async function revokeOAuthTokens(
  shop: string,
  provider: IntegrationProvider
): Promise<{ success: boolean; error?: string }> {
  const integration = await prisma.integration.findUnique({
    where: {
      shop_provider: { shop, provider },
    },
  });

  if (!integration) {
    return { success: false, error: "Integration not found" };
  }

  // Clear tokens from database
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: "DISCONNECTED",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      scopes: [],
    },
  });

  logger.info("OAuth tokens revoked", { shop, provider });

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build OAuth redirect URI for a provider
 */
export function buildRedirectUri(
  baseUrl: string,
  provider: IntegrationProvider
): string {
  return `${baseUrl}/api/integrations/${provider.toLowerCase()}/callback`;
}

/**
 * Check if integration has valid OAuth tokens
 */
export async function hasValidTokens(
  shop: string,
  provider: IntegrationProvider
): Promise<boolean> {
  const integration = await prisma.integration.findUnique({
    where: {
      shop_provider: { shop, provider },
    },
    select: {
      accessToken: true,
      tokenExpiresAt: true,
      refreshToken: true,
      status: true,
    },
  });

  if (!integration || !integration.accessToken) {
    return false;
  }

  if (integration.status !== "CONNECTED") {
    return false;
  }

  // If token has expiry and is expired with no refresh token
  if (
    integration.tokenExpiresAt &&
    integration.tokenExpiresAt < new Date() &&
    !integration.refreshToken
  ) {
    return false;
  }

  return true;
}
