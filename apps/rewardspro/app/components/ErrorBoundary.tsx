import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { Banner, Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

export function ErrorBoundary() {
  const error = useRouteError();
  
  // Log error to console for debugging
  console.error("App Error:", error);

  if (isRouteErrorResponse(error)) {
    return (
      <Page title="Error">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="critical">
                  <Text as="h2" variant="headingMd">
                    {error.status} {error.statusText}
                  </Text>
                </Banner>
                <Text as="p">{error.data}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Application Error">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Banner tone="critical">
                <Text as="h2" variant="headingMd">
                  Something went wrong
                </Text>
              </Banner>
              <Text as="p">
                {error instanceof Error ? error.message : "An unexpected error occurred"}
              </Text>
              <Text as="p" tone="subdued">
                Please try refreshing the page or contact support if the problem persists.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}