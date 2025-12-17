import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

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
    
    // Fetch credit ledger history
    const creditHistory = await db.storeCreditLedger.findMany({
      where: {
        customerId: customer.id,
        shop: session.shop // CRITICAL: Always scope to shop
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20 // Limit to recent 20 entries
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
    
    // Fetch recent orders from Shopify using GraphQL
    let orders = [];
    try {
      const gidCustomerId = `gid://shopify/Customer/${customer.shopifyCustomerId}`;
      
      const ordersQuery = `#graphql
        query GetCustomerOrders($customerId: ID!) {
          customer(id: $customerId) {
            orders(first: 10, reverse: true) {
              edges {
                node {
                  id
                  name
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  totalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  lineItems(first: 5) {
                    edges {
                      node {
                        title
                        quantity
                        originalTotalSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      const response = await admin.graphql(ordersQuery, {
        variables: { customerId: gidCustomerId }
      });
      
      const responseJson = await response.json() as any;
      
      if (responseJson.data?.customer?.orders?.edges) {
        orders = responseJson.data.customer.orders.edges.map((edge: any) => ({
          id: edge.node.id,
          name: edge.node.name,
          createdAt: edge.node.createdAt,
          financialStatus: edge.node.displayFinancialStatus,
          fulfillmentStatus: edge.node.displayFulfillmentStatus,
          total: edge.node.totalPriceSet?.shopMoney,
          lineItems: edge.node.lineItems?.edges?.map((item: any) => ({
            title: item.node.title,
            quantity: item.node.quantity,
            total: item.node.originalTotalSet?.shopMoney
          })) || []
        }));
      }
    } catch (error) {
      console.error("Error fetching orders from Shopify:", error);
      // Continue without orders if GraphQL fails
    }
    
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
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType
      } : null
    });
    
  } catch (error) {
    console.error("Error fetching customer details:", error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    throw new Response("Failed to fetch customer details", { status: 500 });
  }
};