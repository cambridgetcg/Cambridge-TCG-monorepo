import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { json, defer } from "@remix-run/node";
import { useLoaderData, useNavigate, Await, Link } from "@remix-run/react";
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
  CalloutCard,
  EmptyState,
  SkeletonBodyText,
  SkeletonDisplayText,
  InlineGrid,
} from "@shopify/polaris";
import {
  StarFilledIcon,
  PersonFilledIcon,
  CashDollarFilledIcon,
  TipJarIcon,
  SettingsIcon,
  BillFilledIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { Suspense } from "react";
import db from "../db.server";
import { isRouteErrorResponse, useRouteError } from "@remix-run/react";

// Type definitions
interface SetupChecklist {
  tiersCreated: boolean;
  hasCustomers: boolean;
  settingsConfigured: boolean;
  billingActive: boolean;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  amount?: number;
}

// Add caching headers
export const headers: HeadersFunction = () => ({
  "Cache-Control": "private, max-age=0, must-revalidate",
  "CDN-Cache-Control": "private, s-maxage=300, stale-while-revalidate=600",
});

// Helper functions for data fetching
async function calculateMetrics(shop: string) {
  const [customers, tiers, recentLedgerEntries] = await Promise.all([
    db.customer.findMany({
      where: { shop },
      select: {
        id: true,
        currentTierId: true,
        storeCredit: true,
        createdAt: true,
      },
    }).catch(() => []),
    db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
      select: {
        id: true,
        name: true,
        cashbackPercent: true,
      },
    }).catch(() => []),
    db.storeCreditLedger.findMany({
      where: {
        shop,
        type: "CASHBACK_EARNED",
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        amount: true,
      },
    }).catch(() => []),
  ]);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentCustomers = customers.filter(
    (c) => new Date(c.createdAt) > thirtyDaysAgo
  ).length;

  const totalRewards = recentLedgerEntries.reduce(
    (sum, e) => sum + parseFloat(e.amount?.toString() || "0"),
    0
  );

  const averageCashback =
    tiers.length > 0
      ? tiers.reduce((sum, tier) => sum + tier.cashbackPercent, 0) / tiers.length
      : 0;

  // Calculate tier distribution
  const tierMap = new Map<string, { name: string; count: number }>();
  tiers.forEach((tier) => {
    tierMap.set(tier.id, { name: tier.name, count: 0 });
  });

  customers.forEach((customer) => {
    if (customer.currentTierId && tierMap.has(customer.currentTierId)) {
      const tier = tierMap.get(customer.currentTierId)!;
      tier.count++;
    }
  });

  const tierDistribution = Array.from(tierMap.values()).map((tier) => ({
    name: tier.name,
    customerCount: tier.count,
    percentage: customers.length > 0
      ? Math.round((tier.count / customers.length) * 100)
      : 0,
  }));

  return {
    metrics: {
      totalCustomers: customers.length,
      customersChange: recentCustomers,
      totalRewards: Math.round(totalRewards * 100) / 100,
      rewardsChange: 12,
      activeTiers: tiers.length,
      tiersWithCustomers: tierDistribution.filter((t) => t.customerCount > 0).length,
      averageCashback: Math.round(averageCashback * 10) / 10,
    },
    tierDistribution,
  };
}

async function fetchRecentActivity(shop: string): Promise<Activity[]> {
  const recentLedgerEntries = await db.storeCreditLedger
    .findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        metadata: true,
      },
    })
    .catch(() => []);

  const typeLabels: Record<string, string> = {
    CASHBACK_EARNED: "Cashback Earned",
    ORDER_PAYMENT: "Store Credit Used",
    REFUND_CREDIT: "Refund Issued",
    MANUAL_ADJUSTMENT: "Manual Adjustment",
    SHOPIFY_SYNC: "System Sync",
  };

  return recentLedgerEntries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    description: typeLabels[entry.type] || entry.type,
    timestamp: entry.createdAt instanceof Date
      ? entry.createdAt.toISOString()
      : entry.createdAt,
    amount: parseFloat(entry.amount?.toString() || "0"),
  }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Critical data loaded immediately
    const [settings, billingPlan] = await Promise.all([
      db.shopSettings
        .findUnique({
          where: { shop },
        } as any)
        .catch(() => null),
      db.billingPlan
        .findUnique({
          where: { shop },
        } as any)
        .catch(() => null),
    ]);

    // Quick checklist data
    const [hasCustomers, hasTiers] = await Promise.all([
      db.customer
        .findMany({
          where: { shop },
          take: 1,
          select: { id: true },
        })
        .then((r) => r.length > 0)
        .catch(() => false),
      db.tier
        .findMany({
          where: { shop },
          take: 1,
          select: { id: true },
        })
        .then((r) => r.length > 0)
        .catch(() => false),
    ]);

    const setupChecklist: SetupChecklist = {
      tiersCreated: hasTiers,
      hasCustomers: hasCustomers,
      settingsConfigured: settings !== null,
      billingActive: billingPlan?.status === "active",
    };

    // Defer non-critical data
    const metricsPromise = calculateMetrics(shop);
    const activityPromise = fetchRecentActivity(shop);

    return defer({
      shop,
      setupChecklist,
      metricsData: metricsPromise,
      recentActivity: activityPromise,
    });
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    throw new Response("Failed to load dashboard data", { status: 500 });
  }
};

