import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { gdprLogger } from "~/services/logger.server";
import { cleanupShopData, eraseCustomerData } from "~/services/shop-data-cleanup.server";
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

    // 200 only once the request has been fully handled
    return json({ received: true, processed: topic }, { status: 200 });

  } catch (error) {
    // Authentication failures (invalid HMAC etc.) come back as a Response
    if (error instanceof Response) {
      return error;
    }

    gdprLogger.error('Compliance webhook processing error', error);

    // A compliance request that failed must not be acknowledged: answering
    // 5xx makes Shopify redeliver it, so the obligation is not lost.
    return json({ received: true, error: "Processing failed" }, { status: 500 });
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
    // Find the customer in our system, with everything held about them
    const customer = await prisma.customer.findUnique({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId: String(payload.customer.id)
        }
      },
      include: {
        orders: { include: { refunds: true } },
        subscriptions: true,
        tierPurchases: true,
        tierState: true,
        tierChangeLogs: true,
        creditLedger: true
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
      tierHistory: customer.tierChangeLogs.map((log) => ({
        date: log.createdAt,
        fromTier: log.fromTierName,
        toTier: log.toTierName,
        changeType: log.changeType,
        triggerType: log.triggerType
      })),
      orders: customer.orders.map((order) => ({
        orderId: order.shopifyOrderId,
        orderNumber: order.shopifyOrderNumber,
        date: order.createdAt,
        total: order.totalPrice,
        currency: order.currency,
        cashbackEarned: order.cashbackAmount,
        refunds: order.refunds.map((r) => ({
          amount: r.amount,
          date: r.shopifyCreatedAt
        }))
      })),
      subscriptions: customer.subscriptions.map((sub) => ({
        tierId: sub.tierId,
        status: sub.status,
        startDate: sub.currentPeriodStart,
        billingInterval: sub.billingInterval
      })),
      storeCreditTransactions: customer.creditLedger.map((entry) => ({
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
        subscriptions: customer.subscriptions.length,
        tierChanges: customer.tierChangeLogs.length,
        creditTransactions: customer.creditLedger.length
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
        subscriptions: customer.subscriptions.length,
        tierChanges: customer.tierChangeLogs.length,
        creditTransactions: customer.creditLedger.length
      },
      generatedAt: new Date().toISOString()
    });

    // TODO: In production, store this report securely and notify merchant
    // For GDPR compliance, the report should be:
    // 1. Encrypted at rest
    // 2. Accessible only to the merchant
    // 3. Automatically deleted after the 30-day deadline
    return customerDataReport;

  } catch (error) {
    logger.error('Failed to process data request', error);
    throw error;
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
    // Erase every row that references the customer or carries their ids or
    // email (see services/shop-data-cleanup.server.ts), in one transaction
    const { customerFound, deletedCounts } = await eraseCustomerData(shop, {
      shopifyCustomerId: String(payload.customer.id),
      email: payload.customer.email,
    });

    if (!customerFound) {
      logger.gdpr('CUSTOMER_REDACT_NO_DATA', {
        reason: 'Customer not found in our system',
        emailLinkedRecordsDeleted: deletedCounts
      });
      return;
    }

    // Log successful redaction for compliance audit
    logger.gdpr('CUSTOMER_REDACT_COMPLETED', {
      shopifyCustomerId: payload.customer.id,
      deletedAt: new Date().toISOString(),
      ...deletedCounts
    });

  } catch (error) {
    logger.error('Failed to process customer redaction', error);
    // Log the failure for compliance tracking
    logger.gdpr('CUSTOMER_REDACT_FAILED', {
      shopifyCustomerId: payload.customer.id,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
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

  // One erasure for uninstall and shop/redact, derived from the data model
  const result = await cleanupShopData(shop);
  Object.assign(deletionSummary, result.deletedCounts);

  if (!result.success) {
    deletionSummary.success = false;
    deletionSummary.error = result.errors.join('; ');
    logger.gdpr('SHOP_REDACT_FAILED', deletionSummary);
    throw new Error(`Shop redaction failed for ${shop}`);
  }

  deletionSummary.success = true;
  logger.gdpr('SHOP_REDACT_COMPLETED', deletionSummary);
}

// No default export needed - this is a webhook-only route
// Shopify will only send POST requests to this endpoint
