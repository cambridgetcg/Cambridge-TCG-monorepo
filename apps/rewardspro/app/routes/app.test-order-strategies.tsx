import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  DataTable,
  Banner,
  InlineStack,
  Button
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import {
  countOrdersDirectDataAPI,
  countOrdersStringComparison,
  countOrdersDateExtraction,
  countOrdersEpochComparison,
  countOrdersInMemory,
  countOrdersWithTimezone,
  countOrdersBetween,
  getOrCreateMonthlyCount,
  countOrdersWithFallback
} from "../utils/order-count-strategies";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Set up date range for current month
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Test each strategy individually
  const strategyResults = [];

  // Strategy 1: DirectDataAPI
  try {
    const startTime = Date.now();
    const count = await countOrdersDirectDataAPI(shop, startOfMonth, endOfMonth);
    const duration = Date.now() - startTime;
    strategyResults.push({
      name: "DirectDataAPI",
      status: "success",
      count,
      duration: `${duration}ms`,
      error: null
    });
  } catch (error) {
    strategyResults.push({
      name: "DirectDataAPI",
      status: "failed",
      count: 0,
      duration: "N/A",
      error: String(error)
    });
  }

  // Strategy 2: DateExtraction
  try {
    const startTime = Date.now();
    const count = await countOrdersDateExtraction(shop, year, month);
    const duration = Date.now() - startTime;
    strategyResults.push({
      name: "DateExtraction",
      status: "success",
      count,
      duration: `${duration}ms`,
      error: null
    });
  } catch (error) {
    strategyResults.push({
      name: "DateExtraction",
      status: "failed",
      count: 0,
      duration: "N/A",
      error: String(error)
    });
  }

  // Strategy 3: EpochComparison
  try {
    const startTime = Date.now();
    const count = await countOrdersEpochComparison(shop, startOfMonth, endOfMonth);
    const duration = Date.now() - startTime;
    strategyResults.push({
      name: "EpochComparison",
      status: "success",
      count,
      duration: `${duration}ms`,
      error: null
    });
  } catch (error) {
    strategyResults.push({
      name: "EpochComparison",
      status: "failed",
      count: 0,
      duration: "N/A",
      error: String(error)
    });
  }

  // Strategy 4: StringComparison
  try {
    const startTime = Date.now();
    const count = await countOrdersStringComparison(shop, startOfMonth, endOfMonth);
    const duration = Date.now() - startTime;
    strategyResults.push({
      name: "StringComparison",
      status: "success",
      count,
      duration: `${duration}ms`,
      error: null
    });
  } catch (error) {
    strategyResults.push({
      name: "StringComparison",
      status: "failed",
      count: 0,
      duration: "N/A",
      error: String(error)
    });
  }

  // Strategy 5: Between
  try {
    const startTime = Date.now();
    const count = await countOrdersBetween(shop, startOfMonth, endOfMonth);
    const duration = Date.now() - startTime;
    strategyResults.push({
      name: "Between",
      status: "success",
      count,
      duration: `${duration}ms`,
      error: null
    });
  } catch (error) {
    strategyResults.push({
      name: "Between",
      status: "failed",
      count: 0,
      duration: "N/A",
      error: String(error)
    });
  }

  // Strategy 6: WithTimezone
  try {
    const startTime = Date.now();
    const count = await countOrdersWithTimezone(shop, startOfMonth, endOfMonth);
    const duration = Date.now() - startTime;
    strategyResults.push({
      name: "WithTimezone",
      status: "success",
      count,
      duration: `${duration}ms`,
      error: null
    });
  } catch (error) {
    strategyResults.push({
      name: "WithTimezone",
      status: "failed",
      count: 0,
      duration: "N/A",
      error: String(error)
    });
  }

  // Strategy 7: InMemory
  try {
    const startTime = Date.now();
    const count = await countOrdersInMemory(shop, startOfMonth, endOfMonth);
    const duration = Date.now() - startTime;
    strategyResults.push({
      name: "InMemory",
      status: "success",
      count,
      duration: `${duration}ms`,
      error: null
    });
  } catch (error) {
    strategyResults.push({
      name: "InMemory",
      status: "failed",
      count: 0,
      duration: "N/A",
      error: String(error)
    });
  }

  // Strategy 8: PreAggregated
  try {
    const startTime = Date.now();
    const count = await getOrCreateMonthlyCount(shop, year, month);
    const duration = Date.now() - startTime;
    strategyResults.push({
      name: "PreAggregated",
      status: "success",
      count,
      duration: `${duration}ms`,
      error: null
    });
  } catch (error) {
    strategyResults.push({
      name: "PreAggregated",
      status: "failed",
      count: 0,
      duration: "N/A",
      error: String(error)
    });
  }

  // Test the master fallback function
  const startTime = Date.now();
  const fallbackResult = await countOrdersWithFallback(shop, startOfMonth, endOfMonth);
  const fallbackDuration = Date.now() - startTime;

  // Get total order count for reference
  const totalOrders = await db.order.count({ where: { shop } });

  // Get sample orders to verify dates
  const sampleOrders = await db.order.findMany({
    where: { shop },
    select: {
      shopifyOrderName: true,
      shopifyCreatedAt: true,
    },
    take: 5,
    orderBy: { shopifyCreatedAt: 'desc' }
  });

  return json({
    shop,
    currentMonth: `${now.toLocaleString('default', { month: 'long' })} ${year}`,
    dateRange: {
      start: startOfMonth.toISOString(),
      end: endOfMonth.toISOString()
    },
    strategyResults,
    fallbackResult: {
      ...fallbackResult,
      duration: `${fallbackDuration}ms`
    },
    totalOrders,
    sampleOrders: sampleOrders.map(o => ({
      name: o.shopifyOrderName,
      date: o.shopifyCreatedAt?.toISOString() || 'N/A'
    }))
  });
}

