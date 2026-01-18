import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Redirect from old /app/customers to new /app/members
 * Preserves backwards compatibility for bookmarks and external links.
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Preserve any query parameters
  return redirect(`/app/members${url.search}`);
};
