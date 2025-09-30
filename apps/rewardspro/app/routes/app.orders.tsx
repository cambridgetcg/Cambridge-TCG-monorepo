import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher, useSearchParams } from "@remix-run/react";
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
} from "@shopify/polaris";
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

    return json({
      orders,
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
      case "process-cashback": {
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

          // Create ledger entry with Shopify transaction ID
          const ledgerId = uuidv4();
          const ledgerData: any = {
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
              shopifyTransactionId, // Store in metadata if field doesn't exist
            },
            createdAt: new Date(),
          };

          // Try to create with sync fields first
          try {
            await db.storeCreditLedger.create({
              data: {
                ...ledgerData,
                shopifyTransactionId,
                syncStatus: 'SYNCED',
                syncedAt: new Date()
              }
            });
          } catch (error: any) {
            // If columns don't exist, create without them
            if (error.message?.includes('column') && error.message?.includes('does not exist')) {
              console.log("[Orders] Sync fields not available in schema, storing in metadata");
              await db.storeCreditLedger.create({ data: ledgerData });
            } else {
              throw error; // Re-throw if it's a different error
            }
          }

          // Update customer balance to match Shopify
          await db.customer.update({
            where: { id: order.customerId },
            data: {
              storeCredit: newBalance,
              totalCashbackEarned: {
                increment: cashbackAmount,
              },
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

          const failedLedgerData: any = {
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
              syncStatus: 'FAILED', // Store in metadata if field doesn't exist
            },
            createdAt: new Date(),
          };

          // Try to create with sync field first
          try {
            await db.storeCreditLedger.create({
              data: {
                ...failedLedgerData,
                syncStatus: 'FAILED'
              }
            });
          } catch (error: any) {
            // If column doesn't exist, create without it
            if (error.message?.includes('column') && error.message?.includes('does not exist')) {
              console.log("[Orders] Sync fields not available in schema, storing status in metadata");
              await db.storeCreditLedger.create({ data: failedLedgerData });
            } else {
              throw error; // Re-throw if it's a different error
            }
          }

          // Update customer balance locally
          await db.customer.update({
            where: { id: order.customerId },
            data: {
              storeCredit: localNewBalance,
              totalCashbackEarned: {
                increment: cashbackAmount,
              },
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
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [toast, setToast] = useState<{ active: boolean; content: string; error?: boolean }>({
    active: false,
    content: "",
  });
  const [queryValue, setQueryValue] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [cashbackFilter, setCashbackFilter] = useState(searchParams.get("cashback") || "all");
  const [selectedPageSize, setSelectedPageSize] = useState(searchParams.get("pageSize") || "25");

  const isLoading = navigation.state === "loading" || navigation.state === "submitting";

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

  // Handle clear filters
  const handleClearAll = useCallback(() => {
    setQueryValue("");
    setStatusFilter("all");
    setCashbackFilter("all");
    setSelectedPageSize("25");
    setSearchParams({});
  }, [setSearchParams]);

  // Handle page size change
  const handlePageSizeChange = useCallback((value: string) => {
    setSelectedPageSize(value);
    const params = new URLSearchParams(searchParams);
    params.set("pageSize", value);
    params.set("page", "1"); // Reset to first page
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Process cashback for an order
  const handleProcessCashback = useCallback((orderId: string) => {
    submit(
      { action: "process-cashback", orderId },
      { method: "post" }
    );
  }, [submit]);

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

  // Open order detail modal
  const handleViewOrder = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setIsDetailModalOpen(true);
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

  // Show toast for action results
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
  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row
      id={order.id}
      key={order.id}
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
        primaryAction={{
          content: "Sync Orders",
          icon: RefreshIcon,
          onAction: handleSyncOrders,
          loading: navigation.state === "submitting",
        }}
      >
        <Layout>
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
                    selectable={false}
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

        {/* Toast Notification */}
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={() => setToast({ ...toast, active: false })}
          />
        )}
      </Page>
    </Frame>
  );
}