import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Banner,
  Box,
  Divider,
  Checkbox,
  Icon,
  Spinner,
  Modal,
  Tabs,
  DataTable,
  ProgressBar,
} from "@shopify/polaris";
import {
  RefreshIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  SearchIcon,
  ClockIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============================================
// GRAPHQL QUERIES & MUTATIONS
// ============================================

const BULK_ORDERS_QUERY = `#graphql
  query BulkOrdersQuery($first: Int!, $after: String, $query: String, $sortKey: OrderSortKeys, $reverse: Boolean) {
    orders(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      edges {
        cursor
        node {
          id
          legacyResourceId
          name
          createdAt
          updatedAt
          processedAt
          closedAt
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          returnStatus
          email
          phone
          test
          fullyPaid
          unpaid
          currencyCode

          # Pricing details
          currentSubtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          currentTotalTaxSet {
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
          currentTotalDiscountsSet {
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

          # Customer info
          customer {
            id
            legacyResourceId
            email
            firstName
            lastName
            displayName
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            createdAt
            updatedAt
            state
            verifiedEmail
            tags
          }

          # Line items
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                variantTitle
                quantity
                sku
                vendor
                requiresShipping
                taxable
                giftCard
                fulfillmentStatus

                # Product/variant info
                product {
                  id
                  legacyResourceId
                  handle
                  productType
                  tags
                }
                variant {
                  id
                  legacyResourceId
                  sku
                  barcode
                  price
                }

                # Pricing
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedUnitPriceSet {
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
              }
            }
          }

          # Refunds
          refunds {
            id
            createdAt
            totalRefundedSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            refundLineItems(first: 100) {
              edges {
                node {
                  lineItem {
                    id
                  }
                  quantity
                  subtotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }

          # Payment info
          transactions(first: 10) {
            id
            kind
            status
            test
            processedAt
            amountSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            gateway
          }

          # Tags and metafields
          tags
          note
          customAttributes {
            key
            value
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

const SINGLE_ORDER_QUERY = `#graphql
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      legacyResourceId
      name
      createdAt
      updatedAt
      displayFinancialStatus
      currentTotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      customer {
        id
        email
        displayName
      }
      lineItems(first: 250) {
        edges {
          node {
            id
            title
            quantity
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
    }
  }
`;

const ORDERS_COUNT_QUERY = `#graphql
  query GetOrdersCount($query: String) {
    ordersCount(query: $query) {
      count
      precision
    }
  }
`;

// ============================================
// TYPES
// ============================================

interface TestResult {
  success: boolean;
  duration: number;
  query?: string;
  variables?: any;
  response?: any;
  error?: string;
  ordersProcessed?: number;
  hasMorePages?: boolean;
  nextCursor?: string;
}

interface SyncProgress {
  total: number;
  processed: number;
  failed: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentBatch?: number;
  totalBatches?: number;
}

// ============================================
// LOADER
// ============================================

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Get existing orders count from database
  const dbOrdersCount = await db.order.count({
    where: { shop: session.shop }
  });

  // Get some sample orders from DB for comparison
  const sampleDbOrders = await db.order.findMany({
    where: { shop: session.shop },
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: true,
      lineItems: { take: 3 }
    }
  });

  return json({
    shop: session.shop,
    dbOrdersCount,
    sampleDbOrders,
  });
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  try {
    switch (action) {
      case "testSingleOrder": {
        const orderId = formData.get("orderId") as string;
        const useGid = formData.get("useGid") === "true";

        const startTime = Date.now();

        // Format the ID properly
        const formattedId = useGid && !orderId.startsWith("gid://")
          ? `gid://shopify/Order/${orderId}`
          : orderId;

        const response = await admin.graphql(SINGLE_ORDER_QUERY, {
          variables: { id: formattedId }
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        return json({
          success: !data.errors,
          duration,
          query: SINGLE_ORDER_QUERY,
          variables: { id: formattedId },
          response: data,
          error: data.errors ? JSON.stringify(data.errors) : undefined
        });
      }

      case "testBulkOrders": {
        const first = parseInt(formData.get("first") as string || "10");
        const query = formData.get("query") as string || "";
        const sortKey = formData.get("sortKey") as string || "CREATED_AT";
        const reverse = formData.get("reverse") === "true";
        const after = formData.get("after") as string || null;

        const startTime = Date.now();

        const variables: any = {
          first,
          sortKey,
          reverse
        };

        if (query) variables.query = query;
        if (after) variables.after = after;

        const response = await admin.graphql(BULK_ORDERS_QUERY, { variables });
        const data = await response.json();
        const duration = Date.now() - startTime;

        return json({
          success: !data.errors,
          duration,
          query: BULK_ORDERS_QUERY,
          variables,
          response: data,
          error: data.errors ? JSON.stringify(data.errors) : undefined,
          ordersProcessed: data.data?.orders?.edges?.length || 0,
          hasMorePages: data.data?.orders?.pageInfo?.hasNextPage || false,
          nextCursor: data.data?.orders?.pageInfo?.endCursor || null
        });
      }

      case "testOrdersCount": {
        const query = formData.get("query") as string || "";

        const startTime = Date.now();

        const variables = query ? { query } : {};

        const response = await admin.graphql(ORDERS_COUNT_QUERY, { variables });
        const data = await response.json();
        const duration = Date.now() - startTime;

        return json({
          success: !data.errors,
          duration,
          query: ORDERS_COUNT_QUERY,
          variables,
          response: data,
          error: data.errors ? JSON.stringify(data.errors) : undefined
        });
      }

      case "fullSync": {
        const batchSize = parseInt(formData.get("batchSize") as string || "50");
        const maxBatches = parseInt(formData.get("maxBatches") as string || "10");
        const query = formData.get("syncQuery") as string || "";

        let cursor = null;
        let totalProcessed = 0;
        let batchCount = 0;
        const errors: string[] = [];
        const startTime = Date.now();

        while (batchCount < maxBatches) {
          const variables: any = {
            first: batchSize,
            sortKey: "CREATED_AT",
            reverse: true
          };

          if (query) variables.query = query;
          if (cursor) variables.after = cursor;

          const response = await admin.graphql(BULK_ORDERS_QUERY, { variables });
          const data = await response.json();

          if (data.errors) {
            errors.push(`Batch ${batchCount + 1}: ${JSON.stringify(data.errors)}`);
            break;
          }

          const orders = data.data?.orders?.edges || [];

          // Process orders here (save to database)
          for (const edge of orders) {
            const order = edge.node;

            try {
              // Save or update order in database
              await db.order.upsert({
                where: {
                  shop_shopifyOrderId: {
                    shop: session.shop,
                    shopifyOrderId: order.legacyResourceId
                  }
                },
                update: {
                  shopifyOrderName: order.name,
                  financialStatus: order.displayFinancialStatus?.toUpperCase() || 'PENDING',
                  currency: order.currencyCode || 'USD',
                  totalPrice: parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || '0'),
                  subtotalPrice: parseFloat(order.currentSubtotalPriceSet?.shopMoney?.amount || '0'),
                  totalTax: parseFloat(order.currentTotalTaxSet?.shopMoney?.amount || '0'),
                  totalShipping: parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || '0'),
                  totalDiscounts: parseFloat(order.currentTotalDiscountsSet?.shopMoney?.amount || '0'),
                  totalRefunded: parseFloat(order.totalRefundedSet?.shopMoney?.amount || '0'),
                  shopifyUpdatedAt: new Date(order.updatedAt),
                  updatedAt: new Date()
                },
                create: {
                  id: crypto.randomUUID(),
                  shop: session.shop,
                  shopifyOrderId: order.legacyResourceId,
                  shopifyOrderNumber: order.name.replace('#', ''),
                  shopifyOrderName: order.name,
                  customerId: order.customer?.legacyResourceId
                    ? await getOrCreateCustomer(session.shop, order.customer, db)
                    : 'unknown',
                  email: order.email || order.customer?.email || '',
                  currency: order.currencyCode || 'USD',
                  subtotalPrice: parseFloat(order.currentSubtotalPriceSet?.shopMoney?.amount || '0'),
                  totalDiscounts: parseFloat(order.currentTotalDiscountsSet?.shopMoney?.amount || '0'),
                  totalShipping: parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || '0'),
                  totalTax: parseFloat(order.currentTotalTaxSet?.shopMoney?.amount || '0'),
                  totalPrice: parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || '0'),
                  totalRefunded: parseFloat(order.totalRefundedSet?.shopMoney?.amount || '0'),
                  netAmount: parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || '0') -
                            parseFloat(order.totalRefundedSet?.shopMoney?.amount || '0'),
                  financialStatus: order.displayFinancialStatus?.toUpperCase() || 'PENDING',
                  fulfillmentStatus: order.displayFulfillmentStatus || null,
                  cashbackEligible: !order.test,
                  shopifyCreatedAt: new Date(order.createdAt),
                  shopifyUpdatedAt: new Date(order.updatedAt),
                  processedAt: order.processedAt ? new Date(order.processedAt) : null,
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              });

              totalProcessed++;
            } catch (error: any) {
              errors.push(`Order ${order.name}: ${error.message}`);
            }
          }

          batchCount++;

          // Check for more pages
          if (!data.data?.orders?.pageInfo?.hasNextPage) {
            break;
          }

          cursor = data.data.orders.pageInfo.endCursor;
        }

        const duration = Date.now() - startTime;

        return json({
          success: errors.length === 0,
          duration,
          ordersProcessed: totalProcessed,
          totalBatches: batchCount,
          errors: errors.length > 0 ? errors : undefined,
          message: `Synced ${totalProcessed} orders in ${batchCount} batches`
        });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Order sync test error:", error);
    return json({
      success: false,
      error: error.message || "Unknown error occurred"
    }, { status: 500 });
  }
}

