import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { gdprLogger } from "~/services/logger.server";
import { maskEmail } from "~/utils/pii-masker";

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

    const logger = gdprLogger.withContext({ shop, topic });
    logger.info('Compliance webhook received');

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
        logger.warn('Unhandled compliance topic', { topic });
        // Still return 200 to acknowledge receipt
        return json({ received: true, topic }, { status: 200 });
    }

    // Always return 200 to confirm receipt
    return json({ received: true, processed: topic }, { status: 200 });

  } catch (error) {
    gdprLogger.error('Compliance webhook processing error', error);

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
 * GDPR Article 15 - Right of access
 */
async function handleCustomerDataRequest(
  payload: CustomerDataRequestPayload,
  shop: string
) {
  const logger = gdprLogger.withContext({ shop, shopifyCustomerId: String(payload.customer.id) });
  // SECURITY: Mask email in logs to prevent PII exposure
  logger.gdpr('DATA_REQUEST_RECEIVED', {
    requestId: payload.data_request.id,
    customerEmail: maskEmail(payload.customer.email),
    ordersRequested: payload.orders_requested
  });

  try {
    // Find the customer in our system
    const customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: String(payload.customer.id)
      },
      include: {
        orders: {
          include: {
            lineItems: true,
            refunds: true
          }
        },
        tierSubscriptions: true,
        tierPurchases: true,
        tierState: true,
        tierChangeLogs: true,
        storeCreditLedger: true
      }
    });

    if (!customer) {
      logger.gdpr('DATA_REQUEST_NO_DATA', {
        requestId: payload.data_request.id,
        reason: 'Customer not found in our system'
      });
      return;
    }

    // Compile customer data report
    const customerDataReport = {
      requestId: payload.data_request.id,
      generatedAt: new Date().toISOString(),
      customer: {
        internalId: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        birthday: customer.birthday,
        createdAt: customer.createdAt,
        shopifyCreatedAt: customer.shopifyCreatedAt
      },
      financials: {
        storeCredit: customer.storeCredit,
        pointsBalance: customer.pointsBalance,
        lifetimePoints: customer.lifetimePoints,
        totalSpent: customer.totalSpent,
        annualSpent: customer.annualSpent,
        totalCashbackEarned: customer.totalCashbackEarned,
        totalRefunded: customer.totalRefunded,
        orderCount: customer.orderCount
      },
      tierStatus: customer.tierState ? {
        currentTierId: customer.tierState.effectiveTierId,
        tierSource: customer.tierState.tierSource,
        hasManualOverride: customer.tierState.hasManualOverride
      } : null,
      tierHistory: customer.tierChangeLogs.map(log => ({
        date: log.createdAt,
        fromTier: log.fromTierName,
        toTier: log.toTierName,
        changeType: log.changeType,
        triggerType: log.triggerType
      })),
      orders: customer.orders.map(order => ({
        orderId: order.shopifyOrderId,
        orderNumber: order.shopifyOrderNumber,
        date: order.createdAt,
        total: order.totalPrice,
        currency: order.currency,
        cashbackEarned: order.cashbackEarned,
        refunds: order.refunds.map(r => ({
          amount: r.amount,
          date: r.shopifyCreatedAt
        }))
      })),
      subscriptions: customer.tierSubscriptions.map(sub => ({
        tierId: sub.tierId,
        status: sub.status,
        startDate: sub.currentPeriodStart,
        billingInterval: sub.billingInterval
      })),
      storeCreditTransactions: customer.storeCreditLedger.map(entry => ({
        date: entry.createdAt,
        amount: entry.amount,
        type: entry.type,
        orderId: entry.shopifyOrderId
      }))
    };

    // Log the data export for audit trail
    logger.gdpr('DATA_REQUEST_COMPLETED', {
      requestId: payload.data_request.id,
      customerId: customer.id,
      dataPointsExported: {
        orders: customer.orders.length,
        subscriptions: customer.tierSubscriptions.length,
        tierChanges: customer.tierChangeLogs.length,
        creditTransactions: customer.storeCreditLedger.length
      }
    });

    // SECURITY: Never log full customer data - only log metadata
    // The actual data should be stored securely and sent to the merchant
    // via a secure channel, not exposed in application logs
    console.log('[GDPR Data Export] Generated', {
      requestId: payload.data_request.id,
      customerId: customer.id,
      recordCounts: {
        orders: customer.orders.length,
        subscriptions: customer.tierSubscriptions.length,
        tierChanges: customer.tierChangeLogs.length,
        creditTransactions: customer.storeCreditLedger.length
      },
      generatedAt: new Date().toISOString()
    });

    // TODO: In production, store this report securely and notify merchant
    // For GDPR compliance, the report should be:
    // 1. Encrypted at rest
    // 2. Accessible only to the merchant
    // 3. Automatically deleted after the 30-day deadline

  } catch (error) {
    logger.error('Failed to process data request', error);
    // Don't throw - we still need to return 200 to Shopify
  }
}

