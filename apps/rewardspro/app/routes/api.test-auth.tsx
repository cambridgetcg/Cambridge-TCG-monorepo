import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

/**
 * Test endpoint to verify authentication and environment variables
 * Access this directly to debug authentication issues
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  
  console.log("[Test Auth] Request received with params:", { shop, host });
  
  // Check environment variables
  const envCheck = {
    SHOPIFY_API_KEY: !!process.env.SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET: !!process.env.SHOPIFY_API_SECRET,
    SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || "not set",
    SCOPES: process.env.SCOPES || "not set",
    NODE_ENV: process.env.NODE_ENV || "not set",
  };
  
  console.log("[Test Auth] Environment check:", envCheck);
  
  // Try to authenticate if shop is provided
  let authResult = null;
  if (shop) {
    try {
      const { authenticate } = await import("~/shopify.server");
      const { session } = await authenticate.admin(request);
      
      authResult = {
        success: true,
        shop: session?.shop,
        isOnline: session?.isOnline,
        hasAccessToken: !!session?.accessToken,
      };
    } catch (error) {
      authResult = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
  
  return json({
    timestamp: new Date().toISOString(),
    requestParams: { shop, host },
    environment: envCheck,
    authentication: authResult,
    headers: {
      "user-agent": request.headers.get("user-agent"),
      "x-forwarded-for": request.headers.get("x-forwarded-for"),
      "referer": request.headers.get("referer"),
    },
  });
};