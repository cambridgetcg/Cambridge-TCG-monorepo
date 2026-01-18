import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate, FREE_PLAN, STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } from "../shopify.server";
import { AppBridgeInitializer } from "../components/AppBridgeInitializer";
import { AuthenticatedFetchProvider } from "../components/AuthenticatedFetch";
import { HelpAssistant } from "../components/HelpAssistant";
import { logRequest, logResponse, logError, logShopifyContext, checkAuthenticationIssues } from "../utils/request-logger";
import db from "../db.server";
import { getEntitlements } from "../services/entitlements.server";
import { getShopSettings } from "../services/shop-data-provider.server";
import type { ShopEntitlements } from "@prisma/client";

// Type for loader data - exported for child routes
export interface AppLoaderData {
  apiKey: string;
  shop: string;
  host: string;
  entitlements: ShopEntitlements | null;
  features: {
    emailMarketing: boolean;
  };
  currentPlan: string;
}

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  {
    rel: "stylesheet",
    href: "https://cdn.shopify.com/shopifycloud/app-home/latest/app-home.css"
  },
];

// Plans that include email marketing feature
const EMAIL_MARKETING_PLANS = ['RewardsPro Max', 'RewardsPro Max Annual', 'RewardsPro Ultra', 'RewardsPro Ultra Annual', 'RewardsPro Enterprise'];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { startTime, requestId } = await logRequest(request, 'App Route Loader');
  checkAuthenticationIssues(request);

  try {
    console.log("[App Loader] Authenticating request...");

    let authResult;
    try {
      authResult = await authenticate.admin(request);
    } catch (authError: any) {
      // If authenticate.admin throws a Response (like a billing redirect), return it
      if (authError instanceof Response) {
        console.log("[App Loader] Auth threw a Response, returning it");
        return authError;
      }
      throw authError;
    }

    const { session, admin, billing, redirect } = authResult;

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
        // First check if they have any paid plan
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN] as any,
          isTest: process.env.NODE_ENV === 'development',
        });
        
        console.log("[App Loader] Billing check result:", { hasActivePayment, plans: appSubscriptions?.map(s => s.name) });
        
        // If they have a paid plan, continue
        if (hasActivePayment) {
          console.log("[App Loader] Active paid subscription found, continuing...");
        } else {
          // No paid plan - treat as free plan (no billing needed for $0)
          console.log("[App Loader] No paid subscription found, using free plan...");
          
          // Check if they've exceeded free plan limits
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth() + 1;

          // Note: Using findFirst instead of findUnique for Aurora Data API compatibility
          const monthlyUsage = await db.monthlyOrderUsage.findFirst({
            where: {
              shop: session.shop,
              year: year,
              month: month
            }
          });
          
          if (monthlyUsage && monthlyUsage.orderCount >= 100) {
            console.log("[App Loader] Free plan limit reached, showing upgrade prompt");
            // Don't force redirect, just log - let them access billing page to upgrade
          }
        }
      } catch (billingError: any) {
        // Check if this is a Response object (redirect or billing page)
        if (billingError instanceof Response) {
          // Check for specific redirect scenarios
          if (billingError.status === 401) {
            // Authentication error with redirect URL
            const reauthorizeUrl = billingError.headers?.get('x-shopify-api-request-failure-reauthorize-url');
            if (reauthorizeUrl) {
              console.log("[App Loader] Billing auth failed, redirecting to:", reauthorizeUrl);
              return redirect(reauthorizeUrl, { target: "_top" });
            }
          }
          
          // If it's a 200 response with HTML (billing redirect page), return it
          if (billingError.status === 200 || billingError.status === 302 || billingError.status === 303) {
            console.log("[App Loader] Returning billing redirect response");
            return billingError;
          }
        }
        
        // Log other billing check errors but don't block app access
        console.error("[App Loader] Billing check error:", billingError);
        // Continue loading the app even if billing check fails
      }
    }

    // Load entitlements (single source of truth for features/limits)
    let entitlements: ShopEntitlements | null = null;
    try {
      entitlements = await getEntitlements(session.shop);
      console.log(`[App Loader] Loaded entitlements for ${session.shop}: ${entitlements.effectivePlan}`);
    } catch (entitlementsError) {
      console.error("[App Loader] Error loading entitlements:", entitlementsError);
    }

    // Fetch shop settings to check feature flags (CACHED via shop-data-provider)
    let emailMarketingEnabled = false;
    let currentPlanName = entitlements?.effectivePlan || '';
    try {
      const shopSettings = await getShopSettings(session.shop);

      if (shopSettings) {
        emailMarketingEnabled = (shopSettings as any).emailMarketingEnabled || false;
        // Use entitlements as source of truth, fall back to shopSettings
        if (!currentPlanName) {
          currentPlanName = (shopSettings as any).currentPlanName || '';
        }
      }

      // Also check if plan supports email marketing (Max, Ultra, Enterprise)
      // Only do billing check if entitlements didn't give us a plan
      if (!entitlements?.effectivePlan && billing) {
        try {
          const { appSubscriptions } = await billing.check({
            plans: [STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN] as any,
            isTest: process.env.NODE_ENV === 'development',
          });
          if (appSubscriptions && appSubscriptions.length > 0) {
            currentPlanName = appSubscriptions[0].name;
          }
        } catch (e) {
          // Ignore billing check errors for feature flags
        }
      }
    } catch (settingsError) {
      console.error("[App Loader] Error fetching shop settings:", settingsError);
    }

    // Check if email marketing should be shown (from entitlements or legacy check)
    const hasEmailMarketingAccess = entitlements?.featureCustomEmail ||
      emailMarketingEnabled ||
      EMAIL_MARKETING_PLANS.includes(currentPlanName);

    const response = json(
      {
        apiKey: process.env.SHOPIFY_API_KEY || "",
        shop: session.shop,
        host: new URL(request.url).searchParams.get("host") || "",
        entitlements, // NEW: Full entitlements object for child routes
        features: {
          emailMarketing: hasEmailMarketingAccess,
        },
        currentPlan: currentPlanName,
      },
      {
        headers: {
          'X-Shop-Domain': session.shop,
        }
      }
    );

    logResponse(response, 'App Route Loader', startTime, requestId);
    return response;
  } catch (error: any) {
    // Check if this is a redirect response from billing check
    if (error instanceof Response) {
      // If it's a redirect response (301/302) or has a redirect header, return it
      if (error.status === 301 || error.status === 302 || error.headers?.get('x-shopify-api-request-failure-reauthorize-url')) {
        console.log("[App Loader] Returning redirect response from error handler");
        return error;
      }
    }
    
    logError(error, 'App Route Loader', requestId);
    console.error("[App Loader] Authentication error:", error);
    throw error;
  }
};

export default function App() {
  const { apiKey, shop, host, features } = useLoaderData<typeof loader>();

  // Log for debugging
  console.log("[App Component] Rendering with:", { apiKey: apiKey ? "present" : "missing", shop, host, features });

  if (!apiKey) {
    console.error("[App Component] No API key available!");
    return <div>Error: API key not configured</div>;
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <AppBridgeInitializer />
      <AuthenticatedFetchProvider>
        {/* Load Polaris web components for s-switch */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-home/latest/app-home.js"
          type="module"
          defer
        />
        <NavMenu>
          <Link to="/app" rel="home">
            Home
          </Link>
          <Link to="/app/analytics">Analytics</Link>
          <Link to="/app/marketing">Marketing</Link>
          <Link to="/app/points">Points</Link>
          <Link to="/app/customers">Customers</Link>
          <Link to="/app/orders">Orders</Link>
          <Link to="/app/tier-products">Tier Products</Link>
          <Link to="/app/settings">Settings</Link>
          <Link to="/app/billing">Billing</Link>
        </NavMenu>
        <Outlet />

        {/* GitBook-powered Help Assistant */}
        <HelpAssistant docsUrl="https://docs.rewardspro.io" />

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
