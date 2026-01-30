import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
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
  Toast,
  Frame,
  Divider,
  Modal,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  ProgressBar,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getPointsConfig } from "../services/points-config.server";
import {
  getChallenge,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  transitionChallengeStatus,
  setChallengeReward,
  type ChallengeStatus,
  type ChallengeObjectiveType,
  type ChallengeRewardType,
} from "../services/challenge-management.server";
import {
  TEMPLATES_BY_CADENCE,
  calculateMissionDates,
  type MissionTemplate,
  type MissionCadence,
} from "../constants/mission-templates";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface ChallengeData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: string;
  objectiveType: string;
  targetValue: number;
  objectiveConfig: Record<string, unknown> | null;
  startsAt: string;
  endsAt: string;
  isPublic: boolean;
  participantCount: number;
  completionCount: number;
  claimCount: number;
  reward: {
    id: string;
    rewardType: string;
    rewardValue: Record<string, unknown>;
    description: string;
  } | null;
}

interface LoaderData {
  isNew: boolean;
  challenge: ChallengeData | null;
  pointsConfig: {
    currencyName: string;
    currencyIcon: string;
    currencyPlural: string;
  };
  templates?: {
    daily: MissionTemplate[];
    weekly: MissionTemplate[];
    monthly: MissionTemplate[];
    special: MissionTemplate[];
  };
}

interface ActionData {
  success: boolean;
  message?: string;
  error?: string;
  challengeId?: string;
}

// ============================================
// CONSTANTS
// ============================================

const OBJECTIVE_TYPES: { value: ChallengeObjectiveType; label: string }[] = [
  { value: "SPENDING", label: "Spend Amount" },
  { value: "ORDER_COUNT", label: "Place Orders" },
  { value: "REFERRAL", label: "Refer Friends" },
  { value: "PRODUCT_PURCHASE", label: "Purchase Products" },
  { value: "REVIEW", label: "Submit Reviews" },
  { value: "STREAK", label: "Purchase Streak" },
];

const REWARD_TYPES: { value: ChallengeRewardType; label: string }[] = [
  { value: "POINTS", label: "Points" },
  { value: "STORE_CREDIT", label: "Store Credit" },
  { value: "DISCOUNT", label: "Discount Code" },
  { value: "TIER_UPGRADE", label: "Tier Upgrade" },
  { value: "CUSTOM", label: "Custom Reward" },
];

