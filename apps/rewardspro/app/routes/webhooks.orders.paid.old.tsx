import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createDataAPIPrismaClient } from "~/utils/prisma-data-api-adapter";
import { authenticate } from "~/shopify.server";
import { v4 as uuidv4 } from 'uuid';
import { processTierProductPurchase } from "~/services/tier-product-purchase.server";
import { TierSubscriptionBridgeV2 as TierSubscriptionBridge } from "~/services/subscription/tier-subscription-bridge.server";

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
    const lineItems = payload.line_items || [];

    // Validate required fields
    if (!orderId || !customerId) {
      console.error('[OrdersPaidWebhook] Missing required fields');
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // ========================================================================
    // PROCESS TIER PRODUCT PURCHASES (ONE-TIME & SUBSCRIPTIONS)
    // ========================================================================
    
    console.log('[OrdersPaidWebhook] 🎯 Checking for tier product purchases...');
    
    for (const lineItem of lineItems) {
      const productId = lineItem.product_id?.toString();
      const variantId = lineItem.variant_id?.toString();
      const sku = lineItem.sku || '';
      const productTitle = lineItem.title || '';
      
      if (!productId) continue;
      
      try {
        // Fetch product details to get tags
        const productQuery = `#graphql
          query getProduct($id: ID!) {
            product(id: $id) {
              tags
            }
          }
        `;
        
        const productResponse = await admin.graphql(productQuery, {
          variables: { id: `gid://shopify/Product/${productId}` }
        });
        
        const productData = await productResponse.json();
        const tags = productData.data?.product?.tags || [];
        
        // Check if this is a tier product
        if (tags.includes('tier-membership')) {
          console.log(`[OrdersPaidWebhook] 🏆 Found tier product: ${productTitle}`);
          
          // NEW: Check if this is a subscription purchase
          const sellingPlanAllocation = lineItem.selling_plan_allocation;
          const isSubscription = !!sellingPlanAllocation;
          
          if (isSubscription) {
            // Handle subscription purchase
            console.log(`[OrdersPaidWebhook] 📅 Processing as SUBSCRIPTION purchase`);
            console.log(`[OrdersPaidWebhook] Selling Plan: ${sellingPlanAllocation.selling_plan.name}`);
            
            const subscriptionResult = await TierSubscriptionBridge.handleTierSubscriptionPurchase({
              shop,
              admin,
              customerId,
              customerShopifyId: customerId,
              lineItem,
              orderId: orderId.toString(),
              sellingPlanId: sellingPlanAllocation.selling_plan.id?.toString(),
              contractId: lineItem.subscription_contract_id || sellingPlanAllocation.subscription_contract_id || '',
            });
            
            if (subscriptionResult.success) {
              console.log(`[OrdersPaidWebhook] ✅ Subscription created for tier product`);
              console.log(`[OrdersPaidWebhook] Contract ID: ${subscriptionResult.subscription?.subscriptionContractId}`);
              console.log(`[OrdersPaidWebhook] Billing: ${subscriptionResult.subscription?.billingInterval}`);
            } else {
              console.error(`[OrdersPaidWebhook] ❌ Failed to create subscription: ${subscriptionResult.error}`);
            }
          } else {
            // Handle one-time purchase
            console.log(`[OrdersPaidWebhook] 💳 Processing as ONE-TIME purchase`);
            
            const purchaseResult = await processTierProductPurchase(
              shop,
              customerId,
              orderId,
              productId,
              variantId,
              sku,
              tags,
              productTitle,
              admin
            );
            
            if (purchaseResult.success) {
              console.log(`[OrdersPaidWebhook] ✅ Tier ${purchaseResult.tierName} assigned to customer via one-time purchase`);
              console.log(`[OrdersPaidWebhook] Duration: ${purchaseResult.duration}, Expires: ${purchaseResult.expiresAt || 'Never'}`);
            } else {
              console.error(`[OrdersPaidWebhook] ❌ Failed to assign tier: ${purchaseResult.error}`);
            }
          }
        }
      } catch (error) {
        console.error(`[OrdersPaidWebhook] Error processing tier product ${productId}:`, error);
        // Continue processing other items even if one fails
      }
    }
    
    console.log('[OrdersPaidWebhook] 🎯 Tier product processing complete');

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

    // Track monthly order usage for free plan limits
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // JavaScript months are 0-based
    
    // Get or create monthly usage record
    let monthlyUsage = await db.monthlyOrderUsage.findUnique({
      where: {
        shop_year_month: {
          shop,
          year,
          month
        }
      }
    });
    
    // Check current plan to determine limits
    const { billing } = await authenticate.admin(request);
    let currentPlanName = 'RewardsPro Free'; // Default to free plan
    let planLimit = 100; // Free plan limit
    
    if (billing) {
      try {
        const { FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } = await import("~/shopify.server");
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [MONTHLY_PLAN, ANNUAL_PLAN],
          isTest: false,
        });
        
        if (hasActivePayment && appSubscriptions?.length > 0) {
          currentPlanName = appSubscriptions[0].name;
          // Set plan limits based on plan type
          switch(currentPlanName) {
            case 'RewardsPro Free':
              planLimit = 100;
              break;
            case 'RewardsPro Starter':
              planLimit = 500;
              break;
            case 'RewardsPro Growth':
              planLimit = 2000;
              break;
            case 'RewardsPro Enterprise':
              planLimit = 10000;
              break;
            case 'RewardsPro Annual':
              planLimit = 12000;
              break;
            case 'RewardsPro Monthly':
              planLimit = 1000;
              break;
            default:
              planLimit = 100; // Default to free plan limit
          }
        }
      } catch (error) {
        console.warn('[OrdersPaidWebhook] Could not check billing status:', error);
      }
    }
    
    // Create or update monthly usage
    if (!monthlyUsage) {
      monthlyUsage = await db.monthlyOrderUsage.create({
        data: {
          id: uuidv4(),
          shop,
          year,
          month,
          orderCount: 1,
          planLimit,
          planName: currentPlanName,
          lastOrderDate: now,
          createdAt: now,
          updatedAt: now
        }
      });
      console.log('[OrdersPaidWebhook] Created monthly usage record:', monthlyUsage);
    } else {
      // Update existing usage
      monthlyUsage = await db.monthlyOrderUsage.update({
        where: {
          id: monthlyUsage.id
        },
        data: {
          orderCount: monthlyUsage.orderCount + 1,
          planLimit,
          planName: currentPlanName,
          lastOrderDate: now,
          updatedAt: now
        }
      });
      console.log('[OrdersPaidWebhook] Updated monthly usage:', {
        orderCount: monthlyUsage.orderCount,
        planLimit: monthlyUsage.planLimit,
        remaining: monthlyUsage.planLimit - monthlyUsage.orderCount
      });
    }
    
    // Check if free plan limit exceeded
    if (currentPlanName === 'RewardsPro Free' && monthlyUsage.orderCount > 100) {
      console.warn('[OrdersPaidWebhook] ⚠️ Free plan limit exceeded!', {
        shop,
        orderCount: monthlyUsage.orderCount,
        limit: 100
      });
      
      // Create notification for merchant
      await db.notification.create({
        data: {
          id: uuidv4(),
          shop,
          type: 'FREE_PLAN_LIMIT_EXCEEDED',
          title: 'Free Plan Limit Exceeded',
          message: `You've processed ${monthlyUsage.orderCount} orders this month, exceeding your free plan limit of 100 orders. Please upgrade to continue earning cashback rewards.`,
          severity: 'WARNING',
          read: false,
          createdAt: now
        }
      });
      
      // Don't process cashback for orders over the limit
      return json({
        success: false,
        message: "Free plan limit exceeded. Upgrade required.",
        orderId,
        orderCount: monthlyUsage.orderCount,
        limit: 100
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