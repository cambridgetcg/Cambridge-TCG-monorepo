import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Redirect from old /app/points/raffles to new /app/rewards/raffles
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/rewards/raffles${url.search}`);
};
