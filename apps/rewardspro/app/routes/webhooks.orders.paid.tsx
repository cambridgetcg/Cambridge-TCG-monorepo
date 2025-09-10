/**
 * Orders/Paid Webhook Handler v2.0
 * 
 * Purpose: Process paid orders to award store credit (cashback) to customers
 * based on their loyalty tier. This webhook ensures customers receive immediate
 * rewards when their order is marked as paid.
 * 
 * Key Features:
 * - HMAC verification for security
 * - Idempotency to prevent duplicate processing
 * - Smart payment analysis (excludes gift cards/store credit)
 * - Tier-based cashback calculation
 * - Store credit issuance via Shopify API
 * - Comprehensive error handling and recovery
 * - Automatic tier evaluation and upgrades
 * 
 * @version 2.0
 * @date January 2025
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { v4 as uuidv4 } from "uuid";
import type { Decimal } from "@prisma/client/runtime/library";
import { calculateTierAfterOrder } from "../services/tier-calculation.server";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Shopify Order Webhook Payload
 */
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

/**
 * Shopify Transaction from GraphQL
 */
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

/**
 * Order details with transactions
 */
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

/**
 * Payment breakdown for cashback calculation
 */
interface PaymentBreakdown {
  giftCardAmount: number;
  storeCreditAmount: number;
  externalPaymentAmount: number;
  cashbackEligibleAmount: number;
}

/**
 * Cashback calculation result
 */
interface CashbackResult {
  amount: number;
  percentage: number;
  tierName: string | null;
  tierId: string | null;
}

/**
 * Store credit mutation result
 */
interface StoreCreditResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  newBalance?: number;
}

/**
 * Processing context for the webhook
 */
interface ProcessingContext {
  shop: string;
  order: OrderWebhookPayload;
  orderId: string;
  customerId: string;
  customerEmail: string;
  orderCurrency: string;
  storeCurrency: string;
  shopSettings: any;
  admin: any;
  startTime: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Enable/disable store credit sync to Shopify
  ENABLE_SHOPIFY_STORE_CREDIT: true,
  
  // Processing timeouts
  MAX_PROCESSING_TIME: 4500, // 4.5 seconds (leave buffer for 5s Shopify timeout)
  
  // Logging levels
  LOG_LEVEL: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  
  // Default values
  DEFAULT_CURRENCY: 'USD',
  DEFAULT_CASHBACK_PERCENT: 1,
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // milliseconds
};

// ============================================================================
// LOGGING UTILITY
// ============================================================================

class WebhookLogger {
  private context: string;
  private eventId?: string;
  
  constructor(context: string, eventId?: string) {
    this.context = context;
    this.eventId = eventId;
  }
  
