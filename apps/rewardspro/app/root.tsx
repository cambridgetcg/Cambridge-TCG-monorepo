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
import renaissanceTokens from "./styles/design-tokens.css?url";
import renaissanceComponents from "./styles/renaissance-components.css?url";
import crypto from "crypto";

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
  // Renaissance Design System
  { rel: "stylesheet", href: renaissanceTokens },
  { rel: "stylesheet", href: renaissanceComponents },
  // Preload critical fonts
  { rel: "preload", href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css", as: "style" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Device detection for responsive behavior
  const device = detectDevice(request);
  
  // Generate CSP nonce for inline scripts
  const nonce = crypto.randomBytes(16).toString('base64');
  
  // Security headers
  const headers = new Headers();
  
  // Content Security Policy with nonce for Shopify embedded apps
  // Updated to allow Vercel Analytics, Speed Insights, and Google Analytics 4
  const cspDirectives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://cdn.shopify.com https://cdn.shopifycdn.net https://va.vercel-scripts.com https://www.googletagmanager.com https://www.google-analytics.com`,
    `style-src 'self' 'unsafe-inline' https://cdn.shopify.com https://cdn.shopifycdn.net`,
    `img-src 'self' data: https: blob: https://www.google-analytics.com https://www.googletagmanager.com`,
    `font-src 'self' data: https://cdn.shopify.com`,
    `connect-src 'self' https://*.myshopify.com wss://*.myshopify.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.ingest.de.sentry.io`,
    `frame-ancestors https://*.myshopify.com https://admin.shopify.com`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`
  ];
  headers.set('Content-Security-Policy', cspDirectives.join('; '));
  
  // Additional security headers
  headers.set('X-Frame-Options', 'ALLOWFROM https://admin.shopify.com');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Pass the API key, device info, and analytics config to the client
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    appUrl: process.env.SHOPIFY_APP_URL || "",
    deviceType: device.type,
    viewport: device.viewport,
    nonce,
    // Google Analytics 4 Measurement ID (optional)
    ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || "",
    // Sentry configuration for client-side error tracking
    sentryDsn: process.env.SENTRY_DSN || "",
    nodeEnv: process.env.NODE_ENV || "development",
    shopifyShop: process.env.SHOPIFY_SHOP_DOMAIN || "",
  }, { headers });
};

export default function App() {
  const { apiKey, nonce, ga4MeasurementId, sentryDsn, nodeEnv, shopifyShop } = useLoaderData<typeof loader>();

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
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
        {/* App Bridge script must load in head before other scripts */}
        {apiKey && (
          <script
            src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
            data-api-key={apiKey}
            nonce={nonce}
            defer
          />
        )}
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
