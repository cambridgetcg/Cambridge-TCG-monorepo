/**
 * Test Route for Order Counting Debug
 * Comprehensive testing of date filtering with AWS Aurora Data API
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { Page, Card, BlockStack, Text, Box, Divider, Banner } from "@shopify/polaris";

interface TestResult {
  testName: string;
  description: string;
  query: string;
  parameters?: any;
  result: any;
  error?: string;
  duration: number;
}

/**
 * Helper to create UTC date at start of day
 */
function createUTCDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
}

/**
 * Format date for display
 */
function formatDateForDisplay(date: Date): string {
  return `${date.toISOString()} (UTC: ${date.toUTCString()})`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;
  const tests: TestResult[] = [];

  // Enable debug mode for this test
  process.env.DEBUG_DATA_API = 'true';

  console.log("[OrderCountTest] Starting comprehensive order count testing for shop:", shop);

  // Test 1: Total order count
  await runTest(tests, {
    testName: "Total Orders",
    description: "Count all orders for the shop without any date filter",
    run: async () => {
      return await db.order.count({ where: { shop } });
    }
  });

  // Test 2: Get sample orders with dates
  await runTest(tests, {
    testName: "Sample Orders",
    description: "Fetch 5 sample orders to inspect their date values",
    run: async () => {
      const orders = await db.order.findMany({
        where: { shop },
        select: {
          id: true,
          shopifyOrderNumber: true,
          shopifyCreatedAt: true,
          createdAt: true,
          totalPrice: true
        },
        take: 5,
        orderBy: { shopifyCreatedAt: 'desc' }
      });

      return orders.map(o => ({
        number: o.shopifyOrderNumber,
        shopifyCreatedAt: o.shopifyCreatedAt?.toISOString(),
        createdAt: o.createdAt?.toISOString(),
        totalPrice: o.totalPrice?.toString()
      }));
    }
  });

  // Test 3: September 2025 UTC range
  await runTest(tests, {
    testName: "September 2025 (UTC)",
    description: "Count orders for September 2025 using UTC dates",
    run: async () => {
      const startOfMonth = createUTCDate(2025, 9, 1, 0, 0, 0, 0);
      const endOfMonth = createUTCDate(2025, 9, 30, 23, 59, 59, 999);

      console.log("[OrderCountTest] September 2025 range:");
      console.log("  Start:", formatDateForDisplay(startOfMonth));
      console.log("  End:", formatDateForDisplay(endOfMonth));

      return await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            gte: startOfMonth,
            lte: endOfMonth
          }
        }
      });
    }
  });

  // Test 4: October 2025 UTC range
  await runTest(tests, {
    testName: "October 2025 (UTC)",
    description: "Count orders for October 2025 using UTC dates",
    run: async () => {
      const startOfMonth = createUTCDate(2025, 10, 1, 0, 0, 0, 0);
      const endOfMonth = createUTCDate(2025, 10, 31, 23, 59, 59, 999);

      console.log("[OrderCountTest] October 2025 range:");
      console.log("  Start:", formatDateForDisplay(startOfMonth));
      console.log("  End:", formatDateForDisplay(endOfMonth));

      return await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            gte: startOfMonth,
            lte: endOfMonth
          }
        }
      });
    }
  });

  // Test 5: Current month
  await runTest(tests, {
    testName: "Current Month",
    description: "Count orders for the current month (dynamic)",
    run: async () => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();

      const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

      console.log("[OrderCountTest] Current month range:");
      console.log("  Start:", formatDateForDisplay(startOfMonth));
      console.log("  End:", formatDateForDisplay(endOfMonth));

      return await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            gte: startOfMonth,
            lte: endOfMonth
          }
        }
      });
    }
  });

  // Test 6: Date range with specific date strings
  await runTest(tests, {
    testName: "September 10-15, 2025",
    description: "Count orders for a specific date range",
    run: async () => {
      const start = new Date('2025-09-10T00:00:00Z');
      const end = new Date('2025-09-15T23:59:59Z');

      console.log("[OrderCountTest] Specific range:");
      console.log("  Start:", formatDateForDisplay(start));
      console.log("  End:", formatDateForDisplay(end));

      return await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            gte: start,
            lte: end
          }
        }
      });
    }
  });

  // Test 7: Orders after a specific date
  await runTest(tests, {
    testName: "Orders after Sept 1, 2025",
    description: "Count all orders created after September 1, 2025",
    run: async () => {
      const afterDate = new Date('2025-09-01T00:00:00Z');

      return await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            gte: afterDate
          }
        }
      });
    }
  });

  // Test 8: Orders before a specific date
  await runTest(tests, {
    testName: "Orders before Oct 1, 2025",
    description: "Count all orders created before October 1, 2025",
    run: async () => {
      const beforeDate = new Date('2025-10-01T00:00:00Z');

      return await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            lt: beforeDate
          }
        }
      });
    }
  });

  // Test 9: Year 2025 orders
  await runTest(tests, {
    testName: "All 2025 Orders",
    description: "Count all orders from year 2025",
    run: async () => {
      const yearStart = new Date('2025-01-01T00:00:00Z');
      const yearEnd = new Date('2025-12-31T23:59:59Z');

      return await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            gte: yearStart,
            lte: yearEnd
          }
        }
      });
    }
  });

  // Test 10: Raw SQL query test
  await runTest(tests, {
    testName: "Raw SQL Count",
    description: "Direct SQL query to count September 2025 orders",
    run: async () => {
      // This bypasses Prisma to test raw SQL
      const result = await db.$queryRaw`
        SELECT COUNT(*) as count
        FROM "Order"
        WHERE shop = ${shop}
          AND "shopifyCreatedAt" >= '2025-09-01 00:00:00'::timestamp
          AND "shopifyCreatedAt" <= '2025-09-30 23:59:59'::timestamp
      `;
      return (result as any)[0]?.count || 0;
    }
  });

  // Disable debug mode after tests
  delete process.env.DEBUG_DATA_API;

  return json({
    shop,
    tests,
    summary: {
      totalTests: tests.length,
      passed: tests.filter(t => !t.error).length,
      failed: tests.filter(t => !!t.error).length,
      totalDuration: tests.reduce((sum, t) => sum + t.duration, 0)
    }
  });
};

