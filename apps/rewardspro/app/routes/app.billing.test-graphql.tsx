import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  Badge,
  Banner,
  Box,
  InlineStack,
  Divider,
  TextField,
  Select,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Test different mutation formats and patterns
const TEST_MUTATIONS = {
  // Test 1: Basic subscription with recurring charge
  basicSubscription: `#graphql
    mutation CreateBasicSubscription($name: String!, $returnUrl: URL!, $test: Boolean!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        test: $test
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: 1.00, currencyCode: USD }
              interval: EVERY_30_DAYS
            }
          }
        }]
      ) {
        userErrors {
          field
          message
          code
        }
        confirmationUrl
        appSubscription {
          id
          name
          status
          test
          currentPeriodEnd
          trialDays
          createdAt
        }
      }
    }
  `,

  // Test 2: Subscription with trial period
  subscriptionWithTrial: `#graphql
    mutation CreateSubscriptionWithTrial($name: String!, $returnUrl: URL!, $trialDays: Int!, $test: Boolean!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: $test
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: 49.99, currencyCode: USD }
              interval: EVERY_30_DAYS
            }
          }
        }]
      ) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
          status
          trialDays
        }
      }
    }
  `,

  // Test 3: Subscription with usage charge
  subscriptionWithUsage: `#graphql
    mutation CreateUsageSubscription($name: String!, $returnUrl: URL!, $test: Boolean!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        test: $test
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: 49.00, currencyCode: USD }
                interval: EVERY_30_DAYS
              }
            }
          },
          {
            plan: {
              appUsagePricingDetails: {
                cappedAmount: { amount: 100.00, currencyCode: USD }
                terms: "Usage charges for orders over 1000"
              }
            }
          }
        ]
      ) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
          lineItems(first: 10) {
            edges {
              node {
                id
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                      interval
                    }
                    ... on AppUsagePricing {
                      cappedAmount {
                        amount
                        currencyCode
                      }
                      balanceUsed {
                        amount
                        currencyCode
                      }
                      terms
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  // Test 4: Query existing subscription
  querySubscription: `#graphql
    query GetSubscription($id: ID!) {
      node(id: $id) {
        ... on AppSubscription {
          id
          name
          status
          test
          currentPeriodEnd
          trialDays
          createdAt
          lineItems(first: 10) {
            edges {
              node {
                id
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                      interval
                    }
                    ... on AppUsagePricing {
                      cappedAmount {
                        amount
                        currencyCode
                      }
                      balanceUsed {
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
      }
    }
  `,

  // Test 5: One-time charge
  oneTimeCharge: `#graphql
    mutation CreateOneTimeCharge($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean!) {
      appPurchaseOneTimeCreate(
        name: $name
        price: $price
        returnUrl: $returnUrl
        test: $test
      ) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appPurchaseOneTime {
          id
          name
          status
          price {
            amount
            currencyCode
          }
          test
        }
      }
    }
  `
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const testResult = url.searchParams.get("testResult");

  // Check for callback parameters
  const callbackParams = {
    charge_id: url.searchParams.get("charge_id"),
    subscription_id: url.searchParams.get("subscription_id"),
    status: url.searchParams.get("status"),
    shop: url.searchParams.get("shop"),
  };

  // Get any existing test subscriptions
  let existingSubscriptions = [];
  try {
    const billingPlan = await db.billingPlan.findUnique({
      where: { shop: session.shop }
    });
    if (billingPlan?.metadata?.testSubscriptionId) {
      existingSubscriptions.push(billingPlan.metadata.testSubscriptionId);
    }
  } catch (error) {
    console.error("Error fetching existing subscriptions:", error);
  }

  return json({
    shop: session.shop,
    appUrl: process.env.SHOPIFY_APP_URL,
    callbackParams,
    existingSubscriptions,
    testResult,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const formData = await request.formData();
  const testType = formData.get("testType") as string;
  const subscriptionId = formData.get("subscriptionId") as string;

  let result: any = {
    testType,
    timestamp: new Date().toISOString(),
    shop: session.shop,
  };

  try {
    switch (testType) {
      case "basicSubscription": {
        const response = await admin.graphql(TEST_MUTATIONS.basicSubscription, {
          variables: {
            name: "Test Basic Subscription",
            returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/test-graphql?testResult=basic`,
            test: true
          }
        });

        result.response = await response.json();

        // Store subscription ID if created
        if (result.response.data?.appSubscriptionCreate?.appSubscription?.id) {
          await db.billingPlan.upsert({
            where: { shop: session.shop },
            create: {
              shop: session.shop,
              planName: "Test Plan",
              status: "test",
              monthlyPrice: 1,
              metadata: {
                testSubscriptionId: result.response.data.appSubscriptionCreate.appSubscription.id
              }
            },
            update: {
              metadata: {
                testSubscriptionId: result.response.data.appSubscriptionCreate.appSubscription.id
              }
            }
          });
        }
        break;
      }

      case "subscriptionWithTrial": {
        const response = await admin.graphql(TEST_MUTATIONS.subscriptionWithTrial, {
          variables: {
            name: "Test Subscription with Trial",
            returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/test-graphql?testResult=trial`,
            trialDays: 7,
            test: true
          }
        });

        result.response = await response.json();
        break;
      }

      case "subscriptionWithUsage": {
        const response = await admin.graphql(TEST_MUTATIONS.subscriptionWithUsage, {
          variables: {
            name: "Test Usage Subscription",
            returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/test-graphql?testResult=usage`,
            test: true
          }
        });

        result.response = await response.json();
        break;
      }

      case "querySubscription": {
        if (!subscriptionId) {
          throw new Error("Subscription ID required for query");
        }

        const response = await admin.graphql(TEST_MUTATIONS.querySubscription, {
          variables: {
            id: subscriptionId
          }
        });

        result.response = await response.json();
        break;
      }

      case "oneTimeCharge": {
        const response = await admin.graphql(TEST_MUTATIONS.oneTimeCharge, {
          variables: {
            name: "Test One-Time Charge",
            price: { amount: "10.00", currencyCode: "USD" },
            returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/test-graphql?testResult=onetime`,
            test: true
          }
        });

        result.response = await response.json();
        break;
      }

      case "testUsageRecord": {
        // Test creating a usage record if we have a subscription with usage line item
        const billingPlan = await db.billingPlan.findUnique({
          where: { shop: session.shop }
        });

        if (!billingPlan?.metadata?.usageLineItemId) {
          throw new Error("No usage line item found. Create a subscription with usage first.");
        }

        const usageMutation = `#graphql
          mutation CreateUsageRecord($lineItemId: ID!, $price: MoneyInput!, $description: String!) {
            appUsageRecordCreate(
              subscriptionLineItemId: $lineItemId
              price: $price
              description: $description
            ) {
              userErrors {
                field
                message
              }
              appUsageRecord {
                id
                price {
                  amount
                  currencyCode
                }
                description
                createdAt
              }
            }
          }
        `;

        const response = await admin.graphql(usageMutation, {
          variables: {
            lineItemId: billingPlan.metadata.usageLineItemId,
            price: { amount: "0.01", currencyCode: "USD" },
            description: "Test usage record - 1 order overage"
          }
        });

        result.response = await response.json();
        break;
      }

      default:
        throw new Error(`Unknown test type: ${testType}`);
    }

    // Log the full response for analysis
    console.log("GraphQL Billing Test Result:", JSON.stringify(result, null, 2));

  } catch (error: any) {
    result.error = {
      message: error.message,
      stack: error.stack,
      raw: error
    };
    console.error("GraphQL Billing Test Error:", error);
  }

  return json(result);
}

export default function BillingTestGraphQL() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const [selectedTest, setSelectedTest] = useState("basicSubscription");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [showRawResponse, setShowRawResponse] = useState(false);

  const isLoading = fetcher.state !== "idle";
  const testResult = fetcher.data;

  // Check if we're returning from Shopify confirmation
  const isCallback = Object.values(data.callbackParams).some(v => v !== null);

  return (
    <Page
      title="GraphQL Billing Test Lab"
      subtitle="Test and explore Shopify billing mutations"
      backAction={{ content: "Billing", url: "/app/billing" }}
    >
      <Layout>
        {/* Callback Parameters Display */}
        {isCallback && (
          <Layout.Section>
            <Banner title="Callback Parameters Received" tone="info">
              <BlockStack gap="200">
                <Text variant="bodyMd" as="p">
                  Returned from Shopify confirmation page with these parameters:
                </Text>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <pre style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0
                  }}>
                    {JSON.stringify(data.callbackParams, null, 2)}
                  </pre>
                </Box>
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}

        {/* Test Controls */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Test GraphQL Mutations</Text>

              <Select
                label="Select Test"
                options={[
                  { label: "Basic Subscription ($1/month)", value: "basicSubscription" },
                  { label: "Subscription with Trial (7 days)", value: "subscriptionWithTrial" },
                  { label: "Subscription with Usage Cap", value: "subscriptionWithUsage" },
                  { label: "Query Existing Subscription", value: "querySubscription" },
                  { label: "One-Time Charge ($10)", value: "oneTimeCharge" },
                  { label: "Create Usage Record", value: "testUsageRecord" },
                ]}
                value={selectedTest}
                onChange={setSelectedTest}
              />

              {selectedTest === "querySubscription" && (
                <TextField
                  label="Subscription ID"
                  value={subscriptionId}
                  onChange={setSubscriptionId}
                  placeholder="gid://shopify/AppSubscription/..."
                  helpText="Enter a subscription ID to query"
                />
              )}

              {data.existingSubscriptions.length > 0 && (
                <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="bodySm" as="p">
                    Existing test subscriptions: {data.existingSubscriptions.join(", ")}
                  </Text>
                </Box>
              )}

              <InlineStack gap="200">
                <Button
                  primary
                  loading={isLoading}
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("testType", selectedTest);
                    if (subscriptionId) {
                      formData.set("subscriptionId", subscriptionId);
                    }
                    fetcher.submit(formData, { method: "post" });
                  }}
                >
                  Run Test
                </Button>

                {testResult && (
                  <Checkbox
                    label="Show raw response"
                    checked={showRawResponse}
                    onChange={setShowRawResponse}
                  />
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Test Results */}
        {testResult && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Test Results</Text>
                  <Badge tone={testResult.error ? "critical" : "success"}>
                    {testResult.error ? "Error" : "Success"}
                  </Badge>
                </InlineStack>

                <Divider />

                {/* Success Response */}
                {testResult.response?.data && (
                  <BlockStack gap="300">
                    {/* Confirmation URL */}
                    {testResult.response.data.appSubscriptionCreate?.confirmationUrl && (
                      <Box padding="300" background="bg-success-subdued" borderRadius="200">
                        <BlockStack gap="200">
                          <Text variant="headingSm" as="h3">✅ Confirmation URL Generated</Text>
                          <Text variant="bodySm" as="p" breakWord>
                            {testResult.response.data.appSubscriptionCreate.confirmationUrl}
                          </Text>
                          <Button url={testResult.response.data.appSubscriptionCreate.confirmationUrl}>
                            Go to Shopify Confirmation Page
                          </Button>
                        </BlockStack>
                      </Box>
                    )}

                    {/* Subscription Details */}
                    {testResult.response.data.appSubscriptionCreate?.appSubscription && (
                      <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                        <BlockStack gap="200">
                          <Text variant="headingSm" as="h3">Subscription Created</Text>
                          <Text variant="bodySm" as="p">
                            ID: {testResult.response.data.appSubscriptionCreate.appSubscription.id}
                          </Text>
                          <Text variant="bodySm" as="p">
                            Status: {testResult.response.data.appSubscriptionCreate.appSubscription.status}
                          </Text>
                          {testResult.response.data.appSubscriptionCreate.appSubscription.trialDays && (
                            <Text variant="bodySm" as="p">
                              Trial Days: {testResult.response.data.appSubscriptionCreate.appSubscription.trialDays}
                            </Text>
                          )}
                        </BlockStack>
                      </Box>
                    )}

                    {/* User Errors */}
                    {testResult.response.data.appSubscriptionCreate?.userErrors?.length > 0 && (
                      <Banner tone="critical" title="User Errors">
                        <BlockStack gap="100">
                          {testResult.response.data.appSubscriptionCreate.userErrors.map((error: any, i: number) => (
                            <Text key={i} variant="bodySm" as="p">
                              {error.field}: {error.message} {error.code && `(${error.code})`}
                            </Text>
                          ))}
                        </BlockStack>
                      </Banner>
                    )}
                  </BlockStack>
                )}

                {/* Error Response */}
                {testResult.error && (
                  <Banner tone="critical" title="Test Failed">
                    <BlockStack gap="200">
                      <Text variant="bodyMd" as="p">{testResult.error.message}</Text>
                      {testResult.error.stack && (
                        <Box padding="200" background="bg-surface" borderRadius="100">
                          <Text variant="bodySm" as="pre" fontFamily="monospace">
                            {testResult.error.stack}
                          </Text>
                        </Box>
                      )}
                    </BlockStack>
                  </Banner>
                )}

                {/* Raw Response */}
                {showRawResponse && (
                  <Box padding="300" background="bg-surface" borderRadius="200">
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">Raw Response</Text>
                      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0
                        }}>
                          {JSON.stringify(testResult.response || testResult.error, null, 2)}
                        </pre>
                      </Box>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Research Questions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">🔬 Research Questions Identified</Text>

              <BlockStack gap="300">
                <Box padding="200" background="bg-critical-subdued" borderRadius="100">
                  <Text variant="headingSm" as="h3">Critical Questions:</Text>
                  <ul>
                    <li>What exact parameters come back in the return URL?</li>
                    <li>How to handle MoneyInput - string vs number for amount?</li>
                    <li>What are all possible userError codes?</li>
                    <li>Can you combine recurring + usage in one subscription?</li>
                  </ul>
                </Box>

                <Box padding="200" background="bg-warning-subdued" borderRadius="100">
                  <Text variant="headingSm" as="h3">Important Questions:</Text>
                  <ul>
                    <li>How long do confirmation URLs remain valid?</li>
                    <li>What happens if merchant closes confirmation page?</li>
                    <li>How to detect subscription cancellation via API?</li>
                    <li>When exactly do webhooks fire?</li>
                  </ul>
                </Box>

                <Box padding="200" background="bg-info-subdued" borderRadius="100">
                  <Text variant="headingSm" as="h3">Nice to Know:</Text>
                  <ul>
                    <li>Rate limits for billing mutations?</li>
                    <li>How to handle currency conversion?</li>
                    <li>Best practices for idempotency keys?</li>
                    <li>Test mode behavior in production?</li>
                  </ul>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}