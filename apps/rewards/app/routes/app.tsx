import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { adminError } from "../admin/errors";
import { authenticate } from "../shopify.server";

/**
 * The shell every admin page sits in: the app's menu (spec 4.2: Home,
 * Customers, Tiers, Orders, Settings; no sub-tabs). App Bridge and Polaris
 * load in the document's head (root.tsx), not here, so the error pages have
 * them too. The loader only signs the request in; each page's own loader
 * reads the merchant through requireMerchant.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

/**
 * Polaris links and the admin's menu send `shopify:navigate` for an app
 * path; React Router follows it without reloading the page. This is the part
 * of the library's AppProvider the shell keeps: AppProvider would also add
 * App Bridge and Polaris at the start of <body>, a second copy of each.
 */
function useShopifyNavigate() {
  const navigate = useNavigate();

  useEffect(() => {
    const follow = (event: Event) => {
      const href = (event.target as Element | null)?.getAttribute("href");
      if (href) navigate(href);
    };
    document.addEventListener("shopify:navigate", follow);
    return () => document.removeEventListener("shopify:navigate", follow);
  }, [navigate]);
}

export default function App() {
  useShopifyNavigate();

  return (
    <>
      <s-app-nav>
        {/* rel="home" makes this the landing page, which Shopify hides from the menu by design */}
        {/* @ts-expect-error Polaris's s-link types have no rel; App Bridge reads it on s-app-nav links */}
        <s-link href="/app" rel="home">
          Home
        </s-link>
        <s-link href="/app/customers">Customers</s-link>
        <s-link href="/app/tiers">Tiers</s-link>
        <s-link href="/app/orders">Orders</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their
// headers are included in the response. Any other error is one plain
// sentence in Polaris, never the stack (BOUNDARY-3, M3c-F1). This boundary
// replaces App and its menu; App Bridge and Polaris stay, in the head.
export function ErrorBoundary() {
  return adminError(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
