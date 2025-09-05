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
import { Suspense, lazy } from "react";
import db from "../db.server";
import { isRouteErrorResponse, useRouteError } from "@remix-run/react";

// Type definitions for loader data
interface CoreMetrics {
  totalCustomers: number;
  customersChange: number;
  totalRewards: number;
  rewardsChange: number;
  activeTiers: number;
  tiersWithCustomers: number;
  averageCashback: number;
}

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

interface TierData {
  name: string;
  customerCount: number;
  percentage: number;
}

// Lazy load heavy components for better code splitting
const InsightsCard = lazy(() => import("../components/dashboard/InsightsCard"));
const ActivityFeed = lazy(() => import("../components/dashboard/ActivityFeed"));

// Add caching headers for loader responses
export const headers: HeadersFunction = () => ({
  "Cache-Control": "private, max-age=0, must-revalidate",
  "CDN-Cache-Control": "private, s-maxage=300, stale-while-revalidate=600",
});

// Helper function to calculate metrics (moved to async for deferred execution)
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
      rewardsChange: 12, // Placeholder
      activeTiers: tiers.length,
      tiersWithCustomers: tierDistribution.filter((t) => t.customerCount > 0).length,
      averageCashback: Math.round(averageCashback * 10) / 10,
    },
    tierDistribution,
  };
}

// Helper function to fetch recent activity
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

    // Quick checklist data - using findMany with take: 1 for compatibility
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

    // Defer non-critical data for faster initial load
    const metricsPromise = calculateMetrics(shop);
    const activityPromise = fetchRecentActivity(shop);

    return defer({
      shop,
      setupChecklist,
      // Deferred promises will stream in as they resolve
      metricsData: metricsPromise,
      recentActivity: activityPromise,
    });
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    throw new Response("Failed to load dashboard data", { status: 500 });
  }
};

// Error Boundary for graceful error handling
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

// Loading skeleton component for metrics
function MetricsSkeleton() {
  return (
    <Grid>
      {[1, 2, 3, 4].map((i) => (
        <Grid.Cell key={i} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
          <Card>
            <BlockStack gap="200">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={2} />
            </BlockStack>
          </Card>
        </Grid.Cell>
      ))}
    </Grid>
  );
}

// Metrics Card Component
function MetricsCard({
  metrics,
}: {
  metrics: CoreMetrics;
}) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <Grid>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text variant="bodySm" tone="subdued" as="p">
                Total Customers
              </Text>
              <Icon source={PersonSegmentIcon} tone="base" />
            </InlineStack>
            <Text variant="headingXl" as="h2">
              {metrics.totalCustomers}
            </Text>
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
              <Text variant="bodySm" tone="subdued" as="p">
                Rewards Distributed
              </Text>
              <Icon source={CashDollarFilledIcon} tone="base" />
            </InlineStack>
            <Text variant="headingXl" as="h2">
              {formatCurrency(metrics.totalRewards)}
            </Text>
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
              <Text variant="bodySm" tone="subdued" as="p">
                Active Tiers
              </Text>
              <Icon source={StarFilledIcon} tone="base" />
            </InlineStack>
            <InlineStack gap="200" blockAlign="baseline">
              <Text variant="headingXl" as="h2">
                {metrics.activeTiers}
              </Text>
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
              <Text variant="bodySm" tone="subdued" as="p">
                Avg. Cashback
              </Text>
              <Icon source={TipJarIcon} tone="base" />
            </InlineStack>
            <Text variant="headingXl" as="h2">
              {metrics.averageCashback}%
            </Text>
            <Text variant="bodySm" tone="subdued" as="p">
              Across all tiers
            </Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
    </Grid>
  );
}

