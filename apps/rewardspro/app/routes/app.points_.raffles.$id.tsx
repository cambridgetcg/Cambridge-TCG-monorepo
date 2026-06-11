import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Redirect from old /app/points/raffles/:id to new /app/rewards/raffles/:id
 */
export const loader = ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/rewards/raffles/${params.id}${url.search}`);
};
