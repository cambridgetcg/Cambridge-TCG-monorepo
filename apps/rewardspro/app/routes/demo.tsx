// Demo route to view Polaris components without authentication
import { json } from "@remix-run/node";
import { useLoaderData, Link, Outlet, useLocation } from "@remix-run/react";
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
  EmptyState,
  InlineGrid,
  AppProvider,
  Frame,
  Navigation,
  TopBar,
} from "@shopify/polaris";
import {
  StarFilledIcon,
  PersonFilledIcon,
  CashDollarFilledIcon,
  TipJarIcon,
  SettingsIcon,
  BillFilledIcon,
  ArrowUpIcon,
  HomeFilledIcon,
  PersonIcon,
  ChartVerticalFilledIcon,
} from "@shopify/polaris-icons";
import "@shopify/polaris/build/esm/styles.css";

export const loader = async () => {
  // Mock data for demo
  const mockData = {
    metrics: {
      totalCustomers: 0,
      customersChange: 0,
      totalRewards: 0,
      rewardsChange: 12,
      activeTiers: 2,
      averageCashback: 4,
    },
    tierDistribution: [
      { name: "Bronze", customerCount: 0, percentage: 0 },
      { name: "Silver", customerCount: 0, percentage: 0 },
    ],
    recentActivity: [],
  };
  
  return json(mockData);
};

