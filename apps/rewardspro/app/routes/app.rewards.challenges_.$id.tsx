import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Flattened redirect from old /app/rewards/challenges/:id to
 * /app/rewards/missions/:id, bypassing the legacy list redirect loader.
 */
export const loader = ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/rewards/missions/${params.id}${url.search}`);
};
