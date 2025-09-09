import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useCallback, useMemo } from "react";
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
  ProgressBar,
  Badge,
  Divider,
  Grid,
  EmptyState,
  DataTable,
  Tabs,
  Banner,
  SkeletonBodyText,
  SkeletonDisplayText,
  Tooltip,
  Link,
} from "@shopify/polaris";
import {
  PersonIcon,
  CashDollarIcon,
  ChartVerticalIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  RefreshIcon,
  PlusIcon,
  SettingsIcon,
  QuestionCircleIcon,
  StarFilledIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  EmailIcon,
  EditIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface DashboardMetrics {
  totalCustomers: number;
  totalStoreCredit: number;
  activeTiers: number;
  averageCredit: number;
  customersGrowth: number; // Percentage change
  creditGrowth: number; // Percentage change
  topTier: { name: string; count: number } | null;
  recentSignups: number;
}

interface TierDistribution {
  name: string;
  count: number;
  percentage: number;
  cashbackPercent: number;
  totalCredit: number;
}

interface RecentTransaction {
  id: string;
  type: string;
  amount: number;
  customerEmail: string;
  customerName?: string;
  createdAt: string;
  metadata?: any;
}

interface QuickStat {
  label: string;
  value: string | number;
  change?: number;
  tone?: "positive" | "negative" | "neutral";
  icon: any;
}

// ============================================
// LOADER - Fetch comprehensive dashboard data
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Format dates for Aurora Data API
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    // Parallel data fetching for performance
    const [
      shopSettings,
      customers,
      tiers,
      recentTransactions,
      last30DaysCustomers,
      last7DaysCustomers,
      totalCreditSum,
      creditLast30Days,
    ] = await Promise.all([
      // Shop settings
      db.shopSettings.findUnique({ where: { shop } }),
      
      // All customers with tier info
      db.customer.findMany({
        where: { shop },
        include: {
          currentTier: true,
        },
      }),
      
      // All tiers
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      
      // Recent transactions
      db.storeCreditLedger.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          customer: {
            select: {
              email: true,
              shopifyCustomerId: true,
            },
          },
        },
      }),
      
      // Customers created in last 30 days
      db.customer.count({
        where: {
          shop,
          createdAt: { gte: thirtyDaysAgoISO as any },
        },
      }),
      
      // Customers created in last 7 days
      db.customer.count({
        where: {
          shop,
          createdAt: { gte: sevenDaysAgoISO as any },
        },
      }),
      
      // Total store credit
      db.customer.aggregate({
        where: { shop },
        _sum: { storeCredit: true },
      }),
      
      // Credit earned in last 30 days
      db.storeCreditLedger.aggregate({
        where: {
          shop,
          createdAt: { gte: thirtyDaysAgoISO as any },
          type: { in: ['CASHBACK_EARNED', 'MANUAL_ADJUSTMENT'] },
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      }),
    ]);

    // Calculate tier distribution
    const tierDistribution: TierDistribution[] = tiers.map(tier => {
      const customersInTier = customers.filter(c => c.currentTierId === tier.id);
      const totalCreditInTier = customersInTier.reduce((sum, c) => 
        sum + parseFloat(c.storeCredit.toString()), 0
      );
      
      return {
        name: tier.name,
        count: customersInTier.length,
        percentage: customers.length > 0 
          ? (customersInTier.length / customers.length) * 100 
          : 0,
        cashbackPercent: tier.cashbackPercent,
        totalCredit: totalCreditInTier,
      };
    });

    // Add "No Tier" category
    const noTierCustomers = customers.filter(c => !c.currentTierId);
    if (noTierCustomers.length > 0) {
      const totalCreditNoTier = noTierCustomers.reduce((sum, c) => 
        sum + parseFloat(c.storeCredit.toString()), 0
      );
      
      tierDistribution.push({
        name: "No Tier",
        count: noTierCustomers.length,
        percentage: (noTierCustomers.length / customers.length) * 100,
        cashbackPercent: 0,
        totalCredit: totalCreditNoTier,
      });
    }

    // Calculate growth metrics
    const customersGrowth = customers.length > 0 
      ? (last30DaysCustomers / customers.length) * 100 
      : 0;
    
    const totalCredit = parseFloat(totalCreditSum._sum.storeCredit?.toString() || "0");
    const creditEarnedRecently = parseFloat(creditLast30Days._sum.amount?.toString() || "0");
    const creditGrowth = totalCredit > 0 
      ? (creditEarnedRecently / totalCredit) * 100 
      : 0;

    // Find top tier
    const topTier = tierDistribution.length > 0 
      ? tierDistribution.reduce((max, tier) => 
          tier.count > max.count ? tier : max, tierDistribution[0])
      : null;

    // Prepare metrics
    const metrics: DashboardMetrics = {
      totalCustomers: customers.length,
      totalStoreCredit: totalCredit,
      activeTiers: tiers.length,
      averageCredit: customers.length > 0 ? totalCredit / customers.length : 0,
      customersGrowth: Math.round(customersGrowth * 10) / 10,
      creditGrowth: Math.round(creditGrowth * 10) / 10,
      topTier: topTier ? { name: topTier.name, count: topTier.count } : null,
      recentSignups: last7DaysCustomers,
    };

    // Format recent transactions
    const formattedTransactions: RecentTransaction[] = recentTransactions.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount.toString()),
      customerEmail: tx.customer?.email || "Unknown",
      createdAt: tx.createdAt.toISOString(),
      metadata: tx.metadata,
    }));

    // Check if setup is complete
    const setupComplete = tiers.length > 0 && shopSettings !== null;

    return json({
      shop,
      metrics,
      tierDistribution: tierDistribution.sort((a, b) => b.count - a.count),
      recentTransactions: formattedTransactions,
      setupComplete,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
    });
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    throw new Response("Failed to load dashboard data", { status: 500 });
  }
};

