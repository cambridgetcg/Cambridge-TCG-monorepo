import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import type { Decimal } from "@prisma/client/runtime/library";
import { calculateTierAfterOrder } from "../services/tier-calculation.server";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

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

interface CashbackCalculation {
  amount: number;
  percentage: number;
  tierName: string | null;
  tierId: string | null;
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
 * Calculate cashback based on customer's current tier
 */
async function calculateCashback(
  customer: any,
  orderAmount: number,
  shop: string
): Promise<CashbackCalculation> {
  // If customer has no tier, check for default tier
  if (!customer.currentTierId) {
    const defaultTier = await db.tier.findFirst({
      where: {
        shop,
        minSpend: 0 // Default tier with no minimum spend
      },
      orderBy: {
        minSpend: 'asc'
      }
    });

    if (!defaultTier) {
      return {
        amount: 0,
        percentage: 0,
        tierName: null,
        tierId: null
      };
    }

    // Assign default tier to customer
    await db.customer.update({
      where: { id: customer.id },
      data: { currentTierId: defaultTier.id }
    });

    // Log initial tier assignment
    await db.tierChangeLog.create({
      data: {
        customerId: customer.id,
        shop,
        fromTierId: null,
        fromTierName: null,
        toTierId: defaultTier.id,
        toTierName: defaultTier.name,
        changeType: "INITIAL_ASSIGNMENT",
        triggerType: "ACCOUNT_CREATED",
        processedBy: "system",
        metadata: {
          reason: "First purchase - default tier assigned"
        }
      }
    });

    const cashbackPercent = defaultTier.cashbackPercent;
    const cashbackAmount = (orderAmount * cashbackPercent) / 100;

    return {
      amount: Math.floor(cashbackAmount * 100) / 100, // Round down to 2 decimals
      percentage: cashbackPercent,
      tierName: defaultTier.name,
      tierId: defaultTier.id
    };
  }

  // Get customer's current tier
  const currentTier = await db.tier.findUnique({
    where: { id: customer.currentTierId }
  });

  if (!currentTier) {
    console.error(`Tier not found for customer ${customer.id}`);
    return {
      amount: 0,
      percentage: 0,
      tierName: null,
      tierId: null
    };
  }

  const cashbackPercent = currentTier.cashbackPercent;
  const cashbackAmount = (orderAmount * cashbackPercent) / 100;

  return {
    amount: Math.floor(cashbackAmount * 100) / 100, // Round down to 2 decimals
    percentage: cashbackPercent,
    tierName: currentTier.name,
    tierId: currentTier.id
  };
}

// NOTE: These functions are replaced by services/tier-calculation.server.ts
// Kept for reference only - DO NOT USE

/*
 * DEPRECATED: Calculate customer's total spending for tier evaluation
 * Now handled by services/tier-calculation.server.ts
 */
/*
async function calculateCustomerSpending(
  customerId: string,
  shop: string,
  evaluationPeriod: "ANNUAL" | "LIFETIME"
): Promise<number> {
  const now = new Date();
  const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1));

  const whereClause: any = {
    customerId,
    shop,
    type: "CASHBACK_EARNED" // Only count cashback-earning transactions
  };

  if (evaluationPeriod === "ANNUAL") {
    whereClause.createdAt = {
      gte: oneYearAgo
    };
  }

  const result = await db.storeCreditLedger.aggregate({
    where: whereClause,
    _sum: {
      amount: true
    }
  });

  // Calculate from cashback amounts (reverse engineer spending)
  // If they earned X in cashback at Y%, spending was X * 100 / Y
  const ledgerEntries = await db.storeCreditLedger.findMany({
    where: whereClause,
    select: {
      amount: true,
      metadata: true
    }
  });

  let totalSpending = 0;
  for (const entry of ledgerEntries) {
    const metadata = entry.metadata as any;
    if (metadata?.orderAmount) {
      totalSpending += metadata.orderAmount;
    }
  }

  return totalSpending;
}
*/

/*
 * DEPRECATED: Evaluate if customer should be upgraded to a higher tier
 * Now handled by services/tier-calculation.server.ts
 */
/*
async function evaluateTierUpgrade(
  customer: any,
  shop: string
): Promise<void> {
  // Get all active tiers for the shop
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'desc' }
  });

  if (tiers.length === 0) return;

  // Get the customer's current tier details BEFORE any changes
  let currentTier = null;
  let currentTierName = null;
  if (customer.currentTierId) {
    currentTier = await db.tier.findUnique({
      where: { id: customer.currentTierId }
    });
    currentTierName = currentTier?.name || null;
  }

  // Determine evaluation period from current tier or use default
  let evaluationPeriod: "ANNUAL" | "LIFETIME" = "ANNUAL";
  if (currentTier) {
    evaluationPeriod = currentTier.evaluationPeriod;
  }

  // Calculate customer's spending
  const totalSpending = await calculateCustomerSpending(
    customer.id,
    shop,
    evaluationPeriod
  );

  // Find the highest tier the customer qualifies for
  const eligibleTier = tiers.find(tier => totalSpending >= tier.minSpend);

  if (!eligibleTier || eligibleTier.id === customer.currentTierId) {
    // No change needed
    return;
  }

  // Determine if this is an upgrade or downgrade
  const changeType = !currentTier || eligibleTier.minSpend > (currentTier?.minSpend || 0)
    ? "UPGRADE"
    : "DOWNGRADE";

  // Log the tier change BEFORE updating the customer
  await db.tierChangeLog.create({
    data: {
      customerId: customer.id,
      shop,
      fromTierId: customer.currentTierId || null,  // Current tier (before change)
      fromTierName: currentTierName,                // Current tier name (before change)
      toTierId: eligibleTier.id,                    // New tier
      toTierName: eligibleTier.name,                // New tier name
      changeType,
      triggerType: "SPENDING_MILESTONE",
      totalSpending,
      periodSpending: evaluationPeriod === "ANNUAL" ? totalSpending : null,
      processedBy: "system",
      metadata: {
        evaluationPeriod,
        previousMinSpend: currentTier?.minSpend || 0,
        newMinSpend: eligibleTier.minSpend,
        reason: `Customer spending (${totalSpending}) qualifies for ${eligibleTier.name} tier`
      }
    }
  });

  // NOW update customer's tier
  await db.customer.update({
    where: { id: customer.id },
    data: { currentTierId: eligibleTier.id }
  });

  console.log(`[Tier Upgrade] Customer ${customer.id} moved from ${currentTierName || 'no tier'} to ${eligibleTier.name}`);
}
*/

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("\n" + "=".repeat(60));
  console.log("WEBHOOK: ORDERS/PAID");
  console.log("=".repeat(60));

