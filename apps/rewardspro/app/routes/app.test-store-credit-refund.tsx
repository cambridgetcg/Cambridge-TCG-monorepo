/**
 * Test Page: Store Credit Refund API Testing
 *
 * This page tests Shopify's GraphQL API for store credit operations
 * to debug and verify the correct approach for "Refund to Store Credit"
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  Banner,
  Box,
  Divider,
  InlineStack,
  Badge,
  Select,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Fetch some customers and orders for testing
  const customersQuery = `#graphql
    query GetTestCustomers {
      customers(first: 10) {
        edges {
          node {
            id
            email
            displayName
            storeCreditAccounts(first: 5) {
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
      }
    }
  `;

  const ordersQuery = `#graphql
    query GetTestOrders {
      orders(first: 10, reverse: true) {
        edges {
          node {
            id
            name
            displayFinancialStatus
            totalPriceSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
            customer {
              id
              email
            }
          }
        }
      }
    }
  `;

  let customers: any[] = [];
  let orders: any[] = [];

  try {
    const [customersRes, ordersRes] = await Promise.all([
      admin.graphql(customersQuery),
      admin.graphql(ordersQuery),
    ]);

    const customersData = await customersRes.json();
    const ordersData = await ordersRes.json();

    customers = customersData.data?.customers?.edges?.map((e: any) => e.node) || [];
    orders = ordersData.data?.orders?.edges?.map((e: any) => e.node) || [];
  } catch (error) {
    console.error("Error fetching test data:", error);
  }

  return json({
    shop: session.shop,
    customers,
    orders,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const testType = formData.get("testType") as string;

  const results: any = {
    testType,
    timestamp: new Date().toISOString(),
    shop: session.shop,
  };

  try {
    switch (testType) {
      case "introspectRefundInput": {
        // Introspect the RefundInput type to see available fields
        const introspectionQuery = `#graphql
          query IntrospectRefundInput {
            __type(name: "RefundInput") {
              name
              kind
              inputFields {
                name
                type {
                  name
                  kind
                  ofType {
                    name
                    kind
                  }
                }
                description
              }
            }
          }
        `;

        const response = await admin.graphql(introspectionQuery);
        const data = await response.json();
        results.introspection = data;
        results.success = true;
        break;
      }

      case "introspectStoreCreditInput": {
        // Introspect the StoreCreditAccountCreditInput type
        const introspectionQuery = `#graphql
          query IntrospectStoreCreditInput {
            __type(name: "StoreCreditAccountCreditInput") {
              name
              kind
              inputFields {
                name
                type {
                  name
                  kind
                  ofType {
                    name
                    kind
                  }
                }
                description
              }
            }
          }
        `;

        const response = await admin.graphql(introspectionQuery);
        const data = await response.json();
        results.introspection = data;
        results.success = true;
        break;
      }

      case "testStoreCreditCredit": {
        // Test storeCreditAccountCredit mutation
        const customerId = formData.get("customerId") as string;
        const amount = formData.get("amount") as string;
        const currency = formData.get("currency") as string || "GBP";

        if (!customerId || !amount) {
          return json({ success: false, error: "Customer ID and amount required" });
        }

        const mutation = `#graphql
          mutation TestStoreCreditCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
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

        const response = await admin.graphql(mutation, {
          variables: {
            id: customerId.startsWith("gid://") ? customerId : `gid://shopify/Customer/${customerId}`,
            creditInput: {
              creditAmount: {
                amount: amount,
                currencyCode: currency,
              },
            },
          },
        });

        const data = await response.json();
        results.mutation = "storeCreditAccountCredit";
        results.variables = { customerId, amount, currency };
        results.response = data;
        results.success = !data.errors && !data.data?.storeCreditAccountCredit?.userErrors?.length;
        break;
      }

      case "testRefundCreate": {
        // Test refundCreate mutation (WITHOUT refundMethods - to see what works)
        const orderId = formData.get("orderId") as string;
        const amount = formData.get("amount") as string;
        const note = formData.get("note") as string || "Test refund";

        if (!orderId) {
          return json({ success: false, error: "Order ID required" });
        }

        // First, get order details
        const orderQuery = `#graphql
          query GetOrderDetails($id: ID!) {
            order(id: $id) {
              id
              name
              displayFinancialStatus
              totalPriceSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
              totalRefundedSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
              transactions(first: 10) {
                edges {
                  node {
                    id
                    kind
                    gateway
                    parentTransaction {
                      id
                    }
                  }
                }
              }
              customer {
                id
                email
              }
            }
          }
        `;

        const orderGid = orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;
        const orderResponse = await admin.graphql(orderQuery, {
          variables: { id: orderGid },
        });
        const orderData = await orderResponse.json();

        results.orderDetails = orderData;

        // Don't actually create refund - just show what we found
        results.message = "Order details fetched. Refund creation disabled in test mode.";
        results.success = true;
        break;
      }

      case "testRefundWithStoreCredit": {
        // Test refundCreate with store-credit gateway (the correct approach)
        const orderId = formData.get("orderId") as string;
        const amount = formData.get("amount") as string;
        const currency = formData.get("currency") as string || "GBP";

        if (!orderId || !amount) {
          return json({ success: false, error: "Order ID and amount required" });
        }

        const orderGid = orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;

        // First get customer ID from order
        const orderQuery = `#graphql
          query GetOrderCustomer($orderId: ID!) {
            order(id: $orderId) {
              id
              name
              displayFinancialStatus
              customer {
                id
                email
              }
            }
          }
        `;

        const orderResponse = await admin.graphql(orderQuery, {
          variables: { orderId: orderGid }
        });
        const orderData = await orderResponse.json();
        results.orderData = orderData;

        const customerId = orderData.data?.order?.customer?.id;
        const orderName = orderData.data?.order?.name;

        if (!customerId) {
          results.error = "Order does not have a customer";
          results.success = false;
          break;
        }

        // Create refund using store-credit gateway
        const refundMutation = `#graphql
          mutation CreateStoreCreditRefund($input: RefundInput!) {
            refundCreate(input: $input) {
              refund {
                id
                totalRefundedSet {
                  presentmentMoney {
                    amount
                    currencyCode
                  }
                }
              }
              order {
                id
                name
                displayFinancialStatus
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const refundVariables = {
          input: {
            orderId: orderGid,
            note: "Test refund to store credit via RewardsPro",
            notify: false,
            transactions: [
              {
                amount: amount,
                gateway: "store-credit",
                kind: "REFUND",
                orderId: orderGid
              }
            ]
          },
        };

        results.refundMutation = "refundCreate with store-credit gateway";
        results.refundVariables = refundVariables;

        try {
          const refundResponse = await admin.graphql(refundMutation, { variables: refundVariables });
          const refundData = await refundResponse.json();
          results.refundResponse = refundData;

          if (refundData.errors || refundData.data?.refundCreate?.userErrors?.length > 0) {
            results.success = false;
            results.error = refundData.errors?.[0]?.message ||
                           refundData.data?.refundCreate?.userErrors?.[0]?.message;
          } else {
            // Refund created successfully, now issue store credit
            const creditMutation = `#graphql
              mutation IssueStoreCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
                storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
                  storeCreditAccountTransaction {
                    id
                    amount { amount, currencyCode }
                    balanceAfterTransaction { amount, currencyCode }
                  }
                  userErrors { field, message }
                }
              }
            `;

            const creditResponse = await admin.graphql(creditMutation, {
              variables: {
                id: customerId,
                creditInput: {
                  creditAmount: {
                    amount: amount,
                    currencyCode: currency
                  }
                }
              }
            });
            const creditData = await creditResponse.json();
            results.creditResponse = creditData;

            results.success = !creditData.errors &&
                             !creditData.data?.storeCreditAccountCredit?.userErrors?.length;
            results.message = results.success
              ? `Refund created on order ${orderName} and store credit issued to customer`
              : "Refund created but store credit failed";
          }
        } catch (error: any) {
          results.error = error.message;
          results.errorDetails = error.toString();
          results.success = false;
        }
        break;
      }

      case "queryStoreCreditBalance": {
        const customerId = formData.get("customerId") as string;

        if (!customerId) {
          return json({ success: false, error: "Customer ID required" });
        }

        const query = `#graphql
          query GetStoreCreditBalance($customerId: ID!) {
            customer(id: $customerId) {
              id
              email
              displayName
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

        const customerGid = customerId.startsWith("gid://") ? customerId : `gid://shopify/Customer/${customerId}`;
        const response = await admin.graphql(query, {
          variables: { customerId: customerGid },
        });

        const data = await response.json();
        results.query = "storeCreditAccounts";
        results.response = data;
        results.success = !data.errors;
        break;
      }

      default:
        results.error = `Unknown test type: ${testType}`;
        results.success = false;
    }
  } catch (error: any) {
    results.error = error.message;
    results.errorStack = error.stack;
    results.success = false;
  }

  return json(results);
};

export default function TestStoreCreditRefund() {
  const { shop, customers, orders } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [amount, setAmount] = useState("10.00");
  const [currency, setCurrency] = useState("GBP");

  const customerOptions = [
    { label: "Select a customer...", value: "" },
    ...customers.map((c: any) => ({
      label: `${c.displayName || c.email} (${c.id.split("/").pop()})`,
      value: c.id,
    })),
  ];

  const orderOptions = [
    { label: "Select an order...", value: "" },
    ...orders.map((o: any) => ({
      label: `${o.name} - ${o.displayFinancialStatus} - ${o.totalPriceSet?.presentmentMoney?.amount} ${o.totalPriceSet?.presentmentMoney?.currencyCode}`,
      value: o.id,
    })),
  ];

  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const runTest = (testType: string) => {
    const formData = new FormData();
    formData.append("testType", testType);
    formData.append("customerId", selectedCustomer);
    formData.append("orderId", selectedOrder);
    formData.append("amount", amount);
    formData.append("currency", currency);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page
      title="Store Credit Refund API Testing"
      subtitle={`Shop: ${shop}`}
      backAction={{ content: "Back", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <Text as="p" variant="bodyMd">
              <strong>Correct Implementation:</strong> To refund an order to store credit, we perform TWO operations:
              1) Create a refund using <code>refundCreate</code> with <code>gateway: "store-credit"</code> (marks order as refunded),
              2) Issue store credit using <code>storeCreditAccountCredit</code> (adds credit to customer's account).
            </Text>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Test Configuration</Text>

              <Select
                label="Customer"
                options={customerOptions}
                value={selectedCustomer}
                onChange={setSelectedCustomer}
              />

              <Select
                label="Order"
                options={orderOptions}
                value={selectedOrder}
                onChange={setSelectedOrder}
              />

              <InlineStack gap="400">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Amount"
                    value={amount}
                    onChange={setAmount}
                    type="number"
                    autoComplete="off"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Currency"
                    value={currency}
                    onChange={setCurrency}
                    autoComplete="off"
                  />
                </div>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">API Tests</Text>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Schema Introspection</Text>
                <InlineStack gap="200">
                  <Button onClick={() => runTest("introspectRefundInput")} loading={isLoading}>
                    Introspect RefundInput
                  </Button>
                  <Button onClick={() => runTest("introspectStoreCreditInput")} loading={isLoading}>
                    Introspect StoreCreditInput
                  </Button>
                </InlineStack>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Store Credit Operations</Text>
                <InlineStack gap="200">
                  <Button
                    onClick={() => runTest("queryStoreCreditBalance")}
                    loading={isLoading}
                    disabled={!selectedCustomer}
                  >
                    Query Balance
                  </Button>
                  <Button
                    onClick={() => runTest("testStoreCreditCredit")}
                    loading={isLoading}
                    disabled={!selectedCustomer}
                    variant="primary"
                    tone="success"
                  >
                    Issue Store Credit
                  </Button>
                </InlineStack>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Refund Operations</Text>
                <InlineStack gap="200">
                  <Button
                    onClick={() => runTest("testRefundCreate")}
                    loading={isLoading}
                    disabled={!selectedOrder}
                  >
                    Get Order Details
                  </Button>
                  <Button
                    onClick={() => runTest("testRefundWithStoreCredit")}
                    loading={isLoading}
                    disabled={!selectedOrder}
                    variant="primary"
                  >
                    Create Refund + Issue Credit
                  </Button>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Creates a refund on the order (marks as refunded) AND issues store credit to customer
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {fetcher.data && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Test Results</Text>
                  <Badge tone={fetcher.data.success ? "success" : "critical"}>
                    {fetcher.data.success ? "Success" : "Failed"}
                  </Badge>
                </InlineStack>

                <Divider />

                <Box
                  background="bg-surface-secondary"
                  padding="400"
                  borderRadius="200"
                >
                  <pre style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    margin: 0,
                    maxHeight: "500px",
                    overflow: "auto"
                  }}>
                    {JSON.stringify(fetcher.data, null, 2)}
                  </pre>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Implementation Details</Text>

              <Banner tone="success">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>The correct implementation performs TWO operations:</strong>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1. <strong>Create Refund:</strong> Use <code>refundCreate</code> with <code>gateway: "store-credit"</code>
                    - This marks the order as "Refunded" or "Partially Refunded" in Shopify admin
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. <strong>Issue Store Credit:</strong> Use <code>storeCreditAccountCredit</code>
                    - This adds the credit to the customer's Shopify store credit account
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Result:</strong> Order shows as refunded AND customer receives store credit they can use at checkout.
                  </Text>
                </BlockStack>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
