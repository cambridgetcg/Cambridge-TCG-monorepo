/**
 * App Proxy & ProductCreate Testing Page
 *
 * This page helps test the App Proxy implementation and productCreate mutation.
 */

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { Page, Card, Text, Button, Box, Badge, BlockStack, InlineStack, Link, Banner, Divider } from "@shopify/polaris";
import { useState, useCallback } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Get the shop domain for testing
  const shop = session.shop;
  const appUrl = process.env.SHOPIFY_APP_URL || "https://rewardspro-production-nnwf.vercel.app";

  return json({
    shop,
    appUrl,
    proxyUrl: `https://${shop}/apps/rewardspro/membership`,
    directApiUrl: `${appUrl}/api/proxy/membership`
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const testType = formData.get("testType");

  if (testType === "productCreate") {
    try {
      // Test the productCreate mutation with product options
      const productCreateMutation = `#graphql
        mutation productCreate($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product {
              id
              title
              handle
              status
              vendor
              productType
              tags
              options {
                id
                name
                position
                optionValues {
                  id
                  name
                  hasVariants
                }
              }
              variants(first: 5) {
                edges {
                  node {
                    id
                    sku
                    price
                    title
                  }
                }
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

      // Create a test product with options
      const response = await admin.graphql(productCreateMutation, {
        variables: {
          product: {
            title: "Test Tier Product - " + new Date().toLocaleString(),
            descriptionHtml: "<p>This is a test product created via productCreate mutation</p>",
            vendor: session.shop.split('.')[0],
            productType: "Tier Membership",
            status: "DRAFT",
            tags: ["test", "tier-product", "mutation-test"],
            productOptions: [
              {
                name: "Duration",
                values: [{ name: "Monthly" }, { name: "Annual" }]
              },
              {
                name: "Level",
                values: [{ name: "Silver" }, { name: "Gold" }]
              }
            ]
          }
        }
      });

      const result = await response.json();

      // Clean up - delete the test product after creating it
      if (result.data?.productCreate?.product?.id) {
        const deleteResponse = await admin.graphql(
          `#graphql
          mutation productDelete($id: ID!) {
            productDelete(input: { id: $id }) {
              deletedProductId
            }
          }`,
          {
            variables: { id: result.data.productCreate.product.id }
          }
        );
        const deleteResult = await deleteResponse.json();
        result.deleted = deleteResult.data?.productDelete?.deletedProductId ? true : false;
      }

      return json({
        testType: "productCreate",
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("ProductCreate test error:", error);
      return json({
        testType: "productCreate",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  }

  return json({ success: false, error: "Unknown test type" });
};

export default function AppProxyTest() {
  const { shop, appUrl, proxyUrl, directApiUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [testResults, setTestResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [productCreateLoading, setProductCreateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testAppProxy = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTestResults(null);

    try {
      // Note: This test won't work from the admin panel due to CORS
      // It's meant to show what URL to test from the actual storefront
      const response = await fetch('/api/proxy/membership?shop=' + shop + '&logged_in_customer_id=test');
      const data = await response.json();
      setTestResults({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setLoading(false);
    }
  }, [shop]);

  const testProductCreate = useCallback(() => {
    setProductCreateLoading(true);
    const formData = new FormData();
    formData.append("testType", "productCreate");
    submit(formData, { method: "post" });
    setTimeout(() => setProductCreateLoading(false), 2000);
  }, [submit]);

  return (
    <Page
      title="API Testing Page"
      subtitle="Test App Proxy and productCreate mutation"
      backAction={{ url: "/app" }}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Configuration Status</Text>
            
            <Box paddingBlockStart="200">
              <BlockStack gap="200">
                <InlineStack gap="200" align="space-between">
                  <Text as="span" tone="subdued">Shop Domain:</Text>
                  <Badge tone="info">{shop}</Badge>
                </InlineStack>
                
                <InlineStack gap="200" align="space-between">
                  <Text as="span" tone="subdued">App URL:</Text>
                  <Badge tone="info">{appUrl}</Badge>
                </InlineStack>
                
                <InlineStack gap="200" align="space-between">
                  <Text as="span" tone="subdued">Proxy Path:</Text>
                  <Badge tone="success">/apps/rewardspro/*</Badge>
                </InlineStack>
              </BlockStack>
            </Box>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">ProductCreate Mutation Test</Text>

            <Text as="p">
              Test the productCreate GraphQL mutation with product options to ensure it's working correctly for tier products.
            </Text>

            <Button
              variant="primary"
              onClick={testProductCreate}
              loading={productCreateLoading}
            >
              Test ProductCreate Mutation
            </Button>

            {actionData && 'testType' in actionData && actionData.testType === "productCreate" && (
              <Box paddingBlockStart="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">Test Result</Text>
                    <Badge tone={actionData.success ? "success" : "critical"}>
                      {actionData.success ? "Success" : "Failed"}
                    </Badge>
                  </InlineStack>

                  {actionData.success && 'data' in actionData && (actionData as any).data?.data?.productCreate?.product && (
                    <>
                      <Banner tone="success">
                        Product created and deleted successfully!
                      </Banner>

                      <BlockStack gap="200">
                        <Text as="p" fontWeight="semibold">Product Details:</Text>
                        <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                          <BlockStack gap="100">
                            <Text as="p">
                              <strong>Title:</strong> {(actionData as any).data.data.productCreate.product.title}
                            </Text>
                            <Text as="p">
                              <strong>ID:</strong> {(actionData as any).data.data.productCreate.product.id}
                            </Text>
                            <Text as="p">
                              <strong>Handle:</strong> {(actionData as any).data.data.productCreate.product.handle}
                            </Text>
                            <Text as="p">
                              <strong>Status:</strong> {(actionData as any).data.data.productCreate.product.status}
                            </Text>
                          </BlockStack>
                        </Box>

                        {(actionData as any).data.data.productCreate.product.options?.length > 0 && (
                          <>
                            <Text as="p" fontWeight="semibold">Product Options:</Text>
                            <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                              {(actionData as any).data.data.productCreate.product.options.map((opt: any) => (
                                <Text key={opt.id} as="p">
                                  <strong>{opt.name}:</strong> {opt.optionValues.map((v: any) => v.name).join(", ")}
                                </Text>
                              ))}
                            </Box>
                          </>
                        )}

                        {(actionData as any).data.data.productCreate.product.variants?.edges?.length > 0 && (
                          <>
                            <Text as="p" fontWeight="semibold">Generated Variants ({(actionData as any).data.data.productCreate.product.variants.edges.length}):</Text>
                            <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                              {(actionData as any).data.data.productCreate.product.variants.edges.map((edge: any, idx: number) => (
                                <Text key={edge.node.id} as="p">
                                  {idx + 1}. {edge.node.title || "Default"} (ID: {edge.node.id.split('/').pop()})
                                </Text>
                              ))}
                            </Box>
                          </>
                        )}

                        {(actionData as any).data?.deleted && (
                          <Badge tone="info">Test product was automatically deleted after creation</Badge>
                        )}
                      </BlockStack>
                    </>
                  )}

                  {'data' in actionData && (actionData as any).data?.data?.productCreate?.userErrors?.length > 0 && (
                    <Banner tone="critical">
                      <BlockStack gap="200">
                        <Text as="p" fontWeight="semibold">User Errors:</Text>
                        {(actionData as any).data.data.productCreate.userErrors.map((err: any, idx: number) => (
                          <Text key={idx} as="p">
                            {err.field}: {err.message} (Code: {err.code})
                          </Text>
                        ))}
                      </BlockStack>
                    </Banner>
                  )}

                  {!actionData.success && (
                    <Banner tone="critical">
                      Error: {'error' in actionData ? actionData.error : 'Unknown error'}
                    </Banner>
                  )}

                  <details>
                    <summary style={{ cursor: 'pointer', padding: '8px 0' }}>
                      <Text as="span" fontWeight="semibold">View Full Response</Text>
                    </summary>
                    <Box paddingBlockStart="200">
                      <pre style={{
                        background: '#f6f8fa',
                        padding: '12px',
                        borderRadius: '6px',
                        overflow: 'auto',
                        fontSize: '12px',
                        lineHeight: '1.5'
                      }}>
                        {JSON.stringify(actionData, null, 2)}
                      </pre>
                    </Box>
                  </details>
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Testing Instructions</Text>
            
            <Text as="p">
              App Proxy requests must come from the storefront domain, not the admin panel.
              To test your App Proxy:
            </Text>
            
            <BlockStack gap="200">
              <Text as="p">
                <strong>1. From your storefront (recommended):</strong>
              </Text>
              <Box paddingInlineStart="400">
                <Text as="p" tone="subdued">
                  Open your browser's developer console on your storefront and run:
                </Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <code>
                    {`fetch('/apps/rewardspro/membership')
  .then(r => r.json())
  .then(console.log)`}
                  </code>
                </Box>
              </Box>
              
              <Text as="p">
                <strong>2. Direct URL test:</strong>
              </Text>
              <Box paddingInlineStart="400">
                <Text as="p" tone="subdued">
                  Visit this URL in your browser (you'll need to be logged in as a customer):
                </Text>
                <Link url={proxyUrl} target="_blank">
                  {proxyUrl}
                </Link>
              </Box>
              
              <Text as="p">
                <strong>3. Using curl (for debugging):</strong>
              </Text>
              <Box paddingInlineStart="400">
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <code>
                    {`curl "${proxyUrl}"`}
                  </code>
                </Box>
              </Box>
            </BlockStack>
          </BlockStack>
        </Card>
        
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Expected Responses</Text>
            
            <BlockStack gap="300">
              <Box>
                <Text as="h3" variant="headingSm">Guest User (not logged in):</Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <pre>{JSON.stringify({
                    success: true,
                    requiresLogin: true,
                    message: "Please log in to view your rewards"
                  }, null, 2)}</pre>
                </Box>
              </Box>
              
              <Box>
                <Text as="h3" variant="headingSm">Enrolled Customer:</Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <pre>{JSON.stringify({
                    success: true,
                    enrolled: true,
                    memberData: {
                      storeCredit: "$25.00",
                      tierName: "Silver",
                      cashbackRate: 5,
                      // ... more fields
                    }
                  }, null, 2)}</pre>
                </Box>
              </Box>
              
              <Box>
                <Text as="h3" variant="headingSm">Not Enrolled:</Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <pre>{JSON.stringify({
                    success: true,
                    enrolled: false,
                    message: "Join our rewards program to start earning cashback!"
                  }, null, 2)}</pre>
                </Box>
              </Box>
            </BlockStack>
          </BlockStack>
        </Card>
        
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Troubleshooting</Text>
            
            <BlockStack gap="200">
              <Box>
                <Text as="h3" variant="headingSm">404 Not Found</Text>
                <Text as="p" tone="subdued">
                  • Check that the App Proxy is configured in your Partner Dashboard<br/>
                  • Verify the subpath is "rewardspro" and prefix is "apps"<br/>
                  • Ensure the Proxy URL points to: {appUrl}/api/proxy
                </Text>
              </Box>
              
              <Box>
                <Text as="h3" variant="headingSm">401 Unauthorized</Text>
                <Text as="p" tone="subdued">
                  • App may not be installed properly<br/>
                  • HMAC signature verification may be failing<br/>
                  • Check your SHOPIFY_API_SECRET environment variable
                </Text>
              </Box>
              
              <Box>
                <Text as="h3" variant="headingSm">503 Service Unavailable</Text>
                <Text as="p" tone="subdued">
                  • Database connection issue<br/>
                  • Check your Aurora Data API credentials<br/>
                  • View server logs for detailed error
                </Text>
              </Box>
            </BlockStack>
          </BlockStack>
        </Card>
        
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Deployment Checklist</Text>
            
            <BlockStack gap="200">
              <Text as="p">✅ App Proxy handler created at <code>/app/routes/api.proxy.membership.tsx</code></Text>
              <Text as="p">✅ Added <code>write_app_proxy</code> scope to <code>shopify.app.toml</code></Text>
              <Text as="p">✅ Updated Proxy URL in <code>shopify.app.toml</code> to <code>/api/proxy</code></Text>
              <Text as="p">⏳ Run <code>shopify app deploy</code> to apply configuration changes</Text>
              <Text as="p">⏳ Configure App Proxy in Partner Dashboard with:</Text>
              <Box paddingInlineStart="400">
                <Text as="p">
                  • Subpath prefix: <strong>apps</strong><br/>
                  • Subpath: <strong>rewardspro</strong><br/>
                  • Proxy URL: <strong>{appUrl}/api/proxy</strong>
                </Text>
              </Box>
              <Text as="p">⏳ Test from storefront (not admin panel)</Text>
              <Text as="p">⏳ Verify widget loads customer data correctly</Text>
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}