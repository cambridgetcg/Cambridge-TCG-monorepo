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
  EmailIcon,
  AutomationIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useToast } from "~/hooks/useToast";
import { getPointsConfig, getPointsStats, getEnabledFeatures, updatePointsConfig } from "../services/points-config.server";
import { PointsIcon } from "~/components/PointsIcon";
import { DEFAULT_ICON_CONFIG } from "~/utils/points-icon-library";
import { getRaffleStats } from "../services/raffle-management.server";
import { getMysteryBoxStats } from "../services/mystery-box-management.server";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface LoaderData {
  config: {
    isEnabled: boolean;
    currencyName: string;
    currencyNamePlural: string;
    pointsPerDollar: number;
    pointsExpire: boolean;
    expirationDays: number;
    // Icon configuration for PointsIcon component
    iconType: "emoji" | "upload" | "library";
    iconId: string;
    iconColor: string;
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
  moduleStats: {
    raffles: {
      totalRaffles: number;
      activeRaffles: number;
      totalEntries: number;
      totalPrizePoolValue: number;
    };
    mysteryBoxes: {
      totalBoxes: number;
      activeBoxes: number;
      totalOpens: number;
      totalPointsSpent: number;
    };
    challenges: {
      totalChallenges: number;
      activeChallenges: number;
      totalParticipants: number;
      totalCompletions: number;
    };
  };
}

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.rewards]";

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
    const [config, stats, features, raffleStats, mysteryBoxStatsData] = await Promise.all([
      getPointsConfig(shop),
      getPointsStats(shop),
      getEnabledFeatures(shop),
      // Get module stats
      getRaffleStats(shop),
      getMysteryBoxStats(shop),
    ]);

    console.log(`${LOG_PREFIX} All data fetched in ${Date.now() - startTime}ms`);
    console.log(`${LOG_PREFIX} Config isEnabled: ${config.isEnabled}, pointsPerDollar: ${config.pointsPerDollar}`);
    console.log(`${LOG_PREFIX} Stats: issued=${stats.totalPointsIssued}, redeemed=${stats.totalPointsRedeemed}`);

    return json<LoaderData>({
      config: {
        isEnabled: config.isEnabled,
        currencyName: config.currencyName,
        currencyNamePlural: config.currencyNamePlural,
        pointsPerDollar: config.pointsPerDollar,
        pointsExpire: config.pointsExpire,
        expirationDays: config.expirationDays,
        // Use default vector icon config (emoji system deprecated)
        iconType: DEFAULT_ICON_CONFIG.iconType,
        iconId: DEFAULT_ICON_CONFIG.iconId,
        iconColor: DEFAULT_ICON_CONFIG.iconColor,
      },
      stats,
      features,
      moduleStats: {
        raffles: raffleStats,
        mysteryBoxes: mysteryBoxStatsData,
        challenges: {
          // Placeholder until challenge services are implemented
          totalChallenges: 0,
          activeChallenges: 0,
          totalParticipants: 0,
          totalCompletions: 0,
        },
      },
    });
  } catch (error) {
    // Auth redirects (302 to /auth/login) are expected behavior, not errors
    if (error instanceof Response) {
      const status = error.status;
      const location = error.headers.get("Location");

      if (status >= 300 && status < 400) {
        console.log(`${LOG_PREFIX} Auth redirect: status=${status}, location=${location}`);
        throw error;
      }

      console.error(`${LOG_PREFIX} LOADER ERROR (Response): status=${status}`);
    } else {
      console.error(`${LOG_PREFIX} LOADER ERROR:`, error);
      console.error(`${LOG_PREFIX} Error name: ${error instanceof Error ? error.name : 'Unknown'}`);
      console.error(`${LOG_PREFIX} Error message: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`${LOG_PREFIX} Error stack:`, error instanceof Error ? error.stack : 'No stack');
    }
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
  const { config, stats, features, moduleStats } = useLoaderData<LoaderData>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Standardized toast notifications
  const { toast, showSuccess, hideToast } = useToast();

  const handleToggle = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "toggle");
    submit(formData, { method: "post" });
    showSuccess(config.isEnabled ? "Points system disabled" : "Points system enabled");
  }, [config.isEnabled, submit, showSuccess]);

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
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
                    url: "/app/rewards/config",
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
        subtitle={`${config.currencyNamePlural} Engagement System`}
        primaryAction={{
          content: "Configure",
          url: "/app/rewards/config",
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
                Customers are earning {config.currencyNamePlural.toLowerCase()} on every purchase.
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
                    <InlineStack gap="200" blockAlign="center">
                      <PointsIcon iconType={config.iconType} iconId={config.iconId} iconColor={config.iconColor} size={28} />
                      <Text variant="heading2xl" as="p">{formatNumber(stats.totalPointsIssued)}</Text>
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued" as="p">All time</Text>
                  </BlockStack>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">In Circulation</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <PointsIcon iconType={config.iconType} iconId={config.iconId} iconColor={config.iconColor} size={28} />
                      <Text variant="heading2xl" as="p">{formatNumber(stats.activePointsBalance)}</Text>
                    </InlineStack>
                    <ProgressBar progress={circulationPercent} size="small" />
                  </BlockStack>
                </Card>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">Redeemed</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <PointsIcon iconType={config.iconType} iconId={config.iconId} iconColor={config.iconColor} size={28} />
                      <Text variant="heading2xl" as="p">{formatNumber(stats.totalPointsRedeemed)}</Text>
                    </InlineStack>
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

          {/* Engagement Modules */}
          <Layout.Section>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Engagement Modules</Text>
                <Text variant="bodySm" tone="subdued" as="span">
                  Drive customer engagement with gamified experiences
                </Text>
              </InlineStack>
              <Grid>
                {/* Raffles Module */}
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                  <Card background={!features.raffles ? "bg-surface-secondary" : undefined}>
                    <BlockStack gap="400">
                      {/* Header */}
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="headingMd" as="h3" tone={!features.raffles ? "subdued" : undefined}>
                              Raffles
                            </Text>
                            {features.raffles ? (
                              moduleStats.raffles.activeRaffles > 0 ? (
                                <Badge tone="success">{moduleStats.raffles.activeRaffles} Live</Badge>
                              ) : (
                                <Badge tone="attention">No Active</Badge>
                              )
                            ) : (
                              <Badge>Disabled</Badge>
                            )}
                          </InlineStack>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Customers spend {config.currencyNamePlural.toLowerCase()} for a chance to win prizes
                        </Text>
                      </BlockStack>

                      <Divider />

                      {/* Content based on state */}
                      {!features.raffles ? (
                        /* Disabled State */
                        <BlockStack gap="300">
                          <Text tone="subdued" as="p" variant="bodySm">
                            Enable raffles to create excitement and drive repeat engagement with prize drawings.
                          </Text>
                          <Button url="/app/rewards/config" size="slim">
                            Enable Raffles
                          </Button>
                        </BlockStack>
                      ) : moduleStats.raffles.totalRaffles === 0 ? (
                        /* Empty State */
                        <BlockStack gap="300">
                          <Text tone="subdued" as="p" variant="bodySm">
                            Create your first raffle to give customers an exciting way to use their {config.currencyNamePlural.toLowerCase()}.
                          </Text>
                          <Button url="/app/rewards/raffles" size="slim" variant="primary">
                            Create First Raffle
                          </Button>
                        </BlockStack>
                      ) : (
                        /* Stats State */
                        <BlockStack gap="300">
                          <Grid>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Total Raffles</Text>
                                <Text variant="headingLg" as="p">{moduleStats.raffles.totalRaffles}</Text>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Total Entries</Text>
                                <Text variant="headingLg" as="p">{formatNumber(moduleStats.raffles.totalEntries)}</Text>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Prize Pool</Text>
                                <InlineStack gap="100" blockAlign="center">
                                  <PointsIcon iconType={config.iconType} iconId={config.iconId} iconColor={config.iconColor} size={20} />
                                  <Text variant="headingLg" as="p">{formatNumber(moduleStats.raffles.totalPrizePoolValue)}</Text>
                                </InlineStack>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Active Now</Text>
                                <Text variant="headingLg" as="p" tone={moduleStats.raffles.activeRaffles > 0 ? "success" : "caution"}>
                                  {moduleStats.raffles.activeRaffles}
                                </Text>
                              </BlockStack>
                            </Grid.Cell>
                          </Grid>
                          <InlineStack gap="200">
                            <Button url="/app/rewards/raffles" size="slim">
                              Manage Raffles
                            </Button>
                            {moduleStats.raffles.activeRaffles === 0 && (
                              <Button url="/app/rewards/raffles" size="slim" variant="primary">
                                Create Raffle
                              </Button>
                            )}
                          </InlineStack>
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Card>
                </Grid.Cell>

                {/* Mystery Boxes Module */}
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                  <Card background={!features.mysteryBoxes ? "bg-surface-secondary" : undefined}>
                    <BlockStack gap="400">
                      {/* Header */}
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="headingMd" as="h3" tone={!features.mysteryBoxes ? "subdued" : undefined}>
                              Mystery Boxes
                            </Text>
                            {features.mysteryBoxes ? (
                              moduleStats.mysteryBoxes.activeBoxes > 0 ? (
                                <Badge tone="success">{moduleStats.mysteryBoxes.activeBoxes} Live</Badge>
                              ) : (
                                <Badge tone="attention">No Active</Badge>
                              )
                            ) : (
                              <Badge>Disabled</Badge>
                            )}
                          </InlineStack>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Surprise rewards with probability-based outcomes
                        </Text>
                      </BlockStack>

                      <Divider />

                      {/* Content based on state */}
                      {!features.mysteryBoxes ? (
                        /* Disabled State */
                        <BlockStack gap="300">
                          <Text tone="subdued" as="p" variant="bodySm">
                            Enable mystery boxes to add an element of surprise and delight to your rewards program.
                          </Text>
                          <Button url="/app/rewards/config" size="slim">
                            Enable Mystery Boxes
                          </Button>
                        </BlockStack>
                      ) : moduleStats.mysteryBoxes.totalBoxes === 0 ? (
                        /* Empty State */
                        <BlockStack gap="300">
                          <Text tone="subdued" as="p" variant="bodySm">
                            Create mystery boxes with tiered rewards to keep customers coming back for more.
                          </Text>
                          <Button url="/app/rewards/mystery-boxes" size="slim" variant="primary">
                            Create First Box
                          </Button>
                        </BlockStack>
                      ) : (
                        /* Stats State */
                        <BlockStack gap="300">
                          <Grid>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Total Boxes</Text>
                                <Text variant="headingLg" as="p">{moduleStats.mysteryBoxes.totalBoxes}</Text>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Total Opens</Text>
                                <Text variant="headingLg" as="p">{formatNumber(moduleStats.mysteryBoxes.totalOpens)}</Text>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">{config.currencyNamePlural} Spent</Text>
                                <Text variant="headingLg" as="p">{formatNumber(moduleStats.mysteryBoxes.totalPointsSpent)}</Text>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Active Now</Text>
                                <Text variant="headingLg" as="p" tone={moduleStats.mysteryBoxes.activeBoxes > 0 ? "success" : "caution"}>
                                  {moduleStats.mysteryBoxes.activeBoxes}
                                </Text>
                              </BlockStack>
                            </Grid.Cell>
                          </Grid>
                          <InlineStack gap="200">
                            <Button url="/app/rewards/mystery-boxes" size="slim">
                              Manage Boxes
                            </Button>
                            {moduleStats.mysteryBoxes.activeBoxes === 0 && (
                              <Button url="/app/rewards/mystery-boxes" size="slim" variant="primary">
                                Create Box
                              </Button>
                            )}
                          </InlineStack>
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Card>
                </Grid.Cell>

                {/* Challenges Module */}
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                  <Card background={!features.challenges ? "bg-surface-secondary" : undefined}>
                    <BlockStack gap="400">
                      {/* Header */}
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="headingMd" as="h3" tone={!features.challenges ? "subdued" : undefined}>
                              Challenges
                            </Text>
                            {features.challenges ? (
                              moduleStats.challenges.activeChallenges > 0 ? (
                                <Badge tone="success">{moduleStats.challenges.activeChallenges} Live</Badge>
                              ) : (
                                <Badge tone="info">Coming Soon</Badge>
                              )
                            ) : (
                              <Badge>Disabled</Badge>
                            )}
                          </InlineStack>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Goal-based activities that reward customer achievements
                        </Text>
                      </BlockStack>

                      <Divider />

                      {/* Content based on state */}
                      {!features.challenges ? (
                        /* Disabled State */
                        <BlockStack gap="300">
                          <Text tone="subdued" as="p" variant="bodySm">
                            Enable challenges to motivate customers with spending goals, purchase milestones, and more.
                          </Text>
                          <Button url="/app/rewards/config" size="slim">
                            Enable Challenges
                          </Button>
                        </BlockStack>
                      ) : moduleStats.challenges.totalChallenges === 0 ? (
                        /* Empty/Coming Soon State */
                        <BlockStack gap="300">
                          <Text tone="subdued" as="p" variant="bodySm">
                            Challenge types include spending goals, purchase counts, collection challenges, and streaks.
                          </Text>
                          <InlineStack gap="200" wrap>
                            <Badge size="small">Spending Goals</Badge>
                            <Badge size="small">Purchase Counts</Badge>
                            <Badge size="small">Streaks</Badge>
                          </InlineStack>
                          <Button url="/app/rewards/missions" size="slim">
                            View Challenges
                          </Button>
                        </BlockStack>
                      ) : (
                        /* Stats State */
                        <BlockStack gap="300">
                          <Grid>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Total</Text>
                                <Text variant="headingLg" as="p">{moduleStats.challenges.totalChallenges}</Text>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Participants</Text>
                                <Text variant="headingLg" as="p">{formatNumber(moduleStats.challenges.totalParticipants)}</Text>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Completions</Text>
                                <Text variant="headingLg" as="p">{formatNumber(moduleStats.challenges.totalCompletions)}</Text>
                              </BlockStack>
                            </Grid.Cell>
                            <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 6, lg: 6, xl: 6 }}>
                              <BlockStack gap="100">
                                <Text variant="bodySm" as="h4" tone="subdued">Active Now</Text>
                                <Text variant="headingLg" as="p" tone={moduleStats.challenges.activeChallenges > 0 ? "success" : "caution"}>
                                  {moduleStats.challenges.activeChallenges}
                                </Text>
                              </BlockStack>
                            </Grid.Cell>
                          </Grid>
                          <InlineStack gap="200">
                            <Button url="/app/rewards/missions" size="slim">
                              Manage Challenges
                            </Button>
                            {moduleStats.challenges.activeChallenges === 0 && (
                              <Button url="/app/rewards/missions" size="slim" variant="primary">
                                Create Challenge
                              </Button>
                            )}
                          </InlineStack>
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Card>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Layout.Section>

          {/* Marketing Integration Bridge */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text variant="headingMd" as="h3">Marketing Integration</Text>
                      <Badge tone="info">Drive Engagement</Badge>
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Promote your {config.currencyNamePlural.toLowerCase()} program via email campaigns
                    </Text>
                  </BlockStack>
                  <Button variant="plain" url="/app/marketing">
                    Open Marketing Hub
                  </Button>
                </InlineStack>

                <Divider />

                <Grid>
                  {/* Promote Active Raffles */}
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            backgroundColor: features.raffles && moduleStats.raffles.activeRaffles > 0 ? '#e3f1df' : '#f1f1f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Icon source={GiftCardIcon} tone={features.raffles && moduleStats.raffles.activeRaffles > 0 ? 'success' : 'subdued'} />
                          </div>
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            Raffle Announcements
                          </Text>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">
                          {features.raffles && moduleStats.raffles.activeRaffles > 0
                            ? `You have ${moduleStats.raffles.activeRaffles} active raffle${moduleStats.raffles.activeRaffles > 1 ? 's' : ''} to promote`
                            : 'Create a raffle first to promote it via email'}
                        </Text>
                        {features.raffles && moduleStats.raffles.activeRaffles > 0 && (
                          <Button size="slim" url="/app/marketing/campaigns/create?preset=raffle">
                            Create Campaign
                          </Button>
                        )}
                      </BlockStack>
                    </Box>
                  </Grid.Cell>

                  {/* Mystery Box Teasers */}
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            backgroundColor: features.mysteryBoxes && moduleStats.mysteryBoxes.activeBoxes > 0 ? '#e3f1df' : '#f1f1f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Icon source={StarIcon} tone={features.mysteryBoxes && moduleStats.mysteryBoxes.activeBoxes > 0 ? 'success' : 'subdued'} />
                          </div>
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            Mystery Box Teasers
                          </Text>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">
                          {features.mysteryBoxes && moduleStats.mysteryBoxes.activeBoxes > 0
                            ? `${moduleStats.mysteryBoxes.activeBoxes} mystery box${moduleStats.mysteryBoxes.activeBoxes > 1 ? 'es' : ''} ready to promote`
                            : 'Set up mystery boxes to create excitement'}
                        </Text>
                        {features.mysteryBoxes && moduleStats.mysteryBoxes.activeBoxes > 0 && (
                          <Button size="slim" url="/app/marketing/campaigns/create?preset=mystery-box">
                            Create Campaign
                          </Button>
                        )}
                      </BlockStack>
                    </Box>
                  </Grid.Cell>

                  {/* Automated Engagement */}
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            backgroundColor: '#fef3cd',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Icon source={AutomationIcon} tone="warning" />
                          </div>
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            Automated Emails
                          </Text>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Set up automated emails for {config.currencyNamePlural.toLowerCase()} events like earning, expiry warnings
                        </Text>
                        <Button size="slim" url="/app/marketing/automation/workflows">
                          Set Up Automations
                        </Button>
                      </BlockStack>
                    </Box>
                  </Grid.Cell>
                </Grid>

                {/* Summary tip */}
                <Box padding="300" background="bg-surface-info" borderRadius="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={EmailIcon} tone="info" />
                    <Text variant="bodySm" as="p">
                      <Text as="span" fontWeight="semibold">Tip:</Text> Email campaigns announcing bonus {config.currencyNamePlural.toLowerCase()} events see 2-3x higher engagement
                    </Text>
                  </InlineStack>
                </Box>
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
                  <Button url="/app/rewards/config" variant="primary">
                    Configure Points
                  </Button>
                  <Button url="/app/rewards/analytics">
                    View Analytics
                  </Button>
                  <Button url="/app/members">
                    Manage Customers
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {toast.active && (
          <Toast content={toast.content} error={toast.error} onDismiss={hideToast} />
        )}
      </Page>
    </Frame>
  );
}
