/**
 * In-memory limits for signed acts (held-keys.md "How the store verifies"
 * step 4), held per server instance and never stored.
 *
 * Before verification an act's name is only a claim, so nothing here is
 * keyed on anything a stranger can name (a kid, an agent id): only the
 * client address and the instance. Exit-labelled acts count apart from the
 * rest, per address and per instance, so neither can starve the other.
 * Previews do no database or curve work, so they count per address only, in
 * their own class, and never against an instance ceiling. After
 * verification, a per-key limit applies to every act, exit acts included, so
 * the holder of an ended key cannot write an event per act without bound.
 *
 * The instance ceiling is checked before the address is counted, so a
 * request the ceiling refuses adds no address to the map; past
 * maxTrackedAddresses, new addresses share one overflow bucket per class.
 *
 * Fixed windows: every count resets when the window turns. A flood can
 * delay a signed exit; agent.revoke_key and the operator's page take no
 * such limit.
 */

import { BlockList, isIPv4, isIPv6 } from "node:net";
import { SIGNED_ACT_LIMITS } from "./signed-act-config";

export type ActLimitClass = "exit" | "other";

/** What refused: the caller's address (or /64), the whole instance, or the
 *  signing key. The answer's words follow it: only "address" says "from
 *  here". */
export type LimitScope = "address" | "instance" | "key";

export type LimitAnswer = { allowed: true } | { allowed: false; retryAfterSeconds: number; scope: LimitScope };

export interface ActLimiter {
  /** A preview: per address only, never against an instance ceiling. */
  preview(address: string): LimitAnswer;
  /** An act, before any curve work. */
  beforeVerification(address: string, kind: ActLimitClass): LimitAnswer;
  /** After a valid signature, for every act. */
  afterVerification(thumbprint: string): LimitAnswer;
}

type Limits = { -readonly [K in keyof typeof SIGNED_ACT_LIMITS]: number };
type AddressClass = ActLimitClass | "preview";

const OVERFLOW = "\u0000overflow";

export function createActLimiter(
  limits: Limits = { ...SIGNED_ACT_LIMITS },
  nowMs: () => number = () => Date.now(),
): ActLimiter {
  const windowMs = limits.windowSeconds * 1000;
  let windowStart = -Infinity;
  const fresh = (): Record<AddressClass, Map<string, number>> => ({ exit: new Map(), other: new Map(), preview: new Map() });
  let addresses = fresh();
  let keys = new Map<string, number>();
  const instance: Record<ActLimitClass, number> = { exit: 0, other: 0 };

  const roll = (): number => {
    const now = nowMs();
    const start = Math.floor(now / windowMs) * windowMs;
    if (start !== windowStart) {
      windowStart = start;
      addresses = fresh();
      keys = new Map();
      instance.exit = 0;
      instance.other = 0;
    }
    return Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  };

  /** Counts one in `key`'s slot, or in the map's overflow slot once the map
   *  is full; false when that slot is at `cap`. */
  const bump = (map: Map<string, number>, key: string, cap: number): boolean => {
    const slot = map.has(key) || map.size < limits.maxTrackedAddresses ? key : OVERFLOW;
    const count = map.get(slot) ?? 0;
    if (count >= cap) return false;
    map.set(slot, count + 1);
    return true;
  };

  const refuse = (retryAfterSeconds: number, scope: LimitScope): LimitAnswer => ({ allowed: false, retryAfterSeconds, scope });

  return {
    preview(address) {
      const retryAfterSeconds = roll();
      if (!bump(addresses.preview, address, limits.perAddress)) return refuse(retryAfterSeconds, "address");
      return { allowed: true };
    },
    beforeVerification(address, kind) {
      const retryAfterSeconds = roll();
      const ceiling = kind === "exit" ? limits.exitPerInstance : limits.perInstance;
      if (instance[kind] >= ceiling) return refuse(retryAfterSeconds, "instance");
      if (!bump(addresses[kind], address, limits.perAddress)) return refuse(retryAfterSeconds, "address");
      instance[kind] += 1;
      return { allowed: true };
    },
    afterVerification(thumbprint) {
      const retryAfterSeconds = roll();
      if (!bump(keys, thumbprint, limits.perKey)) return refuse(retryAfterSeconds, "key");
      return { allowed: true };
    },
  };
}

