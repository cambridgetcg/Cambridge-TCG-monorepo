import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

// Shopify opens the app with ?shop=…; everyone else goes to the public site.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  throw redirect("https://rewardspro.io");
};
