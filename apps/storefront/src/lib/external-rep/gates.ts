// External-rep submission + verification gates.
//
// Each typed ExternalRepGateError throws cleanly so the route returns
// 4xx with the message. Pattern: TrustGateError + ReviewGateError.

import { query } from "@/lib/db";

export class ExternalRepGateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ExternalRepGateError";
    this.code = code;
  }
}

const MAX_VERIFY_ATTEMPTS_PER_DAY = 3;

/**
 * Allowlist of platforms we accept rep claims for. Each entry pairs
 * the platform key with the host pattern its profile URLs must match.
 * Submitting a URL that doesn't match the platform's expected host
 * is refused — prevents code-pasting on attacker-controlled domains.
 */
export interface PlatformDef {
  key: string;
  label: string;
  /** Hostname suffixes (case-insensitive). URL host must end with one. */
  hosts: string[];
  /** Optional regex matching the URL's path (e.g. /usr/<username>). */
  profilePathPattern?: RegExp;
}

export const PLATFORM_DEFS: Record<string, PlatformDef> = {
  ebay: {
    key: "ebay",
    label: "eBay",
    hosts: ["ebay.com", "ebay.co.uk", "ebay.de", "ebay.fr"],
    profilePathPattern: /^\/usr\/[A-Za-z0-9._-]+\/?$/,
  },
  cardmarket: {
    key: "cardmarket",
    label: "Cardmarket",
    hosts: ["cardmarket.com", "www.cardmarket.com"],
    profilePathPattern: /^\/[A-Za-z]+\/Magic\/Users\/[A-Za-z0-9._-]+\/?$/,
  },
  tcgplayer: {
    key: "tcgplayer",
    label: "TCGPlayer",
    hosts: ["tcgplayer.com", "www.tcgplayer.com", "shop.tcgplayer.com"],
  },
  vinted: {
    key: "vinted",
    label: "Vinted",
    hosts: ["vinted.com", "vinted.co.uk", "vinted.fr", "vinted.de"],
  },
};

export interface ValidateUrlArgs {
  platform: string;
  profileUrl: string;
}

/**
 * Throws if (platform, profileUrl) violates any of the integrity rules:
 *   - platform not in allowlist
 *   - URL is not HTTPS
 *   - hostname doesn't match the platform's expected hosts
 *   - path pattern doesn't match (when defined for the platform)
 *
 * Returns the canonical PlatformDef on success.
 */
export function assertValidProfileUrl(args: ValidateUrlArgs): PlatformDef {
  const def = PLATFORM_DEFS[args.platform];
  if (!def) {
    throw new ExternalRepGateError(
      "platform_unknown",
      `Platform '${args.platform}' is not on our allowlist. Supported: ${Object.values(PLATFORM_DEFS).map((p) => p.label).join(", ")}.`,
    );
  }

  let url: URL;
  try {
    url = new URL(args.profileUrl);
  } catch {
    throw new ExternalRepGateError("url_malformed", "Profile URL is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new ExternalRepGateError("url_insecure", "Profile URL must use HTTPS.");
  }
  const host = url.hostname.toLowerCase();
  const hostOk = def.hosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!hostOk) {
    throw new ExternalRepGateError(
      "url_wrong_host",
      `Profile URL must be on ${def.label} (${def.hosts.join(", ")}); got ${host}.`,
    );
  }
  if (def.profilePathPattern && !def.profilePathPattern.test(url.pathname)) {
    throw new ExternalRepGateError(
      "url_wrong_path",
      `Profile URL doesn't match the expected ${def.label} profile pattern.`,
    );
  }
  return def;
}

/**
 * Refuses verification attempts past the per-(user, platform, day)
 * limit. Catches farming attempts that try multiple URLs hoping one
 * resolves to a high-rep account.
 */
export async function assertAttemptAllowed(args: { userId: string; platform: string }): Promise<void> {
  const r = await query(
    `SELECT COUNT(*)::int AS n
       FROM external_reputation
      WHERE user_id = $1
        AND platform = $2
        AND verification_attempted_at >= (NOW() AT TIME ZONE 'UTC')::date`,
    [args.userId, args.platform],
  );
  const attempts = r.rows[0]?.n ?? 0;
  if (attempts >= MAX_VERIFY_ATTEMPTS_PER_DAY) {
    throw new ExternalRepGateError(
      "rate_limit",
      `You've made ${MAX_VERIFY_ATTEMPTS_PER_DAY} verification attempts on ${PLATFORM_DEFS[args.platform]?.label ?? args.platform} today. Try again tomorrow.`,
    );
  }
}
