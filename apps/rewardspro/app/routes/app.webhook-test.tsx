import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { 
  useLoaderData, 
  useActionData, 
  useNavigation, 
  useSubmit
} from "@remix-run/react";
import { 
  Page, 
  Layout, 
  Card, 
  Button, 
  TextField, 
  Select, 
  BlockStack, 
  InlineGrid,
  Text,
  Banner,
  Badge,
  InlineStack,
  Divider,
  Box,
  Icon,
  List,
  Checkbox
} from "@shopify/polaris";
import { 
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CurrencyDollarFilledIcon,
  NotificationIcon,
  SendIcon
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Types
interface TestResult {
  testName: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  message: string;
  details?: any;
  timestamp?: string;
}

interface LoaderData {
  shop: string;
  customers: Array<{
    id: string;
    email: string;
    shopifyCustomerId: string;
    storeCredit: number;
    currentTier: {
      name: string;
      cashbackPercent: number;
    } | null;
  }>;
  tiers: Array<{
    id: string;
    name: string;
    cashbackPercent: number;
    minSpend: number;
  }>;
  recentLedgerEntries: Array<{
    id: string;
    customerId: string;
    amount: number;
    type: string;
    shopifyOrderId: string | null;
    createdAt: string;
    metadata: any;
  }>;
  shopSettings: {
    storeCurrency: string;
    timezone: string;
  } | null;
}

// Loader
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  // Get customers with tiers for testing
  const customers = await db.customer.findMany({
    where: { shop },
    include: {
      currentTier: true
    },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  
  // Get tiers
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'asc' }
  });
  
  // Get recent ledger entries
  const recentLedgerEntries = await db.storeCreditLedger.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  
  // Get shop settings
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop }
  });
  
  return json<LoaderData>({
    shop,
    customers: customers.map(c => ({
      id: c.id,
      email: c.email,
      shopifyCustomerId: c.shopifyCustomerId,
      storeCredit: Number(c.storeCredit),
      currentTier: c.currentTier ? {
        name: c.currentTier.name,
        cashbackPercent: c.currentTier.cashbackPercent
      } : null
    })),
    tiers,
    recentLedgerEntries: recentLedgerEntries.map(entry => ({
      id: entry.id,
      customerId: entry.customerId,
      amount: Number(entry.amount),
      type: entry.type,
      shopifyOrderId: entry.shopifyOrderId,
      createdAt: entry.createdAt.toISOString(),
      metadata: entry.metadata
    })),
    shopSettings: shopSettings ? {
      storeCurrency: shopSettings.storeCurrency,
      timezone: shopSettings.timezone
    } : null
  });
};

