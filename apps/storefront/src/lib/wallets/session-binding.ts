import { createHash } from "node:crypto";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/cookies";
import { WalletLinkError } from "./errors";
import type { WalletLinkConfig } from "./config";

const SESSION_BINDING_CONTEXT = "cambridge-tcg:wallet-link-session:v1";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cookiePairs(header: string): Array<{ name: string; value: string }> {
  const pairs: Array<{ name: string; value: string }> = [];
  for (const segment of header.split(";")) {
    const index = segment.indexOf("=");
    if (index <= 0) continue;
    const name = segment.slice(0, index).trim();
    const value = segment.slice(index + 1).trim();
    if (name && value) pairs.push({ name, value });
  }
  return pairs;
}

/** Bind a challenge to the exact Auth.js database-session cookie, never raw. */
export function sessionBindingDigest(request: Request): string {
  const pairs = cookiePairs(request.headers.get("cookie") ?? "");
  const matches = pairs.filter(({ name }) =>
    SESSION_COOKIE_NAMES.includes(name),
  );
  if (matches.length !== 1) {
    throw new WalletLinkError(
      "SESSION_BINDING_UNAVAILABLE",
      "A single authenticated Cambridge session is required to link a wallet.",
      401,
    );
  }
  return sha256Hex(
    `${SESSION_BINDING_CONTEXT}\0${matches[0].name}\0${matches[0].value}`,
  );
}

/** Mutations accept only the configured origin, never a request Host guess. */
export function assertCanonicalOrigin(
  request: Request,
  config: WalletLinkConfig,
): void {
  const rawOrigin = request.headers.get("origin");
  if (rawOrigin !== config.origin) {
    throw new WalletLinkError(
      "ORIGIN_MISMATCH",
      "This wallet-link request did not come from the canonical Cambridge origin.",
      403,
    );
  }
}