  try {
    // Authenticate the webhook request
    const { topic, shop, payload, admin } = await authenticate.webhook(request);
    
    const order = payload as OrderWebhookPayload;
    
    console.log(`[Order Paid] Processing order ${order.id} from ${shop}`);
    console.log(`[Order Paid] Customer: ${order.customer?.email || 'Guest'}`);
    console.log(`[Order Paid] Total: ${order.total_price} ${order.currency}`);
    
    // Skip if no customer (guest checkout)
    if (!order.customer?.id) {
      console.log("[Order Paid] Skipping: Guest checkout");
      return new Response("OK", { status: 200 });
    }
    
    // Skip if order is cancelled or voided
    if (order.cancelled_at || order.financial_status === 'voided') {
      console.log("[Order Paid] Skipping: Order cancelled or voided");
      return new Response("OK", { status: 200 });
    }
    
    const shopifyCustomerId = order.customer.id.toString();
    const orderAmount = parseFloat(order.total_price);
    
    // ========================================================================
    // STEP 1: Find or create customer
    // ========================================================================
    
    let customer = await db.customer.findUnique({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId
        }
      }
    });
    
    if (!customer) {
      console.log("[Order Paid] Creating new customer record");
      customer = await db.customer.create({
        data: {
          shop,
          shopifyCustomerId,
          email: order.customer.email,
          storeCredit: 0
        }
      });
    }
    
    // ========================================================================
    // STEP 2: Check for duplicate order processing
    // ========================================================================
    
    const shopifyOrderId = order.id.toString();
    
    const existingEntry = await db.storeCreditLedger.findFirst({
      where: {
        shop,
        shopifyOrderId,
        type: "CASHBACK_EARNED"
      }
    });
    
    if (existingEntry) {
      console.log("[Order Paid] Order already processed, skipping");
      return new Response("OK", { status: 200 });
    }
    
    // ========================================================================
    // STEP 3: Calculate cashback based on tier
    // ========================================================================
    
    const cashback = await calculateCashback(customer, orderAmount, shop);
    
    console.log(`[Order Paid] Tier: ${cashback.tierName || 'None'}`);
    console.log(`[Order Paid] Cashback rate: ${cashback.percentage}%`);
    console.log(`[Order Paid] Cashback amount: ${cashback.amount}`);
    
    if (cashback.amount <= 0) {
      console.log("[Order Paid] No cashback to award");
      return new Response("OK", { status: 200 });
    }
    
    // ========================================================================
    // STEP 4: Record cashback in ledger
    // ========================================================================
    
    // Get current balance for running total
    const lastEntry = await db.storeCreditLedger.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' }
    });
    
    const previousBalance = lastEntry ? decimalToNumber(lastEntry.balance) : 0;
    const newBalance = previousBalance + cashback.amount;
    
    // Create ledger entry
    await db.storeCreditLedger.create({
      data: {
        customerId: customer.id,
        shop,
        amount: cashback.amount,
        balance: newBalance,
        type: "CASHBACK_EARNED",
        shopifyOrderId,
        metadata: {
          orderId: shopifyOrderId,
          orderAmount,
          cashbackPercent: cashback.percentage,
          tierName: cashback.tierName,
          tierId: cashback.tierId,
          currency: order.currency,
          customerEmail: order.customer.email,
          orderDate: order.created_at
        }
      }
    });
    
    // Update customer's store credit balance
    await db.customer.update({
      where: { id: customer.id },
      data: {
        storeCredit: newBalance,
        updatedAt: new Date()
      }
    });
    
    console.log(`[Order Paid] Store credit updated: ${previousBalance} → ${newBalance}`);
    
    // ========================================================================
    // STEP 5: Calculate and update tier based on new spending
    // ========================================================================
    
    // Use the new tier calculation service to check if tier needs updating
    const tierResult = await calculateTierAfterOrder(
      shop,
      customer.shopifyCustomerId,
      orderAmount,
      admin as any
    );
    
    if (tierResult?.changed) {
      console.log(`[Order Paid] Tier updated from ${tierResult.previousTierName || 'None'} to ${tierResult.newTierName || 'None'}`);
    }
    
    // ========================================================================
    // STEP 6: Issue Store Credit to Shopify
    // ========================================================================
    
    // Temporarily disable store credit sync to prevent crashes
    const ENABLE_SHOPIFY_STORE_CREDIT = false; // Set to true when currency issue is resolved
    
    if (admin && cashback.amount > 0 && ENABLE_SHOPIFY_STORE_CREDIT) {
      try {
        console.log(`[Order Paid] Issuing ${cashback.amount} store credit to Shopify...`);
        
        // Format amount to 2 decimal places as required by Shopify
        const formattedAmount = cashback.amount.toFixed(2);
        
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
              id: `gid://shopify/Customer/${shopifyCustomerId}`,
              creditInput: {
                creditAmount: {
                  amount: formattedAmount,
                  currencyCode: order.currency
                }
              }
            }
          }
        );
        
        const result = await response.json();
        
        // Check for errors
        if (result.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
          const errors = result.data.storeCreditAccountCredit.userErrors;
          console.error("[Order Paid] Store credit API errors:", errors);
          
          // Update ledger entry to note the sync failure
          await db.storeCreditLedger.updateMany({
            where: {
              customerId: customer.id,
              shopifyOrderId,
              type: "CASHBACK_EARNED"
            },
            data: {
              metadata: {
                ...(lastEntry?.metadata as object || {}),
                shopifySyncStatus: "FAILED",
                shopifySyncError: errors.map((e: any) => e.message).join(", "),
                shopifySyncAttemptedAt: new Date().toISOString()
              }
            }
          });
        } else if (result.data?.storeCreditAccountCredit?.storeCreditAccountTransaction) {
          // Success!
          const transaction = result.data.storeCreditAccountCredit.storeCreditAccountTransaction;
          console.log(`[Order Paid] ✅ Store credit issued to Shopify: ${transaction.id}`);
          console.log(`[Order Paid] New Shopify balance: ${transaction.balanceAfterTransaction.amount} ${transaction.balanceAfterTransaction.currencyCode}`);
          
          // Update ledger entry with Shopify transaction ID
          await db.storeCreditLedger.updateMany({
            where: {
              customerId: customer.id,
              shopifyOrderId,
              type: "CASHBACK_EARNED"
            },
            data: {
              metadata: {
                ...(lastEntry?.metadata as object || {}),
                shopifySyncStatus: "SUCCESS",
                shopifyTransactionId: transaction.id,
                shopifyBalance: transaction.balanceAfterTransaction.amount,
                shopifySyncedAt: new Date().toISOString()
              }
            }
          });
        }
      } catch (error) {
        console.error("[Order Paid] Failed to issue store credit to Shopify:", error);
        
        // Record the sync failure in metadata
        await db.storeCreditLedger.updateMany({
          where: {
            customerId: customer.id,
            shopifyOrderId,
            type: "CASHBACK_EARNED"
          },
          data: {
            metadata: {
              ...(lastEntry?.metadata as object || {}),
              shopifySyncStatus: "ERROR",
              shopifySyncError: error instanceof Error ? error.message : "Unknown error",
              shopifySyncAttemptedAt: new Date().toISOString()
            }
          }
        });
      }
    }
    
    console.log(`[Order Paid] Successfully processed order ${shopifyOrderId}`);
    console.log("=".repeat(60) + "\n");
    
    return new Response("OK", { status: 200 });
    
  } catch (error) {
    console.error("[Order Paid] Error processing webhook:", error);
    
    // Return 200 to prevent Shopify from retrying
    // Log the error for debugging but don't fail the webhook
    return new Response("OK", { status: 200 });
  }
};