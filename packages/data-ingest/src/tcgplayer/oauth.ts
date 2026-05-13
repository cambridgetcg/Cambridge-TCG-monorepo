/**
 * TCGplayer OAuth2 client_credentials grant.
 *
 * The token has ~14 day TTL. The minting endpoint is application/x-www-
 * form-urlencoded, NOT JSON. Credentials are application-scoped (no
 * per-store credentials needed for read-only catalog + pricing).
 *
 * **The token cache is caller-provided.** This module ships the pure mint
 * function; the wholesale writer is responsible for persisting the token
 * (typically to `external_source_tokens`) and supplying it back on next
 * call. Keeps the package decoupled from any one app's DB.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN) §2.
 */

import type { Fetcher } from "../http.js";
import type { TcgplayerTokenResponse } from "./types.js";

const TOKEN_URL = "https://api.tcgplayer.com/token";

export interface TcgplayerCredentials {
  /** From env TCGPLAYER_CLIENT_ID. */
  client_id: string;
  /** From env TCGPLAYER_CLIENT_SECRET. MUST be .trim()'d. */
  client_secret: string;
}

export interface TcgplayerToken {
  access_token: string;
  /** Unix milliseconds. Computed as `Date.now() + expires_in * 0.9 * 1000`
   *  to refresh proactively before the upstream TTL hits. */
  expires_at_ms: number;
  /** When this token was minted (for audit/rotation tracking). */
  minted_at: Date;
}

/**
 * Mint a new TCGplayer access token. Throws on failure with an actionable
 * message — the caller (the reader's ensureToken hook) catches and emits
 * an IngestEvent.
 */
export async function mintTcgplayerToken(
  creds: TcgplayerCredentials,
  fetcher: Fetcher,
): Promise<TcgplayerToken> {
  if (!creds.client_id || !creds.client_secret) {
    throw new Error(
      "TCGplayer credentials missing. Set TCGPLAYER_CLIENT_ID and TCGPLAYER_CLIENT_SECRET. " +
        "Apply for partner access at https://developer.tcgplayer.com.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.client_id,
    client_secret: creds.client_secret,
  });

  // Caller's fetcher carries the rate-limit + retry + user-agent identity.
  // We pass Content-Type explicitly because the token endpoint requires
  // form encoding, not JSON.
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const detail = await safeReadBody(res);
    throw new Error(
      `TCGplayer token mint failed: HTTP ${res.status}. ${detail}. ` +
        `Verify TCGPLAYER_CLIENT_ID / TCGPLAYER_CLIENT_SECRET are correct and that ` +
        `your partner application is approved.`,
    );
  }

  const data = (await res.json()) as TcgplayerTokenResponse;
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Error(
      `TCGplayer token response was missing required fields: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  // Refresh at 90% of TTL so we never serve a request with an expired token
  // due to clock drift / processing delay.
  const expiresAtMs = Date.now() + data.expires_in * 0.9 * 1000;

  return {
    access_token: data.access_token,
    expires_at_ms: expiresAtMs,
    minted_at: new Date(),
  };
}

/**
 * Decide whether a cached token is still usable. Returns true when the
 * token's effective expiry is more than 60 seconds in the future.
 */
export function tokenIsFresh(token: TcgplayerToken | null): boolean {
  if (token === null) return false;
  return token.expires_at_ms > Date.now() + 60_000;
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 500);
  } catch {
    return "(could not read response body)";
  }
}

/**
 * Read credentials from environment. Trims whitespace defensively (Vercel
 * env vars sometimes carry trailing whitespace — well-known pitfall, see
 * the apps/storefront/CLAUDE.md "All env vars must be .trim()'d" rule).
 *
 * Returns null when credentials are not configured — the source's read()
 * surfaces this as a substrate-honest error event rather than throwing.
 */
export function readTcgplayerCredentialsFromEnv(): TcgplayerCredentials | null {
  const client_id = process.env.TCGPLAYER_CLIENT_ID?.trim();
  const client_secret = process.env.TCGPLAYER_CLIENT_SECRET?.trim();
  if (!client_id || !client_secret) return null;
  return { client_id, client_secret };
}
