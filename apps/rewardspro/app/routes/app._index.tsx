import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  InlineStack,
  Banner,
  ProgressBar,
  Badge,
  Box,
  List,
  Icon,
  Divider,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  RewardIcon,
  PersonSegmentIcon,
  CashDollarFilledIcon,
  ChartVerticalIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ClockIcon,
  CartIcon,
  ReplayIcon,
  SettingsIcon,
  PriceListIcon,
  StarFilledIcon,
} from "../utils/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session) {
      throw new Response("Session not found", { status: 401 });
    }
    
    const shop = session.shop;
    
    // Fetch dashboard data
    const [customers, tiers, recentActivity, billingPlan, totalRewards] = await Promise.all([
      db.customer.count({ where: { shop } }),
      db.tier.findMany({ 
        where: { shop },
        orderBy: { minSpend: 'asc' }
      }),
      db.storeCreditLedger.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { customer: true }
      }),
      db.billingPlan.findUnique({ where: { shop } }),
      db.storeCreditLedger.aggregate({
        where: { 
          shop,
          type: 'CASHBACK_EARNED',
          amount: { gt: 0 }
        },
        _sum: { amount: true }
      })
    ]);

    // Calculate setup progress
    let setupTasks = [
      { 
        id: 'tiers',
        label: 'Create loyalty tiers',
        completed: tiers.length > 0,
        action: '/app/tiers'
      },
      {
        id: 'customers',
        label: 'First customer enrolled',
        completed: customers > 0,
        action: '/app/customers'
      },
      {
        id: 'billing',
        label: 'Choose a billing plan',
        completed: billingPlan && billingPlan.planName !== 'free',
        action: '/app/billing'
      }
    ];
    
    const setupProgress = Math.round((setupTasks.filter(t => t.completed).length / setupTasks.length) * 100);
    const isProgramLive = tiers.length > 0;
    
    return json({ 
      shop,
      stats: {
        customers,
        tiers: tiers.length,
        totalRewards: totalRewards._sum.amount || 0,
        tiersList: tiers
      },
      billingPlan,
      recentActivity,
      setupTasks,
      setupProgress,
      isProgramLive
    });
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    return json({
      shop: 'unknown',
      stats: {
        customers: 0,
        tiers: 0,
        totalRewards: 0,
        tiersList: []
      },
      billingPlan: null,
      recentActivity: [],
      setupTasks: [],
      setupProgress: 0,
      isProgramLive: false
    });
  }
};

