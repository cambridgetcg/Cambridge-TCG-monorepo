/**
 * GDPR Customer Redaction Webhook
 * Handles customer data deletion requests (GDPR Article 17 - Right to Erasure)
 *
 * Shopify sends this webhook 48 hours after a customer requests data deletion
 * or when a store owner requests deletion from Shopify admin.
 *
 * Must anonymize or delete ALL personal data for the customer.
 *
 * @see https://shopify.dev/docs/apps/build/privacy-law-compliance
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { verifyWebhookHMAC } from "~/utils/webhook-validation.server";

interface CustomerRedactWebhook {
  shop_id: number;
  shop_domain: string;
  customer: {
    id: number;
    email: string;
    phone: string | null;
  };
  orders_to_redact: number[];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // CRITICAL: Verify HMAC before processing
  const rawBody = await request.text();

  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error('[GDPR] Invalid HMAC signature on customer redaction webhook');
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const webhookData: CustomerRedactWebhook = JSON.parse(rawBody);
    const shop = webhookData.shop_domain;
    const customerId = webhookData.customer.id.toString();
    const customerEmail = webhookData.customer.email;

    console.log(`[GDPR] Redaction request received for customer ${customerEmail} from shop ${shop}`);

    // Find customer in our system
    const customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: customerId,
      },
    });

    if (!customer) {
      console.log(`[GDPR] Customer ${customerEmail} not found in loyalty program - nothing to redact`);
      return json({
        success: true,
        message: "Customer not found in loyalty program",
      }, { status: 200 });
    }

    // ANONYMIZATION STRATEGY:
    // We CANNOT delete records entirely because:
    // 1. Store credit ledger must maintain integrity for financial audits
    // 2. Tier change logs may be needed for business analytics
    // 3. Foreign key constraints would fail
    //
    // Instead, we ANONYMIZE personal data while keeping transactional data

    const anonymizedEmail = `redacted-${customer.id}@privacy.invalid`;
    const anonymizedName = `Redacted User ${customer.id.substring(0, 8)}`;

    // Update customer record to anonymize PII
    await db.customer.update({
      where: { id: customer.id },
      data: {
        // Anonymize personal identifiers
        email: anonymizedEmail,
        displayName: anonymizedName,
        shopifyCustomerId: `redacted-${customer.shopifyCustomerId}`,

        // Zero out financial data (keep ledger for audit)
        storeCreditBalance: 0,
        pendingCredit: 0,
        lifetimeEarnings: 0,
        lifetimeSpent: 0,
        totalRedeemed: 0,
        tierCurrentSpend: 0,

        // Mark as redacted
        updatedAt: new Date(),
      },
    });

    // Anonymize store credit ledger descriptions (keep amounts for audit)
    await db.storeCreditLedger.updateMany({
      where: {
        customerId: customer.id,
        shop,
      },
      data: {
        description: "Redacted transaction",
        // Keep: amount, balanceAfter, type, createdAt (needed for financial audit)
        // Remove: orderId, referenceId (may contain PII)
        orderId: null,
        referenceId: null,
      },
    });

    // Anonymize tier change logs
    await db.tierChangeLog.updateMany({
      where: {
        customerId: customer.id,
        shop,
      },
      data: {
        reason: "Redacted",
        // Keep: changeType, previousTier, newTier, changedAt (business analytics)
      },
    });

    console.log(`[GDPR] Successfully redacted customer ${customerEmail} (ID: ${customer.id})`);
    console.log(`[GDPR] Anonymized email: ${anonymizedEmail}`);

    // Log redaction for compliance audit trail
    // TODO: Store in separate compliance log table with timestamp
    console.log('[GDPR] Redaction completed:', {
      customer_id: customer.id,
      original_email: customerEmail,
      anonymized_email: anonymizedEmail,
      redacted_at: new Date().toISOString(),
      shop,
    });

    return json({
      success: true,
      message: "Customer data redacted successfully",
      customer_id: customer.id,
    }, { status: 200 });

  } catch (error) {
    console.error('[GDPR] Error processing customer redaction webhook:', error);

    // Still return 200 to Shopify (we received the webhook)
    // Log error for manual follow-up (CRITICAL - must handle manually!)
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      note: "Manual intervention required - check logs",
    }, { status: 200 });
  }
};
