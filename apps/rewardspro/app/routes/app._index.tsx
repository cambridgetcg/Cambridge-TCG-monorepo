import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Banner,
  Badge,
  Icon,
  Box,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  PersonSegmentIcon,
  CashDollarFilledIcon,
  PriceListIcon,
  SettingsIcon,
  StarFilledIcon,
  ArrowRightIcon,
} from "../utils/polaris-icons";

interface LoaderData {
  shop: string;
  customers: number;
  tiers: number;
  totalRewards: number;
  isProgramActive: boolean;
  recentCustomers: Array<{
    id: string;
    email: string;
    storeCredit: number;
  }>;
  tiersList: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
  }>;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session) {
      throw new Response("Session not found", { status: 401 });
    }
    
    const shop = session.shop;
    
    // Fetch basic data with error handling
    const [customerCount, tierData, totalRewardsData] = await Promise.all([
      db.customer.count({ where: { shop } }).catch(() => 0),
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "asc" },
        take: 5,
      }).catch(() => []),
      db.storeCreditLedger.aggregate({
        where: { 
          shop,
          type: "CASHBACK_EARNED",
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: null } })),
    ]);
    
    // Fetch recent customers safely
    const recentCustomers = await db.customer.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        email: true,
        storeCredit: true,
      },
    }).catch(() => []);
    
    // Transform data safely
    const formattedCustomers = recentCustomers.map(customer => ({
      id: customer.id,
      email: customer.email,
      storeCredit: Number(customer.storeCredit || 0),
    }));
    
    const formattedTiers = tierData.map(tier => ({
      id: tier.id,
      name: tier.name,
      minSpend: tier.minSpend,
      cashbackPercent: tier.cashbackPercent,
    }));
    
    return json({
      shop,
      customers: customerCount,
      tiers: tierData.length,
      totalRewards: Number(totalRewardsData._sum.amount || 0),
      isProgramActive: tierData.length > 0,
      recentCustomers: formattedCustomers,
      tiersList: formattedTiers,
    });
    
  } catch (error) {
    console.error("[Dashboard] Error loading data:", error);
    
    // Return safe defaults
    return json({
      shop: "unknown",
      customers: 0,
      tiers: 0,
      totalRewards: 0,
      isProgramActive: false,
      recentCustomers: [],
      tiersList: [],
    });
  }
};

