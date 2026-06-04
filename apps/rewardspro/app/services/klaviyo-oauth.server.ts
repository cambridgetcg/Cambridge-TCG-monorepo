/**
 * Klaviyo OAuth Service
 *
 * Handles OAuth 2.0 authorization flow for Klaviyo integration.
 * Merchants click "Connect to Klaviyo" and authorize RewardsPro to access their account.
 *
 * Flow:
 * 1. Generate authorization URL with state
 * 2. Redirect merchant to Klaviyo login
 * 3. Handle callback with authorization code
 * 4. Exchange code for access + refresh tokens
 * 5. Store tokens and auto-refresh before expiry
 *
 * @see https://developers.klaviyo.com/en/docs/set_up_oauth
 */

import crypto from "node:crypto";
import prisma from "~/db.server";
import { encrypt, decrypt } from "~/utils/encryption";

// ============================================
// CONFIGURATION
// ============================================

const KLAVIYO_CLIENT_ID = process.env.KLAVIYO_CLIENT_ID?.trim();
const KLAVIYO_CLIENT_SECRET = process.env.KLAVIYO_CLIENT_SECRET?.trim();

const KLAVIYO_AUTH_URL = "https://www.klaviyo.com/oauth/authorize";
const KLAVIYO_TOKEN_URL = "https://a.klaviyo.com/oauth/token";
const KLAVIYO_REVOKE_URL = "https://a.klaviyo.com/oauth/revoke";

// In-memory store for PKCE verifiers (in production, use Redis or similar)
// Maps state -> { verifier, shop, createdAt }
const pkceStore = new Map<string, { verifier: string; shop: string; createdAt: number }>();

// Clean up old PKCE entries (older than 10 minutes)
function cleanupPkceStore() {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of pkceStore.entries()) {
    if (value.createdAt < tenMinutesAgo) {
      pkceStore.delete(key);
    }
  }
}

// Scopes needed for RewardsPro integration
// Only request minimum necessary scopes per Klaviyo requirements
const KLAVIYO_SCOPES = [
  "events:write",    // Track loyalty events (earned, redeemed, tier changes, etc.)
  "lists:read",      // Read existing lists for subscription
  "lists:write",     // Create/manage loyalty program lists
  "profiles:read",   // Read customer profiles for sync
  "profiles:write",  // Update profiles with loyalty properties
].join(" ");

// ============================================
// TYPES
// ============================================

export interface KlaviyoTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope: string;
}

export interface OAuthState {
  shop: string;
  nonce: string;
  returnUrl?: string;
}

// ============================================
// PKCE HELPERS
// ============================================

/**
 * Generate a PKCE code verifier (43-128 characters)
 * Uses URL-safe base64 characters: A-Z, a-z, 0-9, -, ., _, ~
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate a PKCE code challenge from verifier (S256 method)
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Store PKCE verifier for later retrieval during token exchange
 */
function storePkceVerifier(state: string, verifier: string, shop: string): void {
  cleanupPkceStore();
  pkceStore.set(state, { verifier, shop, createdAt: Date.now() });
}

/**
 * Retrieve and delete PKCE verifier (one-time use)
 */
export function retrievePkceVerifier(state: string): { verifier: string; shop: string } | null {
  const entry = pkceStore.get(state);
  if (entry) {
    pkceStore.delete(state);
    return { verifier: entry.verifier, shop: entry.shop };
  }
  return null;
}

// ============================================
// AUTHORIZATION URL
// ============================================

/**
 * Generate the Klaviyo OAuth authorization URL with PKCE
 */
