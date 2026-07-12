/**
 * Dormant TCGplayer OAuth2 types and token helpers.
 *
 * The token has ~14 day TTL. The minting endpoint is application/x-www-
 * form-urlencoded, NOT JSON. Credentials are application-scoped (no
 * per-store credentials needed for read-only catalog + pricing).
 *
 * Cambridge has no written approval for its multi-source use, so token
 * minting is hard-blocked here as well as at the source reader and app
 * wrappers. Keeping the stop at this lowest exported network primitive means
 * accidental credentials cannot turn into an upstream request.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN) §2.
 */

import type { Fetcher } from "../http";

export const TCGPLAYER_ACCESS_BLOCKED_MESSAGE =
  "TCGplayer access is blocked: Cambridge has no recorded written approval " +
  "for its multi-source aggregation or redistribution use. Credentials do " +
  "not grant that permission; no token request was made.";

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
 * Retained API shape for dormant callers. Always fails before using the
 * supplied credentials or fetcher. Reopening this primitive requires a
 * recorded rights review and an explicit code change.
 */
export async function mintTcgplayerToken(
  creds: TcgplayerCredentials,
  fetcher: Fetcher,
): Promise<TcgplayerToken> {
  void creds;
  void fetcher;
  throw new Error(TCGPLAYER_ACCESS_BLOCKED_MESSAGE);
}

/**
 * Decide whether a cached token is still usable. Returns true when the
 * token's effective expiry is more than 60 seconds in the future.
 */
export function tokenIsFresh(token: TcgplayerToken | null): boolean {
  if (token === null) return false;
  return token.expires_at_ms > Date.now() + 60_000;
}

/**
 * Read credentials from environment. Trims whitespace defensively (Vercel
 * env vars sometimes carry trailing whitespace — well-known pitfall, see
 * the apps/storefront/CLAUDE.md "All env vars must be .trim()'d" rule).
 *
 * Returns null when credentials are not configured. Finding credentials does
 * not make acquisition lawful; `mintTcgplayerToken()` remains blocked.
 */
export function readTcgplayerCredentialsFromEnv(): TcgplayerCredentials | null {
  const client_id = process.env.TCGPLAYER_CLIENT_ID?.trim();
  const client_secret = process.env.TCGPLAYER_CLIENT_SECRET?.trim();
  if (!client_id || !client_secret) return null;
  return { client_id, client_secret };
}