const STATUS_CONFIG: Record<string, { label: string; tone: "info" | "success" | "warning" | "attention" | "critical" }> = {
  DRAFT: { label: "Draft", tone: "info" },
  SCHEDULED: { label: "Scheduled", tone: "attention" },
  ACTIVE: { label: "Active", tone: "success" },
  CLOSED: { label: "Closed", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "info" },
  CANCELLED: { label: "Cancelled", tone: "critical" },
};

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.rewards.missions.$id]";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const id = params.id!;
  const isNew = id === "new";

  console.log(`${LOG_PREFIX} Loader starting for: ${id} (isNew: ${isNew})`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const config = await getPointsConfig(shop);

    if (isNew) {
      return json<LoaderData>({
        isNew: true,
        challenge: null,
        pointsConfig: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
          currencyPlural: config.currencyNamePlural,
        },
        templates: {
          daily: TEMPLATES_BY_CADENCE.DAILY,
          weekly: TEMPLATES_BY_CADENCE.WEEKLY,
          monthly: TEMPLATES_BY_CADENCE.MONTHLY,
          special: TEMPLATES_BY_CADENCE.SPECIAL,
        },
      });
    }

    const challenge = await getChallenge(id, shop);

    if (!challenge) {
      throw new Response("Challenge not found", { status: 404 });
    }

    return json<LoaderData>({
      isNew: false,
      challenge: {
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        imageUrl: challenge.imageUrl,
        status: challenge.status,
        objectiveType: challenge.objectiveType,
        targetValue: challenge.targetValue,
        objectiveConfig: challenge.objectiveConfig,
        startsAt: challenge.startsAt.toISOString(),
        endsAt: challenge.endsAt.toISOString(),
        isPublic: challenge.isPublic,
        participantCount: challenge.totalParticipants,
        completionCount: challenge.completedCount,
        claimCount: challenge.claimedCount,
        reward: challenge.reward
          ? {
              id: challenge.reward.id,
              rewardType: challenge.reward.rewardType,
              rewardValue: challenge.reward.rewardValue as Record<string, unknown>,
              description: challenge.reward.description,
            }
          : null,
      },
      pointsConfig: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
        currencyPlural: config.currencyNamePlural,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} LOADER ERROR:`, error);
    throw error;
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request, params }: ActionFunctionArgs) => {
  console.log(`${LOG_PREFIX} Action starting...`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const id = params.id!;
    const isNew = id === "new";

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    console.log(`${LOG_PREFIX} Action intent: ${intent}`);

    switch (intent) {
      case "create": {
        const name = formData.get("name") as string;
        const description = formData.get("description") as string || undefined;
        const objectiveType = formData.get("objectiveType") as ChallengeObjectiveType;
        const targetValue = parseInt(formData.get("targetValue") as string, 10);
        const startsAt = new Date(formData.get("startsAt") as string);
        const endsAt = new Date(formData.get("endsAt") as string);
        const isPublic = formData.get("isPublic") === "true";

        if (!name || !objectiveType || !targetValue || !startsAt || !endsAt) {
          return json<ActionData>({
            success: false,
            error: "Please fill in all required fields",
          });
        }

        const challenge = await createChallenge({
          shop,
          name,
          description,
          objectiveType,
          targetValue,
          startsAt,
          endsAt,
          isPublic,
        });

        return redirect(`/app/rewards/missions/${challenge.id}`);
      }

      case "update": {
        const name = formData.get("name") as string;
        const description = formData.get("description") as string || undefined;
        const objectiveType = formData.get("objectiveType") as ChallengeObjectiveType;
        const targetValue = parseInt(formData.get("targetValue") as string, 10);
        const startsAt = new Date(formData.get("startsAt") as string);
        const endsAt = new Date(formData.get("endsAt") as string);
        const isPublic = formData.get("isPublic") === "true";

        await updateChallenge(id, shop, {
          name,
          description,
          objectiveType,
          targetValue,
          startsAt,
          endsAt,
          isPublic,
        });

        return json<ActionData>({
          success: true,
          message: "Mission updated successfully",
        });
      }

      case "setReward": {
        const rewardType = formData.get("rewardType") as ChallengeRewardType;
        const rewardDescription = formData.get("rewardDescription") as string;
        const rewardAmount = formData.get("rewardAmount") as string;

        const rewardValue: Record<string, unknown> = {};

        if (rewardType === "POINTS" || rewardType === "STORE_CREDIT") {
          rewardValue.amount = parseInt(rewardAmount, 10);
        } else if (rewardType === "DISCOUNT") {
          rewardValue.type = formData.get("discountType") as string || "percentage";
          rewardValue.value = parseInt(rewardAmount, 10);
        }

        await setChallengeReward(id, shop, {
          rewardType,
          rewardValue,
          description: rewardDescription,
        });

        return json<ActionData>({
          success: true,
          message: "Reward configured successfully",
        });
      }

      case "activate": {
        await transitionChallengeStatus(id, shop, "ACTIVE");
        return json<ActionData>({
          success: true,
          message: "Mission activated",
        });
      }

      case "schedule": {
        await transitionChallengeStatus(id, shop, "SCHEDULED");
        return json<ActionData>({
          success: true,
          message: "Mission scheduled",
        });
      }

      case "close": {
        await transitionChallengeStatus(id, shop, "CLOSED");
        return json<ActionData>({
          success: true,
          message: "Mission closed",
        });
      }

      case "cancel": {
        await transitionChallengeStatus(id, shop, "CANCELLED");
        return json<ActionData>({
          success: true,
          message: "Mission cancelled",
        });
      }

      case "delete": {
        await deleteChallenge(id, shop);
        return redirect("/app/rewards/missions");
      }

      default:
        return json<ActionData>({
          success: false,
          error: "Unknown action",
        });
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} ACTION ERROR:`, error);
    return json<ActionData>({
      success: false,
      error: error instanceof Error ? error.message : "An error occurred",
    });
  }
};

// ============================================
// COMPONENT
// ============================================