/** This instance's limiter. */
export const actLimiter: ActLimiter = createActLimiter();

// ── The client address ───────────────────────────────────────────────────

/**
 * Cloudflare's published ranges, copied on 2026-11-10 from
 * https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6.
 *
 * When this list goes stale because Cloudflare adds a range, a request that
 * arrives through the new range is keyed on its x-real-ip, the Cloudflare
 * edge's own address, so every caller behind that edge shares one bucket:
 * that over-limits them and cannot be exploited, since a caller cannot set
 * x-real-ip. A range Cloudflare gives up should be removed here, since
 * whoever holds it next could set cf-connecting-ip.
 */
export const CLOUDFLARE_RANGES_FETCHED = "2026-11-10";
export const CLOUDFLARE_IPV4_RANGES: readonly string[] = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];
export const CLOUDFLARE_IPV6_RANGES: readonly string[] = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const CLOUDFLARE = new BlockList();
for (const range of CLOUDFLARE_IPV4_RANGES) {
  const [network, bits] = range.split("/");
  CLOUDFLARE.addSubnet(network, Number(bits), "ipv4");
}
for (const range of CLOUDFLARE_IPV6_RANGES) {
  const [network, bits] = range.split("/");
  CLOUDFLARE.addSubnet(network, Number(bits), "ipv6");
}

type Ip = { family: "ipv4"; text: string } | { family: "ipv6"; groups: number[] };

/** The eight 16-bit groups of a valid IPv6 address without a zone. */
function ipv6Groups(text: string): number[] {
  // A trailing dotted quad is two groups.
  const hex = text.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, (_m, a, b, c, d) =>
    `${((Number(a) << 8) | Number(b)).toString(16)}:${((Number(c) << 8) | Number(d)).toString(16)}`,
  );
  const [head, tail] = hex.includes("::") ? hex.split("::") : [hex, null];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const middle = tail === null ? [] : Array<string>(8 - left.length - right.length).fill("0");
  return [...left, ...middle, ...right].map((group) => parseInt(group, 16));
}

/** One IP address, or null for anything else (a list, a name, a zone). */
function parseIp(value: string | null): Ip | null {
  const text = value?.trim() ?? "";
  if (text.length === 0 || text.length > 45) return null;
  if (isIPv4(text)) return { family: "ipv4", text };
  if (!isIPv6(text) || text.includes("%")) return null;
  const groups = ipv6Groups(text);
  // ::ffff:a.b.c.d is an IPv4 address.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return { family: "ipv4", text: [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".") };
  }
  return { family: "ipv6", groups };
}

function isCloudflare(ip: Ip): boolean {
  return ip.family === "ipv4"
    ? CLOUDFLARE.check(ip.text, "ipv4")
    : CLOUDFLARE.check(ip.groups.map((group) => group.toString(16)).join(":"), "ipv6");
}

/** The bucket: an IPv4 address, or an IPv6 address's /64. */
function bucketOf(ip: Ip): string {
  return ip.family === "ipv4" ? ip.text : `${ip.groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64`;
}

/**
 * The bucket the per-address limits key on. x-real-ip is the anchor: the
 * platform sets it and a caller cannot. cf-connecting-ip is believed only
 * when x-real-ip is one of Cloudflare's published addresses, that is, when
 * the request came through Cloudflare, which sets it; a request that reaches
 * the platform any other way is keyed on x-real-ip whatever else it says.
 * IPv6 addresses are bucketed by their /64, since one host commonly holds a
 * whole /64. Without a usable x-real-ip every request shares "unknown".
 */
export function actClientAddress(headers: Headers): string {
  const anchor = parseIp(headers.get("x-real-ip"));
  if (!anchor) return "unknown";
  if (isCloudflare(anchor)) {
    const client = parseIp(headers.get("cf-connecting-ip"));
    if (client) return bucketOf(client);
  }
  return bucketOf(anchor);
}
