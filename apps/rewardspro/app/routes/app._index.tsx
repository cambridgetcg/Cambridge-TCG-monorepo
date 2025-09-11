import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useCallback } from "react";
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
  Badge,
  Divider,
  EmptyState,
  DataTable,
  Grid,
  ProgressBar,
  Tabs,
  Banner,
} from "@shopify/polaris";
import {
  PersonIcon,
  CashDollarIcon,
  ChartVerticalIcon,
  PlusIcon,
  SettingsIcon,
  RefreshIcon,
  AlertTriangleIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { TierBadge, TierIndicator } from "../components/TierBadge";
import { getTierStyle, sortTiersByPriority } from "../utils/tier-styles";
import "../styles/tiers.css";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface DashboardData {
  shop: string;
  metrics: {
    totalCustomers: number;
    totalStoreCredit: number;
    activeTiers: number;
    averageCredit: number;
    customersWithCredit: number;
    customersWithTiers: number;
  };
  tierDistribution: Array<{
    id: string;
    name: string;
    count: number;
    percentage: number;
    cashbackPercent: number;
    totalCredit: number;
    minSpend: number;
  }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    balance: number;
    customerEmail: string;
    createdAt: string;
    metadata: any;
  }>;
  topCustomers: Array<{
    id: string;
    email: string;
    storeCredit: number;
    tierName: string | null;
  }>;
  setupComplete: boolean;
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
}

// ============================================
// LOADER - Fetch dashboard data
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    console.log(`[Dashboard] Loading data for shop: ${shop}`);

    // Fetch all data in parallel for performance
    const [
      shopSettings,
      customers,
      tiers,
      recentTransactions,
    ] = await Promise.all([
      // Shop settings
      db.shopSettings.findUnique({ 
        where: { shop } 
      }),
      
      // All customers with tier info
      db.customer.findMany({
        where: { shop },
        include: {
          currentTier: true,
        },
        orderBy: { storeCredit: 'desc' },
      }),
      
      // All tiers
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      
      // Recent transactions (last 20)
      db.storeCreditLedger.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          customer: {
            select: {
              email: true,
              shopifyCustomerId: true,
            },
          },
        },
      }),
    ]);

    console.log(`[Dashboard] Fetched data - Customers: ${customers.length}, Tiers: ${tiers.length}, Transactions: ${recentTransactions.length}`);

    // Calculate metrics
    const totalCustomers = customers.length;
    const totalStoreCredit = customers.reduce((sum, c) => 
      sum + parseFloat(c.storeCredit.toString()), 0
    );
    const activeTiers = tiers.length;
    const averageCredit = totalCustomers > 0 ? totalStoreCredit / totalCustomers : 0;
    const customersWithCredit = customers.filter(c => parseFloat(c.storeCredit.toString()) > 0).length;
    const customersWithTiers = customers.filter(c => c.currentTierId).length;

    // Calculate tier distribution
    const tierDistribution = tiers.map(tier => {
      const customersInTier = customers.filter(c => c.currentTierId === tier.id);
      const totalCreditInTier = customersInTier.reduce((sum, c) => 
        sum + parseFloat(c.storeCredit.toString()), 0
      );
      
      return {
        id: tier.id,
        name: tier.name,
        count: customersInTier.length,
        percentage: totalCustomers > 0 ? (customersInTier.length / totalCustomers) * 100 : 0,
        cashbackPercent: tier.cashbackPercent,
        totalCredit: totalCreditInTier,
        minSpend: tier.minSpend,
      };
    });

    // Add "No Tier" category if there are customers without tiers
    const noTierCustomers = customers.filter(c => !c.currentTierId);
    if (noTierCustomers.length > 0) {
      const totalCreditNoTier = noTierCustomers.reduce((sum, c) => 
        sum + parseFloat(c.storeCredit.toString()), 0
      );
      
      tierDistribution.push({
        id: 'no-tier',
        name: "No Tier",
        count: noTierCustomers.length,
        percentage: totalCustomers > 0 ? (noTierCustomers.length / totalCustomers) * 100 : 0,
        cashbackPercent: 0,
        totalCredit: totalCreditNoTier,
        minSpend: 0,
      });
    }

    // Sort tier distribution by customer count
    tierDistribution.sort((a, b) => b.count - a.count);

    // Get top customers with store credit
    const topCustomers = customers
      .slice(0, 5)
      .map(c => ({
        id: c.id,
        email: c.email,
        storeCredit: parseFloat(c.storeCredit.toString()),
        tierName: c.currentTier?.name || null,
      }));

    // Format recent transactions for display
    const formattedTransactions = recentTransactions.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount.toString()),
      balance: parseFloat(tx.balance.toString()),
      customerEmail: tx.customer?.email || "Unknown",
      createdAt: new Date(tx.createdAt).toLocaleDateString(),
      metadata: tx.metadata,
    }));

    // Check if setup is complete
    const setupComplete = tiers.length > 0;

    const dashboardData: DashboardData = {
      shop,
      metrics: {
        totalCustomers,
        totalStoreCredit,
        activeTiers,
        averageCredit,
        customersWithCredit,
        customersWithTiers,
      },
      tierDistribution,
      recentTransactions: formattedTransactions,
      topCustomers,
      setupComplete,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
    };

    console.log(`[Dashboard] Returning data for ${shop}`);
    return json(dashboardData);
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    throw new Response("Failed to load dashboard data", { status: 500 });
  }
};

