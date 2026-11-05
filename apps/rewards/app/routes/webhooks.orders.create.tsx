/**
 * orders/create: subscribed by the released app until the trimmed release (B3),
 * and not rebuilt (spec 7). The delivery is verified by the app's own
 * signature check and answered 200, so Shopify stops sending it again;
 * nothing is read or written, and no session is loaded (Ruling 42).
 */
import { acknowledgeIgnoredTopic } from "~/shopify/webhook-hmac.server";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

export const action = acknowledgeIgnoredTopic;