// Helper function to get or create customer
async function getOrCreateCustomer(shop: string, customerData: any, db: any): Promise<string> {
  if (!customerData?.legacyResourceId) {
    return 'unknown';
  }

  const existingCustomer = await db.customer.findFirst({
    where: {
      shop,
      shopifyCustomerId: customerData.legacyResourceId
    }
  });

  if (existingCustomer) {
    return existingCustomer.id;
  }

  // Create new customer
  const newCustomer = await db.customer.create({
    data: {
      id: crypto.randomUUID(),
      shop,
      shopifyCustomerId: customerData.legacyResourceId,
      email: customerData.email || `customer${customerData.legacyResourceId}@example.com`,
      storeCredit: 0,
      totalSpent: parseFloat(customerData.amountSpent?.amount || '0'),
      totalCashbackEarned: 0,
      totalRefunded: 0,
      netSpent: parseFloat(customerData.amountSpent?.amount || '0'),
      orderCount: customerData.numberOfOrders || 0,
      createdAt: new Date(customerData.createdAt),
      updatedAt: new Date()
    }
  });

  return newCustomer.id;
}

// ============================================
// COMPONENT
// ============================================

export default function OrdersSyncTest() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [selectedTab, setSelectedTab] = useState(0);
  const [singleOrderId, setSingleOrderId] = useState("");
  const [useGid, setUseGid] = useState(false);
  const [bulkFirst, setBulkFirst] = useState("10");
  const [bulkQuery, setBulkQuery] = useState("");
  const [bulkSortKey, setBulkSortKey] = useState("CREATED_AT");
  const [bulkReverse, setBulkReverse] = useState(false);
  const [countQuery, setCountQuery] = useState("");
  const [syncBatchSize, setSyncBatchSize] = useState("50");
  const [syncMaxBatches, setSyncMaxBatches] = useState("10");
  const [syncQuery, setSyncQuery] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    total: 0,
    processed: 0,
    failed: 0,
    status: 'idle',
  });

  // Update test result when fetcher completes
  useEffect(() => {
    if (fetcher.data && !isRunning) {
      setTestResult(fetcher.data as TestResult);
    }
  }, [fetcher.data, isRunning]);

  // Handlers
  const handleTestSingleOrder = () => {
    setIsRunning(true);
    const formData = new FormData();
    formData.append("action", "testSingleOrder");
    formData.append("orderId", singleOrderId);
    formData.append("useGid", String(useGid));
    fetcher.submit(formData, { method: "POST" });
    setIsRunning(false);
  };

  const handleTestBulkOrders = (cursor?: string) => {
    setIsRunning(true);
    const formData = new FormData();
    formData.append("action", "testBulkOrders");
    formData.append("first", bulkFirst);
    formData.append("query", bulkQuery);
    formData.append("sortKey", bulkSortKey);
    formData.append("reverse", String(bulkReverse));
    if (cursor) formData.append("after", cursor);
    fetcher.submit(formData, { method: "POST" });
    setIsRunning(false);
  };

  const handleTestOrdersCount = () => {
    setIsRunning(true);
    const formData = new FormData();
    formData.append("action", "testOrdersCount");
    formData.append("query", countQuery);
    fetcher.submit(formData, { method: "POST" });
    setIsRunning(false);
  };

  const handleFullSync = () => {
    setIsRunning(true);
    setSyncProgress({
      total: 0,
      processed: 0,
      failed: 0,
      status: 'running',
    });

    const formData = new FormData();
    formData.append("action", "fullSync");
    formData.append("batchSize", syncBatchSize);
    formData.append("maxBatches", syncMaxBatches);
    formData.append("syncQuery", syncQuery);
    fetcher.submit(formData, { method: "POST" });

    // Will update when fetcher completes
    setIsRunning(false);
  };

  const tabs = [
    { id: 'single', content: 'Single Order', accessibilityLabel: 'Test single order' },
    { id: 'bulk', content: 'Bulk Orders', accessibilityLabel: 'Test bulk orders' },
    { id: 'count', content: 'Orders Count', accessibilityLabel: 'Test orders count' },
    { id: 'sync', content: 'Full Sync', accessibilityLabel: 'Full sync test' },
  ];

  return (
    <Page
      title="Orders Sync Test"
      subtitle="Test GraphQL order queries and sync functionality"
      primaryAction={{
        content: "Back to Orders",
        url: "/app/orders",
      }}
    >
      <Layout>
        {/* Database Info */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Database Status</Text>
              <InlineStack gap="800">
                <Box>
                  <Text variant="bodyMd" as="span" tone="subdued">Orders in DB:</Text>{' '}
                  <Badge tone="info">{data.dbOrdersCount}</Badge>
                </Box>
                <Box>
                  <Text variant="bodyMd" as="span" tone="subdued">Shop:</Text>{' '}
                  <Badge>{data.shop}</Badge>
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Test Interface */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <Box padding="400">
                {selectedTab === 0 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Test Single Order Query</Text>

                    <TextField
                      label="Order ID"
                      value={singleOrderId}
                      onChange={setSingleOrderId}
                      placeholder="e.g., 5843219374293 or gid://shopify/Order/5843219374293"
                      helpText="Enter either legacy ID or GraphQL ID"
                      autoComplete="off"
                    />

                    <Checkbox
                      label="Convert to GID format"
                      checked={useGid}
                      onChange={setUseGid}
                      helpText="Automatically prepend gid://shopify/Order/ to the ID"
                    />

                    <Button
                      primary
                      onClick={handleTestSingleOrder}
                      disabled={!singleOrderId || fetcher.state === "submitting"}
                      loading={fetcher.state === "submitting"}
                    >
                      Test Single Order
                    </Button>
                  </BlockStack>
                )}

                {selectedTab === 1 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Test Bulk Orders Query</Text>

                    <InlineStack gap="400">
                      <TextField
                        label="Number of orders"
                        type="number"
                        value={bulkFirst}
                        onChange={setBulkFirst}
                        autoComplete="off"
                      />

                      <Select
                        label="Sort by"
                        options={[
                          {label: 'Created At', value: 'CREATED_AT'},
                          {label: 'Updated At', value: 'UPDATED_AT'},
                          {label: 'Processed At', value: 'PROCESSED_AT'},
                          {label: 'Total Price', value: 'TOTAL_PRICE'},
                          {label: 'ID', value: 'ID'},
                        ]}
                        value={bulkSortKey}
                        onChange={setBulkSortKey}
                      />
                    </InlineStack>

                    <TextField
                      label="Search query"
                      value={bulkQuery}
                      onChange={setBulkQuery}
                      placeholder="e.g., financial_status:paid created_at:>2024-01-01"
                      helpText="Use Shopify order search syntax"
                      autoComplete="off"
                    />

                    <Checkbox
                      label="Reverse order (newest first)"
                      checked={bulkReverse}
                      onChange={setBulkReverse}
                    />

                    <InlineStack gap="200">
                      <Button
                        primary
                        onClick={() => handleTestBulkOrders()}
                        disabled={fetcher.state === "submitting"}
                        loading={fetcher.state === "submitting"}
                      >
                        Test Bulk Query
                      </Button>

                      {testResult?.hasMorePages && (
                        <Button
                          onClick={() => handleTestBulkOrders(testResult.nextCursor!)}
                          disabled={fetcher.state === "submitting"}
                        >
                          Load Next Page
                        </Button>
                      )}
                    </InlineStack>
                  </BlockStack>
                )}

                {selectedTab === 2 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Test Orders Count Query</Text>

                    <TextField
                      label="Filter query (optional)"
                      value={countQuery}
                      onChange={setCountQuery}
                      placeholder="e.g., financial_status:paid"
                      helpText="Leave empty to count all orders"
                      autoComplete="off"
                    />

                    <Button
                      primary
                      onClick={handleTestOrdersCount}
                      disabled={fetcher.state === "submitting"}
                      loading={fetcher.state === "submitting"}
                    >
                      Get Orders Count
                    </Button>
                  </BlockStack>
                )}

                {selectedTab === 3 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Full Sync Test</Text>

                    <Banner tone="warning">
                      This will sync orders from Shopify to your database. Use with caution on large stores.
                    </Banner>

                    <InlineStack gap="400">
                      <TextField
                        label="Batch size"
                        type="number"
                        value={syncBatchSize}
                        onChange={setSyncBatchSize}
                        helpText="Orders per batch (max 250)"
                        autoComplete="off"
                      />

                      <TextField
                        label="Max batches"
                        type="number"
                        value={syncMaxBatches}
                        onChange={setSyncMaxBatches}
                        helpText="Maximum number of batches to process"
                        autoComplete="off"
                      />
                    </InlineStack>

                    <TextField
                      label="Filter query (optional)"
                      value={syncQuery}
                      onChange={setSyncQuery}
                      placeholder="e.g., created_at:>2024-01-01"
                      helpText="Sync only orders matching this query"
                      autoComplete="off"
                    />

                    <Button
                      primary
                      tone="critical"
                      onClick={handleFullSync}
                      disabled={fetcher.state === "submitting"}
                      loading={fetcher.state === "submitting"}
                    >
                      Start Full Sync
                    </Button>

                    {syncProgress.status === 'running' && (
                      <Box>
                        <ProgressBar progress={syncProgress.processed / (syncProgress.total || 1) * 100} />
                        <Text variant="bodySm" as="p">
                          Processing batch {syncProgress.currentBatch} of {syncProgress.totalBatches}...
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>

        {/* Test Results */}
        {testResult && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Test Results</Text>
                  <Badge tone={testResult.success ? "success" : "critical"}>
                    {testResult.success ? "Success" : "Failed"}
                  </Badge>
                </InlineStack>

                <InlineStack gap="400">
                  <Box>
                    <Text variant="bodyMd" as="span" tone="subdued">Duration:</Text>{' '}
                    <Badge>{testResult.duration}ms</Badge>
                  </Box>
                  {testResult.ordersProcessed !== undefined && (
                    <Box>
                      <Text variant="bodyMd" as="span" tone="subdued">Orders:</Text>{' '}
                      <Badge>{testResult.ordersProcessed}</Badge>
                    </Box>
                  )}
                  {testResult.hasMorePages && (
                    <Badge tone="info">Has more pages</Badge>
                  )}
                </InlineStack>

                {testResult.error && (
                  <Banner tone="critical">
                    <Text variant="bodyMd" as="p">{testResult.error}</Text>
                  </Banner>
                )}

                <Divider />

                {/* Query Display */}
                {testResult.query && (
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">GraphQL Query</Text>
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <pre style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0,
                        maxHeight: '300px',
                        overflow: 'auto'
                      }}>
                        {testResult.query}
                      </pre>
                    </Box>
                  </BlockStack>
                )}

                {/* Variables Display */}
                {testResult.variables && (
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">Variables</Text>
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <pre style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0
                      }}>
                        {JSON.stringify(testResult.variables, null, 2)}
                      </pre>
                    </Box>
                  </BlockStack>
                )}

                {/* Response Display */}
                {testResult.response && (
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">Raw Response</Text>
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <pre style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0,
                        maxHeight: '400px',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(testResult.response, null, 2)}
                      </pre>
                    </Box>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Sample DB Orders */}
        {data.sampleDbOrders.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Sample Orders in Database</Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
                  headings={['Order', 'Customer', 'Date', 'Total', 'Status']}
                  rows={data.sampleDbOrders.map(order => [
                    order.shopifyOrderName,
                    order.customer?.email || 'Unknown',
                    new Date(order.shopifyCreatedAt).toLocaleDateString(),
                    `$${order.totalPrice.toFixed(2)}`,
                    order.financialStatus
                  ])}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}