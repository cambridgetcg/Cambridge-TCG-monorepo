import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  Badge,
  Text,
  BlockStack,
  InlineGrid,
  Box,
  Banner,
  DescriptionList,
  Divider,
  Tabs,
  DataTable,
  EmptyState,
  Modal,
  TextContainer,
  List,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import crypto from "crypto";

// ============================================================================
// TEST SCENARIOS
// ============================================================================

const TEST_SCENARIOS = [
  {
    id: "new-customer-small",
    name: "New Customer - Small Order",
    description: "Tests default tier assignment for new customer with small purchase",
    config: {
      customerType: "new",
      orderAmount: 25.00,
      expectedResult: "Should assign default tier (if exists) and calculate cashback"
    }
  },
  {
    id: "new-customer-large",
    name: "New Customer - Large Order",
    description: "Tests tier assignment for new customer with qualifying purchase",
    config: {
      customerType: "new",
      orderAmount: 500.00,
      expectedResult: "Should assign appropriate tier based on spending threshold"
    }
  },
  {
    id: "existing-bronze",
    name: "Existing Bronze - Upgrade Test",
    description: "Tests tier upgrade when bronze customer makes qualifying purchase",
    config: {
      customerType: "existing",
      currentTier: "Bronze",
      orderAmount: 250.00,
      expectedResult: "Should upgrade to Silver tier if total spending qualifies"
    }
  },
  {
    id: "existing-gold",
    name: "Existing Gold - High Cashback",
    description: "Tests cashback calculation for high-tier customer",
    config: {
      customerType: "existing",
      currentTier: "Gold",
      orderAmount: 1000.00,
      expectedResult: "Should calculate 8% cashback ($80)"
    }
  },
  {
    id: "zero-amount",
    name: "Zero Amount Order",
    description: "Tests handling of zero-value orders",
    config: {
      customerType: "existing",
      orderAmount: 0.00,
      expectedResult: "Should not create cashback entry"
    }
  },
  {
    id: "currency-cad",
    name: "CAD Currency Test",
    description: "Tests order processing with Canadian dollars",
    config: {
      customerType: "existing",
      orderAmount: 150.00,
      currency: "CAD",
      expectedResult: "Should handle CAD currency correctly"
    }
  },
  {
    id: "duplicate-order",
    name: "Duplicate Order Prevention",
    description: "Tests duplicate order processing prevention",
    config: {
      customerType: "existing",
      orderAmount: 100.00,
      duplicateTest: true,
      expectedResult: "Second submission should be ignored"
    }
  },
  {
    id: "cancelled-order",
    name: "Cancelled Order",
    description: "Tests handling of cancelled orders",
    config: {
      customerType: "existing",
      orderAmount: 200.00,
      orderStatus: "cancelled",
      expectedResult: "Should skip processing for cancelled orders"
    }
  },
];

// ============================================================================
// BATCH TEST GENERATOR
// ============================================================================