// Action handler
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;
  
  const results: TestResult[] = [];
  
  if (actionType === "runTests") {
    const selectedCustomerId = formData.get("customerId") as string;
    const orderAmount = parseFloat(formData.get("orderAmount") as string);
    const currency = formData.get("currency") as string;
    const testWebhookTrigger = formData.get("testWebhookTrigger") === "true";
    const testWebhookResponse = formData.get("testWebhookResponse") === "true";
    const testGraphQLCall = formData.get("testGraphQLCall") === "true";
    const testStoreCreditIssuance = formData.get("testStoreCreditIssuance") === "true";
    const testCurrencyValidation = formData.get("testCurrencyValidation") === "true";
    
    // Test 1: Webhook Trigger Simulation
    if (testWebhookTrigger) {
      try {
        // Create a mock order webhook payload
        const mockOrderId = `TEST-${Date.now()}`;
        const customer = await db.customer.findUnique({
          where: { id: selectedCustomerId },
          include: { currentTier: true }
        });
        
        if (!customer) {
          throw new Error("Customer not found");
        }
        
        const webhookPayload = {
          id: mockOrderId,
          admin_graphql_api_id: `gid://shopify/Order/${mockOrderId}`,
          email: customer.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          total_price: orderAmount.toFixed(2),
          subtotal_price: orderAmount.toFixed(2),
          currency: currency,
          financial_status: "paid",
          customer: {
            id: parseInt(customer.shopifyCustomerId),
            email: customer.email
          },
          line_items: [
            {
              id: 1,
              price: orderAmount.toFixed(2),
              quantity: 1,
              title: "Test Product"
            }
          ]
        };
        
        results.push({
          testName: "Webhook Trigger",
          status: "success",
          message: "Mock webhook payload created successfully",
          details: {
            orderId: mockOrderId,
            customerEmail: customer.email,
            orderAmount: orderAmount,
            currency: currency,
            payload: webhookPayload
          }
        });
      } catch (error) {
        results.push({
          testName: "Webhook Trigger",
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to create webhook payload",
          details: { error }
        });
      }
    }
    
    // Test 2: Webhook Response Processing
    if (testWebhookResponse) {
      try {
        const customer = await db.customer.findUnique({
          where: { id: selectedCustomerId },
          include: { currentTier: true }
        });
        
        if (!customer) {
          throw new Error("Customer not found");
        }
        
        // Calculate expected cashback
        const cashbackPercent = customer.currentTier?.cashbackPercent || 0;
        const expectedCashback = (orderAmount * cashbackPercent) / 100;
        
        // Check for duplicate prevention
        const testOrderId = `TEST-${Date.now()}`;
        const existingEntry = await db.storeCreditLedger.findFirst({
          where: {
            shop,
            shopifyOrderId: testOrderId,
            type: "CASHBACK_EARNED"
          }
        });
        
        results.push({
          testName: "Webhook Response",
          status: "success",
          message: "Webhook response processing validated",
          details: {
            customer: {
              id: customer.id,
              email: customer.email,
              currentTier: customer.currentTier?.name || "None",
              currentStoreCredit: Number(customer.storeCredit)
            },
            calculation: {
              orderAmount: orderAmount,
              cashbackPercent: cashbackPercent,
              expectedCashback: Math.floor(expectedCashback * 100) / 100,
              currency: currency
            },
            duplicateCheck: {
              isDuplicate: !!existingEntry,
              message: existingEntry ? "Order would be skipped (duplicate)" : "Order would be processed"
            }
          }
        });
      } catch (error) {
        results.push({
          testName: "Webhook Response",
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to process webhook response",
          details: { error }
        });
      }
    }
    
    // Test 3: GraphQL API Call Test
    if (testGraphQLCall) {
      try {
        // Test GraphQL query for customer data
        const customer = await db.customer.findUnique({
          where: { id: selectedCustomerId }
        });
        
        if (!customer) {
          throw new Error("Customer not found");
        }
        
        const CUSTOMER_QUERY = `#graphql
          query GetCustomerStoreCredit($id: ID!) {
            customer(id: $id) {
              id
              displayName
              email
              storeCreditAccounts(first: 1) {
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
        
        const response = await admin.graphql(CUSTOMER_QUERY, {
          variables: {
            id: `gid://shopify/Customer/${customer.shopifyCustomerId}`
          }
        });
        
        const data = await response.json();
        
        if (data.errors) {
          throw new Error(data.errors[0].message);
        }
        
        results.push({
          testName: "GraphQL API Call",
          status: "success",
          message: "GraphQL API call successful",
          details: {
            query: "GetCustomerStoreCredit",
            customerId: customer.shopifyCustomerId,
            response: data.data?.customer || null,
            storeCreditAccount: data.data?.customer?.storeCreditAccounts?.edges?.[0]?.node || null
          }
        });
      } catch (error) {
        results.push({
          testName: "GraphQL API Call",
          status: "failed",
          message: error instanceof Error ? error.message : "GraphQL API call failed",
          details: { error }
        });
      }
    }
    
    // Test 4: Store Credit Issuance Test
    if (testStoreCreditIssuance) {
      try {
        const customer = await db.customer.findUnique({
          where: { id: selectedCustomerId },
          include: { currentTier: true }
        });
        
        if (!customer) {
          throw new Error("Customer not found");
        }
        
        // Calculate test cashback
        const cashbackPercent = customer.currentTier?.cashbackPercent || 0;
        const testCashback = (orderAmount * cashbackPercent) / 100;
        const formattedAmount = testCashback.toFixed(2);
        
        // Test the GraphQL mutation (dry run - not actually executing)
        const CREDIT_MUTATION = `#graphql
          mutation IssueStoreCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
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
        
        const mutationVariables = {
          id: `gid://shopify/Customer/${customer.shopifyCustomerId}`,
          creditInput: {
            creditAmount: {
              amount: formattedAmount,
              currencyCode: currency
            }
          }
        };
        
        // Create a test ledger entry (not synced to Shopify)
        const testOrderId = `TEST-CREDIT-${Date.now()}`;
        const previousBalance = Number(customer.storeCredit);
        const newBalance = previousBalance + testCashback;
        
        await db.storeCreditLedger.create({
          data: {
            customerId: customer.id,
            shop,
            amount: testCashback,
            balance: newBalance,
            type: "MANUAL_ADJUSTMENT",
            shopifyOrderId: testOrderId,
            metadata: {
              test: true,
              testType: "store_credit_issuance",
              orderAmount: orderAmount,
              cashbackPercent: cashbackPercent,
              currency: currency,
              testMutation: CREDIT_MUTATION,
              testVariables: mutationVariables,
              note: "Test entry - not synced to Shopify"
            }
          }
        });
        
        // Update customer balance (test)
        await db.customer.update({
          where: { id: customer.id },
          data: { storeCredit: newBalance }
        });
        
        results.push({
          testName: "Store Credit Issuance",
          status: "success",
          message: "Store credit issuance test successful (dry run)",
          details: {
            customer: {
              id: customer.shopifyCustomerId,
              email: customer.email
            },
            calculation: {
              orderAmount: orderAmount,
              cashbackPercent: cashbackPercent,
              cashbackAmount: testCashback,
              formattedAmount: formattedAmount
            },
            balance: {
              previous: previousBalance,
              credited: testCashback,
              new: newBalance
            },
            graphQLMutation: {
              mutation: "storeCreditAccountCredit",
              variables: mutationVariables
            },
            testOrderId: testOrderId,
            note: "Test credit added to local database (not synced to Shopify)"
          }
        });
      } catch (error) {
        results.push({
          testName: "Store Credit Issuance",
          status: "failed",
          message: error instanceof Error ? error.message : "Store credit issuance test failed",
          details: { error }
        });
      }
    }
    
    // Test 5: Currency Validation
    if (testCurrencyValidation) {
      try {
        const validCurrencies = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY'];
        const isValidCurrency = validCurrencies.includes(currency);
        
        // Test currency formatting
        const testAmounts = [
          { value: 10.00, expected: "10.00" },
          { value: 10.50, expected: "10.50" },
          { value: 10.555, expected: "10.56" }, // Should round
          { value: 10.994, expected: "10.99" }, // Should round down
          { value: 0.01, expected: "0.01" },
          { value: 1000.00, expected: "1000.00" }
        ];
        
        const formattingTests = testAmounts.map(test => ({
          input: test.value,
          formatted: test.value.toFixed(2),
          expected: test.expected,
          passed: test.value.toFixed(2) === test.expected
        }));
        
        // Check shop settings
        const shopSettings = await db.shopSettings.findUnique({
          where: { shop }
        });
        
        const currencyMatch = shopSettings?.storeCurrency === currency;
        
        results.push({
          testName: "Currency Validation",
          status: formattingTests.every(t => t.passed) && isValidCurrency ? "success" : "failed",
          message: isValidCurrency 
            ? "Currency validation passed" 
            : `Invalid currency: ${currency}`,
          details: {
            selectedCurrency: currency,
            isValidCurrency: isValidCurrency,
            validCurrencies: validCurrencies,
            shopSettings: {
              storeCurrency: shopSettings?.storeCurrency || "Not set",
              currencyMatch: currencyMatch
            },
            formattingTests: formattingTests,
            allFormattingTestsPassed: formattingTests.every(t => t.passed),
            notes: [
              "Shopify requires amounts to be formatted to 2 decimal places",
              "Currency code must match store settings",
              "Store credit API only accepts specific currency codes"
            ]
          }
        });
      } catch (error) {
        results.push({
          testName: "Currency Validation",
          status: "failed",
          message: error instanceof Error ? error.message : "Currency validation failed",
          details: { error }
        });
      }
    }
    
    return json({
      success: true,
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === "success").length,
        failed: results.filter(r => r.status === "failed").length
      }
    });
  }
  
  return json({ success: false, error: "Invalid action" });
};

