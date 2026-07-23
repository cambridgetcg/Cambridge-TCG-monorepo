/**
 * Compatibility tombstone for legacy usage-cap webhooks.
 *
 * RewardsPro no longer creates usage-priced subscriptions. Shopify may still
 * deliver an already-registered webhook while legacy subscriptions are being
 * migrated, so authenticate and acknowledge it without creating warnings,
 * locking features, or mutating merchant billing state.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(
    `[LegacyUsageCapWebhook] Acknowledged ${topic} for ${shop}; fixed-price plans have no usage cap charge`,
  );

  return json({
    success: true,
    skipped: true,
    reason: "USAGE_BILLING_DISABLED",
  });
};
