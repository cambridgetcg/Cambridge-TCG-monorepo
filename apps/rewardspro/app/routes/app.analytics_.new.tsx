import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

/**
 * The experimental analytics UI was superseded by /app/analytics.
 * Keep the old URL as a query-preserving compatibility redirect.
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/analytics${url.search}`);
};
