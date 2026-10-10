// Client-safe: imports only the tier table, never the engine (which pulls in
// @/lib/db). The account page bundles this.

import { TRUST_TIERS } from "./types";

export type TrustTierEntry = (typeof TRUST_TIERS)[number];

/**
 * Turn the `tier` field of GET /api/escrow/trust into a TRUST_TIERS entry.
 *
 * The route sends getTrustTier()'s return value — the whole tier OBJECT
 * ({ name, minScore, tradeLimit, ... }). /account/trust compared that object
 * against each tier's name string, which never matched, so every account was
 * shown as New with New-tier limits whatever its score.
 *
 * Accepts the object (what the route sends) or a bare tier name (tolerated in
 * case a client and server of different versions meet). Either way the entry
 * is looked up by name in the local TRUST_TIERS rather than taken from the
 * payload, so the result is always a well-formed tier. Anything else —
 * missing, malformed, or a name this build does not know — returns null and
 * the caller keeps its default.
 */
export function resolveTrustTier(apiTier: unknown): TrustTierEntry | null {
  let name: unknown = apiTier;
  if (apiTier !== null && typeof apiTier === "object") {
    name = (apiTier as { name?: unknown }).name;
  }
  if (typeof name !== "string") return null;
  return TRUST_TIERS.find((t) => t.name === name) ?? null;
}
