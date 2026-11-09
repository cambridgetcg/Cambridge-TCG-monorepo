import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import type { LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { detectDevice } from "./utils/device-detection.server";
import responsiveStyles from "./styles/responsive.css?url";
import designSystemStyles from "./styles/design-system.css?url";
// REMOVED: design-tokens.css (~8KB) and renaissance-components.css (~21KB)
// Renaissance design system was deprecated and unused. See:
// .claude/ui-consistency-audit-2026-01-24.md for details
import crypto from "node:crypto";

/**
 * VERCEL ANALYTICS & SPEED INSIGHTS
 *
 * WHAT IS VERCEL ANALYTICS?
 * =========================
 * Real User Monitoring (RUM) that tracks actual visitor experiences:
 * - Page views and unique visitors
 * - Traffic sources and referrers
 * - Geographic distribution
 * - Device and browser breakdown
 * - Custom events (optional)
 *
 * WHAT IS SPEED INSIGHTS?
 * =======================
 * Core Web Vitals monitoring for real users:
 * - LCP (Largest Contentful Paint) - Loading performance
 * - FID (First Input Delay) - Interactivity
 * - CLS (Cumulative Layout Shift) - Visual stability
 * - TTFB (Time to First Byte) - Server response time
 * - FCP (First Contentful Paint) - Initial render
 *
 * WHY USE THEM?
 * =============
 * - Understand real merchant experience (not synthetic tests)
 * - Identify slow pages for optimization
 * - Track performance trends over time
 * - No sampling - every page view is tracked
 * - Zero configuration after adding components
 *
 * PRIVACY:
 * ========
 * - No cookies required
 * - GDPR/CCPA compliant by design
 * - Only collects performance metrics, not PII
 */
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { GA4Script } from './components/GA4Provider';

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: responsiveStyles },
  { rel: "stylesheet", href: designSystemStyles },
  // Preload critical fonts
  { rel: "preload", href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css", as: "style" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Device detection for responsive behavior
  const device = detectDevice(request);
  const requestUrl = new URL(request.url);
  const shouldLoadAppBridge =
    requestUrl.pathname === "/app" || requestUrl.pathname.startsWith("/app/");
  
  // Generate CSP nonce for inline scripts
  const nonce = crypto.randomBytes(16).toString('base64');

  // Response headers are set in entry.server.tsx (security headers) and by
  // Shopify's addDocumentResponseHeaders (the frame-ancestors CSP that allows
  // embedding in admin.shopify.com and the shop's domain). Headers on this
  // loader's response are never sent: root exports no `headers` function.

  // Pass the API key, device info, and analytics config to the client
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    appUrl: process.env.SHOPIFY_APP_URL || "",
    shouldLoadAppBridge,
    deviceType: device.type,
    viewport: device.viewport,
    nonce,
    // Google Analytics 4 Measurement ID (optional)
    ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || "",
    // Sentry configuration for client-side error tracking
    sentryDsn: (process.env.SENTRY_DSN || "").trim(),
    nodeEnv: (process.env.NODE_ENV || "").trim(),
    shopifyShop: (process.env.SHOPIFY_SHOP_DOMAIN || "").trim(),
  });
};

export default function App() {
  const {
    apiKey,
    nonce,
    shouldLoadAppBridge,
    ga4MeasurementId,
    sentryDsn,
    nodeEnv,
    shopifyShop,
  } = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* App Bridge must be the first script and load synchronously. */}
        {apiKey && shouldLoadAppBridge && (
          <script
            src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
            data-api-key={apiKey}
            nonce={nonce}
          />
        )}
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        {/* Expose environment variables to client for Sentry */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify({
              SENTRY_DSN: sentryDsn,
              NODE_ENV: nodeEnv,
              SHOPIFY_SHOP: shopifyShop,
            })}`,
          }}
        />
        {/* Preconnect to Google Analytics for faster loading */}
        {ga4MeasurementId && (
          <>
            <link rel="preconnect" href="https://www.googletagmanager.com" />
            <link rel="preconnect" href="https://www.google-analytics.com" />
          </>
        )}
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {/* Google Analytics 4 */}
        {ga4MeasurementId && (
          <GA4Script measurementId={ga4MeasurementId} nonce={nonce} />
        )}
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        {/* Vercel Analytics - Real User Monitoring */}
        <Analytics />
        {/* Vercel Speed Insights - Core Web Vitals */}
        <SpeedInsights />
      </body>
    </html>
  );
}
