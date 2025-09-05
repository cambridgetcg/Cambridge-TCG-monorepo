import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Icon,
  Box,
  Grid,
  ProgressBar,
  Badge,
  CalloutCard,
  Banner,
  DataTable,
  EmptyState,
  Divider,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import {
  StarFilledIcon,
  PersonSegmentIcon,
  CashDollarFilledIcon,
  ChartVerticalFilledIcon,
  TipJarIcon,
  SettingsIcon,
  BillFilledIcon,
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ClockIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";
import db from "../db.server";

interface LoaderData {
  shop: string;
  metrics: {
    totalCustomers: number;
    customersChange: number;
    totalRewards: number;
    rewardsChange: number;
    activeTiers: number;
    tiersWithCustomers: number;
    averageCashback: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
    amount?: number;
  }>;
  tierDistribution: Array<{
    name: string;
    customerCount: number;
    percentage: number;
  }>;
  setupChecklist: {
    tiersCreated: boolean;
    hasCustomers: boolean;
    settingsConfigured: boolean;
    billingActive: boolean;
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Fetch all data in parallel
    const [
      tiers,
      customers,
      recentLedgerEntries,
      settings,
      billingPlan
    ] = await Promise.all([
      db.tier.findMany({ 
        where: { shop },
        orderBy: { minSpend: "asc" }
      }).catch(() => []),
      db.customer.findMany({ 
        where: { shop },
        select: { 
          id: true, 
          currentTierId: true, 
          storeCredit: true,
          createdAt: true 
        }
      }).catch(() => []),
      db.storeCreditLedger.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          amount: true,
          createdAt: true,
          metadata: true,
        }
      }).catch(() => []),
      db.shopSettings.findUnique({
        where: { shop }
      }).catch(() => null),
      db.billingPlan.findUnique({
        where: { shop }
      }).catch(() => null)
    ]);

    // Calculate metrics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recentCustomers = customers.filter(c => 
      new Date(c.createdAt) > thirtyDaysAgo
    ).length;
    
    const totalRewards = recentLedgerEntries
      .filter(e => e.type === "CASHBACK_EARNED")
      .reduce((sum, e) => sum + parseFloat(e.amount?.toString() || "0"), 0);

    // Calculate tier distribution
    const tierMap = new Map<string, { name: string; count: number }>();
    tiers.forEach(tier => {
      tierMap.set(tier.id, { name: tier.name, count: 0 });
    });
    
    customers.forEach(customer => {
      if (customer.currentTierId && tierMap.has(customer.currentTierId)) {
        const tier = tierMap.get(customer.currentTierId)!;
        tier.count++;
      }
    });

    const tierDistribution = Array.from(tierMap.values()).map(tier => ({
      name: tier.name,
      customerCount: tier.count,
      percentage: customers.length > 0 
        ? Math.round((tier.count / customers.length) * 100) 
        : 0
    }));

    // Format recent activity
    const recentActivity = recentLedgerEntries.map(entry => {
      const typeLabels: Record<string, string> = {
        CASHBACK_EARNED: "Cashback Earned",
        ORDER_PAYMENT: "Store Credit Used",
        REFUND_CREDIT: "Refund Issued",
        MANUAL_ADJUSTMENT: "Manual Adjustment",
        SHOPIFY_SYNC: "System Sync"
      };

      return {
        id: entry.id,
        type: entry.type,
        description: typeLabels[entry.type] || entry.type,
        timestamp: entry.createdAt instanceof Date 
          ? entry.createdAt.toISOString()
          : entry.createdAt,
        amount: parseFloat(entry.amount?.toString() || "0")
      };
    });

    // Setup checklist
    const setupChecklist = {
      tiersCreated: tiers.length > 0,
      hasCustomers: customers.length > 0,
      settingsConfigured: settings !== null,
      billingActive: billingPlan?.status === "active"
    };

    // Calculate average cashback
    const averageCashback = tiers.length > 0
      ? tiers.reduce((sum, tier) => sum + tier.cashbackPercent, 0) / tiers.length
      : 0;

    const metrics = {
      totalCustomers: customers.length,
      customersChange: recentCustomers,
      totalRewards: Math.round(totalRewards * 100) / 100,
      rewardsChange: 12, // Placeholder - would calculate from historical data
      activeTiers: tiers.length,
      tiersWithCustomers: tierDistribution.filter(t => t.customerCount > 0).length,
      averageCashback: Math.round(averageCashback * 10) / 10,
    };

    return json<LoaderData>({
      shop,
      metrics,
      recentActivity,
      tierDistribution,
      setupChecklist,
    });
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    
    // Return minimal data on error
    return json<LoaderData>({
      shop: "",
      metrics: {
        totalCustomers: 0,
        customersChange: 0,
        totalRewards: 0,
        rewardsChange: 0,
        activeTiers: 0,
        tiersWithCustomers: 0,
        averageCashback: 0,
      },
      recentActivity: [],
      tierDistribution: [],
      setupChecklist: {
        tiersCreated: false,
        hasCustomers: false,
        settingsConfigured: false,
        billingActive: false,
      },
    });
  }
};