export default function TestOrderStrategies() {
  const data = useLoaderData<typeof loader>();

  // Prepare data for the table
  const rows = data.strategyResults.map(result => [
    result.name,
    <Badge tone={result.status === "success" ? "success" : "critical"}>
      {result.status}
    </Badge>,
    result.count.toString(),
    result.duration,
    result.error ? (
      <Text as="span" variant="bodySm" tone="critical">
        {result.error.substring(0, 50)}...
      </Text>
    ) : '—'
  ]);

  return (
    <Page title="Order Counting Strategy Test">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Summary Banner */}
            <Banner tone="info">
              <BlockStack gap="200">
                <Text as="p" fontWeight="bold">
                  Testing order counting strategies for {data.currentMonth}
                </Text>
                <Text as="p" variant="bodySm">
                  Date Range: {new Date(data.dateRange.start).toLocaleDateString()} - {new Date(data.dateRange.end).toLocaleDateString()}
                </Text>
                <Text as="p" variant="bodySm">
                  Total Orders in Database: {data.totalOrders}
                </Text>
              </BlockStack>
            </Banner>

            {/* Fallback Result */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Master Fallback Function Result
                </Text>
                <InlineStack gap="400">
                  <Badge tone="success" size="large">
                    {`Strategy Used: ${data.fallbackResult.strategy}`}
                  </Badge>
                  <Badge size="large">
                    {`Count: ${data.fallbackResult.count}`}
                  </Badge>
                  <Badge size="large">
                    {`Duration: ${data.fallbackResult.duration}`}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Strategy Results Table */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Individual Strategy Results
                </Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'numeric', 'text', 'text']}
                  headings={['Strategy', 'Status', 'Count', 'Duration', 'Error']}
                  rows={rows}
                />
              </BlockStack>
            </Card>

            {/* Sample Orders */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Sample Orders (Latest 5)
                </Text>
                <BlockStack gap="200">
                  {data.sampleOrders.map((order, index) => (
                    <InlineStack key={index} gap="400">
                      <Text as="span" fontWeight="semibold">
                        {order.name}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {order.date}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}