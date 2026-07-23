import {
  RemixBrowser,
  useLocation,
  useNavigationType,
} from "@remix-run/react";
import { startTransition, StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import {
  createRoutesFromChildren,
  matchRoutes,
} from "react-router-dom";
import * as Sentry from "@sentry/remix";

// Initialize Sentry for browser-side error tracking
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: window.ENV?.SENTRY_DSN,
    environment: window.ENV?.NODE_ENV || 'production',

    // Performance Monitoring
    tracesSampleRate: 0.2, // Sample 20% of transactions for performance

    // Session Replay (optional - captures user sessions for debugging)
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    integrations: [
      new Sentry.BrowserTracing({
        // Trace fetch and XHR requests
        tracingOrigins: [
          'localhost',
          /^https:\/\/.*\.vercel\.app/,
          /^https:\/\/api\.shopify\.com/,
        ],
        // Track route changes
        routingInstrumentation: Sentry.reactRouterV6Instrumentation(
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes
        ),
      }),
      new Sentry.Replay({
        // Mask sensitive content in replays
        maskAllText: false,
        maskAllInputs: true,
        blockAllMedia: false,
      }),
    ],

    // Filter out known benign errors
    ignoreErrors: [
      // Browser extensions
      'Non-Error promise rejection captured',
      // Network errors
      'NetworkError',
      'Network request failed',
      // User actions
      'ResizeObserver loop limit exceeded',
    ],

    // Sanitize data before sending
    beforeSend(event, _hint) {
      // Remove sensitive data from URLs
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /token=[^&]*/g,
          'token=[REDACTED]'
        );
      }

      // Remove PII from user context
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }

      // Filter out specific environments during development
      if (window.location.hostname === 'localhost') {
        return null; // Don't send events from localhost
      }

      return event;
    },

    // Attach additional context
    beforeSendTransaction(event) {
      // Add custom tags to all transactions
      event.tags = {
        ...event.tags,
        'shopify.shop': window.ENV?.SHOPIFY_SHOP,
      };
      return event;
    },
  });

  // Set user context if available
  const shopId = window.ENV?.SHOPIFY_SHOP;
  if (shopId) {
    Sentry.setUser({ id: shopId });
  }

  // Track custom app metrics
  window.addEventListener('load', () => {
    // Track page load performance
    const perfData = window.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;

    Sentry.addBreadcrumb({
      category: 'performance',
      message: 'Page loaded',
      level: 'info',
      data: {
        loadTime: pageLoadTime,
        domReady: perfData.domContentLoadedEventEnd - perfData.navigationStart,
      },
    });
  });
}

// Declare global ENV type
declare global {
  interface Window {
    ENV?: {
      SENTRY_DSN?: string;
      NODE_ENV?: string;
      SHOPIFY_SHOP?: string;
    };
  }
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>
  );
});
