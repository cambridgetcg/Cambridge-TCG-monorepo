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
  Box,
  Badge,
  Button,
  Grid,
  Divider,
  Tabs,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import {
  ChartVerticalFilledIcon,
  PersonIcon,
  CashDollarIcon,
  ChartLineIcon,
  ExportIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getEntitlements } from "../services/entitlements.server";
import { formatCurrency } from "../utils/currency";
import { analytics } from "../services/analytics/aggregator.service";
import { ClientOnly } from "../components/charts/ClientOnly";
import { ChartContainer } from "../components/charts/ChartContainer";
import { LineChartVisx } from "../components/charts/LineChartVisx";
import { BarChartVisx } from "../components/charts/BarChartVisx";
import { useRealtimeMetrics } from "../hooks/useRealtimeMetrics";
import { useState, useCallback } from "react";

interface LoaderData {
  analytics: {
    totalRevenue: number;
    totalCashback: number;
    totalCustomers: number;
    activeCustomers: number;
    avgOrderValue: number;
    conversionRate: number;
  };
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  revenueData: Array<{ day: string; revenue: number }>;
  tierDistribution: Array<{ tier: string; customers: number }>;
  cashbackData: Array<{ day: string; cashback_earned: number; cashback_used: number }>;
  orderTrends: Array<{ day: string; order_count: number; avg_order_value: number }>;
  topCustomers: Array<{ customer_id: string; email: string; total_spent: number; tier: string }>;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Rate-based model: All plans have access to analytics
  // Historical data is limited by plan via maxHistoricalDays limit

  // Get shop settings and entitlements in parallel
  const [shopSettings, entitlements] = await Promise.all([
    prisma.shopSettings.findUnique({
      where: { shop: session.shop },
    }).catch(() => null),
    getEntitlements(session.shop),
  ]);

  // Enforce historical days limit based on plan
  // Free: 7 days, Pro: 30 days, Max: 90 days, Ultra: unlimited (999999)
  const maxHistoricalDays = entitlements.limitMaxHistoricalDays || 7;
  const requestedDays = 30; // Default request
  const allowedDays = Math.min(requestedDays, maxHistoricalDays);

  // Date range (limited by plan's maxHistoricalDays)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - allowedDays);
  const range = { start: startDate, end: endDate };

  // Fetch analytics data in parallel
  const [revenueData, tierDistribution, customerMetrics, cashbackData, orderTrends, topCustomers] = await Promise.all([
    analytics.getRevenueMetrics(session.shop, range).catch(() => []),
    analytics.getTierDistribution(session.shop).catch(() => []),
    analytics.getCustomerMetrics(session.shop, range).catch(() => ({ total: 0, active_30d: 0 })),
    analytics.getCashbackMetrics(session.shop, range).catch(() => []),
    analytics.getOrderTrends(session.shop, range).catch(() => []),
    analytics.getTopCustomers(session.shop, 5).catch(() => []),
  ]);

  // Calculate aggregate metrics
  const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
  const totalCashback = cashbackData.reduce((sum, d) => sum + d.cashback_earned, 0);
  const avgOrderValue = orderTrends.length > 0
    ? orderTrends.reduce((sum, d) => sum + d.avg_order_value, 0) / orderTrends.length
    : 0;

  const analyticsData = {
    totalRevenue,
    totalCashback,
    totalCustomers: customerMetrics.total || 0,
    activeCustomers: customerMetrics.active_30d || 0,
    avgOrderValue,
    conversionRate: customerMetrics.total > 0 ? (customerMetrics.active_30d / customerMetrics.total) * 100 : 0,
  };

  return json({
    analytics: analyticsData,
    shopSettings,
    revenueData,
    tierDistribution,
    cashbackData,
    orderTrends,
    topCustomers,
  });
};

