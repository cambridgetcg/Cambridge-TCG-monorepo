import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useNavigate } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
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
  Toast,
  Frame,
  Divider,
  Tabs,
  ProgressBar,
  Box,
  Icon,
  Modal,
  FormLayout,
  TextField,
  Select,
} from "@shopify/polaris";
import { ClockIcon, StarFilledIcon, PersonIcon, CheckCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { ModuleStatsCard } from "~/components/DesignSystem/ModuleStatsCard";
import { getPointsConfig, getEnabledFeatures, updatePointsConfig } from "../services/points-config.server";
import prisma from "../db.server";
import { getMissionAnalytics } from "../services/mission-stats.server";
import { createChallenge } from "../services/challenge-management.server";
import {
  TEMPLATES_BY_CADENCE,
  calculateMissionDates,
  type MissionTemplate,
  type MissionCadence,
} from "../constants/mission-templates";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface MissionData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  cadence: string;
  rarity: string;
  category: string;
  objectiveType: string;
  targetValue: number;
  xpReward: number;
  iconEmoji: string | null;
  totalParticipants: number;
  completedCount: number;
  claimedCount: number;
  startsAt: string;
  endsAt: string;
  reward: {
    type: string;
    description: string;
  } | null;
}

interface LoaderData {
  missionsEnabled: boolean;
  pointsConfig: {
    currencyName: string;
    currencyIcon: string;
    currencyPlural: string;
  };
  missions: {
    daily: MissionData[];
    weekly: MissionData[];
    monthly: MissionData[];
    special: MissionData[];
  };
  stats: {
    totalMissions: number;
    activeMissions: number;
    totalParticipants: number;
    totalCompletions: number;
    totalXpAwarded: number;
    completionRate: number;
  };
  analytics: {
    totalCustomersWithXp: number;
    averageLevel: number;
    maxLevel: number;
    activeStreaks: number;
    averageStreak: number;
    longestStreak: number;
  } | null;
}

interface ActionData {
  success: boolean;
  message?: string;
  error?: string;
  missionId?: string;
}

// ============================================
// RARITY CONFIG
// ============================================

const RARITY_CONFIG: Record<string, { tone: "info" | "success" | "warning" | "attention" | "critical"; label: string }> = {
  COMMON: { tone: "info", label: "Common" },
  UNCOMMON: { tone: "success", label: "Uncommon" },
  RARE: { tone: "attention", label: "Rare" },
  EPIC: { tone: "warning", label: "Epic" },
  LEGENDARY: { tone: "critical", label: "Legendary" },
};

