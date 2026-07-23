import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Flattened redirect from old /app/points/raffles/:id to
 * /app/rewards/raffles/:id, bypassing the legacy list redirect loader.
 */
export const loader = ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/rewards/raffles/${params.id}${url.search}`);
};
