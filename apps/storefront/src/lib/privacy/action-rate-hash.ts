/** Pure, database-free HMAC helper for privacy action rate limits. */

import { createHmac } from "node:crypto";

const HASH_DOMAIN = "cambridgetcg:privacy-action-rate-limit:v1";

export function hashActionRateLimitSubject(args: {
  secret: string;
  action: string;
  subject: string;
  windowName: string;
  windowStartEpochSeconds: number;
}): string {
  return createHmac("sha256", args.secret)
    .update(HASH_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(args.action, "utf8")
    .update("\0", "utf8")
    .update(args.windowName, "utf8")
    .update("\0", "utf8")
    .update(String(args.windowStartEpochSeconds), "utf8")
    .update("\0", "utf8")
    .update(args.subject, "utf8")
    .digest("hex");
}