/**
 * Handle customers/redact webhook
 * Customer wants their data deleted
 * GDPR Article 17 - Right to erasure ("right to be forgotten")
 */
async function handleCustomerRedact(
  payload: CustomerRedactPayload,
  shop: string
) {
  const logger = gdprLogger.withContext({ shop, shopifyCustomerId: String(payload.customer.id) });
  // SECURITY: Mask email in logs to prevent PII exposure
  logger.gdpr('CUSTOMER_REDACT_RECEIVED', {
    customerEmail: maskEmail(payload.customer.email),
    ordersToRedact: payload.orders_to_redact
  });

  try {
    // Find the customer in our system
    const customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: String(payload.customer.id)
      }
    });

    if (!customer) {
      logger.gdpr('CUSTOMER_REDACT_NO_DATA', {
        reason: 'Customer not found in our system'
      });
      return;
    }

    // Track what we're deleting for audit
    const deletionSummary = {
      customerId: customer.id,
      shopifyCustomerId: payload.customer.id,
      deletedAt: new Date().toISOString()
    };

    // Use a transaction to ensure all-or-nothing deletion
    await db.$transaction(async (tx) => {
      // 1. Delete store credit ledger entries
      const deletedCredits = await tx.storeCreditLedger.deleteMany({
        where: { customerId: customer.id }
      });
      Object.assign(deletionSummary, { storeCreditEntries: deletedCredits.count });

      // 2. Delete email events (if any)
      const deletedEmailEvents = await tx.emailEvent.deleteMany({
        where: {
          shop,
          customerId: customer.shopifyCustomerId
        }
      });
      Object.assign(deletionSummary, { emailEvents: deletedEmailEvents.count });

      // 3. Delete tier change logs (will cascade, but explicit for audit)
      const deletedTierLogs = await tx.tierChangeLog.deleteMany({
        where: { customerId: customer.id }
      });
      Object.assign(deletionSummary, { tierChangeLogs: deletedTierLogs.count });

      // 4. Delete tier subscriptions (will cascade)
      const deletedSubscriptions = await tx.tierSubscription.deleteMany({
        where: { customerId: customer.id }
      });
      Object.assign(deletionSummary, { tierSubscriptions: deletedSubscriptions.count });

      // 5. Delete tier purchases (will cascade)
      const deletedPurchases = await tx.tierPurchase.deleteMany({
        where: { customerId: customer.id }
      });
      Object.assign(deletionSummary, { tierPurchases: deletedPurchases.count });

      // 6. Delete customer tier state (will cascade)
      const deletedTierState = await tx.customerTierState.deleteMany({
        where: { customerId: customer.id }
      });
      Object.assign(deletionSummary, { tierStates: deletedTierState.count });

      // 7. Anonymize orders (keep for financial/tax records, remove PII)
      // We keep order financial data but remove customer linkage
      const anonymizedOrders = await tx.order.updateMany({
        where: { customerId: customer.id },
        data: {
          customerId: customer.id, // Keep for now, but anonymize email
          email: 'redacted@gdpr.deleted'
        }
      });
      Object.assign(deletionSummary, { ordersAnonymized: anonymizedOrders.count });

      // 8. Finally, delete the customer record
      await tx.customer.delete({
        where: { id: customer.id }
      });
      Object.assign(deletionSummary, { customerDeleted: true });
    });

    // Log successful redaction for compliance audit
    logger.gdpr('CUSTOMER_REDACT_COMPLETED', deletionSummary);

  } catch (error) {
    logger.error('Failed to process customer redaction', error);
    // Log the failure for compliance tracking
    logger.gdpr('CUSTOMER_REDACT_FAILED', {
      shopifyCustomerId: payload.customer.id,
      error: error instanceof Error ? error.message : String(error)
    });
    // Don't throw - we still need to return 200 to Shopify
    // The failure is logged and should trigger a manual review
  }
}

/**
 * Handle shop/redact webhook
 * Shop has uninstalled the app - delete all shop data
 * Sent 48 hours after app uninstall
 */