export default function DashboardPage() {
  const { metrics, recentActivity, tierDistribution, setupChecklist } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Calculate setup progress
  const setupSteps = Object.values(setupChecklist);
  const completedSteps = setupSteps.filter(Boolean).length;
  const setupProgress = (completedSteps / setupSteps.length) * 100;

  // Get quick insights
  const insights = {
    needsMoreTiers: metrics.activeTiers < 3,
    goodCustomerGrowth: metrics.customersChange > 5,
    highEngagement: metrics.tiersWithCustomers > metrics.activeTiers / 2,
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Format relative time
  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  if (loading) {
    return (
      <Page title="Dashboard">
        <Layout>
          <Layout.Section>
            <Card>
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={3} />
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page 
      title="Dashboard"
      secondaryActions={[
        {
          content: "View Reports",
          icon: ChartVerticalFilledIcon,
          onAction: () => {},
        },
      ]}
    >
      <Layout>
        {/* Setup Progress Banner */}
        {setupProgress < 100 && (
          <Layout.Section>
            <CalloutCard
              title="Complete Your Setup"
              illustration="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/setup-illustration.svg"
              primaryAction={{
                content: setupChecklist.tiersCreated ? "Continue Setup" : "Create First Tier",
                onAction: () => navigate(setupChecklist.tiersCreated ? "/app/settings" : "/app/tiers"),
              }}
            >
              <Box paddingBlockEnd="200">
                <Text variant="bodyMd" as="p">
                  You're {Math.round(setupProgress)}% complete with your rewards program setup.
                </Text>
              </Box>
              <ProgressBar progress={setupProgress} tone="primary" />
            </CalloutCard>
          </Layout.Section>
        )}

        {/* Metrics Grid */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodySm" tone="subdued" as="p">Total Customers</Text>
                    <Icon source={PersonSegmentIcon} tone="base" />
                  </InlineStack>
                  <Text variant="headingXl" as="h2">{metrics.totalCustomers}</Text>
                  <InlineStack gap="100" blockAlign="center">
                    {metrics.customersChange > 0 ? (
                      <>
                        <Icon source={ArrowUpIcon} tone="success" />
                        <Text variant="bodySm" as="p">
                          +{metrics.customersChange} this month
                        </Text>
                      </>
                    ) : (
                      <Text variant="bodySm" tone="subdued" as="p">
                        No new customers this month
                      </Text>
                    )}
                  </InlineStack>
                </BlockStack>
              </Card>
            </Grid.Cell>

            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodySm" tone="subdued" as="p">Rewards Distributed</Text>
                    <Icon source={CashDollarFilledIcon} tone="base" />
                  </InlineStack>
                  <Text variant="headingXl" as="h2">{formatCurrency(metrics.totalRewards)}</Text>
                  <InlineStack gap="100" blockAlign="center">
                    <Icon source={ArrowUpIcon} tone="success" />
                    <Text variant="bodySm" as="p">
                      +{metrics.rewardsChange}% vs last month
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Grid.Cell>

            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodySm" tone="subdued" as="p">Active Tiers</Text>
                    <Icon source={StarFilledIcon} tone="base" />
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="baseline">
                    <Text variant="headingXl" as="h2">{metrics.activeTiers}</Text>
                    <Text variant="bodyMd" tone="subdued" as="span">
                      / {metrics.tiersWithCustomers} used
                    </Text>
                  </InlineStack>
                  <Badge tone={metrics.activeTiers >= 3 ? "success" : "attention"}>
                    {metrics.activeTiers >= 3 ? `Optimal` : `Add more tiers`}
                  </Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>

            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodySm" tone="subdued" as="p">Avg. Cashback</Text>
                    <Icon source={TipJarIcon} tone="base" />
                  </InlineStack>
                  <Text variant="headingXl" as="h2">{metrics.averageCashback}%</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Across all tiers
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Main Content */}
        <Layout.Section>
          <Grid>
            {/* Tier Distribution */}
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 4, lg: 4}}>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h3">Tier Distribution</Text>
                    <Button variant="plain" onClick={() => navigate("/app/tiers")}>
                      Manage Tiers
                    </Button>
                  </InlineStack>

                  {tierDistribution.length === 0 ? (
                    <EmptyState
                      heading="No tiers yet"
                      action={{ content: "Create First Tier", onAction: () => navigate("/app/tiers") }}
                      image="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/empty-tiers.svg"
                    >
                      <p>Set up loyalty tiers to start rewarding customers.</p>
                    </EmptyState>
                  ) : (
                    <BlockStack gap="300">
                      {tierDistribution.map((tier) => (
                        <Box key={tier.name}>
                          <BlockStack gap="100">
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                {tier.name}
                              </Text>
                              <InlineStack gap="200">
                                <Text variant="bodyMd" as="span">
                                  {tier.customerCount} customers
                                </Text>
                                <Badge tone="info">{`${tier.percentage}%`}</Badge>
                              </InlineStack>
                            </InlineStack>
                            <ProgressBar 
                              progress={tier.percentage} 
                              size="small"
                              tone={tier.customerCount > 0 ? "success" : undefined}
                            />
                          </BlockStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Grid.Cell>

            {/* Quick Actions */}
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 2, lg: 2}}>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Quick Actions</Text>
                  <BlockStack gap="200">
                    <Button 
                      fullWidth 
                      icon={StarFilledIcon}
                      onClick={() => navigate("/app/tiers")}
                    >
                      Manage Tiers
                    </Button>
                    <Button 
                      fullWidth 
                      icon={PersonSegmentIcon}
                      onClick={() => navigate("/app/customers")}
                    >
                      View Customers
                    </Button>
                    <Button 
                      fullWidth 
                      icon={SettingsIcon}
                      onClick={() => navigate("/app/settings")}
                    >
                      Configure Settings
                    </Button>
                    <Button 
                      fullWidth 
                      icon={BillFilledIcon}
                      onClick={() => navigate("/app/billing")}
                    >
                      Billing & Plans
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Recent Activity & Insights */}
        <Layout.Section>
          <Grid>
            {/* Recent Activity */}
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 4, lg: 4}}>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h3">Recent Activity</Text>
                    <Badge tone="info">Last 5 transactions</Badge>
                  </InlineStack>

                  {recentActivity.length === 0 ? (
                    <Box paddingBlock="600">
                      <BlockStack gap="200">
                        <Text variant="bodyMd" alignment="center" tone="subdued" as="p">
                          No activity yet
                        </Text>
                        <Text variant="bodySm" alignment="center" tone="subdued" as="p">
                          Activity will appear here once customers start earning rewards
                        </Text>
                      </BlockStack>
                    </Box>
                  ) : (
                    <BlockStack gap="300">
                      {recentActivity.map((activity) => (
                        <Box key={activity.id}>
                          <InlineStack align="space-between">
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Icon 
                                  source={
                                    activity.type === "CASHBACK_EARNED" 
                                      ? CheckCircleIcon 
                                      : ClockIcon
                                  } 
                                  tone={
                                    activity.type === "CASHBACK_EARNED" 
                                      ? "success" 
                                      : "base"
                                  }
                                />
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  {activity.description}
                                </Text>
                              </InlineStack>
                              <Text variant="bodySm" tone="subdued" as="p">
                                {formatRelativeTime(activity.timestamp)}
                              </Text>
                            </BlockStack>
                            {activity.amount && (
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                {formatCurrency(activity.amount)}
                              </Text>
                            )}
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Grid.Cell>

            {/* Insights */}
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 2, lg: 2}}>
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={AlertTriangleIcon} tone="warning" />
                    <Text variant="headingMd" as="h3">Insights</Text>
                  </InlineStack>
                  
                  <BlockStack gap="300">
                    {insights.needsMoreTiers && (
                      <Box 
                        padding="300" 
                        background="bg-surface-warning" 
                        borderRadius="200"
                      >
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            Add More Tiers
                          </Text>
                          <Text variant="bodySm" as="p">
                            Consider adding more tiers to provide better progression for customers.
                          </Text>
                        </BlockStack>
                      </Box>
                    )}

                    {insights.goodCustomerGrowth && (
                      <Box 
                        padding="300" 
                        background="bg-surface-success" 
                        borderRadius="200"
                      >
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            Growing Customer Base
                          </Text>
                          <Text variant="bodySm" as="p">
                            Great job! Your customer base is growing steadily.
                          </Text>
                        </BlockStack>
                      </Box>
                    )}

                    {!insights.highEngagement && (
                      <Box 
                        padding="300" 
                        background="bg-surface-info" 
                        borderRadius="200"
                      >
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            Boost Engagement
                          </Text>
                          <Text variant="bodySm" as="p">
                            Consider promotional campaigns to move customers to higher tiers.
                          </Text>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Setup Checklist */}
        {setupProgress < 100 && (
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Setup Checklist</Text>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon 
                      source={setupChecklist.tiersCreated ? CheckCircleIcon : ClockIcon}
                      tone={setupChecklist.tiersCreated ? "success" : "subdued"}
                    />
                    <Text 
                      variant="bodyMd"
                      tone={setupChecklist.tiersCreated ? "success" : "subdued"}
                      as="span"
                    >
                      Create loyalty tiers
                    </Text>
                  </InlineStack>

                  <InlineStack gap="200" blockAlign="center">
                    <Icon 
                      source={setupChecklist.hasCustomers ? CheckCircleIcon : ClockIcon}
                      tone={setupChecklist.hasCustomers ? "success" : "subdued"}
                    />
                    <Text 
                      variant="bodyMd"
                      tone={setupChecklist.hasCustomers ? "success" : "subdued"}
                      as="span"
                    >
                      Import customers
                    </Text>
                  </InlineStack>

                  <InlineStack gap="200" blockAlign="center">
                    <Icon 
                      source={setupChecklist.settingsConfigured ? CheckCircleIcon : ClockIcon}
                      tone={setupChecklist.settingsConfigured ? "success" : "subdued"}
                    />
                    <Text 
                      variant="bodyMd"
                      tone={setupChecklist.settingsConfigured ? "success" : "subdued"}
                      as="span"
                    >
                      Configure settings
                    </Text>
                  </InlineStack>

                  <InlineStack gap="200" blockAlign="center">
                    <Icon 
                      source={setupChecklist.billingActive ? CheckCircleIcon : ClockIcon}
                      tone={setupChecklist.billingActive ? "success" : "subdued"}
                    />
                    <Text 
                      variant="bodyMd"
                      tone={setupChecklist.billingActive ? "success" : "subdued"}
                      as="span"
                    >
                      Activate billing plan
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}