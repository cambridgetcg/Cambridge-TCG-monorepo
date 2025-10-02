import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  DataTable,
  Box,
  Divider,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";

interface OrderData {
  id: string;
  shopifyOrderId: string;
  customerEmail: string | null;
  customerId: string | null;
  cashbackAmount: number;
  cashbackProcessed: boolean;
  cashbackEligible: boolean;
  financialStatus: string;
  totalPrice: number;
  createdAt: string;
  // Diagnostic fields
  hasCustomer: boolean;
  hasPositiveCashback: boolean;
  isNotProcessed: boolean;
  qualifiesForProcessing: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;

  // Fetch all orders with cashback
  const orders = await db.order.findMany({
    where: {
      shop,
      cashbackAmount: { not: null },
    },
    include: {
      customer: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Process orders for diagnostic display
  const processedOrders: OrderData[] = orders.map(order => {
    const cashbackAmountNum = order.cashbackAmount ? Number(order.cashbackAmount) : 0;
    const hasCustomer = !!order.customer && order.customer.id !== "unknown";
    const hasPositiveCashback = cashbackAmountNum > 0;
    const isNotProcessed = !order.cashbackProcessed;
    const qualifiesForProcessing = hasCustomer && hasPositiveCashback && isNotProcessed;

    return {
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      customerEmail: order.customer?.email || null,
      customerId: order.customerId || null,
      cashbackAmount: cashbackAmountNum,
      cashbackProcessed: order.cashbackProcessed,
      cashbackEligible: order.cashbackEligible,
      financialStatus: order.financialStatus,
      totalPrice: order.totalPrice ? Number(order.totalPrice) : 0,
      createdAt: order.createdAt.toISOString(),
      // Diagnostic fields
      hasCustomer,
      hasPositiveCashback,
      isNotProcessed,
      qualifiesForProcessing,
    };
  });

  // Calculate stats
  const stats = {
    totalOrders: processedOrders.length,
    totalWithCashback: processedOrders.filter(o => o.cashbackAmount > 0).length,
    processedCount: processedOrders.filter(o => o.cashbackProcessed).length,
    notProcessedCount: processedOrders.filter(o => !o.cashbackProcessed).length,
    qualifyingCount: processedOrders.filter(o => o.qualifiesForProcessing).length,
    // Breakdown of why orders don't qualify
    noCustomer: processedOrders.filter(o => !o.hasCustomer && o.hasPositiveCashback && o.isNotProcessed).length,
    noCashback: processedOrders.filter(o => o.hasCustomer && !o.hasPositiveCashback && o.isNotProcessed).length,
    alreadyProcessed: processedOrders.filter(o => o.hasCustomer && o.hasPositiveCashback && !o.isNotProcessed).length,
  };

  // Get shop settings for currency
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop }
  });

