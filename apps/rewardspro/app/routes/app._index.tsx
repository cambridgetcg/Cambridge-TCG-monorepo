import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, Link } from "@remix-run/react";
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
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  MinusCircleIcon,
  StarFilledIcon,
  ThemeEditIcon,
  CashDollarFilledIcon,
  PersonIcon,
  ClockIcon,
  ArrowRightIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Type definitions
interface SetupTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action: {
    content: string;
    url?: string;
    onAction?: () => void;
  };
  illustration?: string;
}

interface DashboardMetrics {
  totalCustomers: number;
  totalRewards: number;
  activeTiers: number;
  averageCashback: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Check setup status
    const [settings, tiers, customers, billingPlan] = await Promise.all([
      db.shopSettings.findUnique({ where: { shop } }).catch(() => null),
      db.tier.count({ where: { shop } }).catch(() => 0),
      db.customer.count({ where: { shop } }).catch(() => 0),
      db.billingPlan.findUnique({ where: { shop } }).catch(() => null),
    ]);

    // Calculate metrics
    const [totalRewards, avgCashback] = await Promise.all([
      db.storeCreditLedger
        .aggregate({
          where: { 
            shop,
            type: "CASHBACK_EARNED" 
          },
          _sum: { amount: true }
        })
        .then(r => parseFloat(r._sum.amount?.toString() || "0"))
        .catch(() => 0),
      db.tier
        .aggregate({
          where: { shop },
          _avg: { cashbackPercent: true }
        })
        .then(r => r._avg.cashbackPercent || 0)
        .catch(() => 0),
    ]);

    // Get recent activity
    const recentActivity = await db.storeCreditLedger
      .findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          customer: {
            select: {
              name: true,
              email: true,
            }
          }
        }
      })
      .catch(() => []);

    // Setup tasks
    const setupTasks: SetupTask[] = [
      {
        id: "create-tiers",
        title: "Launch your loyalty program",
        description: "Turn your loyalty program on so customers earn points on every order and are more likely to shop again!",
        completed: tiers > 0,
        action: {
          content: tiers > 0 ? "Manage tiers" : "Go to program settings",
          url: "/app/tiers",
        },
      },
      {
        id: "add-theme",
        title: "Add RewardsPro to your store theme",
        description: "Customers can't redeem their points until you add RewardsPro to your store. Toggle RewardsPro on and hit save in your Shopify theme settings so your customers can start redeeming.",
        completed: settings?.themeIntegrated || false,
        action: {
          content: "Go to app embed settings",
          url: "/app/settings",
        },
      },
      {
        id: "choose-plan",
        title: "Choose a plan",
        description: "Get the most out of RewardsPro by choosing a plan. Get access to more features designed to boost your customer loyalty.",
        completed: billingPlan?.status === "active",
        action: {
          content: "Choose a plan",
          url: "/app/billing",
        },
      },
    ];

    const completedTasks = setupTasks.filter(task => task.completed).length;
    const setupProgress = (completedTasks / setupTasks.length) * 100;

    const metrics: DashboardMetrics = {
      totalCustomers: customers,
      totalRewards: totalRewards,
      activeTiers: tiers,
      averageCashback: Math.round(avgCashback * 10) / 10,
    };

    return json({
      shop,
      setupTasks,
      setupProgress,
      completedTasks,
      metrics,
      recentActivity,
    });
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    throw new Response("Failed to load dashboard data", { status: 500 });
  }
};

