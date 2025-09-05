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
  Select,
  DatePicker,
  Button,
  InlineGrid,
  ProgressBar,
  Badge,
} from "@shopify/polaris";
import { CalendarIcon, ExportIcon } from "@shopify/polaris-icons";
import { useState } from "react";

export const loader = async () => {
  // Mock analytics data
  const analytics = {
    overview: {
      totalRevenue: 45250.00,
      rewardsDistributed: 2262.50,
      activeCustomers: 452,
      averageOrderValue: 125.30,
      conversionRate: 3.2,
      repeatPurchaseRate: 28.5,
    },
    rewardMetrics: {
      totalCashback: 2262.50,
      pendingRewards: 450.00,
      redeemedRewards: 1812.50,
      averageRewardPerCustomer: 5.01,
    },
    tierPerformance: [
      { tier: "Bronze", customers: 245, revenue: 12250, avgSpend: 50 },
      { tier: "Silver", customers: 128, revenue: 18560, avgSpend: 145 },
      { tier: "Gold", customers: 67, revenue: 11055, avgSpend: 165 },
      { tier: "Platinum", customers: 12, revenue: 3385, avgSpend: 282 },
    ],
    monthlyTrends: [
      { month: "Jan", revenue: 3850, rewards: 192 },
      { month: "Feb", revenue: 4200, rewards: 210 },
      { month: "Mar", revenue: 4500, rewards: 225 },
      { month: "Apr", revenue: 3900, rewards: 195 },
      { month: "May", revenue: 4100, rewards: 205 },
      { month: "Jun", revenue: 4700, rewards: 235 },
    ],
  };

  return json({ analytics });
};

function MetricCard({ title, value, subtitle, trend }: any) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          <Text variant="bodySm" tone="subdued">{title}</Text>
          <Text variant="headingLg">{value}</Text>
          {subtitle && (
            <InlineStack gap="100">
              <Text variant="bodySm" tone="subdued">{subtitle}</Text>
              {trend && <Badge tone={trend > 0 ? "success" : "critical"}>{trend > 0 ? `+${trend}%` : `${trend}%`}</Badge>}
            </InlineStack>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function DemoAnalyticsPage() {
  const { analytics } = useLoaderData<typeof loader>();
  const [selectedPeriod, setSelectedPeriod] = useState("30days");

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <Page
      title="Analytics"
      primaryAction={
        <Button icon={ExportIcon}>Export Report</Button>
      }
    >
      <Box paddingBlockEnd="2000">
      <Layout>
        {/* Date Range Selector */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <InlineStack gap="300" align="end">
                <Select
                  label="Time Period"
                  options={[
                    { label: "Last 7 days", value: "7days" },
                    { label: "Last 30 days", value: "30days" },
                    { label: "Last 90 days", value: "90days" },
                    { label: "Last year", value: "year" },
                    { label: "Custom range", value: "custom" },
                  ]}
                  value={selectedPeriod}
                  onChange={setSelectedPeriod}
                />
                {selectedPeriod === "custom" && (
                  <Button icon={CalendarIcon}>Select dates</Button>
                )}
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Key Metrics */}
        <Layout.Section>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Performance Overview</Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
              <MetricCard
                title="Total Revenue"
                value={formatCurrency(analytics.overview.totalRevenue)}
                subtitle="From loyalty members"
                trend={12}
              />
              <MetricCard
                title="Rewards Distributed"
                value={formatCurrency(analytics.overview.rewardsDistributed)}
                subtitle="5% of revenue"
                trend={8}
              />
              <MetricCard
                title="Active Customers"
                value={analytics.overview.activeCustomers}
                subtitle="In loyalty program"
                trend={15}
              />
              <MetricCard
                title="Avg Order Value"
                value={formatCurrency(analytics.overview.averageOrderValue)}
                subtitle="Loyalty members"
                trend={5}
              />
              <MetricCard
                title="Conversion Rate"
                value={`${analytics.overview.conversionRate}%`}
                subtitle="Visitor to customer"
                trend={-2}
              />
              <MetricCard
                title="Repeat Purchase Rate"
                value={`${analytics.overview.repeatPurchaseRate}%`}
                subtitle="Within 60 days"
                trend={10}
              />
            </InlineGrid>
          </BlockStack>
        </Layout.Section>

        {/* Tier Performance */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Tier Performance</Text>
                <BlockStack gap="300">
                  {analytics.tierPerformance.map((tier) => (
                    <Box key={tier.tier} padding="200" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text variant="bodyMd" fontWeight="semibold">{tier.tier}</Text>
                          <Badge>{tier.customers} customers</Badge>
                        </InlineStack>
                        <InlineStack gap="400">
                          <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued">Revenue</Text>
                            <Text variant="bodyMd">{formatCurrency(tier.revenue)}</Text>
                          </BlockStack>
                          <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued">Avg Spend</Text>
                            <Text variant="bodyMd">{formatCurrency(tier.avgSpend)}</Text>
                          </BlockStack>
                        </InlineStack>
                        <ProgressBar
                          progress={(tier.revenue / analytics.overview.totalRevenue) * 100}
                          size="small"
                          tone="success"
                        />
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Rewards Metrics */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Rewards Summary</Text>
                <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Total Cashback</Text>
                    <Text variant="headingMd">{formatCurrency(analytics.rewardMetrics.totalCashback)}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Pending</Text>
                    <Text variant="headingMd">{formatCurrency(analytics.rewardMetrics.pendingRewards)}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Redeemed</Text>
                    <Text variant="headingMd">{formatCurrency(analytics.rewardMetrics.redeemedRewards)}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Avg per Customer</Text>
                    <Text variant="headingMd">{formatCurrency(analytics.rewardMetrics.averageRewardPerCustomer)}</Text>
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
      </Box>
    </Page>
  );
}