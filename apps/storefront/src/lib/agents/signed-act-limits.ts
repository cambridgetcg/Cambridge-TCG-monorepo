/**
 * In-memory limits for signed acts (held-keys.md "How the store verifies"
 * step 4), held per server instance and never stored.
 *
 * Before verification an act's name is only a claim, so nothing here is
 * keyed on anything a stranger can name (a kid, an agent id): only the
 * client address and the instance. Exit-labelled acts count apart from the
 * rest, per address and per instance, so neither can starve the other.
 * After verification, a per-key limit applies to non-exit acts.
 *
 * Fixed windows: every count resets when the window turns. A flood can
 * delay a signed exit; agent.revoke_key and the operator's page take no
 * such limit.
 */

import { SIGNED_ACT_LIMITS } from "./signed-act-config";

export type ActLimitClass = "exit" | "other";

export type LimitAnswer = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface ActLimiter {
  /** Before any curve work. */
  beforeVerification(address: string, kind: ActLimitClass): LimitAnswer;
  /** After a valid signature, for non-exit acts. */
  afterVerification(thumbprint: string): LimitAnswer;
}

type Limits = { -readonly [K in keyof typeof SIGNED_ACT_LIMITS]: number };

const OVERFLOW = "\u0000overflow";

export function createActLimiter(
  limits: Limits = { ...SIGNED_ACT_LIMITS },
  nowMs: () => number = () => Date.now(),
): ActLimiter {
  const windowMs = limits.windowSeconds * 1000;
  let windowStart = -Infinity;
  let addresses = new Map<string, number>();
  let keys = new Map<string, number>();
  const instance: Record<ActLimitClass, number> = { exit: 0, other: 0 };

  const roll = (): number => {
    const now = nowMs();
    const start = Math.floor(now / windowMs) * windowMs;
    if (start !== windowStart) {
      windowStart = start;
      addresses = new Map();
      keys = new Map();
      instance.exit = 0;
      instance.other = 0;
    }
    return Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  };

  const bump = (map: Map<string, number>, key: string, cap: number): boolean => {
    let slot = key;
    if (!map.has(slot) && map.size >= limits.maxTrackedAddresses) slot = OVERFLOW;
    const count = map.get(slot) ?? 0;
    if (count >= cap) return false;
    map.set(slot, count + 1);
    return true;
  };

  return {
    beforeVerification(address, kind) {
      const retryAfterSeconds = roll();
      if (!bump(addresses, `${kind}\u0000${address}`, limits.perAddress)) return { allowed: false, retryAfterSeconds };
      const ceiling = kind === "exit" ? limits.exitPerInstance : limits.perInstance;
      if (instance[kind] >= ceiling) return { allowed: false, retryAfterSeconds };
      instance[kind] += 1;
      return { allowed: true };
    },
    afterVerification(thumbprint) {
      const retryAfterSeconds = roll();
      if (!bump(keys, thumbprint, limits.perKey)) return { allowed: false, retryAfterSeconds };
      return { allowed: true };
    },
  };
}

/** This instance's limiter. */
export const actLimiter: ActLimiter = createActLimiter();

/**
 * The client address the per-address limit keys on. Which header to trust
 * was left open by the design: cf-connecting-ip is Cloudflare's, set on the
 * apex, where these doors are served (proxy.ts sends the production alias to
 * the apex); x-real-ip is Vercel's. A request that reaches a per-deployment
 * host directly can set cf-connecting-ip itself and so spread itself across
 * address buckets; the per-instance ceilings still bound it.
 */
export function actClientAddress(headers: Headers): string {
  const cloudflare = headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare.slice(0, 64);
  const vercel = headers.get("x-real-ip")?.trim();
  if (vercel) return vercel.slice(0, 64);
  return "unknown";
}