async function runTest(tests: TestResult[], config: {
  testName: string;
  description: string;
  run: () => Promise<any>;
}) {
  const startTime = Date.now();
  const test: TestResult = {
    testName: config.testName,
    description: config.description,
    query: "",
    result: null,
    duration: 0
  };

  try {
    test.result = await config.run();
    test.duration = Date.now() - startTime;
    console.log(`[OrderCountTest] ✅ ${config.testName}: ${JSON.stringify(test.result)} (${test.duration}ms)`);
  } catch (error: any) {
    test.error = error.message;
    test.duration = Date.now() - startTime;
    console.error(`[OrderCountTest] ❌ ${config.testName}: ${error.message} (${test.duration}ms)`);
  }

  tests.push(test);
}

export default function TestOrderCount() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Order Count Testing">
      <BlockStack gap="400">
        <Banner
          title="Order Count Debug Tests"
          tone={data.summary.failed > 0 ? "warning" : "success"}
        >
          <Text as="p">
            {data.summary.passed} of {data.summary.totalTests} tests passed
            (Total duration: {data.summary.totalDuration}ms)
          </Text>
        </Banner>

        {data.tests.map((test, index) => (
          <Card key={index}>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                {test.error ? "❌" : "✅"} {test.testName}
              </Text>

              <Text as="p" tone="subdued">
                {test.description}
              </Text>

              <Divider />

              <Box>
                <Text as="span" fontWeight="semibold">Result: </Text>
                <Text as="span" tone={test.error ? "critical" : "success"}>
                  {test.error ? `Error: ${test.error}` : JSON.stringify(test.result, null, 2)}
                </Text>
              </Box>

              <Text as="p" tone="subdued">
                Duration: {test.duration}ms
              </Text>

              {test.query && (
                <Box>
                  <Text as="span" fontWeight="semibold">Query: </Text>
                  <Text as="span" variant="bodyMd">
                    {test.query}
                  </Text>
                </Box>
              )}
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}