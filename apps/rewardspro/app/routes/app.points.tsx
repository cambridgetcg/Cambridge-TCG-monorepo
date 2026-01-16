import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  EmptyState,
  Box,
  Toast,
  Frame,
  Grid,
  ProgressBar,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  SettingsIcon,
  StarIcon,
  ChartVerticalFilledIcon,
  GiftCardIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getPointsConfig, getPointsStats, getEnabledFeatures, updatePointsConfig } from "../services/points-config.server";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface LoaderData {
  config: {
    isEnabled: boolean;
    currencyName: string;
    currencyNamePlural: string;
    currencyIcon: string;
    pointsPerDollar: number;
    pointsExpire: boolean;
    expirationDays: number;
  };
  stats: {
    totalPointsIssued: number;
    totalPointsRedeemed: number;
    totalPointsExpired: number;
    activePointsBalance: number;
    customersWithPoints: number;
  };
  features: {
    pointsSystem: boolean;
    raffles: boolean;
    mysteryBoxes: boolean;
    spinWheel: boolean;
    challenges: boolean;
    scratchCards: boolean;
    givebackPools: boolean;
    dailySpin: boolean;
    streakBonus: boolean;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    amount: number;
    description: string | null;
    createdAt: string;
    customerEmail: string;
  }>;
  topEarners: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    pointsBalance: number;
    lifetimePoints: number;
  }>;
}

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.points]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();
  console.log(`${LOG_PREFIX} Loader starting...`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log(`${LOG_PREFIX} Authenticated for shop: ${shop}`);

    // Verify db models exist before querying
    console.log(`${LOG_PREFIX} Checking db models...`);
    console.log(`${LOG_PREFIX} db exists: ${!!db}`);
    console.log(`${LOG_PREFIX} db.pointsConfig exists: ${!!db?.pointsConfig}`);
    console.log(`${LOG_PREFIX} db.pointsLedger exists: ${!!db?.pointsLedger}`);
    console.log(`${LOG_PREFIX} db.customer exists: ${!!db?.customer}`);

    if (!db) {
      console.error(`${LOG_PREFIX} CRITICAL: db is undefined!`);
      throw new Error("Database client not initialized");
    }

    if (!db.pointsConfig) {
      console.error(`${LOG_PREFIX} CRITICAL: db.pointsConfig is undefined!`);
      console.error(`${LOG_PREFIX} Available db keys: ${Object.keys(db).join(', ')}`);
      throw new Error("pointsConfig model not registered in database client");
    }

    if (!db.pointsLedger) {
      console.error(`${LOG_PREFIX} CRITICAL: db.pointsLedger is undefined!`);
      throw new Error("pointsLedger model not registered in database client");
    }

    console.log(`${LOG_PREFIX} Fetching data in parallel...`);

    // Fetch all data in parallel
    const [config, stats, features, recentActivity, topEarners] = await Promise.all([
      getPointsConfig(shop),
      getPointsStats(shop),
      getEnabledFeatures(shop),
      // Get recent activity (last 10 transactions)
      db.pointsLedger.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          amount: true,
          description: true,
          createdAt: true,
          customer: {
            select: {
              email: true,
            },
          },
        },
      }),
      // Get top earners
      db.customer.findMany({
        where: {
          shop,
          lifetimePoints: { gt: 0 },
        },
        orderBy: { lifetimePoints: "desc" },
        take: 5,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          pointsBalance: true,
          lifetimePoints: true,
        },
      }),
    ]);

    console.log(`${LOG_PREFIX} All data fetched in ${Date.now() - startTime}ms`);
    console.log(`${LOG_PREFIX} Config isEnabled: ${config.isEnabled}, pointsPerDollar: ${config.pointsPerDollar}`);
    console.log(`${LOG_PREFIX} Stats: issued=${stats.totalPointsIssued}, redeemed=${stats.totalPointsRedeemed}`);
    console.log(`${LOG_PREFIX} Recent activity count: ${recentActivity.length}, top earners count: ${topEarners.length}`);

    return json<LoaderData>({
      config: {
        isEnabled: config.isEnabled,
        currencyName: config.currencyName,
        currencyNamePlural: config.currencyNamePlural,
        currencyIcon: config.currencyIcon,
        pointsPerDollar: config.pointsPerDollar,
        pointsExpire: config.pointsExpire,
        expirationDays: config.expirationDays,
      },
      stats,
      features,
      recentActivity: recentActivity.map((a: { id: string; type: string; amount: number; description: string | null; createdAt: Date; customer: { email: string } | null }) => ({
        id: a.id,
        type: a.type,
        amount: a.amount,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
        customerEmail: a.customer?.email ?? "Unknown",
      })),
      topEarners: topEarners.map((c: { id: string; email: string; firstName: string | null; lastName: string | null; pointsBalance: unknown; lifetimePoints: unknown }) => ({
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        pointsBalance: Number(c.pointsBalance),
        lifetimePoints: Number(c.lifetimePoints),
      })),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} LOADER ERROR:`, error);
    console.error(`${LOG_PREFIX} Error name: ${error instanceof Error ? error.name : 'Unknown'}`);
    console.error(`${LOG_PREFIX} Error message: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`${LOG_PREFIX} Error stack:`, error instanceof Error ? error.stack : 'No stack');
    throw error;
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "toggle") {
    const currentConfig = await getPointsConfig(shop);
    await updatePointsConfig(shop, {
      isEnabled: !currentConfig.isEnabled,
    });

    return json({
      success: true,
      message: currentConfig.isEnabled ? "Points system disabled" : "Points system enabled",
    });
  }

  return json({ success: false, error: "Unknown action" }, { status: 400 });
};

