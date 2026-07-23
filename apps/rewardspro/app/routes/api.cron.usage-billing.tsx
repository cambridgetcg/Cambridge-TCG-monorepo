import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyCronAuth } from "~/utils/cron-auth.server";

/**
 * Retained as an authenticated tombstone for old scheduler invocations.
 * Fixed-price plans never create Shopify usage records.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  return json({
    success: true,
    skipped: true,
    code: "USAGE_BILLING_DISABLED",
    message: "RewardsPro uses fixed recurring prices with no usage charges.",
  });
}
