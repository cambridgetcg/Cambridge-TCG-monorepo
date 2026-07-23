import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher, useSearchParams, useActionData } from "@remix-run/react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  TextField,
  Select,
  Button,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  Icon,
  Banner,
  Box,
  EmptyState,
  Modal,
  Spinner,
  Divider,
  SkeletonBodyText,
  Toast,
  DescriptionList,
  ProgressBar,
  useIndexResourceState,
} from "@shopify/polaris";
import { CreditAdjustmentForm } from "~/components/StoreCredit/CreditAdjustmentForm";
import {
  SearchIcon,
  RefreshIcon,
  CashDollarIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopSettings } from "../services/shop-data-provider.server";
import { formatCurrency, type ShopSettings } from "../utils/currency";
import type { Decimal } from "@prisma/client/runtime/library";
import { useToast } from "../hooks/useToast";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Order {
  id: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  shopifyOrderName: string;
  customerId?: string; // The customer ID field from the order
  customer: {
    id: string;
    email: string;
    shopifyCustomerId: string;
    storeCredit: Decimal;
    currentTier: {
      id: string;
      name: string;
      cashbackPercent: number;
    } | null;
  } | null;
  email: string;
  currency: string;
  totalPrice: Decimal;
  totalRefunded: Decimal;
  netAmount: Decimal;
  cashbackAmount: Decimal | null;
  cashbackProcessed: boolean;
  cashbackStatus?: 'PENDING' | 'PROCESSED' | null;  // Computed field
  cashbackPercent: number | null;
  financialStatus: string;
  fulfillmentStatus: string | null;
  tierNameAtOrder: string | null;
  shopifyCreatedAt: Date;
  createdAt: Date;
  creditLedgerEntries: Array<{
    id: string;
    amount: Decimal;
    type: string;
    createdAt: Date;
  }>;
  lineItems: Array<{
    id: string;
    title: string;
    quantity: number;
    price: Decimal;
    isTierProduct: boolean;
  }>;
  refunds: Array<{
    id: string;
    amount: Decimal;
    shopifyCreatedAt: Date;
    cashbackAdjustment: Decimal | null;
    cashbackProcessed: boolean;
  }>;
}