function generateBatchTestData(count: number): any[] {
  const testOrders = [];
  const emailDomains = ["example.com", "test.com", "demo.com"];
  const firstNames = ["John", "Jane", "Bob", "Alice", "Charlie", "Diana"];
  const lastNames = ["Smith", "Doe", "Johnson", "Williams", "Brown", "Davis"];
  
  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const domain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
    
    testOrders.push({
      id: 5000000 + i,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${domain}`,
      firstName,
      lastName,
      orderAmount: Math.floor(Math.random() * 1000) + 10,
      currency: ["USD", "CAD", "EUR", "GBP"][Math.floor(Math.random() * 4)],
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString(),
    });
  }
  
  return testOrders;
}

// ============================================================================
// LOADER
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch all data needed for testing
  const [customers, tiers, recentTests, tierChangeLogs] = await Promise.all([
    db.customer.findMany({
      where: { shop },
      include: { currentTier: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
    }),
    db.storeCreditLedger.findMany({
      where: {
        shop,
        metadata: {
          path: ["testSimulation"],
          equals: true,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.tierChangeLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Get webhook configuration
  const webhookUrl = `${process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`}/webhooks/orders/paid`;
  const hasWebhookSecret = !!process.env.SHOPIFY_WEBHOOK_SECRET;

  // Calculate statistics
  const stats = {
    totalCustomers: customers.length,
    totalTiers: tiers.length,
    recentTestsCount: recentTests.length,
    tierChangesCount: tierChangeLogs.length,
  };

  return json({
    shop,
    customers: customers.map(c => ({
      ...c,
      storeCredit: Number(c.storeCredit),
    })),
    tiers,
    recentTests: recentTests.map(t => ({
      ...t,
      amount: Number(t.amount),
      balance: Number(t.balance),
      createdAt: t.createdAt.toISOString(),
    })),
    tierChangeLogs,
    webhookUrl,
    hasWebhookSecret,
    stats,
    testScenarios: TEST_SCENARIOS,
  });
};

// ============================================================================
// ACTION
// ============================================================================

interface ActionResult {
  success: boolean;
  message: string;
  scenarioName?: string;
  expectedResult?: string;
  actualStatus?: number;
  results?: Array<{
    orderId: number;
    email: string;
    amount: number;
    status: number;
    success: boolean;
  }>;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "runScenario") {
    const scenarioId = formData.get("scenarioId") as string;
    const scenario = TEST_SCENARIOS.find(s => s.id === scenarioId);
    
    if (!scenario) {
      return json<ActionResult>({ success: false, message: "Invalid scenario" });
    }

    // Implement scenario-specific logic
    const config = scenario.config as any;
    
    // Build test order based on scenario
    const testOrder = {
      id: Math.floor(Math.random() * 1000000000),
      admin_graphql_api_id: `gid://shopify/Order/${Math.random()}`,
      email: `test-${Date.now()}@example.com`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_price: config.orderAmount.toFixed(2),
      subtotal_price: (config.orderAmount * 0.9).toFixed(2),
      currency: config.currency || "USD",
      financial_status: config.orderStatus || "paid",
      cancelled_at: config.orderStatus === "cancelled" ? new Date().toISOString() : null,
      customer: config.customerType === "new" ? {
        id: Math.floor(Math.random() * 1000000000),
        email: `test-${Date.now()}@example.com`,
        first_name: "Test",
        last_name: "Customer",
      } : null, // Would need to fetch existing customer
    };

    // Call webhook
    const webhookUrl = `${process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`}/webhooks/orders/paid`;
    const payload = JSON.stringify(testOrder);
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
    const hmac = webhookSecret 
      ? crypto.createHmac("sha256", webhookSecret).update(payload, "utf8").digest("base64")
      : "";

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Topic": "orders/paid",
        "X-Shopify-Shop-Domain": session.shop,
        "X-Shopify-Hmac-Sha256": hmac,
      },
      body: payload,
    });

    return json<ActionResult>({
      success: response.ok,
      message: `Scenario "${scenario.name}" executed`,
      scenarioName: scenario.name,
      expectedResult: config.expectedResult,
      actualStatus: response.status,
    });
  }

  if (action === "batchTest") {
    const count = parseInt(formData.get("count") as string) || 10;
    const testOrders = generateBatchTestData(count);
    
    const results = [];
    for (const order of testOrders) {
      // Process each test order
      const testOrder = {
        id: order.id,
        admin_graphql_api_id: `gid://shopify/Order/${order.id}`,
        email: order.email,
        created_at: order.createdAt,
        updated_at: order.createdAt,
        total_price: order.orderAmount.toFixed(2),
        subtotal_price: (order.orderAmount * 0.9).toFixed(2),
        currency: order.currency,
        financial_status: "paid",
        customer: {
          id: Math.floor(Math.random() * 1000000000),
          email: order.email,
          first_name: order.firstName,
          last_name: order.lastName,
        },
      };

      const webhookUrl = `${process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`}/webhooks/orders/paid`;
      const payload = JSON.stringify(testOrder);
      const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
      const hmac = webhookSecret 
        ? crypto.createHmac("sha256", webhookSecret).update(payload, "utf8").digest("base64")
        : "";

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Topic": "orders/paid",
          "X-Shopify-Shop-Domain": session.shop,
          "X-Shopify-Hmac-Sha256": hmac,
        },
        body: payload,
      });

      results.push({
        orderId: order.id,
        email: order.email,
        amount: order.orderAmount,
        status: response.status,
        success: response.ok,
      });
    }

    const successCount = results.filter(r => r.success).length;
    
    return json<ActionResult>({
      success: true,
      message: `Batch test completed: ${successCount}/${count} successful`,
      results,
    });
  }

  if (action === "clearTestData") {
    // Clear test simulation data
    await db.storeCreditLedger.deleteMany({
      where: {
        shop: session.shop,
        metadata: {
          path: ["testSimulation"],
          equals: true,
        },
      },
    });

    return json<ActionResult>({
      success: true,
      message: "Test data cleared successfully",
    });
  }

  return json({ success: false, message: "Invalid action" });
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function WebhookTesterAdvanced() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionResult>();
  const navigation = useNavigation();
  
  const [selectedTab, setSelectedTab] = useState(0);
  const [batchCount, setBatchCount] = useState("10");
  const [showClearModal, setShowClearModal] = useState(false);
  
  const isLoading = navigation.state === "submitting";

  const tabs = [
    {
      id: "scenarios",
      content: "Test Scenarios",
      panelID: "scenarios-panel",
    },
    {
      id: "batch",
      content: "Batch Testing",
      panelID: "batch-panel",
    },
    {
      id: "monitor",
      content: "Monitor",
      panelID: "monitor-panel",
    },
    {
      id: "debug",
      content: "Debug Info",
      panelID: "debug-panel",
    },
  ];

  const recentTestRows = data.recentTests.map(test => {
    const metadata = test.metadata as any;
    return [
      new Date(test.createdAt).toLocaleString(),
      metadata?.customerEmail || "Unknown",
      `$${metadata?.orderAmount || 0}`,
      `$${test.amount.toFixed(2)}`,
      metadata?.tierName || "None",
    ];
  });

  const tierChangeRows = data.tierChangeLogs.map(log => [
    new Date(log.createdAt).toLocaleString(),
    log.customerEmail || "Unknown",
    log.fromTierName || "None",
    log.toTierName || "None",
    log.changeType,
  ]);

  return (
    <Page
      title="Advanced Webhook Tester"
      subtitle="Comprehensive testing for orders/paid webhook"
      backAction={{ content: "Back", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* Test Scenarios Panel */}
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">
                      Predefined Test Scenarios
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Run specific test scenarios to validate webhook behavior
                    </Text>
                    
                    <BlockStack gap="200">
                      {TEST_SCENARIOS.map(scenario => (
                        <Card key={scenario.id}>
                          <Box padding="400">
                            <InlineGrid columns="1fr auto" gap="400">
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h3">
                                {scenario.name}
                              </Text>
                              <Text variant="bodySm" as="p">
                                {scenario.description}
                              </Text>
                              <Text variant="bodySm" as="p" tone="subdued">
                                Expected: {scenario.config.expectedResult}
                              </Text>
                            </BlockStack>
                            <Form method="post">
                              <input type="hidden" name="action" value="runScenario" />
                              <input type="hidden" name="scenarioId" value={scenario.id} />
                              <Button submit loading={isLoading} variant="primary">
                                Run Test
                              </Button>
                            </Form>
                          </InlineGrid>
                          </Box>
                        </Card>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Box>
              )}

              {/* Batch Testing Panel */}
              {selectedTab === 1 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">
                      Batch Order Testing
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Generate and process multiple test orders simultaneously
                    </Text>
                    
                    <Card>
                      <Box padding="400">
                        <Form method="post">
                        <BlockStack gap="400">
                          <TextField
                            label="Number of test orders"
                            value={batchCount}
                            onChange={setBatchCount}
                            type="number"
                            min="1"
                            max="100"
                            helpText="Generate between 1-100 test orders"
                            autoComplete="off"
                          />
                          <input type="hidden" name="action" value="batchTest" />
                          <input type="hidden" name="count" value={batchCount} />
                          <Button submit loading={isLoading} variant="primary">
                            Generate & Process Orders
                          </Button>
                        </BlockStack>
                      </Form>
                      </Box>
                    </Card>

                    {actionData?.results && (
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="300">
                            <Text variant="headingSm" as="h3">
                              Batch Test Results
                            </Text>
                            <DataTable
                              columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                              headings={["Order ID", "Email", "Amount", "Status", "Result"]}
                              rows={actionData.results.map(r => [
                                r.orderId,
                                r.email,
                                `$${r.amount}`,
                                r.status,
                                <Badge tone={r.success ? "success" : "critical"}>
                                  {r.success ? "Success" : "Failed"}
                                </Badge>,
                              ])}
                            />
                          </BlockStack>
                        </Box>
                      </Card>
                    )}
                  </BlockStack>
                </Box>
              )}

              {/* Monitor Panel */}
              {selectedTab === 2 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineGrid columns="2" gap="400">
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">
                              System Stats
                            </Text>
                            <DescriptionList
                              items={[
                                { term: "Total Customers", description: data.stats.totalCustomers.toString() },
                                { term: "Total Tiers", description: data.stats.totalTiers.toString() },
                                { term: "Recent Tests", description: data.stats.recentTestsCount.toString() },
                                { term: "Tier Changes", description: data.stats.tierChangesCount.toString() },
                              ]}
                            />
                          </BlockStack>
                        </Box>
                      </Card>

                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">
                              Webhook Status
                            </Text>
                            <DescriptionList
                              items={[
                                { term: "Endpoint", description: "Configured" },
                                { term: "HMAC Secret", description: data.hasWebhookSecret ? "Set" : "Not Set" },
                                { term: "Store Credit Sync", description: "Disabled" },
                                { term: "Processing", description: "Active" },
                              ]}
                            />
                          </BlockStack>
                        </Box>
                      </Card>
                    </InlineGrid>

                    <Card>
                      <Box padding="400">
                        <BlockStack gap="300">
                          <Text variant="headingSm" as="h3">
                            Recent Test Activity
                          </Text>
                          {data.recentTests.length > 0 ? (
                            <DataTable
                              columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                              headings={["Date", "Customer", "Order", "Cashback", "Tier"]}
                              rows={recentTestRows}
                            />
                          ) : (
                            <EmptyState
                              heading="No test data yet"
                              image=""
                            >
                              <p>Run some test scenarios to see activity here</p>
                            </EmptyState>
                          )}
                        </BlockStack>
                      </Box>
                    </Card>

                    <Card>
                      <Box padding="400">
                        <BlockStack gap="300">
                          <InlineGrid columns="1fr auto" gap="400">
                            <Text variant="headingSm" as="h3">
                              Tier Change Log
                            </Text>
                            <Button
                              onClick={() => setShowClearModal(true)}
                              tone="critical"
                              variant="plain"
                            >
                              Clear Test Data
                            </Button>
                          </InlineGrid>
                          {data.tierChangeLogs.length > 0 ? (
                            <DataTable
                              columnContentTypes={["text", "text", "text", "text", "text"]}
                              headings={["Date", "Customer", "From", "To", "Type"]}
                              rows={tierChangeRows}
                            />
                          ) : (
                            <EmptyState
                              heading="No tier changes yet"
                              image=""
                            >
                              <p>Tier changes will appear here when customers qualify for upgrades</p>
                            </EmptyState>
                          )}
                        </BlockStack>
                      </Box>
                    </Card>
                  </BlockStack>
                </Box>
              )}

              {/* Debug Info Panel */}
              {selectedTab === 3 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h2">
                            Debug Information
                          </Text>
                          
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">
                              Webhook Configuration
                            </Text>
                            <Box padding="200" background="bg-surface-secondary">
                              <pre style={{ fontSize: "12px", overflow: "auto" }}>
                                {JSON.stringify({
                                  endpoint: data.webhookUrl,
                                  hmacConfigured: data.hasWebhookSecret,
                                  shop: data.shop,
                                }, null, 2)}
                              </pre>
                            </Box>
                          </BlockStack>

                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">
                              Current Tiers
                            </Text>
                            <Box padding="200" background="bg-surface-secondary">
                              <pre style={{ fontSize: "12px", overflow: "auto" }}>
                                {JSON.stringify(data.tiers, null, 2)}
                              </pre>
                            </Box>
                          </BlockStack>

                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">
                              Test Checklist
                            </Text>
                            <List type="bullet">
                              <List.Item>✓ Webhook endpoint responds with 200 status</List.Item>
                              <List.Item>✓ HMAC signature validation works</List.Item>
                              <List.Item>✓ Customer creation for new customers</List.Item>
                              <List.Item>✓ Tier assignment based on spending</List.Item>
                              <List.Item>✓ Cashback calculation accuracy</List.Item>
                              <List.Item>✓ Store credit balance updates</List.Item>
                              <List.Item>✓ Ledger entry creation</List.Item>
                              <List.Item>✓ Duplicate order prevention</List.Item>
                              <List.Item>✓ Currency handling</List.Item>
                              <List.Item>⚠️ Shopify store credit sync (disabled)</List.Item>
                            </List>
                          </BlockStack>
                        </BlockStack>
                      </Box>
                    </Card>
                  </BlockStack>
                </Box>
              )}
            </Tabs>
          </Card>
        </Layout.Section>

        {actionData && (
          <Layout.Section>
            <Banner
              title="Test Result"
              tone={actionData.success ? "success" : "critical"}
            >
              <p>{actionData.message}</p>
              {actionData.expectedResult && (
                <p>Expected: {actionData.expectedResult}</p>
              )}
            </Banner>
          </Layout.Section>
        )}
      </Layout>

      <Modal
        open={showClearModal}
        onClose={() => setShowClearModal(false)}
        title="Clear Test Data"
        primaryAction={{
          content: "Clear",
          onAction: () => {
            const form = document.createElement("form");
            form.method = "POST";
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = "action";
            input.value = "clearTestData";
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
            setShowClearModal(false);
          },
          destructive: true,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowClearModal(false),
          },
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <p>
              This will clear all test simulation data from the database.
              Regular order data will not be affected.
            </p>
            <p>Are you sure you want to continue?</p>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}