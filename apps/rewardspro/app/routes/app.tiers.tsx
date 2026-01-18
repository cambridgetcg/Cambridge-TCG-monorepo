import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Redirect from old /app/tiers to new /app/members/tiers
 * Preserves backwards compatibility for bookmarks and external links.
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/members/tiers${url.search}`);
};
