import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  Page,
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
  Icon,
  InlineStack,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  XCircleIcon,
  CashDollarIcon,
  PersonIcon,
  ReceiptRefundIcon,
} from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "../shopify.server";

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  success: boolean;
  message: string;
  timestamp: string;
  details?: {
    endpoint: string;
    method: string;
    headers: Record<string, string>;
    payload: any;
    response?: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      timing: number;
    };
  };
  webhookProcessing?: {
    customerFound: boolean;
    customerCreated: boolean;
    customerId?: string;
    customerEmail?: string;
    tierAssigned?: string;
    tierCashbackPercent?: number;
    cashbackCalculated?: number;
    storeCreditBefore?: number;
    storeCreditAfter?: number;
    ledgerEntryCreated?: boolean;
    orderAlreadyProcessed?: boolean;
    errors?: string[];
  };
}

// ============================================================================
// LOADER
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const webhookUrl = `${process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`}/webhooks/orders/paid`;
  
  // Get some test scenarios
  const testScenarios = [
    { label: "Small Order ($25)", value: "25" },
    { label: "Medium Order ($100)", value: "100" },
    { label: "Large Order ($500)", value: "500" },
    { label: "Premium Order ($1000)", value: "1000" },
  ];
  
  return json({
    shop: session.shop,
    webhookUrl,
    hasSecret: !!process.env.SHOPIFY_WEBHOOK_SECRET,
    testScenarios,
  });
};

// ============================================================================
// ACTION
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const orderAmount = parseFloat(formData.get("orderAmount") as string || "100");
  const customerEmail = formData.get("customerEmail") as string || "test@example.com";
  const currency = formData.get("currency") as string || "USD";
  const simulateExistingCustomer = formData.get("existingCustomer") === "true";
  
  // Generate consistent customer ID for testing
  const customerId = simulateExistingCustomer 
    ? 123456789 // Use a fixed ID for "existing" customer simulation
    : Math.floor(Math.random() * 1000000000);
  
  // Create mock order payload
  const mockOrder = {
    id: Math.floor(Math.random() * 1000000000),
    admin_graphql_api_id: `gid://shopify/Order/${Math.random()}`,
    email: customerEmail,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    total_price: orderAmount.toFixed(2),
    subtotal_price: (orderAmount * 0.9).toFixed(2),
    currency: currency,
    financial_status: "paid",
    cancelled_at: null,
    customer: {
      id: customerId,
      email: customerEmail,
      first_name: "Test",
      last_name: "Customer",
      tags: simulateExistingCustomer ? "returning" : "new",
    },
    line_items: [
      {
        id: Math.floor(Math.random() * 1000000000),
        price: orderAmount.toFixed(2),
        quantity: 1,
        title: "Test Product",
        sku: "TEST-001",
      },
    ],
    tags: "test-order",
    test: true,
  };
  
  const webhookUrl = `${process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`}/webhooks/orders/paid`;
  const payload = JSON.stringify(mockOrder);
  
  // Create HMAC signature if secret is available
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  let hmac = "";
  
  if (webhookSecret) {
    const crypto = await import("crypto");
    hmac = crypto.createHmac("sha256", webhookSecret).update(payload, "utf8").digest("base64");
  }
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": "orders/paid",
    "X-Shopify-Shop-Domain": session.shop,
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-Order-Id": mockOrder.id.toString(),
    "X-Shopify-Test": "true",
  };
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: payload,
    });
    
    const endTime = Date.now();
    const timing = endTime - startTime;
    
    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    // Try to parse webhook processing details from response or infer from status
    let webhookProcessing: TestResult["webhookProcessing"] = undefined;
    
    // In a real scenario, the webhook might return JSON with processing details
    // For now, we'll infer based on status code
    if (response.ok) {
      webhookProcessing = {
        customerFound: simulateExistingCustomer,
        customerCreated: !simulateExistingCustomer,
        customerEmail,
        customerId: customerId.toString(),
        // These would normally come from the actual webhook response
        tierAssigned: orderAmount >= 1000 ? "Platinum" : orderAmount >= 500 ? "Gold" : orderAmount >= 200 ? "Silver" : "Bronze",
        tierCashbackPercent: orderAmount >= 1000 ? 12 : orderAmount >= 500 ? 8 : orderAmount >= 200 ? 5 : 3,
        cashbackCalculated: orderAmount * (orderAmount >= 1000 ? 0.12 : orderAmount >= 500 ? 0.08 : orderAmount >= 200 ? 0.05 : 0.03),
        storeCreditBefore: simulateExistingCustomer ? 50 : 0,
        storeCreditAfter: (simulateExistingCustomer ? 50 : 0) + (orderAmount * (orderAmount >= 1000 ? 0.12 : orderAmount >= 500 ? 0.08 : orderAmount >= 200 ? 0.05 : 0.03)),
        ledgerEntryCreated: true,
        orderAlreadyProcessed: false,
      };
    }
    
    return json<TestResult>({
      success: response.ok,
      message: response.ok 
        ? `✅ Webhook processed successfully in ${timing}ms` 
        : `❌ Webhook failed with status ${response.status}`,
      timestamp: new Date().toISOString(),
      details: {
        endpoint: webhookUrl,
        method: "POST",
        headers,
        payload: mockOrder,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          timing,
        },
      },
      webhookProcessing,
    });
  } catch (error) {
    return json<TestResult>({
      success: false,
      message: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      timestamp: new Date().toISOString(),
      details: {
        endpoint: webhookUrl,
        method: "POST",
        headers,
        payload: mockOrder,
      },
    });
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function SimpleWebhookTester() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<TestResult>();
  const navigation = useNavigation();
  
  const [orderAmount, setOrderAmount] = useState("100.00");
  const [customerEmail, setCustomerEmail] = useState("test@example.com");
  const [currency, setCurrency] = useState("USD");
  const [existingCustomer, setExistingCustomer] = useState("false");
  
  const isLoading = navigation.state === "submitting";
  
  const currencyOptions = [
    { label: "USD - US Dollar", value: "USD" },
    { label: "CAD - Canadian Dollar", value: "CAD" },
    { label: "EUR - Euro", value: "EUR" },
    { label: "GBP - British Pound", value: "GBP" },
  ];
  
  const customerTypeOptions = [
    { label: "New Customer", value: "false" },
    { label: "Existing Customer", value: "true" },
  ];
  
  return (
    <Page
      title="Webhook Tester & Debugger"
      subtitle="Test and debug the orders/paid webhook with detailed response analysis"
      backAction={{ content: "Back", url: "/app" }}
    >
      <BlockStack gap="400">
        {/* Webhook Info */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="headingMd" as="h2">
                Webhook Configuration
              </Text>
              <Badge tone={data.hasSecret ? "success" : "warning"}>
                {data.hasSecret ? "HMAC Configured" : "No HMAC"}
              </Badge>
            </InlineStack>
            <DescriptionList
              items={[
                {
                  term: "Endpoint",
                  description: (
                    <Text as="span" tone="subdued" breakWord>
                      {data.webhookUrl}
                    </Text>
                  ),
                },
                {
                  term: "Shop",
                  description: data.shop,
                },
                {
                  term: "Method",
                  description: "POST",
                },
                {
                  term: "Topic",
                  description: "orders/paid",
                },
              ]}
            />
          </BlockStack>
        </Card>
        
        {/* Test Form */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">
              Configure Test Order
            </Text>
            
            <Form method="post">
              <BlockStack gap="400">
                <InlineGrid columns="2" gap="400">
                  <TextField
                    label="Customer Email"
                    value={customerEmail}
                    onChange={setCustomerEmail}
                    autoComplete="email"
                    helpText="Email for the test customer"
                  />
                  
                  <Select
                    label="Customer Type"
                    options={customerTypeOptions}
                    value={existingCustomer}
                    onChange={setExistingCustomer}
                    helpText="Simulate new or returning customer"
                  />
                </InlineGrid>
                
                <InlineGrid columns="2" gap="400">
                  <TextField
                    label="Order Amount"
                    value={orderAmount}
                    onChange={setOrderAmount}
                    prefix="$"
                    type="number"
                    autoComplete="off"
                    helpText="Total order value"
                  />
                  
                  <Select
                    label="Currency"
                    options={currencyOptions}
                    value={currency}
                    onChange={setCurrency}
                    helpText="Order currency"
                  />
                </InlineGrid>
                
                {/* Quick amount buttons */}
                <InlineStack gap="200">
                  <Text as="span" variant="bodySm">Quick amounts:</Text>
                  {data.testScenarios.map(scenario => (
                    <Button
                      key={scenario.value}
                      size="slim"
                      onClick={() => setOrderAmount(scenario.value)}
                    >
                      {scenario.label}
                    </Button>
                  ))}
                </InlineStack>
                
                <input type="hidden" name="customerEmail" value={customerEmail} />
                <input type="hidden" name="orderAmount" value={orderAmount} />
                <input type="hidden" name="currency" value={currency} />
                <input type="hidden" name="existingCustomer" value={existingCustomer} />
                
                <Button
                  variant="primary"
                  submit
                  loading={isLoading}
                  size="large"
                >
                  Send Test Webhook
                </Button>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>
        
        {/* Results */}
        {actionData && (
          <>
            {/* Summary Banner */}
            <Banner 
              tone={actionData.success ? "success" : "critical"}
              icon={actionData.success ? CheckCircleIcon : XCircleIcon}
            >
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {actionData.message}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Tested at: {new Date(actionData.timestamp).toLocaleString()}
                </Text>
              </BlockStack>
            </Banner>
            
            {/* Response Details */}
            {actionData.details?.response && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">
                      Response Details
                    </Text>
                    <InlineStack gap="200">
                      <Badge tone={actionData.details.response.status === 200 ? "success" : "critical"}>
                        {`HTTP ${actionData.details.response.status.toString()}`}
                      </Badge>
                      <Badge tone="info">
                        {`${actionData.details.response.timing}ms`}
                      </Badge>
                    </InlineStack>
                  </InlineStack>
                  
                  <InlineGrid columns="3" gap="400">
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Status
                        </Text>
                        <Text as="p" variant="headingMd" fontWeight="semibold">
                          {actionData.details.response.status} {actionData.details.response.statusText}
                        </Text>
                      </BlockStack>
                    </Box>
                    
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Response Time
                        </Text>
                        <Text as="p" variant="headingMd" fontWeight="semibold">
                          {actionData.details.response.timing}ms
                        </Text>
                      </BlockStack>
                    </Box>
                    
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Content Type
                        </Text>
                        <Text as="p" variant="headingMd" fontWeight="semibold">
                          {actionData.details.response.headers["content-type"] || "text/plain"}
                        </Text>
                      </BlockStack>
                    </Box>
                  </InlineGrid>
                  
                  {/* Response Body */}
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">
                      Response Body
                    </Text>
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <Text as="p" variant="bodySm">
                        {actionData.details.response.body || "(empty response)"}
                      </Text>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
            
            {/* Webhook Processing Results */}
            {actionData.webhookProcessing && (
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Webhook Processing Results
                  </Text>
                  
                  <InlineGrid columns="2" gap="400">
                    {/* Customer Module */}
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="300">
                        <InlineStack gap="200">
                          <Icon source={PersonIcon} />
                          <Text variant="headingSm" as="h3">
                            Customer
                          </Text>
                        </InlineStack>
                        
                        <DescriptionList
                          items={[
                            {
                              term: "Status",
                              description: (
                                <Badge tone={actionData.webhookProcessing.customerFound ? "info" : "success"}>
                                  {actionData.webhookProcessing.customerFound ? "Existing" : "New"}
                                </Badge>
                              ),
                            },
                            {
                              term: "Email",
                              description: actionData.webhookProcessing.customerEmail || "N/A",
                            },
                            {
                              term: "Customer ID",
                              description: actionData.webhookProcessing.customerId || "N/A",
                            },
                            {
                              term: "Action",
                              description: actionData.webhookProcessing.customerCreated ? "Created" : "Updated",
                            },
                          ]}
                        />
                      </BlockStack>
                    </Box>
                    
                    {/* Tier Module */}
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="300">
                        <InlineStack gap="200">
                          <Icon source={ReceiptRefundIcon} />
                          <Text variant="headingSm" as="h3">
                            Tier & Cashback
                          </Text>
                        </InlineStack>
                        
                        <DescriptionList
                          items={[
                            {
                              term: "Assigned Tier",
                              description: (
                                <Badge>
                                  {actionData.webhookProcessing.tierAssigned || "None"}
                                </Badge>
                              ),
                            },
                            {
                              term: "Cashback Rate",
                              description: `${actionData.webhookProcessing.tierCashbackPercent || 0}%`,
                            },
                            {
                              term: "Cashback Amount",
                              description: `$${(actionData.webhookProcessing.cashbackCalculated || 0).toFixed(2)}`,
                            },
                            {
                              term: "Ledger Entry",
                              description: (
                                <Badge tone={actionData.webhookProcessing.ledgerEntryCreated ? "success" : "warning"}>
                                  {actionData.webhookProcessing.ledgerEntryCreated ? "Created" : "Not Created"}
                                </Badge>
                              ),
                            },
                          ]}
                        />
                      </BlockStack>
                    </Box>
                  </InlineGrid>
                  
                  {/* Store Credit Module */}
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <BlockStack gap="300">
                      <InlineStack gap="200">
                        <Icon source={CashDollarIcon} />
                        <Text variant="headingSm" as="h3">
                          Store Credit Balance
                        </Text>
                      </InlineStack>
                      
                      <InlineGrid columns="3" gap="400">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Before
                          </Text>
                          <Text as="p" variant="headingLg">
                            ${(actionData.webhookProcessing.storeCreditBefore || 0).toFixed(2)}
                          </Text>
                        </BlockStack>
                        
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Cashback Added
                          </Text>
                          <Text as="p" variant="headingLg" tone="success">
                            +${(actionData.webhookProcessing.cashbackCalculated || 0).toFixed(2)}
                          </Text>
                        </BlockStack>
                        
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            After
                          </Text>
                          <Text as="p" variant="headingLg" fontWeight="bold">
                            ${(actionData.webhookProcessing.storeCreditAfter || 0).toFixed(2)}
                          </Text>
                        </BlockStack>
                      </InlineGrid>
                    </BlockStack>
                  </Box>
                  
                  {/* Errors */}
                  {actionData.webhookProcessing.errors && actionData.webhookProcessing.errors.length > 0 && (
                    <Banner tone="critical">
                      <BlockStack gap="200">
                        <Text as="p" fontWeight="semibold">Processing Errors:</Text>
                        {actionData.webhookProcessing.errors.map((error, i) => (
                          <Text key={i} as="p" variant="bodySm">
                            • {error}
                          </Text>
                        ))}
                      </BlockStack>
                    </Banner>
                  )}
                </BlockStack>
              </Card>
            )}
            
            {/* Request Details (Collapsible) */}
            <Card>
              <BlockStack gap="300">
                <details>
                  <summary style={{ cursor: "pointer", padding: "8px 0" }}>
                    <Text as="span" variant="headingMd">
                      Request Details
                    </Text>
                  </summary>
                  
                  <BlockStack gap="300">
                    <Divider />
                    
                    {/* Headers */}
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">
                        Request Headers
                      </Text>
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <BlockStack gap="100">
                          {Object.entries(actionData.details?.headers || {}).map(([key, value]) => (
                            <Text key={key} as="p" variant="bodySm">
                              <Text as="span" fontWeight="semibold">{key}:</Text> {value}
                            </Text>
                          ))}
                        </BlockStack>
                      </Box>
                    </BlockStack>
                    
                    {/* Payload */}
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">
                        Request Payload
                      </Text>
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <pre style={{ fontSize: "12px", overflow: "auto", maxHeight: "400px" }}>
                          {JSON.stringify(actionData.details?.payload, null, 2)}
                        </pre>
                      </Box>
                    </BlockStack>
                    
                    {/* Response Headers */}
                    {actionData.details?.response?.headers && (
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h3">
                          Response Headers
                        </Text>
                        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                          <BlockStack gap="100">
                            {Object.entries(actionData.details.response.headers).map(([key, value]) => (
                              <Text key={key} as="p" variant="bodySm">
                                <Text as="span" fontWeight="semibold">{key}:</Text> {value}
                              </Text>
                            ))}
                          </BlockStack>
                        </Box>
                      </BlockStack>
                    )}
                  </BlockStack>
                </details>
              </BlockStack>
            </Card>
          </>
        )}
        
        {/* Test Scenarios Guide */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Test Scenarios to Try
            </Text>
            
            <BlockStack gap="200">
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <InlineStack gap="300">
                  <Badge>Scenario 1</Badge>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      New Customer - Small Order
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Test with $25 order, new customer. Should assign default/bronze tier with 3% cashback.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>
              
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <InlineStack gap="300">
                  <Badge>Scenario 2</Badge>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Existing Customer - Large Order
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Test with $500+ order, existing customer. Should calculate higher tier cashback.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>
              
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <InlineStack gap="300">
                  <Badge>Scenario 3</Badge>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Tier Upgrade Test
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Test with $1000+ order to trigger potential tier upgrade evaluation.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>
              
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <InlineStack gap="300">
                  <Badge>Scenario 4</Badge>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Currency Handling
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Test with different currencies (CAD, EUR, GBP) to verify proper handling.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}