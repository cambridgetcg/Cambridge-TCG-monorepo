import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Redirect from old /app/rewards/challenges/:id to new /app/rewards/missions/:id
 */
export const loader = ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/rewards/missions/${params.id}${url.search}`);
};
