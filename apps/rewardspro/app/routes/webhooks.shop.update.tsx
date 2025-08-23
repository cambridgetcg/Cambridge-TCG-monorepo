import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("\n" + "=".repeat(60));
  console.log("WEBHOOK: SHOP/UPDATE");
  console.log("=".repeat(60));

  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    
    console.log(`[Shop Update] Shop ${shop} configuration changed`);
    console.log(`[Shop Update] New currency: ${payload.currency}`);
    console.log(`[Shop Update] Money format: ${payload.money_format}`);
    
    // Clear the session to force re-authentication with new shop data
    const deletedSessions = await db.session.deleteMany({
      where: { shop }
    });
    
    console.log(`[Shop Update] Cleared ${deletedSessions.count} sessions for ${shop}`);
    console.log("[Shop Update] App will re-authenticate on next access");
    
    // You could also store currency here in a new Shop settings table
    // For now, just log it
    console.log(`[Shop Update] Shop details:`, {
      currency: payload.currency,
      money_format: payload.money_format,
      money_with_currency_format: payload.money_with_currency_format,
      timezone: payload.timezone,
      country_code: payload.country_code
    });
    
    console.log("=".repeat(60) + "\n");
    
    return new Response("OK", { status: 200 });
    
  } catch (error) {
    console.error("[Shop Update] Error processing webhook:", error);
    
    // Return 200 to prevent Shopify from retrying
    return new Response("OK", { status: 200 });
  }
};