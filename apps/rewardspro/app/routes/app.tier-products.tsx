import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Redirect from old /app/tier-products to new /app/members/products
 * Preserves backwards compatibility for bookmarks and external links.
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/members/products${url.search}`);
};
