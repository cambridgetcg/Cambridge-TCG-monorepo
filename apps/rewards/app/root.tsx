import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from "react-router";

import { adminError } from "./admin/errors";

/** The document every page and every error renders in. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
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
 * it, a URL no route matches in plain words, anything else the plain
 * sentence.
 */
export function ErrorBoundary() {
  return adminError(useRouteError());
}
