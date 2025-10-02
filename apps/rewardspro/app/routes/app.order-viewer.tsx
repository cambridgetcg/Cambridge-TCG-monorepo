import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "@remix-run/react";
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

    // Find customer by either ID or Shopify ID
    if (customerId) {
      customer = await db.customer.findFirst({
        where: {
          id: customerId,
          shop: session.shop,
        },
      });
    } else if (shopifyCustomerId) {
      customer = await db.customer.findFirst({
        where: {
          shopifyCustomerId: shopifyCustomerId,
          shop: session.shop,
        },
      });
    }

    if (!customer) {
      return json({
        error: "Customer not found",
        customer: null,
        orders: [],
        rawData: null,
      });
    }

    // Fetch all orders for this customer
    const orders = await db.order.findMany({
      where: {
        customerId: customer.id,
        shop: session.shop,
      },
      orderBy: {
        shopifyCreatedAt: "desc",
      },
      include: {
        lineItems: true,
      },
    });

    // Calculate aggregate stats
    const aggregateStats = await db.order.aggregate({
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

    return json({
      customer,
      orders,
      aggregateStats,
      rawData: {
        customer,
        orders,
        aggregateStats,
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
      rawData: null,
    });
  }
}

export default function OrderViewer() {
  const { shop } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const actionData = useLoaderData<typeof action>();

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
              <Text tone="critical">{actionData.error}</Text>
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
                        <Text fontWeight="semibold">ID:</Text>
                        <Text>{actionData.customer.id}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text fontWeight="semibold">Shopify ID:</Text>
                        <Text>{actionData.customer.shopifyCustomerId}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text fontWeight="semibold">Email:</Text>
                        <Text>{actionData.customer.email}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text fontWeight="semibold">Current Tier:</Text>
                        <Text>{actionData.customer.currentTierId || "None"}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text fontWeight="semibold">Store Credit:</Text>
                        <Text>{formatCurrency(actionData.customer.storeCredit)}</Text>
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
                    Aggregate Statistics
                  </Text>

                  <Box padding="200" background="bg-surface-secondary">
                    <BlockStack gap="200">
                      <InlineStack gap="400">
                        <Text fontWeight="semibold">Eligible Orders:</Text>
                        <Text>{actionData.aggregateStats._count.id || 0}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text fontWeight="semibold">Total Spent (Eligible):</Text>
                        <Text>{formatCurrency(actionData.aggregateStats._sum.totalPrice)}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text fontWeight="semibold">Total Refunded:</Text>
                        <Text>{formatCurrency(actionData.aggregateStats._sum.totalRefunded)}</Text>
                      </InlineStack>
                      <InlineStack gap="400">
                        <Text fontWeight="semibold">Total Cashback:</Text>
                        <Text>{formatCurrency(actionData.aggregateStats._sum.cashbackAmount)}</Text>
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
                            <Text fontWeight="semibold">Order ID:</Text>
                            <Text>{order.id}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text fontWeight="semibold">Shopify Order ID:</Text>
                            <Text>{order.shopifyOrderId}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text fontWeight="semibold">Total:</Text>
                            <Text>{formatCurrency(order.totalPrice)}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text fontWeight="semibold">Cashback Amount:</Text>
                            <Text>{formatCurrency(order.cashbackAmount)}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text fontWeight="semibold">Cashback Processed:</Text>
                            <Text>{order.cashbackProcessed ? "Yes" : "No"}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text fontWeight="semibold">Created At:</Text>
                            <Text>{formatDate(order.shopifyCreatedAt)}</Text>
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text fontWeight="semibold">Line Items:</Text>
                            <Text>{order.lineItems?.length || 0}</Text>
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