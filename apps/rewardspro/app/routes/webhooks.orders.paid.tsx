import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createDataAPIPrismaClient } from "~/utils/prisma-data-api-adapter";
import { authenticate } from "~/shopify.server";
import { v4 as uuidv4 } from 'uuid';

// Initialize Prisma client
const db = createDataAPIPrismaClient();

// Configuration
const DEFAULT_CASHBACK_PERCENTAGE = 0.05; // 5% default cashback if no tier assigned

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Transaction {
  id: string;
  gateway: string;
  status: string;
  kind: string;
  amountSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  parentTransaction?: {
    id: string;
  };
}

interface OrderDetails {
  id: string;
  totalReceivedSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  transactions: Transaction[];
}

interface PaymentBreakdown {
  giftCardAmount: number;
  storeCreditAmount: number;
  externalPaymentAmount: number;
  cashbackEligibleAmount: number;
}

// ============================================================================
// GRAPHQL FUNCTIONS
// ============================================================================

/**
 * Fetch detailed order transactions from Shopify
 */
async function fetchOrderTransactions(
  admin: any,
  orderId: string
): Promise<OrderDetails | null> {
  const query = `#graphql
    query GetOrderPaymentDetails($id: ID!) {
      order(id: $id) {
        id
        totalReceivedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        transactions(first: 250) {
          id
          gateway
          status
          kind
          amountSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          parentTransaction {
            id
          }
        }
      }
    }
  `;

  const gid = orderId.startsWith('gid://') 
    ? orderId 
    : `gid://shopify/Order/${orderId}`;
  
  try {
    const response = await admin.graphql(query, { 
      variables: { id: gid } 
    });
    const result = await response.json();
    
    if (result.errors || !result.data?.order) {
      console.error('[OrdersPaidWebhook] Failed to fetch order details:', result.errors);
      return null;
    }
    
    return result.data.order;
  } catch (error) {
    console.error('[OrdersPaidWebhook] GraphQL query failed:', error);
    return null;
  }
}

/**
 * Analyze transactions to determine cashback eligible amount
 */
