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
  const amount = formData.get("amount") as string || "0";
  const note = formData.get("note") as string || "";
  const storeCreditAccountId = formData.get("storeCreditAccountId") as string;
  
  const startTime = Date.now();
  
  try {
    let query = "";
    let variables: any = {};
    
    // Build query based on type
    switch (queryType) {
      // ========== CUSTOMER STORE CREDIT QUERIES ==========
      
      case "customerStoreCreditAccounts":
        // Query all store credit accounts through customer object
        query = `#graphql
          query GetCustomerStoreCreditAccounts($customerId: ID!) {
            customer(id: $customerId) {
              id
              displayName
              email
              phone
              state
              createdAt
              updatedAt
              numberOfOrders
              amountSpent {
                amount
                currencyCode
              }
              storeCreditAccounts(first: 10) {
                edges {
                  node {
                    id
                    balance {
                      amount
                      currencyCode
                    }
                  }
                }
                nodes {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
                totalCount
              }
            }
          }
        `;
        variables = { customerId };
        break;
        
      case "customerStoreCreditWithTransactions":
        // Query store credit accounts with transaction history
        query = `#graphql
          query GetCustomerStoreCreditWithHistory($customerId: ID!) {
            customer(id: $customerId) {
              id
              email
              displayName
              storeCreditAccounts(first: 10) {
                edges {
                  node {
                    id
                    balance {
                      amount
                      currencyCode
                    }
                    owner {
                      ... on Customer {
                        id
                        email
                      }
                    }
                    transactions(first: 10, reverse: true) {
                      edges {
                        node {
                          ... on StoreCreditAccountCreditTransaction {
                            __typename
                            id
                            amount {
                              amount
                              currencyCode
                            }
                            description
                            createdAt
                          }
                          ... on StoreCreditAccountDebitTransaction {
                            __typename
                            id
                            amount {
                              amount
                              currencyCode
                            }
                            description
                            createdAt
                          }
                        }
                      }
                      pageInfo {
                        hasNextPage
                      }
                    }
                  }
                }
              }
            }
          }
        `;
        variables = { customerId };
        break;
        
      case "customerWithAllFinancialData":
        // Comprehensive customer query with all financial data
        query = `#graphql
          query GetCustomerCompleteFinancialData($customerId: ID!) {
            customer(id: $customerId) {
              id
              email
              displayName
              firstName
              lastName
              phone
              state
              createdAt
              updatedAt
              numberOfOrders
              
              # Lifetime spending
              amountSpent {
                amount
                currencyCode
              }
              
              # Store credit accounts
              storeCreditAccounts(first: 10) {
                edges {
                  node {
                    id
                    balance {
                      amount
                      currencyCode
                    }
                  }
                }
                totalCount
              }
              
              # Recent orders
              orders(first: 5, reverse: true) {
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
                    fulfillmentStatus
                    financialStatus
                  }
                }
              }
              
              # Metafields for rewards data
              metafields(first: 10, namespace: "rewards_pro") {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                    type
                    description
                  }
                }
              }
            }
          }
        `;
        variables = { customerId };
        break;
        
      case "createStoreCreditForCustomer":
        // Create store credit through gift card (customer context)
        query = `#graphql
          mutation CreateStoreCreditForCustomer($input: GiftCardCreateInput!) {
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
        
      case "creditStoreCreditAccount":
        // Credit an existing store credit account
        query = `#graphql
          mutation CreditStoreCreditAccount($accountId: ID!, $creditInput: StoreCreditAccountCreditInput!) {
            storeCreditAccountCredit(id: $accountId, creditInput: $creditInput) {
              storeCreditAccountTransaction {
                id
                amount {
                  amount
                  currencyCode
                }
                description
                createdAt
                account {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                  owner {
                    ... on Customer {
                      id
                      email
                      storeCreditAccounts(first: 1) {
                        edges {
                          node {
                            balance {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }
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
          accountId: storeCreditAccountId,
          creditInput: {
            creditAmount: {
              amount: amount,
              currencyCode: "USD"
            },
            description: note || "Credit adjustment"
          }
        };
        break;
        
      case "debitStoreCreditAccount":
        // Debit an existing store credit account
        query = `#graphql
          mutation DebitStoreCreditAccount($accountId: ID!, $debitInput: StoreCreditAccountDebitInput!) {
            storeCreditAccountDebit(id: $accountId, debitInput: $debitInput) {
              storeCreditAccountTransaction {
                id
                amount {
                  amount
                  currencyCode
                }
                description
                createdAt
                account {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                  owner {
                    ... on Customer {
                      id
                      email
                      storeCreditAccounts(first: 1) {
                        edges {
                          node {
                            balance {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }
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
          accountId: storeCreditAccountId,
          debitInput: {
            debitAmount: {
              amount: amount,
              currencyCode: "USD"
            },
            description: note || "Debit adjustment"
          }
        };
        break;
        
      case "syncCustomerStoreCredit":
        // Sync query - same as used in customer detail page
        query = `#graphql
          query SyncCustomerStoreCredit($customerId: ID!) {
            customer(id: $customerId) {
              id
              email
              displayName
              storeCreditAccounts(first: 10) {
                edges {
                  node {
                    id
                    balance {
                      amount
                      currencyCode
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                }
              }
            }
          }
        `;
        variables = { customerId };
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
  
  const [queryType, setQueryType] = useState("customerStoreCreditAccounts");
  const [customerId, setCustomerId] = useState("");
  const [storeCreditAccountId, setStoreCreditAccountId] = useState("");
  const [amount, setAmount] = useState("10.00");
  const [note, setNote] = useState("");
  
  const isLoading = navigation.state === "submitting";
  
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("queryType", queryType);
    formData.append("customerId", customerId);
    formData.append("storeCreditAccountId", storeCreditAccountId);
    formData.append("amount", amount);
    formData.append("note", note);
    submit(formData, { method: "post" });
  }, [queryType, customerId, storeCreditAccountId, amount, note, submit]);
  
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);
  
  // Helper to format Customer IDs
  const formatCustomerId = useCallback((value: string) => {
    if (/^\d+$/.test(value)) {
      return `gid://shopify/Customer/${value}`;
    }
    return value;
  }, []);
  
  // Helper to format Store Credit Account IDs
  const formatStoreCreditAccountId = useCallback((value: string) => {
    if (/^\d+$/.test(value)) {
      return `gid://shopify/StoreCreditAccount/${value}`;
    }
    return value;
  }, []);
  
  // Helper to calculate total store credit from response
  const calculateTotalStoreCredit = useCallback((customer: any) => {
    if (!customer?.storeCreditAccounts?.edges) return null;
    
    let total = 0;
    const accounts = [];
    
    for (const edge of customer.storeCreditAccounts.edges) {
      const amount = parseFloat(edge.node.balance.amount);
      total += amount;
      accounts.push({
        id: edge.node.id,
        amount: amount,
        currency: edge.node.balance.currencyCode
      });
    }
    
    return { total, accounts };
  }, []);
  
  return (
    <Page
      title="Customer Store Credit API Test"
      subtitle="Test store credit queries through the Customer object"
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
                    { label: "Get Customer Store Credit Accounts", value: "customerStoreCreditAccounts" },
                    { label: "Get Store Credit with Transactions", value: "customerStoreCreditWithTransactions" },
                    { label: "Get Complete Financial Data", value: "customerWithAllFinancialData" },
                    { label: "Sync Customer Store Credit", value: "syncCustomerStoreCredit" },
                    { label: "Create Store Credit for Customer", value: "createStoreCreditForCustomer" },
                    { label: "Credit Store Credit Account", value: "creditStoreCreditAccount" },
                    { label: "Debit Store Credit Account", value: "debitStoreCreditAccount" }
                  ]}
                  value={queryType}
                  onChange={setQueryType}
                />
                
                {/* Customer ID Field - Required for all queries */}
                <TextField
                  label="Customer ID"
                  value={customerId}
                  onChange={(value) => setCustomerId(formatCustomerId(value))}
                  placeholder="123456789 or gid://shopify/Customer/123456789"
                  helpText="Enter customer ID (will auto-format)"
                  autoComplete="off"
                />
                
                {/* Store Credit Account ID - For credit/debit mutations */}
                {["creditStoreCreditAccount", "debitStoreCreditAccount"].includes(queryType) && (
                  <TextField
                    label="Store Credit Account ID"
                    value={storeCreditAccountId}
                    onChange={(value) => setStoreCreditAccountId(formatStoreCreditAccountId(value))}
                    placeholder="123 or gid://shopify/StoreCreditAccount/123"
                    helpText="Enter the store credit account ID"
                    autoComplete="off"
                  />
                )}
                
                {/* Amount Field - For mutations */}
                {["createStoreCreditForCustomer", "creditStoreCreditAccount", "debitStoreCreditAccount"].includes(queryType) && (
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
                
                {/* Note/Description Field - For mutations */}
                {["createStoreCreditForCustomer", "creditStoreCreditAccount", "debitStoreCreditAccount"].includes(queryType) && (
                  <TextField
                    label="Note / Description"
                    value={note}
                    onChange={setNote}
                    placeholder="Store credit adjustment"
                    helpText="Optional note for the transaction"
                    autoComplete="off"
                  />
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
                        
                        {/* Customer Store Credit Summary */}
                        {actionData.parsedData.customer && (
                          <Box padding="200" background="bg-surface-success" borderRadius="200">
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h3">Customer Details</Text>
                              <InlineStack gap="400" wrap>
                                <BlockStack gap="100">
                                  <Text as="p" fontWeight="semibold">Email:</Text>
                                  <Text as="p">{actionData.parsedData.customer.email}</Text>
                                </BlockStack>
                                {actionData.parsedData.customer.displayName && (
                                  <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">Name:</Text>
                                    <Text as="p">{actionData.parsedData.customer.displayName}</Text>
                                  </BlockStack>
                                )}
                                {actionData.parsedData.customer.amountSpent && (
                                  <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">Lifetime Spent:</Text>
                                    <Text as="p">
                                      {actionData.parsedData.customer.amountSpent.currencyCode} {actionData.parsedData.customer.amountSpent.amount}
                                    </Text>
                                  </BlockStack>
                                )}
                              </InlineStack>
                              
                              {/* Store Credit Accounts Summary */}
                              {(() => {
                                const creditSummary = calculateTotalStoreCredit(actionData.parsedData.customer);
                                if (creditSummary) {
                                  return (
                                    <>
                                      <Divider />
                                      <Text variant="headingSm" as="h4">Store Credit Summary</Text>
                                      <InlineStack gap="400">
                                        <BlockStack gap="100">
                                          <Text as="p" fontWeight="semibold">Total Balance:</Text>
                                          <Text as="p" variant="headingLg">
                                            ${creditSummary.total.toFixed(2)}
                                          </Text>
                                        </BlockStack>
                                        <BlockStack gap="100">
                                          <Text as="p" fontWeight="semibold">Number of Accounts:</Text>
                                          <Text as="p">{creditSummary.accounts.length}</Text>
                                        </BlockStack>
                                      </InlineStack>
                                      
                                      {creditSummary.accounts.length > 0 && (
                                        <BlockStack gap="100">
                                          <Text as="p" fontWeight="semibold">Account Details:</Text>
                                          {creditSummary.accounts.map((account, index) => (
                                            <Box key={index} padding="100" background="bg-surface" borderRadius="100">
                                              <InlineStack align="space-between">
                                                <Text as="p" tone="subdued" variant="bodySm">
                                                  {account.id.split('/').pop()}
                                                </Text>
                                                <Text as="p" fontWeight="semibold">
                                                  {account.currency} {account.amount.toFixed(2)}
                                                </Text>
                                              </InlineStack>
                                            </Box>
                                          ))}
                                        </BlockStack>
                                      )}
                                    </>
                                  );
                                }
                                return null;
                              })()}
                            </BlockStack>
                          </Box>
                        )}
                        
                        {/* Mutation Results */}
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
                        
                        {/* Transaction Results */}
                        {(actionData.parsedData.storeCreditAccountCredit || actionData.parsedData.storeCreditAccountDebit) && (
                          <Box padding="200" background="bg-surface-info" borderRadius="200">
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h3">Transaction Completed</Text>
                              {(() => {
                                const transaction = actionData.parsedData.storeCreditAccountCredit?.storeCreditAccountTransaction ||
                                                   actionData.parsedData.storeCreditAccountDebit?.storeCreditAccountTransaction;
                                if (transaction) {
                                  return (
                                    <>
                                      <Text as="p">
                                        Amount: {transaction.amount?.currencyCode} {transaction.amount?.amount}
                                      </Text>
                                      {transaction.account && (
                                        <Text as="p" fontWeight="semibold">
                                          New Balance: {transaction.account.balance?.currencyCode} {transaction.account.balance?.amount}
                                        </Text>
                                      )}
                                      {transaction.description && (
                                        <Text as="p" tone="subdued">
                                          Description: {transaction.description}
                                        </Text>
                                      )}
                                    </>
                                  );
                                }
                                return null;
                              })()}
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