interface LoaderData {
  orders: Order[];
  stats: {
    totalOrders: number;
    totalCashback: number;
    pendingCashback: number;
    processedCashback: number;
    totalRefunded: number;
  };
  shopSettings: ShopSettings & {
    autoCashbackProcessingEnabled?: boolean;
  } | null;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Update customer spending totals from Order table (source of truth)
 * This ensures totalSpent, netSpent, totalRefunded are accurate
 * OPTIMIZED: Removed redundant findMany queries used only for logging,
 * consolidated to 2 parallel aggregations + 1 update
 */
async function updateCustomerSpendingTotals(customerId: string, shop: string) {
  console.log(`[Orders] Starting spending totals update for customer ${customerId}`);

  // Calculate annual spending (last 12 months) for tier calculations
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  // OPTIMIZED: Run both aggregations in parallel instead of sequentially
  const [orderStats, annualOrderStats] = await Promise.all([
    // All-time spending (PAID/PARTIALLY_REFUNDED)
    prisma.order.aggregate({
      where: {
        shop,
        customerId,
        financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }
      },
      _sum: {
        totalPrice: true,
        totalRefunded: true,
        cashbackAmount: true
      },
      _count: {
        id: true
      },
      _max: {
        shopifyCreatedAt: true
      }
    }),
    // Annual spending (last 12 months)
    prisma.order.aggregate({
      where: {
        shop,
        customerId,
        shopifyCreatedAt: { gte: twelveMonthsAgo },
        financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }
      },
      _sum: {
        totalPrice: true,
        totalRefunded: true
      }
    })
  ]);

  const totalSpent = orderStats._sum.totalPrice || 0;
  const totalRefunded = orderStats._sum.totalRefunded || 0;
  const netSpent = totalSpent - totalRefunded;
  const annualSpent = (annualOrderStats._sum.totalPrice || 0) - (annualOrderStats._sum.totalRefunded || 0);

  console.log(`[Orders] Aggregation results - orders: ${orderStats._count.id}, totalSpent: ${totalSpent}, annualSpent: ${annualSpent}`);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      totalSpent,
      annualSpent,
      totalRefunded,
      // Note: totalCashbackEarned is NOT updated here - it's updated when cashback is processed
      netSpent,
      orderCount: orderStats._count.id || 0,
      lastOrderDate: orderStats._max.shopifyCreatedAt || null,
      updatedAt: new Date()
    }
  });

  console.log(`[Orders] ✅ Updated customer ${customerId}: totalSpent=${totalSpent}, annualSpent=${annualSpent}, netSpent=${netSpent}, orders=${orderStats._count.id}`);
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    console.log('[Orders Loader] ========== START ==========');
    const { session } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const url = new URL(request.url);
    console.log('[Orders Loader] Shop:', shop);
    console.log('[Orders Loader] URL:', url.toString());

    // Parse query parameters
    const searchQuery = url.searchParams.get("search") || "";
    const statusFilter = url.searchParams.get("status") || "all";
    const cashbackFilter = url.searchParams.get("cashback") || "all";
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "25");

    console.log('[Orders Loader] Query Parameters:', {
      searchQuery,
      statusFilter,
      cashbackFilter,
      page,
      pageSize
    });

    // Build where clause - handle search separately to avoid OR issues with Data API
    let whereClause: any = { shop };
    console.log('[Orders Loader] Initial where clause:', whereClause);

    // Add status filter
    if (statusFilter !== "all") {
      whereClause.financialStatus = statusFilter;
      console.log('[Orders Loader] Applied status filter:', statusFilter);
    }

    // Add cashback filter
    // Note: cashbackAmount > 0 ensures we only show orders that actually have cashback
    // (not orders where cashbackAmount = 0 or null which display as "no cashback")
    if (cashbackFilter === "processed") {
      whereClause.cashbackProcessed = true;
      whereClause.cashbackAmount = { gt: 0 };  // Must have positive cashback amount
      console.log('[Orders Loader] Applied cashback filter: processed');
    } else if (cashbackFilter === "pending") {
      whereClause.cashbackProcessed = false;
      whereClause.cashbackAmount = { gt: 0 };  // Must have positive cashback amount
      console.log('[Orders Loader] Applied cashback filter: pending');
    } else if (cashbackFilter === "excluded") {
      whereClause.cashbackEligible = false;
      console.log('[Orders Loader] Applied cashback filter: excluded');
    }

    console.log('[Orders Loader] Final where clause:', JSON.stringify(whereClause, null, 2));

    // If there's a search query, fetch all orders and filter in memory
    // This is a workaround for Data API limitations with OR queries
    let ordersQuery;
    if (searchQuery) {
      console.log('[Orders Loader] Using search query, fetching all orders first...');
      // DATA API COMPATIBLE: Nested include not supported, use two-step query
      // Fetch all orders for the shop first, then filter
      const allOrders = await prisma.order.findMany({
        where: whereClause,
        include: {
          customer: true, // Flat include, no nested currentTier
          creditLedgerEntries: {
            orderBy: { createdAt: 'desc' },
          },
          lineItems: {
            take: 5,
          },
          refunds: true,
        },
        orderBy: { shopifyCreatedAt: 'desc' },
      });

      console.log('[Orders Loader] Fetched all orders for filtering:', allOrders.length);

      // Filter in memory (order number and email only)
      const searchLower = searchQuery.toLowerCase();
      const filteredOrders = allOrders.filter(order =>
        order.shopifyOrderNumber?.toLowerCase().includes(searchLower) ||
        order.email?.toLowerCase().includes(searchLower)
      );

      console.log('[Orders Loader] Filtered orders by search:', filteredOrders.length);

      // Apply pagination
      ordersQuery = filteredOrders.slice((page - 1) * pageSize, page * pageSize);
      var filteredTotalCount = filteredOrders.length;
      console.log('[Orders Loader] Paginated orders:', ordersQuery.length);
    } else {
      console.log('[Orders Loader] No search query, using direct pagination...');
      // DATA API COMPATIBLE: Nested include not supported, use two-step query
      // No search, use normal pagination
      ordersQuery = await prisma.order.findMany({
        where: whereClause,
        include: {
          customer: true, // Flat include, no nested currentTier
          creditLedgerEntries: {
            orderBy: { createdAt: 'desc' },
          },
          lineItems: {
            take: 5,
          },
          refunds: true,
        },
        orderBy: { shopifyCreatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      console.log('[Orders Loader] Direct query returned orders:', ordersQuery.length);

      var filteredTotalCount = await prisma.order.count({ where: whereClause });
      console.log('[Orders Loader] Total count from database:', filteredTotalCount);
    }

    // DATA API COMPATIBLE: Fetch tiers separately and join in memory
    // Collect unique tier IDs from customers
    const tierIds = [...new Set(
      ordersQuery
        .map((o: any) => o.customer?.currentTierId)
        .filter((id: string | null | undefined): id is string => !!id)
    )];
    const tiers = tierIds.length > 0
      ? await prisma.tier.findMany({
          where: { id: { in: tierIds } },
          select: { id: true, name: true, cashbackPercent: true },
        })
      : [];
    const tierMap = new Map(tiers.map(t => [t.id, t]));

    // Attach currentTier to each order's customer
    ordersQuery = ordersQuery.map((order: any) => ({
      ...order,
      customer: order.customer ? {
        ...order.customer,
        currentTier: order.customer.currentTierId
          ? tierMap.get(order.customer.currentTierId) || null
          : null,
      } : null,
    }));

    console.log('[Orders Loader] Fetching shop settings...');
    // Fetch shop settings (CACHED via shop-data-provider)
    const [orders, totalCount, shopSettings] = await Promise.all([
      Promise.resolve(ordersQuery),
      Promise.resolve(filteredTotalCount),
      getShopSettings(shop), // CACHED
    ]);

    console.log('[Orders Loader] Promise.all resolved:');
    console.log('[Orders Loader] - orders.length:', orders.length);
    console.log('[Orders Loader] - totalCount:', totalCount);
    console.log('[Orders Loader] - shopSettings:', shopSettings ? 'found' : 'null');

    // OPTIMIZED: Calculate stats using aggregation instead of fetching all orders
    console.log('[Orders Loader] Calculating stats using aggregation...');
    const [orderCount, totalCashbackAgg, pendingCashbackAgg, processedCashbackAgg, totalRefundedAgg] = await Promise.all([
      prisma.order.count({ where: { shop } }),
      prisma.order.aggregate({
        where: { shop },
        _sum: { cashbackAmount: true }
      }),
      prisma.order.aggregate({
        where: { shop, cashbackProcessed: false, cashbackAmount: { not: null } },
        _sum: { cashbackAmount: true }
      }),
      prisma.order.aggregate({
        where: { shop, cashbackProcessed: true, cashbackAmount: { not: null } },
        _sum: { cashbackAmount: true }
      }),
      prisma.order.aggregate({
        where: { shop },
        _sum: { totalRefunded: true }
      }),
    ]);

    const stats = {
      totalOrders: orderCount,
      totalCashback: Number(totalCashbackAgg._sum.cashbackAmount || 0),
      pendingCashback: Number(pendingCashbackAgg._sum.cashbackAmount || 0),
      processedCashback: Number(processedCashbackAgg._sum.cashbackAmount || 0),
      totalRefunded: Number(totalRefundedAgg._sum.totalRefunded || 0),
    };

    console.log('[Orders Loader] Stats calculated:', stats);

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / pageSize);

    console.log('[Orders Loader] FINAL RESULTS:');
    console.log('[Orders Loader] - Orders to display:', orders.length);
    console.log('[Orders Loader] - Total count:', totalCount);
    console.log('[Orders Loader] - Total pages:', totalPages);
    console.log('[Orders Loader] - Current page:', page);
    console.log('[Orders Loader] - Page size:', pageSize);
    console.log('[Orders Loader] - Search query:', searchQuery);
    console.log('[Orders Loader] - Status filter:', statusFilter);
    console.log('[Orders Loader] - Cashback filter:', cashbackFilter);

    // Serialize orders to ensure Decimal values are converted to numbers
    const serializedOrders = orders.map(order => {
      const cashbackAmountNumber = order.cashbackAmount ? Number(order.cashbackAmount) : null;
      return {
        ...order,
        customerId: order.customerId, // Include the customerId field
        cashbackAmount: cashbackAmountNumber,
        totalAmount: order.totalAmount ? Number(order.totalAmount) : null,
        totalRefunded: order.totalRefunded ? Number(order.totalRefunded) : null,
        // Add computed cashbackStatus based on cashbackProcessed
        cashbackStatus: cashbackAmountNumber && cashbackAmountNumber > 0
          ? (order.cashbackProcessed ? 'PROCESSED' : 'PENDING')
          : null,
        customer: order.customer ? {
          ...order.customer,
          storeCredit: order.customer.storeCredit
            ? parseFloat(order.customer.storeCredit.toString())
            : 0,
          totalCashbackEarned: order.customer.totalCashbackEarned
            ? parseFloat(order.customer.totalCashbackEarned.toString())
            : 0,
          totalSpent: order.customer.totalSpent
            ? parseFloat(order.customer.totalSpent.toString())
            : 0,
          lifetimeSpent: order.customer.lifetimeSpent
            ? parseFloat(order.customer.lifetimeSpent.toString())
            : 0
        } : null,
        creditLedgerEntries: order.creditLedgerEntries?.map((entry: any) => ({
          ...entry,
          amount: entry.amount ? parseFloat(entry.amount.toString()) : 0,
          balance: entry.balance ? parseFloat(entry.balance.toString()) : 0
        }))
      };
    });

    console.log('[Orders Loader] Serialized orders count:', serializedOrders.length);

    // Log first order as sample if available
    if (serializedOrders.length > 0) {
      console.log('[Orders Loader] Sample order (first):', {
        id: serializedOrders[0].id,
        shopifyOrderName: serializedOrders[0].shopifyOrderName,
        email: serializedOrders[0].email,
        totalPrice: serializedOrders[0].totalPrice,
        cashbackAmount: serializedOrders[0].cashbackAmount,
        cashbackProcessed: serializedOrders[0].cashbackProcessed,
        hasCustomer: !!serializedOrders[0].customer,
        customerEmail: serializedOrders[0].customer?.email
      });
    }

    const responseData = {
      orders: serializedOrders,
      stats,
      shopSettings,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalCount,
      },
    };

    console.log('[Orders Loader] Returning response with:');
    console.log('[Orders Loader] - orders array length:', responseData.orders.length);
    console.log('[Orders Loader] - pagination:', responseData.pagination);
    console.log('[Orders Loader] ========== END ==========');

    return json(responseData);
  } catch (error) {
    console.error('[Orders Loader] ========== ERROR ==========');
    console.error('[Orders Loader] Error loading orders:', error);
    console.error('[Orders Loader] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[Orders Loader] ========== ERROR END ==========');
    throw new Response("Error loading orders", { status: 500 });
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session, admin } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const formData = await request.formData();
    const action = formData.get("action");
    const shop = session.shop;

    switch (action) {
      case "fetch-store-credit-balance": {
        // Fetch current store credit balance from Shopify
        const customerId = formData.get("customerId") as string;

        try {
          // Get customer with Shopify ID
          const customer = await prisma.customer.findFirst({
            where: { id: customerId, shop },
          });

          if (!customer || !customer.shopifyCustomerId) {
            return json({
              action: "fetch-store-credit-balance",
              success: false,
              error: "Customer not found or missing Shopify ID"
            });
          }

          // Get current store credit from Shopify
          const storeCreditQuery = `
            query GetCustomerStoreCredit($customerId: ID!) {
              customer(id: $customerId) {
                id
                storeCreditAccounts(first: 10) {
                  edges {
                    node {
                      id
                      balance {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          `;

          const response = await admin.graphql(storeCreditQuery, {
            variables: {
              customerId: `gid://shopify/Customer/${customer.shopifyCustomerId}`,
            },
          });

          const responseJson = await response.json() as { data: any; errors?: Array<{ message: string }> };

          if (responseJson.errors) {
            console.error('GraphQL errors:', responseJson.errors);
            return json({
              action: "fetch-store-credit-balance",
              success: false,
              error: "Failed to fetch from Shopify"
            });
          }

          // Calculate total store credit from all accounts
          let totalCredit = 0;
          if (responseJson.data?.customer?.storeCreditAccounts?.edges) {
            for (const edge of responseJson.data.customer.storeCreditAccounts.edges) {
              totalCredit += parseFloat(edge.node.balance.amount);
            }
          }

          // Update database with current balance
          await prisma.customer.update({
            where: { id: customerId },
            data: {
              storeCredit: totalCredit,
              updatedAt: new Date(),
            },
          });

          return json({
            action: "fetch-store-credit-balance",
            success: true,
            balance: totalCredit
          });
        } catch (error) {
          console.error('Error fetching store credit balance:', error);
          return json({
            action: "fetch-store-credit-balance",
            success: false,
            error: "Failed to fetch balance"
          });
        }
      }

      case "process-cashback-modal": {
        // New modal-based processing with editable amount
        const orderId = formData.get("orderId") as string;
        const amount = parseFloat(formData.get("amount") as string);
        const reason = formData.get("reason") as string;

        // OPTIMIZED: Fetch order with customer in single query
        const order = await prisma.order.findFirst({
          where: { id: orderId, shop },
          include: { customer: true }
        });

        if (!order) {
          throw new Error("Order not found");
        }

        const customer = order.customer;

        if (!customer || !customer.shopifyCustomerId) {
          throw new Error("Customer not found or missing Shopify ID");
        }

        if (order.cashbackProcessed) {
          throw new Error("Cashback already processed");
        }

        // Get shop settings for currency
        const shopSettings = await prisma.shopSettings.findUnique({
          where: { shop }
        });

        const currency = shopSettings?.storeCurrency || order.currency || "USD";

        // Use the store credit service to add credit
        const { createStoreCreditService } = await import("~/services/shopify-store-credit.service");
        const storeCreditService = createStoreCreditService(admin, session.shop);

        try {
          const result = await storeCreditService.issueStoreCredit(
            customer.shopifyCustomerId,
            amount,
            currency,
            reason
          );

          if (!result.success) {
            throw new Error(result.error || "Failed to add store credit");
          }

          const newBalance = result.balance || (parseFloat(customer.storeCredit.toString()) + amount);

          // Check if a ledger entry already exists for this order
          const existingLedger = await prisma.storeCreditLedger.findFirst({
            where: {
              shop,
              shopifyOrderId: order.shopifyOrderId,
              type: 'CASHBACK_EARNED'
            }
          });

          if (!existingLedger) {
            // Create ledger entry
            await prisma.storeCreditLedger.create({
              data: {
                id: uuidv4(),
                customerId: order.customerId,
                shop,
                amount: amount,
                balance: newBalance,
                type: 'CASHBACK_EARNED',
                shopifyOrderId: order.shopifyOrderId,
                orderId: order.id,
                metadata: {
                  orderNumber: order.shopifyOrderNumber,
                  orderName: order.shopifyOrderName,
                  cashbackPercent: order.cashbackPercent,
                  tierName: order.tierNameAtOrder,
                  reason: reason,
                  originalCashbackAmount: order.cashbackAmount,
                  adjustedAmount: amount,
                  shopifyBalance: newBalance,
                  shopifyTransactionId: result.transactionId,
                  syncStatus: 'SYNCED',
                  syncedAt: new Date().toISOString()
                },
                createdAt: new Date(),
              }
            });
          }

          // Get current totalCashbackEarned to calculate new value
          const currentTotalCashback = customer.totalCashbackEarned
            ? parseFloat(customer.totalCashbackEarned.toString())
            : 0;

          // Update customer balance to match Shopify
          await prisma.customer.update({
            where: { id: order.customerId },
            data: {
              storeCredit: newBalance,
              totalCashbackEarned: currentTotalCashback + amount,
              updatedAt: new Date(),
            },
          });

          // Mark order as processed
          await prisma.order.update({
            where: { id: orderId },
            data: {
              cashbackProcessed: true,
              cashbackAmount: amount, // Update to actual amount issued
              processedAt: new Date(),
              updatedAt: new Date(),
            },
          });

          // Update customer spending totals from Order table
          await updateCustomerSpendingTotals(order.customerId, shop);

          return json({
            success: true,
            message: `Cashback of ${formatCurrency(amount, shopSettings)} successfully added to store credit`
          });

        } catch (error) {
          console.error(`[Orders] Error processing cashback:`, error);
          throw new Error(error instanceof Error ? error.message : "Failed to process cashback");
        }
      }

      // Legacy direct processing - kept for backward compatibility
      // Now handled by process-cashback-modal with UI
      case "process-cashback-old": {
        const orderId = formData.get("orderId") as string;

        // OPTIMIZED: Fetch order with customer in single query
        const order = await prisma.order.findFirst({
          where: { id: orderId, shop },
          include: { customer: true }
        });

        if (!order) {
          throw new Error("Order not found");
        }

        const customer = order.customer;

        if (!customer || !customer.shopifyCustomerId) {
          throw new Error("Customer not found or missing Shopify ID");
        }

        if (order.cashbackProcessed) {
          throw new Error("Cashback already processed");
        }

        if (!order.cashbackAmount) {
          throw new Error("No cashback amount to process");
        }

        // Get shop settings for currency
        const shopSettings = await prisma.shopSettings.findUnique({
          where: { shop }
        });

        const currency = shopSettings?.storeCurrency || order.currency || "USD";
        const cashbackAmount = Number(order.cashbackAmount);
        const gidCustomerId = `gid://shopify/Customer/${customer.shopifyCustomerId}`;

        // Use GraphQL mutation to add credit directly
        const creditMutation = `#graphql
          mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
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
                message
                field
                code
              }
            }
          }
        `;

        console.log(`[Orders] Attempting to issue credit:`);
        console.log(`[Orders]   Customer GID: ${gidCustomerId}`);
        console.log(`[Orders]   Amount: ${cashbackAmount.toFixed(2)} ${currency}`);

        try {
          const creditResponse = await admin.graphql(creditMutation, {
            variables: {
              id: gidCustomerId,
              creditInput: {
                creditAmount: {
                  amount: cashbackAmount.toFixed(2),
                  currencyCode: currency
                }
              }
            }
          });

          const creditData = await creditResponse.json() as any;

          console.log(`[Orders] GraphQL Response:`, JSON.stringify(creditData, null, 2));

          if (creditData.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
            const errors = creditData.data.storeCreditAccountCredit.userErrors;
            console.error("[Orders] Credit mutation errors:", errors);

            // Check if it's a "no account" error
            if (errors.some((e: any) => e.message.toLowerCase().includes("account") || e.message.toLowerCase().includes("does not exist"))) {
              throw new Error("Customer does not have a store credit account. Please create one in Shopify first.");
            }
            throw new Error(errors[0].message || "Failed to add store credit");
          }

          const transaction = creditData.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;
          if (!transaction) {
            throw new Error("No transaction returned from Shopify");
          }

          const newBalance = parseFloat(transaction.balanceAfterTransaction.amount);
          const shopifyTransactionId = transaction.id;

          console.log(`[Orders] ✅ Store credit issued in Shopify: ${shopifyTransactionId}`);
          console.log(`[Orders]    Amount: ${cashbackAmount} ${currency}`);
          console.log(`[Orders]    New balance: ${newBalance} ${currency}`);

          // Check if a ledger entry already exists for this order
          const existingLedger = await prisma.storeCreditLedger.findFirst({
            where: {
              shop,
              shopifyOrderId: order.shopifyOrderId,
              type: 'CASHBACK_EARNED'
            }
          });

          if (!existingLedger) {
            // Create ledger entry - store sync info in metadata
            // to avoid column missing errors in Aurora Data API
            const ledgerId = uuidv4();
            await prisma.storeCreditLedger.create({
              data: {
                id: ledgerId,
                customerId: order.customerId,
                shop,
                amount: cashbackAmount,
                balance: newBalance,
                type: 'CASHBACK_EARNED',
                shopifyOrderId: order.shopifyOrderId,
                orderId: order.id,
                metadata: {
                  orderNumber: order.shopifyOrderNumber,
                  orderName: order.shopifyOrderName,
                  cashbackPercent: order.cashbackPercent,
                  tierName: order.tierNameAtOrder,
                  description: `${order.cashbackPercent}% cashback from order ${order.shopifyOrderName}`,
                  shopifyBalance: newBalance,
                  // Store sync info in metadata since columns may not exist
                  shopifyTransactionId,
                  syncStatus: 'SYNCED',
                  syncedAt: new Date().toISOString()
                },
                createdAt: new Date(),
              }
            });
          } else {
            console.log(`[Orders] Ledger entry already exists for order ${order.shopifyOrderName}, skipping creation`);
          }

          // Get current totalCashbackEarned to calculate new value
          const currentTotalCashback = customer.totalCashbackEarned
            ? parseFloat(customer.totalCashbackEarned.toString())
            : 0;

          // Update customer balance to match Shopify
          await prisma.customer.update({
            where: { id: order.customerId },
            data: {
              storeCredit: newBalance,
              totalCashbackEarned: currentTotalCashback + cashbackAmount,
              updatedAt: new Date(),
            },
          });

          // Mark order as processed
          await prisma.order.update({
            where: { id: orderId },
            data: {
              cashbackProcessed: true,
              processedAt: new Date(),
              updatedAt: new Date(),
            },
          });

          return json({
            success: true,
            message: `Cashback of ${formatCurrency(cashbackAmount, shopSettings)} successfully added to store credit`
          });

        } catch (error) {
          console.error(`[Orders] Error processing cashback:`, error);

          // Still create a local ledger entry but mark as failed
          const currentBalance = Number(customer.storeCredit);
          const localNewBalance = currentBalance + cashbackAmount;

          // Check if a ledger entry already exists before creating failed entry
          const existingFailedLedger = await prisma.storeCreditLedger.findFirst({
            where: {
              shop,
              shopifyOrderId: order.shopifyOrderId,
              type: 'CASHBACK_EARNED'
            }
          });

          if (!existingFailedLedger) {
            // Create failed ledger entry - store sync info in metadata
            // to avoid column missing errors in Aurora Data API
            await prisma.storeCreditLedger.create({
              data: {
                id: uuidv4(),
                customerId: order.customerId,
                shop,
                amount: cashbackAmount,
                balance: localNewBalance,
                type: 'CASHBACK_EARNED',
                shopifyOrderId: order.shopifyOrderId,
                orderId: order.id,
                metadata: {
                  orderNumber: order.shopifyOrderNumber,
                  orderName: order.shopifyOrderName,
                  cashbackPercent: order.cashbackPercent,
                  tierName: order.tierNameAtOrder,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  description: `${order.cashbackPercent}% cashback from order ${order.shopifyOrderName}`,
                  // Store sync info in metadata since columns may not exist
                  syncStatus: 'FAILED',
                  syncedAt: new Date().toISOString()
                },
                createdAt: new Date(),
              }
            });
          } else {
            console.log(`[Orders] Failed ledger entry already exists for order ${order.shopifyOrderName}, skipping creation`);
          }

          // Get current totalCashbackEarned to calculate new value
          const currentTotalCashbackLocal = customer.totalCashbackEarned
            ? parseFloat(customer.totalCashbackEarned.toString())
            : 0;

          // Update customer balance locally
          await prisma.customer.update({
            where: { id: order.customerId },
            data: {
              storeCredit: localNewBalance,
              totalCashbackEarned: currentTotalCashbackLocal + cashbackAmount,
              updatedAt: new Date(),
            },
          });

          // Mark order as processed even if Shopify sync failed
          await prisma.order.update({
            where: { id: orderId },
            data: {
              cashbackProcessed: true,
              processedAt: new Date(),
              updatedAt: new Date(),
            },
          });

          return json({
            success: true,
            message: `Cashback processed locally but failed to sync to Shopify: ${error instanceof Error ? error.message : 'Unknown error'}. The credit has been recorded and will be retried later.`
          });
        }
      }

      case "process-refund": {
        const orderId = formData.get("orderId") as string;
        const refundId = formData.get("refundId") as string;

        // Fetch refund first
        const refund = await prisma.orderRefund.findFirst({
          where: { id: refundId, orderId },
        });

        if (!refund) {
          throw new Error("Refund not found");
        }

        // Verify order belongs to shop
        const refundOrder = await prisma.order.findFirst({
          where: { id: refund.orderId, shop },
        });

        if (!refundOrder) {
          throw new Error("Order not found or unauthorized");
        }

        // Fetch customer if needed
        const refundCustomer = refundOrder.customerId !== "unknown"
          ? await prisma.customer.findUnique({
              where: { id: refundOrder.customerId }
            })
          : null;

        if (!refund.cashbackAdjustment) {
          throw new Error("No cashback to adjust for this refund");
        }

        if (refund.cashbackProcessed) {
          throw new Error("Refund cashback already processed");
        }

        if (!refundCustomer) {
          throw new Error("Customer not found for refund");
        }

        // Get current balance from customer record
        const currentBalance = Number(refundCustomer.storeCredit);
        const adjustmentAmount = Number(refund.cashbackAdjustment);
        const newBalance = Math.max(0, currentBalance - adjustmentAmount);

        // Create ledger entry for refund
        await prisma.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            customerId: refundOrder.customerId,
            shop,
            amount: -adjustmentAmount,
            balance: newBalance,
            type: 'REFUND_CREDIT',
            shopifyOrderId: refundOrder.shopifyOrderId,
            orderId: refund.orderId,
            refundId: refund.id,
            metadata: {
              refundAmount: Number(refund.amount),
              orderNumber: refundOrder.shopifyOrderNumber,
            },
            createdAt: new Date(),
          },
        });

        // Update customer balance
        await prisma.customer.update({
          where: { id: refundOrder.customerId },
          data: {
            storeCredit: newBalance,
            updatedAt: new Date(),
          },
        });

        // Mark refund as processed
        await prisma.orderRefund.update({
          where: { id: refundId },
          data: {
            cashbackProcessed: true,
            processedAt: new Date(),
          },
        });

        return json({
          success: true,
          message: "Refund cashback adjustment processed"
        });
      }

      case "process-all-cashback": {
        // Process all pending cashback orders in batch
        const orderIds = (formData.get("orderIds") as string).split(',');
        const ordersDataStr = formData.get("ordersData") as string | null;
        const enableDebugLog = formData.get("enableDebugLog") === "true";
        const debugLog: string[] = [];

        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        // Debug logging
        if (enableDebugLog) {
          debugLog.push(`[SERVER] Received ${orderIds.length} order IDs`);
          debugLog.push(`[SERVER] Has order data: ${!!ordersDataStr}`);
          debugLog.push(`[SERVER] Order data length: ${ordersDataStr?.length || 0} chars`);
        }

        // Parse the orders data if provided (skip DB fetch)
        let ordersToProcess: any[] = [];

        if (ordersDataStr) {
          // Use the passed order data directly (no DB fetch needed)
          try {
            ordersToProcess = JSON.parse(ordersDataStr);
            if (enableDebugLog) {
              debugLog.push(`[PARSE] Successfully parsed ${ordersToProcess.length} orders from client data`);
            }
          } catch (e) {
            const errorMsg = `Failed to parse orders data: ${e instanceof Error ? e.message : 'Unknown error'}`;
            console.error(errorMsg);
            if (enableDebugLog) {
              debugLog.push(`[ERROR] ${errorMsg}`);
            }
          }
        }

        // If no order data passed, fall back to fetching from DB
        // OPTIMIZED: Use single findMany with IN clause instead of N individual queries
        if (ordersToProcess.length === 0 && orderIds.length > 0) {
          const fetchedOrders = await prisma.order.findMany({
            where: { id: { in: orderIds }, shop },
            include: { customer: true }
          });
          ordersToProcess.push(...fetchedOrders);
        }

        // Process each order
        for (let i = 0; i < ordersToProcess.length; i++) {
          const order = ordersToProcess[i];

          if (enableDebugLog) {
            debugLog.push(`\n[ORDER ${i + 1}/${ordersToProcess.length}] Processing ${order?.shopifyOrderName || order?.id || 'unknown'}`);
          }

          try {
            if (!order) {
              failCount++;
              const msg = `Order not found (null/undefined)`;
              errors.push(msg);
              if (enableDebugLog) debugLog.push(`[SKIP] ${msg}`);
              continue;
            }

            if (enableDebugLog) {
              debugLog.push(`[CHECK] Order ID: ${order.id}`);
              debugLog.push(`[CHECK] Has customer object: ${!!order.customer}`);
              debugLog.push(`[CHECK] Order customerId field: ${order.customerId || 'none'}`);
              debugLog.push(`[CHECK] Customer object ID: ${order.customer?.id || 'none'}`);
              debugLog.push(`[CHECK] Shopify Customer ID: ${order.customer?.shopifyCustomerId || 'MISSING'}`);
              debugLog.push(`[CHECK] Cashback amount: ${order.cashbackAmount || 0}`);
            }

            // Try to fetch customer if not included or if customerId field exists
            let customer = order.customer;

            // If no customer object but has customerId, try to fetch it
            if (!customer && order.customerId && order.customerId !== "unknown") {
              if (enableDebugLog) {
                debugLog.push(`[FETCH] No customer object, fetching by customerId: ${order.customerId}`);
              }

              customer = await prisma.customer.findFirst({
                where: {
                  id: order.customerId,
                  shop
                },
                include: {
                  currentTier: true
                }
              });

              if (enableDebugLog) {
                debugLog.push(`[FETCH] Customer fetch result: ${customer ? `found ${customer.email}` : 'not found'}`);
              }
            }

            // Now check if we have a valid customer with Shopify ID
            if (!customer || !customer.shopifyCustomerId) {
              failCount++;
              const msg = `Order ${order.shopifyOrderId || order.shopifyOrderName}: No customer or missing Shopify ID`;
              errors.push(msg);
              if (enableDebugLog) {
                debugLog.push(`[SKIP] ${msg}`);
                if (order.customerId) {
                  debugLog.push(`[DEBUG] Order has customerId: ${order.customerId} but customer not found or no Shopify ID`);
                }
              }
              continue;
            }

            const amount = order.cashbackAmount ? Number(order.cashbackAmount) : 0;
            if (amount <= 0) {
              failCount++;
              const msg = `Order ${order.shopifyOrderId}: Invalid cashback amount (${amount})`;
              errors.push(msg);
              if (enableDebugLog) debugLog.push(`[SKIP] ${msg}`);
              continue;
            }

            // Add store credit through Shopify GraphQL (same as individual processing)
            const currency = order.currency || 'USD';
            const gidCustomerId = `gid://shopify/Customer/${customer.shopifyCustomerId}`;

            if (enableDebugLog) {
              debugLog.push(`[GRAPHQL] Preparing mutation for customer GID: ${gidCustomerId}`);
              debugLog.push(`[GRAPHQL] Amount: ${amount.toFixed(2)} ${currency}`);
            }

            // Use the same GraphQL mutation as individual processing
            const creditMutation = `#graphql
              mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
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
                    message
                    field
                    code
                  }
                }
              }
            `;

            try {
              if (enableDebugLog) {
                debugLog.push(`[API] Calling Shopify GraphQL mutation...`);
              }

              const creditResponse = await admin.graphql(creditMutation, {
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

              const creditData = await creditResponse.json() as any;

              if (enableDebugLog) {
                debugLog.push(`[API] Response received`);
                debugLog.push(`[API] Has data: ${!!creditData.data}`);
                debugLog.push(`[API] Has errors: ${!!creditData.errors}`);
                if (creditData.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
                  debugLog.push(`[API] User errors: ${JSON.stringify(creditData.data.storeCreditAccountCredit.userErrors)}`);
                }
              }

              if (creditData.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
                const errors = creditData.data.storeCreditAccountCredit.userErrors;
                throw new Error(errors[0].message || "Failed to add store credit");
              }

              const transaction = creditData.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;
              if (!transaction) {
                throw new Error("No transaction returned from Shopify");
              }

              const newBalance = parseFloat(transaction.balanceAfterTransaction.amount);
              const shopifyTransactionId = transaction.id;

            // Get current totalCashbackEarned to calculate new value
            const currentTotalCashback = customer.totalCashbackEarned
              ? parseFloat(customer.totalCashbackEarned.toString())
              : 0;

              // Update customer balance
              await prisma.customer.update({
                where: { id: customer.id },
                data: {
                  storeCredit: newBalance,
                  totalCashbackEarned: currentTotalCashback + amount,
                  updatedAt: new Date(),
                },
              });

              // Check if ledger entry already exists
              const existingLedger = await prisma.storeCreditLedger.findFirst({
                where: {
                  shop,
                  shopifyOrderId: order.shopifyOrderId,
                  type: 'CASHBACK_EARNED'
                }
              });

              if (!existingLedger) {
                // Create ledger entry - put potentially missing columns in metadata
                await prisma.storeCreditLedger.create({
                  data: {
                    id: uuidv4(),
                    shop,
                    customerId: customer.id,
                    amount: amount,
                    balance: newBalance,
                    type: 'CASHBACK_EARNED',
                    shopifyOrderId: order.shopifyOrderId,
                    orderId: order.id,
                    metadata: {
                      description: `Loyalty reward - Order ${order.shopifyOrderId}`,
                      orderNumber: order.shopifyOrderNumber,
                      orderName: order.shopifyOrderName,
                      cashbackPercent: order.cashbackPercent,
                      tierName: order.tierNameAtOrder,
                      processedBy: "batch",
                      // Store these in metadata in case columns don't exist in DB
                      shopifyTransactionId: shopifyTransactionId,
                      syncStatus: "SYNCED",
                      syncedAt: new Date().toISOString()
                    },
                    createdAt: new Date()
                  },
                });
              }

              // Mark order as processed
              await prisma.order.update({
                where: { id: order.id },
                data: {
                  cashbackProcessed: true,
                  processedAt: new Date(),
                  updatedAt: new Date(),
                },
              });

              // Update customer spending totals from Order table
              await updateCustomerSpendingTotals(customer.id, shop);

              successCount++;
              if (enableDebugLog) {
                debugLog.push(`[SUCCESS] Order ${order.shopifyOrderName} processed successfully for customer ${customer.email}`);
              }
            } catch (error) {
              failCount++;
              const errorMsg = `Order ${order.shopifyOrderId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
              errors.push(errorMsg);
              if (enableDebugLog) {
                debugLog.push(`[ERROR] Inner catch: ${errorMsg}`);
              }
              continue;
            }
          } catch (outerError) {
            failCount++;
            const errorMsg = `Order ${order.shopifyOrderId || order.id}: ${outerError instanceof Error ? outerError.message : 'Unknown error'}`;
            errors.push(errorMsg);
            if (enableDebugLog) {
              debugLog.push(`[ERROR] Outer catch: ${errorMsg}`);
            }
            continue;
          }
        }

        if (enableDebugLog) {
          debugLog.push(`\n[COMPLETE] Processed ${successCount} successfully, ${failCount} failed`);
        }

        // Return summary with debug log
        return json({
          success: failCount === 0,
          message: `Processed ${successCount} orders successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
          successCount,
          failCount,
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined, // Show first 5 errors
          debugLog: enableDebugLog ? debugLog : undefined // Include debug log if enabled
        });
      }

      case "sync-orders": {
        // Import the sync service dynamically
        const { OrderSyncService } = await import("../services/order-sync.service");

        console.log("[ORDERS PAGE] Starting order sync for 1 year of historical orders");

        const syncService = new OrderSyncService(admin, {
          shop,
          batchSize: 50,
          startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last 1 year
          endDate: new Date(),
        });

        console.log("[ORDERS PAGE] Sync service created, starting sync...");

        // Run sync synchronously to ensure it completes before Vercel timeout
        // For small order counts (<100 orders), this should complete quickly
        try {
          const result = await syncService.syncAllOrders();
          console.log("[ORDERS PAGE] Sync completed:", result);

          return json({
            success: result.success,
            message: result.message,
            stats: {
              successful: result.progress.successful,
              failed: result.progress.failed,
              skipped: result.progress.skipped,
              duration: result.duration
            }
          });
        } catch (error) {
          console.error("[ORDERS PAGE] Sync failed:", error);
          return json({
            success: false,
            message: error instanceof Error ? error.message : "Sync failed",
            error: String(error)
          }, { status: 500 });
        }
      }

      default:
        throw new Error("Invalid action");
    }
  } catch (error: any) {
    console.error("Error processing action:", error);
    return json({
      success: false,
      error: error.message || "An error occurred"
    }, { status: 400 });
  }
};

