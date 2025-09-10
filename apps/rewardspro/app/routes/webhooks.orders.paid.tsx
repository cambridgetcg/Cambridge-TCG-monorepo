import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { v4 as uuidv4 } from "uuid";
import type { Decimal } from "@prisma/client/runtime/library";
import { calculateTierAfterOrder } from "../services/tier-calculation.server";

// ============================================================================
// TYPES & INTERFACES
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

interface OrderWebhookPayload {
  id: number;
  admin_graphql_api_id: string;
  email?: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  currency: string;
  financial_status: string;
  cancelled_at?: string;
  customer?: {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  line_items?: Array<{
    id: number;
    price: string;
    quantity: number;
    title: string;
  }>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Round down to 2 decimal places for accurate currency calculations
 */
function roundDownToHundredths(value: number): number {
  return Math.floor(value * 100) / 100;
}

/**
 * Format number for Shopify API (exactly 2 decimal places)
 */
function formatForShopify(value: number): string {
  return roundDownToHundredths(value).toFixed(2);
}

/**
 * Convert Decimal type to number for calculations
 */
function decimalToNumber(value: Decimal | number): number {
  if (typeof value === 'number') return value;
  return parseFloat(value.toString());
}

// ============================================================================
// STEP 3: FETCH TRANSACTION DETAILS
// ============================================================================

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
      console.error("Failed to fetch order details:", result.errors);
      return null;
    }
    
    return result.data.order;
  } catch (error) {
    console.error("GraphQL query failed:", error);
    return null;
  }
}

// ============================================================================
// STEP 4: ANALYZE TRANSACTIONS
// ============================================================================

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
      console.log(`  Gift card: ${amount} (excluded)`);
    } else if (gateway.includes('store_credit')) {
      storeCreditAmount += amount;
      console.log(`  Store credit: ${amount} (excluded)`);
    } else {
      externalPaymentAmount += amount;
      console.log(`  External payment (${tx.gateway}): ${amount} (eligible)`);
    }
  });
  
  return {
    giftCardAmount,
    storeCreditAmount,
    externalPaymentAmount,
    cashbackEligibleAmount: externalPaymentAmount
  };
}

// ============================================================================
// STEP 5: CALCULATE CASHBACK
// ============================================================================

async function calculateCashback(
  customerId: string,
  shopDomain: string,
  eligibleAmount: number
): Promise<{ amount: number; percentage: number; tierName: string | null; tierId: string | null }> {
  // Get customer with their current tier
  const customer = await db.customer.findUnique({
    where: { id: customerId }
  });
  
  // Get current tier if exists
  let currentTier = null;
  if (customer?.currentTierId) {
    currentTier = await db.tier.findUnique({
      where: { id: customer.currentTierId }
    });
  }
  
  if (!customer) {
    console.error(`Customer ${customerId} not found`);
    return { amount: 0, percentage: 0, tierName: null, tierId: null };
  }
  
  // If customer has no tier, try to find default tier
  if (!currentTier) {
    const defaultTier = await db.tier.findFirst({
      where: {
        shop: shopDomain,
        minSpend: 0
      },
      orderBy: {
        minSpend: 'asc'
      }
    });
    
    if (!defaultTier) {
      console.log("No default tier found, no cashback awarded");
      return { amount: 0, percentage: 0, tierName: null, tierId: null };
    }
    
    // Assign default tier to customer
    await db.customer.update({
      where: { id: customerId },
      data: { currentTierId: defaultTier.id }
    });
    
    // Log initial tier assignment
    await db.tierChangeLog.create({
      data: {
        id: uuidv4(),
        customerId: customer.id,
        shop: shopDomain,
        fromTierId: null,
        fromTierName: null,
        toTierId: defaultTier.id,
        toTierName: defaultTier.name,
        changeType: "INITIAL_ASSIGNMENT",
        triggerType: "ACCOUNT_CREATED",
        processedBy: "system",
        note: "Default tier assigned on first order",
        createdAt: new Date()
      }
    });
    
    const cashbackPercent = defaultTier.cashbackPercent;
    const rawAmount = eligibleAmount * (cashbackPercent / 100);
    const cashbackAmount = roundDownToHundredths(rawAmount);
    
    return {
      amount: cashbackAmount,
      percentage: cashbackPercent,
      tierName: defaultTier.name,
      tierId: defaultTier.id
    };
  }
  
  const cashbackPercent = currentTier!.cashbackPercent;
  const rawAmount = eligibleAmount * (cashbackPercent / 100);
  const cashbackAmount = roundDownToHundredths(rawAmount);
  
  return {
    amount: cashbackAmount,
    percentage: cashbackPercent,
    tierName: currentTier!.name,
    tierId: currentTier!.id
  };
}