  return json({
    orders: processedOrders,
    stats,
    shopSettings: {
      storeCurrency: shopSettings?.storeCurrency || "USD",
      currencyDisplayType: shopSettings?.currencyDisplayType || "SYMBOL",
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action") as string;

  if (action === "process-test") {
    const orderIds = (formData.get("orderIds") as string).split(',');

    return json({
      success: true,
      message: `Would process ${orderIds.length} orders`,
      orderIds,
    });
  }

  return json({ error: "Unknown action" });
};

export default function TestPendingOrders() {
  const { orders, stats, shopSettings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const [selectedFilter, setSelectedFilter] = useState<"all" | "qualifying" | "not-qualifying">("all");

  const isLoading = navigation.state === "submitting";

  // Filter orders based on selection
  const filteredOrders = orders.filter(order => {
    if (selectedFilter === "qualifying") return order.qualifiesForProcessing;
    if (selectedFilter === "not-qualifying") return !order.qualifiesForProcessing;
    return true;
  });

  const handleProcessQualifying = () => {
    const qualifyingOrders = orders.filter(o => o.qualifiesForProcessing);
    if (qualifyingOrders.length === 0) {
      alert("No qualifying orders to process");
      return;
    }

    if (confirm(`Process ${qualifyingOrders.length} qualifying orders?`)) {
      submit(
        {
          action: "process-test",
          orderIds: qualifyingOrders.map(o => o.id).join(','),
        },
        { method: "post" }
      );
    }
  };

  const tableData = filteredOrders.map(order => [
    order.shopifyOrderId,
    order.customerEmail || "N/A",
    order.customerId || "N/A",
    formatCurrency(order.cashbackAmount, shopSettings as any),
    order.cashbackProcessed ? "✅ Yes" : "❌ No",
    order.hasCustomer ? "✅" : "❌",
    order.hasPositiveCashback ? "✅" : "❌",
    order.isNotProcessed ? "✅" : "❌",
    order.qualifiesForProcessing ? "✅ QUALIFIES" : "❌ NO",
  ]);

  return (
    <Page
      title="Test: Pending Orders Diagnostic"
      subtitle="Debug why Process All Pending button isn't working"
      primaryAction={{
        content: `Process Qualifying (${stats.qualifyingCount})`,
        onAction: handleProcessQualifying,
        loading: isLoading,
        disabled: stats.qualifyingCount === 0,
      }}
      backAction={{ content: "Orders", url: "/app/orders" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData && "message" in actionData && (
              <Banner tone="success">
                <p>{actionData.message}</p>
                {actionData.orderIds && (
                  <details>
                    <summary>Order IDs</summary>
                    <pre>{JSON.stringify(actionData.orderIds, null, 2)}</pre>
                  </details>
                )}
              </Banner>
            )}

            {/* Statistics Card */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Order Statistics</Text>
                <Divider />
                <InlineStack gap="800" wrap>
                  <Box>
                    <Text as="p" variant="bodyMd" tone="subdued">Total Orders with Cashback</Text>
                    <Text as="p" variant="headingLg">{stats.totalOrders}</Text>
                  </Box>
                  <Box>
                    <Text as="p" variant="bodyMd" tone="subdued">Already Processed</Text>
                    <Text as="p" variant="headingLg" fontWeight="semibold">
                      {stats.processedCount}
                    </Text>
                  </Box>
                  <Box>
                    <Text as="p" variant="bodyMd" tone="subdued">Not Processed</Text>
                    <Text as="p" variant="headingLg" fontWeight="semibold">
                      {stats.notProcessedCount}
                    </Text>
                  </Box>
                  <Box>
                    <Text as="p" variant="bodyMd" tone="success">Qualifying for Processing</Text>
                    <Text as="p" variant="headingLg" fontWeight="bold">
                      {stats.qualifyingCount}
                    </Text>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Breakdown Card */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Why Orders Don't Qualify</Text>
                <Divider />
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodyMd">Missing Customer</Text>
                    <Badge tone="critical">{stats.noCustomer}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodyMd">No Cashback Amount</Text>
                    <Badge tone="warning">{stats.noCashback}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodyMd">Already Processed</Text>
                    <Badge tone="info">{stats.alreadyProcessed}</Badge>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Processing Logic Explanation */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Processing Logic</Text>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    An order qualifies for processing if ALL of these conditions are met:
                  </Text>
                  <Box paddingInlineStart="400">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd">✅ Has a valid customer (not "unknown")</Text>
                      <Text as="p" variant="bodyMd">✅ Has positive cashback amount ({">"} 0)</Text>
                      <Text as="p" variant="bodyMd">✅ Is not already processed (cashbackProcessed = false)</Text>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Filter Controls */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" align="space-between">
                  <Text as="h2" variant="headingMd">Order Details</Text>
                  <InlineStack gap="200">
                    <Button
                      variant={selectedFilter === "all" ? "primary" : "secondary"}
                      onClick={() => setSelectedFilter("all")}
                    >
                      All ({orders.length})
                    </Button>
                    <Button
                      variant={selectedFilter === "qualifying" ? "primary" : "secondary"}
                      onClick={() => setSelectedFilter("qualifying")}
                    >
                      Qualifying ({stats.qualifyingCount})
                    </Button>
                    <Button
                      variant={selectedFilter === "not-qualifying" ? "primary" : "secondary"}
                      onClick={() => setSelectedFilter("not-qualifying")}
                    >
                      Not Qualifying ({orders.length - stats.qualifyingCount})
                    </Button>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Orders Table */}
            <Card>
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "numeric",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                ]}
                headings={[
                  "Order ID",
                  "Customer Email",
                  "Customer ID",
                  "Cashback",
                  "Processed?",
                  "Has Customer?",
                  "Has Cashback?",
                  "Not Processed?",
                  "QUALIFIES?",
                ]}
                rows={tableData}
                footerContent={`Showing ${filteredOrders.length} of ${orders.length} orders`}
              />
            </Card>

            {/* Debug JSON */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Debug: Sample Order Data (First 3)</Text>
                <Box padding="200" background="bg-surface-secondary">
                  <pre style={{ overflow: "auto", fontSize: "12px" }}>
                    {JSON.stringify(orders.slice(0, 3), null, 2)}
                  </pre>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}