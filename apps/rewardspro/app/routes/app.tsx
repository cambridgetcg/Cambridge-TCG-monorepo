import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate, MONTHLY_PLAN, ANNUAL_PLAN } from "../shopify.server";
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
    const { session, admin, billing, redirect } = await authenticate.admin(request);
    
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
    
    // Check if billing is configured (only check on main app route, not all sub-routes)
    const url = new URL(request.url);
    const isMainAppRoute = url.pathname === '/app' || url.pathname === '/app/';
    const isBillingRoute = url.pathname.includes('/billing');
    
    // Only check billing on main app route and not on billing pages themselves
    if (isMainAppRoute && !isBillingRoute && billing) {
      console.log("[App Loader] Checking billing status...");
      
      try {
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [MONTHLY_PLAN, ANNUAL_PLAN],
          isTest: process.env.NODE_ENV === 'development',
        });
        
        console.log("[App Loader] Billing check result:", { hasActivePayment });
        
        // If no active payment and not on a billing-related page, redirect to billing
        if (!hasActivePayment) {
          console.log("[App Loader] No active subscription found, redirecting to billing...");
          
          // For managed pricing, redirect to the Shopify-hosted pricing page
          const shopDomain = session.shop;
          const storeHandle = shopDomain.replace(".myshopify.com", "");
          const appHandle = process.env.SHOPIFY_APP_HANDLE || "rewardspro"; // Get from env or use default
          
          // Construct the managed pricing page URL
          const pricingPageUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
          
          // Use the redirect helper to ensure proper iframe breakout
          return redirect(pricingPageUrl, { target: "_top" });
        }
      } catch (billingError) {
        // Log billing check errors but don't block app access
        console.error("[App Loader] Billing check error:", billingError);
        // Continue loading the app even if billing check fails
      }
    }
    
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
          <Link to="/app/analytics">Analytics</Link>
          <Link to="/app/customers">Customers</Link>
          <Link to="/app/tiers">Loyalty Tiers</Link>
          <Link to="/app/credit-management">Credit Management</Link>
          <Link to="/app/settings">Settings</Link>
          <Link to="/app/billing">Billing</Link>
          <Link to="/app/webhook-test-simple">Webhook Tester</Link>
          <Link to="/app/graphql-test">GraphQL API Test</Link>
          <Link to="/app/graphql-customer-test">Customer GraphQL Test</Link>
        </NavMenu>
        <Outlet />
        
        {/* 
          Global styles for iframe bottom spacing in Shopify Admin
          
          CRITICAL: Use padding, NOT margin!
          - Margins collapse and aren't counted in iframe height calculations
          - Padding is included in offsetHeight and ensures visible spacing
          - See: docs/APP_PAGE_BOTTOM_MARGIN_COMPLETE_GUIDE.md
        */}
        <style>{`
          /* Primary solution: Padding on Polaris Frame scrollable content */
          .Polaris-Frame__Content {
            padding-bottom: 80px !important; /* Counted in iframe height */
            box-sizing: border-box;
          }
          
          /* Secondary: Ensure Polaris Page components have padding */
          .Polaris-Page {
            padding-bottom: 80px !important; /* Prevents content touching bottom */
          }
          
          /* DO NOT USE: Margins won't work in iframe context */
          /* #app { margin-bottom: 80px; } <- This won't create visible space */
          
          /* Mobile responsiveness - reduce spacing on smaller screens */
          @media (max-width: 768px) {
            .Polaris-Frame__Content {
              padding-bottom: 60px !important;
            }
            .Polaris-Page {
              padding-bottom: 60px !important;
            }
          }
          
          /* Ensure padding isn't overridden by Polaris resets */
          .Polaris-Frame__Content > * {
            margin-bottom: 0; /* Clear any margins that might interfere */
          }
        `}</style>
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
