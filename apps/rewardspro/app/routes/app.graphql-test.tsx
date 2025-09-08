import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit } from "@remix-run/react";
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
  Divider
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============================================================================
// TYPES
// ============================================================================

interface GraphQLTestResult {
  success: boolean;
  query: string;
  variables: any;
  rawResponse?: any;
  parsedData?: any;
  databaseMapping?: any;
  databaseCreditBalance?: any;
  error?: string;
  executionTime?: number;
}

// ============================================================================
// LOADER - Get shop info
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Get existing tiers for reference
  const tiers = await db.tier.findMany({
    where: { shop: session.shop },
    orderBy: { minSpend: 'asc' }
  });

  return json({
    shop: session.shop,
    tiers
  });
};

// ============================================================================
// ACTION - Execute GraphQL query
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const queryType = formData.get("queryType") as string;
  const customQuery = formData.get("customQuery") as string;
  const customerId = formData.get("customerId") as string;
  const batchSize = parseInt(formData.get("batchSize") as string || "3");
  
  const startTime = Date.now();
  
  try {
    let query = "";
    let variables: any = {};
    
    // Build query based on type
    switch (queryType) {
      case "shopifyCreditBalance":
        // Query specifically for store credit metafield
        query = `#graphql
          query GetCustomerStoreCredit($id: ID!) {
            customer(id: $id) {
              id
              email
              displayName
              metafield(namespace: "rewards_pro", key: "store_credit") {
                id
                namespace
                key
                value
                type
                createdAt
                updatedAt
              }
              metafields(first: 20, namespace: "rewards_pro") {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                    type
                    description
                    createdAt
                    updatedAt
                  }
                }
              }
            }
          }
        `;
        variables = { id: customerId };
        break;
        
      case "creditBalance":
        query = `#graphql
          query GetCustomerWithMetafields($id: ID!) {
            customer(id: $id) {
              id
              email
              firstName
              lastName
              displayName
              state
              createdAt
              updatedAt
              numberOfOrders
              amountSpent {
                amount
                currencyCode
              }
              metafields(first: 10, namespace: "rewards_pro") {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                    type
                    description
                    createdAt
                    updatedAt
                  }
                }
              }
            }
          }
        `;
        variables = { id: customerId };
        break;
        
      case "updateCredit":
        // This would update a customer's credit balance via metafield
        const creditAmount = formData.get("creditAmount") as string || "0";
        query = `#graphql
          mutation UpdateCustomerCredit($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
                email
                metafields(first: 10, namespace: "rewards_pro") {
                  edges {
                    node {
                      id
                      namespace
                      key
                      value
                      type
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        variables = {
          input: {
            id: customerId,
            metafields: [
              {
                namespace: "rewards_pro",
                key: "store_credit",
                value: creditAmount,
                type: "number_decimal"
              },
              {
                namespace: "rewards_pro",
                key: "last_updated",
                value: new Date().toISOString(),
                type: "date_time"
              }
            ]
          }
        };
        break;
        
      case "single":
        query = `#graphql
          query GetCustomer($id: ID!) {
            customer(id: $id) {
              id
              email
              firstName
              lastName
              displayName
              state
              verifiedEmail
              taxExempt
              tags
              note
              createdAt
              updatedAt
              numberOfOrders
              amountSpent {
                amount
                currencyCode
              }
              lastOrder {
                id
                name
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
              defaultAddress {
                address1
                address2
                city
                province
                country
                zip
                phone
                provinceCode
                countryCodeV2
              }
              metafields(first: 5, namespace: "rewards_pro") {
                edges {
                  node {
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        `;
        variables = { id: customerId };
        break;
        
      case "batch":
        query = `#graphql
          query GetCustomersBatch($first: Int!) {
            customers(first: $first, sortKey: CREATED_AT) {
              edges {
                cursor
                node {
                  id
                  email
                  firstName
                  lastName
                  displayName
                  state
                  verifiedEmail
                  taxExempt
                  tags
                  note
                  createdAt
                  updatedAt
                  numberOfOrders
                  amountSpent {
                    amount
                    currencyCode
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
        variables = { first: batchSize };
        break;
        
      case "minimal":
        query = `#graphql
          query GetCustomersMinimal($first: Int!) {
            customers(first: $first, sortKey: CREATED_AT) {
              edges {
                node {
                  id
                  email
                  state
                  createdAt
                  updatedAt
                  amountSpent {
                    amount
                    currencyCode
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;
        variables = { first: batchSize };
        break;
        
      case "custom":
        query = customQuery;
        // Try to parse variables from the query
        if (customerId) {
          variables = { id: customerId };
        }
        break;
        
      default:
        throw new Error("Invalid query type");
    }
    
    // Execute GraphQL query
    const response = await admin.graphql(query, { variables });
    const rawResponse = await response.json();
    
    // Parse the response
    let parsedData = null;
    let databaseMapping = null;
    let databaseCreditBalance = null;
    
    if (rawResponse.data) {
      // Extract customer data based on query type
      if (queryType === "shopifyCreditBalance" && rawResponse.data.customer) {
        parsedData = rawResponse.data.customer;
        
        // Extract the Shopify customer ID
        const shopifyCustomerId = parsedData.id?.replace('gid://shopify/Customer/', '') || '';
        
        // Get store credit from single metafield query
        const storeCreditMetafield = parsedData.metafield;
        
        // Also extract all metafields
        const metafields: any = {};
        if (parsedData.metafields?.edges) {
          parsedData.metafields.edges.forEach((edge: any) => {
            metafields[edge.node.key] = {
              value: edge.node.value,
              type: edge.node.type,
              id: edge.node.id,
              updatedAt: edge.node.updatedAt
            };
          });
        }
        
        // Get database customer for comparison
        const existingCustomer = await db.customer.findUnique({
          where: {
            shop_shopifyCustomerId: {
              shop: session.shop,
              shopifyCustomerId
            }
          }
        });
        
        // Get tier if customer exists
        let currentTier = null;
        if (existingCustomer && existingCustomer.currentTierId) {
          currentTier = await db.tier.findUnique({
            where: { id: existingCustomer.currentTierId }
          });
        }
        
        databaseCreditBalance = {
          shopifyMetafield: {
            storeCreditValue: storeCreditMetafield?.value || null,
            storeCreditType: storeCreditMetafield?.type || null,
            lastUpdated: storeCreditMetafield?.updatedAt || null,
            metafieldId: storeCreditMetafield?.id || null,
            allMetafields: metafields
          },
          databaseComparison: {
            shopifyCredit: parseFloat(storeCreditMetafield?.value || "0"),
            databaseCredit: existingCustomer ? parseFloat(existingCustomer.storeCredit.toString()) : 0,
            isInSync: existingCustomer ? 
              Math.abs(parseFloat(storeCreditMetafield?.value || "0") - parseFloat(existingCustomer.storeCredit.toString())) < 0.01 : false,
            currentTier: currentTier ? {
              name: currentTier.name,
              cashbackPercent: currentTier.cashbackPercent
            } : null
          },
          recommendations: [
            !storeCreditMetafield ? "No store credit metafield found in Shopify" : null,
            !existingCustomer ? "Customer not found in database - needs sync" : null,
            existingCustomer && !storeCreditMetafield ? "Database has credit but Shopify doesn't - needs metafield creation" : null,
            existingCustomer && storeCreditMetafield && 
              Math.abs(parseFloat(storeCreditMetafield.value || "0") - parseFloat(existingCustomer.storeCredit.toString())) >= 0.01 ?
              `Credit mismatch: Shopify has ${storeCreditMetafield.value}, Database has ${existingCustomer.storeCredit}` : null
          ].filter(Boolean)
        };
      } else if (queryType === "creditBalance" && rawResponse.data.customer) {
        parsedData = rawResponse.data.customer;
        
        // Extract the Shopify customer ID
        const shopifyCustomerId = parsedData.id?.replace('gid://shopify/Customer/', '') || '';
        
        // Check if customer exists in database and get their credit balance
        const existingCustomer = await db.customer.findUnique({
          where: {
            shop_shopifyCustomerId: {
              shop: session.shop,
              shopifyCustomerId
            }
          }
        });
        
        // Get tier and recent transactions if customer exists
        let currentTier = null;
        let creditLedger: any[] = [];
        
        if (existingCustomer) {
          currentTier = existingCustomer.currentTierId ? 
            await db.tier.findUnique({
              where: { id: existingCustomer.currentTierId }
            }) : null;
            
          creditLedger = await db.storeCreditLedger.findMany({
            where: { customerId: existingCustomer.id },
            orderBy: { createdAt: 'desc' },
            take: 5
          });
        }
        
        // Extract metafield data if any
        const metafields: any = {};
        if (parsedData.metafields?.edges) {
          parsedData.metafields.edges.forEach((edge: any) => {
            metafields[edge.node.key] = {
              value: edge.node.value,
              type: edge.node.type,
              id: edge.node.id
            };
          });
        }
        
        databaseCreditBalance = {
          shopifyData: {
            id: parsedData.id,
            email: parsedData.email,
            displayName: parsedData.displayName,
            totalSpent: parsedData.amountSpent,
            numberOfOrders: parsedData.numberOfOrders,
            metafields
          },
          databaseData: existingCustomer ? {
            id: existingCustomer.id,
            storeCredit: existingCustomer.storeCredit.toString(),
            currentTier: currentTier,
            recentTransactions: creditLedger.map((ledger: any) => ({
              id: ledger.id,
              amount: ledger.amount.toString(),
              balance: ledger.balance.toString(),
              type: ledger.type,
              createdAt: ledger.createdAt,
              metadata: ledger.metadata
            }))
          } : null,
          syncStatus: existingCustomer ? 'SYNCED' : 'NOT_IN_DATABASE',
          suggestedActions: !existingCustomer ? [
            'Customer not found in database',
            'Run customer sync to import this customer',
            'Or manually create customer record'
          ] : []
        };
      } else if (queryType === "updateCredit" && rawResponse.data.customerUpdate) {
        parsedData = rawResponse.data.customerUpdate;
        
        // Extract metafields from the updated customer
        const metafields: any = {};
        if (parsedData.customer?.metafields?.edges) {
          parsedData.customer.metafields.edges.forEach((edge: any) => {
            metafields[edge.node.key] = {
              value: edge.node.value,
              type: edge.node.type
            };
          });
        }
        
        databaseCreditBalance = {
          mutationResult: {
            success: !parsedData.userErrors || parsedData.userErrors.length === 0,
            errors: parsedData.userErrors,
            customerId: parsedData.customer?.id,
            email: parsedData.customer?.email,
            updatedMetafields: metafields
          },
          nextSteps: [
            'Sync this change to your database',
            'Update the customer record in your StoreCreditLedger',
            'Consider triggering tier recalculation'
          ]
        };
      } else if (queryType === "single" && rawResponse.data.customer) {
        parsedData = rawResponse.data.customer;
        databaseMapping = mapCustomerToDatabase(parsedData, session.shop);
      } else if (rawResponse.data.customers?.edges) {
        parsedData = rawResponse.data.customers.edges.map((edge: any) => edge.node);
        databaseMapping = parsedData.map((customer: any) => 
          mapCustomerToDatabase(customer, session.shop)
        );
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    return json<GraphQLTestResult>({
      success: true,
      query,
      variables,
      rawResponse,
      parsedData,
      databaseMapping,
      databaseCreditBalance,
      executionTime
    });
    
  } catch (error) {
    return json<GraphQLTestResult>({
      success: false,
      query: "",
      variables: {},
      error: error instanceof Error ? error.message : "Unknown error",
      executionTime: Date.now() - startTime
    });
  }
};

// ============================================================================
// HELPER - Map customer to database format
// ============================================================================

function mapCustomerToDatabase(customer: any, shop: string) {
  // Extract Shopify customer ID
  const shopifyCustomerId = customer.id?.replace('gid://shopify/Customer/', '') || '';
  
  // Calculate total spending
  const totalSpending = parseFloat(customer.amountSpent?.amount || "0");
  
  return {
    // Fields that exist in our Customer model
    databaseFields: {
      shop,
      shopifyCustomerId,
      email: customer.email || `customer_${shopifyCustomerId}@placeholder.local`,
      storeCredit: 0,
      currentTierId: null // Will be calculated based on spending
    },
    
    // Additional data from GraphQL
    graphqlData: {
      id: customer.id,
      displayName: customer.displayName,
      firstName: customer.firstName,
      lastName: customer.lastName,
      state: customer.state,
      verifiedEmail: customer.verifiedEmail,
      taxExempt: customer.taxExempt,
      tags: customer.tags,
      note: customer.note,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      numberOfOrders: customer.numberOfOrders,
      totalSpending,
      currency: customer.amountSpent?.currencyCode,
      lastOrder: customer.lastOrder,
      defaultAddress: customer.defaultAddress,
      metafields: customer.metafields
    },
    
    // Validation info
    validation: {
      hasEmail: !!customer.email,
      isActive: customer.state === 'ENABLED',
      isInvited: customer.state === 'INVITED',
      isDisabled: customer.state === 'DISABLED',
      willSync: true, // We sync all customers now
      needsPlaceholderEmail: !customer.email
    }
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function GraphQLTestPage() {
  const actionData = useActionData<GraphQLTestResult>();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const [queryType, setQueryType] = useState("creditBalance");
  const [customerId, setCustomerId] = useState("");
  const [batchSize, setBatchSize] = useState("3");
  const [customQuery, setCustomQuery] = useState("");
  const [creditAmount, setCreditAmount] = useState("0.00");
  
  const isLoading = navigation.state === "submitting";
  
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("queryType", queryType);
    formData.append("customerId", customerId);
    formData.append("batchSize", batchSize);
    formData.append("customQuery", customQuery);
    formData.append("creditAmount", creditAmount);
    submit(formData, { method: "post" });
  }, [queryType, customerId, batchSize, customQuery, creditAmount, submit]);
  
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);
  
  return (
    <Page
      title="GraphQL Customer Test"
      subtitle="Test GraphQL queries and see database mapping"
      primaryAction={{
        content: "Run Query",
        loading: isLoading,
        onAction: handleSubmit
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Query Configuration</Text>
              
              <FormLayout>
                <Select
                  label="Query Type"
                  options={[
                    { label: "Shopify Credit Balance (metafield)", value: "shopifyCreditBalance" },
                    { label: "Credit Balance Test (metafields + DB)", value: "creditBalance" },
                    { label: "Update Credit (mutation)", value: "updateCredit" },
                    { label: "Minimal (only required fields)", value: "minimal" },
                    { label: "Batch (standard fields)", value: "batch" },
                    { label: "Single Customer (all fields)", value: "single" },
                    { label: "Custom Query", value: "custom" }
                  ]}
                  value={queryType}
                  onChange={setQueryType}
                  helpText={
                    queryType === "shopifyCreditBalance" ? "Fetches store credit from Shopify metafields and compares with database" :
                    queryType === "creditBalance" ? "Tests customer credit balance sync between Shopify and database" :
                    queryType === "updateCredit" ? "Updates customer credit via Shopify metafields" :
                    undefined
                  }
                />
                
                {(queryType === "single" || queryType === "creditBalance" || queryType === "updateCredit" || queryType === "shopifyCreditBalance") && (
                  <TextField
                    label="Customer ID"
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="gid://shopify/Customer/123456789"
                    helpText="Enter the full GraphQL ID"
                    autoComplete="off"
                  />
                )}
                
                {queryType === "updateCredit" && (
                  <TextField
                    label="Credit Amount"
                    type="number"
                    value={creditAmount}
                    onChange={setCreditAmount}
                    prefix="$"
                    placeholder="0.00"
                    helpText="Amount to set as store credit in metafield"
                    autoComplete="off"
                  />
                )}
                
                {(queryType === "batch" || queryType === "minimal") && (
                  <TextField
                    label="Batch Size"
                    type="number"
                    value={batchSize}
                    onChange={setBatchSize}
                    helpText="Number of customers to fetch"
                    autoComplete="off"
                  />
                )}
                
                {queryType === "custom" && (
                  <TextField
                    label="Custom GraphQL Query"
                    value={customQuery}
                    onChange={setCustomQuery}
                    multiline={6}
                    placeholder={`query GetCustomer($id: ID!) {
  customer(id: $id) {
    id
    email
  }
}`}
                    autoComplete="off"
                  />
                )}
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {actionData && (
          <>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">Query Result</Text>
                    <Badge tone={actionData.success ? "success" : "critical"}>
                      {actionData.success ? "Success" : "Failed"}
                    </Badge>
                  </InlineStack>
                  
                  {actionData.executionTime && (
                    <Text as="p" tone="subdued">
                      Execution time: {actionData.executionTime}ms
                    </Text>
                  )}
                  
                  {actionData.error && (
                    <Banner tone="critical">
                      <p>{actionData.error}</p>
                    </Banner>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
            
            {actionData.success && (
              <>
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h2">GraphQL Query</Text>
                        <Button onClick={() => copyToClipboard(actionData.query)}>
                          Copy Query
                        </Button>
                      </InlineStack>
                      <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{ overflow: 'auto', fontSize: '12px' }}>
                          {actionData.query}
                        </pre>
                      </Box>
                      
                      <Text variant="headingSm" as="h3">Variables</Text>
                      <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{ overflow: 'auto', fontSize: '12px' }}>
                          {JSON.stringify(actionData.variables, null, 2)}
                        </pre>
                      </Box>
                    </BlockStack>
                  </Card>
                </Layout.Section>
                
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h2">Raw GraphQL Response</Text>
                        <Button onClick={() => copyToClipboard(JSON.stringify(actionData.rawResponse, null, 2))}>
                          Copy Response
                        </Button>
                      </InlineStack>
                      <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{ overflow: 'auto', fontSize: '12px', maxHeight: '400px' }}>
                          {JSON.stringify(actionData.rawResponse, null, 2)}
                        </pre>
                      </Box>
                    </BlockStack>
                  </Card>
                </Layout.Section>
                
                {actionData.databaseCreditBalance && (
                  <Layout.Section>
                    <Card>
                      <BlockStack gap="400">
                        <InlineStack align="space-between">
                          <Text variant="headingMd" as="h2">Credit Balance Analysis</Text>
                          <Button onClick={() => copyToClipboard(JSON.stringify(actionData.databaseCreditBalance, null, 2))}>
                            Copy Analysis
                          </Button>
                        </InlineStack>
                        
                        {/* Show sync status or comparison status */}
                        {actionData.databaseCreditBalance.syncStatus && (
                          <Banner tone={actionData.databaseCreditBalance.syncStatus === 'SYNCED' ? 'info' : 'warning'}>
                            <p>Status: {actionData.databaseCreditBalance.syncStatus}</p>
                          </Banner>
                        )}
                        
                        {/* Shopify Metafield Information */}
                        {actionData.databaseCreditBalance.shopifyMetafield && (
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Shopify Metafield Credit</Text>
                            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <Text as="p">
                                  Store Credit Value: {actionData.databaseCreditBalance.shopifyMetafield.storeCreditValue || 'Not Set'}
                                </Text>
                                <Text as="p">
                                  Metafield Type: {actionData.databaseCreditBalance.shopifyMetafield.storeCreditType || 'N/A'}
                                </Text>
                                {actionData.databaseCreditBalance.shopifyMetafield.lastUpdated && (
                                  <Text as="p">
                                    Last Updated: {new Date(actionData.databaseCreditBalance.shopifyMetafield.lastUpdated).toLocaleString()}
                                  </Text>
                                )}
                                {actionData.databaseCreditBalance.shopifyMetafield.metafieldId && (
                                  <Text as="p" tone="subdued">
                                    Metafield ID: {actionData.databaseCreditBalance.shopifyMetafield.metafieldId}
                                  </Text>
                                )}
                              </BlockStack>
                            </Box>
                          </BlockStack>
                        )}
                        
                        {/* Database vs Shopify Comparison */}
                        {actionData.databaseCreditBalance.databaseComparison && (
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Credit Comparison</Text>
                            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="400">
                                  <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">Shopify:</Text>
                                    <Text as="p" variant="headingLg">
                                      ${actionData.databaseCreditBalance.databaseComparison.shopifyCredit.toFixed(2)}
                                    </Text>
                                  </BlockStack>
                                  <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">Database:</Text>
                                    <Text as="p" variant="headingLg">
                                      ${actionData.databaseCreditBalance.databaseComparison.databaseCredit.toFixed(2)}
                                    </Text>
                                  </BlockStack>
                                  <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">In Sync:</Text>
                                    <Badge tone={actionData.databaseCreditBalance.databaseComparison.isInSync ? "success" : "warning"}>
                                      {actionData.databaseCreditBalance.databaseComparison.isInSync ? "Yes" : "No"}
                                    </Badge>
                                  </BlockStack>
                                </InlineStack>
                                {actionData.databaseCreditBalance.databaseComparison.currentTier && (
                                  <>
                                    <Divider />
                                    <Text as="p">
                                      Current Tier: {actionData.databaseCreditBalance.databaseComparison.currentTier.name} 
                                      ({actionData.databaseCreditBalance.databaseComparison.currentTier.cashbackPercent}% cashback)
                                    </Text>
                                  </>
                                )}
                              </BlockStack>
                            </Box>
                          </BlockStack>
                        )}
                        
                        {/* Original database data display for backward compatibility */}
                        {actionData.databaseCreditBalance.databaseData && (
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Database Credit Info</Text>
                            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <Text as="p">Store Credit: ${actionData.databaseCreditBalance.databaseData.storeCredit}</Text>
                                <Text as="p">Current Tier: {actionData.databaseCreditBalance.databaseData.currentTier?.name || 'None'}</Text>
                                {actionData.databaseCreditBalance.databaseData.currentTier && (
                                  <Text as="p">Cashback Rate: {actionData.databaseCreditBalance.databaseData.currentTier.cashbackPercent}%</Text>
                                )}
                              </BlockStack>
                            </Box>
                          </BlockStack>
                        )}
                        
                        {/* Recommendations for Shopify credit sync */}
                        {actionData.databaseCreditBalance.recommendations?.length > 0 && (
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Sync Recommendations</Text>
                            <Banner tone="info">
                              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {actionData.databaseCreditBalance.recommendations.map((rec: string, index: number) => (
                                  <li key={index}>{rec}</li>
                                ))}
                              </ul>
                            </Banner>
                          </BlockStack>
                        )}
                        
                        {/* Original suggested actions for backward compatibility */}
                        {actionData.databaseCreditBalance.suggestedActions?.length > 0 && (
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Suggested Actions</Text>
                            <Box padding="200" background="bg-surface-caution" borderRadius="200">
                              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {actionData.databaseCreditBalance.suggestedActions.map((action: string, index: number) => (
                                  <li key={index}>{action}</li>
                                ))}
                              </ul>
                            </Box>
                          </BlockStack>
                        )}
                        
                        <Text variant="headingSm" as="h3">Full Analysis</Text>
                        <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                          <pre style={{ overflow: 'auto', fontSize: '12px', maxHeight: '400px' }}>
                            {JSON.stringify(actionData.databaseCreditBalance, null, 2)}
                          </pre>
                        </Box>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                )}
                
                {actionData.databaseMapping && (
                  <Layout.Section>
                    <Card>
                      <BlockStack gap="400">
                        <InlineStack align="space-between">
                          <Text variant="headingMd" as="h2">Database Mapping</Text>
                          <Button onClick={() => copyToClipboard(JSON.stringify(actionData.databaseMapping, null, 2))}>
                            Copy Mapping
                          </Button>
                        </InlineStack>
                        <Text as="p" tone="subdued">
                          This shows how the GraphQL response will be mapped to your database
                        </Text>
                        <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                          <pre style={{ overflow: 'auto', fontSize: '12px', maxHeight: '400px' }}>
                            {JSON.stringify(actionData.databaseMapping, null, 2)}
                          </pre>
                        </Box>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                )}
                
                {actionData.parsedData && (
                  <Layout.Section>
                    <Card>
                      <BlockStack gap="400">
                        <InlineStack align="space-between">
                          <Text variant="headingMd" as="h2">Parsed Customer Data</Text>
                          <Button onClick={() => copyToClipboard(JSON.stringify(actionData.parsedData, null, 2))}>
                            Copy Data
                          </Button>
                        </InlineStack>
                        <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                          <pre style={{ overflow: 'auto', fontSize: '12px', maxHeight: '400px' }}>
                            {JSON.stringify(actionData.parsedData, null, 2)}
                          </pre>
                        </Box>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                )}
              </>
            )}
          </>
        )}
      </Layout>
    </Page>
  );
}