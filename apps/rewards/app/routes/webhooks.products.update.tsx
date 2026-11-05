/**
 * products/update: subscribed by the released app until the trimmed release (B3),
 * and not rebuilt (spec 7). The delivery is verified and answered 200, so
 * Shopify stops sending it again; nothing is read or written.
 */
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Throws a 401 Response for a delivery Shopify did not sign.
  await authenticate.webhook(request);
  return new Response();
};