// ============================================================================
// STEP 6: ISSUE STORE CREDIT
// ============================================================================

async function issueStoreCredit(
  admin: any,
  customerId: string,
  amount: number,
  shop: string
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  // Fetch shop settings to get the store's configured currency
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop }
  });
  
  const currency = shopSettings?.storeCurrency || "USD";
  const formattedAmount = formatForShopify(amount);
  
  console.log(`Issuing store credit: ${formattedAmount} ${currency} (store currency)`);
  
  try {
    const response = await admin.graphql(
      `#graphql
      mutation IssueStoreCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
        storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
          storeCreditAccountTransaction {
            id
            amount {
              amount
              currencyCode
            }
            balanceAfterTransaction {
              amount
              currencyCode
            }
          }
          userErrors {
            field
            message
            code
          }
        }
      }`,
      {
        variables: {
          id: `gid://shopify/Customer/${customerId}`,
          creditInput: {
            creditAmount: {
              amount: formattedAmount,
              currencyCode: currency
            }
          }
        }
      }
    );
    
    const result = await response.json();
    
    // Check for errors
    if (result.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
      const errors = result.data.storeCreditAccountCredit.userErrors;
      const errorMessages = errors.map((e: any) => e.message).join(', ');
      console.error("Store credit errors:", errors);
      return { success: false, error: errorMessages };
    }
    
    // Check for successful transaction
    const transaction = result.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;
    if (transaction) {
      console.log(`✅ Store credit issued: ${transaction.id}`);
      console.log(`   New balance: ${transaction.balanceAfterTransaction.amount} ${currency}`);
      return { 
        success: true, 
        transactionId: transaction.id 
      };
    }
    
    return { success: false, error: "No transaction returned" };
    
  } catch (error) {
    console.error("Store credit API error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function recordCashbackTransaction(
  shopDomain: string,
  customerId: string,
  orderId: string,
  orderAmount: number,
  cashbackAmount: number,
  cashbackPercent: number,
  orderCurrency: string,
  storeCurrency: string,
  customerEmail: string,
  orderDate: string,
  tierName: string | null,
  tierId: string | null,
  shopifyTransactionId?: string
) {
  // Get current balance for running total
  const lastEntry = await db.storeCreditLedger.findFirst({
    where: { customerId },
    orderBy: { createdAt: 'desc' }
  });
  
  const previousBalance = lastEntry ? decimalToNumber(lastEntry.balance) : 0;
  const newBalance = previousBalance + cashbackAmount;
  
  // Create ledger entry
  const ledgerEntry = await db.storeCreditLedger.create({
    data: {
      id: uuidv4(),
      customerId,
      shop: shopDomain,
      amount: cashbackAmount,
      balance: newBalance,
      type: "CASHBACK_EARNED",
      shopifyOrderId: orderId,
      metadata: {
        orderId,
        orderAmount,
        cashbackPercent,
        tierName,
        tierId,
        orderCurrency,
        storeCurrency,
        customerEmail,
        orderDate,
        shopifyTransactionId: shopifyTransactionId || null,
        shopifySyncStatus: shopifyTransactionId ? "SUCCESS" : "PENDING",
        shopifySyncedAt: shopifyTransactionId ? new Date().toISOString() : null
      },
      createdAt: new Date()
    }
  });
  
  // Update customer balance
  const updatedCustomer = await db.customer.update({
    where: { id: customerId },
    data: {
      storeCredit: newBalance,
      updatedAt: new Date()
    }
  });
  
  return { ledgerEntry, updatedCustomer, previousBalance, newBalance };
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("\n" + "=".repeat(60));
  console.log("CASHBACK WEBHOOK - ORDER PAID");
  console.log("=".repeat(60));
  
  try {
    // Authenticate webhook
    const { shop, payload, admin } = await authenticate.webhook(request);
    
    // ========================================================================
    // STEP 1 & 2: RECEIVE ORDER & EXTRACT BASIC INFO
    // ========================================================================
    
    const order = payload as OrderWebhookPayload;
    
    // Extract essential information
    const orderId = order.id?.toString();
    const customerId = order.customer?.id?.toString();
    const customerEmail = order.customer?.email;
    const orderCurrency = order.currency || "USD";
    const webhookTotalPrice = parseFloat(order.total_price || "0");
    
    // Fetch shop settings to get store currency
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop }
    });
    const storeCurrency = shopSettings?.storeCurrency || "USD";
    
    console.log("\n📦 Order Information:");
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Customer: ${customerEmail} (ID: ${customerId})`);
    console.log(`   Total Price: ${webhookTotalPrice} ${orderCurrency}`);
    console.log(`   Financial Status: ${order.financial_status}`);
    console.log(`   Store Currency: ${storeCurrency}`);
    
    // Validation checks
    if (!customerId) {
      console.log("⏭️  Skipping: Guest checkout (no customer ID)");
      return new Response("OK", { status: 200 });
    }
    
    if (order.financial_status === 'voided' || order.cancelled_at) {
      console.log("⏭️  Skipping: Order cancelled or voided");
      return new Response("OK", { status: 200 });
    }
    
    // Check for duplicate processing
    const existingTransaction = await db.storeCreditLedger.findFirst({
      where: {
        shop,
        shopifyOrderId: orderId,
        type: "CASHBACK_EARNED"
      }
    });
    
    if (existingTransaction) {
      console.log("⏭️  Skipping: Order already processed");
      return new Response("OK", { status: 200 });
    }
    
    // Find or create customer
    let customer = await db.customer.findUnique({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId: customerId
        }
      }
    });
    
    if (!customer) {
      console.log("👤 Creating new customer record");
      customer = await db.customer.create({
        data: {
          id: uuidv4(),
          shop,
          shopifyCustomerId: customerId,
          email: customerEmail || "",
          storeCredit: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    }
    
    // ========================================================================
    // STEP 3: FETCH TRANSACTION DETAILS
    // ========================================================================
    
    console.log("\n💳 Fetching payment details...");
    
    let cashbackEligibleAmount = webhookTotalPrice; // Fallback
    
    if (admin) {
      const orderDetails = await fetchOrderTransactions(admin, orderId);
      
      if (orderDetails && orderDetails.transactions.length > 0) {
        // ====================================================================
        // STEP 4: ANALYZE TRANSACTIONS
        // ====================================================================
        
        console.log(`\n📊 Analyzing ${orderDetails.transactions.length} transactions:`);
        const breakdown = analyzeTransactions(orderDetails.transactions);
        
        console.log("\n💰 Payment Breakdown:");
        console.log(`   Gift Cards: ${breakdown.giftCardAmount.toFixed(2)} ${orderCurrency}`);
        console.log(`   Store Credit: ${breakdown.storeCreditAmount.toFixed(2)} ${orderCurrency}`);
        console.log(`   External Payments: ${breakdown.externalPaymentAmount.toFixed(2)} ${orderCurrency}`);
        console.log(`   ✅ Cashback Eligible: ${breakdown.cashbackEligibleAmount.toFixed(2)} ${orderCurrency}`);
        
        cashbackEligibleAmount = breakdown.cashbackEligibleAmount;
      } else {
        console.warn("⚠️  Could not fetch transactions, using webhook total");
      }
    } else {
      console.warn("⚠️  Admin API not available");
    }
    
    // Skip if no eligible amount
    if (cashbackEligibleAmount <= 0) {
      console.log("⏭️  Skipping: No cashback eligible amount");
      return new Response("OK", { status: 200 });
    }
    
    // ========================================================================
    // STEP 5: CALCULATE CASHBACK
    // ========================================================================
    
    console.log("\n🎯 Calculating cashback:");
    const cashback = await calculateCashback(
      customer.id, 
      shop, 
      cashbackEligibleAmount
    );
    
    console.log(`   Tier: ${cashback.tierName || 'Default'}`);
    console.log(`   Rate: ${cashback.percentage}%`);
    console.log(`   Amount: ${cashback.amount.toFixed(2)} ${storeCurrency}`);
    
    if (cashback.amount <= 0) {
      console.log("⏭️  Skipping: No cashback to award");
      return new Response("OK", { status: 200 });
    }
    
    // ========================================================================
    // STEP 6: ISSUE STORE CREDIT TO SHOPIFY
    // ========================================================================
    
    let shopifyTransactionId: string | undefined;
    
    // Temporarily disable store credit sync to prevent crashes
    const ENABLE_SHOPIFY_STORE_CREDIT = false; // Set to true when currency issue is resolved
    
    if (admin && cashback.amount > 0 && ENABLE_SHOPIFY_STORE_CREDIT) {
      console.log("\n💸 Issuing store credit in Shopify:");
      
      const creditResult = await issueStoreCredit(
        admin,
        customerId,
        cashback.amount,
        shop
      );
      
      if (creditResult.success) {
        shopifyTransactionId = creditResult.transactionId;
        console.log("   ✅ Success! Transaction ID:", shopifyTransactionId);
      } else {
        console.error("   ❌ Failed:", creditResult.error);
      }
    } else if (!ENABLE_SHOPIFY_STORE_CREDIT) {
      console.log("\n⚠️  Store credit sync disabled (currency issue)");
    }
    
    // ========================================================================
    // RECORD IN DATABASE
    // ========================================================================
    
    console.log("\n💾 Recording transaction in database:");
    const { ledgerEntry, previousBalance, newBalance } = await recordCashbackTransaction(
      shop,
      customer.id,
      orderId,
      cashbackEligibleAmount,
      cashback.amount,
      cashback.percentage,
      orderCurrency,
      storeCurrency,
      customerEmail || "",
      order.created_at,
      cashback.tierName,
      cashback.tierId,
      shopifyTransactionId
    );
    
    console.log(`   Transaction ID: ${ledgerEntry.id}`);
    console.log(`   Previous Balance: ${previousBalance.toFixed(2)}`);
    console.log(`   New Balance: ${newBalance.toFixed(2)}`);
    
    // ========================================================================
    // EVALUATE TIER UPGRADE
    // ========================================================================
    
    console.log("\n🏆 Evaluating tier upgrade...");
    const tierResult = await calculateTierAfterOrder(
      shop,
      customer.shopifyCustomerId,
      cashbackEligibleAmount,
      admin as any
    );
    
    if (tierResult?.changed) {
      console.log(`   🎉 Tier upgraded: ${tierResult.previousTierName || 'None'} → ${tierResult.newTierName || 'None'}`);
      console.log(`   Total spending: ${tierResult.totalSpending.toFixed(2)} ${storeCurrency}`);
    } else {
      console.log(`   No tier change required`);
    }
    
    console.log("\n✅ Webhook processing complete!");
    console.log("=".repeat(60) + "\n");
    
    return new Response("OK", { status: 200 });
    
  } catch (error) {
    console.error("\n❌ WEBHOOK ERROR:", error);
    console.error(error instanceof Error ? error.stack : error);
    
    // Return 200 to prevent Shopify retries
    return new Response("ERROR", { status: 200 });
  }
};