export default function Dashboard() {
  const data = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  
  const {
    customers,
    tiers,
    totalRewards,
    isProgramActive,
    recentCustomers,
    tiersList,
  } = data;
  
  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* Status Banner */}
        {!isProgramActive && (
          <Banner
            tone="warning"
            title="Set up your loyalty program"
            action={{
              content: "Create Tiers",
              onAction: () => navigate("/app/tiers"),
            }}
          >
            Create loyalty tiers to start rewarding your customers with cashback.
          </Banner>
        )}
        
        {isProgramActive && customers === 0 && (
          <Banner tone="info" title="Your loyalty program is active">
            Customers will automatically earn cashback on their next purchase.
          </Banner>
        )}
        
        {/* Stats Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Icon source={PersonSegmentIcon} tone="base" />
                    {customers > 0 && (
                      <Badge tone="success">Active</Badge>
                    )}
                  </InlineStack>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {customers}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Total Customers
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Icon source={PriceListIcon} tone="base" />
                    <Badge tone={tiers > 0 ? "success" : "warning"}>
                      {tiers > 0 ? "Active" : "Setup"}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {tiers}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Loyalty Tiers
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Icon source={CashDollarFilledIcon} tone="base" />
                    <Badge>All Time</Badge>
                  </InlineStack>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    ${totalRewards.toFixed(2)}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Total Rewards
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* Quick Actions */}
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Quick Actions
                  </Text>
                  
                  <Layout>
                    <Layout.Section variant="oneHalf">
                      <Box
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="300">
                          <InlineStack gap="200">
                            <Icon source={PriceListIcon} tone="base" />
                            <BlockStack gap="100">
                              <Text as="h3" variant="headingSm">
                                Manage Tiers
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Configure loyalty tiers and cashback rates
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            fullWidth
                            variant={tiers === 0 ? "primary" : undefined}
                            onClick={() => navigate("/app/tiers")}
                            icon={ArrowRightIcon}
                          >
                            {tiers === 0 ? "Get Started" : "Manage"}
                          </Button>
                        </BlockStack>
                      </Box>
                    </Layout.Section>
                    
                    <Layout.Section variant="oneHalf">
                      <Box
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="300">
                          <InlineStack gap="200">
                            <Icon source={PersonSegmentIcon} tone="base" />
                            <BlockStack gap="100">
                              <Text as="h3" variant="headingSm">
                                View Customers
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Manage customer rewards and balances
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            fullWidth
                            onClick={() => navigate("/app/customers")}
                            icon={ArrowRightIcon}
                          >
                            View
                          </Button>
                        </BlockStack>
                      </Box>
                    </Layout.Section>
                    
                    <Layout.Section variant="oneHalf">
                      <Box
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="300">
                          <InlineStack gap="200">
                            <Icon source={CashDollarFilledIcon} tone="base" />
                            <BlockStack gap="100">
                              <Text as="h3" variant="headingSm">
                                Billing
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Manage your subscription
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            fullWidth
                            onClick={() => navigate("/app/billing")}
                            icon={ArrowRightIcon}
                          >
                            Manage
                          </Button>
                        </BlockStack>
                      </Box>
                    </Layout.Section>
                    
                    <Layout.Section variant="oneHalf">
                      <Box
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="300">
                          <InlineStack gap="200">
                            <Icon source={SettingsIcon} tone="base" />
                            <BlockStack gap="100">
                              <Text as="h3" variant="headingSm">
                                Settings
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Configure program settings
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            fullWidth
                            onClick={() => navigate("/app/settings")}
                            icon={ArrowRightIcon}
                          >
                            Configure
                          </Button>
                        </BlockStack>
                      </Box>
                    </Layout.Section>
                  </Layout>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* Recent Customers */}
        {recentCustomers.length > 0 && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Recent Customers
                  </Text>
                  <Button variant="plain" onClick={() => navigate("/app/customers")}>
                    View All
                  </Button>
                </InlineStack>
                
                <BlockStack gap="200">
                  {recentCustomers.map((customer) => (
                    <Box
                      key={customer.id}
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="100"
                    >
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodyMd">
                          {customer.email}
                        </Text>
                        <Badge tone="success">
                          {`$${customer.storeCredit.toFixed(2)}`}
                        </Badge>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        )}
        
        {/* Current Tiers */}
        {tiersList.length > 0 && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Loyalty Tiers
                  </Text>
                  <Button variant="plain" onClick={() => navigate("/app/tiers")}>
                    Manage
                  </Button>
                </InlineStack>
                
                <BlockStack gap="200">
                  {tiersList.map((tier) => (
                    <Box
                      key={tier.id}
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="100"
                    >
                      <InlineStack align="space-between">
                        <InlineStack gap="300">
                          <Icon source={StarFilledIcon} tone="warning" />
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {tier.name}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Min. spend: ${tier.minSpend}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Badge tone="success">
                          {`${tier.cashbackPercent}% cashback`}
                        </Badge>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        )}
        
        {/* Empty State */}
        {!isProgramActive && customers === 0 && (
          <Card>
            <EmptyState
              heading="Welcome to RewardsPro"
              action={{
                content: "Create Your First Tier",
                onAction: () => navigate("/app/tiers"),
              }}
              secondaryAction={{
                content: "View Documentation",
                url: "https://help.shopify.com",
                external: true,
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              Set up loyalty tiers to start rewarding your customers with cashback on their purchases.
            </EmptyState>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

// Error Boundary
export function ErrorBoundary() {
  return (
    <Page title="Dashboard">
      <Card>
        <Box padding="400">
          <Banner tone="critical" title="Something went wrong">
            Unable to load the dashboard. Please refresh the page or contact support.
          </Banner>
        </Box>
      </Card>
    </Page>
  );
}