/**
 * Subscription Setup Page
 * Enables selling plans for tier products
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Box,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  List,
  Badge,
  ProgressBar,
  CalloutCard,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { useState, useCallback, useEffect } from "react";
import { SellingPlanManager } from "~/services/subscription/selling-plan-manager.server";

// Billing interval configuration for client-side display
const BILLING_INTERVALS = {
  MONTHLY: {
    label: 'Monthly',
    discountPercentage: 0,
  },
  QUARTERLY: {
    label: 'Quarterly',
    discountPercentage: 5,
  },
  ANNUAL: {
    label: 'Annual',
    discountPercentage: 15,
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  try {
    // Initialize defaults
    let sellingPlanGroup = null;
    let tiers: any[] = [];
    let tierProducts: any[] = [];

    try {
      // Check current setup status
      [sellingPlanGroup, tiers, tierProducts] = await Promise.all([
        // Check if sellingPlanGroup model exists before querying
        db.sellingPlanGroup ? 
          db.sellingPlanGroup.findFirst({
            where: { shop: session.shop },
            include: { sellingPlans: true },
          }).catch(() => null) : 
          Promise.resolve(null),
        db.tier.findMany({
          where: { shop: session.shop },
          orderBy: { minSpend: 'asc' },
        }).catch(() => []),
        // Get tier products from Shopify
        getTierProducts(admin, session.shop).catch(() => []),
      ]);
    } catch (error: any) {
      console.log("[Setup Loader] Error loading initial data:", error.message);
      // Continue with defaults
    }

    // Check which products have selling plans
    const productsWithPlans = new Set<string>();
    if (sellingPlanGroup && tierProducts.length > 0) {
      try {
        for (const product of tierProducts) {
          const hasPlans = await SellingPlanManager.productHasSellingPlans({
            admin,
            productId: product.id,
          });
          if (hasPlans) {
            productsWithPlans.add(product.id);
          }
        }
      } catch (error: any) {
        console.log("[Setup Loader] Error checking product plans:", error.message);
      }
    }

    return json({
      hasSellingPlanGroup: !!sellingPlanGroup,
      sellingPlanGroup: sellingPlanGroup ? {
        id: sellingPlanGroup.id,
        name: sellingPlanGroup.name,
        plansCount: sellingPlanGroup.sellingPlans?.length || 0,
        plans: (sellingPlanGroup.sellingPlans || []).map(plan => ({
          name: plan.name,
          interval: plan.billingInterval,
          discount: plan.discountValue?.toNumber() || 0,
        })),
      } : null,
      tiers: tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        cashbackPercent: tier.cashbackPercent,
      })),
      tierProducts: tierProducts.map(product => ({
        id: product.id,
        title: product.title,
        variantId: product.variants?.edges?.[0]?.node?.id || null,
        hasSellingPlans: productsWithPlans.has(product.id),
        tierId: extractTierIdFromProduct(product),
      })),
    });
  } catch (error: any) {
    console.log("[Setup Loader] Fatal error:", error.message);
    // Return minimal valid response on any error
    return json({
      hasSellingPlanGroup: false,
      sellingPlanGroup: null,
      tiers: [],
      tierProducts: [],
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  try {
    switch (action) {
      case "create": {
        // Get selected products
        const selectedProductIds = formData.getAll("productIds") as string[];
        
        if (selectedProductIds.length === 0) {
          return json({ 
            success: false, 
            error: "Please select at least one tier product" 
          });
        }

        // Create product variant map
        const productVariantMap = new Map<string, string>();
        for (const productData of selectedProductIds) {
          const [tierId, variantId] = productData.split(":");
          if (tierId && variantId) {
            productVariantMap.set(tierId, variantId);
          }
        }

        try {
          // Check if SellingPlanManager service is available
          if (!SellingPlanManager || !SellingPlanManager.createSellingPlanGroup) {
            console.error('[Setup Action] SellingPlanManager not available');
            return json({ 
              success: false, 
              error: "Subscription service not available. Please ensure database migration is applied." 
            });
          }

          // Create selling plan group
          const result = await SellingPlanManager.createSellingPlanGroup({
            shop: session.shop,
            admin,
            tierIds: Array.from(productVariantMap.keys()),
            productVariantMap,
          });

          return json({ 
            success: true, 
            message: `Created selling plan group with ${result.sellingPlans?.length || 0} plans`,
            reload: true // Signal to reload the page
          });
        } catch (error: any) {
          console.error('[Setup Action] Error creating selling plans:', error);
          return json({ 
            success: false, 
            error: error.message || "Failed to create selling plans. Ensure subscription tables exist." 
          });
        }
      }

      case "remove": {
        try {
          // Check if SellingPlanManager service is available
          if (!SellingPlanManager || !SellingPlanManager.removeSellingPlanGroup) {
            console.error('[Setup Action] SellingPlanManager not available');
            return json({ 
              success: false, 
              error: "Subscription service not available. Please ensure database migration is applied." 
            });
          }

          await SellingPlanManager.removeSellingPlanGroup({
            shop: session.shop,
            admin,
          });

          return json({ 
            success: true, 
            message: "Selling plans removed successfully",
            reload: true // Signal to reload the page
          });
        } catch (error: any) {
          console.error('[Setup Action] Error removing selling plans:', error);
          return json({ 
            success: false, 
            error: error.message || "Failed to remove selling plans" 
          });
        }
      }

      default:
        return json({ success: false, error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Setup Action] Unexpected error:', error);
    return json({ 
      success: false, 
      error: "An unexpected error occurred. Please try again." 
    });
  }
};

async function getTierProducts(admin: any, shop: string) {
  const query = `
    query GetTierProducts {
      products(first: 50, query: "tag:tier-membership") {
        edges {
          node {
            id
            title
            tags
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    const data = await response.json();
    return data.data?.products?.edges?.map((e: any) => e.node) || [];
  } catch (error) {
    console.error('Error fetching tier products:', error);
    return [];
  }
}

function extractTierIdFromProduct(product: any): string | null {
  // Extract tier ID from product tags or title
  // This is a simplified version - you'd match against actual tier IDs
  const tierTag = product.tags.find((tag: string) => tag.startsWith('tier:'));
  return tierTag ? tierTag.split(':')[1] : null;
}

export default function SubscriptionSetup() {
  const { hasSellingPlanGroup, sellingPlanGroup, tiers, tierProducts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  
  const isLoading = navigation.state !== "idle";

  // Handle action responses
  useEffect(() => {
    if (actionData) {
      if (actionData.success && actionData.reload) {
        // Reload the page to show updated state
        window.location.reload();
      }
    }
  }, [actionData]);

  const handleProductToggle = useCallback((productData: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productData)) {
        next.delete(productData);
      } else {
        next.add(productData);
      }
      return next;
    });
  }, []);

  const handleCreatePlans = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "create");
    selectedProducts.forEach(productData => {
      formData.append("productIds", productData);
    });
    submit(formData, { method: "post" });
  }, [selectedProducts, submit]);

  const handleRemovePlans = useCallback(() => {
    if (confirm("Are you sure you want to remove all selling plans? This will affect existing subscriptions.")) {
      const formData = new FormData();
      formData.append("action", "remove");
      submit(formData, { method: "post" });
    }
  }, [submit]);

  if (hasSellingPlanGroup) {
    return (
      <Page
        title="Subscription Setup"
        subtitle="Manage selling plans for tier subscriptions"
        backAction={{ url: "/app/subscriptions" }}
      >
        <Layout>
          <Layout.Section>
            <CalloutCard
              title="Selling Plans Active"
              illustration="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              primaryAction={{
                content: "View Subscriptions",
                url: "/app/subscriptions",
              }}
              secondaryAction={{
                content: "Remove Selling Plans",
                onAction: handleRemovePlans,
                destructive: true,
                loading: isLoading,
              }}
            >
              <p>
                Your selling plan group <strong>{sellingPlanGroup.name}</strong> is active with{" "}
                {sellingPlanGroup.plansCount} billing options:
              </p>
              <List>
                {sellingPlanGroup.plans.map((plan, index) => (
                  <List.Item key={index}>
                    {plan.name} - {plan.discount}% discount
                  </List.Item>
                ))}
              </List>
            </CalloutCard>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Tier Products Status</Text>
                  <BlockStack gap="200">
                    {tierProducts.map(product => (
                      <InlineStack key={product.id} align="space-between">
                        <Text as="p">{product.title}</Text>
                        {product.hasSellingPlans ? (
                          <Badge tone="success">Selling plans enabled</Badge>
                        ) : (
                          <Badge>No selling plans</Badge>
                        )}
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Setup wizard for creating selling plans
  return (
    <Page
      title="Setup Subscription Selling Plans"
      subtitle="Enable recurring billing for tier memberships"
      backAction={{ url: "/app/subscriptions" }}
    >
      <Layout>
        <Layout.Section>
          <Banner
            title="About Selling Plans"
            tone="info"
          >
            <p>
              Selling plans allow customers to subscribe to tier memberships with recurring billing.
              Once enabled, customers can choose between one-time purchase or subscription options.
            </p>
          </Banner>
        </Layout.Section>

        {actionData?.error && (
          <Layout.Section>
            <Banner
              title="Error"
              tone="critical"
              onDismiss={() => {}}
            >
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && actionData?.message && (
          <Layout.Section>
            <Banner
              title="Success"
              tone="success"
              onDismiss={() => {}}
            >
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Configuration</Text>
                
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Billing Intervals</Text>
                  <Text as="p" tone="subdued">
                    The following billing options will be created:
                  </Text>
                  <List>
                    {Object.entries(BILLING_INTERVALS).map(([key, interval]) => (
                      <List.Item key={key}>
                        <strong>{interval.label}</strong> - {interval.discountPercentage}% discount
                      </List.Item>
                    ))}
                  </List>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Select Tier Products</Text>
                  <Text as="p" tone="subdued">
                    Choose which tier products should have subscription options:
                  </Text>
                  
                  {tierProducts.length > 0 ? (
                    <BlockStack gap="200">
                      {tierProducts.map(product => (
                        <Checkbox
                          key={product.id}
                          label={product.title}
                          checked={selectedProducts.has(`${product.tierId}:${product.variantId}`)}
                          onChange={() => handleProductToggle(`${product.tierId}:${product.variantId}`)}
                        />
                      ))}
                    </BlockStack>
                  ) : (
                    <Banner tone="warning">
                      <p>
                        No tier products found. Please create tier products first using the{" "}
                        <a href="/app/tier-products">Tier Products</a> page.
                      </p>
                    </Banner>
                  )}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {tierProducts.length > 0 && (
          <Layout.Section>
            <InlineStack align="end">
              <Button
                variant="primary"
                size="large"
                onClick={handleCreatePlans}
                loading={isLoading}
                disabled={selectedProducts.size === 0}
              >
                Create Selling Plans
              </Button>
            </InlineStack>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}