import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return json({
    apiUrl: process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://rewardspro-production.vercel.app",
  });
};

export default function ProxyTestPage() {
  const { apiUrl } = useLoaderData<typeof loader>();

  return (
    <Page title="🔬 Proxy Data API Test" subtitle="Test the app proxy endpoint and inspect request/response data">
      <Layout>
        <Layout.Section>
          <div style={{ height: 'calc(100vh - 200px)', minHeight: '800px' }}>
            <iframe
              src="/test-proxy.html"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
              title="Proxy API Test Tool"
            />
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Two Testing Modes
              </Text>

              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>Direct API Test (Admin):</strong> Tests the endpoint directly without Shopify proxy authentication.
                  This will show a 401 error as expected, demonstrating that the endpoint is properly secured.
                  Use this to verify the authentication is working.
                </Text>

                <Text as="p" variant="bodyMd">
                  <strong>Storefront Proxy Test:</strong> Generates a URL to test through Shopify's app proxy on your storefront.
                  Copy the URL, open your storefront, log in as a customer, and paste the URL to see the authenticated response.
                  This is how the widget actually fetches data.
                </Text>
              </BlockStack>

              <Text as="h2" variant="headingMd">
                How to Use
              </Text>

              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>1. Configure Parameters:</strong> Enter shop domain and customer ID (defaults provided)
                </Text>

                <Text as="p" variant="bodyMd">
                  <strong>2. Choose Test Mode:</strong> Select "Direct API Test" or "Storefront Proxy Test"
                </Text>

                <Text as="p" variant="bodyMd">
                  <strong>3. Run Test:</strong> Click the button to test or copy the proxy URL
                </Text>

                <Text as="p" variant="bodyMd">
                  <strong>4. View Results:</strong> Inspect request/response details, customer data, and raw JSON
                </Text>
              </BlockStack>

              <Text as="h2" variant="headingMd">
                What You'll See
              </Text>

              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  • <strong>Request Details:</strong> URL, method, shop domain, customer ID
                </Text>

                <Text as="p" variant="bodyMd">
                  • <strong>Response Statistics:</strong> Query method (AWS Aurora Data API), execution time, database status
                </Text>

                <Text as="p" variant="bodyMd">
                  • <strong>Customer Data:</strong> Store credit, total earned, membership tier, last sync time
                </Text>

                <Text as="p" variant="bodyMd">
                  • <strong>Raw JSON:</strong> Complete response payload for debugging
                </Text>
              </BlockStack>

              <Text as="h2" variant="headingMd">
                Why Two Modes?
              </Text>

              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="caution">
                  <strong>Direct API Test shows 401 errors by design.</strong> The proxy endpoint requires HMAC validation
                  from Shopify's app proxy infrastructure. Direct requests are rejected to prevent unauthorized data access.
                </Text>

                <Text as="p" variant="bodyMd">
                  <strong>Storefront Proxy Test shows real data.</strong> When you access the URL from your storefront,
                  Shopify adds HMAC authentication, and the endpoint returns actual customer data. This is how the
                  membership widget works in production.
                </Text>

                <Text as="p" variant="bodyMd" tone="success">
                  <strong>Expected behavior:</strong> Direct test = 401 error (good!), Storefront test = customer data (authenticated).
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
