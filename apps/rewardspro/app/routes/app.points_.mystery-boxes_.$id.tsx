import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Flattened redirect from old /app/points/mystery-boxes/:id to
 * /app/rewards/mystery-boxes/:id, bypassing the legacy list redirect loader.
 */
export const loader = ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/rewards/mystery-boxes/${params.id}${url.search}`);
};
