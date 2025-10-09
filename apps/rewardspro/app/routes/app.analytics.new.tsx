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
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { analytics } from "../services/analytics/aggregator.service";
import { ClientOnly } from "../components/charts/ClientOnly";
import { ChartContainer } from "../components/charts/ChartContainer";
import { LineChartVisx } from "../components/charts/LineChartVisx";
import { BarChartVisx } from "../components/charts/BarChartVisx";
import { useRealtimeMetrics } from "../hooks/useRealtimeMetrics";
import { useState, useCallback, useMemo, type ReactNode } from "react";

interface LoaderData {
  analytics: {
    totalRevenue: number;
    totalCashback: number;
    totalCustomers: number;
    activeCustomers: number;
    avgOrderValue: number;
    conversionRate: number;
  };
  retention: {
    crr: number;
    counts: { cs: number; ce: number; cn: number; retained: number };
    rpr: number;
    purchaseFrequency: number;
    repeatCustomers: number;
    uniqueCustomers: number;
    totalOrders: number;
  };
  redemption: {
    issued: number;
    redeemed: number;
    rate: number;
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

  // Get shop settings
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop: session.shop },
  }).catch(() => null);

  // Date range (last 30 days by default)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const range = { start: startDate, end: endDate };

  // Fetch analytics data in parallel
  const [
    revenueData,
    tierDistribution,
    customerMetrics,
    cashbackData,
    orderTrends,
    topCustomers,
    retentionMetrics,
    redemptionSummary,
  ] = await Promise.all([
    analytics.getRevenueMetrics(session.shop, range).catch(() => [] as Array<{ day: string; revenue: number }>),
    analytics.getTierDistribution(session.shop).catch(() => [] as Array<{ tier: string; customers: number }>),
    analytics.getCustomerMetrics(session.shop, range).catch(() => ({ total: 0, active_30d: 0 })),
    analytics.getCashbackMetrics(session.shop, range).catch(() => [] as Array<{ day: string; cashback_earned: number; cashback_used: number }>),
    analytics.getOrderTrends(session.shop, range).catch(() => [] as Array<{ day: string; order_count: number; avg_order_value: number }>),
    analytics.getTopCustomers(session.shop, 5).catch(() => [] as Array<{ customer_id: string; email: string; total_spent: number; tier: string }>),
    analytics.getRetentionMetrics(session.shop, range).catch(() => null),
    analytics.getRedemptionSummary(session.shop, range).catch(() => ({ issued: 0, redeemed: 0 })),
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
    retention: retentionMetrics
      ? {
          crr: retentionMetrics.crr,
          counts: retentionMetrics.counts,
          rpr: retentionMetrics.rpr,
          purchaseFrequency: retentionMetrics.purchaseFrequency,
          repeatCustomers: retentionMetrics.repeatCustomers,
          uniqueCustomers: retentionMetrics.uniqueCustomers,
          totalOrders: retentionMetrics.totalOrders,
        }
      : {
          crr: 0,
          counts: { cs: 0, ce: 0, cn: 0, retained: 0 },
          rpr: 0,
          purchaseFrequency: 0,
          repeatCustomers: 0,
          uniqueCustomers: 0,
          totalOrders: 0,
        },
    redemption: {
      issued: redemptionSummary?.issued || 0,
      redeemed: redemptionSummary?.redeemed || 0,
      rate:
        redemptionSummary && redemptionSummary.issued > 0
          ? (redemptionSummary.redeemed / redemptionSummary.issued) * 100
          : 0,
    },
    shopSettings,
    revenueData,
    tierDistribution,
    cashbackData,
    orderTrends,
    topCustomers,
  });
};

