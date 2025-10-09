/**
 * GDPR Data Request Webhook
 * Handles customer data export requests (GDPR Article 15 - Right of Access)
 *
 * Shopify sends this webhook when a customer requests their data.
 * Must respond within 30 days with all personal data held.
 *
 * @see https://shopify.dev/docs/apps/build/privacy-law-compliance
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { verifyWebhookHMAC } from "~/utils/webhook-validation.server";

interface DataRequestWebhook {
  shop_id: number;
  shop_domain: string;
  orders_requested: string[];
  customer: {
    id: number;
    email: string;
    phone: string | null;
  };
  data_request: {
    id: number;
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // CRITICAL: Verify HMAC before processing
  const rawBody = await request.text();

  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error('[GDPR] Invalid HMAC signature on data request webhook');
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const webhookData: DataRequestWebhook = JSON.parse(rawBody);
    const shop = webhookData.shop_domain;
    const customerId = webhookData.customer.id.toString();
    const customerEmail = webhookData.customer.email;

    console.log(`[GDPR] Data request received for customer ${customerEmail} from shop ${shop}`);

    // Fetch ALL customer data from our system
    const customerData = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: customerId,
      },
      include: {
        tier: true,
        storeCreditLedger: {
          orderBy: { createdAt: 'desc' },
        },
        tierChangeLogs: {
          orderBy: { changedAt: 'desc' },
        },
      },
    });

    // Prepare data export
    const dataExport = {
      customer_id: customerId,
      email: customerEmail,
      shop: shop,
      data_collected_at: new Date().toISOString(),
      loyalty_program_data: customerData ? {
        // Personal Information
        display_name: customerData.displayName,
        email: customerData.email,

        // Tier Information
        current_tier: customerData.tier ? {
          name: customerData.tier.name,
          level: customerData.tier.level,
          cashback_rate: customerData.tier.cashbackRate,
        } : null,

        // Financial Data
        store_credit_balance: customerData.storeCreditBalance,
        pending_credit: customerData.pendingCredit,
        lifetime_earnings: customerData.lifetimeEarnings,
        lifetime_spent: customerData.lifetimeSpent,
        total_redeemed: customerData.totalRedeemed,

        // Tier Progress
        tier_current_spend: customerData.tierCurrentSpend,

        // Transaction History
        transactions: customerData.storeCreditLedger.map(ledger => ({
          id: ledger.id,
          type: ledger.type,
          amount: ledger.amount,
          balance_after: ledger.balanceAfter,
          description: ledger.description,
          order_id: ledger.orderId,
          reference_id: ledger.referenceId,
          created_at: ledger.createdAt.toISOString(),
        })),

        // Tier Change History
        tier_history: customerData.tierChangeLogs.map(log => ({
          change_type: log.changeType,
          previous_tier: log.previousTier,
          new_tier: log.newTier,
          reason: log.reason,
          changed_at: log.changedAt.toISOString(),
        })),

        // Metadata
        enrolled_at: customerData.createdAt.toISOString(),
        last_updated: customerData.updatedAt.toISOString(),
      } : {
        message: "No loyalty program data found for this customer",
      },
    };

    // Log the data request for audit trail
    console.log(`[GDPR] Data export prepared for customer ${customerEmail}:`, {
      transactions_count: customerData?.storeCreditLedger.length || 0,
      tier_changes_count: customerData?.tierChangeLogs.length || 0,
    });

    // TODO: Send data export to customer email
    // In production, you should:
    // 1. Send email with data export attached (JSON or PDF)
    // 2. Store request in compliance log
    // 3. Track 30-day response deadline

    // For now, log to console (replace with email service)
    console.log('[GDPR] Data export ready to send:', JSON.stringify(dataExport, null, 2));

    // Shopify expects 200 OK response
    return json({
      success: true,
      message: "Data request processed",
      customer_email: customerEmail,
    }, { status: 200 });

  } catch (error) {
    console.error('[GDPR] Error processing data request webhook:', error);

    // Still return 200 to Shopify (we received the webhook)
    // Log error for internal follow-up
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 200 });
  }
};
