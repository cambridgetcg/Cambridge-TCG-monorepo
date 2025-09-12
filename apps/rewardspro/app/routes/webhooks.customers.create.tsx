/**
 * HTTPS Webhook Handler: customers/create
 * 
 * This route handles customers/create webhooks delivered via HTTPS.
 * It's used for development/testing. Production uses EventBridge.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { handleCustomerCreate, type ShopifyCustomerWebhook } from "~/services/webhook-customer-sync.server";
import { verifyWebhookHMAC } from "~/utils/webhook-validation.server";

export async function action({ request }: ActionFunctionArgs) {
  console.log("[Webhook] Received customers/create webhook");
  
  try {
    // Get raw body for HMAC verification
    const rawBody = await request.text();
    
    // Verify HMAC signature
    const isValid = await verifyWebhookHMAC(request, rawBody);
    if (!isValid) {
      console.error("[Webhook] Invalid HMAC signature");
      return new Response("Unauthorized", { status: 401 });
    }
    
    // Parse webhook payload
    const payload: ShopifyCustomerWebhook = JSON.parse(rawBody);
    
    // Get shop domain from headers
    const shopDomain = request.headers.get("X-Shopify-Shop-Domain");
    const webhookId = request.headers.get("X-Shopify-Webhook-Id");
    const apiVersion = request.headers.get("X-Shopify-API-Version");
    
    if (!shopDomain) {
      console.error("[Webhook] Missing shop domain header");
      return new Response("Bad Request", { status: 400 });
    }
    
    console.log(`[Webhook] Processing customer create for shop: ${shopDomain}`);
    console.log(`[Webhook] Webhook ID: ${webhookId}, API Version: ${apiVersion}`);
    console.log(`[Webhook] Customer: ${payload.email} (ID: ${payload.id})`);
    
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