function MetricCard({
  title,
  value,
  trendPercent,
  badgeText,
  icon,
}: {
  title: string;
  value: string;
  trendPercent?: number;
  badgeText?: string;
  icon?: ReactNode;
}) {
  const roundedTrend =
    trendPercent !== undefined && Number.isFinite(trendPercent)
      ? Math.round(trendPercent * 10) / 10
      : undefined;
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text variant="headingSm" as="h3" tone="subdued">{title}</Text>
            {icon && <div style={{ color: '#637381' }}>{icon}</div>}
          </InlineStack>
          <Text variant="heading2xl" as="p">{value}</Text>
          {badgeText && (
            <Badge tone="info">{badgeText}</Badge>
          )}
          {roundedTrend !== undefined && (
            <Badge tone={roundedTrend >= 0 ? 'success' : 'critical'}>
              {`${roundedTrend >= 0 ? '+' : ''}${roundedTrend}%`}
            </Badge>
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
  const data = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);

  // Real-time metrics (optional)
  const realtimeData = useRealtimeMetrics('/app/analytics/realtime');

  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);
  const formatPercentValue = useCallback((value: number) => `${value.toFixed(1)}%`, []);
  const formatNumberValue = useCallback((value: number) => new Intl.NumberFormat().format(value), []);

  const revenueTrend = useMemo(
    () => calculatePercentChange(data.revenueData.map((d) => d.revenue)),
    [data.revenueData]
  );
  const cashbackTrend = useMemo(
    () => calculatePercentChange(data.cashbackData.map((d) => d.cashback_earned)),
    [data.cashbackData]
  );
  const avgOrderTrend = useMemo(
    () => calculatePercentChange(data.orderTrends.map((d) => d.avg_order_value)),
    [data.orderTrends]
  );
  const activePct = useMemo(() => {
    if (!data.analytics.totalCustomers) return undefined;
    return Math.round((data.analytics.activeCustomers / data.analytics.totalCustomers) * 100);
  }, [data.analytics.activeCustomers, data.analytics.totalCustomers]);

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
                trendPercent={revenueTrend}
                icon={<CashDollarIcon />}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Active Customers"
                value={`${data.analytics.activeCustomers}/${data.analytics.totalCustomers}`}
                badgeText={activePct !== undefined ? `${activePct}% active` : undefined}
                icon={<PersonIcon />}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Total Cashback"
                value={formatAmount(data.analytics.totalCashback)}
                trendPercent={cashbackTrend}
                icon={<ChartLineIcon />}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Avg Order Value"
                value={formatAmount(data.analytics.avgOrderValue)}
                trendPercent={avgOrderTrend}
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
                    <Badge tone="success">
                      {`Today's Revenue: ${formatAmount(realtimeData.todayRevenue || 0)}`}
                    </Badge>
                    <Badge tone="info">
                      {`Today's Cashback: ${formatAmount(realtimeData.todayCashback || 0)}`}
                    </Badge>
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
                      {data.tierDistribution.length > 0 ? (
                        <ClientOnly>
                          <TierDistributionChart data={data.tierDistribution} />
                        </ClientOnly>
                      ) : (
                        <EmptyState
                          heading="No tier data yet"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>When customers join tiers, their distribution will appear here.</p>
                        </EmptyState>
                      )}
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Retention & Engagement</Text>
                      <Grid>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                          <MetricCard
                            title="Retention Rate (CRR)"
                            value={formatPercentValue(data.retention.crr)}
                            badgeText={`${formatNumberValue(data.retention.counts.retained)} of ${formatNumberValue(data.retention.counts.cs)} retained`}
                            icon={<PersonIcon />}
                          />
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                          <MetricCard
                            title="Repeat Purchase Rate"
                            value={formatPercentValue(data.retention.rpr)}
                            badgeText={`${formatNumberValue(data.retention.repeatCustomers)} repeat customers`}
                            icon={<ChartLineIcon />}
                          />
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                          <MetricCard
                            title="Purchase Frequency"
                            value={`${data.retention.purchaseFrequency.toFixed(2)} orders`}
                            badgeText={`${formatNumberValue(data.retention.totalOrders)} orders / ${formatNumberValue(data.retention.uniqueCustomers)} customers`}
                            icon={<ChartVerticalFilledIcon />}
                          />
                        </Grid.Cell>
                      </Grid>
                      <Card>
                        <Box padding="400">
                          <DataTable
                            columnContentTypes={['text', 'numeric']}
                            headings={['Metric', 'Value']}
                            rows={[
                              ['Customers at start', formatNumberValue(data.retention.counts.cs)],
                              ['Customers at end', formatNumberValue(data.retention.counts.ce)],
                              ['New customers', formatNumberValue(data.retention.counts.cn)],
                              ['Retained from start', formatNumberValue(data.retention.counts.retained)],
                              ['Unique customers (orders)', formatNumberValue(data.retention.uniqueCustomers)],
                              ['Repeat customers', formatNumberValue(data.retention.repeatCustomers)],
                              ['Total orders in period', formatNumberValue(data.retention.totalOrders)],
                            ]}
                          />
                        </Box>
                      </Card>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Redemption Performance</Text>
                      <Grid>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                          <MetricCard
                            title="Redemption Rate"
                            value={formatPercentValue(data.redemption.rate)}
                            badgeText={`${formatAmount(data.redemption.redeemed)} used of ${formatAmount(data.redemption.issued)}`}
                            icon={<CashDollarIcon />}
                          />
                        </Grid.Cell>
                      </Grid>
                      <Card>
                        <Box padding="400">
                          <DataTable
                            columnContentTypes={['text', 'numeric']}
                            headings={['Metric', 'Amount']}
                            rows={[
                              ['Rewards issued', formatAmount(data.redemption.issued)],
                              ['Rewards redeemed', formatAmount(data.redemption.redeemed)],
                              ['Redemption rate', formatPercentValue(data.redemption.rate)],
                            ]}
                          />
                        </Box>
                      </Card>
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

function calculatePercentChange(values: number[]): number | undefined {
  if (!values || values.length < 2) return undefined;
  const last = values[values.length - 1];
  let prevIndex = values.length - 2;
  while (prevIndex >= 0 && values[prevIndex] === 0) {
    prevIndex -= 1;
  }
  if (prevIndex < 0) return undefined;
  const prev = values[prevIndex];
  if (prev === 0) return undefined;
  return ((last - prev) / Math.abs(prev)) * 100;
}
