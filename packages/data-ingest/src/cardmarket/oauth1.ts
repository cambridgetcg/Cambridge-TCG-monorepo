/**
 * Cardmarket ("MKM") OAuth 1.0a request signing — HMAC-SHA1, dedicated-app flavour.
 *
 * Cardmarket's API authenticates with a *dedicated app* token set: four
 * secrets (appToken, appSecret, accessToken, accessTokenSecret) all issued to
 * your own app — no interactive 3-legged user dance. We sign every request and
 * emit an `Authorization: OAuth …` header.
 *
 * Refs:
 *   - https://api.cardmarket.com/ws/documentation/API:Auth_OAuthHeader
 *   - https://api.cardmarket.com/ws/documentation/API:Auth_Overview
 *   - RFC 5849 (The OAuth 1.0 Protocol)
 *
 * Cardmarket-specific choices honoured here (per the official doc):
 *   - `realm` = the request URI **without** the query string.
 *   - signing key = `rfc3986(appSecret) & rfc3986(accessTokenSecret)`.
 *   - signature base string params = ALL query params + ALL oauth_* params
 *     (excluding `realm` and `oauth_signature`), each RFC-3986 percent-encoded,
 *     sorted by encoded key then value, joined `k=v` with `&`.
 *   - `realm` is emitted in the header as the literal URI (not re-encoded);
 *     every other header param value is RFC-3986 encoded and quoted.
 *
 * Pure + deterministic when `nonce`/`timestamp` are supplied — see oauth1.test.ts.
 *
 * NOTE (substrate-honest): OAuth1 realm/encoding has a few vendor quirks. This
 * implementation follows Cardmarket's published doc; if a live call ever returns
 * 401 "signature invalid", the realm-with-query vs realm-without-query toggle is
 * the first knob to try (see `realmIncludesQuery`).
 */

import { createHmac, randomBytes } from "node:crypto";

export interface CardmarketCreds {
  /** oauth_consumer_key — your app token. */
  appToken: string;
  /** consumer secret — left half of the signing key. */
  appSecret: string;
  /** oauth_token — the dedicated-app access token. */
  accessToken: string;
  /** right half of the signing key. */
  accessTokenSecret: string;
}

export interface SignOptions {
  /** Deterministic nonce (tests). Defaults to 16 random bytes, hex. */
  nonce?: string;
  /** Deterministic unix-seconds timestamp (tests). Defaults to now. */
  timestamp?: number;
  /** Cardmarket quirk fallback: include the query string in the realm. Default false (per doc). */
  realmIncludesQuery?: boolean;
}

/**
 * RFC 3986 percent-encoding — stricter than `encodeURIComponent`, which leaves
 * `! * ' ( )` unescaped. OAuth requires those escaped.
 */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** Build the signature base string (exported so tests can lock it). */
export function buildSignatureBaseString(
  method: string,
  url: string,
  oauthParams: Record<string, string>,
  realmIncludesQuery = false,
): { baseString: string; realm: string } {
  const u = new URL(url);
  const realm = realmIncludesQuery ? url : `${u.origin}${u.pathname}`;

  const all: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams) all.push([k, v]);
  for (const [k, v] of Object.entries(oauthParams)) all.push([k, v]);

  const normalized = all
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as [string, string])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    rfc3986(`${u.origin}${u.pathname}`), // base URI is always query-less
    rfc3986(normalized),
  ].join("&");

  return { baseString, realm };
}

/**
 * Produce the `Authorization: OAuth …` header value for a Cardmarket request.
 *
 * @param method HTTP method (e.g. "GET")
 * @param url    full request URL including any query string
 * @param creds  the dedicated-app token set
 */
export function buildAuthorizationHeader(
  method: string,
  url: string,
  creds: CardmarketCreds,
  opts: SignOptions = {},
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.appToken,
    oauth_token: creds.accessToken,
    oauth_nonce: opts.nonce ?? randomBytes(16).toString("hex"),
    oauth_timestamp: String(opts.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_signature_method: "HMAC-SHA1",
    oauth_version: "1.0",
  };

  const { baseString, realm } = buildSignatureBaseString(
    method,
    url,
    oauthParams,
    opts.realmIncludesQuery,
  );

  const signingKey = `${rfc3986(creds.appSecret)}&${rfc3986(creds.accessTokenSecret)}`;
  const oauth_signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  // realm stays literal; everything else is encoded + quoted.
  const headerParams = [`realm="${realm}"`];
  for (const [k, v] of Object.entries({ ...oauthParams, oauth_signature })) {
    headerParams.push(`${k}="${rfc3986(v)}"`);
  }
  return `OAuth ${headerParams.join(", ")}`;
}

/** Are all four credential fields present + non-empty? */
export function hasCardmarketCreds(c: Partial<CardmarketCreds> | undefined): c is CardmarketCreds {
  return Boolean(c?.appToken && c?.appSecret && c?.accessToken && c?.accessTokenSecret);
}

/** Read the dedicated-app credentials from the environment (or return undefined). */
export function cardmarketCredsFromEnv(
  env: Record<string, string | undefined> = process.env,
): CardmarketCreds | undefined {
  const c = {
    appToken: env.CARDMARKET_APP_TOKEN ?? "",
    appSecret: env.CARDMARKET_APP_SECRET ?? "",
    accessToken: env.CARDMARKET_ACCESS_TOKEN ?? "",
    accessTokenSecret: env.CARDMARKET_ACCESS_TOKEN_SECRET ?? "",
  };
  return hasCardmarketCreds(c) ? c : undefined;
}
