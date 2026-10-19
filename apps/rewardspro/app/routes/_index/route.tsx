import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

/**
 * The app host's home page. Shopify opens the app with ?shop=, which goes
 * on to the embedded app. Anyone else is sent to the product website:
 * the App Store does not allow a page asking merchants to type their shop
 * domain (requirement 2.3.1).
 */
const PRODUCT_WEBSITE = "https://rewardspro.io";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  throw redirect(PRODUCT_WEBSITE);
};