function analyzeTransactions(transactions: Transaction[]): PaymentBreakdown {
  let giftCardAmount = 0;
  let storeCreditAmount = 0;
  let externalPaymentAmount = 0;
  
  // Only process successful SALE or CAPTURE transactions
  const validTransactions = transactions.filter(tx => {
    const isSuccessful = tx.status === 'SUCCESS';
    const isPayment = ['SALE', 'CAPTURE'].includes(tx.kind);
    return isSuccessful && isPayment;
  });
  
  // Deduplicate CAPTURE/AUTHORIZATION pairs
  const processedIds = new Set<string>();
  
  validTransactions.forEach(tx => {
    // Skip if we've already processed this transaction
    if (processedIds.has(tx.id)) return;
    
    // Skip CAPTURE if we already processed its AUTHORIZATION
    if (tx.kind === 'CAPTURE' && tx.parentTransaction) {
      const parentAuth = transactions.find(
        t => t.id === tx.parentTransaction!.id && t.kind === 'AUTHORIZATION'
      );
      if (parentAuth && processedIds.has(parentAuth.id)) {
        return;
      }
    }
    
    processedIds.add(tx.id);
    const amount = parseFloat(tx.amountSet.shopMoney.amount);
    const gateway = tx.gateway.toLowerCase();
    
    // Categorize payment by gateway
    if (gateway.includes('gift_card')) {
      giftCardAmount += amount;
      console.log(`  [OrdersPaidWebhook] Gift card: ${amount} (excluded from cashback)`);
    } else if (gateway.includes('store_credit')) {
      storeCreditAmount += amount;
      console.log(`  [OrdersPaidWebhook] Store credit: ${amount} (excluded from cashback)`);
    } else {
      externalPaymentAmount += amount;
      console.log(`  [OrdersPaidWebhook] External payment (${tx.gateway}): ${amount} (eligible for cashback)`);
    }
  });
  
  return {
    giftCardAmount,
    storeCreditAmount,
    externalPaymentAmount,
    cashbackEligibleAmount: externalPaymentAmount
  };
}

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
 * 
 * Features:
 * - Fetches detailed transaction data via GraphQL
 * - Excludes gift cards and store credit from cashback calculation
 * - Uses customer's tier cashback percentage (falls back to 5% if no tier)
 * - Only calculates cashback on external payment methods
 * - Prevents duplicate processing with idempotency checks
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
    const webhookTotalPrice = parseFloat(payload.total_price || '0');

    // Validate required fields
    if (!orderId || !customerId) {
      console.error('[OrdersPaidWebhook] Missing required fields');
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // ========================================================================
    // FETCH TRANSACTION DETAILS FOR ACCURATE CASHBACK CALCULATION
    // ========================================================================
    
    console.log('[OrdersPaidWebhook] 💳 Fetching payment details...');
    
    let cashbackEligibleAmount = webhookTotalPrice; // Fallback to webhook data
    let paymentBreakdown: PaymentBreakdown | null = null;
    
    if (admin) {
      const orderDetails = await fetchOrderTransactions(admin, orderId);
      
      if (orderDetails && orderDetails.transactions.length > 0) {
        console.log(`[OrdersPaidWebhook] 📊 Analyzing ${orderDetails.transactions.length} transactions:`);
        paymentBreakdown = analyzeTransactions(orderDetails.transactions);
        
        console.log('[OrdersPaidWebhook] 💰 Payment Breakdown:');
        console.log(`   Gift Cards: ${paymentBreakdown.giftCardAmount.toFixed(2)}`);
        console.log(`   Store Credit: ${paymentBreakdown.storeCreditAmount.toFixed(2)}`);
        console.log(`   External Payments: ${paymentBreakdown.externalPaymentAmount.toFixed(2)}`);
        console.log(`   ✅ Cashback Eligible: ${paymentBreakdown.cashbackEligibleAmount.toFixed(2)}`);
        
        cashbackEligibleAmount = paymentBreakdown.cashbackEligibleAmount;
      } else {
        console.warn('[OrdersPaidWebhook] ⚠️ Could not fetch transactions, using webhook total');
      }
    } else {
      console.warn('[OrdersPaidWebhook] ⚠️ Admin API not available');
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

    // Use store currency, fallback to USD if not configured
    const storeCurrency = shopSettings?.storeCurrency || 'USD';

    console.log('[OrdersPaidWebhook] Using store currency:', storeCurrency);

    // Get or create customer with tier information
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

    // Get customer's tier for cashback percentage
    let cashbackPercentage = DEFAULT_CASHBACK_PERCENTAGE;
    let tierName = null;
    
    if (customer.currentTierId) {
      const tier = await db.tier.findFirst({
        where: {
          id: customer.currentTierId,
          shop // CRITICAL: Always scope to shop for security
        }
      });
      
      if (tier) {
        // Tier cashbackPercent is stored as an integer (e.g., 10 for 10%)
        cashbackPercentage = tier.cashbackPercent / 100;
        tierName = tier.name;
        console.log('[OrdersPaidWebhook] Using tier cashback:', {
          tierId: tier.id,
          tierName: tier.name,
          cashbackPercent: `${tier.cashbackPercent}%`
        });
      }
    } else {
      console.log('[OrdersPaidWebhook] No tier assigned, using default cashback:', `${DEFAULT_CASHBACK_PERCENTAGE * 100}%`);
    }

    // Calculate cashback amount based on tier percentage and eligible amount
    const creditAmount = Math.round(cashbackEligibleAmount * cashbackPercentage * 100) / 100; // Round to 2 decimal places
    
    console.log('[OrdersPaidWebhook] Calculating cashback:', {
      orderTotal: webhookTotalPrice,
      eligibleAmount: cashbackEligibleAmount,
      tierName,
      percentage: `${cashbackPercentage * 100}%`,
      creditAmount
    });

    // Calculate new balance
    const currentBalance = Number(customer.storeCredit);
    const newBalance = currentBalance + creditAmount;

    // Issue store credit via Shopify using store currency
    const creditResult = await issueStoreCredit(
      admin,
      customerId,
      creditAmount,
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
        amount: creditAmount,
        balance: newBalance,
        type: 'CASHBACK_EARNED',
        shopifyOrderId: orderId,
        metadata: {
          orderCurrency: payload.currency,
          storeCurrency,
          tierName: tierName || 'No Tier',
          tierId: customer.currentTierId || null,
          percentageBased: true,
          cashbackPercentage: cashbackPercentage * 100,
          creditAmount,
          shopifyTransactionId: creditResult.transactionId || null,
          shopifyCreditSuccess: creditResult.success,
          orderTotal: webhookTotalPrice,
          eligibleAmount: cashbackEligibleAmount,
          paymentBreakdown: paymentBreakdown ? {
            giftCardAmount: paymentBreakdown.giftCardAmount,
            storeCreditAmount: paymentBreakdown.storeCreditAmount,
            externalPaymentAmount: paymentBreakdown.externalPaymentAmount
          } : null
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
      tierName: tierName || 'No Tier',
      orderTotal: webhookTotalPrice,
      eligibleAmount: cashbackEligibleAmount,
      creditAmount,
      cashbackPercentage: `${cashbackPercentage * 100}%`,
      newBalance,
      currency: storeCurrency,
      shopifyCreditIssued: creditResult.success,
      paymentBreakdown: paymentBreakdown || 'Not available',
      processingTimeMs: processingTime
    });

    return json({
      success: true,
      orderId,
      customerId,
      tierName: tierName || 'No Tier',
      orderTotal: webhookTotalPrice,
      eligibleAmount: cashbackEligibleAmount,
      creditAmount,
      cashbackPercentage: cashbackPercentage * 100,
      currency: storeCurrency,
      newBalance,
      shopifyCreditIssued: creditResult.success,
      paymentBreakdown: paymentBreakdown || null,
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