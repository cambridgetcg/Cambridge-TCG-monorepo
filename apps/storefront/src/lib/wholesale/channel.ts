/**
 * Channel selection for the Falcon — Phase 1 of the wholesale
 * consolidation.
 *
 * Rule: a request inside the `/account/b2b/*` shell is priced under
 * the `'wholesale'` channel; every other request is priced under
 * `'cambridgetcg'` (retail). Public pages never personalize prices —
 * even for a logged-in wholesale buyer — to keep `<Provenance>`
 * stable, CDN caching intact, and substrate-honesty crisp: where you
 * are in the app determines what price you see, not who you are.
 *
 * The middleware in proxy.ts forwards `x-pathname` for /account/b2b
 * paths (and only enters the shell when role IS in
 * {'wholesale','admin'}), so this helper has two equivalent ways to
 * read the active path. Callers can supply the pathname explicitly
 * (preferred when already known) or rely on the forwarded header.
 *
 * Companion to:
 *   - docs/connections/the-four-auth-realms.md (S30) — the realm topology
 *   - apps/storefront/drizzle/0099_wholesale_role.sql — the role column
 *   - apps/storefront/src/proxy.ts — the gate
 *   - apps/storefront/src/lib/wholesale/client.ts — the Falcon
 */

import { headers } from "next/headers";

export type Channel = "cambridgetcg" | "wholesale";

const B2B_PREFIX = "/account/b2b";

/**
 * Pure path → channel. Use this when the pathname is already in hand
 * (e.g. in a Server Component that received it via props, or in a
 * unit test).
 */
export function channelForPath(pathname: string): Channel {
  return pathname.startsWith(B2B_PREFIX) ? "wholesale" : "cambridgetcg";
}

/**
 * Read the active pathname from the `x-pathname` request header that
 * proxy.ts forwards on /account/b2b/* requests, and return the matching
 * channel. Falls back to `'cambridgetcg'` when the header is absent
 * (i.e. the request didn't pass through proxy.ts, so it's a public
 * route). Async per Next.js 16's headers() contract.
 */
export async function getChannelForRequest(): Promise<Channel> {
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  return channelForPath(pathname);
}
