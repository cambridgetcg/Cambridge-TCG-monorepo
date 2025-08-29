import type { ActionFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory Compliance Webhooks Handler
 * Required for Shopify App Store compliance
 * 
 * Handles three mandatory webhook topics:
 * 1. customers/data_request - Customer requests to view their data
 * 2. customers/redact - Customer requests to delete their data  
 * 3. shop/redact - Shop data deletion after app uninstall
 */

// Type definitions for webhook payloads
type CustomerDataRequestPayload = {
  shop_id: number;
  shop_domain: string;
  orders_requested: number[];
  customer: {
    id: number;
    email: string;
    phone?: string;
  };
  data_request: {
    id: number;
  };
};

type CustomerRedactPayload = {
  shop_id: number;
  shop_domain: string;
  customer: {
    id: number;
    email: string;
    phone?: string;
  };
  orders_to_redact: number[];
};

type ShopRedactPayload = {
  shop_id: number;
  shop_domain: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Authenticate the webhook - this verifies the HMAC signature
    const { topic, shop, payload } = await authenticate.webhook(request);
    
    console.log(`[Compliance Webhook] Received ${topic} for ${shop}`);
    console.log(`[Compliance Webhook] Payload:`, JSON.stringify(payload, null, 2));

    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
        await handleCustomerDataRequest(payload as CustomerDataRequestPayload, shop);
        break;
        
      case "CUSTOMERS_REDACT":
        await handleCustomerRedact(payload as CustomerRedactPayload, shop);
        break;
        
      case "SHOP_REDACT":
        await handleShopRedact(payload as ShopRedactPayload, shop);
        break;
        
      default:
        console.warn(`[Compliance Webhook] Unhandled topic: ${topic}`);
        // Still return 200 to acknowledge receipt
        return json({ received: true, topic }, { status: 200 });
    }

    // Always return 200 to confirm receipt
    return json({ received: true, processed: topic }, { status: 200 });
    
  } catch (error) {
    console.error("[Compliance Webhook] Error:", error);
    
    // If authentication fails (invalid HMAC), return 401
    if (error instanceof Response && error.status === 401) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    // For other errors, still return 200 to acknowledge receipt
    // but log the error for investigation
    return json({ 
      received: true, 
      error: "Internal processing error - webhook acknowledged" 
    }, { status: 200 });
  }
};

/**
 * Handle customers/data_request webhook
 * Customer wants to see what data we have about them
 */
async function handleCustomerDataRequest(
  payload: CustomerDataRequestPayload,
  shop: string
) {
  console.log(`[Data Request] Processing for customer ${payload.customer.id} from ${shop}`);
  
  // TODO: Implement based on your data model
  // This is where you would:
  // 1. Query your database for any data related to this customer
  // 2. Compile the data into a report
  // 3. Store the request for later processing (must complete within 30 days)
  
  // Example: Log the request for manual processing
  try {
    // If you have a compliance requests table, store it there
    // await db.complianceRequest.create({
    //   data: {
    //     shop,
    //     type: "DATA_REQUEST",
    //     customerId: payload.customer.id.toString(),
    //     customerEmail: payload.customer.email,
    //     requestId: payload.data_request.id.toString(),
    //     orderIds: payload.orders_requested.map(String),
    //     status: "PENDING",
    //     payload: JSON.stringify(payload),
    //   }
    // });
    
    console.log(`[Data Request] Logged request ${payload.data_request.id} for manual processing`);
    console.log(`[Data Request] Customer email: ${payload.customer.email}`);
    console.log(`[Data Request] Orders requested: ${payload.orders_requested.join(", ")}`);
    
    // IMPORTANT: You have 30 days to provide this data to the merchant
    // who will then provide it to the customer
    
  } catch (error) {
    console.error("[Data Request] Failed to log request:", error);
    // Don't throw - we still need to return 200 to Shopify
  }
}

/**
 * Handle customers/redact webhook
 * Customer wants their data deleted
 */
async function handleCustomerRedact(
  payload: CustomerRedactPayload,
  shop: string
) {
  console.log(`[Customer Redact] Processing for customer ${payload.customer.id} from ${shop}`);
  
  try {
    // TODO: Delete or anonymize customer data from your database
    // This might include:
    // - Customer records
    // - Order data
    // - Analytics data
    // - Logs containing customer information
    
    // Example: If you have customer-related tables
    // await db.customerData.deleteMany({
    //   where: {
    //     shop,
    //     customerId: payload.customer.id.toString(),
    //   }
    // });
    
    // Log the redaction for compliance records
    console.log(`[Customer Redact] Customer ID: ${payload.customer.id}`);
    console.log(`[Customer Redact] Customer email: ${payload.customer.email}`);
    console.log(`[Customer Redact] Orders to redact: ${payload.orders_to_redact.join(", ")}`);
    
    // IMPORTANT: You have 30 days to complete this redaction
    // Some data may need to be retained for legal reasons (taxes, etc.)
    
  } catch (error) {
    console.error("[Customer Redact] Failed to process redaction:", error);
    // Don't throw - we still need to return 200 to Shopify
  }
}

/**
 * Handle shop/redact webhook
 * Shop has uninstalled the app - delete all shop data
 */
async function handleShopRedact(
  payload: ShopRedactPayload,
  shop: string
) {
  console.log(`[Shop Redact] Processing complete data deletion for ${shop}`);
  
  try {
    // This webhook is sent 48 hours after app uninstall
    // Delete ALL data related to this shop
    
    // Start with dependent data first, then work up to avoid foreign key constraints
    
    // 1. Delete tiers (your custom data)
    const deletedTiers = await db.tier.deleteMany({
      where: { shop }
    });
    console.log(`[Shop Redact] Deleted ${deletedTiers.count} tiers`);
    
    // 2. Delete sessions (already handled by uninstall webhook usually)
    const deletedSessions = await db.session.deleteMany({
      where: { shop }
    });
    console.log(`[Shop Redact] Deleted ${deletedSessions.count} sessions`);
    
    // 3. TODO: Delete any other shop-specific data you store
    // Examples:
    // - Customer records
    // - Order records  
    // - Analytics data
    // - Settings/configurations
    // - Logs
    
    // await db.customer.deleteMany({ where: { shop } });
    // await db.order.deleteMany({ where: { shop } });
    // await db.analytics.deleteMany({ where: { shop } });
    // await db.settings.deleteMany({ where: { shop } });
    
    console.log(`[Shop Redact] Completed data deletion for shop ${shop} (ID: ${payload.shop_id})`);
    
    // Optional: Store a record that this shop's data was deleted
    // for compliance audit trail (store minimal data only)
    // await db.deletionLog.create({
    //   data: {
    //     shopId: payload.shop_id.toString(),
    //     shopDomain: payload.shop_domain,
    //     deletedAt: new Date(),
    //     type: "SHOP_REDACT"
    //   }
    // });
    
  } catch (error) {
    console.error("[Shop Redact] Failed to complete deletion:", error);
    // Don't throw - we still need to return 200 to Shopify
    // You may want to queue this for retry
  }
}

// No default export needed - this is a webhook-only route
// Shopify will only send POST requests to this endpoint