  private format(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.context}]`;
    const eventPrefix = this.eventId ? ` [Event: ${this.eventId}]` : '';
    
    console.log(`${prefix}${eventPrefix} ${message}`);
    if (data && CONFIG.LOG_LEVEL === 'debug') {
      console.log(JSON.stringify(data, null, 2));
    }
  }
  
  debug(message: string, data?: any): void {
    if (CONFIG.LOG_LEVEL === 'debug') {
      this.format('DEBUG', message, data);
    }
  }
  
  info(message: string, data?: any): void {
    this.format('INFO', message, data);
  }
  
  warn(message: string, data?: any): void {
    this.format('WARN', message, data);
  }
  
  error(message: string, error?: any): void {
    this.format('ERROR', message, error);
    if (error?.stack) {
      console.error(error.stack);
    }
  }
  
  divider(): void {
    console.log("=".repeat(60));
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert Decimal type to number for calculations
 */
function decimalToNumber(value: Decimal | number): number {
  if (typeof value === 'number') return value;
  return parseFloat(value.toString());
}

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
 * Sleep for specified milliseconds (for retries)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if processing time is approaching timeout
 */
function isApproachingTimeout(startTime: number): boolean {
  return Date.now() - startTime > CONFIG.MAX_PROCESSING_TIME;
}

// ============================================================================
// STEP 1: VALIDATE WEBHOOK AND EXTRACT ORDER DATA
// ============================================================================

async function validateAndExtractOrder(
  request: ActionFunctionArgs['request'],
  logger: WebhookLogger
): Promise<{ shop: string; order: OrderWebhookPayload; admin: any } | null> {
  try {
    logger.info("Authenticating webhook request");
    
    // This automatically verifies HMAC signature
    const { shop, payload, admin } = await authenticate.webhook(request);
    
    const order = payload as OrderWebhookPayload;
    
    logger.info("Webhook authenticated successfully", {
      shop,
      orderId: order.id,
      financialStatus: order.financial_status
    });
    
    return { shop, order, admin };
  } catch (error) {
    logger.error("Webhook authentication failed", error);
    return null;
  }
}

// ============================================================================
// STEP 2: CHECK FOR DUPLICATE PROCESSING (IDEMPOTENCY)
// ============================================================================

async function checkDuplicateProcessing(
  shop: string,
  orderId: string,
  logger: WebhookLogger
): Promise<boolean> {
  try {
    const existingEntry = await db.storeCreditLedger.findFirst({
      where: {
        shop,
        shopifyOrderId: orderId,
        type: "CASHBACK_EARNED"
      }
    });
    
    if (existingEntry) {
      logger.info("Order already processed - skipping duplicate", {
        orderId,
        previousProcessedAt: existingEntry.createdAt
      });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error("Error checking for duplicate processing", error);
    // In case of error, we proceed (better to potentially duplicate than miss)
    return false;
  }
}

// ============================================================================
// STEP 3: FETCH OR CREATE CUSTOMER RECORD
// ============================================================================

async function ensureCustomerRecord(
  context: ProcessingContext,
  logger: WebhookLogger
): Promise<any> {
  const { shop, customerId, customerEmail } = context;
  
  try {
    // Check if customer exists
    let customer = await db.customer.findUnique({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId: customerId
        }
      }
    });
    
    if (!customer) {
      logger.info("Creating new customer record", {
        shopifyCustomerId: customerId,
        email: customerEmail
      });
      
      // Create new customer
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
      
      // Assign default tier
      const defaultTier = await db.tier.findFirst({
        where: {
          shop,
          minSpend: 0
        },
        orderBy: {
          minSpend: 'asc'
        }
      });
      
      if (defaultTier) {
        await db.customer.update({
          where: { id: customer.id },
          data: { currentTierId: defaultTier.id }
        });
        
        // Log initial tier assignment
        await db.tierChangeLog.create({
          data: {
            id: uuidv4(),
            customerId: customer.id,
            shop,
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
        
        customer.currentTierId = defaultTier.id;
        logger.info(`Assigned default tier: ${defaultTier.name}`);
      }
    }
    
    return customer;
  } catch (error) {
    logger.error("Error ensuring customer record", error);
    throw error;
  }
}

// ============================================================================
// STEP 4: FETCH SHOP SETTINGS FOR CURRENCY
// ============================================================================

async function fetchShopSettings(
  shop: string,
  logger: WebhookLogger
): Promise<any> {
  try {
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop }
    });
    
    if (!shopSettings) {
      logger.warn("Shop settings not found, using defaults", { shop });
      return {
        storeCurrency: CONFIG.DEFAULT_CURRENCY,
        currencyDisplayType: 'SYMBOL'
      };
    }
    
    logger.debug("Shop settings loaded", {
      currency: shopSettings.storeCurrency,
      displayType: shopSettings.currencyDisplayType
    });
    
    return shopSettings;
  } catch (error) {
    logger.error("Error fetching shop settings", error);
    return {
      storeCurrency: CONFIG.DEFAULT_CURRENCY,
      currencyDisplayType: 'SYMBOL'
    };
  }
}

// ============================================================================
// STEP 5: FETCH AND ANALYZE ORDER TRANSACTIONS
// ============================================================================

async function fetchOrderTransactions(
  admin: any,
  orderId: string,
  logger: WebhookLogger
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
    logger.debug("Fetching order transactions", { gid });
    
    const response = await admin.graphql(query, {
      variables: { id: gid }
    });
    
    const result = await response.json();
    
    if (result.errors || !result.data?.order) {
      logger.error("Failed to fetch order details", result.errors);
      return null;
    }
    
    logger.debug("Order transactions fetched", {
      transactionCount: result.data.order.transactions.length
    });
    
    return result.data.order;
  } catch (error) {
    logger.error("GraphQL query failed", error);
    return null;
  }
}

function analyzeTransactions(
  transactions: Transaction[],
  logger: WebhookLogger
): PaymentBreakdown {
  let giftCardAmount = 0;
  let storeCreditAmount = 0;
  let externalPaymentAmount = 0;
  
  // Only process successful SALE or CAPTURE transactions
  const validTransactions = transactions.filter(tx => {
    const isSuccessful = tx.status === 'SUCCESS';
    const isPayment = ['SALE', 'CAPTURE'].includes(tx.kind);
    return isSuccessful && isPayment;
  });
  
  logger.debug(`Analyzing ${validTransactions.length} valid transactions`);
  
  // Deduplicate CAPTURE/AUTHORIZATION pairs
  const processedIds = new Set<string>();
  
  validTransactions.forEach(tx => {
    // Skip if already processed
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
      logger.debug(`  Gift card payment: ${amount} (excluded from cashback)`);
    } else if (gateway.includes('store_credit')) {
      storeCreditAmount += amount;
      logger.debug(`  Store credit payment: ${amount} (excluded from cashback)`);
    } else {
      externalPaymentAmount += amount;
      logger.debug(`  External payment (${tx.gateway}): ${amount} (eligible for cashback)`);
    }
  });
  
  const breakdown = {
    giftCardAmount,
    storeCreditAmount,
    externalPaymentAmount,
    cashbackEligibleAmount: externalPaymentAmount
  };
  
  logger.info("Payment breakdown complete", breakdown);
  
  return breakdown;
}

// ============================================================================
// STEP 6: CALCULATE CASHBACK BASED ON TIER
// ============================================================================

async function calculateCashback(
  customer: any,
  eligibleAmount: number,
  shop: string,
  logger: WebhookLogger
): Promise<CashbackResult> {
  try {
    // Get customer's current tier
    let tier = null;
    if (customer.currentTierId) {
      tier = await db.tier.findUnique({
        where: { id: customer.currentTierId }
      });
    }
    
    // If no tier, try to find default tier
    if (!tier) {
      tier = await db.tier.findFirst({
        where: {
          shop,
          minSpend: 0
        },
        orderBy: {
          minSpend: 'asc'
        }
      });
      
      if (tier) {
        logger.info("Using default tier for cashback calculation", {
          tierName: tier.name
        });
      }
    }
    
    const cashbackPercent = tier?.cashbackPercent || CONFIG.DEFAULT_CASHBACK_PERCENT;
    const rawAmount = eligibleAmount * (cashbackPercent / 100);
    const cashbackAmount = roundDownToHundredths(rawAmount);
    
    const result: CashbackResult = {
      amount: cashbackAmount,
      percentage: cashbackPercent,
      tierName: tier?.name || null,
      tierId: tier?.id || null
    };
    
    logger.info("Cashback calculated", result);
    
    return result;
  } catch (error) {
    logger.error("Error calculating cashback", error);
    
    // Fallback to default calculation
    const cashbackPercent = CONFIG.DEFAULT_CASHBACK_PERCENT;
    const rawAmount = eligibleAmount * (cashbackPercent / 100);
    const cashbackAmount = roundDownToHundredths(rawAmount);
    
    return {
      amount: cashbackAmount,
      percentage: cashbackPercent,
      tierName: null,
      tierId: null
    };
  }
}

// ============================================================================
// STEP 7: ISSUE STORE CREDIT VIA SHOPIFY API
// ============================================================================

async function issueStoreCredit(
  admin: any,
  customerId: string,
  amount: number,
  currency: string,
  logger: WebhookLogger
): Promise<StoreCreditResult> {
  if (!CONFIG.ENABLE_SHOPIFY_STORE_CREDIT) {
    logger.info("Store credit sync is disabled");
    return { success: false, error: "Store credit sync disabled" };
  }
  
  const formattedAmount = formatForShopify(amount);
  const gid = `gid://shopify/Customer/${customerId}`;
  
  logger.info("Issuing store credit", {
    customerId: gid,
    amount: formattedAmount,
    currency
  });
  
  const mutation = `#graphql
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
    }
  `;
  
  let retries = 0;
  while (retries < CONFIG.MAX_RETRIES) {
    try {
      const response = await admin.graphql(mutation, {
        variables: {
          id: gid,
          creditInput: {
            creditAmount: {
              amount: formattedAmount,
              currencyCode: currency
            }
          }
        }
      });
      
      const result = await response.json();
      
      // Check for GraphQL errors
      if (result.errors) {
        logger.error("GraphQL errors in store credit mutation", result.errors);
        return { success: false, error: JSON.stringify(result.errors) };
      }
      
      // Check for user errors
      if (result.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
        const errors = result.data.storeCreditAccountCredit.userErrors;
        const errorMessages = errors.map((e: any) => `${e.field}: ${e.message}`).join(', ');
        logger.error("Store credit user errors", errors);
        return { success: false, error: errorMessages };
      }
      
      // Check for successful transaction
      const transaction = result.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;
      if (transaction) {
        logger.info("Store credit issued successfully", {
          transactionId: transaction.id,
          amount: transaction.amount.amount,
          newBalance: transaction.balanceAfterTransaction.amount
        });
        
        return {
          success: true,
          transactionId: transaction.id,
          newBalance: parseFloat(transaction.balanceAfterTransaction.amount)
        };
      }
      
      logger.error("No transaction returned from store credit mutation");
      return { success: false, error: "No transaction returned" };
      
    } catch (error) {
      retries++;
      logger.warn(`Store credit attempt ${retries} failed`, error);
      
      if (retries < CONFIG.MAX_RETRIES) {
        await sleep(CONFIG.RETRY_DELAY * retries);
      } else {
        logger.error("Store credit mutation failed after retries", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }
  }
  
  return { success: false, error: "Max retries exceeded" };
}

// ============================================================================
// STEP 8: RECORD TRANSACTION IN DATABASE
// ============================================================================

async function recordCashbackTransaction(
  context: ProcessingContext,
  customer: any,
  cashback: CashbackResult,
  eligibleAmount: number,
  shopifyTransactionId?: string,
  logger?: WebhookLogger
): Promise<{ success: boolean; error?: string }> {
  const {
    shop,
    orderId,
    orderCurrency,
    storeCurrency,
    customerEmail,
    order
  } = context;
  
  try {
    // Get current balance for running total
    const lastEntry = await db.storeCreditLedger.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' }
    });
    
    const previousBalance = lastEntry ? decimalToNumber(lastEntry.balance) : 0;
    const newBalance = previousBalance + cashback.amount;
    
    // Use transaction for atomicity
    await db.$transaction(async (tx) => {
      // Create ledger entry
      await tx.storeCreditLedger.create({
        data: {
          id: uuidv4(),
          customerId: customer.id,
          shop,
          amount: cashback.amount,
          balance: newBalance,
          type: "CASHBACK_EARNED",
          shopifyOrderId: orderId,
          metadata: {
            orderId,
            orderAmount: eligibleAmount,
            cashbackPercent: cashback.percentage,
            tierName: cashback.tierName,
            tierId: cashback.tierId,
            orderCurrency,
            storeCurrency,
            customerEmail,
            orderDate: order.created_at,
            shopifyTransactionId: shopifyTransactionId || null,
            shopifySyncStatus: shopifyTransactionId ? "SUCCESS" : "PENDING",
            shopifySyncedAt: shopifyTransactionId ? new Date().toISOString() : null
          },
          createdAt: new Date()
        }
      });
      
      // Update customer balance
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          storeCredit: newBalance,
          updatedAt: new Date()
        }
      });
    });
    
    logger?.info("Transaction recorded in database", {
      previousBalance,
      newBalance,
      cashbackAmount: cashback.amount
    });
    
    return { success: true };
  } catch (error) {
    logger?.error("Failed to record transaction", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Database error"
    };
  }
}