// Tier Distribution Component
function TierDistribution({ tiers }: { tiers: TierData[] }) {
  const navigate = useNavigate();

  if (tiers.length === 0) {
    return (
      <EmptyState
        heading="No tiers yet"
        action={{
          content: "Create First Tier",
          onAction: () => navigate("/app/tiers"),
        }}
        image="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/empty-tiers.svg"
      >
        <p>Set up loyalty tiers to start rewarding customers.</p>
      </EmptyState>
    );
  }

  return (
    <BlockStack gap="300">
      {tiers.map((tier) => (
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
  );
}

export default function DashboardPage() {
  const { setupChecklist, metricsData, recentActivity } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Calculate setup progress
  const setupSteps = Object.values(setupChecklist);
  const completedSteps = setupSteps.filter(Boolean).length;
  const setupProgress = (completedSteps / setupSteps.length) * 100;

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
                content: setupChecklist.tiersCreated
                  ? "Continue Setup"
                  : "Create First Tier",
                onAction: () =>
                  navigate(setupChecklist.tiersCreated ? "/app/settings" : "/app/tiers"),
              }}
            >
              <Box paddingBlockEnd="200">
                <Text variant="bodyMd" as="p">
                  You're {Math.round(setupProgress)}% complete with your rewards program
                  setup.
                </Text>
              </Box>
              <ProgressBar progress={setupProgress} tone="primary" />
            </CalloutCard>
          </Layout.Section>
        )}

        {/* Metrics Grid with Suspense */}
        <Layout.Section>
          <Suspense fallback={<MetricsSkeleton />}>
            <Await resolve={metricsData}>
              {({ metrics }) => <MetricsCard metrics={metrics} />}
            </Await>
          </Suspense>
        </Layout.Section>

        {/* Main Content */}
        <Layout.Section>
          <Grid>
            {/* Tier Distribution */}
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h3">
                      Tier Distribution
                    </Text>
                    <Link to="/app/tiers" prefetch="intent">
                      <Button variant="plain">Manage Tiers</Button>
                    </Link>
                  </InlineStack>

                  <Suspense
                    fallback={
                      <Box paddingBlock="400">
                        <SkeletonBodyText lines={3} />
                      </Box>
                    }
                  >
                    <Await resolve={metricsData}>
                      {({ tierDistribution }) => (
                        <TierDistribution tiers={tierDistribution} />
                      )}
                    </Await>
                  </Suspense>
                </BlockStack>
              </Card>
            </Grid.Cell>

            {/* Quick Actions */}
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 2 }}>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">
                    Quick Actions
                  </Text>
                  <BlockStack gap="200">
                    <Link to="/app/tiers" prefetch="intent">
                      <Button fullWidth icon={StarFilledIcon}>
                        Manage Tiers
                      </Button>
                    </Link>
                    <Link to="/app/customers" prefetch="intent">
                      <Button fullWidth icon={PersonSegmentIcon}>
                        View Customers
                      </Button>
                    </Link>
                    <Link to="/app/settings" prefetch="viewport">
                      <Button fullWidth icon={SettingsIcon}>
                        Configure Settings
                      </Button>
                    </Link>
                    <Link to="/app/billing" prefetch="viewport">
                      <Button fullWidth icon={BillFilledIcon}>
                        Billing & Plans
                      </Button>
                    </Link>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Recent Activity & Insights */}
        <Layout.Section>
          <Grid>
            {/* Recent Activity with lazy loading */}
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
              <Suspense
                fallback={
                  <Card>
                    <BlockStack gap="400">
                      <SkeletonDisplayText size="small" />
                      <SkeletonBodyText lines={5} />
                    </BlockStack>
                  </Card>
                }
              >
                <Await resolve={recentActivity}>
                  {(activity) => <ActivityFeed activities={activity} />}
                </Await>
              </Suspense>
            </Grid.Cell>

            {/* Insights - Lazy loaded component */}
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 2 }}>
              <Suspense
                fallback={
                  <Card>
                    <BlockStack gap="400">
                      <SkeletonDisplayText size="small" />
                      <SkeletonBodyText lines={4} />
                    </BlockStack>
                  </Card>
                }
              >
                <Await resolve={metricsData}>
                  {({ metrics }) => <InsightsCard metrics={metrics} />}
                </Await>
              </Suspense>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Setup Checklist */}
        {setupProgress < 100 && (
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Setup Checklist
                </Text>
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
                      source={
                        setupChecklist.settingsConfigured ? CheckCircleIcon : ClockIcon
                      }
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