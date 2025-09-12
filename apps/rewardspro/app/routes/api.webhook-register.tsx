/**
 * API Route: Register Shopify Webhooks with EventBridge
 * 
 * This route programmatically registers Shopify webhooks to deliver events
 * to AWS EventBridge. This is an alternative to TOML configuration and can
 * be useful for dynamic webhook management.
 * 
 * Usage:
 * POST /api/webhook-register
 * Body: { "topic": "customers/create" }
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

// Map REST API topics to GraphQL topics
const TOPIC_MAPPING: Record<string, string> = {
  'customers/create': 'CUSTOMERS_CREATE',
  'customers/update': 'CUSTOMERS_UPDATE',
  'customers/delete': 'CUSTOMERS_DELETE',
  'orders/create': 'ORDERS_CREATE',
  'orders/updated': 'ORDERS_UPDATED',
  'orders/paid': 'ORDERS_PAID',
  'orders/cancelled': 'ORDERS_CANCELLED',
  'orders/fulfilled': 'ORDERS_FULFILLED',
  'app/uninstalled': 'APP_UNINSTALLED',
  'shop/update': 'SHOP_UPDATE',
  'products/create': 'PRODUCTS_CREATE',
  'products/update': 'PRODUCTS_UPDATE',
  'products/delete': 'PRODUCTS_DELETE',
};

export async function action({ request }: ActionFunctionArgs) {
  // Authenticate the request
  const { admin, session } = await authenticate.admin(request);
  
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the EventBridge ARN from environment
  const eventBridgeArn = process.env.EVENTBRIDGE_ARN;
  
  if (!eventBridgeArn) {
    return json({ 
      error: "EventBridge ARN not configured",
      message: "Please set EVENTBRIDGE_ARN in your environment variables"
    }, { status: 500 });
  }

  // Parse request body
  const body = await request.json();
  const { topic } = body;
  
  if (!topic) {
    return json({ 
      error: "Missing topic",
      message: "Please provide a webhook topic to register"
    }, { status: 400 });
  }

  // Convert REST topic to GraphQL topic
  const graphqlTopic = TOPIC_MAPPING[topic];
  
  if (!graphqlTopic) {
    return json({ 
      error: "Invalid topic",
      message: `Topic '${topic}' is not supported. Valid topics: ${Object.keys(TOPIC_MAPPING).join(', ')}`
    }, { status: 400 });
  }

  try {
    // GraphQL mutation to create EventBridge webhook
    const response = await admin.graphql(
      `#graphql
      mutation eventBridgeWebhookSubscriptionCreate(
        $topic: WebhookSubscriptionTopic!,
        $webhookSubscription: EventBridgeWebhookSubscriptionInput!
      ) {
        eventBridgeWebhookSubscriptionCreate(
          topic: $topic, 
          webhookSubscription: $webhookSubscription
        ) {
          webhookSubscription {
            id
            topic
            format
            endpoint {
              __typename
              ... on WebhookEventBridgeEndpoint { 
                arn 
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          topic: graphqlTopic,
          webhookSubscription: {
            arn: eventBridgeArn,
            format: "JSON",
            // Optional: Include only specific fields to reduce payload size
            // includeFields: ["id", "email", "first_name", "last_name", "tags"]
          }
        }
      }
    );

    const result = await response.json() as any;
    
    // Check for GraphQL errors
    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      return json({ 
        error: "GraphQL error",
        details: result.errors 
      }, { status: 500 });
    }

    const data = result.data?.eventBridgeWebhookSubscriptionCreate;
    
    // Check for user errors
    if (data?.userErrors?.length > 0) {
      console.error("User errors:", data.userErrors);
      return json({ 
        error: "Registration failed",
        details: data.userErrors 
      }, { status: 400 });
    }

    // Success! Log and return webhook details
    const webhook = data?.webhookSubscription;
    
    if (webhook) {
      console.log(`✅ Webhook registered successfully:
        ID: ${webhook.id}
        Topic: ${webhook.topic}
        Format: ${webhook.format}
        ARN: ${webhook.endpoint?.arn}
        Shop: ${session.shop}
      `);

      return json({ 
        success: true,
        message: `Webhook '${topic}' registered successfully`,
        webhook: {
          id: webhook.id,
          topic: topic,
          graphqlTopic: webhook.topic,
          format: webhook.format,
          arn: webhook.endpoint?.arn,
          shop: session.shop
        }
      });
    } else {
      return json({ 
        error: "Unexpected response",
        message: "Webhook creation returned no data"
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Failed to register webhook:", error);
    return json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    }, { status: 500 });
  }
}

// GET endpoint to list all registered webhooks
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    const result = await response.json() as any;
    
    if (result.errors) {
      return json({ 
        error: "Failed to fetch webhooks",
        details: result.errors 
      }, { status: 500 });
    }

    const webhooks = result.data?.webhookSubscriptions?.edges?.map((edge: any) => {
      const node = edge.node;
      const restTopic = Object.entries(TOPIC_MAPPING).find(
        ([_, graphql]) => graphql === node.topic
      )?.[0] || node.topic;

      return {
        id: node.id,
        topic: restTopic,
        graphqlTopic: node.topic,
        format: node.format,
        endpointType: node.endpoint?.__typename,
        endpoint: node.endpoint?.arn || node.endpoint?.callbackUrl || node.endpoint?.pubSubTopic,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt
      };
    }) || [];

    // Separate EventBridge and HTTP webhooks
    const eventBridgeWebhooks = webhooks.filter((w: any) => 
      w.endpointType === 'WebhookEventBridgeEndpoint'
    );
    
    const httpWebhooks = webhooks.filter((w: any) => 
      w.endpointType === 'WebhookHttpEndpoint'
    );

    return json({
      success: true,
      shop: session.shop,
      summary: {
        total: webhooks.length,
        eventBridge: eventBridgeWebhooks.length,
        http: httpWebhooks.length
      },
      webhooks: {
        eventBridge: eventBridgeWebhooks,
        http: httpWebhooks
      }
    });
  } catch (error) {
    console.error("Failed to list webhooks:", error);
    return json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    }, { status: 500 });
  }
}