export function generateAuthorizationUrl(
  shop: string,
  redirectUri: string,
  returnUrl?: string
): { url: string; state: string } {
  if (!KLAVIYO_CLIENT_ID) {
    throw new Error("KLAVIYO_CLIENT_ID is not configured");
  }

  // Generate PKCE pair
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Create state with shop info for callback verification
  const stateData: OAuthState = {
    shop,
    nonce: crypto.randomBytes(16).toString("hex"),
    returnUrl,
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString("base64url");

  // Store PKCE verifier for token exchange
  storePkceVerifier(state, codeVerifier, shop);

  const params = new URLSearchParams({
    client_id: KLAVIYO_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: KLAVIYO_SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  return {
    url: `${KLAVIYO_AUTH_URL}?${params.toString()}`,
    state,
  };
}

/**
 * Parse and validate the OAuth state parameter
 */
export function parseOAuthState(state: string): OAuthState | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(decoded) as OAuthState;
  } catch {
    return null;
  }
}

// ============================================
// TOKEN EXCHANGE
// ============================================

/**
 * Exchange authorization code for access and refresh tokens
 * Uses PKCE code_verifier for secure token exchange
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<KlaviyoTokens> {
  if (!KLAVIYO_CLIENT_ID || !KLAVIYO_CLIENT_SECRET) {
    throw new Error("Klaviyo OAuth credentials not configured");
  }

  const response = await fetch(KLAVIYO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: KLAVIYO_CLIENT_ID,
      client_secret: KLAVIYO_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[Klaviyo OAuth] Token exchange failed:", error);
    throw new Error(`Failed to exchange code for tokens: ${response.status}`);
  }

  const tokens = (await response.json()) as KlaviyoTokens;
  return tokens;
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<KlaviyoTokens> {
  if (!KLAVIYO_CLIENT_ID || !KLAVIYO_CLIENT_SECRET) {
    throw new Error("Klaviyo OAuth credentials not configured");
  }

  const response = await fetch(KLAVIYO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: KLAVIYO_CLIENT_ID,
      client_secret: KLAVIYO_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[Klaviyo OAuth] Token refresh failed:", error);
    throw new Error(`Failed to refresh token: ${response.status}`);
  }

  const tokens = (await response.json()) as KlaviyoTokens;
  return tokens;
}

// ============================================
// TOKEN STORAGE
// ============================================

/**
 * Store OAuth tokens for a shop
 * Tokens are encrypted before storage for security
 */
export async function storeOAuthTokens(
  shop: string,
  tokens: KlaviyoTokens
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Encrypt tokens before storing
  const encryptedAccessToken = encrypt(tokens.access_token);
  const encryptedRefreshToken = encrypt(tokens.refresh_token);

  await prisma.emailSettings.upsert({
    where: { shop },
    create: {
      id: crypto.randomUUID(),
      shop,
      klaviyoEnabled: true,
      klaviyoAccessToken: encryptedAccessToken,
      klaviyoRefreshToken: encryptedRefreshToken,
      klaviyoTokenExpiresAt: expiresAt,
      klaviyoOAuthConnected: true,
    },
    update: {
      klaviyoEnabled: true,
      klaviyoAccessToken: encryptedAccessToken,
      klaviyoRefreshToken: encryptedRefreshToken,
      klaviyoTokenExpiresAt: expiresAt,
      klaviyoOAuthConnected: true,
      // Clear old API key if OAuth is now connected
      klaviyoApiKey: null,
    },
  });

  console.log(`[Klaviyo OAuth] Tokens stored (encrypted) for shop: ${shop}`);
}

/**
 * Get a valid access token for a shop, refreshing if necessary
 * Tokens are decrypted before being returned
 */
export async function getValidAccessToken(
  shop: string
): Promise<string | null> {
  const settings = await prisma.emailSettings.findUnique({
    where: { shop },
    select: {
      klaviyoAccessToken: true,
      klaviyoRefreshToken: true,
      klaviyoTokenExpiresAt: true,
      klaviyoOAuthConnected: true,
    },
  });

  if (!settings?.klaviyoOAuthConnected || !settings.klaviyoAccessToken) {
    return null;
  }

  // Check if token is expired or expiring soon (within 5 minutes)
  const expiresAt = settings.klaviyoTokenExpiresAt;
  const isExpiringSoon =
    expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpiringSoon && settings.klaviyoRefreshToken) {
    try {
      console.log(`[Klaviyo OAuth] Refreshing token for shop: ${shop}`);
      // Decrypt refresh token before using it
      const decryptedRefreshToken = decrypt(settings.klaviyoRefreshToken);
      const newTokens = await refreshAccessToken(decryptedRefreshToken);
      await storeOAuthTokens(shop, newTokens);
      return newTokens.access_token;
    } catch (error) {
      console.error(`[Klaviyo OAuth] Failed to refresh token for ${shop}:`, error);
      // Mark as disconnected if refresh fails
      await prisma.emailSettings.update({
        where: { shop },
        data: {
          klaviyoOAuthConnected: false,
          klaviyoAccessToken: null,
          klaviyoRefreshToken: null,
        },
      });
      return null;
    }
  }

  // Decrypt access token before returning
  try {
    return decrypt(settings.klaviyoAccessToken);
  } catch (error) {
    console.error(`[Klaviyo OAuth] Failed to decrypt access token for ${shop}:`, error);
    return null;
  }
}

/**
 * Disconnect Klaviyo OAuth for a shop
 */
export async function disconnectKlaviyoOAuth(shop: string): Promise<void> {
  await prisma.emailSettings.update({
    where: { shop },
    data: {
      klaviyoEnabled: false,
      klaviyoOAuthConnected: false,
      klaviyoAccessToken: null,
      klaviyoRefreshToken: null,
      klaviyoTokenExpiresAt: null,
    },
  });

  console.log(`[Klaviyo OAuth] Disconnected for shop: ${shop}`);
}

/**
 * Check if a shop has Klaviyo OAuth connected
 */
export async function isKlaviyoOAuthConnected(shop: string): Promise<boolean> {
  const settings = await prisma.emailSettings.findUnique({
    where: { shop },
    select: { klaviyoOAuthConnected: true },
  });

  return settings?.klaviyoOAuthConnected ?? false;
}

// ============================================
// HELPERS
// ============================================

/**
 * Build the OAuth redirect URI based on the app URL
 */
export function buildRedirectUri(appUrl: string): string {
  // Remove trailing slash if present
  const baseUrl = appUrl.replace(/\/$/, "");
  return `${baseUrl}/api/klaviyo/callback`;
}

/**
 * Validate that OAuth is properly configured
 */
export function isOAuthConfigured(): boolean {
  return !!(KLAVIYO_CLIENT_ID && KLAVIYO_CLIENT_SECRET);
}
