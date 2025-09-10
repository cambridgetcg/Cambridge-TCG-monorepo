import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createDataAPIPrismaClient } from "~/utils/prisma-data-api-adapter";
import { authenticate } from "~/shopify.server";
import { v4 as uuidv4 } from 'uuid';

// Initialize Prisma client
const db = createDataAPIPrismaClient();

// Configuration
const STORE_CREDIT_AMOUNT = 10; // Fixed £10 credit for all orders

/**
 * Issue store credit via Shopify GraphQL
 */
async function issueStoreCredit(
  admin: any,
  customerId: string,
  amount: number,
  currency: string,
  orderId: string
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  try {
    // Format customer ID as GID
    const gidCustomerId = `gid://shopify/Customer/${customerId}`;
    
    const mutation = `#graphql
      mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
        storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
          storeCreditAccountTransaction {
            id
            amount {
              amount
              currencyCode
            }
            account {
              id
              balance {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            message
            field
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, {
      variables: {
        id: gidCustomerId,
        creditInput: {
          creditAmount: {
            amount: amount.toFixed(2),
            currencyCode: currency
          }
        }
      }
    });

    const result = await response.json();
    
    if (result.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
      const errors = result.data.storeCreditAccountCredit.userErrors;
      console.error('[OrdersPaidWebhook] Store credit mutation errors:', errors);
      return { 
        success: false, 
        error: errors.map((e: any) => e.message).join(', ')
      };
    }

    if (result.data?.storeCreditAccountCredit?.storeCreditAccountTransaction) {
      const transaction = result.data.storeCreditAccountCredit.storeCreditAccountTransaction;
      console.log('[OrdersPaidWebhook] Store credit issued successfully:', {
        transactionId: transaction.id,
        amount: transaction.amount.amount,
        currency: transaction.amount.currencyCode,
        newBalance: transaction.account.balance.amount
      });
      
      return { 
        success: true, 
        transactionId: transaction.id 
      };
    }

    return { 
      success: false, 
      error: 'No transaction returned from mutation' 
    };
  } catch (error) {
    console.error('[OrdersPaidWebhook] Store credit mutation error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Main webhook handler for orders/paid
 * Adds £10 store credit to the customer who placed the order
 */
export async function action({ request }: ActionFunctionArgs) {
  const startTime = Date.now();
  
  try {
    // Authenticate webhook using Shopify's built-in verification
    const { shop, topic, payload, admin } = await authenticate.webhook(request);
    
    console.log('[OrdersPaidWebhook] Processing webhook:', {
      shop,
      topic,
      orderId: payload.id,
      hasAdmin: !!admin
    });

    // Extract order data from payload
    const orderId = payload.id?.toString();
    const customerId = payload.customer?.id?.toString();
    const customerEmail = payload.customer?.email;

    // Validate required fields
    if (!orderId || !customerId) {
      console.error('[OrdersPaidWebhook] Missing required fields');
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check for duplicate processing (idempotency)
    const existingEntry = await db.storeCreditLedger.findFirst({
      where: {
        shop,
        shopifyOrderId: orderId,
        type: 'CASHBACK_EARNED'
      }
    });

    if (existingEntry) {
      console.log('[OrdersPaidWebhook] Order already processed:', orderId);
      return json({ 
        success: true, 
        message: "Order already processed",
        orderId 
      });
    }

    // Get shop settings for store currency
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop }
    });

    // Use store currency, fallback to GBP if not configured
    const storeCurrency = shopSettings?.storeCurrency || 'GBP';

    console.log('[OrdersPaidWebhook] Using store currency:', storeCurrency);

    // Get or create customer
    let customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: customerId
      }
    });

    if (!customer) {
      // Create new customer
      customer = await db.customer.create({
        data: {
          id: uuidv4(),
          shop,
          shopifyCustomerId: customerId,
          email: customerEmail || '',
          storeCredit: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      console.log('[OrdersPaidWebhook] Created new customer:', customer.id);
    }

    // Calculate new balance
    const currentBalance = Number(customer.storeCredit);
    const newBalance = currentBalance + STORE_CREDIT_AMOUNT;

    // Issue store credit via Shopify using store currency
    const creditResult = await issueStoreCredit(
      admin,
      customerId,
      STORE_CREDIT_AMOUNT,
      storeCurrency,
      orderId
    );

    if (!creditResult.success) {
      console.error('[OrdersPaidWebhook] Failed to issue store credit:', creditResult.error);
      // Continue to record in database even if Shopify mutation fails
    }

    // Record transaction in database
    await db.storeCreditLedger.create({
      data: {
        id: uuidv4(),
        customerId: customer.id,
        shop,
        amount: STORE_CREDIT_AMOUNT,
        balance: newBalance,
        type: 'CASHBACK_EARNED',
        shopifyOrderId: orderId,
        metadata: {
          orderCurrency: payload.currency,
          storeCurrency,
          fixedAmount: true,
          creditAmount: STORE_CREDIT_AMOUNT,
          shopifyTransactionId: creditResult.transactionId || null,
          shopifyCreditSuccess: creditResult.success,
          orderTotal: payload.total_price
        },
        createdAt: new Date()
      }
    });

    // Update customer balance
    await db.customer.update({
      where: { id: customer.id },
      data: {
        storeCredit: newBalance,
        updatedAt: new Date()
      }
    });

    const processingTime = Date.now() - startTime;
    
    console.log('[OrdersPaidWebhook] Successfully processed order:', {
      orderId,
      customerId: customer.id,
      customerEmail,
      creditAmount: STORE_CREDIT_AMOUNT,
      newBalance,
      currency: storeCurrency,
      shopifyCreditIssued: creditResult.success,
      processingTimeMs: processingTime
    });

    return json({
      success: true,
      orderId,
      customerId,
      creditAmount: STORE_CREDIT_AMOUNT,
      currency: storeCurrency,
      newBalance,
      shopifyCreditIssued: creditResult.success,
      processingTimeMs: processingTime
    });

  } catch (error) {
    console.error('[OrdersPaidWebhook] Error processing webhook:', error);
    return json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}