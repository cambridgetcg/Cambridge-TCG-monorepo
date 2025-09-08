import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
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
  error?: string;
  executionTime?: number;
}

interface LoaderData {
  shop: string;
}

// ============================================================================
// LOADER - Get shop info
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  return json<LoaderData>({
    shop: session.shop
  });
};

// ============================================================================
// ACTION - Execute GraphQL query
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const queryType = formData.get("queryType") as string;
  const customerId = formData.get("customerId") as string;
  const giftCardId = formData.get("giftCardId") as string;
  const amount = formData.get("amount") as string || "0";
  const note = formData.get("note") as string || "";
  const customQuery = formData.get("customQuery") as string;
  
  const startTime = Date.now();
  
  try {
    let query = "";
    let variables: any = {};
    
    // Build query based on type from the GraphQL guide
    switch (queryType) {
      // ========== GIFT CARD QUERIES (Store Credit) ==========
      
      case "giftCardById":
        // Query gift card by ID - Section 9 of guide
        query = `#graphql
          query GetGiftCardBalance($id: ID!) {
            giftCard(id: $id) {
              id
              balance {
                amount
                currencyCode
              }
              initialValue {
                amount
              }
              expiresOn
              enabled
              note
              createdAt
              updatedAt
              customer {
                id
                email
                displayName
              }
            }
          }
        `;
        variables = { id: giftCardId };
        break;
        
      case "giftCardByCode":
        // Search gift card by code - Section 9 of guide
        query = `#graphql
          query FindGiftCardByCode($code: String!) {
            giftCards(first: 1, query: $code) {
              nodes {
                id
                balance { 
                  amount 
                  currencyCode 
                }
                displayCode
                enabled
                expiresOn
                customer {
                  id
                  email
                }
              }
            }
          }
        `;
        variables = { code: formData.get("code") as string };
        break;
        
      case "createGiftCard":
        // Create store credit via gift card - Section 9 of guide
        query = `#graphql
          mutation CreateStoreCredit($input: GiftCardCreateInput!) {
            giftCardCreate(input: $input) {
              giftCard {
                id
                balance {
                  amount
                  currencyCode
                }
                initialValue {
                  amount
                }
                customer {
                  id
                }
              }
              giftCardCode
              userErrors {
                field
                message
              }
            }
          }
        `;
        variables = {
          input: {
            initialValue: amount,
            customerId: customerId || undefined,
            note: note || "Store credit issued via RewardsPro"
          }
        };
        break;
        
      case "creditGiftCard":
        // Add credit to gift card - Section 9 of guide
        query = `#graphql
          mutation CreditStoreCredit($id: ID!, $creditInput: GiftCardCreditInput!) {
            giftCardCredit(id: $id, creditInput: $creditInput) {
              giftCardCreditTransaction {
                id
                amount {
                  amount
                  currencyCode
                }
                processedAt
                note
                giftCard {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                }
              }
              userErrors {
                message
                field
                code
              }
            }
          }
        `;
        variables = {
          id: giftCardId,
          creditInput: {
            creditAmount: { 
              amount: amount, 
              currencyCode: "USD" 
            },
            note: note || "Credit adjustment",
            processedAt: new Date().toISOString()
          }
        };
        break;
        
      case "debitGiftCard":
        // Deduct credit from gift card - Section 9 of guide
        query = `#graphql
          mutation DebitStoreCredit($id: ID!, $debitInput: GiftCardDebitInput!) {
            giftCardDebit(id: $id, debitInput: $debitInput) {
              giftCardDebitTransaction {
                id
                amount {
                  amount
                  currencyCode
                }
                processedAt
                note
                giftCard {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                }
              }
              userErrors {
                message
                field
                code
              }
            }
          }
        `;
        variables = {
          id: giftCardId,
          debitInput: {
            debitAmount: { 
              amount: amount, 
              currencyCode: "USD" 
            },
            note: note || "Debit adjustment",
            processedAt: new Date().toISOString()
          }
        };
        break;
        
      // ========== STORE CREDIT ACCOUNTS (Shopify Plus) ==========
      
      case "storeCreditAccount":
        // Query store credit account - Section 9 of guide
        query = `#graphql
          query GetStoreCreditAccount($customerId: ID!) {
            customer(id: $customerId) {
              id
              email
              displayName
              storeCreditAccount {
                id
                balance {
                  amount
                  currencyCode
                }
              }
            }
          }
        `;
        variables = { customerId };
        break;
        
      case "creditStoreCreditAccount":
        // Credit store credit account (Plus) - Section 9 of guide
        query = `#graphql
          mutation CreditStoreCreditAccount($accountId: ID!, $creditInput: StoreCreditAccountCreditInput!) {
            storeCreditAccountCredit(id: $accountId, creditInput: $creditInput) {
              storeCreditAccountTransaction {
                id
                amount {
                  amount
                  currencyCode
                }
                account {
                  balance {
                    amount
                    currencyCode
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
          accountId: formData.get("accountId") as string,
          creditInput: {
            creditAmount: {
              amount: amount,
              currencyCode: "USD"
            },
            description: note
          }
        };
        break;
        
      // ========== CUSTOMER QUERIES ==========
      
      case "customerWithMetafields":
        // Customer with metafields for store credit
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
        
      case "updateCustomerMetafield":
        // Update customer metafield for store credit
        query = `#graphql
          mutation UpdateCustomerMetafield($input: CustomerInput!) {
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
                value: amount,
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
        
      // ========== PRODUCTS QUERIES ==========
      
      case "products":
        // Full product query - Section 1 of guide
        query = `#graphql
          query GetProductsWithFullDetails($first: Int!, $query: String) {
            products(first: $first, query: $query) {
              edges {
                node {
                  id
                  title
                  handle
                  descriptionHtml
                  status
                  vendor
                  productType
                  seo {
                    title
                    description
                  }
                  featuredImage {
                    url
                    altText
                  }
                  metafields(first: 10) {
                    edges {
                      node {
                        namespace
                        key
                        value
                        type
                      }
                    }
                  }
                  variants(first: 50) {
                    edges {
                      node {
                        id
                        price
                        compareAtPrice
                        sku
                        inventoryQuantity
                        selectedOptions {
                          name
                          value
                        }
                      }
                    }
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
        variables = {
          first: 10,
          query: formData.get("productQuery") as string || null
        };
        break;
        
      // ========== ORDERS QUERIES ==========
      
      case "orders":
        // Orders query for customer
        query = `#graphql
          query GetCustomerOrders($customerId: ID!, $first: Int!) {
            customer(id: $customerId) {
              id
              email
              orders(first: $first, reverse: true) {
                edges {
                  node {
                    id
                    name
                    createdAt
                    totalPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                    lineItems(first: 50) {
                      edges {
                        node {
                          id
                          title
                          quantity
                          originalUnitPriceSet {
                            shopMoney {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `;
        variables = {
          customerId,
          first: 10
        };
        break;
        
      // ========== BULK OPERATIONS ==========
      
      case "bulkOperation":
        // Bulk operation for large datasets - Section 10 of guide
        query = `#graphql
          mutation RunBulkQuery($query: String!) {
            bulkOperationRunQuery(query: $query) {
              bulkOperation {
                id
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        variables = {
          query: formData.get("bulkQuery") as string || `{
            customers {
              edges {
                node {
                  id
                  email
                }
              }
            }
          }`
        };
        break;
        
      // ========== METAFIELDS QUERIES ==========
      
      case "metafields":
        // Query metafields
        query = `#graphql
          query GetMetafields($ownerId: ID!) {
            metafields(first: 100, ownerType: CUSTOMER, filters: { ownerId: $ownerId }) {
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
        `;
        variables = { ownerId: customerId };
        break;
        
      case "createMetafield":
        // Create metafield mutation
        query = `#graphql
          mutation CreateMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                id
                namespace
                key
                value
                type
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        variables = {
          metafields: [{
            ownerId: customerId,
            namespace: "rewards_pro",
            key: formData.get("metafieldKey") as string || "store_credit",
            value: formData.get("metafieldValue") as string || "0",
            type: "number_decimal"
          }]
        };
        break;
        
      // ========== CUSTOM QUERY ==========
      
      case "custom":
        query = customQuery;
        // Try to parse variables from the form
        const varsString = formData.get("variables") as string;
        if (varsString) {
          try {
            variables = JSON.parse(varsString);
          } catch (e) {
            // If not valid JSON, try simple ID variable
            if (customerId) {
              variables = { id: customerId, customerId };
            }
          }
        }
        break;
        
      default:
        throw new Error("Invalid query type");
    }
    
    // Execute GraphQL query
    const response = await admin.graphql(query, { variables });
    const rawResponse = await response.json();
    
    const executionTime = Date.now() - startTime;
    
    return json<GraphQLTestResult>({
      success: true,
      query,
      variables,
      rawResponse,
      parsedData: rawResponse.data,
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
// COMPONENT
// ============================================================================

export default function GraphQLTestPage() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<GraphQLTestResult>();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const [queryType, setQueryType] = useState("giftCardById");
  const [customerId, setCustomerId] = useState("");
  const [giftCardId, setGiftCardId] = useState("");
  const [amount, setAmount] = useState("10.00");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [accountId, setAccountId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [bulkQuery, setBulkQuery] = useState("");
  const [metafieldKey, setMetafieldKey] = useState("store_credit");
  const [metafieldValue, setMetafieldValue] = useState("0");
  const [customQuery, setCustomQuery] = useState("");
  const [variables, setVariables] = useState("");
  
  const isLoading = navigation.state === "submitting";
  
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("queryType", queryType);
    formData.append("customerId", customerId);
    formData.append("giftCardId", giftCardId);
    formData.append("amount", amount);
    formData.append("note", note);
    formData.append("code", code);
    formData.append("accountId", accountId);
    formData.append("productQuery", productQuery);
    formData.append("bulkQuery", bulkQuery);
    formData.append("metafieldKey", metafieldKey);
    formData.append("metafieldValue", metafieldValue);
    formData.append("customQuery", customQuery);
    formData.append("variables", variables);
    submit(formData, { method: "post" });
  }, [queryType, customerId, giftCardId, amount, note, code, accountId, productQuery, bulkQuery, metafieldKey, metafieldValue, customQuery, variables, submit]);
  
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);
  
  // Helper to format IDs
  const formatCustomerId = useCallback((value: string) => {
    if (/^\d+$/.test(value)) {
      return `gid://shopify/Customer/${value}`;
    }
    return value;
  }, []);
  
  const formatGiftCardId = useCallback((value: string) => {
    if (/^\d+$/.test(value)) {
      return `gid://shopify/GiftCard/${value}`;
    }
    return value;
  }, []);
  
  return (
    <Page
      title="GraphQL API Test"
      subtitle="Test GraphQL queries from the API guide"
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
                    { label: "--- Gift Cards (Store Credit) ---", value: "", disabled: true },
                    { label: "Get Gift Card by ID", value: "giftCardById" },
                    { label: "Search Gift Card by Code", value: "giftCardByCode" },
                    { label: "Create Gift Card (Store Credit)", value: "createGiftCard" },
                    { label: "Credit Gift Card (Add Balance)", value: "creditGiftCard" },
                    { label: "Debit Gift Card (Reduce Balance)", value: "debitGiftCard" },
                    
                    { label: "--- Store Credit Accounts (Plus) ---", value: "", disabled: true },
                    { label: "Get Store Credit Account", value: "storeCreditAccount" },
                    { label: "Credit Store Credit Account", value: "creditStoreCreditAccount" },
                    
                    { label: "--- Customer Queries ---", value: "", disabled: true },
                    { label: "Customer with Metafields", value: "customerWithMetafields" },
                    { label: "Update Customer Metafield", value: "updateCustomerMetafield" },
                    
                    { label: "--- Product Queries ---", value: "", disabled: true },
                    { label: "Products with Full Details", value: "products" },
                    
                    { label: "--- Order Queries ---", value: "", disabled: true },
                    { label: "Customer Orders", value: "orders" },
                    
                    { label: "--- Metafield Operations ---", value: "", disabled: true },
                    { label: "Get Metafields", value: "metafields" },
                    { label: "Create Metafield", value: "createMetafield" },
                    
                    { label: "--- Bulk Operations ---", value: "", disabled: true },
                    { label: "Run Bulk Query", value: "bulkOperation" },
                    
                    { label: "--- Custom ---", value: "", disabled: true },
                    { label: "Custom Query", value: "custom" }
                  ]}
                  value={queryType}
                  onChange={setQueryType}
                />
                
                {/* Gift Card Fields */}
                {["giftCardById", "creditGiftCard", "debitGiftCard"].includes(queryType) && (
                  <TextField
                    label="Gift Card ID"
                    value={giftCardId}
                    onChange={(value) => setGiftCardId(formatGiftCardId(value))}
                    placeholder="123456789 or gid://shopify/GiftCard/123456789"
                    helpText="Enter gift card ID (will auto-format)"
                    autoComplete="off"
                  />
                )}
                
                {queryType === "giftCardByCode" && (
                  <TextField
                    label="Gift Card Code"
                    value={code}
                    onChange={setCode}
                    placeholder="ABCD-1234-EFGH"
                    helpText="Enter the gift card code to search"
                    autoComplete="off"
                  />
                )}
                
                {/* Customer Fields */}
                {["createGiftCard", "storeCreditAccount", "customerWithMetafields", "updateCustomerMetafield", "orders", "metafields", "createMetafield"].includes(queryType) && (
                  <TextField
                    label="Customer ID"
                    value={customerId}
                    onChange={(value) => setCustomerId(formatCustomerId(value))}
                    placeholder="123456789 or gid://shopify/Customer/123456789"
                    helpText="Enter customer ID (will auto-format)"
                    autoComplete="off"
                  />
                )}
                
                {/* Store Credit Account ID */}
                {queryType === "creditStoreCreditAccount" && (
                  <TextField
                    label="Store Credit Account ID"
                    value={accountId}
                    onChange={setAccountId}
                    placeholder="gid://shopify/StoreCreditAccount/123"
                    helpText="Enter the store credit account ID"
                    autoComplete="off"
                  />
                )}
                
                {/* Amount Fields */}
                {["createGiftCard", "creditGiftCard", "debitGiftCard", "creditStoreCreditAccount", "updateCustomerMetafield"].includes(queryType) && (
                  <TextField
                    label="Amount"
                    type="number"
                    value={amount}
                    onChange={setAmount}
                    prefix="$"
                    placeholder="10.00"
                    helpText="Amount in USD"
                    autoComplete="off"
                  />
                )}
                
                {/* Note Fields */}
                {["createGiftCard", "creditGiftCard", "debitGiftCard", "creditStoreCreditAccount"].includes(queryType) && (
                  <TextField
                    label="Note / Description"
                    value={note}
                    onChange={setNote}
                    placeholder="Store credit adjustment"
                    helpText="Optional note for the transaction"
                    autoComplete="off"
                  />
                )}
                
                {/* Product Query */}
                {queryType === "products" && (
                  <TextField
                    label="Product Search Query"
                    value={productQuery}
                    onChange={setProductQuery}
                    placeholder="title:Widget OR vendor:Acme"
                    helpText="Optional search query for products"
                    autoComplete="off"
                  />
                )}
                
                {/* Metafield Fields */}
                {queryType === "createMetafield" && (
                  <>
                    <TextField
                      label="Metafield Key"
                      value={metafieldKey}
                      onChange={setMetafieldKey}
                      placeholder="store_credit"
                      autoComplete="off"
                    />
                    <TextField
                      label="Metafield Value"
                      value={metafieldValue}
                      onChange={setMetafieldValue}
                      placeholder="100.00"
                      autoComplete="off"
                    />
                  </>
                )}
                
                {/* Bulk Query */}
                {queryType === "bulkOperation" && (
                  <TextField
                    label="Bulk Query"
                    value={bulkQuery}
                    onChange={setBulkQuery}
                    multiline={4}
                    placeholder={`{
  customers {
    edges {
      node {
        id
        email
      }
    }
  }
}`}
                    helpText="GraphQL query to run in bulk"
                    autoComplete="off"
                  />
                )}
                
                {/* Custom Query */}
                {queryType === "custom" && (
                  <>
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
                    <TextField
                      label="Variables (JSON)"
                      value={variables}
                      onChange={setVariables}
                      multiline={3}
                      placeholder={`{
  "id": "gid://shopify/Customer/123"
}`}
                      helpText="Variables in JSON format"
                      autoComplete="off"
                    />
                  </>
                )}
              </FormLayout>
              
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <Text as="p" tone="subdued">
                  Shop: {loaderData.shop}
                </Text>
              </Box>
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
                        <Text variant="headingMd" as="h2">GraphQL Response</Text>
                        <Button onClick={() => copyToClipboard(JSON.stringify(actionData.rawResponse, null, 2))}>
                          Copy Response
                        </Button>
                      </InlineStack>
                      
                      {/* Check for errors in response */}
                      {actionData.rawResponse?.errors && (
                        <Banner tone="critical">
                          <BlockStack gap="200">
                            {actionData.rawResponse.errors.map((error: any, index: number) => (
                              <Text as="p" key={index}>
                                {error.message}
                              </Text>
                            ))}
                          </BlockStack>
                        </Banner>
                      )}
                      
                      {/* Check for user errors in mutations */}
                      {actionData.parsedData && Object.values(actionData.parsedData).some((value: any) => 
                        value?.userErrors?.length > 0
                      ) && (
                        <Banner tone="warning">
                          <BlockStack gap="200">
                            {Object.values(actionData.parsedData).map((value: any) => 
                              value?.userErrors?.map((error: any, index: number) => (
                                <Text as="p" key={index}>
                                  {error.field}: {error.message}
                                </Text>
                              ))
                            )}
                          </BlockStack>
                        </Banner>
                      )}
                      
                      <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{ overflow: 'auto', fontSize: '12px', maxHeight: '600px' }}>
                          {JSON.stringify(actionData.rawResponse, null, 2)}
                        </pre>
                      </Box>
                    </BlockStack>
                  </Card>
                </Layout.Section>
                
                {/* Parsed Data Display */}
                {actionData.parsedData && (
                  <Layout.Section>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">Parsed Data</Text>
                        
                        {/* Gift Card Display */}
                        {actionData.parsedData.giftCard && (
                          <Box padding="200" background="bg-surface-success" borderRadius="200">
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h3">Gift Card Details</Text>
                              <InlineStack gap="400">
                                <BlockStack gap="100">
                                  <Text as="p" fontWeight="semibold">Balance:</Text>
                                  <Text as="p">
                                    {actionData.parsedData.giftCard.balance?.currencyCode} {actionData.parsedData.giftCard.balance?.amount}
                                  </Text>
                                </BlockStack>
                                {actionData.parsedData.giftCard.initialValue && (
                                  <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">Initial Value:</Text>
                                    <Text as="p">{actionData.parsedData.giftCard.initialValue.amount}</Text>
                                  </BlockStack>
                                )}
                                {actionData.parsedData.giftCard.enabled !== undefined && (
                                  <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">Status:</Text>
                                    <Badge tone={actionData.parsedData.giftCard.enabled ? "success" : "critical"}>
                                      {actionData.parsedData.giftCard.enabled ? "Enabled" : "Disabled"}
                                    </Badge>
                                  </BlockStack>
                                )}
                              </InlineStack>
                            </BlockStack>
                          </Box>
                        )}
                        
                        {/* Gift Card Create Result */}
                        {actionData.parsedData.giftCardCreate && (
                          <Box padding="200" background="bg-surface-success" borderRadius="200">
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h3">Gift Card Created</Text>
                              {actionData.parsedData.giftCardCreate.giftCardCode && (
                                <Banner tone="success">
                                  <Text as="p" fontWeight="semibold">
                                    Code: {actionData.parsedData.giftCardCreate.giftCardCode}
                                  </Text>
                                </Banner>
                              )}
                              {actionData.parsedData.giftCardCreate.giftCard && (
                                <Text as="p">
                                  Balance: {actionData.parsedData.giftCardCreate.giftCard.balance?.currencyCode} {actionData.parsedData.giftCardCreate.giftCard.balance?.amount}
                                </Text>
                              )}
                            </BlockStack>
                          </Box>
                        )}
                        
                        {/* Customer Display */}
                        {actionData.parsedData.customer && (
                          <Box padding="200" background="bg-surface-info" borderRadius="200">
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h3">Customer Details</Text>
                              <Text as="p">Email: {actionData.parsedData.customer.email}</Text>
                              <Text as="p">Name: {actionData.parsedData.customer.displayName}</Text>
                              {actionData.parsedData.customer.amountSpent && (
                                <Text as="p">
                                  Total Spent: {actionData.parsedData.customer.amountSpent.currencyCode} {actionData.parsedData.customer.amountSpent.amount}
                                </Text>
                              )}
                              {actionData.parsedData.customer.storeCreditAccount && (
                                <Text as="p" fontWeight="semibold">
                                  Store Credit: {actionData.parsedData.customer.storeCreditAccount.balance?.currencyCode} {actionData.parsedData.customer.storeCreditAccount.balance?.amount}
                                </Text>
                              )}
                            </BlockStack>
                          </Box>
                        )}
                        
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