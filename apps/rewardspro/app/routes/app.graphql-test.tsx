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
  Divider,
  Badge,
  Banner,
  BlockStack,
  InlineGrid,
  Box,
  Text,
  Code,
  InlineStack
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
      case "single":
        query = `#graphql
          query GetCustomer($id: ID!) {
            customer(id: $id) {
              id
              email
              phone
              firstName
              lastName
              displayName
              state
              verifiedEmail
              validEmailAddress
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
                  phone
                  firstName
                  lastName
                  displayName
                  state
                  verifiedEmail
                  validEmailAddress
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
    
    if (rawResponse.data) {
      // Extract customer data based on query type
      if (queryType === "single" && rawResponse.data.customer) {
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
      phone: customer.phone,
      state: customer.state,
      verifiedEmail: customer.verifiedEmail,
      validEmailAddress: customer.validEmailAddress,
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
  
  const [queryType, setQueryType] = useState("minimal");
  const [customerId, setCustomerId] = useState("");
  const [batchSize, setBatchSize] = useState("3");
  const [customQuery, setCustomQuery] = useState("");
  
  const isLoading = navigation.state === "submitting";
  
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("queryType", queryType);
    formData.append("customerId", customerId);
    formData.append("batchSize", batchSize);
    formData.append("customQuery", customQuery);
    submit(formData, { method: "post" });
  }, [queryType, customerId, batchSize, customQuery, submit]);
  
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
                    { label: "Minimal (only required fields)", value: "minimal" },
                    { label: "Batch (standard fields)", value: "batch" },
                    { label: "Single Customer (all fields)", value: "single" },
                    { label: "Custom Query", value: "custom" }
                  ]}
                  value={queryType}
                  onChange={setQueryType}
                />
                
                {queryType === "single" && (
                  <TextField
                    label="Customer ID"
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="gid://shopify/Customer/123456789"
                    helpText="Enter the full GraphQL ID"
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
                    <Badge status={actionData.success ? "success" : "critical"}>
                      {actionData.success ? "Success" : "Failed"}
                    </Badge>
                  </InlineStack>
                  
                  {actionData.executionTime && (
                    <Text as="p" tone="subdued">
                      Execution time: {actionData.executionTime}ms
                    </Text>
                  )}
                  
                  {actionData.error && (
                    <Banner status="critical">
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