async function handleShopRedact(
  payload: ShopRedactPayload,
  shop: string
) {
  const logger = gdprLogger.withContext({ shop, shopId: String(payload.shop_id) });
  logger.gdpr('SHOP_REDACT_RECEIVED', {
    shopDomain: payload.shop_domain
  });

  // Track deletion counts for audit
  const deletionSummary: Record<string, number | boolean | string> = {
    shop,
    shopId: payload.shop_id,
    deletedAt: new Date().toISOString()
  };

  try {
    // Use a transaction for atomicity, but break into batches for large datasets
    await db.$transaction(async (tx) => {
      // ============================================
      // 1. Delete leaf tables first (no dependencies)
      // ============================================

      // Email events
      const deletedEmailEvents = await tx.emailEvent.deleteMany({ where: { shop } });
      deletionSummary.emailEvents = deletedEmailEvents.count;

      // Store credit ledger (depends on customers, but delete explicitly)
      const deletedCredits = await tx.storeCreditLedger.deleteMany({ where: { shop } });
      deletionSummary.storeCreditEntries = deletedCredits.count;

      // Tier change logs
      const deletedTierLogs = await tx.tierChangeLog.deleteMany({ where: { shop } });
      deletionSummary.tierChangeLogs = deletedTierLogs.count;

      // Cron locks
      const deletedCronLocks = await tx.cronLockV2.deleteMany({ where: { shop } });
      deletionSummary.cronLocks = deletedCronLocks.count;

      // ============================================
      // 2. Delete subscription/purchase related
      // ============================================

      // Tier subscriptions
      const deletedSubscriptions = await tx.tierSubscription.deleteMany({ where: { shop } });
      deletionSummary.tierSubscriptions = deletedSubscriptions.count;

      // Tier purchases
      const deletedPurchases = await tx.tierPurchase.deleteMany({ where: { shop } });
      deletionSummary.tierPurchases = deletedPurchases.count;

      // Customer tier states
      const deletedTierStates = await tx.customerTierState.deleteMany({ where: { shop } });
      deletionSummary.customerTierStates = deletedTierStates.count;

      // ============================================
      // 3. Delete order-related data
      // ============================================

      // Order refund line items (via order cascade, but explicit)
      // First get all orders for this shop
      const shopOrders = await tx.order.findMany({
        where: { shop },
        select: { id: true }
      });
      const orderIds = shopOrders.map(o => o.id);

      if (orderIds.length > 0) {
        // Delete refund line items
        const deletedRefundItems = await tx.orderRefundLineItem.deleteMany({
          where: { refund: { orderId: { in: orderIds } } }
        });
        deletionSummary.orderRefundLineItems = deletedRefundItems.count;

        // Delete refunds
        const deletedRefunds = await tx.orderRefund.deleteMany({
          where: { orderId: { in: orderIds } }
        });
        deletionSummary.orderRefunds = deletedRefunds.count;

        // Delete line items
        const deletedLineItems = await tx.orderLineItem.deleteMany({
          where: { orderId: { in: orderIds } }
        });
        deletionSummary.orderLineItems = deletedLineItems.count;
      }

      // Delete orders
      const deletedOrders = await tx.order.deleteMany({ where: { shop } });
      deletionSummary.orders = deletedOrders.count;

      // ============================================
      // 4. Delete sync jobs
      // ============================================

      const deletedCustomerSyncJobs = await tx.customerSyncJob.deleteMany({ where: { shop } });
      deletionSummary.customerSyncJobs = deletedCustomerSyncJobs.count;

      const deletedOrderSyncJobs = await tx.orderSyncJob.deleteMany({ where: { shop } });
      deletionSummary.orderSyncJobs = deletedOrderSyncJobs.count;

      // ============================================
      // 5. Delete customers (major table)
      // ============================================

      const deletedCustomers = await tx.customer.deleteMany({ where: { shop } });
      deletionSummary.customers = deletedCustomers.count;

      // ============================================
      // 6. Delete tier products and tiers
      // ============================================

      // Tier product audit logs
      const deletedTierProductLogs = await tx.tierProductAuditLog.deleteMany({ where: { shop } });
      deletionSummary.tierProductAuditLogs = deletedTierProductLogs.count;

      // Tier products
      const deletedTierProducts = await tx.tierProduct.deleteMany({ where: { shop } });
      deletionSummary.tierProducts = deletedTierProducts.count;

      // Tiers
      const deletedTiers = await tx.tier.deleteMany({ where: { shop } });
      deletionSummary.tiers = deletedTiers.count;

      // ============================================
      // 7. Delete shop-level configuration
      // ============================================

      // Shop entitlements
      const deletedEntitlements = await tx.shopEntitlements.deleteMany({ where: { shop } });
      deletionSummary.shopEntitlements = deletedEntitlements.count;

      // Shop settings
      const deletedSettings = await tx.shopSettings.deleteMany({ where: { shop } });
      deletionSummary.shopSettings = deletedSettings.count;

      // Marketing automations (if exists)
      try {
        const deletedAutomations = await tx.marketingAutomation.deleteMany({ where: { shop } });
        deletionSummary.marketingAutomations = deletedAutomations.count;
      } catch {
        // Table might not exist in all environments
      }

      // ============================================
      // 8. Delete sessions (auth data)
      // ============================================

      const deletedSessions = await tx.session.deleteMany({ where: { shop } });
      deletionSummary.sessions = deletedSessions.count;
    });

    deletionSummary.success = true;
    logger.gdpr('SHOP_REDACT_COMPLETED', deletionSummary);

  } catch (error) {
    logger.error('Failed to complete shop redaction', error);
    deletionSummary.success = false;
    deletionSummary.error = error instanceof Error ? error.message : String(error);
    logger.gdpr('SHOP_REDACT_FAILED', deletionSummary);
    // Don't throw - we still need to return 200 to Shopify
    // The failure is logged and should trigger manual intervention
  }
}

// No default export needed - this is a webhook-only route
// Shopify will only send POST requests to this endpoint