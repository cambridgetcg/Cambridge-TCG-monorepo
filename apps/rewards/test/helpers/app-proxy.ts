import crypto from "node:crypto";

/**
 * App proxy requests signed the way Shopify signs them, for the unit and
 * Postgres suites: HMAC-SHA256 (hex, the client secret test/setup.ts sets as
 * SHOPIFY_API_SECRET) of the sorted `key=value` query pairs, concatenated.
 * `extra` pairs are appended as given, so repeated keys can be sent; like
 * Shopify, the signature joins a repeated key's values with commas. This is
 * the tests' own signer: Shopify's worked examples pin the rule separately
 * (test/unit/shopify/proxy-verify.test.ts).
 */
export function signedProxyRequest(
  path: string,
  shop: string,
  loggedInCustomerId: string,
  extra: Array<[string, string]> = [],
  o: { timestamp?: number; secret?: string; init?: RequestInit } = {},
): Request {
  const pairs: Array<[string, string]> = [
    ["shop", shop],
    ["path_prefix", "/apps/rewardspro"],
    ["timestamp", String(o.timestamp ?? Math.trunc(Date.now() / 1000))],
    ["logged_in_customer_id", loggedInCustomerId],
    ...extra,
  ];
  const values = new Map<string, string[]>();
  for (const [key, value] of pairs) values.set(key, [...(values.get(key) ?? []), value]);
  const signed = [...values]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => `${key}=${list.join(",")}`)
    .join("");
  const signature = crypto.createHmac("sha256", o.secret ?? process.env.SHOPIFY_API_SECRET!).update(signed).digest("hex");
  const query = new URLSearchParams([...pairs, ["signature", signature]]);
  return new Request(`https://test.example.com/api/proxy/${path}?${query}`, o.init);
}
