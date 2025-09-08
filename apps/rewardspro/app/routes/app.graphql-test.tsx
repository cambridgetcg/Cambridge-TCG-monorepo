import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  FormLayout,
  TextField,
  Select,
  Badge,
  Banner,
  BlockStack,
  Box,
  Text,
  InlineStack,
  Divider,
  DataTable,
  SkeletonBodyText
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// ============================================================================
// TYPES
// ============================================================================

interface GraphQLTestResult {
  success: boolean;
  query: string;
  variables: any;
  rawResponse?: any;
  parsedData?: any;
  error?: string;
  executionTime?: number;
}

interface LoaderData {
  shop: string;
}

// ============================================================================
// LOADER - Get shop info
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  return json<LoaderData>({
    shop: session.shop
  });
};

// ============================================================================
// ACTION - Execute GraphQL query for customer orders
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const customerId = formData.get("customerId") as string;
  const orderCount = parseInt(formData.get("orderCount") as string || "10");
  const includeLineItems = formData.get("includeLineItems") === "true";
  const orderStatus = formData.get("orderStatus") as string || "any";
  
  const startTime = Date.now();
  
  try {
    // Format customer ID as GID if needed
    const gidCustomerId = customerId.startsWith('gid://') 
      ? customerId 
      : `gid://shopify/Customer/${customerId}`;
    
    // Build the orders query with all order details
    let query = `#graphql
      query GetCustomerOrders($customerId: ID!, $first: Int!) {
        customer(id: $customerId) {
          id
          displayName
          numberOfOrders
          amountSpent {
            amount
            currencyCode
          }
          createdAt
          updatedAt
          
          # Get all orders for this customer
          orders(first: $first, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                updatedAt
                processedAt
                cancelledAt
                closedAt
                
                # Order status
                displayFinancialStatus
                displayFulfillmentStatus
                returnStatus
                
                # Financial details
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                subtotalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalTaxSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalShippingPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalDiscountsSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalRefundedSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                
                # Additional order info
                currencyCode
                currentTotalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                tags`;
    
    // Conditionally add line items if requested
    if (includeLineItems) {
      query += `
                
                # Line items
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      sku
                      variantTitle
                      vendor
                      
                      # Pricing for each line item
                      originalTotalSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      discountedTotalSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      
                      # Product details
                      product {
                        id
                        title
                        productType
                        vendor
                        tags
                      }
                      
                      # Variant details
                      variant {
                        id
                        title
                        price
                        sku
                        inventoryQuantity
                      }
                      
                      # Applied discounts
                      discountAllocations {
                        allocatedAmountSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                        discountApplication {
                          ... on DiscountCodeApplication {
                            code
                            targetSelection
                            targetType
                            value {
                              ... on PricingPercentageValue {
                                percentage
                              }
                              ... on MoneyV2 {
                                amount
                                currencyCode
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }`;
    }
    
    // Close the query
    query += `
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
            }
          }
        }
      }
    `;
    
    const variables = {
      customerId: gidCustomerId,
      first: orderCount
    };
    
    console.log("[GraphQL Test] Executing query for customer:", gidCustomerId);
    console.log("[GraphQL Test] Fetching", orderCount, "orders");
    
    // Execute the GraphQL query
    const response = await admin.graphql(query, { variables });
    const responseJson = await response.json() as any;
    
    const executionTime = Date.now() - startTime;
    
    // Check for errors
    if (responseJson.errors) {
      console.error("[GraphQL Test] Errors:", responseJson.errors);
      return json<GraphQLTestResult>({
        success: false,
        query,
        variables,
        rawResponse: responseJson,
        error: responseJson.errors[0]?.message || "GraphQL query failed",
        executionTime
      });
    }
    
    // Parse and format the response
    const customer = responseJson.data?.customer;
    
    if (!customer) {
      return json<GraphQLTestResult>({
        success: false,
        query,
        variables,
        rawResponse: responseJson,
        error: "Customer not found",
        executionTime
      });
    }
    
    // Extract and format order data
    const orders = customer.orders?.edges?.map((edge: any) => edge.node) || [];
    
    const parsedData = {
      customer: {
        id: customer.id,
        displayName: customer.displayName,
        numberOfOrders: customer.numberOfOrders,
        amountSpent: customer.amountSpent,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      },
      orders: orders.map((order: any) => ({
        id: order.id,
        name: order.name,
        createdAt: order.createdAt,
        status: {
          financial: order.displayFinancialStatus,
          fulfillment: order.displayFulfillmentStatus,
          return: order.returnStatus
        },
        totals: {
          total: order.totalPriceSet?.shopMoney,
          subtotal: order.subtotalPriceSet?.shopMoney,
          tax: order.totalTaxSet?.shopMoney,
          shipping: order.totalShippingPriceSet?.shopMoney,
          discounts: order.totalDiscountsSet?.shopMoney,
          refunded: order.totalRefundedSet?.shopMoney,
          currentTotal: order.currentTotalPriceSet?.shopMoney
        },
        lineItems: includeLineItems ? order.lineItems?.edges?.map((e: any) => e.node) : undefined,
        tags: order.tags
      })),
      summary: {
        totalOrders: orders.length,
        totalSpent: customer.amountSpent,
        averageOrderValue: orders.length > 0 
          ? (parseFloat(customer.amountSpent?.amount || 0) / orders.length).toFixed(2)
          : "0",
        hasMoreOrders: customer.orders?.pageInfo?.hasNextPage || false
      }
    };
    
    console.log(`[GraphQL Test] Successfully fetched ${orders.length} orders`);
    
    return json<GraphQLTestResult>({
      success: true,
      query,
      variables,
      rawResponse: responseJson,
      parsedData,
      executionTime
    });
    
  } catch (error) {
    console.error("[GraphQL Test] Error:", error);
    const executionTime = Date.now() - startTime;
    
    return json<GraphQLTestResult>({
      success: false,
      query: "",
      variables: { customerId },
      error: error instanceof Error ? error.message : "Unknown error occurred",
      executionTime
    });
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function GraphQLTest() {
  const { shop } = useLoaderData<LoaderData>();
  const actionData = useActionData<GraphQLTestResult>();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  // Form state
  const [customerId, setCustomerId] = useState("");
  const [orderCount, setOrderCount] = useState("10");
  const [includeLineItems, setIncludeLineItems] = useState(true);
  const [orderStatus, setOrderStatus] = useState("any");
  
  const isLoading = navigation.state === "submitting";
  
  // Format customer ID helper
  const formatCustomerId = (value: string) => {
    // Remove any existing gid:// prefix
    const cleaned = value.replace(/^gid:\/\/shopify\/Customer\//, '');
    // Return just the numeric ID
    return cleaned;
  };
  
  // Handle form submission
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("customerId", formatCustomerId(customerId));
    formData.append("orderCount", orderCount);
    formData.append("includeLineItems", includeLineItems.toString());
    formData.append("orderStatus", orderStatus);
    
    submit(formData, { method: "post" });
  }, [customerId, orderCount, includeLineItems, orderStatus, submit]);
  
  // Render order summary table if we have data
  const renderOrderTable = () => {
    if (!actionData?.parsedData?.orders) return null;
    
    const orders = actionData.parsedData.orders;
    
    const rows = orders.map((order: any) => [
      order.name,
      new Date(order.createdAt).toLocaleDateString(),
      order.status.financial,
      order.status.fulfillment,
      `${order.totals.total?.amount} ${order.totals.total?.currencyCode}`,
      order.lineItems ? `${order.lineItems.length} items` : "N/A"
    ]);
    
    return (
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h3">Orders Summary</Text>
          <DataTable
            columnContentTypes={[
              'text',
              'text',
              'text',
              'text',
              'numeric',
              'text'
            ]}
            headings={[
              'Order #',
              'Date',
              'Payment',
              'Fulfillment',
              'Total',
              'Items'
            ]}
            rows={rows}
          />
        </BlockStack>
      </Card>
    );
  };
  
  return (
    <Page
      title="Customer Orders Query Test"
      subtitle="Test GraphQL queries for retrieving customer order history"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Query Configuration */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Query Configuration</Text>
                
                <FormLayout>
                  <TextField
                    label="Customer ID"
                    value={customerId}
                    onChange={(value) => setCustomerId(formatCustomerId(value))}
                    placeholder="123456789 or gid://shopify/Customer/123456789"
                    helpText="Enter the numeric customer ID (will auto-format)"
                    autoComplete="off"
                  />
                  
                  <Select
                    label="Number of Orders"
                    options={[
                      { label: "5 orders", value: "5" },
                      { label: "10 orders", value: "10" },
                      { label: "25 orders", value: "25" },
                      { label: "50 orders", value: "50" },
                      { label: "100 orders", value: "100" },
                      { label: "250 orders (max)", value: "250" }
                    ]}
                    value={orderCount}
                    onChange={setOrderCount}
                  />
                  
                  <Select
                    label="Include Line Items"
                    options={[
                      { label: "Yes - Include product details", value: "true" },
                      { label: "No - Orders only", value: "false" }
                    ]}
                    value={includeLineItems.toString()}
                    onChange={(value) => setIncludeLineItems(value === "true")}
                    helpText="Including line items will fetch detailed product information for each order"
                  />
                  
                  <Button
                    variant="primary"
                    onClick={handleSubmit}
                    loading={isLoading}
                    disabled={!customerId}
                  >
                    Fetch Customer Orders
                  </Button>
                </FormLayout>
                
                <Box>
                  <InlineStack gap="200" align="start">
                    <Badge>{`Shop: ${shop}`}</Badge>
                    <Badge tone="info">Scope: read_orders</Badge>
                  </InlineStack>
                </Box>
              </BlockStack>
            </Card>
            
            {/* Results Display */}
            {actionData && (
              <>
                {/* Status Banner */}
                <Banner
                  title={actionData.success ? "Query executed successfully" : "Query failed"}
                  tone={actionData.success ? "success" : "critical"}
                >
                  {actionData.executionTime && (
                    <Text as="p">Execution time: {actionData.executionTime}ms</Text>
                  )}
                  {actionData.error && (
                    <Text as="p" tone="critical">{actionData.error}</Text>
                  )}
                </Banner>
                
                {/* Customer Summary */}
                {actionData.success && actionData.parsedData && (
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h3">Customer Summary</Text>
                      <BlockStack gap="200">
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Name:</Text>
                          <Text as="span">{actionData.parsedData.customer.displayName || "N/A"}</Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Total Orders:</Text>
                          <Text as="span">{actionData.parsedData.customer.numberOfOrders}</Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Total Spent:</Text>
                          <Text as="span">
                            {actionData.parsedData.customer.amountSpent?.amount} {actionData.parsedData.customer.amountSpent?.currencyCode}
                          </Text>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="span" fontWeight="semibold">Average Order Value:</Text>
                          <Text as="span">
                            {actionData.parsedData.summary.averageOrderValue} {actionData.parsedData.customer.amountSpent?.currencyCode}
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                )}
                
                {/* Orders Table */}
                {renderOrderTable()}
                
                {/* GraphQL Query Display */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">GraphQL Query</Text>
                    <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                      <pre style={{ 
                        whiteSpace: 'pre-wrap', 
                        wordBreak: 'break-all',
                        fontSize: '12px',
                        margin: 0
                      }}>
                        {actionData.query}
                      </pre>
                    </Box>
                  </BlockStack>
                </Card>
                
                {/* Variables Display */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Variables</Text>
                    <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                      <pre style={{ 
                        whiteSpace: 'pre-wrap', 
                        wordBreak: 'break-all',
                        fontSize: '12px',
                        margin: 0
                      }}>
                        {JSON.stringify(actionData.variables, null, 2)}
                      </pre>
                    </Box>
                  </BlockStack>
                </Card>
                
                {/* Raw Response */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Raw Response</Text>
                    <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                      <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{ 
                          whiteSpace: 'pre-wrap', 
                          wordBreak: 'break-all',
                          fontSize: '12px',
                          margin: 0
                        }}>
                          {JSON.stringify(actionData.rawResponse || actionData.parsedData, null, 2)}
                        </pre>
                      </Box>
                    </div>
                  </BlockStack>
                </Card>
              </>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}