export default function DashboardPage() {
  const { 
    setupTasks, 
    setupProgress, 
    completedTasks,
    metrics,
    recentActivity 
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const isSetupComplete = completedTasks === setupTasks.length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatRelativeTime = (date: string | Date) => {
    const timestamp = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
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
        {/* Setup Guide Section */}
        {!isSetupComplete && (
          <Layout.Section>
            <Card>
              <Box padding="600">
                <BlockStack gap="500">
                  {/* Header */}
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h2">
                      Finish setting up your loyalty program
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Complete the tasks below to ensure your customers can benefit from your loyalty program
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      {completedTasks} of {setupTasks.length} tasks completed
                    </Text>
                    <ProgressBar 
                      progress={setupProgress} 
                      tone="primary" 
                      size="small"
                    />
                  </BlockStack>

                  <Divider />

                  {/* Setup Tasks */}
                  <BlockStack gap="600">
                    {setupTasks.map((task, index) => (
                      <Box key={task.id}>
                        <InlineStack gap="400" align="start" blockAlign="start">
                          {/* Task Status Icon */}
                          <Box minWidth="40px">
                            <Icon 
                              source={task.completed ? CheckCircleIcon : MinusCircleIcon}
                              tone={task.completed ? "success" : "subdued"}
                            />
                          </Box>

                          {/* Task Content */}
                          <BlockStack gap="300">
                            <Text 
                              variant="headingMd" 
                              as="h3"
                              tone={task.completed ? "subdued" : undefined}
                            >
                              {task.title}
                            </Text>
                            
                            {!task.completed && (
                              <>
                                <Text variant="bodyMd" tone="subdued" as="p">
                                  {task.description}
                                </Text>
                                <Box>
                                  <Button
                                    onClick={() => navigate(task.action.url || "#")}
                                    variant={index === 0 && !task.completed ? "primary" : "secondary"}
                                  >
                                    {task.action.content}
                                  </Button>
                                </Box>
                              </>
                            )}
                          </BlockStack>

                          {/* Illustration for current active task */}
                          {!task.completed && index === setupTasks.findIndex(t => !t.completed) && (
                            <Box minWidth="120px">
                              {/* Placeholder for illustration */}
                            </Box>
                          )}
                        </InlineStack>

                        {index < setupTasks.length - 1 && (
                          <Box paddingBlockStart="600">
                            <Divider />
                          </Box>
                        )}
                      </Box>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {/* Overview Metrics */}
        <Layout.Section>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Overview</Text>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px'
            }}>
              {/* Total Customers */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={PersonIcon} tone="base" />
                      <Text variant="bodySm" tone="subdued" as="p">Total Customers</Text>
                    </InlineStack>
                    <Text variant="headingXl" as="h3">{metrics.totalCustomers}</Text>
                  </BlockStack>
                </Box>
              </Card>

              {/* Rewards Distributed */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={CashDollarFilledIcon} tone="base" />
                      <Text variant="bodySm" tone="subdued" as="p">Rewards Distributed</Text>
                    </InlineStack>
                    <Text variant="headingXl" as="h3">{formatCurrency(metrics.totalRewards)}</Text>
                  </BlockStack>
                </Box>
              </Card>

              {/* Active Tiers */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={StarFilledIcon} tone="base" />
                      <Text variant="bodySm" tone="subdued" as="p">Active Tiers</Text>
                    </InlineStack>
                    <Text variant="headingXl" as="h3">{metrics.activeTiers}</Text>
                  </BlockStack>
                </Box>
              </Card>

              {/* Average Cashback */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={CashDollarFilledIcon} tone="base" />
                      <Text variant="bodySm" tone="subdued" as="p">Avg. Cashback</Text>
                    </InlineStack>
                    <Text variant="headingXl" as="h3">{metrics.averageCashback}%</Text>
                  </BlockStack>
                </Box>
              </Card>
            </div>
          </BlockStack>
        </Layout.Section>

        {/* Quick Actions & Recent Activity */}
        <Layout.Section>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '16px'
          }}>
            {/* Quick Actions */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Quick Actions</Text>
                  <BlockStack gap="200">
                    <Link to="/app/tiers" style={{ textDecoration: 'none' }}>
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={StarFilledIcon} tone="base" />
                          <Text variant="bodyMd" as="p">Manage Tiers</Text>
                        </InlineStack>
                        <Icon source={ArrowRightIcon} tone="subdued" />
                      </InlineStack>
                    </Link>
                    
                    <Divider />
                    
                    <Link to="/app/customers" style={{ textDecoration: 'none' }}>
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={PersonIcon} tone="base" />
                          <Text variant="bodyMd" as="p">View Customers</Text>
                        </InlineStack>
                        <Icon source={ArrowRightIcon} tone="subdued" />
                      </InlineStack>
                    </Link>
                    
                    <Divider />
                    
                    <Link to="/app/settings" style={{ textDecoration: 'none' }}>
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={ThemeEditIcon} tone="base" />
                          <Text variant="bodyMd" as="p">Settings</Text>
                        </InlineStack>
                        <Icon source={ArrowRightIcon} tone="subdued" />
                      </InlineStack>
                    </Link>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>

            {/* Recent Activity */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h3">Recent Activity</Text>
                    {recentActivity.length > 0 && (
                      <Badge tone="info">{`${recentActivity.length} items`}</Badge>
                    )}
                  </InlineStack>
                  
                  {recentActivity.length === 0 ? (
                    <BlockStack gap="200">
                      <Icon source={ClockIcon} tone="subdued" />
                      <Text variant="bodyMd" tone="subdued" as="p">
                        No activity yet. Activity will appear here once customers start earning rewards.
                      </Text>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="300">
                      {recentActivity.map((activity: any) => (
                        <Box key={activity.id}>
                          <InlineStack align="space-between">
                            <BlockStack gap="050">
                              <Text variant="bodyMd" as="p">
                                {activity.type === "CASHBACK_EARNED" && "Cashback Earned"}
                                {activity.type === "ORDER_PAYMENT" && "Store Credit Used"}
                                {activity.type === "MANUAL_ADJUSTMENT" && "Manual Adjustment"}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="p">
                                {activity.customer?.name || activity.customer?.email || "Unknown"} • {formatRelativeTime(activity.createdAt)}
                              </Text>
                            </BlockStack>
                            <Text variant="bodyMd" fontWeight="semibold" as="p">
                              {activity.amount > 0 && "+"}{formatCurrency(parseFloat(activity.amount))}
                            </Text>
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}