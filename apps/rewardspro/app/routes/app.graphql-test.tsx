import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import {
  Page,
  Card,
  TextField,
  Button,
  BlockStack,
  Box,
  Text,
  Badge,
  Divider,
  InlineStack,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";

interface GraphQLResponse {
  data?: any;
  errors?: any[];
  extensions?: any;
}

/**
 * GraphQL Admin API Test Page
 * Allows testing GraphQL queries directly against the Shopify Admin API
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Provide some example queries
  const exampleQueries = {
    "Shop Info": `{
  shop {
    name
    email
    myshopifyDomain
    plan {
      displayName
      partnerDevelopment
      shopifyPlus
    }
    currencyCode
  }
}`,
    "Create Pro Subscription": `mutation CreateProSubscription {
  appSubscriptionCreate(
    name: "RewardsPro Pro"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=pro"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: EVERY_30_DAYS
            price: {
              amount: 39.00
              currencyCode: USD
            }
          }
        }
      }
      {
        plan: {
          appUsagePricingDetails: {
            terms: "$10 per 100 additional orders over 500 orders/month (max $200/month)"
            cappedAmount: {
              amount: 200.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    trialDays: 7
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      status
      currentPeriodEnd
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
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
              terms
            }
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}`,
    "Create Pro Annual Subscription": `mutation CreateProAnnualSubscription {
  appSubscriptionCreate(
    name: "RewardsPro Pro Annual"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=proAnnual"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: ANNUAL
            price: {
              amount: 336.00
              currencyCode: USD
            }
          }
        }
      }
      {
        plan: {
          appUsagePricingDetails: {
            terms: "$10 per 100 additional orders over 500 orders/month (max $200/month)"
            cappedAmount: {
              amount: 200.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    trialDays: 7
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      status
      currentPeriodEnd
    }
    userErrors {
      field
      message
    }
  }
}`,
    "Create Max Subscription": `mutation CreateMaxSubscription {
  appSubscriptionCreate(
    name: "RewardsPro Max"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=max"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: EVERY_30_DAYS
            price: {
              amount: 149.00
              currencyCode: USD
            }
          }
        }
      }
      {
        plan: {
          appUsagePricingDetails: {
            terms: "$5 per 100 additional orders over 2,000 orders/month (max $500/month)"
            cappedAmount: {
              amount: 500.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    trialDays: 7
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}`,
    "Create Max Annual Subscription": `mutation CreateMaxAnnualSubscription {
  appSubscriptionCreate(
    name: "RewardsPro Max Annual"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=maxAnnual"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: ANNUAL
            price: {
              amount: 1296.00
              currencyCode: USD
            }
          }
        }
      }
      {
        plan: {
          appUsagePricingDetails: {
            terms: "$5 per 100 additional orders over 2,000 orders/month (max $500/month)"
            cappedAmount: {
              amount: 500.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    trialDays: 7
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}`,
    "Create Ultra Subscription": `mutation CreateUltraSubscription {
  appSubscriptionCreate(
    name: "RewardsPro Ultra"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=ultra"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: EVERY_30_DAYS
            price: {
              amount: 499.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    trialDays: 14
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}`,
    "Create Ultra Annual Subscription": `mutation CreateUltraAnnualSubscription {
  appSubscriptionCreate(
    name: "RewardsPro Ultra Annual"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=ultraAnnual"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: ANNUAL
            price: {
              amount: 4296.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    trialDays: 14
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}`,
    "Test: Recurring Only (No Usage)": `mutation CreateRecurringOnlySubscription {
  appSubscriptionCreate(
    name: "Test - Recurring Only"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=test-recurring"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: EVERY_30_DAYS
            price: {
              amount: 29.99
              currencyCode: USD
            }
          }
        }
      }
    ]
    trialDays: 7
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      name
      status
      test
      trialDays
      createdAt
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppRecurringPricing {
              interval
              price {
                amount
                currencyCode
              }
            }
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

# Test mutation for creating a subscription with ONLY recurring pricing (no usage charges)
# Use this to test:
# - Simple monthly/annual subscriptions
# - Trial periods
# - Basic recurring billing`,
    "Test: Usage Only (No Recurring)": `mutation CreateUsageOnlySubscription {
  appSubscriptionCreate(
    name: "Test - Usage Only"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=test-usage"
    lineItems: [
      {
        plan: {
          appUsagePricingDetails: {
            terms: "$1 per additional API call (max $100/month)"
            cappedAmount: {
              amount: 100.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      name
      status
      test
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppUsagePricing {
              balanceUsed {
                amount
                currencyCode
              }
              cappedAmount {
                amount
                currencyCode
              }
              interval
              terms
            }
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

# Test mutation for creating a subscription with ONLY usage-based pricing (no recurring charges)
# Use this to test:
# - Pay-as-you-go models
# - Usage tracking
# - Capped amounts`,
    "Test: With Discount (Percentage)": `mutation CreateSubscriptionWithPercentageDiscount {
  appSubscriptionCreate(
    name: "Test - 20% Off First 3 Months"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=test-discount"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: EVERY_30_DAYS
            price: {
              amount: 50.00
              currencyCode: USD
            }
            discount: {
              durationLimitInIntervals: 3
              value: {
                percentage: 20.0
              }
            }
          }
        }
      }
    ]
    trialDays: 0
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      name
      status
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppRecurringPricing {
              interval
              price {
                amount
                currencyCode
              }
              discount {
                durationLimitInIntervals
                priceAfterDiscount {
                  amount
                  currencyCode
                }
                remainingDurationInIntervals
                value {
                  ... on AppSubscriptionDiscountPercentage {
                    percentage
                  }
                }
              }
            }
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

# Test mutation for creating a subscription with a percentage discount
# Use this to test:
# - Promotional pricing
# - Limited-time discounts (durationLimitInIntervals)
# - Discount tracking (remainingDurationInIntervals)`,
    "Test: With Discount (Fixed Amount)": `mutation CreateSubscriptionWithFixedDiscount {
  appSubscriptionCreate(
    name: "Test - $10 Off First 6 Months"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=test-discount-fixed"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: EVERY_30_DAYS
            price: {
              amount: 50.00
              currencyCode: USD
            }
            discount: {
              durationLimitInIntervals: 6
              value: {
                amount: 10.00
                currencyCode: USD
              }
            }
          }
        }
      }
    ]
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      name
      status
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppRecurringPricing {
              interval
              price {
                amount
                currencyCode
              }
              discount {
                durationLimitInIntervals
                priceAfterDiscount {
                  amount
                  currencyCode
                }
                remainingDurationInIntervals
                value {
                  ... on AppSubscriptionDiscountAmount {
                    amount {
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
    userErrors {
      field
      message
    }
  }
}

# Test mutation for creating a subscription with a fixed amount discount
# Use this to test:
# - Fixed dollar-off promotions ($10 off, $20 off, etc.)
# - Limited-duration discounts
# - Price after discount calculation`,
    "Test: Replace Existing Subscription": `mutation ReplaceExistingSubscription {
  appSubscriptionCreate(
    name: "Test - Replacement Plan"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=test-replace"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: EVERY_30_DAYS
            price: {
              amount: 99.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    replacementBehavior: APPLY_IMMEDIATELY
    test: true
  ) {
    confirmationUrl
    appSubscription {
      id
      name
      status
      createdAt
      currentPeriodEnd
    }
    userErrors {
      field
      message
    }
  }
}

# Test mutation for replacing an existing subscription
#
# replacementBehavior options:
# - APPLY_IMMEDIATELY: Replace immediately, prorate previous subscription
# - APPLY_ON_NEXT_BILLING_CYCLE: Replace at end of current billing period
# - STANDARD: Default Shopify behavior (merchant chooses in approval screen)
#
# Use this to test:
# - Plan upgrades/downgrades
# - Prorated credits
# - Subscription replacement flow`,
    "Test: Annual with All Options": `mutation CreateAnnualWithAllOptions {
  appSubscriptionCreate(
    name: "Test - Annual Complete"
    returnUrl: "${process.env.SHOPIFY_APP_URL || 'https://rewardspro-production.vercel.app'}/app/billing/callback?shop=${session.shop}&plan=test-annual-complete"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: ANNUAL
            price: {
              amount: 499.00
              currencyCode: USD
            }
            discount: {
              durationLimitInIntervals: 1
              value: {
                percentage: 15.0
              }
            }
          }
        }
      }
      {
        plan: {
          appUsagePricingDetails: {
            terms: "$0.50 per additional transaction (max $300/month)"
            cappedAmount: {
              amount: 300.00
              currencyCode: USD
            }
          }
        }
      }
    ]
    trialDays: 14
    test: true
    replacementBehavior: STANDARD
  ) {
    confirmationUrl
    appSubscription {
      id
      name
      status
      test
      trialDays
      createdAt
      currentPeriodEnd
      returnUrl
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppRecurringPricing {
              interval
              price {
                amount
                currencyCode
              }
              discount {
                durationLimitInIntervals
                priceAfterDiscount {
                  amount
                  currencyCode
                }
                remainingDurationInIntervals
                value {
                  ... on AppSubscriptionDiscountPercentage {
                    percentage
                  }
                  ... on AppSubscriptionDiscountAmount {
                    amount {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
            ... on AppUsagePricing {
              balanceUsed {
                amount
                currencyCode
              }
              cappedAmount {
                amount
                currencyCode
              }
              interval
              terms
            }
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

# Comprehensive test mutation showing ALL appSubscriptionCreate options:
# - Annual recurring pricing
# - Usage-based pricing
# - Percentage discount
# - Trial period
# - Replacement behavior
# - Test mode
#
# Use this as a reference for all available options`,
    "Get Active Subscriptions": `{
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
      currentPeriodEnd
      test
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
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
              terms
            }
          }
        }
      }
    }
  }
}`,
    "Get Subscription Status (Detailed)": `{
  currentAppInstallation {
    id
    activeSubscriptions {
      id
      name
      status
      test
      trialDays
      createdAt
      currentPeriodEnd
      returnUrl
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppRecurringPricing {
              interval
              price {
                amount
                currencyCode
              }
              discount {
                durationLimitInIntervals
                priceAfterDiscount {
                  amount
                  currencyCode
                }
                remainingDurationInIntervals
                value {
                  ... on AppSubscriptionDiscountAmount {
                    amount {
                      amount
                      currencyCode
                    }
                  }
                  ... on AppSubscriptionDiscountPercentage {
                    percentage
                  }
                }
              }
            }
            ... on AppUsagePricing {
              balanceUsed {
                amount
                currencyCode
              }
              cappedAmount {
                amount
                currencyCode
              }
              interval
              terms
            }
          }
        }
      }
    }
    allSubscriptions(first: 10) {
      edges {
        node {
          id
          name
          status
          createdAt
          currentPeriodEnd
          test
        }
      }
    }
  }
}

# This comprehensive query retrieves:
# - Active subscriptions with full details
# - Pricing information (recurring and usage-based)
# - Discount information (if any)
# - Usage balance and capped amount
# - Trial period details
# - All subscription history (last 10)
#
# Use this to verify:
# - Current subscription plan
# - Billing status (ACTIVE, CANCELLED, etc.)
# - Usage approaching cap
# - Trial period remaining
# - Discount/promotion details`,
    "Cancel Subscription": `mutation CancelSubscription($id: ID!) {
  appSubscriptionCancel(id: $id, prorate: false) {
    appSubscription {
      id
      name
      status
    }
    userErrors {
      field
      message
    }
  }
}

# Replace YOUR_SUBSCRIPTION_ID with the actual subscription ID
# Example: gid://shopify/AppSubscription/106181230976
# Note: prorate is always false (no refunds for unused time)`,
    "Customer List": `{
  customers(first: 5) {
    edges {
      node {
        id
        firstName
        lastName
        email
        createdAt
      }
    }
  }
}`,
    "Product List": `{
  products(first: 5) {
    edges {
      node {
        id
        title
        handle
        status
        totalInventory
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
}`,
    "Order List": `{
  orders(first: 5) {
    edges {
      node {
        id
        name
        email
        createdAt
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 3) {
          edges {
            node {
              title
              quantity
            }
          }
        }
      }
    }
  }
}`,
    "Metafield Definitions": `{
  metafieldDefinitions(first: 10, ownerType: CUSTOMER) {
    edges {
      node {
        id
        name
        namespace
        key
        type {
          name
        }
      }
    }
  }
}`,
    "Test Proxy Database Call": `# This simulates what the proxy API does
# Replace CUSTOMER_ID with your test customer ID (e.g., 23890748408192)

query TestProxyQuery($customerId: ID!) {
  customer(id: $customerId) {
    id
    email
    firstName
    lastName
    displayName
    createdAt
    updatedAt
    amountSpent {
      amount
      currencyCode
    }
    numberOfOrders
    tags
  }
}

# Variables (add this in a separate variables field if your GraphQL client supports it):
# {
#   "customerId": "gid://shopify/Customer/23890748408192"
# }

# What the proxy does:
# 1. Gets customer ID from URL parameter
# 2. Queries database with: prisma.customer.findUnique({
#      where: {
#        shopDomain_shopifyCustomerId: {
#          shopDomain: "themetester222.myshopify.com",
#          shopifyCustomerId: "23890748408192"
#        }
#      }
#    })
# 3. Returns customer data or "not found"`,
  };

  return json({
    shop: session.shop,
    exampleQueries,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;

  // Test proxy database call
  if (actionType === "test_proxy") {
    const customerId = formData.get("customerId") as string;

    if (!customerId) {
      return json({
        error: "Please enter a customer ID",
        executionTime: 0,
      });
    }

    try {
      const startTime = Date.now();

      // Import Data API client directly
      const { getAuroraClient } = await import("../utils/aurora-data-api");
      const dataApi = getAuroraClient();

      console.log('[GraphQL Test] Testing proxy database query via Data API...');
      console.log('[GraphQL Test] Query parameters:', {
        shopDomain: session.shop,
        shopifyCustomerId: customerId
      });

      // Build the exact SQL query that Prisma would generate
      const sql = `
        SELECT
          c.id,
          c."shopDomain",
          c."shopifyCustomerId",
          c.email,
          c."firstName",
          c."lastName",
          c."storeCredit",
          c."totalEarned",
          c."totalCashbackEarned",
          c."totalSpent",
          c."ordersCount",
          c."createdAt",
          c."updatedAt",

          mh.id as "mh_id",
          mh."tierId" as "mh_tierId",
          mh."isActive" as "mh_isActive",
          mh."createdAt" as "mh_createdAt",

          t.id as "tier_id",
          t.name as "tier_name",
          t."cashbackPercent" as "tier_cashbackPercent",
          t."minSpend" as "tier_minSpend"

        FROM "Customer" c

        LEFT JOIN "MembershipHistory" mh
          ON mh."customerId" = c.id
          AND mh."isActive" = true

        LEFT JOIN "Tier" t
          ON t.id = mh."tierId"

        WHERE
          c."shopDomain" = :shopDomain
          AND c."shopifyCustomerId" = :shopifyCustomerId

        ORDER BY mh."createdAt" DESC

        LIMIT 1
      `;

      // Execute via Data API
      const result = await dataApi.executeStatement(sql, [
        { name: 'shopDomain', value: { stringValue: session.shop } },
        { name: 'shopifyCustomerId', value: { stringValue: customerId } }
      ]);

      const executionTime = Date.now() - startTime;

      const found = result && result.length > 0;

      console.log('[GraphQL Test] Query result:', found ? 'FOUND' : 'NOT FOUND');
      console.log('[GraphQL Test] Raw result:', result);

      let customer = null;
      if (found && result[0]) {
        const row = result[0];
        customer = {
          id: row.id,
          shopDomain: row.shopDomain,
          shopifyCustomerId: row.shopifyCustomerId,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          storeCredit: row.storeCredit,
          totalEarned: row.totalEarned,
          totalCashbackEarned: row.totalCashbackEarned,
          totalSpent: row.totalSpent,
          ordersCount: row.ordersCount,
          membershipHistory: row.mh_id ? [{
            id: row.mh_id,
            tierId: row.mh_tierId,
            isActive: row.mh_isActive,
            tier: row.tier_id ? {
              id: row.tier_id,
              name: row.tier_name,
              cashbackPercent: row.tier_cashbackPercent,
              minSpend: row.tier_minSpend
            } : null
          }] : []
        };
      }

      return json({
        proxyTest: true,
        found: found,
        customer: customer,
        rawSql: sql,
        sqlParameters: {
          shopDomain: session.shop,
          shopifyCustomerId: customerId
        },
        query: {
          type: 'Data API SQL Query',
          method: 'executeStatement',
          database: 'Aurora PostgreSQL',
          where: {
            shopDomain: session.shop,
            shopifyCustomerId: customerId
          },
        },
        executionTime,
        shop: session.shop,
        resultCount: result?.length || 0,
      });
    } catch (error: any) {
      console.error('[GraphQL Test] Proxy test error:', error);
      return json({
        error: error.message || "Failed to test proxy query",
        stack: error.stack,
        executionTime: 0,
      });
    }
  }

  // Regular GraphQL query
  const query = formData.get("query") as string;

  if (!query || query.trim() === "") {
    return json({
      error: "Please enter a GraphQL query",
      executionTime: 0,
    });
  }

  try {
    const startTime = Date.now();

    // Execute the GraphQL query
    const response = await admin.graphql(query);
    const responseData: GraphQLResponse = await response.json();

    const executionTime = Date.now() - startTime;

    return json({
      response: responseData,
      executionTime,
      query,
      shop: session.shop,
    });
  } catch (error: any) {
    return json({
      error: error.message || "Failed to execute GraphQL query",
      executionTime: 0,
      query,
    });
  }
}

export default function GraphQLTestPage() {
  const { shop, exampleQueries } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState("23890748408192");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadExampleQuery = (exampleQuery: string) => {
    setQuery(exampleQuery);
  };

  return (
    <Page
      title="GraphQL Admin API Test"
      subtitle={`Testing GraphQL queries for ${shop}`}
    >
      <BlockStack gap="400">
        {/* Proxy Database Test Card */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">🔍 Test Proxy Database Query</Text>
              <Text as="p" tone="subdued">
                Test the EXACT database query that the proxy API uses to fetch customer data.
                This shows you what happens when the widget calls the proxy endpoint.
              </Text>
              <Divider />

              <Form method="post">
                <input type="hidden" name="actionType" value="test_proxy" />
                <BlockStack gap="400">
                  <TextField
                    label="Customer ID"
                    value={customerId}
                    onChange={setCustomerId}
                    autoComplete="off"
                    placeholder="Enter Shopify Customer ID (e.g., 23890748408192)"
                    name="customerId"
                    helpText="This is the shopifyCustomerId from the URL parameter logged_in_customer_id"
                  />

                  <InlineStack align="end">
                    <Button
                      submit
                      variant="primary"
                      loading={isSubmitting}
                      disabled={!customerId.trim()}
                    >
                      Test Database Query
                    </Button>
                  </InlineStack>

                  <Box padding="300" background="bg-fill-info-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <Text as="p" fontWeight="semibold">What this tests:</Text>
                      <Text as="p" variant="bodySm">
                        This executes the exact SQL query via Aurora Data API that the proxy generates:
                      </Text>
                      <pre style={{ fontSize: '10px', overflow: 'auto' }}>
{`SELECT c.*, mh.*, t.*
FROM "Customer" c
LEFT JOIN "MembershipHistory" mh ON mh."customerId" = c.id AND mh."isActive" = true
LEFT JOIN "Tier" t ON t.id = mh."tierId"
WHERE c."shopDomain" = '${shop}'
  AND c."shopifyCustomerId" = '${customerId}'
LIMIT 1`}
                      </pre>
                      <Text as="p" variant="bodySm" tone="subdued">
                        The proxy uses Prisma, which generates this exact SQL and executes it via AWS Aurora Data API.
                      </Text>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Form>
            </BlockStack>
          </Box>
        </Card>

        {/* Proxy Test Results */}
        {actionData?.proxyTest && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Proxy Database Query Result</Text>
                  <InlineStack gap="200">
                    <Badge tone="info">{actionData.executionTime}ms</Badge>
                    {actionData.found ? (
                      <Badge tone="success">Customer Found</Badge>
                    ) : (
                      <Badge tone="critical">Customer Not Found</Badge>
                    )}
                  </InlineStack>
                </InlineStack>

                <Divider />

                {/* Raw SQL Query */}
                <Box padding="400" background="bg-fill-info-secondary">
                  <BlockStack gap="200">
                    <Text as="p" fontWeight="semibold">🗄️ Raw SQL Query Executed:</Text>
                    <pre style={{
                      overflow: 'auto',
                      fontSize: '11px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'Monaco, Menlo, monospace',
                      background: '#1e1e1e',
                      color: '#d4d4d4',
                      padding: '12px',
                      borderRadius: '4px'
                    }}>
                      {actionData.rawSql}
                    </pre>
                  </BlockStack>
                </Box>

                {/* SQL Parameters */}
                <Box padding="400" background="bg-fill-info-secondary">
                  <BlockStack gap="200">
                    <Text as="p" fontWeight="semibold">📋 SQL Parameters:</Text>
                    <pre style={{
                      overflow: 'auto',
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      {JSON.stringify(actionData.sqlParameters, null, 2)}
                    </pre>
                  </BlockStack>
                </Box>

                {/* Query Metadata */}
                <Box padding="400" background="bg-fill-info-secondary">
                  <BlockStack gap="200">
                    <Text as="p" fontWeight="semibold">ℹ️ Query Metadata:</Text>
                    <Text as="p" variant="bodySm">Type: {actionData.query.type}</Text>
                    <Text as="p" variant="bodySm">Method: {actionData.query.method}</Text>
                    <Text as="p" variant="bodySm">Database: {actionData.query.database}</Text>
                    <Text as="p" variant="bodySm">Results: {actionData.resultCount} row(s)</Text>
                  </BlockStack>
                </Box>

                {/* Result */}
                {actionData.found ? (
                  <Box padding="400" background="bg-fill-success-secondary">
                    <BlockStack gap="200">
                      <Text as="p" fontWeight="semibold">✅ Customer Data:</Text>
                      <pre style={{
                        overflow: 'auto',
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: '500px'
                      }}>
                        {JSON.stringify(actionData.customer, null, 2)}
                      </pre>
                    </BlockStack>
                  </Box>
                ) : (
                  <Box padding="400" background="bg-fill-critical-secondary">
                    <BlockStack gap="200">
                      <Text as="p" fontWeight="semibold">❌ Customer Not Found</Text>
                      <Text as="p">
                        No customer exists in the database with:
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Shop Domain: {actionData.shop}
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Customer ID: {actionData.query.where.shopDomain_shopifyCustomerId.shopifyCustomerId}
                      </Text>
                      <Divider />
                      <Text as="p" fontWeight="semibold">This means:</Text>
                      <Text as="p" variant="bodySm">
                        • The proxy API would return: status: "customer_not_found"
                      </Text>
                      <Text as="p" variant="bodySm">
                        • The widget would show: "No Rewards Data Available"
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Solution: Run customer sync from /app/customers/sync
                      </Text>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* Example Queries Card */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Example Queries</Text>
              <Text as="p" tone="subdued">
                Click any example to load it into the query editor
              </Text>
              <Divider />
              <BlockStack gap="200">
                {Object.entries(exampleQueries).map(([name, exampleQuery]) => (
                  <Button
                    key={name}
                    onClick={() => loadExampleQuery(exampleQuery)}
                    textAlign="left"
                  >
                    {name}
                  </Button>
                ))}
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>

        {/* Query Editor Card */}
        <Card>
          <Box padding="400">
            <Form method="post" onSubmit={() => setIsSubmitting(true)}>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">GraphQL Query</Text>

                <TextField
                  label="Query"
                  value={query}
                  onChange={setQuery}
                  multiline={12}
                  autoComplete="off"
                  placeholder="Enter your GraphQL query here..."
                  name="query"
                  helpText="Enter a valid GraphQL query to test against the Shopify Admin API"
                  monospaced
                />

                <InlineStack align="end">
                  <Button
                    submit
                    variant="primary"
                    loading={isSubmitting}
                    disabled={!query.trim()}
                  >
                    Execute Query
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </Box>
        </Card>

        {/* Results Card */}
        {actionData && !actionData.proxyTest && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Response</Text>
                  <InlineStack gap="200">
                    {actionData.executionTime > 0 && (
                      <Badge tone="info">
                        {actionData.executionTime}ms
                      </Badge>
                    )}
                    {actionData.error && (
                      <Badge tone="critical">Error</Badge>
                    )}
                    {actionData.response?.data && !actionData.response?.errors && (
                      <Badge tone="success">Success</Badge>
                    )}
                    {actionData.response?.errors && (
                      <Badge tone="warning">GraphQL Errors</Badge>
                    )}
                  </InlineStack>
                </InlineStack>

                <Divider />

                {actionData.error && (
                  <Box padding="400" background="bg-fill-critical-secondary">
                    <BlockStack gap="200">
                      <Text as="p" fontWeight="semibold">Error:</Text>
                      <Text as="p" tone="critical">{actionData.error}</Text>
                      {actionData.stack && (
                        <>
                          <Divider />
                          <Text as="p" fontWeight="semibold">Stack Trace:</Text>
                          <pre style={{
                            overflow: 'auto',
                            fontSize: '10px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                            {actionData.stack}
                          </pre>
                        </>
                      )}
                    </BlockStack>
                  </Box>
                )}

                {actionData.response && (
                  <BlockStack gap="400">
                    {actionData.response.errors && (
                      <Box padding="400" background="bg-fill-warning-secondary">
                        <BlockStack gap="200">
                          <Text as="p" fontWeight="semibold">GraphQL Errors:</Text>
                          <pre style={{
                            overflow: 'auto',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                            {JSON.stringify(actionData.response.errors, null, 2)}
                          </pre>
                        </BlockStack>
                      </Box>
                    )}

                    {actionData.response.data && (
                      <Box padding="400" background="bg-fill-success-secondary">
                        <BlockStack gap="200">
                          <Text as="p" fontWeight="semibold">Data:</Text>
                          <pre style={{
                            overflow: 'auto',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: '500px'
                          }}>
                            {JSON.stringify(actionData.response.data, null, 2)}
                          </pre>
                        </BlockStack>
                      </Box>
                    )}

                    {actionData.response.extensions && (
                      <Box padding="400" background="bg-fill-info-secondary">
                        <BlockStack gap="200">
                          <Text as="p" fontWeight="semibold">Extensions:</Text>
                          <pre style={{
                            overflow: 'auto',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                            {JSON.stringify(actionData.response.extensions, null, 2)}
                          </pre>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* API Information Card */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">API Information</Text>
              <Divider />
              <BlockStack gap="300">
                <InlineStack gap="200">
                  <Text as="span" fontWeight="semibold">Shop:</Text>
                  <Text as="span">{shop}</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Text as="span" fontWeight="semibold">API:</Text>
                  <Text as="span">Shopify Admin GraphQL API</Text>
                </InlineStack>
                <Text as="p" tone="subdued">
                  Learn more about the Shopify Admin API at{' '}
                  <a
                    href="https://shopify.dev/docs/api/admin-graphql"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit' }}
                  >
                    shopify.dev/docs/api/admin-graphql
                  </a>
                </Text>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return (
    <Page title="GraphQL Test">
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Badge tone="critical">Error</Badge>
            <Text as="p">Failed to load GraphQL test page. Please try refreshing the page.</Text>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}
