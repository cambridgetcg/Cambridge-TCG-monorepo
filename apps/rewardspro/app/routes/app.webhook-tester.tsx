import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation, useSubmit } from "@remix-run/react";
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
  RadioButton,
  Checkbox,
  DataTable,
  Modal,
  Frame,
  Toast,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import crypto from "crypto";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface LoaderData {
  shop: string;
  customers: Array<{
    id: string;
    shopifyCustomerId: string;
    email: string;
    storeCredit: number;
    currentTierId: string | null;
    currentTier?: {
      name: string;
      cashbackPercent: number;
    };
  }>;
  tiers: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
    evaluationPeriod: string;
  }>;
  recentWebhooks: Array<{
    id: string;
    customerId: string;
    amount: number;
    type: string;
    createdAt: string;
    metadata: any;
  }>;
  webhookUrl: string;
  webhookSecret?: string;
}

interface ActionData {
  success: boolean;
  message: string;
  webhookResponse?: {
    status: number;
    body: string;
    headers: Record<string, string>;
  };
  processingResults?: {
    customerFound: boolean;
    tierAssigned: string | null;
    cashbackCalculated: number;
    storeCreditBefore: number;
    storeCreditAfter: number;
    tierUpgrade: boolean;
    ledgerEntryCreated: boolean;
    errors: string[];
  };
}