export default function ChallengeDetailPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  // Form state
  const [name, setName] = useState(data.challenge?.name || "");
  const [description, setDescription] = useState(data.challenge?.description || "");
  const [objectiveType, setObjectiveType] = useState<string>(data.challenge?.objectiveType || "SPENDING");
  const [targetValue, setTargetValue] = useState(data.challenge?.targetValue?.toString() || "100");
  const [startsAt, setStartsAt] = useState(
    data.challenge?.startsAt
      ? new Date(data.challenge.startsAt).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16)
  );
  const [endsAt, setEndsAt] = useState(
    data.challenge?.endsAt
      ? new Date(data.challenge.endsAt).toISOString().slice(0, 16)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  const [isPublic, setIsPublic] = useState(data.challenge?.isPublic ?? true);

  // Reward modal state
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardType, setRewardType] = useState<string>(data.challenge?.reward?.rewardType || "POINTS");
  const [rewardDescription, setRewardDescription] = useState(data.challenge?.reward?.description || "");
  const [rewardAmount, setRewardAmount] = useState(
    (data.challenge?.reward?.rewardValue as any)?.amount?.toString() || "100"
  );

  // Toast state
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  // Template selection state (for new missions)
  const [selectedCadence, setSelectedCadence] = useState<MissionCadence>("DAILY");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Apply template to form
  const applyTemplate = useCallback((template: MissionTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setObjectiveType(template.objectiveType);
    setTargetValue(template.targetValue.toString());
    setRewardType(template.rewardType);
    setRewardDescription(template.rewardDescription);
    setRewardAmount((template.rewardValue as any).amount?.toString() || "100");
    setSelectedTemplateId(template.id);

    // Calculate appropriate dates based on cadence
    const { startsAt: newStartsAt, endsAt: newEndsAt } = calculateMissionDates(
      template.cadence,
      template.durationDays
    );
    setStartsAt(newStartsAt.toISOString().slice(0, 16));
    setEndsAt(newEndsAt.toISOString().slice(0, 16));

    setToastMessage(`Applied "${template.name}" template`);
    setToastError(false);
    setToastActive(true);
  }, []);

  // Get templates for current cadence
  const currentTemplates = data.templates?.[selectedCadence.toLowerCase() as keyof typeof data.templates] || [];

  // Show toast on action result
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

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", data.isNew ? "create" : "update");
    formData.set("name", name);
    formData.set("description", description);
    formData.set("objectiveType", objectiveType);
    formData.set("targetValue", targetValue);
    formData.set("startsAt", startsAt);
    formData.set("endsAt", endsAt);
    formData.set("isPublic", isPublic.toString());
    submit(formData, { method: "post" });
  }, [data.isNew, name, description, objectiveType, targetValue, startsAt, endsAt, isPublic, submit]);

  const handleSaveReward = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "setReward");
    formData.set("rewardType", rewardType);
    formData.set("rewardDescription", rewardDescription);
    formData.set("rewardAmount", rewardAmount);
    submit(formData, { method: "post" });
    setShowRewardModal(false);
  }, [rewardType, rewardDescription, rewardAmount, submit]);

  const handleStatusAction = useCallback((intent: string) => {
    const formData = new FormData();
    formData.set("intent", intent);
    submit(formData, { method: "post" });
  }, [submit]);

  const challenge = data.challenge;
  const status = challenge?.status || "DRAFT";
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  const isDraft = status === "DRAFT";

  // Get objective type label
  const getObjectiveLabel = (type: string) => {
    const obj = OBJECTIVE_TYPES.find((o) => o.value === type);
    return obj?.label || type;
  };

  return (
    <Frame>
      <Page
        title={data.isNew ? "Create Mission" : challenge?.name || "Mission"}
        subtitle={data.isNew ? "Set up a new mission for your customers" : `${getObjectiveLabel(objectiveType)} mission`}
        backAction={{ content: "Missions", url: "/app/rewards/missions" }}
        primaryAction={
          data.isNew
            ? {
                content: "Create Mission",
                onAction: handleSubmit,
                loading: isSubmitting,
                disabled: !name || !targetValue,
              }
            : isDraft
            ? {
                content: "Save Changes",
                onAction: handleSubmit,
                loading: isSubmitting,
              }
            : undefined
        }
        secondaryActions={
          !data.isNew && isDraft
            ? [
                {
                  content: "Schedule",
                  onAction: () => handleStatusAction("schedule"),
                  disabled: !challenge?.reward,
                },
                {
                  content: "Delete",
                  onAction: () => handleStatusAction("delete"),
                  destructive: true,
                },
              ]
            : !data.isNew && status === "SCHEDULED"
            ? [
                {
                  content: "Activate Now",
                  onAction: () => handleStatusAction("activate"),
                },
                {
                  content: "Cancel",
                  onAction: () => handleStatusAction("cancel"),
                  destructive: true,
                },
              ]
            : !data.isNew && status === "ACTIVE"
            ? [
                {
                  content: "Close",
                  onAction: () => handleStatusAction("close"),
                },
              ]
            : undefined
        }
      >
        <Layout>
          {/* Status Banner */}
          {!data.isNew && (
            <Layout.Section>
              <InlineStack gap="200" align="start">
                <Badge tone={statusConfig.tone}>{statusConfig.label}</Badge>
                {!challenge?.reward && (
                  <Badge tone="warning">No reward configured</Badge>
                )}
              </InlineStack>
            </Layout.Section>
          )}

          {/* Stats (for existing challenges) */}
          {!data.isNew && challenge && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Mission Progress
                  </Text>
                  <InlineStack gap="800" wrap>
                    <BlockStack gap="100">
                      <Text as="span" tone="subdued">
                        Participants
                      </Text>
                      <Text as="span" variant="headingLg">
                        {challenge.participantCount}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="span" tone="subdued">
                        Completed
                      </Text>
                      <Text as="span" variant="headingLg">
                        {challenge.completionCount}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="span" tone="subdued">
                        Claimed
                      </Text>
                      <Text as="span" variant="headingLg">
                        {challenge.claimCount}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="span" tone="subdued">
                        Completion Rate
                      </Text>
                      <Text as="span" variant="headingLg">
                        {challenge.participantCount > 0
                          ? Math.round((challenge.completionCount / challenge.participantCount) * 100)
                          : 0}%
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Template Selector (for new missions) */}
          {data.isNew && data.templates && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      Start from a Template
                    </Text>
                    <Text as="p" tone="subdued">
                      Choose a pre-configured mission template or create a custom mission below.
                    </Text>
                  </BlockStack>

                  {/* Cadence Tabs */}
                  <InlineStack gap="200" wrap>
                    {(["DAILY", "WEEKLY", "MONTHLY", "SPECIAL"] as MissionCadence[]).map((cadence) => (
                      <Button
                        key={cadence}
                        pressed={selectedCadence === cadence}
                        onClick={() => setSelectedCadence(cadence)}
                        size="slim"
                      >
                        {cadence.charAt(0) + cadence.slice(1).toLowerCase()}
                      </Button>
                    ))}
                  </InlineStack>

                  <Divider />

                  {/* Template List */}
                  <BlockStack gap="300">
                    {currentTemplates.map((template) => (
                      <Box
                        key={template.id}
                        padding="300"
                        borderWidth="025"
                        borderColor={selectedTemplateId === template.id ? "border-success" : "border"}
                        borderRadius="200"
                        background={selectedTemplateId === template.id ? "bg-surface-success" : "bg-surface"}
                      >
                        <InlineStack gap="400" align="space-between" blockAlign="center">
                          <InlineStack gap="300" blockAlign="center">
                            <Text as="span" variant="headingMd">
                              {template.iconEmoji}
                            </Text>
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" variant="bodyMd" fontWeight="semibold">
                                  {template.name}
                                </Text>
                                <Badge
                                  tone={
                                    template.rarity === "LEGENDARY" ? "critical" :
                                    template.rarity === "EPIC" ? "warning" :
                                    template.rarity === "RARE" ? "attention" :
                                    template.rarity === "UNCOMMON" ? "success" :
                                    "info"
                                  }
                                  size="small"
                                >
                                  {template.rarity}
                                </Badge>
                              </InlineStack>
                              <Text as="span" tone="subdued" variant="bodySm">
                                {template.description}
                              </Text>
                              <InlineStack gap="200">
                                <Badge size="small">
                                  {OBJECTIVE_TYPES.find(o => o.value === template.objectiveType)?.label || template.objectiveType}
                                </Badge>
                                <Badge size="small" tone="success">
                                  {template.rewardDescription}
                                </Badge>
                                <Badge size="small" tone="info">
                                  +{template.xpReward} XP
                                </Badge>
                              </InlineStack>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            onClick={() => applyTemplate(template)}
                            variant={selectedTemplateId === template.id ? "primary" : "secondary"}
                            size="slim"
                          >
                            {selectedTemplateId === template.id ? "Applied" : "Use Template"}
                          </Button>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Challenge Details Form */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Mission Details
                </Text>
                <FormLayout>
                  <TextField
                    label="Name"
                    value={name}
                    onChange={setName}
                    placeholder="e.g., Spend $100 Mission"
                    autoComplete="off"
                    disabled={!isDraft && !data.isNew}
                  />
                  <TextField
                    label="Description"
                    value={description}
                    onChange={setDescription}
                    placeholder="Describe the mission..."
                    multiline={3}
                    autoComplete="off"
                  />
                  <Select
                    label="Objective Type"
                    options={OBJECTIVE_TYPES.map((o) => ({
                      label: o.label,
                      value: o.value,
                    }))}
                    value={objectiveType}
                    onChange={setObjectiveType}
                    disabled={!isDraft && !data.isNew}
                  />
                  <TextField
                    label="Target Value"
                    type="number"
                    value={targetValue}
                    onChange={setTargetValue}
                    helpText={
                      objectiveType === "SPENDING"
                        ? "Amount in dollars"
                        : objectiveType === "ORDER_COUNT"
                        ? "Number of orders"
                        : objectiveType === "REFERRAL"
                        ? "Number of referrals"
                        : "Target quantity"
                    }
                    autoComplete="off"
                    disabled={!isDraft && !data.isNew}
                  />
                  <InlineStack gap="400">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Start Date"
                        type="datetime-local"
                        value={startsAt}
                        onChange={setStartsAt}
                        autoComplete="off"
                        disabled={!isDraft && !data.isNew}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="End Date"
                        type="datetime-local"
                        value={endsAt}
                        onChange={setEndsAt}
                        autoComplete="off"
                        disabled={!isDraft && !data.isNew}
                      />
                    </div>
                  </InlineStack>
                  <Checkbox
                    label="Make this mission public"
                    checked={isPublic}
                    onChange={setIsPublic}
                    helpText="Public missions are visible to all customers"
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Reward Configuration */}
          {!data.isNew && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Reward
                    </Text>
                    {isDraft && (
                      <Button onClick={() => setShowRewardModal(true)}>
                        {challenge?.reward ? "Edit Reward" : "Add Reward"}
                      </Button>
                    )}
                  </InlineStack>
                  {challenge?.reward ? (
                    <BlockStack gap="200">
                      <InlineStack gap="200">
                        <Badge>{challenge.reward.rewardType}</Badge>
                        <Text as="span">{challenge.reward.description}</Text>
                      </InlineStack>
                      {(challenge.reward.rewardValue as any)?.amount && (
                        <Text as="p" tone="subdued">
                          Amount: {(challenge.reward.rewardValue as any).amount}{" "}
                          {challenge.reward.rewardType === "POINTS"
                            ? data.pointsConfig.currencyPlural
                            : challenge.reward.rewardType === "STORE_CREDIT"
                            ? "cents"
                            : ""}
                        </Text>
                      )}
                    </BlockStack>
                  ) : (
                    <Banner tone="warning">
                      <p>
                        Add a reward to make this mission active. Customers need
                        an incentive to participate!
                      </p>
                    </Banner>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>
      </Page>

      {/* Reward Modal */}
      <Modal
        open={showRewardModal}
        onClose={() => setShowRewardModal(false)}
        title="Configure Reward"
        primaryAction={{
          content: "Save Reward",
          onAction: handleSaveReward,
          loading: isSubmitting,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setShowRewardModal(false) },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <Select
              label="Reward Type"
              options={REWARD_TYPES.map((r) => ({
                label: r.label,
                value: r.value,
              }))}
              value={rewardType}
              onChange={setRewardType}
            />
            <TextField
              label="Description"
              value={rewardDescription}
              onChange={setRewardDescription}
              placeholder="e.g., Earn 500 bonus points!"
              autoComplete="off"
            />
            {(rewardType === "POINTS" || rewardType === "STORE_CREDIT" || rewardType === "DISCOUNT") && (
              <TextField
                label={
                  rewardType === "POINTS"
                    ? `Amount (${data.pointsConfig.currencyPlural})`
                    : rewardType === "STORE_CREDIT"
                    ? "Amount (cents)"
                    : "Discount Value"
                }
                type="number"
                value={rewardAmount}
                onChange={setRewardAmount}
                autoComplete="off"
              />
            )}
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Toast */}
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