// ============================================
// COMPONENT
// ============================================

export default function PointsOverview() {
  const { config, stats, features, recentActivity, topEarners } = useLoaderData<LoaderData>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const handleToggle = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "toggle");
    submit(formData, { method: "post" });
    setToastMessage(config.isEnabled ? "Points system disabled" : "Points system enabled");
    setToastActive(true);
  }, [config.isEnabled, submit]);

  const dismissToast = useCallback(() => setToastActive(false), []);

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  // Get transaction type label
  const getTypeLabel = (type: string): { label: string; tone: "success" | "critical" | "info" } => {
    const types: Record<string, { label: string; tone: "success" | "critical" | "info" }> = {
      ORDER_EARNED: { label: "Order Earned", tone: "success" },
      CHALLENGE_COMPLETED: { label: "Challenge", tone: "success" },
      SPIN_WHEEL_WIN: { label: "Spin Win", tone: "success" },
      SCRATCH_CARD_WIN: { label: "Scratch Win", tone: "success" },
      MYSTERY_BOX_WIN: { label: "Mystery Box", tone: "success" },
      BONUS_EVENT: { label: "Bonus", tone: "success" },
      REFERRAL_BONUS: { label: "Referral", tone: "success" },
      MANUAL_CREDIT: { label: "Manual Credit", tone: "info" },
      STREAK_BONUS: { label: "Streak", tone: "success" },
      RAFFLE_ENTRY: { label: "Raffle Entry", tone: "critical" },
      MYSTERY_BOX_OPEN: { label: "Mystery Box", tone: "critical" },
      PREMIUM_SPIN: { label: "Premium Spin", tone: "critical" },
      GIVEBACK_DONATION: { label: "Donation", tone: "critical" },
      MANUAL_DEBIT: { label: "Manual Debit", tone: "critical" },
      EXPIRATION: { label: "Expired", tone: "critical" },
      REFUND_CLAWBACK: { label: "Clawback", tone: "critical" },
      SYSTEM_ADJUSTMENT: { label: "Adjustment", tone: "info" },
    };
    return types[type] || { label: type, tone: "info" };
  };

  // Calculate circulation percentage
  const totalCirculating = stats.totalPointsIssued - stats.totalPointsRedeemed - stats.totalPointsExpired;
  const circulationPercent = stats.totalPointsIssued > 0
    ? Math.round((totalCirculating / stats.totalPointsIssued) * 100)
    : 0;

  // If not enabled, show setup prompt
  if (!config.isEnabled) {
    return (
      <Frame>
        <Page title="Points & Rewards">
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Enable the Points Engagement System"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Enable Points System",
                    onAction: handleToggle,
                    loading: isSubmitting,
                  }}
                  secondaryAction={{
                    content: "Configure Settings",
                    url: "/app/points/config",
                  }}
                >
                  <p>
                    Create a fun, gamified loyalty experience with points, raffles, mystery boxes,
                    and more. Points work alongside your cashback program to drive engagement.
                  </p>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      <Page
        title="Points & Rewards"
        subtitle={`${config.currencyIcon} ${config.currencyNamePlural} Engagement System`}
        primaryAction={{
          content: "Configure",
          url: "/app/points/config",
          icon: SettingsIcon,
        }}
        secondaryActions={[
          {
            content: config.isEnabled ? "Disable" : "Enable",
            onAction: handleToggle,
            loading: isSubmitting,
            destructive: config.isEnabled,
          },
        ]}
      >
        <Layout>
          {/* Status Banner */}
          <Layout.Section>
            <Banner
              title={`Points System Active - Earning ${config.pointsPerDollar} ${config.currencyNamePlural.toLowerCase()} per $1 spent`}
              tone="success"
            >
              <p>
                Customers are earning {config.currencyIcon} {config.currencyNamePlural.toLowerCase()} on every purchase.
                {config.pointsExpire && ` Points expire after ${config.expirationDays} days.`}
              </p>
            </Banner>
          </Layout.Section>

          {/* Key Metrics */}
          <Layout.Section>
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">Total Issued</Text>
                    <Text variant="heading2xl" as="p">
                      {config.currencyIcon} {formatNumber(stats.totalPointsIssued)}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">All time</Text>
                  </BlockStack>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">In Circulation</Text>
                    <Text variant="heading2xl" as="p">
                      {config.currencyIcon} {formatNumber(stats.activePointsBalance)}
                    </Text>
                    <ProgressBar progress={circulationPercent} size="small" />
                  </BlockStack>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">Redeemed</Text>
                    <Text variant="heading2xl" as="p">
                      {config.currencyIcon} {formatNumber(stats.totalPointsRedeemed)}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">Spent on rewards</Text>
                  </BlockStack>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">Members with {config.currencyNamePlural}</Text>
                    <Text variant="heading2xl" as="p">
                      {formatNumber(stats.customersWithPoints)}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">Active participants</Text>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            </Grid>
          </Layout.Section>

          {/* Features & Activity */}
          <Layout.Section>
            <Grid>
              {/* Enabled Features */}
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd" as="h3">Enabled Features</Text>
                      <Button variant="plain" url="/app/points/config">Manage</Button>
                    </InlineStack>
                    <Divider />
                    <BlockStack gap="300">
                      <InlineStack gap="200" align="start">
                        <Badge tone={features.raffles ? "success" : undefined}>
                          {features.raffles ? "Active" : "Inactive"}
                        </Badge>
                        <Text as="span">Raffles</Text>
                      </InlineStack>
                      <InlineStack gap="200" align="start">
                        <Badge tone={features.mysteryBoxes ? "success" : undefined}>
                          {features.mysteryBoxes ? "Active" : "Inactive"}
                        </Badge>
                        <Text as="span">Mystery Boxes</Text>
                      </InlineStack>
                      <InlineStack gap="200" align="start">
                        <Badge tone={features.spinWheel ? "success" : undefined}>
                          {features.spinWheel ? "Active" : "Inactive"}
                        </Badge>
                        <Text as="span">Spin Wheel</Text>
                      </InlineStack>
                      <InlineStack gap="200" align="start">
                        <Badge tone={features.challenges ? "success" : undefined}>
                          {features.challenges ? "Active" : "Inactive"}
                        </Badge>
                        <Text as="span">Challenges</Text>
                      </InlineStack>
                      <InlineStack gap="200" align="start">
                        <Badge tone={features.dailySpin ? "success" : undefined}>
                          {features.dailySpin ? "Active" : "Inactive"}
                        </Badge>
                        <Text as="span">Daily Spin</Text>
                      </InlineStack>
                      <InlineStack gap="200" align="start">
                        <Badge tone={features.streakBonus ? "success" : undefined}>
                          {features.streakBonus ? "Active" : "Inactive"}
                        </Badge>
                        <Text as="span">Streak Bonus</Text>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>

              {/* Top Earners */}
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Top {config.currencyName} Earners</Text>
                    <Divider />
                    {topEarners.length > 0 ? (
                      <BlockStack gap="300">
                        {topEarners.map((customer, index) => (
                          <InlineStack key={customer.id} gap="300" align="space-between">
                            <InlineStack gap="200">
                              <Text variant="bodyMd" fontWeight="bold" as="span">
                                #{index + 1}
                              </Text>
                              <Text as="span">
                                {customer.firstName || customer.email.split("@")[0]}
                              </Text>
                            </InlineStack>
                            <Text variant="bodyMd" fontWeight="semibold" as="span">
                              {config.currencyIcon} {formatNumber(customer.lifetimePoints)}
                            </Text>
                          </InlineStack>
                        ))}
                      </BlockStack>
                    ) : (
                      <Text tone="subdued" as="p">No points earned yet</Text>
                    )}
                  </BlockStack>
                </Card>
              </Grid.Cell>
            </Grid>
          </Layout.Section>

          {/* Recent Activity */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h3">Recent Activity</Text>
                  <Button variant="plain" url="/app/points/analytics">View All</Button>
                </InlineStack>
                <Divider />
                {recentActivity.length > 0 ? (
                  <BlockStack gap="300">
                    {recentActivity.map((activity) => {
                      const { label, tone } = getTypeLabel(activity.type);
                      return (
                        <InlineStack key={activity.id} gap="400" align="space-between">
                          <InlineStack gap="200">
                            <Badge tone={tone}>{label}</Badge>
                            <Text as="span" variant="bodySm">
                              {activity.customerEmail}
                            </Text>
                          </InlineStack>
                          <Text
                            variant="bodyMd"
                            fontWeight="semibold"
                            tone={activity.amount > 0 ? "success" : "critical"}
                            as="span"
                          >
                            {activity.amount > 0 ? "+" : ""}{formatNumber(activity.amount)} {config.currencyIcon}
                          </Text>
                        </InlineStack>
                      );
                    })}
                  </BlockStack>
                ) : (
                  <Text tone="subdued" as="p">No activity yet</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Quick Actions */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Quick Actions</Text>
                <Divider />
                <InlineStack gap="300" wrap>
                  <Button url="/app/points/config">
                    Configure Points
                  </Button>
                  <Button url="/app/points/raffles" disabled={!features.raffles}>
                    Manage Raffles
                  </Button>
                  <Button url="/app/points/mystery-boxes" disabled={!features.mysteryBoxes}>
                    Mystery Boxes
                  </Button>
                  <Button url="/app/points/challenges" disabled={!features.challenges}>
                    Challenges
                  </Button>
                  <Button url="/app/points/analytics">
                    View Analytics
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {toastActive && (
          <Toast content={toastMessage} onDismiss={dismissToast} />
        )}
      </Page>
    </Frame>
  );
}