// ============================================
// DASHBOARD COMPONENT
// ============================================

export default function Dashboard() {
  const data = useLoaderData<typeof loader>() as DashboardData;
  const [selectedTab, setSelectedTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    window.location.reload();
  }, []);

  // Tab configuration
  const tabs = [
    { id: 'overview', content: 'Overview', panelID: 'overview-panel' },
    { id: 'activity', content: 'Recent Activity', panelID: 'activity-panel' },
    { id: 'insights', content: 'Insights', panelID: 'insights-panel' },
  ];

  // If setup is not complete, show onboarding
  if (!data.setupComplete) {
    return (
      <Page title="Welcome to RewardsPro">
        <Layout>
          <Layout.Section>
            <EmptyState
              heading="Get started with RewardsPro"
              action={{
                content: "Create your first tier",
                url: "/app/tiers",
              }}
              secondaryAction={{
                content: "Configure settings",
                url: "/app/settings",
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Set up loyalty tiers and start rewarding your customers with cashback.</p>
            </EmptyState>
          </Layout.Section>
        </Layout>
        
        {/* Bottom spacer to prevent content from touching the bottom */}
        <div style={{ height: '80px', width: '100%' }} aria-hidden="true" />
      </Page>
    );
  }

  return (
    <Page 
      title="Dashboard"
      primaryAction={{
        content: "Add customer",
        icon: PlusIcon,
        url: "/app/customers",
      }}
      secondaryActions={[
        {
          content: "Refresh",
          icon: RefreshIcon,
          onAction: handleRefresh,
          loading: isRefreshing,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          {/* Key Metrics - Following 60-30-10 rule */}
          <BlockStack gap="500">
            <Grid>
              {/* Primary Metrics (60% visual weight) */}
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Icon source={PersonIcon} tone="base" />
                        {data.metrics.customersWithTiers > 0 && (
                          <Badge tone="success">
                            {`${Math.round((data.metrics.customersWithTiers / data.metrics.totalCustomers) * 100)}% in tiers`}
                          </Badge>
                        )}
                      </InlineStack>
                      <BlockStack gap="100">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Total Customers
                        </Text>
                        <Text variant="heading2xl" as="h3">
                          {data.metrics.totalCustomers}
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Icon source={CashDollarIcon} tone="success" />
                        {data.metrics.customersWithCredit > 0 && (
                          <Badge tone="info">
                            {`${data.metrics.customersWithCredit} active`}
                          </Badge>
                        )}
                      </InlineStack>
                      <BlockStack gap="100">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Total Store Credit
                        </Text>
                        <Text variant="heading2xl" as="h3">
                          {formatAmount(data.metrics.totalStoreCredit)}
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              {/* Secondary Metrics (30% visual weight) */}
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {data.tierDistribution.slice(0, 3).map(tier => {
                          if (tier.name === "No Tier") return null;
                          const style = getTierStyle(tier.name);
                          return (
                            <Icon key={tier.id} source={style.icon} tone="base" />
                          );
                        })}
                      </div>
                      <BlockStack gap="100">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Active Tiers
                        </Text>
                        <Text variant="heading2xl" as="h3">
                          {data.metrics.activeTiers}
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <Icon source={ChartVerticalIcon} tone="info" />
                      <BlockStack gap="100">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Average Credit
                        </Text>
                        <Text variant="heading2xl" as="h3">
                          {formatAmount(data.metrics.averageCredit)}
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>
            </Grid>

            {/* Tabbed Content Area */}
            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                {/* Overview Tab */}
                {selectedTab === 0 && (
                  <Box padding="400">
                    <BlockStack gap="500">
                      {/* Tier Distribution */}
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Tier Distribution
                        </Text>
                        {data.tierDistribution.length > 0 ? (
                          <BlockStack gap="300">
                            {sortTiersByPriority(data.tierDistribution).map((tier) => (
                              <BlockStack key={tier.id} gap="200">
                                <InlineStack align="space-between">
                                  <InlineStack gap="300" align="start">
                                    {tier.name === "No Tier" ? (
                                      <Icon source={AlertTriangleIcon} tone="caution" />
                                    ) : (
                                      <TierIndicator tierName={tier.name} showLabel={false} />
                                    )}
                                    <BlockStack gap="100">
                                      <InlineStack gap="200" align="start">
                                        {tier.name === "No Tier" ? (
                                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                                            {tier.name}
                                          </Text>
                                        ) : (
                                          <TierBadge
                                            tierName={tier.name}
                                            size="small"
                                            showIcon={false}
                                            cashbackPercent={tier.cashbackPercent}
                                          />
                                        )}
                                      </InlineStack>
                                      <Text variant="bodySm" tone="subdued" as="p">
                                        {tier.count} customers • {formatAmount(tier.totalCredit)} total credit
                                      </Text>
                                    </BlockStack>
                                  </InlineStack>
                                  <Text variant="bodyLg" fontWeight="semibold" as="p">
                                    {tier.percentage.toFixed(1)}%
                                  </Text>
                                </InlineStack>
                                <ProgressBar
                                  progress={tier.percentage}
                                  size="small"
                                  tone={tier.name === "No Tier" ? "critical" : "success"}
                                />
                              </BlockStack>
                            ))}
                          </BlockStack>
                        ) : (
                          <EmptyState
                            heading="No tier data yet"
                            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                          >
                            <p>Tier distribution will appear here once you have customers.</p>
                          </EmptyState>
                        )}
                      </BlockStack>

                      <Divider />

                      {/* Top Customers */}
                      {data.topCustomers.length > 0 && (
                        <BlockStack gap="400">
                          <Text variant="headingMd" as="h2">
                            Top Customers by Credit
                          </Text>
                          <DataTable
                            columnContentTypes={["text", "text", "numeric"]}
                            headings={["Customer", "Tier", "Store Credit"]}
                            rows={data.topCustomers.map(customer => [
                              customer.email,
                              customer.tierName ? (
                                <TierBadge
                                  tierName={customer.tierName}
                                  size="small"
                                  showIcon={true}
                                />
                              ) : (
                                <Badge tone="new">No Tier</Badge>
                              ),
                              formatAmount(customer.storeCredit),
                            ])}
                          />
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Box>
                )}

                {/* Recent Activity Tab */}
                {selectedTab === 1 && (
                  <Box padding="400">
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">
                        Recent Transactions
                      </Text>
                      {data.recentTransactions.length > 0 ? (
                        <DataTable
                          columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                          headings={["Customer", "Type", "Amount", "Balance", "Date"]}
                          rows={data.recentTransactions.slice(0, 10).map(tx => [
                            tx.customerEmail,
                            tx.type.replace(/_/g, ' ').toLowerCase(),
                            formatAmount(tx.amount),
                            formatAmount(tx.balance),
                            tx.createdAt,
                          ])}
                        />
                      ) : (
                        <EmptyState
                          heading="No transactions yet"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>Transactions will appear here when customers earn or use store credit.</p>
                        </EmptyState>
                      )}
                    </BlockStack>
                  </Box>
                )}

                {/* Insights Tab */}
                {selectedTab === 2 && (
                  <Box padding="400">
                    <BlockStack gap="500">
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Key Insights
                        </Text>
                        
                        {/* Insights Cards */}
                        <BlockStack gap="300">
                          {data.metrics.customersWithTiers < data.metrics.totalCustomers * 0.5 && (
                            <Banner
                              title="Opportunity: Increase tier participation"
                              tone="info"
                              action={{ content: "View customers", url: "/app/customers" }}
                            >
                              <p>Only {Math.round((data.metrics.customersWithTiers / data.metrics.totalCustomers) * 100)}% of your customers are in a tier. Consider reviewing tier thresholds or running a campaign.</p>
                            </Banner>
                          )}

                          {data.metrics.averageCredit > 50 && (
                            <Banner
                              title="High average credit balance"
                              tone="success"
                            >
                              <p>Your customers have an average of {formatAmount(data.metrics.averageCredit)} in store credit. This indicates strong engagement with your rewards program.</p>
                            </Banner>
                          )}

                          {data.tierDistribution.find(t => t.name === "No Tier" && t.percentage > 30) && (
                            <Banner
                              title="Many customers without tiers"
                              tone="warning"
                              action={{ content: "Manage tiers", url: "/app/tiers" }}
                            >
                              <p>{data.tierDistribution.find(t => t.name === "No Tier")?.percentage.toFixed(0)}% of customers aren't in a tier. Consider adjusting your tier requirements.</p>
                            </Banner>
                          )}
                        </BlockStack>
                      </BlockStack>

                      <Divider />

                      {/* Program Statistics */}
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Program Statistics
                        </Text>
                        <Grid>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                            <Card>
                              <Box padding="300">
                                <BlockStack gap="200">
                                  <Text variant="bodySm" tone="subdued" as="p">
                                    Tier Participation Rate
                                  </Text>
                                  <Text variant="headingLg" as="h3">
                                    {Math.round((data.metrics.customersWithTiers / data.metrics.totalCustomers) * 100)}%
                                  </Text>
                                  <ProgressBar 
                                    progress={(data.metrics.customersWithTiers / data.metrics.totalCustomers) * 100}
                                    size="small"
                                  />
                                </BlockStack>
                              </Box>
                            </Card>
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                            <Card>
                              <Box padding="300">
                                <BlockStack gap="200">
                                  <Text variant="bodySm" tone="subdued" as="p">
                                    Credit Utilization Rate
                                  </Text>
                                  <Text variant="headingLg" as="h3">
                                    {Math.round((data.metrics.customersWithCredit / data.metrics.totalCustomers) * 100)}%
                                  </Text>
                                  <ProgressBar 
                                    progress={(data.metrics.customersWithCredit / data.metrics.totalCustomers) * 100}
                                    size="small"
                                  />
                                </BlockStack>
                              </Box>
                            </Card>
                          </Grid.Cell>
                        </Grid>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                )}
              </Tabs>
            </Card>

            {/* Quick Actions - Following visual hierarchy */}
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {['Diamond', 'Gold', 'Silver'].map(tierName => {
                          const style = getTierStyle(tierName);
                          return (
                            <Icon key={tierName} source={style.icon} tone="base" />
                          );
                        })}
                      </div>
                      <Text variant="headingMd" as="h3">
                        Manage Tiers
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        Create and configure loyalty tiers with cashback percentages
                      </Text>
                      <Button url="/app/tiers" fullWidth>
                        Go to Tiers
                      </Button>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Icon source={PersonIcon} tone="base" />
                      <Text variant="headingMd" as="h3">
                        View Customers
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        Manage customer tiers, view balances, and adjust credits
                      </Text>
                      <Button url="/app/customers" fullWidth>
                        Go to Customers
                      </Button>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Icon source={SettingsIcon} tone="base" />
                      <Text variant="headingMd" as="h3">
                        Settings
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        Configure store settings, currency, and preferences
                      </Text>
                      <Button url="/app/settings" fullWidth>
                        Go to Settings
                      </Button>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}