// ============================================================================
// LOADER
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch customers with their tiers
  const customers = await db.customer.findMany({
    where: { shop },
    include: {
      currentTier: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Fetch all tiers
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: "asc" },
  });

  // Fetch recent webhook-related ledger entries
  const recentWebhooks = await db.storeCreditLedger.findMany({
    where: {
      shop,
      type: "CASHBACK_EARNED",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Construct webhook URL (you may need to adjust this based on your setup)
  const appUrl = process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`;
  const webhookUrl = `${appUrl}/webhooks/orders/paid`;

  return json<LoaderData>({
    shop,
    customers: customers.map(c => ({
      ...c,
      storeCredit: Number(c.storeCredit),
    })),
    tiers,
    recentWebhooks: recentWebhooks.map(w => ({
      ...w,
      amount: Number(w.amount),
      createdAt: w.createdAt.toISOString(),
    })),
    webhookUrl,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || undefined,
  });
};

// ============================================================================
// ACTION
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "simulate") {
    // Get form values
    const customerId = formData.get("customerId") as string;
    const orderAmount = parseFloat(formData.get("orderAmount") as string);
    const currency = formData.get("currency") as string;
    const useExistingCustomer = formData.get("useExistingCustomer") === "true";
    const simulateWebhook = formData.get("simulateWebhook") === "true";
    
    // Build mock order payload
    const mockOrder = {
      id: Math.floor(Math.random() * 1000000000),
      admin_graphql_api_id: `gid://shopify/Order/${Math.random()}`,
      email: formData.get("customerEmail") as string || "test@example.com",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_price: orderAmount.toFixed(2),
      subtotal_price: (orderAmount * 0.9).toFixed(2), // Assume 10% tax
      currency: currency,
      financial_status: "paid",
      cancelled_at: null,
      customer: useExistingCustomer && customerId
        ? await db.customer.findUnique({
            where: { id: customerId },
            select: {
              shopifyCustomerId: true,
              email: true,
            },
          }).then(c => c ? {
            id: parseInt(c.shopifyCustomerId),
            email: c.email,
            first_name: "Test",
            last_name: "Customer",
          } : null)
        : {
            id: Math.floor(Math.random() * 1000000000),
            email: formData.get("customerEmail") as string || "test@example.com",
            first_name: "Test",
            last_name: "Customer",
          },
      line_items: [
        {
          id: Math.floor(Math.random() * 1000000000),
          price: orderAmount.toFixed(2),
          quantity: 1,
          title: "Test Product",
        },
      ],
    };

    if (simulateWebhook) {
      // Call the actual webhook endpoint
      try {
        const webhookUrl = `${process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`}/webhooks/orders/paid`;
        
        // Create HMAC signature if secret is available
        const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
        const payload = JSON.stringify(mockOrder);
        const hmac = webhookSecret 
          ? crypto.createHmac("sha256", webhookSecret).update(payload, "utf8").digest("base64")
          : "";

        // Make the request
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

        const responseBody = await response.text();

        // Check what actually happened in the database
        const customer = mockOrder.customer ? await db.customer.findUnique({
          where: {
            shop_shopifyCustomerId: {
              shop: session.shop,
              shopifyCustomerId: mockOrder.customer.id.toString(),
            },
          },
          include: {
            currentTier: true,
            ledgerEntries: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        }) : null;

        return json<ActionData>({
          success: response.ok,
          message: response.ok ? "Webhook simulation successful!" : "Webhook simulation failed",
          webhookResponse: {
            status: response.status,
            body: responseBody,
            headers: Object.fromEntries(response.headers.entries()),
          },
          processingResults: customer ? {
            customerFound: true,
            tierAssigned: customer.currentTier?.name || null,
            cashbackCalculated: customer.ledgerEntries[0]?.amount ? Number(customer.ledgerEntries[0].amount) : 0,
            storeCreditBefore: customer.ledgerEntries[0] 
              ? Number(customer.ledgerEntries[0].balance) - Number(customer.ledgerEntries[0].amount)
              : 0,
            storeCreditAfter: Number(customer.storeCredit),
            tierUpgrade: false, // Would need to check tier change logs
            ledgerEntryCreated: customer.ledgerEntries.length > 0,
            errors: [],
          } : {
            customerFound: false,
            tierAssigned: null,
            cashbackCalculated: 0,
            storeCreditBefore: 0,
            storeCreditAfter: 0,
            tierUpgrade: false,
            ledgerEntryCreated: false,
            errors: ["Customer not found or created"],
          },
        });
      } catch (error) {
        return json<ActionData>({
          success: false,
          message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    } else {
      // Direct processing simulation (without webhook)
      try {
        // Simulate the webhook processing logic directly
        const shopifyCustomerId = mockOrder.customer?.id.toString();
        
        if (!shopifyCustomerId) {
          throw new Error("No customer ID available");
        }

        // Find or create customer
        let customer = await db.customer.findUnique({
          where: {
            shop_shopifyCustomerId: {
              shop: session.shop,
              shopifyCustomerId,
            },
          },
          include: {
            currentTier: true,
          },
        });

        const storeCreditBefore = customer ? Number(customer.storeCredit) : 0;

        if (!customer) {
          customer = await db.customer.create({
            data: {
              shop: session.shop,
              shopifyCustomerId,
              email: mockOrder.customer.email,
              storeCredit: 0,
            },
            include: {
              currentTier: true,
            },
          });
        }

        // Calculate cashback
        const tier = customer.currentTier || await db.tier.findFirst({
          where: {
            shop: session.shop,
            minSpend: 0,
          },
        });

        const cashbackPercent = tier?.cashbackPercent || 0;
        const cashbackAmount = (orderAmount * cashbackPercent) / 100;

        // Create ledger entry
        if (cashbackAmount > 0) {
          const newBalance = storeCreditBefore + cashbackAmount;
          
          await db.storeCreditLedger.create({
            data: {
              customerId: customer.id,
              shop: session.shop,
              amount: cashbackAmount,
              balance: newBalance,
              type: "CASHBACK_EARNED",
              shopifyOrderId: mockOrder.id.toString(),
              metadata: {
                orderId: mockOrder.id.toString(),
                orderAmount,
                cashbackPercent,
                tierName: tier?.name,
                tierId: tier?.id,
                currency: mockOrder.currency,
                customerEmail: mockOrder.customer.email,
                orderDate: mockOrder.created_at,
                testSimulation: true,
              },
            },
          });

          // Update customer balance
          await db.customer.update({
            where: { id: customer.id },
            data: {
              storeCredit: newBalance,
            },
          });
        }

        return json<ActionData>({
          success: true,
          message: "Direct simulation successful!",
          processingResults: {
            customerFound: true,
            tierAssigned: tier?.name || null,
            cashbackCalculated: cashbackAmount,
            storeCreditBefore,
            storeCreditAfter: storeCreditBefore + cashbackAmount,
            tierUpgrade: false,
            ledgerEntryCreated: cashbackAmount > 0,
            errors: [],
          },
        });
      } catch (error) {
        return json<ActionData>({
          success: false,
          message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }
  }

  return json<ActionData>({
    success: false,
    message: "Invalid action",
  });
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function WebhookTester() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const isLoading = navigation.state === "submitting";
  
  // Form state
  const [useExistingCustomer, setUseExistingCustomer] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState(data.customers[0]?.id || "");
  const [customerEmail, setCustomerEmail] = useState("test@example.com");
  const [orderAmount, setOrderAmount] = useState("100.00");
  const [currency, setCurrency] = useState("USD");
  const [simulateWebhook, setSimulateWebhook] = useState(true);
  const [showResults, setShowResults] = useState(false);

  // Toast state
  const [toastActive, setToastActive] = useState(false);
  const toggleToast = useCallback(() => setToastActive(active => !active), []);

  useEffect(() => {
    if (actionData) {
      setShowResults(true);
      setToastActive(true);
    }
  }, [actionData]);

  const customerOptions = data.customers.map(c => ({
    label: `${c.email} (Credit: $${c.storeCredit.toFixed(2)})`,
    value: c.id,
  }));

  const currencyOptions = [
    { label: "USD - US Dollar", value: "USD" },
    { label: "CAD - Canadian Dollar", value: "CAD" },
    { label: "EUR - Euro", value: "EUR" },
    { label: "GBP - British Pound", value: "GBP" },
  ];

  const recentWebhooksRows = data.recentWebhooks.map(w => {
    const metadata = w.metadata as any;
    return [
      new Date(w.createdAt).toLocaleString(),
      metadata?.customerEmail || "Unknown",
      `$${metadata?.orderAmount || 0}`,
      `$${w.amount.toFixed(2)}`,
      metadata?.tierName || "None",
      <Badge tone={metadata?.shopifySyncStatus === "SUCCESS" ? "success" : "info"}>
        {metadata?.shopifySyncStatus || "Not Synced"}
      </Badge>,
    ];
  });

  return (
    <Frame>
      <Page
        title="Webhook Tester - Orders/Paid"
        subtitle="Test and debug the orders/paid webhook functionality"
        backAction={{ content: "Back", url: "/app" }}
      >
        <BlockStack gap="400">
          {/* Webhook Info Card */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Webhook Endpoint Information
              </Text>
              <DescriptionList
                items={[
                  {
                    term: "Endpoint URL",
                    description: (
                      <Text as="span" tone="subdued">
                        {data.webhookUrl}
                      </Text>
                    ),
                  },
                  {
                    term: "Topic",
                    description: "orders/paid",
                  },
                  {
                    term: "HMAC Secret",
                    description: data.webhookSecret ? "Configured ✓" : "Not configured",
                  },
                ]}
              />
            </BlockStack>
          </Card>

          {/* Test Configuration */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Test Configuration
              </Text>
              
              <Form method="post">
                <BlockStack gap="400">
                  {/* Customer Selection */}
                  <BlockStack gap="200">
                    <RadioButton
                      label="Use existing customer"
                      checked={useExistingCustomer}
                      id="existing"
                      onChange={() => setUseExistingCustomer(true)}
                    />
                    {useExistingCustomer && (
                      <Box paddingInlineStart="600">
                        <Select
                          label="Select Customer"
                          options={customerOptions}
                          value={selectedCustomerId}
                          onChange={setSelectedCustomerId}
                          disabled={!useExistingCustomer}
                        />
                      </Box>
                    )}
                    
                    <RadioButton
                      label="Create new customer"
                      checked={!useExistingCustomer}
                      id="new"
                      onChange={() => setUseExistingCustomer(false)}
                    />
                    {!useExistingCustomer && (
                      <Box paddingInlineStart="600">
                        <TextField
                          label="Customer Email"
                          value={customerEmail}
                          onChange={setCustomerEmail}
                          autoComplete="email"
                          disabled={useExistingCustomer}
                        />
                      </Box>
                    )}
                  </BlockStack>

                  <Divider />

                  {/* Order Details */}
                  <InlineGrid columns="2" gap="400">
                    <TextField
                      label="Order Amount"
                      value={orderAmount}
                      onChange={setOrderAmount}
                      prefix="$"
                      type="number"
                      step="0.01"
                      autoComplete="off"
                    />
                    <Select
                      label="Currency"
                      options={currencyOptions}
                      value={currency}
                      onChange={setCurrency}
                    />
                  </InlineGrid>

                  <Divider />

                  {/* Simulation Options */}
                  <Checkbox
                    label="Simulate full webhook call (with HMAC signature)"
                    checked={simulateWebhook}
                    onChange={setSimulateWebhook}
                    helpText="When enabled, makes an actual HTTP request to the webhook endpoint"
                  />

                  {/* Hidden form fields */}
                  <input type="hidden" name="action" value="simulate" />
                  <input type="hidden" name="useExistingCustomer" value={useExistingCustomer.toString()} />
                  <input type="hidden" name="customerId" value={selectedCustomerId} />
                  <input type="hidden" name="customerEmail" value={customerEmail} />
                  <input type="hidden" name="orderAmount" value={orderAmount} />
                  <input type="hidden" name="currency" value={currency} />
                  <input type="hidden" name="simulateWebhook" value={simulateWebhook.toString()} />

                  <Button
                    variant="primary"
                    submit
                    loading={isLoading}
                  >
                    Run Test
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>

          {/* Test Results */}
          {showResults && actionData && (
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Test Results
                </Text>
                
                {actionData.success ? (
                  <Banner tone="success">
                    <p>{actionData.message}</p>
                  </Banner>
                ) : (
                  <Banner tone="critical">
                    <p>{actionData.message}</p>
                  </Banner>
                )}

                {actionData.webhookResponse && (
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">
                      Webhook Response
                    </Text>
                    <DescriptionList
                      items={[
                        {
                          term: "Status Code",
                          description: (
                            <Badge tone={actionData.webhookResponse.status === 200 ? "success" : "critical"}>
                              {actionData.webhookResponse.status}
                            </Badge>
                          ),
                        },
                        {
                          term: "Response Body",
                          description: actionData.webhookResponse.body || "(empty)",
                        },
                      ]}
                    />
                  </BlockStack>
                )}

                {actionData.processingResults && (
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">
                      Processing Results
                    </Text>
                    <DescriptionList
                      items={[
                        {
                          term: "Customer Found/Created",
                          description: (
                            <Badge tone={actionData.processingResults.customerFound ? "success" : "warning"}>
                              {actionData.processingResults.customerFound ? "Yes" : "No"}
                            </Badge>
                          ),
                        },
                        {
                          term: "Tier Assigned",
                          description: actionData.processingResults.tierAssigned || "None",
                        },
                        {
                          term: "Cashback Calculated",
                          description: `$${actionData.processingResults.cashbackCalculated.toFixed(2)}`,
                        },
                        {
                          term: "Store Credit",
                          description: `$${actionData.processingResults.storeCreditBefore.toFixed(2)} → $${actionData.processingResults.storeCreditAfter.toFixed(2)}`,
                        },
                        {
                          term: "Ledger Entry Created",
                          description: (
                            <Badge tone={actionData.processingResults.ledgerEntryCreated ? "success" : "info"}>
                              {actionData.processingResults.ledgerEntryCreated ? "Yes" : "No"}
                            </Badge>
                          ),
                        },
                      ]}
                    />
                    {actionData.processingResults.errors.length > 0 && (
                      <Banner tone="critical">
                        <BlockStack gap="200">
                          <p>Errors encountered:</p>
                          <ul>
                            {actionData.processingResults.errors.map((error, i) => (
                              <li key={i}>{error}</li>
                            ))}
                          </ul>
                        </BlockStack>
                      </Banner>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          )}

          {/* Recent Webhook Activity */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Recent Webhook Activity
              </Text>
              {data.recentWebhooks.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric", "text", "text"]}
                  headings={["Date", "Customer", "Order", "Cashback", "Tier", "Sync Status"]}
                  rows={recentWebhooksRows}
                />
              ) : (
                <Banner tone="info">
                  <p>No recent webhook activity found</p>
                </Banner>
              )}
            </BlockStack>
          </Card>

          {/* Test Scenarios */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Test Scenarios
              </Text>
              <BlockStack gap="200">
                <Text variant="bodySm" as="p">
                  Try these scenarios to test different aspects:
                </Text>
                <ul>
                  <li>New customer with no tier - Should assign default tier</li>
                  <li>Existing customer with tier - Should calculate cashback based on tier percentage</li>
                  <li>Large order amount - Should test tier upgrade logic</li>
                  <li>Different currencies - Should handle currency correctly</li>
                  <li>Zero amount order - Should not create cashback</li>
                  <li>Duplicate order ID - Should prevent duplicate processing</li>
                </ul>
              </BlockStack>
            </BlockStack>
          </Card>
        </BlockStack>

        {toastActive && actionData && (
          <Toast
            content={actionData.message}
            onDismiss={toggleToast}
            error={!actionData.success}
          />
        )}
      </Page>
    </Frame>
  );
}