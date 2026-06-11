import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Redirect from old /app/points/mystery-boxes/:id to new /app/rewards/mystery-boxes/:id
 */
export const loader = ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/rewards/mystery-boxes/${params.id}${url.search}`);
};