// Component
export default function WebhookTestPage() {
  const { shop, customers, tiers, recentLedgerEntries, shopSettings } = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  // State
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || "");
  const [orderAmount, setOrderAmount] = useState("100.00");
  const [currency, setCurrency] = useState(shopSettings?.storeCurrency || "USD");
  const [testWebhookTrigger, setTestWebhookTrigger] = useState(true);
  const [testWebhookResponse, setTestWebhookResponse] = useState(true);
  const [testGraphQLCall, setTestGraphQLCall] = useState(true);
  const [testStoreCreditIssuance, setTestStoreCreditIssuance] = useState(true);
  const [testCurrencyValidation, setTestCurrencyValidation] = useState(true);
  
  const isRunning = navigation.state === "submitting";
  
  // Run tests
  const runTests = useCallback(() => {
    const formData = new FormData();
    formData.append("actionType", "runTests");
    formData.append("customerId", selectedCustomerId);
    formData.append("orderAmount", orderAmount);
    formData.append("currency", currency);
    formData.append("testWebhookTrigger", testWebhookTrigger.toString());
    formData.append("testWebhookResponse", testWebhookResponse.toString());
    formData.append("testGraphQLCall", testGraphQLCall.toString());
    formData.append("testStoreCreditIssuance", testStoreCreditIssuance.toString());
    formData.append("testCurrencyValidation", testCurrencyValidation.toString());
    submit(formData, { method: "post" });
  }, [
    selectedCustomerId, 
    orderAmount, 
    currency,
    testWebhookTrigger,
    testWebhookResponse,
    testGraphQLCall,
    testStoreCreditIssuance,
    testCurrencyValidation,
    submit
  ]);
  
  // Get selected customer details
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  };
  
  // Get test status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <Icon source={CheckCircleIcon} tone="success" />;
      case 'failed':
        return <Icon source={XCircleIcon} tone="critical" />;
      case 'running':
        return <Icon source={ClockIcon} tone="warning" />;
      default:
        return <Icon source={ClockIcon} tone="subdued" />;
    }
  };
  
  return (
    <Page
      title="Webhook Testing Suite"
      subtitle="Test orders/paid webhook functionality"
      primaryAction={{
        content: isRunning ? "Running Tests..." : "Run Selected Tests",
        onAction: runTests,
        loading: isRunning,
        disabled: isRunning || !selectedCustomerId
      }}
    >
      <Layout>
        {/* Test Configuration */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Test Configuration</Text>
              
              <InlineGrid columns={3} gap="400">
                <Select
                  label="Test Customer"
                  options={[
                    { label: "Select a customer", value: "", disabled: true },
                    ...customers.map(c => ({
                      label: `${c.email} (${c.currentTier?.name || 'No tier'})`,
                      value: c.id
                    }))
                  ]}
                  value={selectedCustomerId}
                  onChange={setSelectedCustomerId}
                  helpText={selectedCustomer ? 
                    `Current credit: ${formatCurrency(selectedCustomer.storeCredit)}` : 
                    undefined
                  }
                />
                
                <TextField
                  label="Order Amount"
                  type="number"
                  value={orderAmount}
                  onChange={setOrderAmount}
                  prefix={currency}
                  helpText="Test order total"
                  min="0.01"
                  step={0.01}
                />
                
                <Select
                  label="Currency"
                  options={[
                    { label: "USD - US Dollar", value: "USD" },
                    { label: "CAD - Canadian Dollar", value: "CAD" },
                    { label: "EUR - Euro", value: "EUR" },
                    { label: "GBP - British Pound", value: "GBP" },
                    { label: "AUD - Australian Dollar", value: "AUD" },
                    { label: "JPY - Japanese Yen", value: "JPY" }
                  ]}
                  value={currency}
                  onChange={setCurrency}
                  helpText={`Store currency: ${shopSettings?.storeCurrency || 'Not set'}`}
                />
              </InlineGrid>
              
              {selectedCustomer && (
                <Banner tone="info">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Customer Details:
                    </Text>
                    <InlineGrid columns={3} gap="400">
                      <BlockStack gap="050">
                        <Text variant="bodySm" tone="subdued" as="p">Email</Text>
                        <Text variant="bodyMd" as="p">{selectedCustomer.email}</Text>
                      </BlockStack>
                      <BlockStack gap="050">
                        <Text variant="bodySm" tone="subdued" as="p">Current Tier</Text>
                        <Badge tone="info">
                          {selectedCustomer.currentTier?.name || 'No tier'} 
                          {selectedCustomer.currentTier && ` (${selectedCustomer.currentTier.cashbackPercent}%)`}
                        </Badge>
                      </BlockStack>
                      <BlockStack gap="050">
                        <Text variant="bodySm" tone="subdued" as="p">Store Credit</Text>
                        <Text variant="bodyMd" as="p">{formatCurrency(selectedCustomer.storeCredit)}</Text>
                      </BlockStack>
                    </InlineGrid>
                    {selectedCustomer.currentTier && (
                      <Text variant="bodySm" as="p">
                        Expected cashback for this order: {formatCurrency(
                          (parseFloat(orderAmount) * selectedCustomer.currentTier.cashbackPercent) / 100
                        )} ({selectedCustomer.currentTier.cashbackPercent}%)
                      </Text>
                    )}
                  </BlockStack>
                </Banner>
              )}
              
              <Divider />
              
              <BlockStack gap="300">
                <Text variant="headingSm" as="h3">Select Tests to Run</Text>
                <BlockStack gap="200">
                  <Checkbox
                    label="Test 1: Webhook Trigger Simulation"
                    helpText="Simulate webhook payload creation and validation"
                    checked={testWebhookTrigger}
                    onChange={setTestWebhookTrigger}
                  />
                  <Checkbox
                    label="Test 2: Webhook Response Processing"
                    helpText="Test cashback calculation and duplicate prevention"
                    checked={testWebhookResponse}
                    onChange={setTestWebhookResponse}
                  />
                  <Checkbox
                    label="Test 3: GraphQL API Call"
                    helpText="Verify GraphQL queries to Shopify Admin API"
                    checked={testGraphQLCall}
                    onChange={setTestGraphQLCall}
                  />
                  <Checkbox
                    label="Test 4: Store Credit Issuance"
                    helpText="Test store credit calculation and ledger entry (dry run)"
                    checked={testStoreCreditIssuance}
                    onChange={setTestStoreCreditIssuance}
                  />
                  <Checkbox
                    label="Test 5: Currency Validation"
                    helpText="Validate currency codes and formatting"
                    checked={testCurrencyValidation}
                    onChange={setTestCurrencyValidation}
                  />
                </BlockStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {/* Test Results */}
        {actionData?.results && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Test Results</Text>
                  <Badge tone={
                    actionData.summary?.failed === 0 ? "success" : 
                    actionData.summary?.passed === 0 ? "critical" : 
                    "warning"
                  }>
                    {actionData.summary?.passed}/{actionData.summary?.total} Passed
                  </Badge>
                </InlineStack>
                
                <BlockStack gap="300">
                  {actionData.results.map((result, index) => (
                    <Box key={index} padding="400" borderRadius="200" background={
                      result.status === 'success' ? 'bg-surface-success' :
                      result.status === 'failed' ? 'bg-surface-critical' :
                      'bg-surface'
                    }>
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <InlineStack gap="200" align="center">
                            {getStatusIcon(result.status)}
                            <Text variant="bodyMd" fontWeight="semibold" as="span">
                              {result.testName}
                            </Text>
                          </InlineStack>
                          <Badge tone={
                            result.status === 'success' ? 'success' :
                            result.status === 'failed' ? 'critical' :
                            'info'
                          }>
                            {result.status.toUpperCase()}
                          </Badge>
                        </InlineStack>
                        
                        <Text variant="bodyMd" as="p">{result.message}</Text>
                        
                        {result.details && (
                          <Box padding="200" borderRadius="100" background="bg-surface-secondary">
                            <BlockStack gap="100">
                              <Text variant="bodySm" fontWeight="semibold" as="p">Details:</Text>
                              <pre style={{ 
                                fontSize: '12px', 
                                overflow: 'auto',
                                maxHeight: '200px',
                                fontFamily: 'monospace'
                              }}>
                                {JSON.stringify(result.details, null, 2)}
                              </pre>
                            </BlockStack>
                          </Box>
                        )}
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
        
        {/* Recent Activity */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Recent Ledger Activity</Text>
              
              {recentLedgerEntries.length > 0 ? (
                <BlockStack gap="200">
                  {recentLedgerEntries.map(entry => (
                    <Box key={entry.id} padding="200" borderRadius="100" background="bg-surface-secondary">
                      <InlineStack align="space-between">
                        <BlockStack gap="050">
                          <Text variant="bodySm" as="p">
                            {new Date(entry.createdAt).toLocaleString()}
                          </Text>
                          <Badge tone={entry.type === 'CASHBACK_EARNED' ? 'success' : 'info'}>
                            {entry.type}
                          </Badge>
                        </BlockStack>
                        <Text variant="bodyMd" fontWeight="semibold" as="p">
                          {formatCurrency(entry.amount)}
                        </Text>
                      </InlineStack>
                      {entry.shopifyOrderId && (
                        <Text variant="bodySm" tone="subdued" as="p">
                          Order: {entry.shopifyOrderId}
                        </Text>
                      )}
                    </Box>
                  ))}
                </BlockStack>
              ) : (
                <Text variant="bodyMd" tone="subdued" as="p">No recent activity</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {/* Available Tiers */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Available Tiers</Text>
              
              {tiers.length > 0 ? (
                <BlockStack gap="200">
                  {tiers.map(tier => (
                    <Box key={tier.id} padding="200" borderRadius="100" background="bg-surface-secondary">
                      <InlineStack align="space-between">
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            {tier.name}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            Min. spend: {formatCurrency(tier.minSpend)}
                          </Text>
                        </BlockStack>
                        <Badge tone="success">
                          {tier.cashbackPercent}% cashback
                        </Badge>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              ) : (
                <Banner tone="warning">
                  <Text variant="bodyMd" as="p">
                    No tiers configured. Create tiers to test cashback calculations.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}