// ============================================
// DASHBOARD COMPONENT
// ============================================

export default function Dashboard() {
  const { 
    metrics, 
    tierDistribution, 
    recentTransactions, 
    setupComplete,
    shopSettings 
  } = useLoaderData<typeof loader>();
  
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, shopSettings as any);
  }, [shopSettings]);

  // Format relative time
  const formatRelativeTime = useCallback((date: string) => {
    const timestamp = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return timestamp.toLocaleDateString();
  }, []);

  // Get transaction type label and tone
  const getTransactionDisplay = useCallback((type: string) => {
    const displays: Record<string, { label: string; tone: "success" | "critical" | "warning" | "info" }> = {
      CASHBACK_EARNED: { label: "Cashback Earned", tone: "success" },
      ORDER_PAYMENT: { label: "Credit Used", tone: "info" },
      REFUND_CREDIT: { label: "Refund Credit", tone: "warning" },
      MANUAL_ADJUSTMENT: { label: "Manual Adjustment", tone: "info" },
      SHOPIFY_SYNC: { label: "Synced", tone: "info" },
    };
    return displays[type] || { label: type, tone: "info" };
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    window.location.reload();
  }, []);

  // Quick stats for metric cards
  const quickStats: QuickStat[] = useMemo(() => [
    {
      label: "Total Customers",
      value: metrics.totalCustomers.toLocaleString(),
      change: metrics.customersGrowth,
      tone: metrics.customersGrowth > 0 ? "positive" : "neutral",
      icon: PersonIcon,
    },
    {
      label: "Store Credit",
      value: formatAmount(metrics.totalStoreCredit),
      change: metrics.creditGrowth,
      tone: metrics.creditGrowth > 0 ? "positive" : "neutral",
      icon: CashDollarIcon,
    },
    {
      label: "Active Tiers",
      value: metrics.activeTiers,
      icon: StarFilledIcon,
    },
    {
      label: "Avg. Credit/Customer",
      value: formatAmount(metrics.averageCredit),
      icon: ChartVerticalIcon,
    },
  ], [metrics, formatAmount]);

  // Tabs for different views
  const tabs = [
    { id: "overview", content: "Overview", panelID: "overview-panel" },
    { id: "activity", content: "Recent Activity", badge: recentTransactions.length.toString(), panelID: "activity-panel" },
    { id: "insights", content: "Insights", panelID: "insights-panel" },
  ];

  // ============================================
  // RENDER
  // ============================================

  return (
    <Page
      title="RewardsPro Dashboard"
      subtitle="Monitor your loyalty program performance"
      primaryAction={{
        content: "Add Customer",
        icon: PlusIcon,
        onAction: () => navigate("/app/customers"),
      }}
      secondaryActions={[
        {
          content: "Refresh",
          icon: RefreshIcon,
          onAction: handleRefresh,
          loading: isRefreshing,
        },
        {
          content: "Settings",
          icon: SettingsIcon,
          onAction: () => navigate("/app/settings"),
        },
      ]}
    >
      <Layout>
        {/* Setup Banner if not complete */}
        {!setupComplete && (
          <Layout.Section>
            <Banner
              title="Complete your setup"
              tone="warning"
              action={{
                content: "Finish setup",
                onAction: () => navigate("/app/tiers"),
              }}
            >
              <p>Create loyalty tiers to start rewarding your customers.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Metrics Cards - Symmetrical Balance */}
        <Layout.Section>
          <BlockStack gap="600">
            {/* Primary Metrics */}
            <Grid columns={{ xs: 1, sm: 2, md: 4, lg: 4, xl: 4 }}>
              {quickStats.map((stat) => (
                <Grid.Cell key={stat.label}>
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={stat.icon} tone="base" />
                          {stat.change !== undefined && (
                            <Badge
                              tone={stat.tone === "positive" ? "success" : "info"}
                              icon={stat.change > 0 ? ArrowUpIcon : ArrowDownIcon}
                            >
                              {`${Math.abs(stat.change)}%`}
                            </Badge>
                          )}
                        </InlineStack>
                        <BlockStack gap="100">
                          <Text variant="bodySm" tone="subdued" as="p">
                            {stat.label}
                          </Text>
                          <Text variant="heading2xl" as="h2">
                            {stat.value}
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </Box>
                  </Card>
                </Grid.Cell>
              ))}
            </Grid>

            {/* Welcome Message & Quick Stats */}
            {metrics.recentSignups > 0 && (
              <Card>
                <Box padding="400" background="bg-surface-success">
                  <InlineStack gap="400" align="center">
                    <Icon source={StarFilledIcon} tone="success" />
                    <Text variant="bodyMd" as="p">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">
                        {metrics.recentSignups} new customers
                      </Text>
                      {" "}joined in the last 7 days!
                    </Text>
                  </InlineStack>
                </Box>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>

        {/* Main Content Area - Tabbed Interface */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <Box padding="400">
                {/* Overview Tab */}
                {selectedTab === 0 && (
                  <BlockStack gap="600">
                    {/* Tier Distribution */}
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h3">
                          Tier Distribution
                        </Text>
                        <Button
                          variant="plain"
                          onClick={() => navigate("/app/tiers")}
                        >
                          Manage Tiers
                        </Button>
                      </InlineStack>

                      {tierDistribution.length > 0 ? (
                        <BlockStack gap="300">
                          {tierDistribution.map((tier) => (
                            <Box key={tier.name}>
                              <BlockStack gap="200">
                                <InlineStack align="space-between">
                                  <InlineStack gap="200" align="center">
                                    <Icon 
                                      source={tier.name === "No Tier" ? AlertTriangleIcon : StarFilledIcon}
                                      tone={tier.name === "No Tier" ? "warning" : "base"}
                                    />
                                    <BlockStack gap="050">
                                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                                        {tier.name}
                                      </Text>
                                      <InlineStack gap="200">
                                        <Text variant="bodySm" tone="subdued" as="span">
                                          {tier.count} customers ({tier.percentage.toFixed(1)}%)
                                        </Text>
                                        {tier.cashbackPercent > 0 && (
                                          <Badge tone="info">
                                            {`${tier.cashbackPercent}% cashback`}
                                          </Badge>
                                        )}
                                      </InlineStack>
                                    </BlockStack>
                                  </InlineStack>
                                  <Text variant="bodyMd" as="p">
                                    {formatAmount(tier.totalCredit)}
                                  </Text>
                                </InlineStack>
                                <ProgressBar
                                  progress={tier.percentage}
                                  size="small"
                                  tone={tier.name === "No Tier" ? "critical" : "success"}
                                />
                              </BlockStack>
                            </Box>
                          ))}
                        </BlockStack>
                      ) : (
                        <EmptyState
                          heading="No tiers yet"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                          action={{
                            content: "Create first tier",
                            onAction: () => navigate("/app/tiers"),
                          }}
                        >
                          <p>Set up loyalty tiers to categorize customers.</p>
                        </EmptyState>
                      )}
                    </BlockStack>

                    <Divider />

                    {/* Quick Actions Grid */}
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h3">
                        Quick Actions
                      </Text>
                      <Grid columns={{ xs: 1, sm: 2, md: 3 }}>
                        <Grid.Cell>
                          <Card>
                            <Box padding="400">
                              <BlockStack gap="300">
                                <Icon source={PersonIcon} tone="base" />
                                <Text variant="headingSm" as="h4">
                                  Customers
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  View and manage customer profiles
                                </Text>
                                <Button
                                  fullWidth
                                  onClick={() => navigate("/app/customers")}
                                >
                                  View Customers
                                </Button>
                              </BlockStack>
                            </Box>
                          </Card>
                        </Grid.Cell>

                        <Grid.Cell>
                          <Card>
                            <Box padding="400">
                              <BlockStack gap="300">
                                <Icon source={CashDollarIcon} tone="base" />
                                <Text variant="headingSm" as="h4">
                                  Credit Management
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Adjust store credit balances
                                </Text>
                                <Button
                                  fullWidth
                                  onClick={() => navigate("/app/credit-management")}
                                >
                                  Manage Credit
                                </Button>
                              </BlockStack>
                            </Box>
                          </Card>
                        </Grid.Cell>

                        <Grid.Cell>
                          <Card>
                            <Box padding="400">
                              <BlockStack gap="300">
                                <Icon source={StarFilledIcon} tone="base" />
                                <Text variant="headingSm" as="h4">
                                  Loyalty Tiers
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Configure tier requirements
                                </Text>
                                <Button
                                  fullWidth
                                  onClick={() => navigate("/app/tiers")}
                                >
                                  Manage Tiers
                                </Button>
                              </BlockStack>
                            </Box>
                          </Card>
                        </Grid.Cell>
                      </Grid>
                    </BlockStack>
                  </BlockStack>
                )}

                {/* Activity Tab */}
                {selectedTab === 1 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd" as="h3">
                        Recent Transactions
                      </Text>
                      <Button
                        variant="plain"
                        onClick={() => navigate("/app/credit-management")}
                      >
                        View All
                      </Button>
                    </InlineStack>

                    {recentTransactions.length > 0 ? (
                      <BlockStack gap="200">
                        {recentTransactions.map((transaction) => {
                          const display = getTransactionDisplay(transaction.type);
                          return (
                            <Box
                              key={transaction.id}
                              padding="300"
                              background="bg-surface"
                              borderColor="border"
                              borderWidth="025"
                              borderRadius="200"
                            >
                              <InlineStack align="space-between">
                                <InlineStack gap="300">
                                  <Box minWidth="40px">
                                    <Icon
                                      source={
                                        transaction.amount > 0
                                          ? ArrowUpIcon
                                          : ArrowDownIcon
                                      }
                                      tone={transaction.amount > 0 ? "success" : "critical"}
                                    />
                                  </Box>
                                  <BlockStack gap="050">
                                    <InlineStack gap="200" align="center">
                                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                                        {display.label}
                                      </Text>
                                      <Badge tone={display.tone}>
                                        {transaction.type}
                                      </Badge>
                                    </InlineStack>
                                    <InlineStack gap="200">
                                      <Text variant="bodySm" tone="subdued" as="span">
                                        {transaction.customerEmail}
                                      </Text>
                                      <Text variant="bodySm" tone="subdued" as="span">
                                        •
                                      </Text>
                                      <Text variant="bodySm" tone="subdued" as="span">
                                        {formatRelativeTime(transaction.createdAt)}
                                      </Text>
                                    </InlineStack>
                                  </BlockStack>
                                </InlineStack>
                                <Text
                                  variant="bodyLg"
                                  fontWeight="semibold"
                                  tone={transaction.amount > 0 ? "success" : "critical"}
                                  as="p"
                                >
                                  {transaction.amount > 0 ? "+" : ""}
                                  {formatAmount(Math.abs(transaction.amount))}
                                </Text>
                              </InlineStack>
                            </Box>
                          );
                        })}
                      </BlockStack>
                    ) : (
                      <EmptyState
                        heading="No transactions yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Transaction history will appear here.</p>
                      </EmptyState>
                    )}
                  </BlockStack>
                )}

                {/* Insights Tab */}
                {selectedTab === 2 && (
                  <BlockStack gap="600">
                    {/* Key Insights */}
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h3">
                        Key Insights
                      </Text>
                      
                      <Grid columns={{ xs: 1, md: 2 }}>
                        {/* Top Tier Insight */}
                        {metrics.topTier && (
                          <Grid.Cell>
                            <Box
                              padding="400"
                              background="bg-surface-info"
                              borderRadius="200"
                            >
                              <BlockStack gap="200">
                                <InlineStack gap="200" align="center">
                                  <Icon source={StarFilledIcon} tone="info" />
                                  <Text variant="headingSm" as="h4">
                                    Most Popular Tier
                                  </Text>
                                </InlineStack>
                                <Text variant="bodyMd" as="p">
                                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                                    {metrics.topTier.name}
                                  </Text>
                                  {" "}has{" "}
                                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                                    {metrics.topTier.count} customers
                                  </Text>
                                </Text>
                              </BlockStack>
                            </Box>
                          </Grid.Cell>
                        )}

                        {/* Growth Insight */}
                        {metrics.customersGrowth > 0 && (
                          <Grid.Cell>
                            <Box
                              padding="400"
                              background="bg-surface-success"
                              borderRadius="200"
                            >
                              <BlockStack gap="200">
                                <InlineStack gap="200" align="center">
                                  <Icon source={ArrowUpIcon} tone="success" />
                                  <Text variant="headingSm" as="h4">
                                    Growing Customer Base
                                  </Text>
                                </InlineStack>
                                <Text variant="bodyMd" as="p">
                                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                                    {metrics.customersGrowth}% growth
                                  </Text>
                                  {" "}in the last 30 days
                                </Text>
                              </BlockStack>
                            </Box>
                          </Grid.Cell>
                        )}

                        {/* Average Credit Insight */}
                        <Grid.Cell>
                          <Box
                            padding="400"
                            background="bg-surface"
                            borderColor="border"
                            borderWidth="025"
                            borderRadius="200"
                          >
                            <BlockStack gap="200">
                              <InlineStack gap="200" align="center">
                                <Icon source={CashDollarIcon} />
                                <Text variant="headingSm" as="h4">
                                  Average Store Credit
                                </Text>
                              </InlineStack>
                              <Text variant="bodyMd" as="p">
                                Each customer has an average of{" "}
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  {formatAmount(metrics.averageCredit)}
                                </Text>
                                {" "}in store credit
                              </Text>
                            </BlockStack>
                          </Box>
                        </Grid.Cell>

                        {/* Engagement Tip */}
                        <Grid.Cell>
                          <Box
                            padding="400"
                            background="bg-surface-warning"
                            borderRadius="200"
                          >
                            <BlockStack gap="200">
                              <InlineStack gap="200" align="center">
                                <Icon source={AlertTriangleIcon} tone="warning" />
                                <Text variant="headingSm" as="h4">
                                  Engagement Tip
                                </Text>
                              </InlineStack>
                              <Text variant="bodyMd" as="p">
                                {tierDistribution.find(t => t.name === "No Tier")?.count || 0} customers
                                haven't been assigned to a tier yet
                              </Text>
                              <Button
                                size="slim"
                                onClick={() => navigate("/app/customers")}
                              >
                                Review Customers
                              </Button>
                            </BlockStack>
                          </Box>
                        </Grid.Cell>
                      </Grid>
                    </BlockStack>

                    <Divider />

                    {/* Recommendations */}
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h3">
                        Recommendations
                      </Text>
                      
                      <BlockStack gap="300">
                        <InlineStack gap="300" align="start">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <BlockStack gap="100">
                            <Text variant="bodyMd" fontWeight="semibold" as="p">
                              Email your top customers
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              Engage with your most loyal customers to increase retention
                            </Text>
                            <Button
                              variant="plain"
                              icon={EmailIcon}
                              onClick={() => navigate("/app/customers")}
                            >
                              View Top Customers
                            </Button>
                          </BlockStack>
                        </InlineStack>

                        <InlineStack gap="300" align="start">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <BlockStack gap="100">
                            <Text variant="bodyMd" fontWeight="semibold" as="p">
                              Review tier thresholds
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              Optimize tier requirements based on customer distribution
                            </Text>
                            <Button
                              variant="plain"
                              icon={EditIcon}
                              onClick={() => navigate("/app/tiers")}
                            >
                              Adjust Tiers
                            </Button>
                          </BlockStack>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </BlockStack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>

        {/* Footer Section with Help Resources */}
        <Layout.Section>
          <Card>
            <Box padding="400" background="bg-surface-secondary">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="400">
                  <Icon source={QuestionCircleIcon} />
                  <BlockStack gap="050">
                    <Text variant="headingSm" as="h4">
                      Need help getting started?
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Check out our resources to make the most of RewardsPro
                    </Text>
                  </BlockStack>
                </InlineStack>
                <InlineStack gap="200">
                  <Button variant="plain" url="https://help.shopify.com">
                    Documentation
                  </Button>
                  <Button variant="plain" onClick={() => navigate("/app/settings")}>
                    Settings
                  </Button>
                </InlineStack>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}