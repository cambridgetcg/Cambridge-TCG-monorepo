/**
 * GDPR Shop Redaction Webhook
 * Handles shop data deletion requests
 *
 * Shopify sends this webhook 48 hours after a store owner uninstalls the app
 * and requests data deletion, OR when Shopify closes a store.
 *
 * Must delete ALL data associated with the shop.
 *
 * @see https://shopify.dev/docs/apps/build/privacy-law-compliance
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { verifyWebhookHMAC } from "~/utils/webhook-validation.server";

interface ShopRedactWebhook {
  shop_id: number;
  shop_domain: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // CRITICAL: Verify HMAC before processing
  const rawBody = await request.text();

  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error('[GDPR] Invalid HMAC signature on shop redaction webhook');
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const webhookData: ShopRedactWebhook = JSON.parse(rawBody);
    const shop = webhookData.shop_domain;

    console.log(`[GDPR] Shop redaction request received for ${shop}`);

    // DELETE ALL DATA FOR THIS SHOP
    // Order matters due to foreign key constraints!

    // 1. Delete tier change logs (references customers)
    const tierChangeLogs = await db.tierChangeLog.deleteMany({
      where: { shop },
    });
    console.log(`[GDPR] Deleted ${tierChangeLogs.count} tier change logs`);

    // 2. Delete store credit ledger entries (references customers)
    const ledgerEntries = await db.storeCreditLedger.deleteMany({
      where: { shop },
    });
    console.log(`[GDPR] Deleted ${ledgerEntries.count} store credit ledger entries`);

    // 3. Delete customers
    const customers = await db.customer.deleteMany({
      where: { shop },
    });
    console.log(`[GDPR] Deleted ${customers.count} customers`);

    // 4. Delete tiers (references shop settings)
    const tiers = await db.tier.deleteMany({
      where: { shop },
    });
    console.log(`[GDPR] Deleted ${tiers.count} tiers`);

    // 5. Delete shop settings
    const shopSettings = await db.shopSettings.deleteMany({
      where: { shop },
    });
    console.log(`[GDPR] Deleted ${shopSettings.count} shop settings`);

    // 6. Delete monthly order usage (billing data)
    const monthlyUsage = await db.monthlyOrderUsage.deleteMany({
      where: { shop },
    });
    console.log(`[GDPR] Deleted ${monthlyUsage.count} monthly usage records`);

    // 7. Delete sessions (auth tokens)
    const sessions = await db.session.deleteMany({
      where: { shop },
    });
    console.log(`[GDPR] Deleted ${sessions.count} sessions`);

    // Log complete deletion summary
    const deletionSummary = {
      shop,
      deleted_at: new Date().toISOString(),
      counts: {
        tier_change_logs: tierChangeLogs.count,
        ledger_entries: ledgerEntries.count,
        customers: customers.count,
        tiers: tiers.count,
        shop_settings: shopSettings.count,
        monthly_usage: monthlyUsage.count,
        sessions: sessions.count,
      },
    };

    console.log('[GDPR] Shop deletion completed:', JSON.stringify(deletionSummary, null, 2));

    // TODO: Archive deletion summary for compliance audit
    // Store in separate audit log with 7-year retention

    return json({
      success: true,
      message: "All shop data deleted successfully",
      shop,
      summary: deletionSummary.counts,
    }, { status: 200 });

  } catch (error) {
    console.error('[GDPR] Error processing shop redaction webhook:', error);

    // Still return 200 to Shopify (we received the webhook)
    // Log error for manual follow-up (CRITICAL - must handle manually!)
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      note: "Manual intervention required - check logs and delete shop data manually",
    }, { status: 200 });
  }
};
