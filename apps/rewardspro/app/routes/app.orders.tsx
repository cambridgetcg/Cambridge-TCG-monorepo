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
  Tooltip,
  SkeletonBodyText,
  Toast,
  Frame,
  Filters,
  ChoiceList,
  RangeSlider,
  DatePicker,
  Popover,
  LegacyCard,
  Tabs,
  DescriptionList,
  Thumbnail,
  ButtonGroup,
  ActionList,
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
  ExportIcon,
  ImportIcon,
  CalendarIcon,
  ReceiptRefundIcon,
  OrderIcon,
  PersonIcon,
  ClockIcon,
  CheckIcon,
  XIcon,
  EditIcon,
  ViewIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import type { Decimal } from "@prisma/client/runtime/library";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Order {
  id: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  shopifyOrderName: string;
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
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session, admin } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const url = new URL(request.url);

    // Parse query parameters
    const searchQuery = url.searchParams.get("search") || "";
    const statusFilter = url.searchParams.get("status") || "all";
    const cashbackFilter = url.searchParams.get("cashback") || "all";
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "25");

    // Build where clause - handle search separately to avoid OR issues with Data API
    let whereClause: any = { shop };

    // Add status filter
    if (statusFilter !== "all") {
      whereClause.financialStatus = statusFilter;
    }

    // Add cashback filter
    if (cashbackFilter === "processed") {
      whereClause.cashbackProcessed = true;
    } else if (cashbackFilter === "pending") {
      whereClause.cashbackProcessed = false;
      whereClause.cashbackAmount = { not: null };
    } else if (cashbackFilter === "excluded") {
      whereClause.cashbackEligible = false;
    }

    // If there's a search query, fetch all orders and filter in memory
    // This is a workaround for Data API limitations with OR queries
    let ordersQuery;
    if (searchQuery) {
      // Fetch all orders for the shop first, then filter
      const allOrders = await db.order.findMany({
        where: whereClause,
        include: {
          customer: {
            include: {
              currentTier: true,
            },
          },
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

      // Filter in memory (order number and email only)
      const searchLower = searchQuery.toLowerCase();
      const filteredOrders = allOrders.filter(order =>
        order.shopifyOrderNumber?.toLowerCase().includes(searchLower) ||
        order.email?.toLowerCase().includes(searchLower)
      );

      // Apply pagination
      ordersQuery = filteredOrders.slice((page - 1) * pageSize, page * pageSize);
      var filteredTotalCount = filteredOrders.length;
    } else {
      // No search, use normal pagination
      ordersQuery = await db.order.findMany({
        where: whereClause,
        include: {
          customer: {
            include: {
              currentTier: true,
            },
          },
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
      var filteredTotalCount = await db.order.count({ where: whereClause });
    }

    // Fetch shop settings
    const [orders, totalCount, shopSettings] = await Promise.all([
      Promise.resolve(ordersQuery),
      Promise.resolve(filteredTotalCount),
      db.shopSettings.findUnique({ where: { shop } }),
    ]);

    // Calculate stats
    const allOrders = await db.order.findMany({
      where: { shop },
      select: {
        cashbackAmount: true,
        cashbackProcessed: true,
        totalRefunded: true,
      },
    });

    const stats = {
      totalOrders: allOrders.length,
      totalCashback: allOrders.reduce((sum, o) =>
        sum + (o.cashbackAmount ? Number(o.cashbackAmount) : 0), 0
      ),
      pendingCashback: allOrders
        .filter(o => o.cashbackAmount && !o.cashbackProcessed)
        .reduce((sum, o) => sum + Number(o.cashbackAmount), 0),
      processedCashback: allOrders
        .filter(o => o.cashbackAmount && o.cashbackProcessed)
        .reduce((sum, o) => sum + Number(o.cashbackAmount), 0),
      totalRefunded: allOrders.reduce((sum, o) =>
        sum + Number(o.totalRefunded), 0
      ),
    };

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / pageSize);

    // Serialize orders to ensure Decimal values are converted to numbers
    const serializedOrders = orders.map(order => {
      const cashbackAmountNumber = order.cashbackAmount ? Number(order.cashbackAmount) : null;
      return {
        ...order,
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
        creditLedgerEntries: order.creditLedgerEntries?.map(entry => ({
          ...entry,
          amount: entry.amount ? parseFloat(entry.amount.toString()) : 0,
          balance: entry.balance ? parseFloat(entry.balance.toString()) : 0
        }))
      };
    });

    return json({
      orders: serializedOrders,
      stats,
      shopSettings,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalCount,
      },
    });
  } catch (error) {
    console.error("Error loading orders:", error);
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
          const customer = await db.customer.findFirst({
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

          const responseJson = await response.json();

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
          await db.customer.update({
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

        // Fetch order with customer
        const order = await db.order.findFirst({
          where: { id: orderId, shop },
        });

        if (!order) {
          throw new Error("Order not found");
        }

        // Fetch customer separately
        const customer = order.customerId !== "unknown"
          ? await db.customer.findUnique({
              where: { id: order.customerId }
            })
          : null;

        if (!customer || !customer.shopifyCustomerId) {
          throw new Error("Customer not found or missing Shopify ID");
        }

        if (order.cashbackProcessed) {
          throw new Error("Cashback already processed");
        }

        // Get shop settings for currency
        const shopSettings = await db.shopSettings.findUnique({
          where: { shop }
        });

        const currency = shopSettings?.storeCurrency || order.currency || "USD";
        const gidCustomerId = `gid://shopify/Customer/${customer.shopifyCustomerId}`;

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
          const existingLedger = await db.storeCreditLedger.findFirst({
            where: {
              shop,
              shopifyOrderId: order.shopifyOrderId,
              type: 'CASHBACK_EARNED'
            }
          });

          if (!existingLedger) {
            // Create ledger entry
            await db.storeCreditLedger.create({
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
          await db.customer.update({
            where: { id: order.customerId },
            data: {
              storeCredit: newBalance,
              totalCashbackEarned: currentTotalCashback + amount,
              updatedAt: new Date(),
            },
          });

          // Mark order as processed
          await db.order.update({
            where: { id: orderId },
            data: {
              cashbackProcessed: true,
              cashbackAmount: amount, // Update to actual amount issued
              processedAt: new Date(),
              updatedAt: new Date(),
            },
          });

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

        // Fetch order with customer
        const order = await db.order.findFirst({
          where: { id: orderId, shop },
        });

        if (!order) {
          throw new Error("Order not found");
        }

        // Fetch customer separately
        const customer = order.customerId !== "unknown"
          ? await db.customer.findUnique({
              where: { id: order.customerId }
            })
          : null;

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
        const shopSettings = await db.shopSettings.findUnique({
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
          const existingLedger = await db.storeCreditLedger.findFirst({
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
            await db.storeCreditLedger.create({
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
          await db.customer.update({
            where: { id: order.customerId },
            data: {
              storeCredit: newBalance,
              totalCashbackEarned: currentTotalCashback + cashbackAmount,
              updatedAt: new Date(),
            },
          });

          // Mark order as processed
          await db.order.update({
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
          const existingFailedLedger = await db.storeCreditLedger.findFirst({
            where: {
              shop,
              shopifyOrderId: order.shopifyOrderId,
              type: 'CASHBACK_EARNED'
            }
          });

          if (!existingFailedLedger) {
            // Create failed ledger entry - store sync info in metadata
            // to avoid column missing errors in Aurora Data API
            await db.storeCreditLedger.create({
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
          await db.customer.update({
            where: { id: order.customerId },
            data: {
              storeCredit: localNewBalance,
              totalCashbackEarned: currentTotalCashbackLocal + cashbackAmount,
              updatedAt: new Date(),
            },
          });

          // Mark order as processed even if Shopify sync failed
          await db.order.update({
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
        const refund = await db.orderRefund.findFirst({
          where: { id: refundId, orderId },
        });

        if (!refund) {
          throw new Error("Refund not found");
        }

        // Verify order belongs to shop
        const refundOrder = await db.order.findFirst({
          where: { id: refund.orderId, shop },
        });

        if (!refundOrder) {
          throw new Error("Order not found or unauthorized");
        }

        // Fetch customer if needed
        const refundCustomer = refundOrder.customerId !== "unknown"
          ? await db.customer.findUnique({
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
        await db.storeCreditLedger.create({
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
        await db.customer.update({
          where: { id: refundOrder.customerId },
          data: {
            storeCredit: newBalance,
            updatedAt: new Date(),
          },
        });

        // Mark refund as processed
        await db.orderRefund.update({
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

        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        for (const orderId of orderIds) {
          try {
            // Fetch order with customer
            const order = await db.order.findFirst({
              where: { id: orderId, shop },
              include: { customer: true }
            });

            if (!order) {
              failCount++;
              errors.push(`Order ${orderId} not found`);
              continue;
            }

            if (!order.customer || !order.customer.shopifyCustomerId) {
              failCount++;
              errors.push(`Order ${order.shopifyOrderId}: No customer or Shopify ID`);
              continue;
            }

            const amount = order.cashbackAmount ? Number(order.cashbackAmount) : 0;
            if (amount <= 0) {
              failCount++;
              errors.push(`Order ${order.shopifyOrderId}: Invalid cashback amount`);
              continue;
            }

            // Add store credit through Shopify API
            const result = await addStoreCredit(
              admin,
              order.customer.shopifyCustomerId,
              amount,
              order.currency || 'USD',
              `Loyalty reward - Order ${order.shopifyOrderId}`
            );

            if (!result.success) {
              failCount++;
              errors.push(`Order ${order.shopifyOrderId}: ${result.error}`);
              continue;
            }

            const newBalance = result.balance || (parseFloat(order.customer.storeCredit.toString()) + amount);

            // Get current totalCashbackEarned to calculate new value
            const currentTotalCashback = order.customer.totalCashbackEarned
              ? parseFloat(order.customer.totalCashbackEarned.toString())
              : 0;

            // Update customer balance
            await db.customer.update({
              where: { id: order.customer.id },
              data: {
                storeCredit: newBalance,
                totalCashbackEarned: currentTotalCashback + amount,
                updatedAt: new Date(),
              },
            });

            // Check if ledger entry already exists
            const existingLedger = await db.storeCreditLedger.findFirst({
              where: {
                shop,
                shopifyOrderId: order.shopifyOrderId,
                type: 'CASHBACK_EARNED'
              }
            });

            if (!existingLedger) {
              // Create ledger entry
              await db.storeCreditLedger.create({
                data: {
                  id: uuidv4(),
                  shop,
                  customerId: order.customer.id,
                  amount: amount,
                  balance: newBalance,
                  type: 'CASHBACK_EARNED',
                  description: `Loyalty reward - Order ${order.shopifyOrderId}`,
                  shopifyOrderId: order.shopifyOrderId,
                  metadata: {
                    processedBy: "batch",
                    syncStatus: result.shopifyTransactionId ? "synced" : "pending",
                    syncedAt: result.shopifyTransactionId ? new Date().toISOString() : null,
                    shopifyTransactionId: result.shopifyTransactionId || null
                  },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              });
            }

            // Update order status
            await db.order.update({
              where: { id: orderId },
              data: {
                cashbackProcessed: true, // Mark as processed
                cashbackProcessedAt: new Date(),
                updatedAt: new Date(),
              },
            });

            successCount++;
          } catch (error) {
            failCount++;
            console.error(`Failed to process order ${orderId}:`, error);
            errors.push(`Order ${orderId}: ${error.message}`);
          }
        }

        // Return summary
        return json({
          success: failCount === 0,
          message: `Processed ${successCount} orders successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
          successCount,
          failCount,
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined // Show first 5 errors
        });
      }

      case "sync-orders": {
        // Import the sync service dynamically
        const { OrderSyncService } = await import("../services/order-sync.service");

        const syncService = new OrderSyncService(admin, {
          shop,
          batchSize: 50,
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        });

        // Start sync in background (in production, use a queue)
        syncService.syncAllOrders().catch(console.error);

        return json({
          success: true,
          message: "Order sync started. This may take a few minutes."
        });
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
  const { orders, stats, shopSettings, pagination } = useLoaderData<LoaderData>();
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
  const [toast, setToast] = useState<{ active: boolean; content: string; error?: boolean }>({
    active: false,
    content: "",
  });
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
    action: "process-qualifying" | "process-selected";
  } | null>(null);

  const isLoading = navigation.state === "loading" || navigation.state === "submitting";

  // Handle fetcher response for store credit balance
  useEffect(() => {
    if (fetcher.data && fetcher.data.action === "fetch-store-credit-balance") {
      if (fetcher.data.success && processingCustomer) {
        // Update the customer's store credit with the fetched balance
        setProcessingCustomer({
          ...processingCustomer,
          storeCredit: fetcher.data.balance || 0
        });
        setFetchingBalance(false);
        setIsCashbackModalOpen(true);
      } else if (fetcher.data.error) {
        // If fetch failed, use existing balance and show modal
        setFetchingBalance(false);
        setIsCashbackModalOpen(true);
      }
    }
  }, [fetcher.data, processingCustomer]);

  // Handle response from processing all cashback
  useEffect(() => {
    if (actionData?.successCount !== undefined || actionData?.failCount !== undefined) {
      // Reset processing state
      setIsProcessingAll(false);
      setProcessAllProgress({ current: 0, total: 0 });

      // Show result toast
      if (actionData.message) {
        setToast({
          active: true,
          content: actionData.message,
          error: actionData.failCount > 0
        });
      }
    }
  }, [actionData]);

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
    useIndexResourceState(orders);

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
      // Alternative check using customerId field directly (from test page)
      const hasCustomerId = !!(order.customerId && order.customerId !== "unknown");
      // Use either check for customer validity (same as test page)
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
          setToast({
            active: true,
            content: 'Export functionality coming soon',
            error: false
          });
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
      setToast({
        active: true,
        content: 'Order not found',
        error: true
      });
      return;
    }

    // If customer object not directly available, check if we have customerId
    if (!order.customer && order.customerId === "unknown") {
      setToast({
        active: true,
        content: 'This order has no associated customer',
        error: true
      });
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
      setToast({
        active: true,
        content: 'Customer information not available for this order',
        error: true
      });
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

  // Process qualifying orders (replaces Process All Pending)
  const handleProcessQualifying = useCallback(() => {
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

      // Alternative check using customerId field directly (from test page)
      const hasCustomerId = !!(order.customerId && order.customerId !== "unknown");

      // Use either check for customer validity (same as test page)
      const hasValidCustomer = hasCustomer || hasCustomerId;

      const hasPositiveCashback = cashbackAmountNum > 0;
      const isNotProcessed = !order.cashbackProcessed;

      return hasValidCustomer && hasPositiveCashback && isNotProcessed;
    });

    if (qualifyingOrders.length === 0) {
      setToast({
        active: true,
        content: 'No qualifying orders to process',
        error: false
      });
      return;
    }

    // Show confirmation modal
    setConfirmModalData({
      title: "Process Qualifying Orders",
      message: `Are you sure you want to process cashback for ${qualifyingOrders.length} qualifying order${qualifyingOrders.length > 1 ? 's' : ''}?`,
      orderIds: qualifyingOrders.map(o => o.id),
      action: "process-qualifying"
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

    setIsProcessingAll(true);
    setProcessAllProgress({ current: 0, total: confirmModalData.orderIds.length });

    // Submit batch processing request
    submit(
      {
        action: "process-all-cashback",
        orderIds: confirmModalData.orderIds.join(',')
      },
      { method: "post" }
    );

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
  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as any;
      setToast({
        active: true,
        content: data.message || (data.success ? "Action completed" : "Action failed"),
        error: !data.success,
      });
    }
  }, [fetcher.data]);

  // Show toast for action results (from submit)
  useEffect(() => {
    if (actionData) {
      const data = actionData as any;
      setToast({
        active: true,
        content: data.message || (data.success ? "Action completed" : "Action failed"),
        error: !data.success,
      });
    }
  }, [actionData]);

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

      // Alternative check using customerId field directly (from test page)
      const hasCustomerId = !!(order.customerId && order.customerId !== "unknown");

      // Use either check for customer validity (same as test page)
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
        <Text variant="bodyMd" as="span">
          {formatCurrency(Number(order.totalPrice), shopSettings)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text variant="bodyMd" as="span">
            {order.cashbackAmount
              ? formatCurrency(Number(order.cashbackAmount), shopSettings)
              : "-"
            }
          </Text>
          {order.cashbackPercent && (
            <Text variant="bodySm" as="span" tone="subdued">
              {order.cashbackPercent}%
            </Text>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {getFinancialStatusBadge(order.financialStatus)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {getCashbackStatusBadge(order)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <ButtonGroup>
          <Button size="slim" onClick={() => handleViewOrder(order.id)}>
            View
          </Button>
          {order.cashbackAmount && !order.cashbackProcessed && (
            <Button
              size="slim"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                handleProcessCashback(order.id);
              }}
              loading={navigation.state === "submitting"}
            >
              Process
            </Button>
          )}
        </ButtonGroup>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Frame>
      <Page
        title="Orders"
        subtitle="Manage orders and cashback processing"
        secondaryActions={[
          {
            content: qualifyingOrdersCount > 0
              ? `Process Qualifying (${qualifyingOrdersCount})`
              : "Process Qualifying",
            icon: CashDollarIcon,
            onAction: handleProcessQualifying,
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
                    tone="emphasis"
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
                      <Text variant="headingMd" as="h3">
                        Orders
                      </Text>
                      <Badge>
                        {`${orders.length} of ${pagination.totalCount}`}
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
                        label=""
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
                      label=""
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
                      label=""
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
                      { title: "Cashback" },
                      { title: "Status" },
                      { title: "Cashback Status" },
                      { title: "Actions" },
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
                                    {i}
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
                                    {totalPages}
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
          large
        >
          {selectedOrder && (
            <Modal.Section>
              <BlockStack gap="600">
                {/* Order Summary */}
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Order Summary</Text>
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
                  <Text variant="headingMd" as="h3">Cashback Information</Text>
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

                <Divider />

                {/* Line Items */}
                {selectedOrder?.lineItems?.length > 0 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Line Items</Text>
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

                <Divider />

                {/* Refunds */}
                {selectedOrder?.refunds?.length > 0 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Refunds</Text>
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

                <Divider />

                {/* Credit Ledger Entries */}
                {selectedOrder?.creditLedgerEntries?.length > 0 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Credit Ledger Entries</Text>
                    <BlockStack gap="200">
                      {selectedOrder.creditLedgerEntries?.map((entry) => (
                        <InlineStack key={entry.id} align="space-between">
                          <InlineStack gap="200">
                            <Badge tone={entry.amount > 0 ? "success" : "critical"}>
                              {entry.type.replace(/_/g, " ")}
                            </Badge>
                            <Text variant="bodySm" as="span" tone="subdued">
                              {new Date(entry.createdAt).toLocaleString()}
                            </Text>
                          </InlineStack>
                          <Text variant="bodyMd" fontWeight="semibold">
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

        {/* Toast Notification */}
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={() => setToast({ ...toast, active: false })}
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
    </Frame>
  );
}