const CADENCE_CONFIG: Record<string, { label: string; icon: string }> = {
  DAILY: { label: "Daily", icon: "D" },
  WEEKLY: { label: "Weekly", icon: "W" },
  MONTHLY: { label: "Monthly", icon: "M" },
  SPECIAL: { label: "Special", icon: "S" },
};

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.rewards.missions]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting...`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log(`${LOG_PREFIX} Authenticated for shop: ${shop}`);

    // Fetch config and features
    const [config, features] = await Promise.all([
      getPointsConfig(shop),
      getEnabledFeatures(shop),
    ]);

    // Check if missions/challenges are enabled
    const missionsEnabled = features.challenges;

    if (!missionsEnabled) {
      return json<LoaderData>({
        missionsEnabled: false,
        pointsConfig: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
          currencyPlural: config.currencyNamePlural,
        },
        missions: { daily: [], weekly: [], monthly: [], special: [] },
        stats: {
          totalMissions: 0,
          activeMissions: 0,
          totalParticipants: 0,
          totalCompletions: 0,
          totalXpAwarded: 0,
          completionRate: 0,
        },
        analytics: null,
      });
    }

    // Fetch challenges with rewards (using separate queries for Data API compatibility)
    const now = new Date();
    const challenges = await prisma.challenge.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Fetch rewards for all challenges
    const challengeIds = challenges.map((c: { id: string }) => c.id);
    const rewards = challengeIds.length > 0
      ? await prisma.challengeReward.findMany({
          where: { challengeId: { in: challengeIds } },
        })
      : [];

    const rewardMap = new Map(
      rewards.map((r: { challengeId: string; rewardType: string; description: string }) => [r.challengeId, r])
    );

    // Transform and group by cadence
    const missions: LoaderData["missions"] = {
      daily: [],
      weekly: [],
      monthly: [],
      special: [],
    };

    let totalParticipants = 0;
    let totalCompletions = 0;
    let activeMissions = 0;

    for (const challenge of challenges) {
      const c = challenge as {
        id: string;
        name: string;
        description: string | null;
        status: string;
        cadence: string;
        rarity: string;
        category: string;
        objectiveType: string;
        targetValue: number;
        xpReward: number;
        iconEmoji: string | null;
        totalParticipants: number;
        completedCount: number;
        claimedCount: number;
        startsAt: Date;
        endsAt: Date;
      };

      const reward = rewardMap.get(c.id) as { rewardType: string; description: string } | undefined;

      const missionData: MissionData = {
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
        cadence: c.cadence || "SPECIAL",
        rarity: c.rarity || "COMMON",
        category: c.category || "CHALLENGE",
        objectiveType: c.objectiveType,
        targetValue: c.targetValue,
        xpReward: c.xpReward || 10,
        iconEmoji: c.iconEmoji,
        totalParticipants: c.totalParticipants,
        completedCount: c.completedCount,
        claimedCount: c.claimedCount,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        reward: reward ? {
          type: reward.rewardType,
          description: reward.description,
        } : null,
      };

      // Add to appropriate cadence group
      const cadenceKey = (c.cadence || "SPECIAL").toLowerCase() as keyof typeof missions;
      if (cadenceKey in missions) {
        missions[cadenceKey].push(missionData);
      } else {
        missions.special.push(missionData);
      }

      // Aggregate stats
      totalParticipants += c.totalParticipants;
      totalCompletions += c.completedCount;
      if (c.status === "ACTIVE" && c.startsAt <= now && c.endsAt >= now) {
        activeMissions++;
      }
    }

    // Calculate completion rate
    const completionRate = totalParticipants > 0
      ? Math.round((totalCompletions / totalParticipants) * 100)
      : 0;

    // Fetch mission analytics
    let analytics = null;
    try {
      const missionAnalytics = await getMissionAnalytics(shop);
      analytics = {
        totalCustomersWithXp: missionAnalytics.totalCustomersWithXp,
        averageLevel: missionAnalytics.averageLevel,
        maxLevel: missionAnalytics.maxLevel,
        activeStreaks: missionAnalytics.activeStreaks,
        averageStreak: missionAnalytics.averageStreak,
        longestStreak: missionAnalytics.longestStreak,
      };
    } catch (e) {
      console.warn(`${LOG_PREFIX} Failed to fetch mission analytics:`, e);
    }

    return json<LoaderData>({
      missionsEnabled: true,
      pointsConfig: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
        currencyPlural: config.currencyNamePlural,
      },
      missions,
      stats: {
        totalMissions: challenges.length,
        activeMissions,
        totalParticipants,
        totalCompletions,
        totalXpAwarded: analytics?.totalCustomersWithXp ? (analytics.totalCustomersWithXp * analytics.averageLevel * 100) : 0,
        completionRate,
      },
      analytics,
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

  console.log(`${LOG_PREFIX} Action: ${intent}`);

  try {
    if (intent === "enableFeature") {
      await updatePointsConfig(shop, { challengesEnabled: true });
      return json<ActionData>({ success: true, message: "Missions enabled" });
    }

    if (intent === "disableFeature") {
      await updatePointsConfig(shop, { challengesEnabled: false });
      return json<ActionData>({ success: true, message: "Missions disabled" });
    }

    if (intent === "deleteMission") {
      const missionId = formData.get("missionId") as string;
      if (!missionId) {
        return json<ActionData>({ success: false, error: "Mission ID required" });
      }

      // Soft delete by marking as archived
      await prisma.challenge.update({
        where: { id: missionId },
        data: { status: "ARCHIVED" },
      });

      return json<ActionData>({ success: true, message: "Mission archived" });
    }

    if (intent === "createMission") {
      const name = formData.get("name") as string;
      const description = formData.get("description") as string || undefined;
      const objectiveType = formData.get("objectiveType") as string;
      const targetValue = parseInt(formData.get("targetValue") as string, 10);
      const cadence = (formData.get("cadence") as string) || "SPECIAL";
      const rarity = (formData.get("rarity") as string) || "COMMON";
      const xpReward = parseInt(formData.get("xpReward") as string, 10) || 10;

      if (!name || !objectiveType || !targetValue) {
        return json<ActionData>({ success: false, error: "Please fill in all required fields" });
      }

      // Calculate dates based on cadence
      const { startsAt, endsAt } = calculateMissionDates(cadence as MissionCadence, 7);

      const challenge = await createChallenge({
        shop,
        name,
        description,
        objectiveType: objectiveType as any,
        targetValue,
        startsAt,
        endsAt,
        isPublic: true,
        cadence: cadence as any,
        rarity: rarity as any,
        category: "CHALLENGE",
        xpReward,
      });

      return json<ActionData>({ success: true, message: "Mission created", missionId: challenge.id });
    }

    return json<ActionData>({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error(`${LOG_PREFIX} ACTION ERROR:`, error);
    return json<ActionData>({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// ============================================
// MISSION CARD COMPONENT
// ============================================

function MissionCard({ mission }: { mission: MissionData }) {
  const rarityConfig = RARITY_CONFIG[mission.rarity] || RARITY_CONFIG.COMMON;
  const cadenceConfig = CADENCE_CONFIG[mission.cadence] || CADENCE_CONFIG.SPECIAL;
  const completionRate = mission.totalParticipants > 0
    ? Math.round((mission.completedCount / mission.totalParticipants) * 100)
    : 0;

  const isActive = mission.status === "ACTIVE";
  const endsAt = new Date(mission.endsAt);
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <Card>
      <BlockStack gap="300">
        {/* Header */}
        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="headingLg">
              {mission.iconEmoji || "🎯"}
            </Text>
            <BlockStack gap="100">
              <Text as="h3" variant="headingMd">{mission.name}</Text>
              <InlineStack gap="100">
                <Badge tone={rarityConfig.tone}>{rarityConfig.label}</Badge>
                <Badge>{cadenceConfig.label}</Badge>
                <Badge tone={isActive ? "success" : "info"}>{mission.status}</Badge>
              </InlineStack>
            </BlockStack>
          </InlineStack>
          <BlockStack gap="100" inlineAlign="end">
            <Text as="p" variant="bodyMd" tone="subdued">+{mission.xpReward} XP</Text>
            {isActive && daysRemaining <= 3 && (
              <Badge tone="warning">{`${daysRemaining}d left`}</Badge>
            )}
          </BlockStack>
        </InlineStack>

        {/* Description */}
        {mission.description && (
          <Text as="p" tone="subdued">{mission.description}</Text>
        )}

        {/* Progress */}
        <BlockStack gap="100">
          <InlineStack align="space-between">
            <Text as="p" variant="bodySm" tone="subdued">
              {mission.completedCount} / {mission.totalParticipants} completed
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">{completionRate}%</Text>
          </InlineStack>
          <ProgressBar progress={completionRate} size="small" tone="primary" />
        </BlockStack>

        {/* Stats */}
        <Divider />
        <InlineStack gap="400" align="start">
          <InlineStack gap="100" blockAlign="center">
            <Icon source={PersonIcon} tone="subdued" />
            <Text as="span" variant="bodySm" tone="subdued">
              {mission.totalParticipants} participants
            </Text>
          </InlineStack>
          <InlineStack gap="100" blockAlign="center">
            <Icon source={CheckCircleIcon} tone="subdued" />
            <Text as="span" variant="bodySm" tone="subdued">
              {mission.claimedCount} claimed
            </Text>
          </InlineStack>
          {mission.reward && (
            <InlineStack gap="100" blockAlign="center">
              <Icon source={StarFilledIcon} tone="subdued" />
              <Text as="span" variant="bodySm" tone="subdued">
                {mission.reward.description}
              </Text>
            </InlineStack>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ============================================
// COMPONENT
// ============================================

export default function MissionsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  // Debug logging for navigation
  useEffect(() => {
    console.log("[MissionsPage] Component mounted, navigation state:", navigation.state);
  }, [navigation.state]);

  const [selectedTab, setSelectedTab] = useState(0);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [missionName, setMissionName] = useState("");
  const [missionDescription, setMissionDescription] = useState("");
  const [missionObjective, setMissionObjective] = useState("SPENDING");
  const [missionTarget, setMissionTarget] = useState("100");
  const [missionCadence, setMissionCadence] = useState<MissionCadence>("DAILY");
  const [missionRarity, setMissionRarity] = useState("COMMON");
  const [missionXpReward, setMissionXpReward] = useState("10");

  // Tab configuration
  const tabs = [
    { id: "all", content: "All Missions", panelID: "all-missions" },
    { id: "daily", content: `Daily (${data.missions.daily.length})`, panelID: "daily-missions" },
    { id: "weekly", content: `Weekly (${data.missions.weekly.length})`, panelID: "weekly-missions" },
    { id: "monthly", content: `Monthly (${data.missions.monthly.length})`, panelID: "monthly-missions" },
    { id: "special", content: `Special (${data.missions.special.length})`, panelID: "special-missions" },
  ];

  // Get missions for current tab
  const getCurrentMissions = useCallback((): MissionData[] => {
    switch (tabs[selectedTab].id) {
      case "daily":
        return data.missions.daily;
      case "weekly":
        return data.missions.weekly;
      case "monthly":
        return data.missions.monthly;
      case "special":
        return data.missions.special;
      default:
        return [
          ...data.missions.daily,
          ...data.missions.weekly,
          ...data.missions.monthly,
          ...data.missions.special,
        ];
    }
  }, [selectedTab, data.missions, tabs]);

  // Show toast on action completion
  useEffect(() => {
    if (actionData) {
      if (actionData.success && actionData.message) {
        setToastMessage(actionData.message);
        setToastError(false);
        setToastActive(true);
      } else if (actionData.error) {
        setToastMessage(actionData.error);
        setToastError(true);
        setToastActive(true);
      }
    }
  }, [actionData]);

  const handleEnableFeature = () => {
    const formData = new FormData();
    formData.append("intent", "enableFeature");
    submit(formData, { method: "post" });
  };

  const handleDisableFeature = () => {
    const formData = new FormData();
    formData.append("intent", "disableFeature");
    submit(formData, { method: "post" });
  };

  // Create mission handler
  const handleCreateMission = useCallback(() => {
    if (!missionName.trim()) {
      setToastMessage("Mission name is required");
      setToastError(true);
      setToastActive(true);
      return;
    }

    const formData = new FormData();
    formData.append("intent", "createMission");
    formData.append("name", missionName);
    formData.append("description", missionDescription);
    formData.append("objectiveType", missionObjective);
    formData.append("targetValue", missionTarget);
    formData.append("cadence", missionCadence);
    formData.append("rarity", missionRarity);
    formData.append("xpReward", missionXpReward);
    submit(formData, { method: "post" });
    setShowCreateModal(false);
    resetCreateForm();
  }, [missionName, missionDescription, missionObjective, missionTarget, missionCadence, missionRarity, missionXpReward, submit]);

  // Reset create form
  const resetCreateForm = useCallback(() => {
    setMissionName("");
    setMissionDescription("");
    setMissionObjective("SPENDING");
    setMissionTarget("100");
    setMissionCadence("DAILY");
    setMissionRarity("COMMON");
    setMissionXpReward("10");
  }, []);

  // Close modal and reset
  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false);
    resetCreateForm();
  }, [resetCreateForm]);

  // Feature not enabled state
  if (!data.missionsEnabled) {
    return (
      <Frame>
        <Page
          title="Missions"
          subtitle="Gamified missions with XP, streaks, and combos"
          backAction={{ content: "Rewards", url: "/app/rewards" }}
        >
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Enable Missions"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Enable Missions",
                    onAction: handleEnableFeature,
                    loading: isSubmitting,
                  }}
                >
                  <p>
                    Create gamified missions where customers earn XP, build streaks,
                    and unlock rewards by completing daily, weekly, and monthly missions.
                  </p>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
        {toastActive && (
          <Toast
            content={toastMessage}
            error={toastError}
            onDismiss={() => setToastActive(false)}
          />
        )}
      </Frame>
    );
  }

  const currentMissions = getCurrentMissions();

  // Main missions page
  return (
    <Frame>
      <Page
        title="Missions"
        subtitle="Gamified missions with XP, streaks, and combos"
        backAction={{ content: "Rewards", url: "/app/rewards" }}
        primaryAction={{
          content: "Create Mission",
          onAction: () => setShowCreateModal(true),
        }}
        secondaryActions={[
          {
            content: "Disable Missions",
            onAction: handleDisableFeature,
            destructive: true,
          },
        ]}
      >
        <Layout>
          {/* Stats Cards */}
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Active Missions"
                  value={data.stats.activeMissions}
                />
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Completions"
                  value={data.stats.totalCompletions}
                />
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Completion Rate"
                  value={`${data.stats.completionRate}%`}
                />
              </div>
              {data.analytics && (
                <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                  <ModuleStatsCard
                    label="Active Streaks"
                    value={data.analytics.activeStreaks}
                  />
                </div>
              )}
            </InlineStack>
          </Layout.Section>

          {/* Analytics Banner */}
          {data.analytics && data.analytics.totalCustomersWithXp > 0 && (
            <Layout.Section>
              <Banner title="Mission System Analytics" tone="info">
                <InlineStack gap="400" wrap>
                  <Text as="span">
                    {data.analytics.totalCustomersWithXp} customers earning XP
                  </Text>
                  <Text as="span">
                    Avg Level: {data.analytics.averageLevel}
                  </Text>
                  <Text as="span">
                    Max Level: {data.analytics.maxLevel}
                  </Text>
                  <Text as="span">
                    Avg Streak: {data.analytics.averageStreak} days
                  </Text>
                  <Text as="span">
                    Longest Streak: {data.analytics.longestStreak} days
                  </Text>
                </InlineStack>
              </Banner>
            </Layout.Section>
          )}

          <Layout.Section>
            <Divider />
          </Layout.Section>

          {/* Tabs */}
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <Box padding="400">
                  {currentMissions.length === 0 ? (
                    <EmptyState
                      heading="No Missions Yet"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      action={{
                        content: "Create Mission",
                        onAction: () => setShowCreateModal(true),
                      }}
                    >
                      <p>
                        Create your first {tabs[selectedTab].id !== "all" ? tabs[selectedTab].id : ""} mission
                        to engage your customers with gamified missions.
                      </p>
                    </EmptyState>
                  ) : (
                    <BlockStack gap="400">
                      {currentMissions.map((mission) => (
                        <MissionCard key={mission.id} mission={mission} />
                      ))}
                    </BlockStack>
                  )}
                </Box>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {/* Create Mission Modal */}
      <Modal
        open={showCreateModal}
        onClose={handleCloseCreateModal}
        title="Create Mission"
        primaryAction={{
          content: "Create Mission",
          onAction: handleCreateMission,
          loading: isSubmitting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCloseCreateModal,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Mission Name"
              value={missionName}
              onChange={setMissionName}
              autoComplete="off"
              placeholder="e.g., Weekend Warrior"
            />
            <TextField
              label="Description"
              value={missionDescription}
              onChange={setMissionDescription}
              autoComplete="off"
              multiline={2}
              placeholder="Describe what customers need to do..."
            />
            <Select
              label="Objective Type"
              options={[
                { label: "Spending Amount", value: "SPENDING" },
                { label: "Order Count", value: "ORDER_COUNT" },
                { label: "Product Purchase", value: "PRODUCT_PURCHASE" },
                { label: "Referral", value: "REFERRAL" },
                { label: "Review", value: "REVIEW" },
                { label: "Social Share", value: "SOCIAL_SHARE" },
              ]}
              value={missionObjective}
              onChange={setMissionObjective}
            />
            <TextField
              label="Target Value"
              type="number"
              value={missionTarget}
              onChange={setMissionTarget}
              autoComplete="off"
              helpText="The amount or count customers need to reach"
            />
            <Select
              label="Cadence"
              options={[
                { label: "Daily", value: "DAILY" },
                { label: "Weekly", value: "WEEKLY" },
                { label: "Monthly", value: "MONTHLY" },
                { label: "Special (One-time)", value: "SPECIAL" },
              ]}
              value={missionCadence}
              onChange={(value) => setMissionCadence(value as MissionCadence)}
            />
            <Select
              label="Rarity"
              options={[
                { label: "Common", value: "COMMON" },
                { label: "Uncommon", value: "UNCOMMON" },
                { label: "Rare", value: "RARE" },
                { label: "Epic", value: "EPIC" },
                { label: "Legendary", value: "LEGENDARY" },
              ]}
              value={missionRarity}
              onChange={setMissionRarity}
            />
            <TextField
              label="XP Reward"
              type="number"
              value={missionXpReward}
              onChange={setMissionXpReward}
              autoComplete="off"
              helpText="Experience points awarded on completion"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {toastActive && (
        <Toast
          content={toastMessage}
          error={toastError}
          onDismiss={() => setToastActive(false)}
        />
      )}
    </Frame>
  );
}
