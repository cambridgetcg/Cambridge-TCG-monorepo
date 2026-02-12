import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  getCustomerOrderSummary,
  getCustomerDetailedOrders,
  getActivityStatusBadge,
} from "../services/customer-order-summary.server";
import { getPointsBalance, getTransactionHistory } from "../services/points-ledger.server";
import { getCurrencyBranding } from "../services/points-config.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }
  
  const customerId = params.id;
  
  if (!customerId) {
    throw new Response("Customer ID required", { status: 400 });
  }
  
  try {
    // Fetch customer details with shop scope for security
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        shop: session.shop // CRITICAL: Always scope to shop
      }
    });
    
    if (!customer) {
      throw new Response("Customer not found", { status: 404 });
    }
    
    // Fetch tier information if customer has one
    let tier = null;
    if (customer.currentTierId) {
      tier = await db.tier.findFirst({
        where: {
          id: customer.currentTierId,
          shop: session.shop // CRITICAL: Always scope to shop
        }
      });
    }

    // Fetch ALL tiers for this shop to determine next tier and progression
    const allTiers = await db.tier.findMany({
      where: { shop: session.shop },
      orderBy: { minSpend: 'asc' }
    });

    // Determine next tier and max tier status
    let nextTier = null;
    let isMaxTier = false;

    if (tier && allTiers.length > 0) {
      const currentTierIndex = allTiers.findIndex(t => t.id === tier!.id);
      if (currentTierIndex >= 0 && currentTierIndex < allTiers.length - 1) {
        // There's a next tier
        nextTier = allTiers[currentTierIndex + 1];
      } else if (currentTierIndex === allTiers.length - 1) {
        // Customer is at highest tier
        isMaxTier = true;
      }
    } else if (!tier && allTiers.length > 0) {
      // Customer has no tier, next tier is the first one
      nextTier = allTiers[0];
    }
    
    // Fetch credit ledger history
    // Uses composite index: (customerId, shop, createdAt DESC)
    const creditHistory = await db.storeCreditLedger.findMany({
      where: {
        customerId: customer.id,
        shop: session.shop // CRITICAL: Always scope to shop
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50 // Increased from 20 to avoid duplicate fetch in StoreCreditTab
    });
    
    // Fetch tier change logs
    const tierChangeLogs = await db.tierChangeLog.findMany({
      where: {
        customerId: customer.id,
        shop: session.shop // CRITICAL: Always scope to shop
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    // Fetch CustomerTierState for single source of truth on tier status
    const tierState = await db.customerTierState.findUnique({
      where: {
        customerId: customer.id
      }
    });
    
    // Fetch orders from local database (richer data: cashback, tier at order time, etc.)
    const { orders: localOrders, totalCount: ordersTotalCount } = await getCustomerDetailedOrders(
      session.shop,
      customer.id,
      { limit: 50, includeLineItems: true }
    );

    // Get order summary metrics
    const orderSummary = await getCustomerOrderSummary(session.shop, customer.id);

    // Fetch points data in parallel
    const [pointsBalance, pointsHistoryResult, currencyConfig] = await Promise.all([
      getPointsBalance(customer.id, session.shop),
      getTransactionHistory(customer.id, session.shop, { limit: 50 }),
      getCurrencyBranding(session.shop),
    ]);

    // Format orders with line items from local database
    const orders = await Promise.all(
      localOrders.map(async (order) => {
        // Get line items for this order
        const lineItems = await db.orderLineItem.findMany({
          where: { orderId: order.id },
          take: 10,
          orderBy: { createdAt: "asc" },
        });

        return {
          id: order.id,
          shopifyOrderId: order.shopifyOrderId,
          name: order.shopifyOrderName,
          createdAt: order.createdAt.toISOString(),
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus || "UNFULFILLED",
          total: {
            amount: order.totalPrice.toString(),
            currencyCode: order.currency,
          },
          netAmount: order.netAmount,
          totalRefunded: order.totalRefunded,
          cashbackAmount: order.cashbackAmount,
          cashbackPercent: order.cashbackPercent,
          tierNameAtOrder: order.tierNameAtOrder,
          lineItems: lineItems.map((item) => ({
            title: item.title,
            quantity: item.quantity,
            total: {
              amount: Number(item.totalPrice).toString(),
              currencyCode: order.currency,
            },
            isTierProduct: item.isTierProduct,
          })),
        };
      })
    );
    
    // Get shop settings for currency formatting
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop: session.shop }
    });
    
    return json({
      customer: {
        id: customer.id,
        email: customer.email,
        shopifyCustomerId: customer.shopifyCustomerId,
        storeCredit: customer.storeCredit.toString(),
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString()
      },
      tier: tier ? {
        id: tier.id,
        name: tier.name,
        cashbackPercent: tier.cashbackPercent,
        minSpend: tier.minSpend,
        evaluationPeriod: tier.evaluationPeriod
      } : null,
      creditHistory: creditHistory.map(entry => ({
        id: entry.id,
        amount: entry.amount.toString(),
        balance: entry.balance.toString(),
        type: entry.type,
        shopifyOrderId: entry.shopifyOrderId,
        metadata: entry.metadata,
        createdAt: entry.createdAt.toISOString()
      })),
      tierChangeLogs: tierChangeLogs.map(log => ({
        id: log.id,
        fromTierName: log.fromTierName,
        toTierName: log.toTierName,
        changeType: log.changeType,
        triggerType: log.triggerType,
        totalSpending: log.totalSpending?.toString(),
        periodSpending: log.periodSpending?.toString(),
        note: log.note,
        createdAt: log.createdAt.toISOString()
      })),
      // CustomerTierState - single source of truth for tier status
      tierState: tierState ? {
        tierSource: tierState.tierSource,
        hasManualOverride: tierState.hasManualOverride,
        manualOverrideAt: tierState.manualOverrideAt?.toISOString() || null,
        manualOverrideBy: tierState.manualOverrideBy,
        manualOverrideExpiry: tierState.manualOverrideExpiry?.toISOString() || null,
        manualOverrideNote: tierState.manualOverrideNote,
        activePurchaseId: tierState.activePurchaseId,
        purchaseExpiresAt: tierState.purchaseExpiresAt?.toISOString() || null,
        activeSubscriptionId: tierState.activeSubscriptionId,
        subscriptionExpiresAt: tierState.subscriptionExpiresAt?.toISOString() || null,
        spendingBasedTierId: tierState.spendingBasedTierId,
        lastResolvedAt: tierState.lastResolvedAt?.toISOString() || null,
        resolutionReason: tierState.resolutionReason,
      } : null,
      orders,
      ordersTotalCount,
      // Order summary metrics for customer management
      orderSummary: orderSummary ? {
        orderCount: orderSummary.orderCount,
        totalSpent: orderSummary.totalSpent,
        totalRefunded: orderSummary.totalRefunded,
        netSpent: orderSummary.netSpent,
        averageOrderValue: orderSummary.averageOrderValue,
        totalCashbackEarned: orderSummary.totalCashbackEarned,
        firstOrderDate: orderSummary.firstOrderDate?.toISOString() || null,
        lastOrderDate: orderSummary.lastOrderDate?.toISOString() || null,
        daysSinceLastOrder: orderSummary.daysSinceLastOrder,
        activityStatus: orderSummary.activityStatus,
        activityBadge: getActivityStatusBadge(orderSummary.activityStatus),
      } : null,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType
      } : null,
      // Tier progression data - fixes hardcoded threshold bug
      nextTier: nextTier ? {
        id: nextTier.id,
        name: nextTier.name,
        minSpend: nextTier.minSpend,
        cashbackPercent: nextTier.cashbackPercent
      } : null,
      allTiers: allTiers.map(t => ({
        id: t.id,
        name: t.name,
        minSpend: t.minSpend,
        cashbackPercent: t.cashbackPercent,
        isCurrentTier: tier?.id === t.id
      })),
      isMaxTier,
      // Points data
      pointsBalance: {
        available: pointsBalance.available,
        lifetime: pointsBalance.lifetime,
        expiringSoon: pointsBalance.expiringSoon,
      },
      pointsHistory: pointsHistoryResult.transactions.map(t => ({
        id: t.id,
        amount: t.amount,
        balance: t.balance,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        expiresAt: t.expiresAt instanceof Date ? t.expiresAt.toISOString() : t.expiresAt,
        metadata: t.metadata,
      })),
      currencyConfig,
    });
    
  } catch (error) {
    console.error("Error fetching customer details:", error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    throw new Response("Failed to fetch customer details", { status: 500 });
  }
};