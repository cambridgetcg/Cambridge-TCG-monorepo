import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import {
  Banner,
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  InlineStack
} from "@shopify/polaris";
import { navigateToApp } from "~/utils/shopify-navigation";

export function ErrorBoundary() {
  const error = useRouteError();
  
  // Log error to console for debugging
  console.error("[ErrorBoundary] Caught error:", error);

  // Determine error type
  const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
  const isAuthError = errorMessage.toLowerCase().includes('unauthorized') || 
                      errorMessage.toLowerCase().includes('authentication') ||
                      errorMessage.toLowerCase().includes('401');
  const isDatabaseError = errorMessage.toLowerCase().includes('database') || 
                         errorMessage.toLowerCase().includes('prisma') ||
                         errorMessage.toLowerCase().includes('data api') ||
                         errorMessage.toLowerCase().includes('executestatement');

  if (isRouteErrorResponse(error)) {
    return (
      <Page title="Error">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="critical">
                  <Text as="h2" variant="headingMd">
                    {error.status === 404 ? "Page Not Found" : `Error ${error.status}`}
                  </Text>
                </Banner>
                <Text as="p">{error.statusText || error.data}</Text>
                
                {error.status === 401 && (
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">
                      Your session may have expired. Please refresh the page or re-install the app.
                    </Text>
                    <InlineStack gap="300">
                      <Button onClick={() => window.location.reload()} variant="primary">
                        Refresh Page
                      </Button>
                      <Button url="/app" variant="plain">
                        Go to Dashboard
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}
                
                {error.status === 500 && (
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">
                      A server error occurred. This may be temporary.
                    </Text>
                    <InlineStack gap="300">
                      <Button onClick={() => window.location.reload()} variant="primary">
                        Try Again
                      </Button>
                      <Button url="/app" variant="plain">
                        Go to Dashboard
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}
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
              <Banner tone={isAuthError ? "warning" : "critical"}>
                <Text as="h2" variant="headingMd">
                  {isAuthError ? "Authentication Required" : 
                   isDatabaseError ? "Database Connection Error" : 
                   "Something went wrong"}
                </Text>
              </Banner>
              
              {isAuthError ? (
                <BlockStack gap="200">
                  <Text as="p">
                    Your session has expired or is invalid.
                  </Text>
                  <Text as="p" tone="subdued">
                    Please refresh the page to re-authenticate.
                  </Text>
                  <InlineStack gap="300">
                    <Button onClick={() => navigateToApp('/app')} variant="primary">
                      Return to App
                    </Button>
                    <Button onClick={() => window.location.reload()}>
                      Refresh Page
                    </Button>
                  </InlineStack>
                </BlockStack>
              ) : isDatabaseError ? (
                <BlockStack gap="200">
                  <Text as="p">
                    Unable to connect to the database.
                  </Text>
                  <Text as="p" tone="subdued">
                    This is usually a temporary issue. Please try again in a few moments.
                  </Text>
                  {process.env.NODE_ENV === 'development' && (
                    <Card>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Debug: {errorMessage}
                      </Text>
                    </Card>
                  )}
                  <InlineStack gap="300">
                    <Button onClick={() => window.location.reload()} variant="primary">
                      Try Again
                    </Button>
                    <Button url="/app" variant="plain">
                      Go to Dashboard
                    </Button>
                  </InlineStack>
                </BlockStack>
              ) : (
                <BlockStack gap="200">
                  <Text as="p">
                    {errorMessage}
                  </Text>
                  <Text as="p" tone="subdued">
                    Please try refreshing the page or contact support if the problem persists.
                  </Text>
                  <InlineStack gap="300">
                    <Button onClick={() => window.location.reload()} variant="primary">
                      Refresh Page
                    </Button>
                    <Button url="/app" variant="plain">
                      Go to Dashboard
                    </Button>
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}