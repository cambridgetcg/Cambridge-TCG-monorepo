import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches, useRouteError } from "react-router";

import { adminError } from "./admin/errors";
import { APP_BRIDGE_URL, appBridgeHead, renderedAppBridgeHead } from "./shopify/app-bridge";
import { POLARIS_URL } from "./shopify/polaris";

/** A route's `handle`: `outsideAdmin` marks a page Shopify's admin never shows, which gets no App Bridge. */
export type RouteHandle = { outsideAdmin?: boolean };

/**
 * The document every page and every error renders in. Its head loads App
 * Bridge (shopify/app-bridge.ts), the first script, then Polaris: here,
 * not in a route, so the error pages and React Router's own 404 load them
 * too, each once.
 */
export function Layout({ children }: { children: ReactNode }) {
  const outsideAdmin = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.outsideAdmin === true);
  const head = import.meta.env.SSR ? appBridgeHead(process.env) : renderedAppBridgeHead(document);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {outsideAdmin ? null : (
          <>
            {/* App Bridge reads these as it starts, so they come before its script */}
            <meta name="shopify-api-key" content={head.apiKey} />
            {head.webVitalsDebug ? <meta name="shopify-debug" content="web-vitals" /> : null}
            <script src={APP_BRIDGE_URL} />
          </>
        )}
        <script src={POLARIS_URL} />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

/**
 * The last boundary (BOUNDARY-3), for what the admin's own (app.tsx) doesn't
 * hold: React Router's default, which shows the error's stack, never
 * renders. As adminError: a thrown response as Shopify's boundary renders
 * it, a URL no route matches in plain words, anything else the crash banner.
 */
export function ErrorBoundary() {
  return adminError(useRouteError());
}
