import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { unlockShop } from "~/utils/plan-access-control.server";

/**
 * Legacy lockout route.
 *
 * Capacity is advisory under the free-first contract, so old bookmarks or
 * redirects clear stale lock state and return merchants to the app.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  await unlockShop(session.shop);
  return redirect("/app/billing?capacity=advisory");
};

export default function LegacyLockedPage() {
  return null;
}
