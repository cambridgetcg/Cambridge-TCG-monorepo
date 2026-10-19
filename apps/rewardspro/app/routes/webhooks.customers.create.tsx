/**
 * HTTPS Webhook Handler: customers/create
 * 
 * Subscribed in shopify.app.toml. Shopify signs the delivery with the app's
 * client secret, which authenticate.webhook verifies.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { handleCustomerCreate, type ShopifyCustomerWebhook } from "../services/webhook-customer-sync.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  console.log("[Webhook] Received customers/create webhook");
  
  // Throws a 401 Response for a delivery that Shopify did not sign
  const { shop: shopDomain, payload: body } = await authenticate.webhook(request);
  const payload = body as ShopifyCustomerWebhook;

  try {
    console.log(`[Webhook] Processing customer create for shop: ${shopDomain}`);

    // Process the webhook using our sync service
    const result = await handleCustomerCreate(payload, shopDomain);
    
    console.log(`[Webhook] Successfully processed customer create: ${result.customerId}`);
    
    // Return 200 OK to acknowledge receipt
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error processing customers/create:", error);
    
    // Return 500 to trigger Shopify retry
    return new Response("Internal Server Error", { status: 500 });
  }
}

// No GET method - webhooks are POST only
export async function loader() {
  return new Response("Method Not Allowed", { status: 405 });
}