// Simplified metric card component
function MetricCard({ 
  title, 
  value, 
  change, 
  icon, 
  tone = "base" 
}: {
  title: string;
  value: string | number;
  change?: string;
  icon: any;
  tone?: "base" | "success" | "warning";
}) {
  return (
    <Card>
      <Box paddingBlockStart="200" paddingBlockEnd="200" paddingInlineStart="400" paddingInlineEnd="400">
        <BlockStack gap="200">
          <InlineStack align="space-between">
            <Text variant="bodySm" tone="subdued" as="p">
              {title}
            </Text>
            <Icon source={icon} tone={tone} />
          </InlineStack>
          <Text variant="headingLg" as="h3">
            {value}
          </Text>
          {change && (
            <InlineStack gap="100" blockAlign="center">
              <Icon source={ArrowUpIcon} tone="success" />
              <Text variant="bodySm" tone="subdued" as="p">
                {change}
              </Text>
            </InlineStack>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function DemoPage() {
  const { metrics, tierDistribution } = useLoaderData<typeof loader>();
  const location = useLocation();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  // Navigation items
  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={[
          {
            url: '/demo',
            label: 'Dashboard',
            icon: HomeFilledIcon,
            selected: location.pathname === '/demo',
          },
          {
            url: '/demo/customers',
            label: 'Customers',
            icon: PersonIcon,
            selected: location.pathname === '/demo/customers',
          },
          {
            url: '/demo/tiers',
            label: 'Loyalty Tiers',
            icon: StarFilledIcon,
            selected: location.pathname === '/demo/tiers',
          },
          {
            url: '/demo/analytics',
            label: 'Analytics',
            icon: ChartVerticalFilledIcon,
            selected: location.pathname === '/demo/analytics',
          },
          {
            url: '/demo/settings',
            label: 'Settings',
            icon: SettingsIcon,
            selected: location.pathname === '/demo/settings',
          },
          {
            url: '/demo/billing',
            label: 'Billing',
            icon: BillFilledIcon,
            selected: location.pathname === '/demo/billing',
          },
        ]}
      />
    </Navigation>
  );

  // TopBar component
  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      userMenu={
        <TopBar.UserMenu
          name="Demo Store"
          detail="demo@example.com"
          initials="DS"
        />
      }
    />
  );

  // Check if we're on a sub-route
  const isSubRoute = location.pathname !== '/demo';
  
  return (
    <AppProvider i18n={{}}>
      <Frame
        navigation={navigationMarkup}
        topBar={topBarMarkup}
      >
        {isSubRoute ? (
          <Outlet />
        ) : (
          <Page title="Dashboard Demo (Local Preview)">
            <Box paddingBlockEnd="2000">
            <Layout>
              {/* Notice Banner */}
              <Layout.Section>
                <Card>
                  <Box padding="400" background="bg-surface-warning">
                    <BlockStack gap="200">
                      <Text variant="bodyMd" as="p">
                        ⚠️ This is a demo page showing Polaris components locally. In production, this runs inside Shopify Admin.
                      </Text>
                      <Text variant="bodySm" as="p">
                        Use the navigation menu on the left to explore different pages with Polaris components.
                      </Text>
                    </BlockStack>
                  </Box>
                </Card>
              </Layout.Section>

              {/* Key Metrics */}
              <Layout.Section>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Overview</Text>
                  <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                    <MetricCard
                      title="Total Customers"
                      value={metrics.totalCustomers}
                      change={metrics.customersChange > 0 ? `+${metrics.customersChange} this month` : undefined}
                      icon={PersonFilledIcon}
                    />
                    <MetricCard
                      title="Rewards Distributed"
                      value={formatCurrency(metrics.totalRewards)}
                      change={`+${metrics.rewardsChange}% vs last month`}
                      icon={CashDollarFilledIcon}
                    />
                    <MetricCard
                      title="Active Tiers"
                      value={metrics.activeTiers}
                      icon={StarFilledIcon}
                      tone="success"
                    />
                    <MetricCard
                      title="Avg. Cashback"
                      value={`${metrics.averageCashback}%`}
                      icon={TipJarIcon}
                    />
                  </InlineGrid>
                </BlockStack>
              </Layout.Section>

              {/* Quick Actions & Tier Distribution */}
              <Layout.Section>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                  {/* Quick Actions */}
                  <Card>
                    <BlockStack gap="400">
                      <Box paddingBlockStart="400" paddingInlineStart="400" paddingInlineEnd="400">
                        <Text variant="headingMd" as="h3">Quick Actions</Text>
                      </Box>
                      <Box paddingBlockEnd="400" paddingInlineStart="400" paddingInlineEnd="400">
                        <BlockStack gap="300">
                          <Link to="/demo/tiers">
                            <Button fullWidth icon={StarFilledIcon}>
                              Manage Tiers
                            </Button>
                          </Link>
                          <Link to="/demo/customers">
                            <Button fullWidth icon={PersonFilledIcon}>
                              View Customers
                            </Button>
                          </Link>
                          <Link to="/demo/settings">
                            <Button fullWidth icon={SettingsIcon}>
                              Settings
                            </Button>
                          </Link>
                          <Link to="/demo/billing">
                            <Button fullWidth icon={BillFilledIcon}>
                              Billing
                            </Button>
                          </Link>
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </Card>

                  {/* Tier Distribution */}
                  <Card>
                    <BlockStack gap="400">
                      <Box paddingBlockStart="400" paddingInlineStart="400" paddingInlineEnd="400">
                        <InlineStack align="space-between">
                          <Text variant="headingMd" as="h3">Tier Distribution</Text>
                          <Link to="/demo/tiers">
                            <Button variant="plain" size="slim">Manage</Button>
                          </Link>
                        </InlineStack>
                      </Box>
                      <Box paddingBlockEnd="400" paddingInlineStart="400" paddingInlineEnd="400">
                        <BlockStack gap="300">
                          {tierDistribution.map((tier) => (
                            <Box key={tier.name}>
                              <BlockStack gap="100">
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                                    {tier.name}
                                  </Text>
                                  <InlineStack gap="200">
                                    <Text variant="bodyMd" tone="subdued" as="span">
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
                      </Box>
                    </BlockStack>
                  </Card>
                </InlineGrid>
              </Layout.Section>

              {/* Recent Activity */}
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Box paddingBlockStart="400" paddingInlineStart="400" paddingInlineEnd="400">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h3">Recent Activity</Text>
                        <Badge tone="info">No activity</Badge>
                      </InlineStack>
                    </Box>
                    <Box paddingBlockEnd="400" paddingInlineStart="400" paddingInlineEnd="400">
                      <EmptyState
                        heading="No activity yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Activity will appear here once customers start earning rewards.</p>
                      </EmptyState>
                    </Box>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
            </Box>
          </Page>
        )}
      </Frame>
    </AppProvider>
  );
}