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
        // Test refundCreate with refundMethods (this will fail - for debugging)
        const orderId = formData.get("orderId") as string;
        const amount = formData.get("amount") as string;
        const currency = formData.get("currency") as string || "GBP";

        if (!orderId || !amount) {
          return json({ success: false, error: "Order ID and amount required" });
        }

        const orderGid = orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;

        // This mutation uses refundMethods which doesn't exist - for testing the error
        const mutation = `#graphql
          mutation TestRefundWithStoreCredit($input: RefundInput!) {
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
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variables = {
          input: {
            orderId: orderGid,
            note: "Test refund to store credit",
            transactions: [],
            refundMethods: [
              {
                storeCreditRefund: {
                  amount: {
                    amount: amount,
                    currencyCode: currency,
                  },
                },
              },
            ],
          },
        };

        results.attemptedMutation = "refundCreate with refundMethods";
        results.variables = variables;

        try {
          const response = await admin.graphql(mutation, { variables });
          const data = await response.json();
          results.response = data;
          results.success = false;
          results.expectedError = "refundMethods field does not exist in RefundInput";
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
          <Banner tone="warning">
            <Text as="p" variant="bodyMd">
              <strong>API Finding:</strong> Shopify's <code>refundCreate</code> mutation does NOT support
              <code>refundMethods.storeCreditRefund</code>. This field doesn't exist in <code>RefundInput</code>.
              The correct approach is to use <code>storeCreditAccountCredit</code> mutation to add store credit
              to the customer's account.
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
                <Text as="h3" variant="headingSm">Refund Operations (Debug)</Text>
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
                    tone="critical"
                  >
                    Test refundMethods (Will Fail)
                  </Button>
                </InlineStack>
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
              <Text as="h2" variant="headingMd">Correct Implementation</Text>

              <Banner tone="info">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>Since Shopify doesn't support refunding orders directly to store credit</strong>,
                    the correct implementation for "Refund to Store Credit" should:
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1. Use <code>storeCreditAccountCredit</code> to add credit to customer's account
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Record the transaction locally with order reference
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Optionally add a note/tag to the order for tracking
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Note:</strong> This does NOT create an official Shopify refund on the order.
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
