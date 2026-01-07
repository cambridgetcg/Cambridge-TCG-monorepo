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
  const cspDirectives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://cdn.shopify.com https://cdn.shopifycdn.net`,
    `style-src 'self' 'unsafe-inline' https://cdn.shopify.com https://cdn.shopifycdn.net`,
    `img-src 'self' data: https: blob:`,
    `font-src 'self' data: https://cdn.shopify.com`,
    `connect-src 'self' https://*.myshopify.com wss://*.myshopify.com`,
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
  
  // Pass the API key and device info to the client
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    appUrl: process.env.SHOPIFY_APP_URL || "",
    deviceType: device.type,
    viewport: device.viewport,
    nonce,
  }, { headers });
};

export default function App() {
  const { apiKey, appUrl, nonce } = useLoaderData<typeof loader>();

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
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
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