// ============================================================================
// STEP 9: EVALUATE TIER UPGRADE
// ============================================================================

async function evaluateTierUpgrade(
  context: ProcessingContext,
  customer: any,
  eligibleAmount: number,
  logger: WebhookLogger
): Promise<void> {
  try {
    if (!context.admin) {
      logger.debug("Admin context not available for tier evaluation");
      return;
    }
    
    const tierResult = await calculateTierAfterOrder(
      context.shop,
      customer.shopifyCustomerId,
      eligibleAmount,
      context.admin
    );
    
    if (tierResult?.changed) {
      logger.info("Customer tier upgraded", {
        from: tierResult.previousTierName || 'None',
        to: tierResult.newTierName || 'None',
        totalSpending: tierResult.totalSpending
      });
    } else {
      logger.debug("No tier change required");
    }
  } catch (error) {
    logger.error("Error evaluating tier upgrade", error);
    // Non-critical error, continue processing
  }
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const startTime = Date.now();
  const eventId = request.headers.get('X-Shopify-Event-Id') || uuidv4();
  const logger = new WebhookLogger('OrdersPaidWebhook', eventId);
  
  logger.divider();
  logger.info("ORDERS/PAID WEBHOOK PROCESSING STARTED");
  logger.divider();
  
  try {
    // Step 1: Validate webhook and extract order
    const authResult = await validateAndExtractOrder(request, logger);
    if (!authResult) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    const { shop, order, admin } = authResult;
    const orderId = order.id?.toString();
    const customerId = order.customer?.id?.toString();
    const customerEmail = order.customer?.email || "";
    const orderCurrency = order.currency || CONFIG.DEFAULT_CURRENCY;
    
    // Log order information
    logger.info("Order information", {
      orderId,
      customerId,
      customerEmail,
      totalPrice: order.total_price,
      currency: orderCurrency,
      financialStatus: order.financial_status
    });
    
    // Validation checks
    if (!customerId) {
      logger.info("Skipping guest checkout (no customer ID)");
      return new Response("OK", { status: 200 });
    }
    
    if (order.financial_status === 'voided' || order.cancelled_at) {
      logger.info("Skipping cancelled or voided order");
      return new Response("OK", { status: 200 });
    }
    
    // Step 2: Check for duplicate processing
    const isDuplicate = await checkDuplicateProcessing(shop, orderId, logger);
    if (isDuplicate) {
      return new Response("OK", { status: 200 });
    }
    
    // Check timeout
    if (isApproachingTimeout(startTime)) {
      logger.warn("Approaching timeout, expediting processing");
    }
    
    // Step 3: Fetch shop settings
    const shopSettings = await fetchShopSettings(shop, logger);
    const storeCurrency = shopSettings.storeCurrency || CONFIG.DEFAULT_CURRENCY;
    
    // Create processing context
    const context: ProcessingContext = {
      shop,
      order,
      orderId,
      customerId,
      customerEmail,
      orderCurrency,
      storeCurrency,
      shopSettings,
      admin,
      startTime
    };
    
    // Step 4: Ensure customer record exists
    const customer = await ensureCustomerRecord(context, logger);
    
    // Step 5: Fetch and analyze transactions
    let cashbackEligibleAmount = parseFloat(order.total_price || "0");
    
    if (admin && !isApproachingTimeout(startTime)) {
      logger.info("Fetching order transactions for payment analysis");
      const orderDetails = await fetchOrderTransactions(admin, orderId, logger);
      
      if (orderDetails && orderDetails.transactions.length > 0) {
        const breakdown = analyzeTransactions(orderDetails.transactions, logger);
        cashbackEligibleAmount = breakdown.cashbackEligibleAmount;
        
        logger.info("Payment breakdown", {
          giftCards: roundDownToHundredths(breakdown.giftCardAmount),
          storeCredit: roundDownToHundredths(breakdown.storeCreditAmount),
          externalPayments: roundDownToHundredths(breakdown.externalPaymentAmount),
          eligible: roundDownToHundredths(breakdown.cashbackEligibleAmount)
        });
      } else {
        logger.warn("Could not fetch transactions, using total price as eligible amount");
      }
    } else {
      logger.warn("Skipping transaction analysis (timeout or no admin context)");
    }
    
    // Skip if no eligible amount
    if (cashbackEligibleAmount <= 0) {
      logger.info("No cashback eligible amount, skipping");
      return new Response("OK", { status: 200 });
    }
    
    // Step 6: Calculate cashback
    const cashback = await calculateCashback(
      customer,
      cashbackEligibleAmount,
      shop,
      logger
    );
    
    if (cashback.amount <= 0) {
      logger.info("No cashback to award (amount is 0)");
      return new Response("OK", { status: 200 });
    }
    
    // Step 7: Issue store credit to Shopify
    let shopifyTransactionId: string | undefined;
    
    if (admin && !isApproachingTimeout(startTime)) {
      const creditResult = await issueStoreCredit(
        admin,
        customerId,
        cashback.amount,
        storeCurrency,
        logger
      );
      
      if (creditResult.success) {
        shopifyTransactionId = creditResult.transactionId;
      } else {
        logger.warn("Store credit issuance failed, continuing with database recording", {
          error: creditResult.error
        });
      }
    } else {
      logger.warn("Skipping store credit issuance (timeout or no admin context)");
    }
    
    // Step 8: Record transaction in database
    const recordResult = await recordCashbackTransaction(
      context,
      customer,
      cashback,
      cashbackEligibleAmount,
      shopifyTransactionId,
      logger
    );
    
    if (!recordResult.success) {
      logger.error("Failed to record transaction in database", {
        error: recordResult.error
      });
      // Continue anyway - better to have issued credit than to fail completely
    }
    
    // Step 9: Evaluate tier upgrade (non-critical)
    if (!isApproachingTimeout(startTime)) {
      await evaluateTierUpgrade(context, customer, cashbackEligibleAmount, logger);
    }
    
    // Log processing time
    const processingTime = Date.now() - startTime;
    logger.info("Webhook processing completed", {
      processingTimeMs: processingTime,
      success: true,
      storeCreditIssued: !!shopifyTransactionId,
      cashbackAmount: cashback.amount,
      currency: storeCurrency
    });
    
    logger.divider();
    
    return new Response("OK", { status: 200 });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error("Webhook processing failed", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      processingTimeMs: processingTime
    });
    
    logger.divider();
    
    // Always return 200 to prevent Shopify retries
    // We have idempotency checks in place
    return new Response("ERROR", { status: 200 });
  }
};

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

// Export functions for unit testing if needed
export const _testing = {
  decimalToNumber,
  roundDownToHundredths,
  formatForShopify,
  analyzeTransactions,
  WebhookLogger
};