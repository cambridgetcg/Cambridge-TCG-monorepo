/**
 * App Proxy Testing Page
 * 
 * This page helps test the App Proxy implementation by simulating
 * widget requests and displaying the results.
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { Page, Card, Text, Button, Box, Badge, BlockStack, InlineStack, Link } from "@shopify/polaris";
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

export default function AppProxyTest() {
  const { shop, appUrl, proxyUrl, directApiUrl } = useLoaderData<typeof loader>();
  const [testResults, setTestResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
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
  
  return (
    <Page
      title="App Proxy Test"
      subtitle="Test and verify your App Proxy configuration"
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
                <Link url={proxyUrl} external>
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