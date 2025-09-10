import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Badge,
  TextField,
  Select,
  Divider,
  DataTable,
  EmptyState,
  SkeletonBodyText,
  Collapsible,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import crypto from "crypto";
import db from "../db.server";

// GraphQL query for minimal customer data matching Prisma schema
const CUSTOMERS_QUERY = `
  query GetCustomersMinimal($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query) {
      edges {
        cursor
        node {
          id
          email
          displayName
          createdAt
          updatedAt
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

// Extended query with more details for testing
const CUSTOMERS_DETAILED_QUERY = `
  query GetCustomersDetailed($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query) {
      edges {
        cursor
        node {
          id
          email
          firstName
          lastName
          displayName
          phone
          state
          createdAt
          updatedAt
          tags
          ordersCount
          totalSpentV2 {
            amount
            currencyCode
          }
          addresses(first: 1) {
            city
            country
            province
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

// Single customer query
const SINGLE_CUSTOMER_QUERY = `
  query GetSingleCustomer($id: ID!) {
    customer(id: $id) {
      id
      email
      firstName
      lastName
      displayName
      createdAt
      updatedAt
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Get existing customer count from database
  const customerCount = await db.customer.count({
    where: { shop: session.shop }
  });

  return json({
    shop: session.shop,
    customerCount,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");
  const shop = session.shop;

  try {
    if (action === "test-minimal") {
      // Test minimal customer query
      console.log("[GraphQL Test] Fetching minimal customer data");
      
      const response = await admin.graphql(CUSTOMERS_QUERY, {
        variables: {
          first: 5, // Just fetch 5 customers for testing
          after: null,
          query: null,
        },
      });
      
      const result = await response.json() as any;
      
      if (result.errors) {
        return json({
          success: false,
          message: "GraphQL query failed",
          errors: result.errors,
        });
      }
      
      const customers = result.data.customers.edges.map((edge: any) => ({
        shopifyId: edge.node.id.split('/').pop(),
        email: edge.node.email || "No email",
        displayName: edge.node.displayName || "No name",
        createdAt: edge.node.createdAt,
        updatedAt: edge.node.updatedAt,
      }));
      
      return json({
        success: true,
        message: `Successfully fetched ${customers.length} customers (minimal data)`,
        data: {
          customers,
          pageInfo: result.data.customers.pageInfo,
        },
        rawResponse: result, // Include raw GraphQL response
      });
    }
    
    if (action === "test-detailed") {
      // Test detailed customer query
      console.log("[GraphQL Test] Fetching detailed customer data");
      
      const response = await admin.graphql(CUSTOMERS_DETAILED_QUERY, {
        variables: {
          first: 5,
          after: null,
          query: null,
        },
      });
      
      const result = await response.json() as any;
      
      if (result.errors) {
        return json({
          success: false,
          message: "GraphQL query failed",
          errors: result.errors,
        });
      }
      
      const customers = result.data.customers.edges.map((edge: any) => ({
        shopifyId: edge.node.id.split('/').pop(),
        gid: edge.node.id,
        email: edge.node.email || "No email",
        firstName: edge.node.firstName || "",
        lastName: edge.node.lastName || "",
        displayName: edge.node.displayName || "No name",
        phone: edge.node.phone || "",
        state: edge.node.state,
        tags: edge.node.tags,
        ordersCount: edge.node.ordersCount,
        totalSpent: edge.node.totalSpentV2 ? {
          amount: edge.node.totalSpentV2.amount,
          currency: edge.node.totalSpentV2.currencyCode,
        } : null,
        createdAt: edge.node.createdAt,
        updatedAt: edge.node.updatedAt,
      }));
      
      return json({
        success: true,
        message: `Successfully fetched ${customers.length} customers (detailed data)`,
        data: {
          customers,
          pageInfo: result.data.customers.pageInfo,
        },
        rawResponse: result, // Include raw GraphQL response
      });
    }
    
    if (action === "test-single") {
      // Test single customer query
      const customerId = formData.get("customerId") as string;
      
      if (!customerId) {
        return json({
          success: false,
          message: "Customer ID is required",
        });
      }
      
      console.log(`[GraphQL Test] Fetching single customer: ${customerId}`);
      
      // Format as Shopify GID if needed
      const gid = customerId.startsWith("gid://") 
        ? customerId 
        : `gid://shopify/Customer/${customerId}`;
      
      const response = await admin.graphql(SINGLE_CUSTOMER_QUERY, {
        variables: { id: gid },
      });
      
      const result = await response.json() as any;
      
      if (result.errors) {
        return json({
          success: false,
          message: "GraphQL query failed",
          errors: result.errors,
        });
      }
      
      if (!result.data.customer) {
        return json({
          success: false,
          message: "Customer not found",
        });
      }
      
      const customer = {
        shopifyId: result.data.customer.id.split('/').pop(),
        gid: result.data.customer.id,
        email: result.data.customer.email || "No email",
        firstName: result.data.customer.firstName || "",
        lastName: result.data.customer.lastName || "",
        displayName: result.data.customer.displayName || "No name",
        createdAt: result.data.customer.createdAt,
        updatedAt: result.data.customer.updatedAt,
      };
      
      return json({
        success: true,
        message: "Successfully fetched single customer",
        data: { customer },
        rawResponse: result, // Include raw GraphQL response
      });
    }
    
    if (action === "import-to-db") {
      // Import customers to database (minimal fields only)
      console.log("[GraphQL Test] Importing customers to database");
      
      const response = await admin.graphql(CUSTOMERS_QUERY, {
        variables: {
          first: 10, // Import up to 10 customers for testing
          after: null,
          query: null,
        },
      });
      
      const result = await response.json() as any;
      
      if (result.errors) {
        return json({
          success: false,
          message: "GraphQL query failed",
          errors: result.errors,
        });
      }
      
      let imported = 0;
      let skipped = 0;
      const importResults = [];
      
      for (const edge of result.data.customers.edges) {
        const node = edge.node;
        const shopifyId = node.id.split('/').pop();
        
        // Check if customer exists
        const existing = await db.customer.findFirst({
          where: {
            shop,
            shopifyCustomerId: shopifyId,
          },
        });
        
        if (!existing) {
          // Create new customer with minimal required fields
          const newCustomer = await db.customer.create({
            data: {
              id: crypto.randomUUID(),
              shop,
              shopifyCustomerId: shopifyId,
              email: node.email || `customer${shopifyId}@example.com`, // Fallback email
              storeCredit: 0,
              createdAt: new Date(node.createdAt),
              updatedAt: new Date(),
            },
          });
          
          imported++;
          importResults.push({
            shopifyId,
            email: newCustomer.email,
            status: "imported",
          });
        } else {
          skipped++;
          importResults.push({
            shopifyId,
            email: existing.email,
            status: "skipped (exists)",
          });
        }
      }
      
      return json({
        success: true,
        message: `Import complete: ${imported} imported, ${skipped} skipped`,
        data: {
          imported,
          skipped,
          total: imported + skipped,
          results: importResults,
        },
        rawResponse: result, // Include raw GraphQL response
      });
    }
    
    return json({
      success: false,
      message: "Invalid action",
    });
    
  } catch (error) {
    console.error("[GraphQL Test] Error:", error);
    return json({
      success: false,
      message: error instanceof Error ? error.message : "An error occurred",
      error: error instanceof Error ? error.stack : undefined,
    });
  }
};

export default function GraphQLCustomerTest() {
  const { shop, customerCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [customerId, setCustomerId] = useState("");
  const [queryType, setQueryType] = useState("minimal");
  const [showRawData, setShowRawData] = useState(false);
  
  const isLoading = navigation.state === "submitting";
  
  const handleTest = (action: string) => {
    const formData = new FormData();
    formData.append("action", action);
    if (action === "test-single" && customerId) {
      formData.append("customerId", customerId);
    }
    submit(formData, { method: "post" });
  };
  
  return (
    <Page
      title="Customer GraphQL API Test"
      subtitle="Test Shopify customer queries with minimal data"
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Status Card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">
                      Current Status
                    </Text>
                    <Badge tone="info">Test Environment</Badge>
                  </InlineStack>
                  
                  <InlineStack gap="600">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued" as="p">
                        Shop
                      </Text>
                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                        {shop}
                      </Text>
                    </BlockStack>
                    
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued" as="p">
                        Customers in Database
                      </Text>
                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                        {customerCount}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>
            
            {/* Query Tester */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Customer Query Tests
                  </Text>
                  
                  <Banner tone="info">
                    <p>
                      These queries fetch the minimum required customer data to satisfy the Prisma schema:
                      <br />• <strong>id</strong>: Shopify customer ID (required)
                      <br />• <strong>email</strong>: Customer email (required, with fallback)
                      <br />• <strong>createdAt/updatedAt</strong>: Timestamps for tracking
                    </p>
                  </Banner>
                  
                  <Divider />
                  
                  {/* Minimal Query Test */}
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      1. Minimal Customer Query
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Fetches only required fields: id, email, displayName, timestamps
                    </Text>
                    <Button
                      onClick={() => handleTest("test-minimal")}
                      loading={isLoading}
                      variant="primary"
                    >
                      Test Minimal Query (5 customers)
                    </Button>
                  </BlockStack>
                  
                  <Divider />
                  
                  {/* Detailed Query Test */}
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      2. Detailed Customer Query
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Includes additional fields: names, phone, orders, total spent, tags
                    </Text>
                    <Button
                      onClick={() => handleTest("test-detailed")}
                      loading={isLoading}
                    >
                      Test Detailed Query (5 customers)
                    </Button>
                  </BlockStack>
                  
                  <Divider />
                  
                  {/* Single Customer Test */}
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      3. Single Customer Query
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Fetch a specific customer by ID
                    </Text>
                    <InlineStack gap="300">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Customer ID"
                          labelHidden
                          placeholder="Enter Shopify customer ID (e.g., 7654321)"
                          value={customerId}
                          onChange={setCustomerId}
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        onClick={() => handleTest("test-single")}
                        loading={isLoading}
                        disabled={!customerId}
                      >
                        Test Single Customer
                      </Button>
                    </InlineStack>
                  </BlockStack>
                  
                  <Divider />
                  
                  {/* Import to Database */}
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      4. Import to Database
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Import customers with minimal required fields into the database
                    </Text>
                    <Banner tone="warning">
                      <p>
                        This will create customer records in your database with:
                        <br />• Shopify customer ID
                        <br />• Email (or fallback if not available)
                        <br />• Initial store credit of 0
                        <br />• Proper timestamps
                      </p>
                    </Banner>
                    <Button
                      onClick={() => handleTest("import-to-db")}
                      loading={isLoading}
                      tone="success"
                    >
                      Import Customers to Database (10 max)
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
            
            {/* GraphQL Query Display */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    GraphQL Query Examples
                  </Text>
                  
                  <Select
                    label="Select query to view"
                    options={[
                      { label: "Minimal Customer Query", value: "minimal" },
                      { label: "Detailed Customer Query", value: "detailed" },
                      { label: "Single Customer Query", value: "single" },
                    ]}
                    value={queryType}
                    onChange={setQueryType}
                  />
                  
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <pre style={{ 
                      fontFamily: "monospace", 
                      fontSize: "12px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      margin: 0,
                    }}>
                      {queryType === "minimal" && CUSTOMERS_QUERY}
                      {queryType === "detailed" && CUSTOMERS_DETAILED_QUERY}
                      {queryType === "single" && SINGLE_CUSTOMER_QUERY}
                    </pre>
                  </Box>
                </BlockStack>
              </Box>
            </Card>
            
            {/* Query Results Display */}
            {actionData && (
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd" as="h2">
                        Query Results
                      </Text>
                      <Badge tone={actionData.success ? "success" : "critical"}>
                        {actionData.success ? "Success" : "Failed"}
                      </Badge>
                    </InlineStack>
                    
                    {/* Result Message */}
                    <Banner tone={actionData.success ? "success" : "critical"}>
                      <p>{actionData.message}</p>
                    </Banner>
                    
                    {/* Formatted Data Display */}
                    {actionData.data && (
                      <BlockStack gap="300">
                        <Text variant="headingMd" as="h3">
                          Formatted Data
                        </Text>
                        
                        {/* Customer Table for list queries */}
                        {actionData.data.customers && (
                          <DataTable
                            columnContentTypes={["text", "text", "text", "text"]}
                            headings={["Shopify ID", "Email", "Display Name", "Created At"]}
                            rows={actionData.data.customers.map((customer: any) => [
                              customer.shopifyId || customer.gid?.split('/').pop() || "N/A",
                              customer.email || "No email",
                              customer.displayName || customer.firstName + " " + customer.lastName || "No name",
                              new Date(customer.createdAt).toLocaleDateString(),
                            ])}
                          />
                        )}
                        
                        {/* Single Customer Display */}
                        {actionData.data.customer && (
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                              <InlineStack gap="400">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  Shopify ID:
                                </Text>
                                <Text variant="bodyMd" as="span">
                                  {actionData.data.customer.shopifyId}
                                </Text>
                              </InlineStack>
                              <InlineStack gap="400">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  Email:
                                </Text>
                                <Text variant="bodyMd" as="span">
                                  {actionData.data.customer.email}
                                </Text>
                              </InlineStack>
                              <InlineStack gap="400">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  Name:
                                </Text>
                                <Text variant="bodyMd" as="span">
                                  {actionData.data.customer.displayName}
                                </Text>
                              </InlineStack>
                              <InlineStack gap="400">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  Created:
                                </Text>
                                <Text variant="bodyMd" as="span">
                                  {new Date(actionData.data.customer.createdAt).toLocaleString()}
                                </Text>
                              </InlineStack>
                            </BlockStack>
                          </Box>
                        )}
                        
                        {/* Import Results */}
                        {actionData.data.results && Array.isArray(actionData.data.results) && (
                          <BlockStack gap="300">
                            <InlineStack gap="400">
                              <Badge tone="success">
                                Imported: {actionData.data.imported}
                              </Badge>
                              <Badge tone="attention">
                                Skipped: {actionData.data.skipped}
                              </Badge>
                              <Badge>
                                Total: {actionData.data.total}
                              </Badge>
                            </InlineStack>
                            
                            <DataTable
                              columnContentTypes={["text", "text", "text"]}
                              headings={["Shopify ID", "Email", "Status"]}
                              rows={actionData.data.results.map((result: any) => [
                                result.shopifyId,
                                result.email,
                                result.status,
                              ])}
                            />
                          </BlockStack>
                        )}
                        
                        {/* Page Info */}
                        {actionData.data.pageInfo && (
                          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                              <Text variant="headingSm" as="h4">
                                Pagination Info
                              </Text>
                              <InlineStack gap="400">
                                <Badge>
                                  Has Next Page: {actionData.data.pageInfo.hasNextPage ? "Yes" : "No"}
                                </Badge>
                                <Badge>
                                  Has Previous Page: {actionData.data.pageInfo.hasPreviousPage ? "Yes" : "No"}
                                </Badge>
                              </InlineStack>
                            </BlockStack>
                          </Box>
                        )}
                      </BlockStack>
                    )}
                    
                    <Divider />
                    
                    {/* Raw GraphQL Response */}
                    <BlockStack gap="300">
                      <Button
                        onClick={() => setShowRawData(!showRawData)}
                        ariaExpanded={showRawData}
                        ariaControls="raw-data"
                      >
                        {showRawData ? "Hide" : "Show"} Raw GraphQL Response
                      </Button>
                      
                      <Collapsible
                        open={showRawData}
                        id="raw-data"
                        transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
                      >
                        <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h4">
                              Raw Response Data
                            </Text>
                            <pre style={{
                              fontFamily: "monospace",
                              fontSize: "11px",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              margin: 0,
                              maxHeight: "500px",
                              overflow: "auto",
                              backgroundColor: "#f6f8fa",
                              padding: "12px",
                              borderRadius: "4px",
                            }}>
                              {JSON.stringify(actionData.rawResponse, null, 2)}
                            </pre>
                          </BlockStack>
                        </Box>
                      </Collapsible>
                    </BlockStack>
                    
                    {/* Error Display */}
                    {actionData.errors && (
                      <Box background="bg-surface-critical" padding="400" borderRadius="200">
                        <BlockStack gap="200">
                          <Text variant="headingSm" as="h4">
                            GraphQL Errors
                          </Text>
                          <pre style={{
                            fontFamily: "monospace",
                            fontSize: "11px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            margin: 0,
                          }}>
                            {JSON.stringify(actionData.errors, null, 2)}
                          </pre>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </Box>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}