/**
 * Points Redemption API
 *
 * DEPRECATED: Points can no longer be redeemed for discount codes.
 * Points are now spent exclusively on raffles and mystery boxes.
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
    { success: false, error: "Points can only be spent on raffles and mystery boxes." },
    { status: 410 }
  );
}

export async function loader(_args: LoaderFunctionArgs) {
  return json(
    { success: false, error: "Points can only be spent on raffles and mystery boxes." },
    { status: 410 }
  );
}
