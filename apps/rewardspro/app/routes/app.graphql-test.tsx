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
      case "storeCredit":
        // Shopify Plus approach: Gift Cards + Metafields for store credit
        query = `#graphql
          query GetCustomerStoreCredit($customerId: ID!) {
            customer(id: $customerId) {
              # Basic customer identification
              id
              email
              displayName
              firstName
              lastName
              tags
              
              # Metafields for custom store credit implementation
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
              
              # Recent orders to check for refunds/credits
              orders(first: 10, reverse: true) {
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
                    # Check for refunds that might be store credit
                    refunds {
                      id
                      createdAt
                      totalRefundedSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      refundLineItems(first: 10) {
                        edges {
                          node {
                            lineItem {
                              id
                              name
                            }
                            quantity
                            priceSet {
                              shopMoney {
                                amount
                                currencyCode
                              }
                            }
                          }
                        }
                      }
                    }
                    # Check for gift cards applied
                    lineItems(first: 50) {
                      edges {
                        node {
                          id
                          title
                          variant {
                            product {
                              productType
                              tags
                            }
                          }
                        }
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
        
      case "giftCards":
        // Query gift cards that can act as store credit
        const customerNumber = customerId.split('/').pop();
        query = `#graphql
          query GetGiftCards($query: String!) {
            giftCards(first: 25, query: $query) {
              edges {
                node {
                  id
                  maskedCode
                  lastCharacters
                  enabled
                  note
                  initialValue {
                    amount
                    currencyCode
                  }
                  balance {
                    amount
                    currencyCode
                  }
                  expiresOn
                  createdAt
                  updatedAt
                  customer {
                    id
                    email
                    displayName
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
        // Search by customer email or note field
        variables = { query: `customer_id:${customerNumber}` };
        break;
        
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
      if (queryType === "storeCredit" && rawResponse.data.customer) {
        parsedData = rawResponse.data.customer;
        
        // Extract metafield-based store credit
        const metafields: any = {};
        let storeCreditFromMetafield = 0;
        
        if (parsedData.metafields?.edges) {
          parsedData.metafields.edges.forEach((edge: any) => {
            metafields[edge.node.key] = {
              value: edge.node.value,
              type: edge.node.type,
              id: edge.node.id,
              updatedAt: edge.node.updatedAt
            };
            
            // Check for store credit in metafields
            if (edge.node.key === 'store_credit' || edge.node.key === 'credit_balance') {
              storeCreditFromMetafield = parseFloat(edge.node.value) || 0;
            }
          });
        }
        
        // Calculate total refunds that might be store credit
        let totalRefunds = 0;
        const refundDetails: any[] = [];
        
        if (parsedData.orders?.edges) {
          parsedData.orders.edges.forEach((orderEdge: any) => {
            const order = orderEdge.node;
            if (order.refunds && order.refunds.length > 0) {
              order.refunds.forEach((refund: any) => {
                const refundAmount = parseFloat(refund.totalRefundedSet?.shopMoney?.amount || "0");
                totalRefunds += refundAmount;
                refundDetails.push({
                  orderId: order.id,
                  orderName: order.name,
                  refundId: refund.id,
                  amount: refundAmount,
                  currency: refund.totalRefundedSet?.shopMoney?.currencyCode,
                  createdAt: refund.createdAt
                });
              });
            }
          });
        }
        
        // Extract the Shopify customer ID for database comparison
        const shopifyCustomerId = parsedData.id?.replace('gid://shopify/Customer/', '') || '';
        
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
          shopifyPlusCredit: {
            metafieldCredit: storeCreditFromMetafield,
            totalRefunds: totalRefunds,
            refundDetails: refundDetails,
            metafields: metafields,
            customerTags: parsedData.tags || [],
            totalAvailable: storeCreditFromMetafield // Could add refunds if they're converted to credit
          },
          databaseComparison: {
            shopifyMetafieldCredit: storeCreditFromMetafield,
            databaseCredit: existingCustomer ? parseFloat(existingCustomer.storeCredit.toString()) : 0,
            isInSync: existingCustomer ? 
              Math.abs(storeCreditFromMetafield - parseFloat(existingCustomer.storeCredit.toString())) < 0.01 : false,
            currentTier: currentTier ? {
              name: currentTier.name,
              cashbackPercent: currentTier.cashbackPercent
            } : null
          },
          recommendations: [
            !storeCreditFromMetafield && !totalRefunds ? "No store credit found in metafields or refunds" : null,
            !existingCustomer ? "Customer not found in database - needs sync" : null,
            existingCustomer && Math.abs(storeCreditFromMetafield - parseFloat(existingCustomer.storeCredit.toString())) >= 0.01 ?
              `Credit mismatch: Shopify metafield has ${storeCreditFromMetafield}, Database has ${existingCustomer.storeCredit}` : null,
            totalRefunds > 0 ? `Customer has ${totalRefunds} in refunds that could be converted to store credit` : null
          ].filter(Boolean)
        };
      } else if (queryType === "giftCards" && rawResponse.data.giftCards) {
        parsedData = rawResponse.data.giftCards;
        
        // Calculate total gift card balance
        let totalBalance = 0;
        let totalInitialValue = 0;
        const activeCards: any[] = [];
        const expiredCards: any[] = [];
        
        rawResponse.data.giftCards.edges.forEach((edge: any) => {
          const card = edge.node;
          const balance = parseFloat(card.balance?.amount || "0");
          const initialValue = parseFloat(card.initialValue?.amount || "0");
          
          totalBalance += balance;
          totalInitialValue += initialValue;
          
          const cardInfo = {
            id: card.id,
            maskedCode: card.maskedCode,
            lastCharacters: card.lastCharacters,
            balance: balance,
            initialValue: initialValue,
            currency: card.balance?.currencyCode,
            enabled: card.enabled,
            expiresOn: card.expiresOn,
            createdAt: card.createdAt,
            note: card.note,
            customer: card.customer
          };
          
          if (card.enabled && (!card.expiresOn || new Date(card.expiresOn) > new Date())) {
            activeCards.push(cardInfo);
          } else {
            expiredCards.push(cardInfo);
          }
        });
        
        databaseCreditBalance = {
          giftCardSummary: {
            totalBalance: totalBalance,
            totalInitialValue: totalInitialValue,
            activeCardsCount: activeCards.length,
            expiredCardsCount: expiredCards.length,
            activeCards: activeCards,
            expiredCards: expiredCards,
            hasMore: rawResponse.data.giftCards.pageInfo?.hasNextPage || false
          },
          recommendations: [
            activeCards.length === 0 ? "No active gift cards found for this customer" : null,
            expiredCards.length > 0 ? `${expiredCards.length} gift card(s) have expired` : null,
            totalBalance > 0 ? `Customer has ${totalBalance} available in gift card balance` : null
          ].filter(Boolean)
        };
      } else if (queryType === "shopifyCreditBalance" && rawResponse.data.customer) {
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
                    { label: "Store Credit (Shopify Plus)", value: "storeCredit" },
                    { label: "Gift Cards (Store Credit)", value: "giftCards" },
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
                    queryType === "storeCredit" ? "Fetches metafields and refunds for store credit (Shopify Plus approach)" :
                    queryType === "giftCards" ? "Fetches gift cards that can be used as store credit" :
                    queryType === "shopifyCreditBalance" ? "Fetches store credit from Shopify metafields and compares with database" :
                    queryType === "creditBalance" ? "Tests customer credit balance sync between Shopify and database" :
                    queryType === "updateCredit" ? "Updates customer credit via Shopify metafields" :
                    undefined
                  }
                />
                
                {(queryType === "single" || queryType === "creditBalance" || queryType === "updateCredit" || queryType === "shopifyCreditBalance" || queryType === "storeCredit" || queryType === "giftCards") && (
                  <TextField
                    label="Customer ID"
                    value={customerId}
                    onChange={(value) => {
                      // If user enters just a number, convert to full GraphQL ID
                      if (/^\d+$/.test(value)) {
                        setCustomerId(`gid://shopify/Customer/${value}`);
                      } else {
                        setCustomerId(value);
                      }
                    }}
                    placeholder="123456789 or gid://shopify/Customer/123456789"
                    helpText="Enter customer ID (will auto-format to GraphQL ID)"
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
                        
                        {/* Shopify Plus Store Credit Information */}
                        {actionData.databaseCreditBalance.shopifyPlusCredit && (
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Shopify Plus Store Credit (Metafields & Refunds)</Text>
                            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <Text as="p" variant="headingLg">
                                  Metafield Credit: ${actionData.databaseCreditBalance.shopifyPlusCredit.metafieldCredit.toFixed(2)}
                                </Text>
                                {actionData.databaseCreditBalance.shopifyPlusCredit.totalRefunds > 0 && (
                                  <Text as="p">
                                    Total Refunds: ${actionData.databaseCreditBalance.shopifyPlusCredit.totalRefunds.toFixed(2)}
                                  </Text>
                                )}
                                {actionData.databaseCreditBalance.shopifyPlusCredit.customerTags?.length > 0 && (
                                  <Text as="p" tone="subdued">
                                    Tags: {actionData.databaseCreditBalance.shopifyPlusCredit.customerTags.join(', ')}
                                  </Text>
                                )}
                              </BlockStack>
                            </Box>
                            
                            {/* Refund Details */}
                            {actionData.databaseCreditBalance.shopifyPlusCredit.refundDetails?.length > 0 && (
                              <>
                                <Text variant="headingSm" as="h3">Refund History</Text>
                                <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                                  <BlockStack gap="200">
                                    {actionData.databaseCreditBalance.shopifyPlusCredit.refundDetails.map((refund: any, index: number) => (
                                      <BlockStack key={refund.refundId || index} gap="100">
                                        <InlineStack align="space-between">
                                          <Text as="p" fontWeight="semibold">
                                            {refund.orderName}: {refund.currency} {refund.amount.toFixed(2)}
                                          </Text>
                                          <Text as="p" tone="subdued">
                                            {new Date(refund.createdAt).toLocaleDateString()}
                                          </Text>
                                        </InlineStack>
                                        {index < actionData.databaseCreditBalance.shopifyPlusCredit.refundDetails.length - 1 && <Divider />}
                                      </BlockStack>
                                    ))}
                                  </BlockStack>
                                </Box>
                              </>
                            )}
                          </BlockStack>
                        )}
                        
                        {/* Gift Card Summary */}
                        {actionData.databaseCreditBalance.giftCardSummary && (
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Gift Cards (Store Credit)</Text>
                            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <Text as="p" variant="headingLg">
                                  Total Balance: ${actionData.databaseCreditBalance.giftCardSummary.totalBalance.toFixed(2)}
                                </Text>
                                <Text as="p">
                                  Active Cards: {actionData.databaseCreditBalance.giftCardSummary.activeCardsCount}
                                </Text>
                                {actionData.databaseCreditBalance.giftCardSummary.expiredCardsCount > 0 && (
                                  <Text as="p" tone="caution">
                                    Expired Cards: {actionData.databaseCreditBalance.giftCardSummary.expiredCardsCount}
                                  </Text>
                                )}
                              </BlockStack>
                            </Box>
                            
                            {/* Active Gift Cards */}
                            {actionData.databaseCreditBalance.giftCardSummary.activeCards?.length > 0 && (
                              <>
                                <Text variant="headingSm" as="h3">Active Gift Cards</Text>
                                <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                                  <BlockStack gap="200">
                                    {actionData.databaseCreditBalance.giftCardSummary.activeCards.map((card: any, index: number) => (
                                      <BlockStack key={card.id || index} gap="100">
                                        <InlineStack align="space-between">
                                          <Text as="p" fontWeight="semibold">
                                            {card.maskedCode || `****${card.lastCharacters}`}
                                          </Text>
                                          <Text as="p">
                                            Balance: {card.currency} {card.balance.toFixed(2)}
                                          </Text>
                                        </InlineStack>
                                        {card.note && (
                                          <Text as="p" tone="subdued">{card.note}</Text>
                                        )}
                                        {card.expiresOn && (
                                          <Text as="p" tone="subdued">
                                            Expires: {new Date(card.expiresOn).toLocaleDateString()}
                                          </Text>
                                        )}
                                        {index < actionData.databaseCreditBalance.giftCardSummary.activeCards.length - 1 && <Divider />}
                                      </BlockStack>
                                    ))}
                                  </BlockStack>
                                </Box>
                              </>
                            )}
                          </BlockStack>
                        )}
                        
                        {/* Native Shopify Store Credit Information - keeping for compatibility */}
                        {actionData.databaseCreditBalance.shopifyNativeCredit && (
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">Native Shopify Store Credit</Text>
                            <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                {actionData.databaseCreditBalance.shopifyNativeCredit.available ? (
                                  <>
                                    <Text as="p" variant="headingLg">
                                      Balance: {actionData.databaseCreditBalance.shopifyNativeCredit.available.currency} {actionData.databaseCreditBalance.shopifyNativeCredit.available.amount}
                                    </Text>
                                    {actionData.databaseCreditBalance.shopifyNativeCredit.accountId && (
                                      <Text as="p" tone="subdued">
                                        Account ID: {actionData.databaseCreditBalance.shopifyNativeCredit.accountId}
                                      </Text>
                                    )}
                                  </>
                                ) : (
                                  <Text as="p" tone="subdued">No store credit available</Text>
                                )}
                              </BlockStack>
                            </Box>
                            
                            {/* Transaction History */}
                            {actionData.databaseCreditBalance.shopifyNativeCredit.transactions?.length > 0 && (
                              <>
                                <Text variant="headingSm" as="h3">Transaction History</Text>
                                <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                                  <BlockStack gap="200">
                                    {actionData.databaseCreditBalance.shopifyNativeCredit.transactions.map((tx: any, index: number) => (
                                      <BlockStack key={tx.id || index} gap="100">
                                        <InlineStack align="space-between">
                                          <Text as="p" fontWeight="semibold">
                                            {tx.type}: {tx.currency} {tx.amount}
                                          </Text>
                                          <Text as="p" tone="subdued">
                                            {new Date(tx.createdAt).toLocaleDateString()}
                                          </Text>
                                        </InlineStack>
                                        {tx.description && (
                                          <Text as="p">{tx.description}</Text>
                                        )}
                                        {tx.orderName && (
                                          <Text as="p" tone="subdued">Order: {tx.orderName}</Text>
                                        )}
                                        {index < actionData.databaseCreditBalance.shopifyNativeCredit.transactions.length - 1 && <Divider />}
                                      </BlockStack>
                                    ))}
                                    {actionData.databaseCreditBalance.shopifyNativeCredit.hasMoreTransactions && (
                                      <Text as="p" tone="subdued">More transactions available...</Text>
                                    )}
                                  </BlockStack>
                                </Box>
                              </>
                            )}
                            
                            {/* Transaction Types Legend */}
                            {actionData.databaseCreditBalance.transactionTypes && (
                              <>
                                <Text variant="headingSm" as="h3">Transaction Types</Text>
                                <Box padding="200" background="bg-surface-info" borderRadius="200">
                                  <BlockStack gap="100">
                                    {Object.entries(actionData.databaseCreditBalance.transactionTypes).map(([type, description]) => (
                                      <Text as="p" key={type}>
                                        <Text as="span" fontWeight="semibold">{type}:</Text> {description as string}
                                      </Text>
                                    ))}
                                  </BlockStack>
                                </Box>
                              </>
                            )}
                          </BlockStack>
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