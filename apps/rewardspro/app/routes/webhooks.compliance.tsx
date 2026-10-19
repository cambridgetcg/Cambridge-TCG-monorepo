import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { gdprLogger } from "~/services/logger.server";
import { cleanupShopData, eraseCustomerData } from "~/services/shop-data-cleanup.server";
import { storeCustomerDataReport } from "~/services/customer-data-request.server";

/**
 * Mandatory Compliance Webhooks Handler
 * Required for Shopify App Store compliance
 * 
 * Handles three mandatory webhook topics:
 * 1. customers/data_request - Customer requests to view their data
 * 2. customers/redact - Customer requests to delete their data
 * 3. shop/redact - Shop data deletion after app uninstall
 *
 * Logs carry request ids and counts only, never a shopper's identifiers or
 * personal data.
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
 *
 * The report (everything held about the shopper) is stored encrypted for the
 * merchant to download from Settings > Privacy requests; the home page shows
 * them that it is waiting.
 */
async function handleCustomerDataRequest(
  payload: CustomerDataRequestPayload,
  shop: string
) {
  const logger = gdprLogger.withContext({ shop, requestId: payload.data_request.id });
  logger.gdpr('DATA_REQUEST_RECEIVED', {
    ordersRequested: payload.orders_requested?.length ?? 0
  });

  try {
    const report = await storeCustomerDataReport(shop, {
      shopifyRequestId: String(payload.data_request.id),
      shopifyCustomerId: String(payload.customer.id),
      email: payload.customer.email,
      ordersRequested: payload.orders_requested,
    });

    logger.gdpr(report.customerFound ? 'DATA_REQUEST_COMPLETED' : 'DATA_REQUEST_NO_CUSTOMER', {
      reportId: report.id,
      recordCount: report.recordCount
    });
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
  const logger = gdprLogger.withContext({ shop });
  logger.gdpr('CUSTOMER_REDACT_RECEIVED', {
    ordersToRedact: payload.orders_to_redact?.length ?? 0
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
      deletedAt: new Date().toISOString(),
      ...deletedCounts
    });

  } catch (error) {
    logger.error('Failed to process customer redaction', error);
    // Log the failure for compliance tracking
    logger.gdpr('CUSTOMER_REDACT_FAILED', {
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
