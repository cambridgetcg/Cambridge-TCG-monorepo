import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Billing Callback Route
 *
 * Handles the return from Shopify's subscription approval page.
 * Shopify redirects here as a top-level navigation (not embedded),
 * so we need to redirect back into the embedded app context.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");
  const success = url.searchParams.get("success");

  console.log('[Billing Callback] Received callback from Shopify:', {
    shop,
    chargeId,
    success,
    fullUrl: request.url,
  });

  if (!shop) {
    console.error("[Billing Callback] Missing shop parameter");

    // Return HTML with error message
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Error</title>
        </head>
        <body>
          <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>Error</h2>
            <p>Missing shop parameter. Please try again.</p>
          </div>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Build the embedded app URL with all required parameters
  // Extract store name from shop domain (e.g., "themetester222" from "themetester222.myshopify.com")
  const storeName = shop.split('.')[0];
  const host = Buffer.from(`admin.shopify.com/store/${storeName}`).toString('base64url');

  // Construct the full embedded URL for redirection
  const params = new URLSearchParams({
    shop: shop,
    host: host,
  });

  if (chargeId) {
    params.set('charge_id', chargeId);
  }

  if (success) {
    params.set('success', success);
  }

  params.set('embedded', '1');

  // Build the embedded app URL
  const embeddedPath = `/app/billing?${params.toString()}`;
  const embeddedUrl = `https://admin.shopify.com/store/${storeName}/apps/${process.env.SHOPIFY_API_KEY}${embeddedPath}`;

  console.log('[Billing Callback] Redirecting to embedded URL:', embeddedUrl);

  // Use Shopify's exitIframe pattern for reliable redirection
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Redirecting...</title>
      </head>
      <body>
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>Processing your subscription...</h2>
          <p>Redirecting you back to the app...</p>
        </div>
        <script>
          (function() {
            var redirectUrl = "${embeddedUrl}";

            console.log('[Billing Callback] Redirecting to:', redirectUrl);

            // Check if we're in an iframe
            if (window.top !== window.self) {
              console.log('[Billing Callback] In iframe, redirecting parent');
              window.top.location.href = redirectUrl;
            } else {
              console.log('[Billing Callback] Not in iframe, direct redirect');
              window.location.href = redirectUrl;
            }
          })();
        </script>
      </body>
    </html>
  `;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Security headers
      'X-Frame-Options': 'ALLOW-FROM https://admin.shopify.com',
      'Content-Security-Policy': "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
    },
  });
};
