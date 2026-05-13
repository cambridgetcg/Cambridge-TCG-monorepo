/**
 * eBay OAuth — client-credentials only (read-only scope).
 *
 * For the aggregator ingest, we only need public read scope:
 *   `https://api.ebay.com/oauth/api_scope`
 *
 * This is *separate* from the sell-side OAuth at
 * `apps/wholesale/src/lib/channels/ebay.ts`, which uses a refresh-token
 * flow for the seller's inventory mutations. Two pipelines, two scopes,
 * one upstream — keep them isolated.
 *
 * Token cache lives in the module scope (one per process). Tokens last
 * ~2 hours; we refresh when ≤5 minutes remain.
 *
 * Substrate-honest: when the credentials are missing we don't throw on
 * import — we throw lazily on first token request with an actionable
 * error message. This lets the registry + tests load without env vars.
 */

const EBAY_AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SCOPE_READ = "https://api.ebay.com/oauth/api_scope";

interface CachedToken {
  access_token: string;
  expires_at_ms: number;
}

let cached: CachedToken | null = null;

/** Visible for testing — clear the module-level token cache. */
export function _resetTokenCache(): void {
  cached = null;
}

export interface EbayCredentials {
  client_id: string;
  client_secret: string;
}

/**
 * Read eBay credentials from env. Throws lazily with an actionable
 * message — never on module load.
 */
export function readEbayCredentials(): EbayCredentials {
  const client_id = process.env.EBAY_CLIENT_ID;
  const client_secret = process.env.EBAY_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error(
      "Missing EBAY_CLIENT_ID and/or EBAY_CLIENT_SECRET env vars. " +
        "Register an application at https://developer.ebay.com/my/keys to get credentials.",
    );
  }
  return { client_id, client_secret };
}

/**
 * Get a valid Bearer token for eBay public APIs. Cached at module scope.
 *
 * The `fetchImpl` parameter lets tests inject a stub. Defaults to the
 * global `fetch`.
 */
export async function getEbayAccessToken(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (cached && cached.expires_at_ms > Date.now() + 5 * 60 * 1000) {
    return cached.access_token;
  }

  const { client_id, client_secret } = readEbayCredentials();
  const auth = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString("base64")}`;

  const res = await fetchImpl(EBAY_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: auth,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE_READ }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`eBay OAuth client-credentials failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  if (typeof data.access_token !== "string") {
    throw new Error("eBay OAuth returned malformed body — missing access_token");
  }

  cached = {
    access_token: data.access_token,
    expires_at_ms: Date.now() + (data.expires_in ?? 7200) * 1000,
  };
  return cached.access_token;
}
