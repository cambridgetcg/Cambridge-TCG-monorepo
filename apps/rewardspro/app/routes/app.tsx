import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { Frame } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useRef } from "react";

import { authenticate, FREE_PLAN, PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN, ENTERPRISE_PLAN, STARTER_PLAN, GROWTH_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } from "../shopify.server";
import { AppBridgeInitializer } from "../components/AppBridgeInitializer";
import { AuthenticatedFetchProvider } from "../components/AuthenticatedFetch";
import { HelpAssistant } from "../components/HelpAssistant";
import { PageAnimationProvider, NavigationProgress } from "../components/PageAnimation";
import { GA4Provider } from "../components/GA4Provider";
import { logRequest, logResponse, logError, logShopifyContext, checkAuthenticationIssues } from "../utils/request-logger";
import prisma from "../db.server";
import { getEntitlements } from "../services/entitlements.server";
import { getShopSettings } from "../services/shop-data-provider.server";
import type { ShopEntitlements } from "@prisma/client";
import { PRICING_PLANS } from "~/constants/pricing-contract";
import {
  HOME_NAVIGATION,
  PRIMARY_NAVIGATION,
} from "../navigation/registry";

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
  ga4MeasurementId: string;
}

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { startTime, requestId } = await logRequest(request, 'App Route Loader');
  checkAuthenticationIssues(request);

  try {
    console.log("[App Loader] Authenticating request...");

    let authResult;
    try {
      authResult = await authenticate.admin(request);
    } catch (authError: any) {
      // If authenticate.admin throws a Response (like a redirect or error), handle it
      if (authError instanceof Response) {
        const status = authError.status;
        const location = authError.headers.get('Location');

        // Log details for debugging
        console.log(`[App Loader] Auth threw Response: status=${status}, location=${location || 'none'}`);

        // 3xx redirects are normal (OAuth flow, billing redirect, etc.)
        if (status >= 300 && status < 400) {
          console.log("[App Loader] Returning redirect response");
          return authError;
        }

        // 4xx/5xx errors - log more detail and re-throw for ErrorBoundary
        console.error(`[App Loader] Auth error response: ${status}`);
        try {
          const body = await authError.clone().text();
          console.error(`[App Loader] Auth error body: ${body.slice(0, 500)}`);
        } catch (e) {
          // Ignore body read errors
        }

        // Return the error response (will be caught by ErrorBoundary)
        return authError;
      }

      // Non-Response errors - log and re-throw
      console.error("[App Loader] Auth error (not a Response):", authError.message || authError);
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
        // Check both current and legacy plans to handle all subscription states
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [
            // Current plans
            FREE_PLAN, PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN,
            // Legacy plans (for backward compatibility)
            STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN
          ],
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
          const monthlyUsage = await prisma.monthlyOrderUsage.findFirst({
            where: {
              shop: session.shop,
              year: year,
              month: month
            }
          });
          
          if (monthlyUsage && monthlyUsage.orderCount >= PRICING_PLANS.free.limits.orders) {
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
    let currentPlanName = entitlements?.effectivePlan || '';
    try {
      const shopSettings = await getShopSettings(session.shop);

      if (shopSettings) {
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
            plans: [
              // Current plans
              FREE_PLAN, PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN,
              // Legacy plans
              STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN
            ],
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

    // Marketing is a core capability on every current plan. A missing
    // entitlement row must not hide it from a Free merchant.
    const hasEmailMarketingAccess =
      entitlements?.featureMarketingCampaigns ?? true;

    const response = json(
      {
        apiKey: process.env.SHOPIFY_API_KEY || "",
        shop: session.shop,
        host: new URL(request.url).searchParams.get("host") || "",
        entitlements, // Full entitlements object for child routes
        features: {
          emailMarketing: hasEmailMarketingAccess,
        },
        currentPlan: currentPlanName,
        ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || "",
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
  const { apiKey, ga4MeasurementId } = useLoaderData<typeof loader>();
  const skipToContentTarget = useRef<HTMLAnchorElement>(null);

  if (!apiKey) {
    console.error("[App Component] No API key available!");
    return <div>Error: API key not configured</div>;
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <AppBridgeInitializer />
      <AuthenticatedFetchProvider>
        {/* GA4 Provider - Sets user context for analytics */}
        <GA4Provider measurementId={ga4MeasurementId} debug={process.env.NODE_ENV === 'development'}>
        <NavMenu>
          <Link to={HOME_NAVIGATION.to} rel="home">
            {HOME_NAVIGATION.label}
          </Link>
          {PRIMARY_NAVIGATION.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </NavMenu>

        {/* Page Animation Provider - For progress bar and context */}
        <PageAnimationProvider>
          <Frame skipToContentTarget={skipToContentTarget}>
            {/* Navigation Progress Bar - Shows loading indicator during page transitions */}
            <NavigationProgress />

            <a
              ref={skipToContentTarget}
              id="main-content"
              href="#main-content"
              className="rewardspro-content-target"
              tabIndex={-1}
              aria-label="Main content"
            />

            {/*
              Page content - NO AnimatePresence/motion wrapper!
              Using CSS transitions instead to avoid double-display issue.
              AnimatePresence + Remix Outlet causes content to flash because
              Remix swaps content before AnimatePresence can animate.
            */}
            <div className="page-content-wrapper rewardspro-app-shell">
              <Outlet />
            </div>
          </Frame>
        </PageAnimationProvider>

        {/* GitBook-powered Help Assistant */}
        <HelpAssistant docsUrl="https://docs.rewardspro.io" />

        <style>{`
          .rewardspro-content-target {
            display: block;
            scroll-margin-block-start: var(--p-space-400, 16px);
          }

          .rewardspro-app-shell {
            min-height: 100vh;
            box-sizing: border-box;
            padding-block-end: calc(80px + env(safe-area-inset-bottom, 0px));
          }

          @media (max-width: 768px) {
            .rewardspro-app-shell {
              padding-block-end: calc(60px + env(safe-area-inset-bottom, 0px));
            }
          }
        `}</style>
        </GA4Provider>
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