function MetricCard({ title, value, trend, icon }: any) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text variant="headingSm" as="h3" tone="subdued">{title}</Text>
            {icon && <div style={{ color: '#637381' }}>{icon}</div>}
          </InlineStack>
          <Text variant="heading2xl" as="p">{value}</Text>
          {trend && (
            <Badge tone={trend > 0 ? 'success' : 'critical'} children={`${trend > 0 ? '+' : ''}${trend}%`} />
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

function RevenueChart({ data }: { data: Array<{ day: string; revenue: number }> }) {
  return (
    <ChartContainer height={260}>
      {({ width, height }) => (
        <LineChartVisx data={data} xKey="day" yKey="revenue" height={height} />
      )}
    </ChartContainer>
  );
}

function TierDistributionChart({ data }: { data: Array<{ tier: string; customers: number }> }) {
  return (
    <ChartContainer height={260}>
      {({ width, height }) => (
        <BarChartVisx data={data} xKey="tier" yKey="customers" height={height} />
      )}
    </ChartContainer>
  );
}

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>() as unknown as LoaderData;
  const [selectedTab, setSelectedTab] = useState(0);

  // Real-time metrics (optional)
  const realtimeData = useRealtimeMetrics('/app/analytics/realtime');

  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  const tabs = [
    { id: 'overview', content: 'Overview' },
    { id: 'revenue', content: 'Revenue' },
    { id: 'customers', content: 'Customers' },
    { id: 'cashback', content: 'Cashback' },
  ];

  return (
    <Page
      title="Analytics Dashboard"
      subtitle="Track your loyalty program performance"
      primaryAction={{
        content: 'Export CSV',
        icon: ExportIcon,
        url: '/app/analytics/export/csv',
      }}
      secondaryActions={[
        {
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => window.location.reload(),
        },
      ]}
    >
      <Layout>
        {/* Key Metrics */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Total Revenue"
                value={formatAmount(data.analytics.totalRevenue)}
                trend={12}
                icon={<CashDollarIcon />}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Active Customers"
                value={`${data.analytics.activeCustomers}/${data.analytics.totalCustomers}`}
                trend={8}
                icon={<PersonIcon />}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Total Cashback"
                value={formatAmount(data.analytics.totalCashback)}
                icon={<ChartLineIcon />}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Avg Order Value"
                value={formatAmount(data.analytics.avgOrderValue)}
                trend={5}
                icon={<ChartVerticalFilledIcon />}
              />
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Real-time Indicator */}
        {realtimeData && (
          <Layout.Section>
            <Card>
              <Box padding="400">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3">Live Updates</Text>
                  <InlineStack gap="400">
                    <Badge tone="success" children={`Today's Revenue: ${formatAmount(realtimeData.todayRevenue || 0)}`} />
                    <Badge tone="info" children={`Today's Cashback: ${formatAmount(realtimeData.todayCashback || 0)}`} />
                  </InlineStack>
                </InlineStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {/* Tabbed Content */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* Overview Tab */}
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    {/* Revenue Chart */}
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Revenue Trend (Last 30 Days)</Text>
                      <ClientOnly>
                        <RevenueChart data={data.revenueData} />
                      </ClientOnly>
                    </BlockStack>

                    <Divider />

                    {/* Tier Distribution */}
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Tier Distribution</Text>
                      <ClientOnly>
                        <TierDistributionChart data={data.tierDistribution} />
                      </ClientOnly>
                    </BlockStack>
                  </BlockStack>
                </Box>
              )}

              {/* Revenue Tab */}
              {selectedTab === 1 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Revenue Analytics</Text>
                    {data.orderTrends.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'numeric', 'numeric']}
                        headings={['Date', 'Orders', 'Avg Value']}
                        rows={data.orderTrends.slice(0, 10).map(row => [
                          new Date(row.day).toLocaleDateString(),
                          row.order_count.toString(),
                          formatAmount(row.avg_order_value),
                        ])}
                      />
                    ) : (
                      <EmptyState
                        heading="No revenue data yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Revenue data will appear here once you have orders.</p>
                      </EmptyState>
                    )}
                  </BlockStack>
                </Box>
              )}

              {/* Customers Tab */}
              {selectedTab === 2 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Top Customers</Text>
                    {data.topCustomers.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'numeric', 'text']}
                        headings={['Email', 'Customer ID', 'Total Spent', 'Tier']}
                        rows={data.topCustomers.map(customer => [
                          customer.email,
                          customer.customer_id.slice(0, 8) + '...',
                          formatAmount(customer.total_spent),
                          customer.tier || 'No Tier',
                        ])}
                      />
                    ) : (
                      <EmptyState
                        heading="No customer data yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Customer analytics will appear here once you have data.</p>
                      </EmptyState>
                    )}
                  </BlockStack>
                </Box>
              )}

              {/* Cashback Tab */}
              {selectedTab === 3 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Cashback Analytics</Text>
                    {data.cashbackData.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'numeric', 'numeric']}
                        headings={['Date', 'Earned', 'Used']}
                        rows={data.cashbackData.slice(0, 10).map(row => [
                          new Date(row.day).toLocaleDateString(),
                          formatAmount(row.cashback_earned),
                          formatAmount(row.cashback_used),
                        ])}
                      />
                    ) : (
                      <EmptyState
                        heading="No cashback data yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Cashback data will appear here once customers earn rewards.</p>
                      </EmptyState>
                    )}
                  </BlockStack>
                </Box>
              )}
            </Tabs>
          </Card>
        </Layout.Section>

        {/* Export Actions */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <InlineStack align="space-between">
                <Text variant="headingSm" as="h3">Data Export</Text>
                <InlineStack gap="200">
                  <Button url="/app/analytics/export/csv">Export CSV</Button>
                  <Button url="/app/analytics/export/pdf?month=2025-01">Export Monthly PDF</Button>
                </InlineStack>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}