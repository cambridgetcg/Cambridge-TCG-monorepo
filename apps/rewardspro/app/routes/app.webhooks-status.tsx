/**
 * Webhook Status Page
 * 
 * This page displays the status of all registered webhooks,
 * showing which are configured for EventBridge vs HTTPS delivery.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  DataTable,
  Icon,
  Banner,
  Box,
  Divider,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  RefreshIcon,
  NotificationIcon,
  ExternalIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";

// Map GraphQL topics back to REST format
const GRAPHQL_TO_REST: Record<string, string> = {
  'CUSTOMERS_CREATE': 'customers/create',
  'CUSTOMERS_UPDATE': 'customers/update',
  'CUSTOMERS_DELETE': 'customers/delete',
  'ORDERS_CREATE': 'orders/create',
  'ORDERS_UPDATED': 'orders/updated',
  'ORDERS_PAID': 'orders/paid',
  'ORDERS_CANCELLED': 'orders/cancelled',
  'ORDERS_FULFILLED': 'orders/fulfilled',
  'APP_UNINSTALLED': 'app/uninstalled',
  'SHOP_UPDATE': 'shop/update',
  'PRODUCTS_CREATE': 'products/create',
  'PRODUCTS_UPDATE': 'products/update',
  'PRODUCTS_DELETE': 'products/delete',
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }

  try {
    // Query all webhook subscriptions
    const response = await admin.graphql(
      `#graphql
      query webhookSubscriptions {
        webhookSubscriptions(first: 100) {
          edges {
            node {
              id
              topic
              format
              endpoint {
                __typename
                ... on WebhookEventBridgeEndpoint {
                  arn
                }
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
                ... on WebhookPubSubEndpoint {
                  pubSubProject
                  pubSubTopic
                }
              }
              createdAt
              updatedAt
            }
          }
        }
      }`
    );

    const result = await response.json();
    
    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      throw new Error("Failed to fetch webhooks");
    }

    // Process webhooks
    const webhooks = result.data?.webhookSubscriptions?.edges?.map((edge: any) => {
      const node = edge.node;
      const restTopic = GRAPHQL_TO_REST[node.topic] || node.topic;
      
      let endpointType = 'Unknown';
      let endpoint = '';
      let isEventBridge = false;
      
      if (node.endpoint?.__typename === 'WebhookEventBridgeEndpoint') {
        endpointType = 'EventBridge';
        endpoint = node.endpoint.arn;
        isEventBridge = true;
      } else if (node.endpoint?.__typename === 'WebhookHttpEndpoint') {
        endpointType = 'HTTPS';
        endpoint = node.endpoint.callbackUrl;
      } else if (node.endpoint?.__typename === 'WebhookPubSubEndpoint') {
        endpointType = 'Pub/Sub';
        endpoint = `${node.endpoint.pubSubProject}/${node.endpoint.pubSubTopic}`;
      }

      return {
        id: node.id,
        topic: restTopic,
        graphqlTopic: node.topic,
        format: node.format,
        endpointType,
        endpoint,
        isEventBridge,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
    }) || [];

    // Categorize webhooks
    const eventBridgeWebhooks = webhooks.filter((w: any) => w.isEventBridge);
    const httpWebhooks = webhooks.filter((w: any) => w.endpointType === 'HTTPS');
    const otherWebhooks = webhooks.filter((w: any) => 
      w.endpointType !== 'EventBridge' && w.endpointType !== 'HTTPS'
    );

    // Check EventBridge ARN configuration
    const eventBridgeArn = process.env.EVENTBRIDGE_ARN;
    const hasEventBridgeConfig = !!eventBridgeArn;

    return json({
      shop: session.shop,
      webhooks,
      eventBridgeWebhooks,
      httpWebhooks,
      otherWebhooks,
      hasEventBridgeConfig,
      eventBridgeArn,
      summary: {
        total: webhooks.length,
        eventBridge: eventBridgeWebhooks.length,
        https: httpWebhooks.length,
        other: otherWebhooks.length,
      },
    });
  } catch (error) {
    console.error("Failed to load webhooks:", error);
    return json({
      shop: session?.shop || 'unknown',
      webhooks: [],
      eventBridgeWebhooks: [],
      httpWebhooks: [],
      otherWebhooks: [],
      hasEventBridgeConfig: false,
      eventBridgeArn: null,
      summary: {
        total: 0,
        eventBridge: 0,
        https: 0,
        other: 0,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default function WebhooksStatus() {
  const data = useLoaderData<typeof loader>();
  
  // Prepare data for EventBridge webhooks table
  const eventBridgeRows = data.eventBridgeWebhooks.map((webhook: any) => [
    webhook.topic,
    webhook.format,
    <Badge tone="success">Active</Badge>,
    new Date(webhook.createdAt).toLocaleDateString(),
  ]);

  // Prepare data for HTTPS webhooks table
  const httpRows = data.httpWebhooks.map((webhook: any) => [
    webhook.topic,
    webhook.format,
    <Badge tone="info">Active</Badge>,
    webhook.endpoint.replace(process.env.SHOPIFY_APP_URL || '', ''),
  ]);

  return (
    <Page
      title="Webhook Status"
      subtitle="Monitor and manage your webhook subscriptions"
      primaryAction={{
        content: "Refresh",
        icon: RefreshIcon,
        onAction: () => window.location.reload(),
      }}
    >
      <Layout>
        {/* EventBridge Configuration Status */}
        <Layout.Section>
          {data.hasEventBridgeConfig ? (
            <Banner
              title="EventBridge Configuration"
              tone="success"
              icon={CheckCircleIcon}
            >
              <Text as="p">
                EventBridge ARN configured: <code>{data.eventBridgeArn}</code>
              </Text>
            </Banner>
          ) : (
            <Banner
              title="EventBridge Not Configured"
              tone="warning"
              icon={AlertTriangleIcon}
            >
              <Text as="p">
                Add EVENTBRIDGE_ARN to your environment variables to enable EventBridge webhooks.
              </Text>
            </Banner>
          )}
        </Layout.Section>

        {/* Summary Stats */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Webhook Summary
                </Text>
                <InlineStack gap="800">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Total Webhooks
                    </Text>
                    <Text variant="heading2xl" as="h3">
                      {data.summary.total}
                    </Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <Text variant="bodyMd" tone="subdued" as="p">
                      EventBridge
                    </Text>
                    <InlineStack gap="200" align="center">
                      <Text variant="heading2xl" as="h3">
                        {data.summary.eventBridge}
                      </Text>
                      {data.summary.eventBridge > 0 && (
                        <Icon source={CheckCircleIcon} tone="success" />
                      )}
                    </InlineStack>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <Text variant="bodyMd" tone="subdued" as="p">
                      HTTPS
                    </Text>
                    <InlineStack gap="200" align="center">
                      <Text variant="heading2xl" as="h3">
                        {data.summary.https}
                      </Text>
                      {data.summary.https > 0 && (
                        <Icon source={NotificationIcon} tone="info" />
                      )}
                    </InlineStack>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* EventBridge Webhooks */}
        {data.eventBridgeWebhooks.length > 0 && (
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack gap="200" align="space-between">
                    <InlineStack gap="200">
                      <Icon source={ExternalIcon} tone="success" />
                      <Text variant="headingMd" as="h2">
                        EventBridge Webhooks
                      </Text>
                    </InlineStack>
                    <Badge tone="success">No HMAC Required</Badge>
                  </InlineStack>
                  
                  <Text variant="bodyMd" tone="subdued" as="p">
                    These webhooks are delivered directly to AWS EventBridge for serverless processing.
                  </Text>
                  
                  {eventBridgeRows.length > 0 && (
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text']}
                      headings={['Topic', 'Format', 'Status', 'Created']}
                      rows={eventBridgeRows}
                    />
                  )}
                  
                  <Text variant="bodySm" tone="subdued" as="p">
                    ARN: {data.eventBridgeArn}
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {/* HTTPS Webhooks */}
        {data.httpWebhooks.length > 0 && (
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack gap="200" align="space-between">
                    <InlineStack gap="200">
                      <Icon source={NotificationIcon} tone="info" />
                      <Text variant="headingMd" as="h2">
                        HTTPS Webhooks
                      </Text>
                    </InlineStack>
                    <Badge tone="info">HMAC Verification Required</Badge>
                  </InlineStack>
                  
                  <Text variant="bodyMd" tone="subdued" as="p">
                    These webhooks are delivered to your application's HTTPS endpoints.
                  </Text>
                  
                  {httpRows.length > 0 && (
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text']}
                      headings={['Topic', 'Format', 'Status', 'Endpoint']}
                      rows={httpRows}
                    />
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {/* Migration Suggestions */}
        {data.httpWebhooks.length > 0 && data.hasEventBridgeConfig && (
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack gap="200">
                    <Icon source={AlertTriangleIcon} tone="warning" />
                    <Text variant="headingMd" as="h2">
                      Migration Opportunity
                    </Text>
                  </InlineStack>
                  
                  <Text variant="bodyMd" as="p">
                    Consider migrating the following HTTPS webhooks to EventBridge for better scalability:
                  </Text>
                  
                  <BlockStack gap="200">
                    {data.httpWebhooks
                      .filter((w: any) => ['orders/paid', 'orders/create', 'orders/updated'].includes(w.topic))
                      .map((webhook: any) => (
                        <InlineStack key={webhook.id} gap="200">
                          <Text variant="bodyMd" as="span">•</Text>
                          <Text variant="bodyMd" as="span">{webhook.topic}</Text>
                        </InlineStack>
                      ))}
                  </BlockStack>
                  
                  <Text variant="bodySm" tone="subdued" as="p">
                    EventBridge webhooks provide automatic retries, no HMAC verification, and serverless scaling.
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}