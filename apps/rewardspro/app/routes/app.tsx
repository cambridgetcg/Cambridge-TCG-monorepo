import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { combineHeaders } from "../utils/security-headers";
import { AppBridgeInitializer } from "../components/AppBridgeInitializer";
import { AuthenticatedFetchProvider } from "../components/AuthenticatedFetch";
import { logRequest, logResponse, logError, logShopifyContext, checkAuthenticationIssues } from "../utils/request-logger";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { startTime, requestId } = await logRequest(request, 'App Route Loader');
  checkAuthenticationIssues(request);
  
  try {
    console.log("[App Loader] Authenticating request...");
    const { session, admin } = await authenticate.admin(request);
    
    // Log Shopify context
    logShopifyContext({
      shop: session?.shop,
      session,
      admin,
      apiKey: process.env.SHOPIFY_API_KEY,
      host: new URL(request.url).searchParams.get("host") || "",
    });
    
    if (!session) {
      console.error("[App Loader] No session found!");
      throw new Response("No session found", { status: 401 });
    }
    
    console.log(`[App Loader] Authenticated for shop: ${session.shop}`);
    
    const response = json(
      { 
        apiKey: process.env.SHOPIFY_API_KEY || "",
        shop: session.shop,
        host: new URL(request.url).searchParams.get("host") || "",
      },
      { 
        headers: {
          'X-Shop-Domain': session.shop,
        }
      }
    );
    
    logResponse(response, 'App Route Loader', startTime, requestId);
    return response;
  } catch (error) {
    logError(error, 'App Route Loader', requestId);
    console.error("[App Loader] Authentication error:", error);
    throw error;
  }
};

export default function App() {
  const { apiKey, shop, host } = useLoaderData<typeof loader>();

  // Log for debugging
  console.log("[App Component] Rendering with:", { apiKey: apiKey ? "present" : "missing", shop, host });

  if (!apiKey) {
    console.error("[App Component] No API key available!");
    return <div>Error: API key not configured</div>;
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <AppBridgeInitializer />
      <AuthenticatedFetchProvider>
        <NavMenu>
          <Link to="/app" rel="home">
            Home
          </Link>
          <Link to="/app/tiers">Loyalty Tiers</Link>
          <Link to="/app/customers">Customers</Link>
          <Link to="/app/graphql-test">GraphQL API Test</Link>
          <Link to="/app/billing">Billing</Link>
          <Link to="/app/settings">Settings</Link>
        </NavMenu>
        <Outlet />
      </AuthenticatedFetchProvider>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[App ErrorBoundary] Error caught:", error);
  
  // Provide more detailed error information in development
  if (process.env.NODE_ENV === 'development') {
    return (
      <div style={{ padding: '20px', backgroundColor: '#fee', border: '1px solid #f00' }}>
        <h2>Authentication Error</h2>
        <pre>{JSON.stringify(error, null, 2)}</pre>
        <p>Check console for more details</p>
      </div>
    );
  }
  
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  // For now, only use boundary headers to avoid CSP conflicts
  // We'll add security headers back once authentication is working
  return boundary.headers(headersArgs);
};