// ============================================
// COMPONENT
// ============================================

export default function OrdersPage() {
  const loaderData = useLoaderData<LoaderData>() as unknown as LoaderData;
  const { orders, stats, shopSettings, pagination } = loaderData;

  // Client-side logging
  console.log('[Orders Page Client] ========== RENDER ==========');
  console.log('[Orders Page Client] Loader data received:', {
    ordersLength: orders?.length ?? 0,
    stats,
    pagination,
    shopSettings: shopSettings ? 'present' : 'null'
  });

  if (orders && orders.length > 0) {
    console.log('[Orders Page Client] First order sample:', {
      id: orders[0].id,
      shopifyOrderName: orders[0].shopifyOrderName,
      email: orders[0].email
    });
  } else {
    console.log('[Orders Page Client] ⚠️ Orders array is empty or undefined');
  }

  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCashbackModalOpen, setIsCashbackModalOpen] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [processingCustomer, setProcessingCustomer] = useState<{ id: string; email: string; storeCredit: number } | null>(null);
  const [defaultCashbackAmount, setDefaultCashbackAmount] = useState<number>(0);
  const [fetchingBalance, setFetchingBalance] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [processAllProgress, setProcessAllProgress] = useState({ current: 0, total: 0 });
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const [currentProcessingStep, setCurrentProcessingStep] = useState<string>("");
  const { toast, showSuccess, showError, hideToast } = useToast();
  const [queryValue, setQueryValue] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [cashbackFilter, setCashbackFilter] = useState(searchParams.get("cashback") || "all");
  const [selectedPageSize, setSelectedPageSize] = useState(searchParams.get("pageSize") || "25");

  // State for confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{
    title: string;
    message: string;
    orderIds: string[];
    orders?: any[]; // Full order data
    action: "process-all" | "process-selected";
  } | null>(null);

  const isLoading = navigation.state === "loading" || navigation.state === "submitting";

  // Handle fetcher response for store credit balance
  // Only process when we're actively fetching (fetchingBalance is true)
  // This prevents stale fetcher.data from reopening the modal after submission
  useEffect(() => {
    const fd = fetcher.data as any;
    if (fd && fd.action === "fetch-store-credit-balance" && fetchingBalance) {
      if (fd.success && processingCustomer) {
        // Update the customer's store credit with the fetched balance
        setProcessingCustomer({
          ...processingCustomer,
          storeCredit: fd.balance || 0
        });
        setFetchingBalance(false);
        setIsCashbackModalOpen(true);
      } else if (fd.error) {
        // If fetch failed, use existing balance and show modal
        setFetchingBalance(false);
        setIsCashbackModalOpen(true);
      }
    }
  }, [fetcher.data, processingCustomer, fetchingBalance]);

  // Handle response from processing all cashback
  useEffect(() => {
    const ad = actionData as any;
    if (ad?.successCount !== undefined || ad?.failCount !== undefined) {
      // Reset processing state
      setIsProcessingAll(false);
      setProcessAllProgress({ current: 0, total: 0 });

      // Show result toast
      if (ad.message) {
        const isError = ad.failCount > 0 && ad.successCount === 0;
        if (isError) {
          showError(ad.message);
        } else {
          showSuccess(ad.message);
        }
      }
    }
  }, [actionData, showSuccess, showError]);

  // Selected order for modal
  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId);
  }, [orders, selectedOrderId]);

  // Handle search
  const handleSearch = useCallback((value: string) => {
    setQueryValue(value);
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    params.set("page", "1"); // Reset to first page
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Handle status filter
  const handleStatusFilter = useCallback((value: string[]) => {
    const newStatus = value[0] || "all";
    setStatusFilter(newStatus);
    const params = new URLSearchParams(searchParams);
    if (newStatus !== "all") {
      params.set("status", newStatus);
    } else {
      params.delete("status");
    }
    params.set("page", "1");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Handle cashback filter
  const handleCashbackFilter = useCallback((value: string[]) => {
    const newFilter = value[0] || "all";
    setCashbackFilter(newFilter);
    const params = new URLSearchParams(searchParams);
    if (newFilter !== "all") {
      params.set("cashback", newFilter);
    } else {
      params.delete("cashback");
    }
    params.set("page", "1");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Selection state for bulk actions
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(orders as any);

  // Bulk actions for selected orders
  const bulkActions = useMemo(() => {
    const actions = [];

    // Check if any selected orders have pending cashback
    const selectedOrders = orders.filter(order => selectedResources.includes(order.id));
    const pendingCashbackOrders = selectedOrders.filter(order => {
      const cashbackAmountNum = order.cashbackAmount ? Number(order.cashbackAmount) : 0;
      const hasCustomer = !!(
        order.customer &&
        order.customer.id &&
        order.customer.id !== "unknown" &&
        order.customer.shopifyCustomerId
      );
      // Alternative check: order has customerId that could be fetched
      // This handles cases where customer relation wasn't included but ID exists
      const hasCustomerId = !!(order.customerId && order.customerId !== "unknown");
      // Order qualifies if it has either a customer object OR a valid customerId
      const hasValidCustomer = hasCustomer || hasCustomerId;
      const hasPositiveCashback = cashbackAmountNum > 0;
      const isNotProcessed = !order.cashbackProcessed;
      return hasValidCustomer && hasPositiveCashback && isNotProcessed;
    });

    if (pendingCashbackOrders.length > 0) {
      actions.push({
        content: `Process cashback (${pendingCashbackOrders.length})`,
        onAction: () => {
          setConfirmModalData({
            title: "Process Selected Orders",
            message: `Are you sure you want to process cashback for ${pendingCashbackOrders.length} selected order${pendingCashbackOrders.length > 1 ? 's' : ''}?`,
            orderIds: pendingCashbackOrders.map(o => o.id),
            orders: pendingCashbackOrders, // Pass full order data
            action: "process-selected"
          });
          setShowConfirmModal(true);
        },
      });
    }

    // Add export action if orders are selected
    if (selectedOrders.length > 0) {
      actions.push({
        content: `Export ${selectedOrders.length} order${selectedOrders.length > 1 ? 's' : ''}`,
        onAction: () => {
          // TODO: Implement export functionality
          showSuccess('Export functionality coming soon');
        },
      });
    }

    return actions;
  }, [selectedResources, orders, submit, clearSelection]);

  // Handle clear filters
  const handleClearAll = useCallback(() => {
    setQueryValue("");
    setStatusFilter("all");
    setCashbackFilter("all");
    setSelectedPageSize("25");
    setSearchParams({});
    clearSelection(); // Also clear selection
  }, [setSearchParams, clearSelection]);

  // Handle page size change
  const handlePageSizeChange = useCallback((value: string) => {
    setSelectedPageSize(value);
    const params = new URLSearchParams(searchParams);
    params.set("pageSize", value);
    params.set("page", "1"); // Reset to first page
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Process cashback for an order - opens modal
  const handleProcessCashback = useCallback((orderId: string) => {
    // Find the order and customer details
    const order = orders.find(o => o.id === orderId);

    // Debug logging
    console.log('[Orders] Processing cashback for order:', orderId);
    console.log('[Orders] Order found:', order);
    console.log('[Orders] Customer in order:', order?.customer);
    console.log('[Orders] Customer storeCredit raw:', order?.customer?.storeCredit);
    console.log('[Orders] Customer ID in order:', order?.customerId);

    if (!order) {
      showError('Order not found');
      return;
    }

    // If customer object not directly available, check if we have customerId
    if (!order.customer && order.customerId === "unknown") {
      showError('This order has no associated customer');
      return;
    }

    // Extract customer info - handle both embedded customer and customer reference
    const customerData = order.customer || {
      id: order.customerId,
      email: order.email || 'Unknown',
      storeCredit: 0,
      shopifyCustomerId: null
    };

    if (!customerData.id || customerData.id === "unknown") {
      showError('Customer information not available for this order');
      return;
    }

    setFetchingBalance(true);
    setProcessingOrderId(orderId);

    // Fetch current balance from Shopify if we have the Shopify customer ID
    if (customerData.shopifyCustomerId) {
      // Fetch current balance from Shopify through fetcher
      fetcher.submit(
        {
          action: "fetch-store-credit-balance",
          customerId: customerData.id
        },
        { method: "post" }
      );

      // Set up modal with existing data, will be updated when fetcher returns
      setProcessingCustomer({
        id: customerData.id,
        email: customerData.email || order.email || 'Unknown',
        storeCredit: customerData.storeCredit ? parseFloat(customerData.storeCredit.toString()) : 0
      });
      setDefaultCashbackAmount(Number(order.cashbackAmount) || 0);
    } else {
      // Fallback to database balance if no Shopify ID
      const currentBalance = customerData.storeCredit
        ? parseFloat(customerData.storeCredit.toString())
        : 0;

      // Set up modal state with pre-calculated amount
      setProcessingCustomer({
        id: customerData.id,
        email: customerData.email || order.email || 'Unknown',
        storeCredit: currentBalance
      });
      setDefaultCashbackAmount(Number(order.cashbackAmount) || 0);
      setFetchingBalance(false);
      setIsCashbackModalOpen(true);
    }
  }, [orders, fetcher]);

  // Submit cashback from modal
  const handleCashbackSubmit = useCallback((amount: number, reason: string) => {
    if (!processingOrderId) return;

    // Use submit to ensure data reloads after processing
    submit(
      {
        action: "process-cashback-modal",
        orderId: processingOrderId,
        amount: amount.toString(),
        reason: reason
      },
      { method: "post" }
    );

    // Close modal
    setIsCashbackModalOpen(false);
    setProcessingOrderId(null);
    setProcessingCustomer(null);
  }, [submit, processingOrderId]);

  // Process refund cashback
  const handleProcessRefund = useCallback((orderId: string, refundId: string) => {
    submit(
      { action: "process-refund", orderId, refundId },
      { method: "post" }
    );
  }, [submit]);

  // Sync orders from Shopify
  const handleSyncOrders = useCallback(() => {
    submit(
      { action: "sync-orders" },
      { method: "post" }
    );
  }, [submit]);

  // Process all orders (replaces Process All Pending)
  const handleProcessAll = useCallback(() => {
    // Get all qualifying cashback orders using the same logic as qualifyingOrdersCount
    const qualifyingOrders = orders.filter(order => {
      const cashbackAmountNum = order.cashbackAmount ? Number(order.cashbackAmount) : 0;

      // More detailed customer detection (same as test page)
      const hasCustomer = !!(
        order.customer &&
        order.customer.id &&
        order.customer.id !== "unknown" &&
        order.customer.shopifyCustomerId // Also check for Shopify ID
      );

      // Alternative check: order has customerId that could be fetched
      // This handles cases where customer relation wasn't included but ID exists
      const hasCustomerId = !!(order.customerId && order.customerId !== "unknown");

      // Order qualifies if it has either a customer object OR a valid customerId
      const hasValidCustomer = hasCustomer || hasCustomerId;

      const hasPositiveCashback = cashbackAmountNum > 0;
      const isNotProcessed = !order.cashbackProcessed;

      return hasValidCustomer && hasPositiveCashback && isNotProcessed;
    });

    if (qualifyingOrders.length === 0) {
      showSuccess('No qualifying orders to process');
      return;
    }

    // Show confirmation modal with full order data
    setConfirmModalData({
      title: "Process All Orders",
      message: `Are you sure you want to process cashback for ${qualifyingOrders.length} qualifying order${qualifyingOrders.length > 1 ? 's' : ''}?`,
      orderIds: qualifyingOrders.map(o => o.id),
      orders: qualifyingOrders, // Pass full order data
      action: "process-all"
    });
    setShowConfirmModal(true);
  }, [orders]);

  // Open order detail modal
  const handleViewOrder = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setIsDetailModalOpen(true);
  }, []);

  // Handle confirmation modal confirm
  const handleConfirmProcess = useCallback(() => {
    if (!confirmModalData) return;

    // Clear previous logs and start fresh
    setProcessingLog([]);
    setCurrentProcessingStep("Initializing processing...");
    setIsProcessingAll(true);
    setProcessAllProgress({ current: 0, total: confirmModalData.orderIds.length });

    // Log what we're sending
    const logEntries = [
      `[START] Processing ${confirmModalData.orderIds.length} orders`,
      `[DATA] Sending ${confirmModalData.orders ? 'full order data' : 'only order IDs'}`,
      `[IDS] Order IDs: ${confirmModalData.orderIds.slice(0, 3).join(', ')}${confirmModalData.orderIds.length > 3 ? '...' : ''}`,
    ];

    if (confirmModalData.orders && confirmModalData.orders.length > 0) {
      const sampleOrder = confirmModalData.orders[0];
      logEntries.push(`[SAMPLE] First order: ${sampleOrder.shopifyOrderName || sampleOrder.id}`);
      logEntries.push(`[CUSTOMER] Has customer object: ${!!sampleOrder.customer}`);
      logEntries.push(`[CUSTOMER_ID] Has customerId field: ${!!sampleOrder.customerId && sampleOrder.customerId !== 'unknown'}`);
      if (sampleOrder.customer) {
        logEntries.push(`[SHOPIFY_ID] Customer Shopify ID: ${sampleOrder.customer.shopifyCustomerId || 'MISSING'}`);
      } else if (sampleOrder.customerId && sampleOrder.customerId !== 'unknown') {
        logEntries.push(`[CUSTOMER_ID] Order customerId: ${sampleOrder.customerId} (will be fetched on server)`);
      }
      logEntries.push(`[CASHBACK] Amount: ${sampleOrder.cashbackAmount || 0}`);
    }

    setProcessingLog(logEntries);

    // Submit batch processing request with full order data
    const submitData: Record<string, string> = {
      action: "process-all-cashback",
      orderIds: confirmModalData.orderIds.join(','),
      enableDebugLog: "true" // Enable server-side logging
    };
    if (confirmModalData.orders) {
      submitData.ordersData = JSON.stringify(confirmModalData.orders);
    }
    submit(submitData, { method: "post" });

    // Clear selection if processing selected orders
    if (confirmModalData.action === "process-selected" && clearSelection) {
      clearSelection();
    }

    // Close modal
    setShowConfirmModal(false);
    setConfirmModalData(null);
  }, [confirmModalData, submit, clearSelection]);

  // Handle confirmation modal cancel
  const handleCancelProcess = useCallback(() => {
    setShowConfirmModal(false);
    setConfirmModalData(null);
  }, []);

  // Pagination handlers
  const handlePreviousPage = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    const currentPage = pagination.page;
    if (currentPage > 1) {
      params.set("page", String(currentPage - 1));
      setSearchParams(params);
    }
  }, [searchParams, setSearchParams, pagination.page]);

  const handleNextPage = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    const currentPage = pagination.page;
    if (currentPage < pagination.totalPages) {
      params.set("page", String(currentPage + 1));
      setSearchParams(params);
    }
  }, [searchParams, setSearchParams, pagination]);

  // Show toast for action results (from fetcher)
  // Exclude internal data-fetching actions that don't need user feedback
  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as any;

      // Skip toast for internal data fetches (these are not user-facing actions)
      const internalActions = ['fetch-store-credit-balance'];
      if (data.action && internalActions.includes(data.action)) {
        return;
      }

      // Only show toast if there's a message or explicit success/failure
      if (data.message || data.success !== undefined) {
        const content = data.message || (data.success ? "Action completed" : "Action failed");
        const isError = data.failCount > 0 && data.successCount === 0 ? true : !data.success;
        if (isError) {
          showError(content);
        } else {
          showSuccess(content);
        }
      }
    }
  }, [fetcher.data, showSuccess, showError]);

  // Show toast for action results (from submit)
  useEffect(() => {
    if (actionData) {
      const data = actionData as any;

      // Handle debug log if present
      if (data.debugLog && Array.isArray(data.debugLog)) {
        setProcessingLog(prev => [...prev, ...data.debugLog]);
      }

      // Update processing status for batch operations
      if (data.successCount !== undefined || data.failCount !== undefined) {
        setCurrentProcessingStep(
          `Completed: ${data.successCount || 0} successful, ${data.failCount || 0} failed`
        );
      }

      // Show toast only if there's feedback to show
      // All user-facing actions should return a message
      if (data.message || data.success !== undefined || data.error) {
        const content = data.message || data.error || (data.success ? "Action completed" : "Action failed");
        const isError = data.error ? true : (data.failCount > 0 && data.successCount === 0 ? true : !data.success);
        if (isError) {
          showError(content);
        } else {
          showSuccess(content);
        }
      }

      // Reset processing state
      setIsProcessingAll(false);
      setProcessAllProgress({ current: 0, total: 0 });
    }
  }, [actionData, showSuccess, showError]);

  // Financial status badge
  const getFinancialStatusBadge = (status: string) => {
    const statusMap: Record<string, { tone: "success" | "warning" | "critical" | "info"; label: string }> = {
      PAID: { tone: "success", label: "Paid" },
      PARTIALLY_PAID: { tone: "warning", label: "Partially Paid" },
      PENDING: { tone: "warning", label: "Pending" },
      REFUNDED: { tone: "info", label: "Refunded" },
      PARTIALLY_REFUNDED: { tone: "info", label: "Partially Refunded" },
      VOIDED: { tone: "critical", label: "Voided" },
    };
    const config = statusMap[status] || { tone: "info", label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  // Cashback status badge
  const getCashbackStatusBadge = (order: Order) => {
    if (!order.cashbackAmount) {
      return <Badge tone="info">No Cashback</Badge>;
    }
    if (order.cashbackProcessed) {
      return <Badge tone="success">Processed</Badge>;
    }
    return <Badge tone="warning">Pending</Badge>;
  };

  // Table rows
  // Count qualifying cashback orders (orders that qualify for processing)
  const qualifyingOrdersCount = useMemo(() => {
    const qualifying = orders.filter(order => {
      const cashbackAmountNum = order.cashbackAmount ? Number(order.cashbackAmount) : 0;

      // More detailed customer detection (same as test page)
      const hasCustomer = !!(
        order.customer &&
        order.customer.id &&
        order.customer.id !== "unknown" &&
        order.customer.shopifyCustomerId // Also check for Shopify ID
      );

      // Alternative check: order has customerId that could be fetched
      // This handles cases where customer relation wasn't included but ID exists
      const hasCustomerId = !!(order.customerId && order.customerId !== "unknown");

      // Order qualifies if it has either a customer object OR a valid customerId
      const hasValidCustomer = hasCustomer || hasCustomerId;

      const hasPositiveCashback = cashbackAmountNum > 0;
      const isNotProcessed = !order.cashbackProcessed;

      // Debug logging
      if (cashbackAmountNum > 0) {
        console.log('Checking order for qualifying:', {
          orderId: order.id,
          cashbackProcessed: order.cashbackProcessed,
          cashbackAmount: cashbackAmountNum,
          hasValidCustomer,
          hasCustomer,
          customerId: order.customer?.id,
          customerShopifyId: order.customer?.shopifyCustomerId,
          isNotProcessed,
          qualifies: hasValidCustomer && hasPositiveCashback && isNotProcessed
        });
      }

      // Return true if order qualifies for processing
      return hasValidCustomer && hasPositiveCashback && isNotProcessed;
    });

    console.log(`Found ${qualifying.length} qualifying cashback orders out of ${orders.length} total`);
    return qualifying.length;
  }, [orders]);

  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row
      id={order.id}
      key={order.id}
      selected={selectedResources.includes(order.id)}
      position={index}
      onClick={() => handleViewOrder(order.id)}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span" fontWeight="semibold">
          {order.shopifyOrderName}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">{new Date(order.shopifyCreatedAt).toLocaleDateString()}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text variant="bodyMd" as="span">
            {order.customer ? order.customer.email : (order.email || 'Guest')}
          </Text>
          {order.customer?.currentTier && (
            <Badge tone="info">{order.customer.currentTier.name}</Badge>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="050">
          <Text variant="bodyMd" as="span">
            {formatCurrency(Number(order.totalPrice), shopSettings)}
          </Text>
          {order.cashbackAmount && Number(order.cashbackAmount) > 0 && (
            <Text variant="bodySm" as="span" tone="subdued">
              {formatCurrency(Number(order.cashbackAmount), shopSettings)} back ({order.cashbackPercent}%)
            </Text>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" wrap>
          {getFinancialStatusBadge(order.financialStatus)}
          {getCashbackStatusBadge(order)}
          {order.cashbackAmount && !order.cashbackProcessed && (
            <Button
              size="slim"
              variant="primary"
              onClick={(...args: unknown[]) => {
                (args[0] as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
                handleProcessCashback(order.id);
              }}
              loading={navigation.state === "submitting"}
            >
              Process
            </Button>
          )}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <>
      <Page
        title="Orders"
        subtitle="Manage orders and cashback processing"
        secondaryActions={[
          {
            content: qualifyingOrdersCount > 0
              ? `Process All (${qualifyingOrdersCount})`
              : "Process All",
            icon: CashDollarIcon,
            onAction: handleProcessAll,
            loading: isProcessingAll,
            disabled: qualifyingOrdersCount === 0,
          },
          {
            content: "Sync Orders",
            icon: RefreshIcon,
            onAction: handleSyncOrders,
            loading: navigation.state === "submitting" && !isProcessingAll,
          }
        ]}
      >
        <Layout>
          {/* Batch Processing Progress Banner */}
          {isProcessingAll && processAllProgress.total > 0 && (
            <Layout.Section>
              <Banner tone="info" icon={CashDollarIcon}>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Processing cashback for {processAllProgress.total} orders...
                  </Text>
                  <ProgressBar
                    progress={(processAllProgress.current / processAllProgress.total) * 100}
                    tone="highlight"
                    size="small"
                  />
                </BlockStack>
              </Banner>
            </Layout.Section>
          )}

          {/* Merged Orders Table with Search */}
          <Layout.Section>
            <Card padding="0">
              {/* Table header with title and page size */}
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" align="start" blockAlign="center">
                      <Text variant="headingMd" as="h2">
                        Orders
                      </Text>
                      <Badge>
                        {`${orders.length} of ${pagination.totalCount}`}
                      </Badge>
                      <Badge tone={shopSettings?.autoCashbackProcessingEnabled !== false ? "success" : "warning"}>
                        {shopSettings?.autoCashbackProcessingEnabled !== false ? "Auto Processing: On" : "Auto Processing: Off"}
                      </Badge>
                    </InlineStack>
                    <Select
                      label="Items per page"
                      labelHidden
                      options={[
                        { label: "25 per page", value: "25" },
                        { label: "50 per page", value: "50" },
                        { label: "100 per page", value: "100" },
                        { label: "200 per page", value: "200" },
                      ]}
                      value={selectedPageSize}
                      onChange={handlePageSizeChange}
                    />
                  </InlineStack>

                  {/* Search and Filters */}
                  <InlineStack gap="300" align="start" blockAlign="center">
                    <Box width="100%">
                      <TextField
                        label="Search orders"
                        labelHidden
                        placeholder="Search by order number or email"
                        value={queryValue}
                        onChange={handleSearch}
                        prefix={<Icon source={SearchIcon} />}
                        autoComplete="off"
                        clearButton
                        onClearButtonClick={() => handleSearch("")}
                      />
                    </Box>
                    <Select
                      label="Order status"
                      labelHidden
                      options={[
                        { label: "All Statuses", value: "all" },
                        { label: "Paid", value: "PAID" },
                        { label: "Pending", value: "PENDING" },
                        { label: "Partially Paid", value: "PARTIALLY_PAID" },
                        { label: "Refunded", value: "REFUNDED" },
                        { label: "Partially Refunded", value: "PARTIALLY_REFUNDED" },
                      ]}
                      value={statusFilter}
                      onChange={(value) => handleStatusFilter([value])}
                    />
                    <Select
                      label="Cashback status"
                      labelHidden
                      options={[
                        { label: "All Cashback", value: "all" },
                        { label: "Processed", value: "processed" },
                        { label: "Pending", value: "pending" },
                        { label: "Excluded", value: "excluded" },
                      ]}
                      value={cashbackFilter}
                      onChange={(value) => handleCashbackFilter([value])}
                    />
                    {(queryValue || statusFilter !== "all" || cashbackFilter !== "all") && (
                      <Button onClick={handleClearAll} variant="plain">
                        Clear all
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </Box>

              <Divider />

              {isLoading ? (
                <Box padding="400">
                  <BlockStack gap="300">
                    <SkeletonBodyText lines={10} />
                  </BlockStack>
                </Box>
              ) : orders.length === 0 ? (
                <EmptyState
                  heading="No orders found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Sync Orders from Shopify",
                    onAction: handleSyncOrders,
                  }}
                >
                  <p>
                    {queryValue || statusFilter !== "all" || cashbackFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Sync your orders from Shopify to get started"}
                  </p>
                </EmptyState>
              ) : (
                <>
                  <IndexTable
                    resourceName={{
                      singular: "order",
                      plural: "orders",
                    }}
                    itemCount={orders.length}
                    selectedItemsCount={
                      allResourcesSelected ? 'All' : selectedResources.length
                    }
                    onSelectionChange={handleSelectionChange}
                    bulkActions={bulkActions}
                    headings={[
                      { title: "Order" },
                      { title: "Date" },
                      { title: "Customer" },
                      { title: "Total" },
                      { title: "Status" },
                    ]}
                    selectable={true}
                  >
                    {rowMarkup}
                  </IndexTable>

                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <Box padding="400" borderBlockStartWidth="025" borderColor="border">
                      <BlockStack gap="300">
                        <InlineStack align="center" blockAlign="center" gap="400">
                          <Button
                            onClick={handlePreviousPage}
                            disabled={pagination.page === 1}
                            accessibilityLabel="Previous page"
                          >
                            Previous
                          </Button>

                          {/* Page number buttons */}
                          <InlineStack gap="200">
                            {(() => {
                              const currentPage = pagination.page;
                              const totalPages = pagination.totalPages;
                              const pageButtons = [];

                              // Always show first page
                              if (currentPage > 3) {
                                pageButtons.push(
                                  <Button
                                    key={1}
                                    variant="plain"
                                    size="slim"
                                    onClick={() => {
                                      const params = new URLSearchParams(searchParams);
                                      params.set("page", "1");
                                      setSearchParams(params);
                                    }}
                                  >
                                    1
                                  </Button>
                                );
                                if (currentPage > 4) {
                                  pageButtons.push(<Text key="dots1" as="span">...</Text>);
                                }
                              }

                              // Show pages around current page
                              for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
                                pageButtons.push(
                                  <Button
                                    key={i}
                                    variant={i === currentPage ? "primary" : "plain"}
                                    size="slim"
                                    onClick={() => {
                                      const params = new URLSearchParams(searchParams);
                                      params.set("page", i.toString());
                                      setSearchParams(params);
                                    }}
                                  >
                                    {`${i}`}
                                  </Button>
                                );
                              }

                              // Always show last page
                              if (currentPage < totalPages - 2) {
                                if (currentPage < totalPages - 3) {
                                  pageButtons.push(<Text key="dots2" as="span">...</Text>);
                                }
                                pageButtons.push(
                                  <Button
                                    key={totalPages}
                                    variant="plain"
                                    size="slim"
                                    onClick={() => {
                                      const params = new URLSearchParams(searchParams);
                                      params.set("page", totalPages.toString());
                                      setSearchParams(params);
                                    }}
                                  >
                                    {`${totalPages}`}
                                  </Button>
                                );
                              }

                              return pageButtons;
                            })()}
                          </InlineStack>

                          <Button
                            onClick={handleNextPage}
                            disabled={pagination.page === pagination.totalPages}
                            accessibilityLabel="Next page"
                          >
                            Next
                          </Button>
                        </InlineStack>

                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          Page {pagination.page} of {pagination.totalPages} •
                          Showing {((pagination.page - 1) * pagination.pageSize) + 1}-
                          {Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount} orders
                        </Text>
                      </BlockStack>
                    </Box>
                  )}
                </>
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {/* Order Detail Modal */}
        <Modal
          open={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Order ${selectedOrder?.shopifyOrderName || ""}`}
          primaryAction={{
            content: "Close",
            onAction: () => setIsDetailModalOpen(false),
          }}
          size="large"
        >
          {selectedOrder && (
            <Modal.Section>
              <BlockStack gap="600">
                {/* Order Summary */}
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Order Summary</Text>
                  <DescriptionList
                    items={[
                      {
                        term: "Order Number",
                        description: selectedOrder.shopifyOrderName,
                      },
                      {
                        term: "Date",
                        description: new Date(selectedOrder.shopifyCreatedAt).toLocaleString(),
                      },
                      {
                        term: "Customer",
                        description: selectedOrder.customer?.email || selectedOrder.email || 'Guest',
                      },
                      {
                        term: "Financial Status",
                        description: (
                          <Box>
                            {getFinancialStatusBadge(selectedOrder.financialStatus)}
                          </Box>
                        ),
                      },
                      {
                        term: "Total",
                        description: formatCurrency(Number(selectedOrder.totalPrice), shopSettings),
                      },
                      {
                        term: "Refunded",
                        description: formatCurrency(Number(selectedOrder.totalRefunded), shopSettings),
                      },
                      {
                        term: "Net Amount",
                        description: formatCurrency(Number(selectedOrder.netAmount), shopSettings),
                      },
                    ]}
                  />
                </BlockStack>

                <Divider />

                {/* Cashback Information */}
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Cashback Information</Text>
                  <DescriptionList
                    items={[
                      {
                        term: "Tier at Order",
                        description: selectedOrder.tierNameAtOrder || "No tier",
                      },
                      {
                        term: "Cashback Rate",
                        description: selectedOrder.cashbackPercent ? `${selectedOrder.cashbackPercent}%` : "N/A",
                      },
                      {
                        term: "Cashback Amount",
                        description: selectedOrder.cashbackAmount
                          ? formatCurrency(Number(selectedOrder.cashbackAmount), shopSettings)
                          : "No cashback",
                      },
                      {
                        term: "Status",
                        description: (
                          <Box>
                            {getCashbackStatusBadge(selectedOrder)}
                          </Box>
                        ),
                      },
                    ]}
                  />
                  {selectedOrder.cashbackAmount && !selectedOrder.cashbackProcessed && (
                    <Box>
                      <Button
                        variant="primary"
                        onClick={() => handleProcessCashback(selectedOrder.id)}
                        loading={navigation.state === "submitting"}
                      >
                        Process Cashback
                      </Button>
                    </Box>
                  )}
                </BlockStack>

                {/* Line Items */}
                {selectedOrder?.lineItems?.length > 0 && (
                  <BlockStack gap="400">
                    <Divider />
                    <Text variant="headingMd" as="h2">Line Items</Text>
                    <BlockStack gap="200">
                      {selectedOrder.lineItems?.map((item) => (
                        <InlineStack key={item.id} align="space-between">
                          <InlineStack gap="200">
                            <Text variant="bodyMd" as="span">{item.title}</Text>
                            {item.isTierProduct && (
                              <Badge tone="info">Tier Product</Badge>
                            )}
                          </InlineStack>
                          <Text variant="bodyMd" as="span">
                            {item.quantity} × {formatCurrency(Number(item.price), shopSettings)}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                )}

                {/* Refunds */}
                {selectedOrder?.refunds?.length > 0 && (
                  <BlockStack gap="400">
                    <Divider />
                    <Text variant="headingMd" as="h2">Refunds</Text>
                    <BlockStack gap="300">
                      {selectedOrder.refunds?.map((refund) => (
                        <Card key={refund.id}>
                          <Box padding="400">
                            <BlockStack gap="200">
                              <InlineStack align="space-between">
                                <Text variant="bodyMd" as="span">
                                  Refund Amount: {formatCurrency(Number(refund.amount), shopSettings)}
                                </Text>
                                <Text variant="bodySm" as="span" tone="subdued">
                                  {new Date(refund.shopifyCreatedAt).toLocaleDateString()}
                                </Text>
                              </InlineStack>
                              {refund.cashbackAdjustment && (
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" as="span">
                                    Cashback Adjustment: -{formatCurrency(Number(refund.cashbackAdjustment), shopSettings)}
                                  </Text>
                                  {!refund.cashbackProcessed ? (
                                    <Button
                                      size="slim"
                                      onClick={() => handleProcessRefund(selectedOrder.id, refund.id)}
                                    >
                                      Process Adjustment
                                    </Button>
                                  ) : (
                                    <Badge tone="success">Processed</Badge>
                                  )}
                                </InlineStack>
                              )}
                            </BlockStack>
                          </Box>
                        </Card>
                      ))}
                    </BlockStack>
                  </BlockStack>
                )}

                {/* Credit Ledger Entries */}
                {selectedOrder?.creditLedgerEntries?.length > 0 && (
                  <BlockStack gap="400">
                    <Divider />
                    <Text variant="headingMd" as="h2">Credit Ledger Entries</Text>
                    <BlockStack gap="200">
                      {selectedOrder.creditLedgerEntries?.map((entry) => (
                        <InlineStack key={entry.id} align="space-between">
                          <InlineStack gap="200">
                            <Badge tone={Number(entry.amount) > 0 ? "success" : "critical"}>
                              {entry.type.replace(/_/g, " ")}
                            </Badge>
                            <Text variant="bodySm" as="span" tone="subdued">
                              {new Date(entry.createdAt).toLocaleString()}
                            </Text>
                          </InlineStack>
                          <Text variant="bodyMd" as="span" fontWeight="semibold">
                            {Number(entry.amount) > 0 ? "+" : ""}
                            {formatCurrency(Number(entry.amount), shopSettings)}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Modal.Section>
          )}
        </Modal>

        {/* Cashback Processing Modal */}
        <Modal
          open={isCashbackModalOpen}
          onClose={() => {
            setIsCashbackModalOpen(false);
            setProcessingOrderId(null);
            setProcessingCustomer(null);
            setFetchingBalance(false);
          }}
          title="Add Store Credit"
          size="small"
        >
          <Modal.Section>
            {fetchingBalance ? (
              <BlockStack gap="400" align="center">
                <Spinner size="large" />
                <Text as="p" variant="bodyMd" tone="subdued">
                  Fetching current store credit balance...
                </Text>
              </BlockStack>
            ) : (
              processingCustomer && (
                <CreditAdjustmentForm
                  customer={{
                    id: processingCustomer.id,
                    email: processingCustomer.email,
                    storeCredit: processingCustomer.storeCredit
                  }}
                  type="add"
                  onSubmit={handleCashbackSubmit}
                  onCancel={() => {
                    setIsCashbackModalOpen(false);
                    setProcessingOrderId(null);
                    setProcessingCustomer(null);
                    setFetchingBalance(false);
                  }}
                  loading={isLoading}
                  shopSettings={shopSettings}
                  initialAmount={defaultCashbackAmount}
                  defaultReason="Loyalty reward"
                />
              )
            )}
          </Modal.Section>
        </Modal>

        {/* Processing Status Panel - Merchant Friendly */}
        {(processingLog.length > 0 || currentProcessingStep) && (
          <Modal
            open={true}
            onClose={() => {
              setProcessingLog([]);
              setCurrentProcessingStep("");
            }}
            title="Processing Status"
            size="large"
            sectioned
          >
            <Modal.Section>
              <BlockStack gap="400">
                {/* Current Status - Green for success, red for failures */}
                {currentProcessingStep && (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Status:
                      </Text>
                      <Badge tone={
                        currentProcessingStep.includes('failed') || currentProcessingStep.includes('Failed')
                          ? 'critical'
                          : currentProcessingStep.includes('Completed') || currentProcessingStep.includes('successful')
                            ? 'success'
                            : 'info'
                      }>
                        {currentProcessingStep}
                      </Badge>
                    </InlineStack>
                  </Box>
                )}

                {/* Progress Bar */}
                {isProcessingAll && processAllProgress.total > 0 && (
                  <Box>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Processing {processAllProgress.current} of {processAllProgress.total} orders
                    </Text>
                    <Box paddingBlockStart="200">
                      <ProgressBar
                        progress={(processAllProgress.current / processAllProgress.total) * 100}
                        tone="primary"
                      />
                    </Box>
                  </Box>
                )}

                {/* Activity Log - Merchant Friendly */}
                <Box
                  padding="300"
                  background="bg-surface"
                  borderRadius="200"
                  borderColor="border"
                  borderWidth="025"
                >
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Activity Log</Text>
                    <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                      <BlockStack gap="100">
                        {processingLog.map((log, index) => {
                          let tone: "base" | "success" | "critical" | "caution" | "subdued" = "subdued";
                          let icon = null;

                          // Convert technical log to merchant-friendly message
                          let friendlyMessage = log
                            .replace(/\[SERVER\]\s*/g, '')
                            .replace(/\[START\]\s*/g, '▶ ')
                            .replace(/\[COMPLETE\]\s*/g, '✓ ')
                            .replace(/\[SUCCESS\]\s*/g, '✓ ')
                            .replace(/\[ERROR\]\s*/g, '✗ ')
                            .replace(/\[FAIL\]\s*/g, '✗ ')
                            .replace(/\[SKIP\]\s*/g, '⊘ Skipped: ')
                            .replace(/\[WARNING\]\s*/g, '⚠ ')
                            .replace(/\[ORDER \d+\/\d+\]\s*/g, '• ')
                            .replace(/\[GRAPHQL\]\s*/g, '')
                            .replace(/\[API\]\s*/g, '')
                            .replace(/\[PARSE\]\s*/g, '')
                            .replace(/\[DATA\]\s*/g, '')
                            .replace(/\[IDS\]\s*/g, '')
                            .replace(/\[CHECK\]\s*/g, '')
                            .replace(/\[FETCH\]\s*/g, '')
                            .replace(/\[DEBUG\]\s*/g, '')
                            .replace(/\[CASHBACK\]\s*/g, 'Cashback: ')
                            .replace(/\[CUSTOMER\]\s*/g, '')
                            .replace(/\[CUSTOMER_ID\]\s*/g, '');

                          // Skip overly technical messages
                          if (friendlyMessage.includes('GID:') ||
                              friendlyMessage.includes('mutation') ||
                              friendlyMessage.includes('Response received') ||
                              friendlyMessage.includes('Has data:') ||
                              friendlyMessage.includes('Has errors:') ||
                              friendlyMessage.includes('User errors:') ||
                              friendlyMessage.includes('fetch result') ||
                              friendlyMessage.includes('customerId:') ||
                              friendlyMessage.includes('chars')) {
                            return null; // Skip technical messages
                          }

                          if (log.includes('[ERROR]') || log.includes('[FAIL]')) {
                            tone = "critical";
                            icon = <Icon source={AlertTriangleIcon} tone="critical" />;
                          } else if (log.includes('[SUCCESS]') || log.includes('[✓]') || log.includes('[COMPLETE]')) {
                            tone = "success";
                            icon = <Icon source={CheckCircleIcon} tone="success" />;
                          } else if (log.includes('[SKIP]') || log.includes('[WARNING]')) {
                            tone = "caution";
                            icon = <Icon source={InfoIcon} tone="caution" />;
                          } else if (log.includes('[START]')) {
                            icon = <Icon source={RefreshIcon} tone="info" />;
                          }

                          return (
                            <Box key={index} paddingBlock="050">
                              <InlineStack gap="200" align="start">
                                {icon && <Box>{icon}</Box>}
                                <Text
                                  as="span"
                                  variant="bodySm"
                                  tone={tone}
                                  breakWord
                                >
                                  {friendlyMessage}
                                </Text>
                              </InlineStack>
                            </Box>
                          );
                        }).filter(Boolean)}
                      </BlockStack>
                    </div>
                  </BlockStack>
                </Box>

                {/* Actions */}
                <InlineStack align="end" gap="200">
                  <Button
                    onClick={() => {
                      // Copy log to clipboard
                      const logText = processingLog.join('\n');
                      navigator.clipboard.writeText(logText).then(() => {
                        showSuccess("Activity log copied to clipboard");
                      });
                    }}
                  >
                    Copy Activity Log
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setProcessingLog([]);
                      setCurrentProcessingStep("");
                    }}
                  >
                    Close
                  </Button>
                </InlineStack>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}

        {/* Toast Notification */}
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={hideToast}
          />
        )}

        {/* Confirmation Modal */}
        <Modal
          open={showConfirmModal}
          onClose={handleCancelProcess}
          title={confirmModalData?.title || "Confirm Action"}
          primaryAction={{
            content: "Process",
            onAction: handleConfirmProcess,
            destructive: false,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: handleCancelProcess,
            },
          ]}
        >
          <Modal.Section>
            <Text as="p" variant="bodyMd">
              {confirmModalData?.message || "Are you sure you want to proceed?"}
            </Text>
            {confirmModalData && confirmModalData.orderIds.length > 0 && (
              <Box paddingBlockStart="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  This action will process {confirmModalData.orderIds.length} order{confirmModalData.orderIds.length !== 1 ? 's' : ''} and cannot be undone.
                </Text>
              </Box>
            )}
          </Modal.Section>
        </Modal>
      </Page>
    </>
  );
}