// Error Boundary
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <Page title="Dashboard">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading={`Error ${error.status}`}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{
                  content: "Reload page",
                  onAction: () => window.location.reload(),
                }}
              >
                <p>{error.data || "An error occurred while loading the dashboard."}</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <EmptyState
              heading="Something went wrong"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{
                content: "Reload page",
                onAction: () => window.location.reload(),
              }}
            >
              <p>An unexpected error occurred. Please try again.</p>
            </EmptyState>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

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

// Loading skeleton for metrics
function MetricsSkeleton() {
  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <Box padding="400">
              <BlockStack gap="200">
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={2} />
              </BlockStack>
            </Box>
          </Card>
        ))}
      </InlineGrid>
    </BlockStack>
  );
}

export default function DashboardPage() {
  const { setupChecklist, metricsData, recentActivity } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const setupSteps = Object.values(setupChecklist);
  const completedSteps = setupSteps.filter(Boolean).length;
  const setupProgress = (completedSteps / setupSteps.length) * 100;
  const isSetupComplete = setupProgress === 100;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Page title="Dashboard">
      <Layout>
        {/* Setup Progress - Only show if not complete */}
        {!isSetupComplete && (
          <Layout.Section>
            <CalloutCard
              title="Complete Your Setup"
              illustration="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/setup-illustration.svg"
              primaryAction={{
                content: setupChecklist.tiersCreated
                  ? "Continue Setup"
                  : "Create First Tier",
                onAction: () =>
                  navigate(setupChecklist.tiersCreated ? "/app/settings" : "/app/tiers"),
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

        {/* Key Metrics - Simplified responsive grid */}
        <Layout.Section>
          <Suspense fallback={<MetricsSkeleton />}>
            <Await resolve={metricsData}>
              {({ metrics }) => (
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
                      value={`${metrics.activeTiers} / ${metrics.tiersWithCustomers}`}
                      icon={StarFilledIcon}
                      tone={metrics.activeTiers >= 3 ? "success" : "warning"}
                    />
                    <MetricCard
                      title="Avg. Cashback"
                      value={`${metrics.averageCashback}%`}
                      icon={TipJarIcon}
                    />
                  </InlineGrid>
                </BlockStack>
              )}
            </Await>
          </Suspense>
        </Layout.Section>

        {/* Quick Actions & Tier Distribution - Simplified layout */}
        <Layout.Section>
          <BlockStack gap="400">
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              {/* Quick Actions */}
              <Card>
                <BlockStack gap="400">
                  <Box paddingBlockStart="400" paddingInlineStart="400" paddingInlineEnd="400">
                    <Text variant="headingMd" as="h3">Quick Actions</Text>
                  </Box>
                  <Box paddingBlockEnd="400" paddingInlineStart="400" paddingInlineEnd="400">
                    <BlockStack gap="300">
                      <Link to="/app/tiers" prefetch="intent">
                        <Button fullWidth icon={StarFilledIcon}>
                          Manage Tiers
                        </Button>
                      </Link>
                      <Link to="/app/customers" prefetch="intent">
                        <Button fullWidth icon={PersonFilledIcon}>
                          View Customers
                        </Button>
                      </Link>
                      <Link to="/app/settings" prefetch="viewport">
                        <Button fullWidth icon={SettingsIcon}>
                          Settings
                        </Button>
                      </Link>
                      <Link to="/app/billing" prefetch="viewport">
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
                <Suspense fallback={
                  <Box padding="400">
                    <SkeletonBodyText lines={4} />
                  </Box>
                }>
                  <Await resolve={metricsData}>
                    {({ tierDistribution }) => (
                      <BlockStack gap="400">
                        <Box paddingBlockStart="400" paddingInlineStart="400" paddingInlineEnd="400">
                          <InlineStack align="space-between">
                            <Text variant="headingMd" as="h3">Tier Distribution</Text>
                            <Link to="/app/tiers">
                              <Button variant="plain" size="slim">Manage</Button>
                            </Link>
                          </InlineStack>
                        </Box>
                        <Box paddingBlockEnd="400" paddingInlineStart="400" paddingInlineEnd="400">
                          {tierDistribution.length === 0 ? (
                            <BlockStack gap="300">
                              <Text variant="bodyMd" tone="subdued" as="p">
                                No tiers created yet
                              </Text>
                              <Button onClick={() => navigate("/app/tiers")}>
                                Create First Tier
                              </Button>
                            </BlockStack>
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
                          )}
                        </Box>
                      </BlockStack>
                    )}
                  </Await>
                </Suspense>
              </Card>
            </InlineGrid>
          </BlockStack>
        </Layout.Section>

        {/* Recent Activity & Setup Status - Cleaner layout */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: isSetupComplete ? 1 : 2 }} gap="400">
            {/* Recent Activity */}
            <Card>
              <Suspense fallback={
                <Box padding="400">
                  <SkeletonBodyText lines={5} />
                </Box>
              }>
                <Await resolve={recentActivity}>
                  {(activities) => (
                    <BlockStack gap="400">
                      <Box paddingBlockStart="400" paddingInlineStart="400" paddingInlineEnd="400">
                        <InlineStack align="space-between">
                          <Text variant="headingMd" as="h3">Recent Activity</Text>
                          <Badge tone="info">{activities.length > 0 ? `${activities.length} items` : "No activity"}</Badge>
                        </InlineStack>
                      </Box>
                      <Box paddingBlockEnd="400" paddingInlineStart="400" paddingInlineEnd="400">
                        {activities.length === 0 ? (
                          <BlockStack gap="200">
                            <Text variant="bodyMd" tone="subdued" as="p">
                              No activity yet. Activity will appear here once customers start earning rewards.
                            </Text>
                          </BlockStack>
                        ) : (
                          <BlockStack gap="300">
                            {activities.map((activity) => (
                              <InlineStack key={activity.id} align="space-between">
                                <BlockStack gap="050">
                                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                                    {activity.description}
                                  </Text>
                                  <Text variant="bodySm" tone="subdued" as="span">
                                    {formatRelativeTime(activity.timestamp)}
                                  </Text>
                                </BlockStack>
                                {activity.amount !== undefined && activity.amount !== 0 && (
                                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                                    {activity.amount > 0 && "+"}{formatCurrency(activity.amount)}
                                  </Text>
                                )}
                              </InlineStack>
                            ))}
                          </BlockStack>
                        )}
                      </Box>
                    </BlockStack>
                  )}
                </Await>
              </Suspense>
            </Card>

            {/* Setup Checklist - Only if incomplete */}
            {!isSetupComplete && (
              <Card>
                <BlockStack gap="400">
                  <Box paddingBlockStart="400" paddingInlineStart="400" paddingInlineEnd="400">
                    <Text variant="headingMd" as="h3">Setup Checklist</Text>
                  </Box>
                  <Box paddingBlockEnd="400" paddingInlineStart="400" paddingInlineEnd="400">
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon
                          source={setupChecklist.tiersCreated ? CheckCircleIcon : ClockIcon}
                          tone={setupChecklist.tiersCreated ? "success" : "subdued"}
                        />
                        <Text
                          variant="bodyMd"
                          tone={setupChecklist.tiersCreated ? undefined : "subdued"}
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
                          tone={setupChecklist.hasCustomers ? undefined : "subdued"}
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
                          tone={setupChecklist.settingsConfigured ? undefined : "subdued"}
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
                          tone={setupChecklist.billingActive ? undefined : "subdued"}
                          as="span"
                        >
                          Activate billing plan
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>
            )}
          </InlineGrid>
        </Layout.Section>

        {/* Insights - Simplified */}
        <Layout.Section>
          <Suspense fallback={null}>
            <Await resolve={metricsData}>
              {({ metrics, tierDistribution }) => {
                const needsMoreTiers = metrics.activeTiers < 3;
                const goodGrowth = metrics.customersChange > 5;
                const hasInsights = needsMoreTiers || goodGrowth;

                if (!hasInsights) return null;

                return (
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="300">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={InfoIcon} tone="info" />
                          <Text variant="headingMd" as="h3">Insights</Text>
                        </InlineStack>
                        
                        {needsMoreTiers && (
                          <Box padding="300" background="bg-surface-warning" borderRadius="200">
                            <BlockStack gap="100">
                              <Text variant="bodyMd" fontWeight="semibold" as="p">
                                Add More Tiers
                              </Text>
                              <Text variant="bodySm" as="p">
                                Consider adding more tiers for better customer segmentation.
                              </Text>
                            </BlockStack>
                          </Box>
                        )}

                        {goodGrowth && (
                          <Box padding="300" background="bg-surface-success" borderRadius="200">
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
                      </BlockStack>
                    </Box>
                  </Card>
                );
              }}
            </Await>
          </Suspense>
        </Layout.Section>
      </Layout>
    </Page>
  );
}