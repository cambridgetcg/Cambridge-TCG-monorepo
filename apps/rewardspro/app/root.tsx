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

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: responsiveStyles },
  // Preload critical fonts
  { rel: "preload", href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css", as: "style" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Device detection for responsive behavior
  const device = detectDevice(request);
  
  // Pass the API key and device info to the client
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    appUrl: process.env.SHOPIFY_APP_URL || "",
    deviceType: device.type,
    viewport: device.viewport,
  });
};

export default function App() {
  const { apiKey, appUrl } = useLoaderData<typeof loader>();

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