export default function Dashboard() {
  const { shop, stats, billingPlan, recentActivity, setupTasks, setupProgress, isProgramLive } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [expandedSetup, setExpandedSetup] = useState(setupProgress < 100);

  const journeySteps = [
    {
      icon: PersonSegmentIcon,
      timeframe: "IN A FEW DAYS",
      title: "First customer earns",
      description: "Customers that earn cashback are 1.5x more likely to make a repeat purchase!"
    },
    {
      icon: CartIcon,
      timeframe: "WITHIN 90 DAYS",
      title: "First customer redeems",
      description: "Customers that redeem rewards spend 3x more on average than other customers!"
    },
    {
      icon: ReplayIcon,
      timeframe: "AFTER REDEMPTION",
      title: "Repeat order placed",
      description: "Customers are more likely to place repeat orders because of their cashback rewards."
    }
  ];

  const quickActions = [
    {
      title: "Configure Tiers",
      description: "Set up loyalty tiers and cashback percentages",
      icon: PriceListIcon,
      action: () => navigate("/app/tiers"),
      primary: stats.tiers === 0
    },
    {
      title: "View Customers",
      description: "Manage customer rewards and tier assignments",
      icon: PersonSegmentIcon,
      action: () => navigate("/app/customers"),
      primary: false
    },
    {
      title: "Billing & Plans",
      description: "Upgrade your plan for more features",
      icon: CashDollarFilledIcon,
      action: () => navigate("/app/billing"),
      primary: billingPlan?.planName === 'free'
    },
    {
      title: "Settings",
      description: "Configure program settings",
      icon: SettingsIcon,
      action: () => navigate("/app/settings"),
      primary: false
    }
  ];

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* Program Status Banner */}
        <Banner
          tone={isProgramLive ? "success" : "info"}
          title={isProgramLive ? "Your loyalty program is live!" : "Let's launch your loyalty program"}
          onDismiss={() => {}}
        >
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              {isProgramLive 
                ? "Here's a preview of what's ahead as your program creates repeat purchases."
                : "Complete the setup steps below to start rewarding your customers with cashback."
              }
            </Text>
          </BlockStack>
        </Banner>

        {/* Customer Journey Timeline */}
        {isProgramLive && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Customer Journey</Text>
              <div style={{ position: 'relative', paddingBottom: '20px' }}>
                <div style={{
                  position: 'absolute',
                  top: '30px',
                  left: '30px',
                  right: '30px',
                  height: '2px',
                  backgroundColor: '#e1e3e5',
                  zIndex: 0
                }} />
                <InlineStack gap="0" align="space-between">
                  {journeySteps.map((step, index) => (
                    <Box key={index} padding="0" width="33.33%">
                      <BlockStack gap="200" align="center">
                        <Box 
                          padding="400" 
                          background="bg-surface-secondary" 
                          borderRadius="200"
                          borderColor="border"
                          borderWidth="025"
                          width="60px"
                          minHeight="60px"
                          position="relative"
                        >
                          <InlineStack align="center" blockAlign="center">
                            <Icon source={step.icon} tone="base" />
                          </InlineStack>
                        </Box>
                        <BlockStack gap="100" align="center">
                          <Text as="span" variant="bodySm" tone="subdued" fontWeight="semibold">
                            {step.timeframe}
                          </Text>
                          <Text as="h3" variant="headingSm" alignment="center">
                            {step.title}
                          </Text>
                          <Box maxWidth="200px">
                            <Text as="p" variant="bodySm" alignment="center" tone="subdued">
                              {step.description}
                            </Text>
                          </Box>
                        </BlockStack>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineStack>
              </div>
            </BlockStack>
          </Card>
        )}

        {/* Statistics Overview */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Icon source={PersonSegmentIcon} tone="base" />
                  <Badge tone={stats.customers > 0 ? "success" : "new"}>
                    {stats.customers > 0 ? "Active" : "New"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="heading2xl">
                  {stats.customers.toLocaleString()}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Total Customers Enrolled
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Icon source={PriceListIcon} tone="base" />
                  <Badge tone={stats.tiers > 0 ? "success" : "warning"}>
                    {stats.tiers > 0 ? "Active" : "Setup"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="heading2xl">
                  {stats.tiers}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Loyalty Tiers Created
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Icon source={CashDollarFilledIcon} tone="base" />
                  <Badge>All Time</Badge>
                </InlineStack>
                <Text as="p" variant="heading2xl">
                  ${Number(stats.totalRewards).toFixed(2)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Total Rewards Distributed
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Setup Checklist */}
        {setupProgress < 100 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Finish setting up your loyalty program
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Complete the tasks below to ensure your customers can benefit from your loyalty program
                  </Text>
                </BlockStack>
                <Button
                  plain
                  icon={expandedSetup ? ChevronUpIcon : ChevronDownIcon}
                  onClick={() => setExpandedSetup(!expandedSetup)}
                  accessibilityLabel={expandedSetup ? "Collapse setup tasks" : "Expand setup tasks"}
                />
              </InlineStack>
              
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    {setupTasks.filter(t => t.completed).length} of {setupTasks.length} tasks completed
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {setupProgress}%
                  </Text>
                </InlineStack>
                <ProgressBar progress={setupProgress} size="small" tone="primary" />
              </BlockStack>

              {expandedSetup && (
                <BlockStack gap="300">
                  <Divider />
                  {setupTasks.map((task) => (
                    <InlineStack key={task.id} align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <Icon 
                          source={task.completed ? CheckCircleIcon : AlertTriangleIcon}
                          tone={task.completed ? "success" : "warning"}
                        />
                        <Text as="p" variant="bodyMd" fontWeight={task.completed ? "regular" : "semibold"}>
                          {task.label}
                        </Text>
                      </InlineStack>
                      {!task.completed && (
                        <Button size="slim" onClick={() => navigate(task.action)}>
                          Complete
                        </Button>
                      )}
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        )}

        {/* Quick Actions */}
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Quick Actions</Text>
          <Layout>
            {quickActions.map((action, index) => (
              <Layout.Section key={index} variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <InlineStack gap="300" blockAlign="start">
                      <Icon source={action.icon} tone="base" />
                      <BlockStack gap="200">
                        <Text as="h3" variant="headingSm">
                          {action.title}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {action.description}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <Button 
                      onClick={action.action}
                      primary={action.primary}
                      fullWidth
                    >
                      {action.primary ? "Get Started" : "View"}
                      <Icon source={ArrowRightIcon} />
                    </Button>
                  </BlockStack>
                </Card>
              </Layout.Section>
            ))}
          </Layout>
        </BlockStack>

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Recent Activity</Text>
                <Button plain onClick={() => navigate("/app/customers")}>
                  View All
                </Button>
              </InlineStack>
              <BlockStack gap="300">
                {recentActivity.slice(0, 5).map((activity: any) => (
                  <InlineStack key={activity.id} align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <Badge tone={activity.amount > 0 ? "success" : "info"}>
                        {activity.type.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                      <BlockStack gap="0">
                        <Text as="p" variant="bodyMd">
                          {activity.customer?.email || 'Unknown Customer'}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {new Date(activity.createdAt).toLocaleDateString()}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <Text as="p" variant="bodyMd" fontWeight="semibold" tone={activity.amount > 0 ? "success" : "base"}>
                      ${Math.abs(Number(activity.amount)).toFixed(2)}
                    </Text>
                  </InlineStack>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* Empty State for New Users */}
        {!isProgramLive && stats.customers === 0 && (
          <Card>
            <EmptyState
              heading="Start Building Customer Loyalty"
              action={{
                content: "Configure Tiers",
                onAction: () => navigate("/app/tiers"),
              }}
              secondaryAction={{
                content: "Learn More",
                onAction: () => window.open("https://help.shopify.com/manual/promoting-marketing/loyalty-programs", "_blank"),
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Set up your first loyalty tiers to start rewarding customers with automatic cashback on their purchases.
              </p>
            </EmptyState>
          </Card>
        )}

        {/* Current Tiers Display */}
        {stats.tiersList && stats.tiersList.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Current Loyalty Tiers</Text>
                <Button plain onClick={() => navigate("/app/tiers")}>
                  Manage Tiers
                </Button>
              </InlineStack>
              <BlockStack gap="200">
                {stats.tiersList.map((tier: any) => (
                  <Box key={tier.id} padding="300" background="bg-surface-secondary" borderRadius="100">
                    <InlineStack align="space-between">
                      <InlineStack gap="400">
                        <Icon source={StarFilledIcon} tone="warning" />
                        <BlockStack gap="0">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {tier.name}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Min. spend: ${tier.minSpend} • {tier.evaluationPeriod.toLowerCase()}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <Badge tone="success">
                        {tier.cashbackPercent}% cashback
                      </Badge>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}