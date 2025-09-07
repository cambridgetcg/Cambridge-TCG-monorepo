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
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  success: boolean;
  message: string;
  details?: {
    endpoint: string;
    method: string;
    headers: Record<string, string>;
    payload: any;
    response?: {
      status: number;
      body: string;
    };
  };
}

// ============================================================================
// LOADER
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const webhookUrl = `${process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`}/webhooks/orders/paid`;
  
  return json({
    shop: session.shop,
    webhookUrl,
    hasSecret: !!process.env.SHOPIFY_WEBHOOK_SECRET,
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
    customer: {
      id: Math.floor(Math.random() * 1000000000),
      email: customerEmail,
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
  
  const webhookUrl = `${process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`}/webhooks/orders/paid`;
  const payload = JSON.stringify(mockOrder);
  
  // Create HMAC signature if secret is available
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  let hmac = "";
  
  if (webhookSecret) {
    const crypto = await import("crypto");
    hmac = crypto.createHmac("sha256", webhookSecret).update(payload, "utf8").digest("base64");
  }
  
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": "orders/paid",
    "X-Shopify-Shop-Domain": session.shop,
    "X-Shopify-Hmac-Sha256": hmac,
  };
  
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: payload,
    });
    
    const responseBody = await response.text();
    
    return json<TestResult>({
      success: response.ok,
      message: response.ok ? "Webhook test successful!" : `Webhook test failed with status ${response.status}`,
      details: {
        endpoint: webhookUrl,
        method: "POST",
        headers,
        payload: mockOrder,
        response: {
          status: response.status,
          body: responseBody,
        },
      },
    });
  } catch (error) {
    return json<TestResult>({
      success: false,
      message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
  
  const isLoading = navigation.state === "submitting";
  
  const currencyOptions = [
    { label: "USD", value: "USD" },
    { label: "CAD", value: "CAD" },
    { label: "EUR", value: "EUR" },
    { label: "GBP", value: "GBP" },
  ];
  
  return (
    <Page
      title="Simple Webhook Tester"
      subtitle="Test the orders/paid webhook endpoint"
      backAction={{ content: "Back", url: "/app" }}
    >
      <BlockStack gap="400">
        {/* Webhook Info */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Webhook Configuration
            </Text>
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
                  term: "HMAC Secret",
                  description: (
                    <Badge tone={data.hasSecret ? "success" : "warning"}>
                      {data.hasSecret ? "Configured" : "Not configured"}
                    </Badge>
                  ),
                },
              ]}
            />
          </BlockStack>
        </Card>
        
        {/* Test Form */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">
              Test Order
            </Text>
            
            <Form method="post">
              <BlockStack gap="400">
                <TextField
                  label="Customer Email"
                  value={customerEmail}
                  onChange={setCustomerEmail}
                  autoComplete="email"
                />
                
                <InlineGrid columns="2" gap="400">
                  <TextField
                    label="Order Amount"
                    value={orderAmount}
                    onChange={setOrderAmount}
                    prefix="$"
                    type="number"
                    autoComplete="off"
                  />
                  
                  <Select
                    label="Currency"
                    options={currencyOptions}
                    value={currency}
                    onChange={setCurrency}
                  />
                </InlineGrid>
                
                <input type="hidden" name="customerEmail" value={customerEmail} />
                <input type="hidden" name="orderAmount" value={orderAmount} />
                <input type="hidden" name="currency" value={currency} />
                
                <Button
                  variant="primary"
                  submit
                  loading={isLoading}
                >
                  Send Test Webhook
                </Button>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>
        
        {/* Results */}
        {actionData && (
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Test Results
              </Text>
              
              <Banner tone={actionData.success ? "success" : "critical"}>
                <p>{actionData.message}</p>
              </Banner>
              
              {actionData.details && (
                <>
                  <Divider />
                  
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">
                      Request Details
                    </Text>
                    
                    <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm">
                          <Text as="span" fontWeight="semibold">Endpoint:</Text> {actionData.details.endpoint}
                        </Text>
                        <Text as="p" variant="bodySm">
                          <Text as="span" fontWeight="semibold">Method:</Text> {actionData.details.method}
                        </Text>
                      </BlockStack>
                    </Box>
                    
                    {actionData.details.response && (
                      <>
                        <Text variant="headingSm" as="h3">
                          Response
                        </Text>
                        
                        <DescriptionList
                          items={[
                            {
                              term: "Status Code",
                              description: (
                                <Badge tone={actionData.details.response.status === 200 ? "success" : "critical"}>
                                  {actionData.details.response.status}
                                </Badge>
                              ),
                            },
                            {
                              term: "Response Body",
                              description: actionData.details.response.body || "(empty)",
                            },
                          ]}
                        />
                      </>
                    )}
                    
                    <details>
                      <summary style={{ cursor: "pointer", padding: "8px 0" }}>
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          View Payload
                        </Text>
                      </summary>
                      <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                        <pre style={{ fontSize: "12px", overflow: "auto" }}>
                          {JSON.stringify(actionData.details.payload, null, 2)}
                        </pre>
                      </Box>
                    </details>
                  </BlockStack>
                </>
              )}
            </BlockStack>
          </Card>
        )}
        
        {/* Instructions */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              How It Works
            </Text>
            <Text as="p">
              This tester simulates an order payment webhook from Shopify:
            </Text>
            <BlockStack gap="200">
              <Text as="p">1. Creates a mock order with your specified details</Text>
              <Text as="p">2. Generates HMAC signature for authentication</Text>
              <Text as="p">3. Sends POST request to the webhook endpoint</Text>
              <Text as="p">4. Displays the response for debugging</Text>
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}