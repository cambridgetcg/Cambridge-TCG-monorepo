import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, Form, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  Text,
  Box,
  BlockStack,
  InlineStack,
  Divider,
  Badge,
  DataTable,
} from "@shopify/polaris";
import { useState } from "react";
import type { Decimal } from "@prisma/client/runtime/library";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return json({
    shop: session.shop,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const customerId = formData.get("customerId") as string;
  const shopifyCustomerId = formData.get("shopifyCustomerId") as string;

  try {
    let customer = null;

    // Build where clause for customer search
    const customerWhere: any = {
      shop: session.shop,
    };

    if (customerId) {
      customerWhere.id = customerId;
    } else if (shopifyCustomerId) {
      customerWhere.shopifyCustomerId = shopifyCustomerId;
    } else {
      return json({
        error: "Please provide either Customer ID or Shopify Customer ID",
        customer: null,
        orders: [],
        aggregateStats: null,
        rawData: null,
      });
    }

    // Find customer with tier info
    customer = await db.customer.findFirst({
      where: customerWhere,
      include: {
        currentTier: true,
      },
    });

    if (!customer) {
      return json({
        error: `Customer not found (searched for: ${customerId || shopifyCustomerId})`,
        customer: null,
        orders: [],
        aggregateStats: null,
        rawData: null,
      });
    }

    // Fetch all orders for this customer using the same pattern as orders page
    const orders = await db.order.findMany({
      where: {
        customerId: customer.id,
        shop: session.shop,
      },
      include: {
        lineItems: {
          take: 10, // Limit line items
        },
        creditLedgerEntries: {
          orderBy: { createdAt: 'desc' },
        },
        refunds: true,
      },
      orderBy: {
        shopifyCreatedAt: "desc",
      },
    });

    // Calculate aggregate stats - handle potential null/undefined
    let aggregateStats = null;
    try {
      const stats = await db.order.aggregate({
        where: {
          customerId: customer.id,
          shop: session.shop,
          financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
          cashbackEligible: true,
        },
        _sum: {
          totalPrice: true,
          totalRefunded: true,
          cashbackAmount: true,
        },
        _count: {
          id: true,
        },
      });

      // Convert Decimal to number for JSON serialization
      aggregateStats = {
        count: stats._count?.id || 0,
        totalPrice: stats._sum?.totalPrice ? Number(stats._sum.totalPrice) : 0,
        totalRefunded: stats._sum?.totalRefunded ? Number(stats._sum.totalRefunded) : 0,
        cashbackAmount: stats._sum?.cashbackAmount ? Number(stats._sum.cashbackAmount) : 0,
      };
    } catch (aggError) {
      console.error("[OrderViewer] Aggregate error:", aggError);
      aggregateStats = {
        count: 0,
        totalPrice: 0,
        totalRefunded: 0,
        cashbackAmount: 0,
      };
    }

    // Also get aggregate for ALL orders (not just eligible)
    let allOrdersStats = null;
    try {
      const allStats = await db.order.aggregate({
        where: {
          customerId: customer.id,
          shop: session.shop,
        },
        _sum: {
          totalPrice: true,
          totalRefunded: true,
          cashbackAmount: true,
        },
        _count: {
          id: true,
        },
      });

      allOrdersStats = {
        count: allStats._count?.id || 0,
        totalPrice: allStats._sum?.totalPrice ? Number(allStats._sum.totalPrice) : 0,
        totalRefunded: allStats._sum?.totalRefunded ? Number(allStats._sum.totalRefunded) : 0,
        cashbackAmount: allStats._sum?.cashbackAmount ? Number(allStats._sum.cashbackAmount) : 0,
      };
    } catch (err) {
      console.error("[OrderViewer] All orders aggregate error:", err);
    }

    // Serialize orders to handle Decimal types
    const serializedOrders = orders.map((order: any) => ({
      ...order,
      totalPrice: order.totalPrice ? Number(order.totalPrice) : 0,
      totalRefunded: order.totalRefunded ? Number(order.totalRefunded) : 0,
      netAmount: order.netAmount ? Number(order.netAmount) : 0,
      cashbackAmount: order.cashbackAmount ? Number(order.cashbackAmount) : null,
      lineItems: order.lineItems?.map((item: any) => ({
        ...item,
        price: item.price ? Number(item.price) : 0,
        totalPrice: item.totalPrice ? Number(item.totalPrice) : 0,
      })),
      creditLedgerEntries: order.creditLedgerEntries?.map((entry: any) => ({
        ...entry,
        amount: entry.amount ? Number(entry.amount) : 0,
        balance: entry.balance ? Number(entry.balance) : 0,
      })),
      refunds: order.refunds?.map((refund: any) => ({
        ...refund,
        amount: refund.amount ? Number(refund.amount) : 0,
        cashbackAdjustment: refund.cashbackAdjustment ? Number(refund.cashbackAdjustment) : null,
      })),
    }));

    // Serialize customer to handle Decimal
    const serializedCustomer = {
      ...customer,
      storeCredit: customer.storeCredit ? Number(customer.storeCredit) : 0,
      totalSpent: customer.totalSpent ? Number(customer.totalSpent) : 0,
      totalRefunded: customer.totalRefunded ? Number(customer.totalRefunded) : 0,
      totalCashbackEarned: customer.totalCashbackEarned ? Number(customer.totalCashbackEarned) : 0,
      netSpent: customer.netSpent ? Number(customer.netSpent) : 0,
    };

    return json({
      customer: serializedCustomer,
      orders: serializedOrders,
      aggregateStats,
      allOrdersStats,
      rawData: {
        customer: serializedCustomer,
        orders: serializedOrders,
        aggregateStats,
        allOrdersStats,
        orderCount: orders.length,
      },
      error: null,
    });
  } catch (error) {
    console.error("[OrderViewer] Error:", error);
    return json({
      error: error instanceof Error ? error.message : "Failed to fetch data",
      customer: null,
      orders: [],
      aggregateStats: null,
      allOrdersStats: null,
      rawData: null,
    });
  }
}

export default function OrderViewer() {
  const { shop } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();

  const [customerId, setCustomerId] = useState("");
  const [shopifyCustomerId, setShopifyCustomerId] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    if (customerId) formData.append("customerId", customerId);
    if (shopifyCustomerId) formData.append("shopifyCustomerId", shopifyCustomerId);
    submit(formData, { method: "post" });
  };

  const formatCurrency = (value: any) => {
    if (!value) return "$0.00";
    return `$${Number(value).toFixed(2)}`;
  };

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  };

  return (
    <Page
      title="Order Viewer"
      subtitle="Debug tool to view raw order data from local database"
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Search Customer
              </Text>

              <Form onSubmit={handleSubmit}>
                <BlockStack gap="400">
                  <TextField
                    label="Customer ID (Internal)"
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="e.g., 8554a5ba-991a-4f5d-a3cb-c37db5faab28"
                    autoComplete="off"
                  />

                  <TextField
                    label="Shopify Customer ID"
                    value={shopifyCustomerId}
                    onChange={setShopifyCustomerId}
                    placeholder="e.g., 9447525417299"
                    autoComplete="off"
                  />

                  <InlineStack gap="300">
                    <Button submit variant="primary">
                      Fetch Orders
                    </Button>
                    {actionData?.rawData && (
                      <Button onClick={() => setShowRaw(!showRaw)}>
                        {showRaw ? "Hide" : "Show"} Raw JSON
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData?.error && (
          <Layout.Section>
            <Card>
              <Text as="p" tone="critical">{actionData.error}</Text>
            </Card>
          </Layout.Section>
        )}

        {actionData?.customer && (
          <>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Customer Details
                  </Text>

                  <Box padding="200" background="bg-surface-secondary">
                    <BlockStack gap="200">
                      <InlineStack gap="400">
                        <Text as="span" fontWeight="semibold">ID:</Text>
                        <Text as="span">{actionData.customer.id}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text as="span" fontWeight="semibold">Shopify ID:</Text>
                        <Text as="span">{actionData.customer.shopifyCustomerId}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text as="span" fontWeight="semibold">Email:</Text>
                        <Text as="span">{actionData.customer.email}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text as="span" fontWeight="semibold">Current Tier:</Text>
                        <Text as="span">{actionData.customer.currentTierId || "None"}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text as="span" fontWeight="semibold">Store Credit:</Text>
                        <Text as="span">{formatCurrency(actionData.customer.storeCredit)}</Text>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Order Statistics
                  </Text>

                  <InlineStack gap="400" align="start">
                    <Box padding="300" background="bg-surface-secondary" width="50%">
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h3" fontWeight="semibold">
                          All Orders
                        </Text>
                        <Divider />
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Count:</Text>
                          <Text as="span">{actionData.allOrdersStats?.count || 0}</Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Total Spent:</Text>
                          <Text as="span">{formatCurrency(actionData.allOrdersStats?.totalPrice)}</Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Total Refunded:</Text>
                          <Text as="span">{formatCurrency(actionData.allOrdersStats?.totalRefunded)}</Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Total Cashback:</Text>
                          <Text as="span">{formatCurrency(actionData.allOrdersStats?.cashbackAmount)}</Text>
                        </InlineStack>
                      </BlockStack>
                    </Box>

                    <Box padding="300" background="bg-surface-success-subdued" width="50%">
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h3" fontWeight="semibold">
                          Eligible Orders Only
                        </Text>
                        <Divider />
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Count:</Text>
                          <Text as="span">{actionData.aggregateStats?.count || 0}</Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Total Spent:</Text>
                          <Text as="span">{formatCurrency(actionData.aggregateStats?.totalPrice)}</Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Total Refunded:</Text>
                          <Text as="span">{formatCurrency(actionData.aggregateStats?.totalRefunded)}</Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Total Cashback:</Text>
                          <Text as="span">{formatCurrency(actionData.aggregateStats?.cashbackAmount)}</Text>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Orders ({actionData.orders.length})
                  </Text>

                  {actionData.orders.map((order: any) => (
                    <Box
                      key={order.id}
                      padding="300"
                      background="bg-surface-secondary"
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="200"
                    >
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text variant="headingSm" as="h3">
                            {order.shopifyOrderName}
                          </Text>
                          <InlineStack gap="200">
                            <Badge
                              tone={order.financialStatus === "PAID" ? "success" : "warning"}
                            >
                              {order.financialStatus}
                            </Badge>
                            {order.cashbackEligible ? (
                              <Badge tone="success">Cashback Eligible</Badge>
                            ) : (
                              <Badge tone="critical">Not Eligible</Badge>
                            )}
                          </InlineStack>
                        </InlineStack>

                        <BlockStack gap="100">
                          <InlineStack gap="400">
                            <Text as="span" fontWeight="semibold">Order ID:</Text>
                            <Text as="span">{order.id}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text as="span" fontWeight="semibold">Shopify Order ID:</Text>
                            <Text as="span">{order.shopifyOrderId}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text as="span" fontWeight="semibold">Total:</Text>
                            <Text as="span">{formatCurrency(order.totalPrice)}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text as="span" fontWeight="semibold">Cashback Amount:</Text>
                            <Text as="span">{formatCurrency(order.cashbackAmount)}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text as="span" fontWeight="semibold">Cashback Processed:</Text>
                            <Text as="span">{order.cashbackProcessed ? "Yes" : "No"}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text as="span" fontWeight="semibold">Created At:</Text>
                            <Text as="span">{formatDate(order.shopifyCreatedAt)}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text as="span" fontWeight="semibold">Line Items:</Text>
                            <Text as="span">{order.lineItems?.length || 0}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>
            </Layout.Section>

            {showRaw && actionData.rawData && (
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">
                      Raw JSON Data
                    </Text>

                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="200"
                    >
                      <pre style={{
                        overflow: "auto",
                        fontSize: "12px",
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                        wordWrap: "break-word"
                      }}>
                        {JSON.stringify(actionData.rawData, null, 2)}
                      </pre>
                    </Box>
                  </BlockStack>
                </Card>
              </Layout.Section>
            )}
          </>
        )}
      </Layout>
    </Page>
  );
}