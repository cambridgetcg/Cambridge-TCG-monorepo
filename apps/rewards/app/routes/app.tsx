import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { adminError } from "../admin/errors";
import { authenticate } from "../shopify.server";
import { POLARIS_URL } from "../shopify/polaris";

/**
 * The shell every admin page sits in: App Bridge, Polaris 2 and the app's
 * menu (spec 4.2: Home, Customers, Tiers, Orders, Settings; no sub-tabs).
 * The loader only signs the request in; each page's own loader reads the
 * merchant through requireMerchant.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey} polarisUrl={POLARIS_URL}>
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
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their
// headers are included in the response. Any other error is one plain
// sentence in Polaris, never the stack (BOUNDARY-3, M3c-F1). This boundary
// replaces App, and with it AppProvider's Polaris script, so it loads the
// script itself; else a server-rendered error shows unstyled (M3f-F1).
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <>
      <script src={POLARIS_URL} />
      {adminError(error, { polaris: true })}
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
