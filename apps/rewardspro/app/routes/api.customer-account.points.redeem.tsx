/**
 * Points Redemption API
 *
 * DEPRECATED: Points can no longer be redeemed for discount codes, and
 * nothing else spends them yet (constants/feature-availability.ts).
 * This endpoint returns 410 Gone for backward compatibility.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  return json(
    { success: false, error: "Points can't be spent yet." },
    { status: 410 }
  );
}

export async function loader(_args: LoaderFunctionArgs) {
  return json(
    { success: false, error: "Points can't be spent yet." },
    { status: 410 }
  );
}
