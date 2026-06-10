import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Redirect from old /app/points to new /app/rewards
 * Preserves backwards compatibility for bookmarks and external links.
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/rewards${url.search}`);
};
